import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, ProtocolRequestError, resourceKeys, type PackageMetadataLite, type Project, type ProjectInstalledChunk, type ProjectTransitiveChunk, type RequestChunk, type RequestResult } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';
import { useSession } from './session';

export interface AllProjectsState {
    /** Whether the committed selection is All Projects; nothing is asked otherwise. */
    active: boolean;
    status: 'idle' | 'loading' | 'ready' | 'error';
    /** The projects of the latest listing, from its `start` chunk. */
    projects: readonly Project[] | undefined;
    /** The latest chunk of each project, by its path as the host sent it: a result or the project's error. */
    chunks: ReadonlyMap<string, ProjectInstalledChunk>;
    /** What the host sent after the lists about their packages, by project path, then lower-cased package id. */
    metadata: ReadonlyMap<string, ReadonlyMap<string, PackageMetadataLite>>;
    /** Projects the latest response reports as failed. */
    errored: ReadonlyArray<{ projectPath: string; error: string }>;
    /** The latest request failed as a whole. */
    error: ProtocolRequestError | undefined;
    /** A request is on its way while earlier lists are shown. */
    revalidating: boolean;
    refresh: () => void;
    /** The transitive packages of every project, streamed once `enableTransitive()` was called in this All Projects. */
    transitive: AllProjectsTransitive;
    /** The aggregated transitive section was opened: its stream is asked for, and asked again when it may have changed. */
    enableTransitive: () => void;
}

export interface AllProjectsTransitive {
    enabled: boolean;
    status: 'idle' | 'loading' | 'ready' | 'error';
    /** The latest chunk of each project, by path. */
    chunks: ReadonlyMap<string, ProjectTransitiveChunk>;
    errored: RequestResult<'allProjects/transitive'>['errored'];
    error: ProtocolRequestError | undefined;
    refresh: () => void;
}

interface TransitiveStored {
    status: AllProjectsTransitive['status'];
    chunks: ReadonlyMap<string, ProjectTransitiveChunk>;
    errored: AllProjectsTransitive['errored'];
    error: ProtocolRequestError | undefined;
}

const NO_TRANSITIVE: TransitiveStored = { status: 'idle', chunks: new Map(), errored: [], error: undefined };

interface Stored {
    /** The number of the latest request; chunks and answers of any other are recorded by nobody and not applied. */
    seq: number;
    status: AllProjectsState['status'];
    projects: readonly Project[] | undefined;
    chunks: ReadonlyMap<string, ProjectInstalledChunk>;
    metadata: ReadonlyMap<string, ReadonlyMap<string, PackageMetadataLite>>;
    errored: AllProjectsState['errored'];
    error: ProtocolRequestError | undefined;
    requesting: boolean;
}

type Action =
    | { type: 'reset' }
    | { type: 'requested'; seq: number }
    | { type: 'chunk'; seq: number; chunk: RequestChunk<'allProjects/installed'> }
    | { type: 'answered'; seq: number; result: RequestResult<'allProjects/installed'> }
    | { type: 'failed'; seq: number; error: ProtocolRequestError };

const EMPTY: Stored = { seq: 0, status: 'idle', projects: undefined, chunks: new Map(), metadata: new Map(), errored: [], error: undefined, requesting: false };

export function allProjectsReducer(state: Stored, action: Action): Stored {
    if (action.type === 'reset') {
        return { ...EMPTY, seq: state.seq };
    }
    if (action.type === 'requested') {
        // What was listed stays on screen until the new request has answered (interaction model §4: no blanking).
        return { ...state, seq: action.seq, status: state.status === 'ready' ? 'ready' : 'loading', error: undefined, requesting: true };
    }
    if (action.seq !== state.seq) {
        return state;
    }
    if (action.type === 'chunk') {
        const { chunk } = action;
        if (chunk.kind === 'start') {
            return { ...state, projects: chunk.projects };
        }
        if (chunk.kind === 'project') {
            return { ...state, chunks: new Map(state.chunks).set(chunk.chunk.projectPath, chunk.chunk) };
        }
        const byId = new Map(state.metadata.get(chunk.projectPath));
        for (const entry of chunk.packages) {
            byId.set(entry.id.toLowerCase(), entry);
        }
        return { ...state, metadata: new Map(state.metadata).set(chunk.projectPath, byId) };
    }
    if (action.type === 'answered') {
        // A project the new listing no longer has goes; its chunk of an earlier listing must not stay on screen.
        const listed = new Set([...action.result.projectPaths, ...action.result.errored.map(entry => entry.projectPath)]);
        const chunks = new Map([...state.chunks].filter(([path]) => listed.has(path)));
        const metadata = new Map([...state.metadata].filter(([path]) => listed.has(path)));
        return { ...state, status: 'ready', chunks, metadata, errored: action.result.errored, requesting: false };
    }
    return { ...state, status: state.status === 'ready' ? 'ready' : 'error', error: action.error, requesting: false };
}

const AllProjectsContext = createContext<AllProjectsState | null>(null);

const asRequestError = (error: unknown): ProtocolRequestError =>
    error instanceof ProtocolRequestError ? error : new ProtocolRequestError('failed', error instanceof Error ? error.message : String(error));

/**
 * The allProjects slice: the installed packages of every project, streamed one chunk per project while the
 * committed selection is All Projects. The fan-out is not a resource (ADR-009): it has no generation and its key
 * is never listed in `resources/invalidated`. So the slice asks again itself when an invalidation names the
 * projects or any project's installed packages, keeps what it shows until the new answer, and applies the chunks
 * and the answer of its latest request only.
 */
export function AllProjectsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const bus = useMessageBus();
    const active = useSession().committed?.selectedProject === ALL_PROJECTS;
    const [stored, dispatch] = useReducer(allProjectsReducer, EMPTY);
    const [asks, setAsks] = useState(0);
    const seq = useRef(0);
    const [transitiveEnabled, setTransitiveEnabled] = useState(false);
    const [transitiveAsks, setTransitiveAsks] = useState(0);
    const [transitive, setTransitive] = useState<TransitiveStored>(NO_TRANSITIVE);

    useEffect(() => {
        if (!active) {
            dispatch({ type: 'reset' });
            setTransitiveEnabled(false);
            setTransitive(NO_TRANSITIVE);
            return undefined;
        }
        return bus.onEvent('resources/invalidated', event => {
            const keys = event.keys.map(entry => entry.key);
            if (keys.some(key => key === resourceKeys.projects() || key.startsWith('installed:'))) {
                setAsks(count => count + 1);
            }
            // A restore or a changed project changes what the assets files say.
            if (keys.some(key => key === resourceKeys.projects() || key.startsWith('installed:') || key.startsWith('transitive:'))) {
                setTransitiveAsks(count => count + 1);
            }
        });
    }, [bus, active]);

    // The transitive stream: the latest request only, and the earlier lists stay until it has answered.
    useEffect(() => {
        if (!active || !transitiveEnabled) {
            return undefined;
        }
        const controller = new AbortController();
        setTransitive(previous => ({ ...previous, status: previous.status === 'ready' ? 'ready' : 'loading', error: undefined }));
        bus.request('allProjects/transitive', {}, {
            signal: controller.signal,
            onChunk: chunk => {
                if (chunk.kind === 'project') {
                    setTransitive(previous => ({ ...previous, chunks: new Map(previous.chunks).set(chunk.chunk.projectPath, chunk.chunk) }));
                }
            },
        }).then(
            ({ result }) => {
                const listed = new Set([...result.projectPaths, ...result.errored.map(entry => entry.projectPath)]);
                setTransitive(previous => ({ status: 'ready', chunks: new Map([...previous.chunks].filter(([path]) => listed.has(path))), errored: result.errored, error: undefined }));
            },
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    setTransitive(previous => ({ ...previous, status: previous.status === 'ready' ? 'ready' : 'error', error: asRequestError(error) }));
                }
            },
        );
        return () => controller.abort();
    }, [bus, active, transitiveEnabled, transitiveAsks]);

    useEffect(() => {
        if (!active) {
            return undefined;
        }
        const mine = ++seq.current;
        const controller = new AbortController();
        dispatch({ type: 'requested', seq: mine });
        bus.request('allProjects/installed', {}, { signal: controller.signal, onChunk: chunk => dispatch({ type: 'chunk', seq: mine, chunk }) }).then(
            answer => dispatch({ type: 'answered', seq: mine, result: answer.result }),
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    dispatch({ type: 'failed', seq: mine, error: asRequestError(error) });
                }
            },
        );
        return () => controller.abort();
    }, [bus, active, asks]);

    const refresh = useCallback((): void => setAsks(count => count + 1), []);
    const refreshTransitive = useCallback((): void => setTransitiveAsks(count => count + 1), []);
    const enableTransitive = useCallback((): void => setTransitiveEnabled(true), []);

    const state = useMemo<AllProjectsState>(() => ({
        active,
        status: active ? stored.status : 'idle',
        projects: stored.projects,
        chunks: stored.chunks,
        metadata: stored.metadata,
        errored: stored.errored,
        error: stored.error,
        revalidating: stored.requesting && stored.status === 'ready',
        refresh,
        transitive: { enabled: active && transitiveEnabled, status: active && transitiveEnabled ? transitive.status : 'idle', chunks: transitive.chunks, errored: transitive.errored, error: transitive.error, refresh: refreshTransitive },
        enableTransitive,
    }), [active, stored, refresh, transitiveEnabled, transitive, refreshTransitive, enableTransitive]);

    return <AllProjectsContext.Provider value={state}>{children}</AllProjectsContext.Provider>;
}

export function useAllProjects(): AllProjectsState {
    const state = useContext(AllProjectsContext);
    if (state === null) {
        throw new Error('useAllProjects needs an AllProjectsProvider above it');
    }
    return state;
}

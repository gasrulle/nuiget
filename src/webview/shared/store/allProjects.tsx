import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, ProtocolRequestError, resourceKeys, type PackageMetadataLite, type Project, type ProjectInstalledChunk, type RequestChunk, type RequestResult } from '../../../protocol';
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
}

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

    useEffect(() => {
        if (!active) {
            dispatch({ type: 'reset' });
            return undefined;
        }
        return bus.onEvent('resources/invalidated', event => {
            if (event.keys.some(({ key }) => key === resourceKeys.projects() || key.startsWith('installed:'))) {
                setAsks(count => count + 1);
            }
        });
    }, [bus, active]);

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
    }), [active, stored, refresh]);

    return <AllProjectsContext.Provider value={state}>{children}</AllProjectsContext.Provider>;
}

export function useAllProjects(): AllProjectsState {
    const state = useContext(AllProjectsContext);
    if (state === null) {
        throw new Error('useAllProjects needs an AllProjectsProvider above it');
    }
    return state;
}

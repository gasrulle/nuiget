import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, ProtocolRequestError, resourceKeys, type PackageMetadataLite, type Project, type ProjectBulkUpdate, type ProjectInstalledChunk, type ProjectTransitiveChunk, type ProjectUpdatesChunk, type RequestChunk, type RequestResult } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';
import { isCentral, whyNotUpdatable } from '../installed/rules';
import { useSession } from './session';
import { metadataKey } from './transitive';
import { RECOVERY_DELAY_MS } from './updates';

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
    /**
     * Whether the direct rows' metadata has settled (UX-P5.1a): the metadata chunks precede the fan-out's answer, so true once
     * the latest fan-out answered or a re-ask over a ready list failed; false while a request runs and after a first failure.
     */
    metadataSettled: boolean;
    refresh: () => void;
    /** The transitive packages of every project, streamed once `enableTransitive()` was called in this All Projects. */
    transitive: AllProjectsTransitive;
    /** The aggregated transitive section was opened: its stream is asked for, and asked again when it may have changed. */
    enableTransitive: () => void;
    /** The updates of every project under the committed prerelease flag, streamed while All Projects is committed. */
    updates: AllProjectsUpdates;
}

export interface AllProjectsUpdates {
    status: 'idle' | 'loading' | 'ready' | 'error';
    projects: readonly Project[] | undefined;
    /** The latest chunk of each project, by path: its updates, or its error. */
    chunks: ReadonlyMap<string, ProjectUpdatesChunk>;
    /** Icons by lower-cased package id, from the stream's `icons` chunk. */
    icons: ReadonlyMap<string, string>;
    /** A source could not be checked: no row does not mean no update. */
    sourcesUnavailable: boolean;
    error: ProtocolRequestError | undefined;
    revalidating: boolean;
    refreshUpdates: () => void;
}

interface UpdatesStored {
    seq: number;
    status: AllProjectsUpdates['status'];
    projects: readonly Project[] | undefined;
    chunks: ReadonlyMap<string, ProjectUpdatesChunk>;
    icons: ReadonlyMap<string, string>;
    sourcesUnavailable: boolean;
    error: ProtocolRequestError | undefined;
    requesting: boolean;
}

const NO_UPDATES: UpdatesStored = { seq: 0, status: 'idle', projects: undefined, chunks: new Map(), icons: new Map(), sourcesUnavailable: false, error: undefined, requesting: false };

export interface AllProjectsTransitive {
    enabled: boolean;
    status: 'idle' | 'loading' | 'ready' | 'error';
    /** The latest chunk of each project, by path. */
    chunks: ReadonlyMap<string, ProjectTransitiveChunk>;
    errored: RequestResult<'allProjects/transitive'>['errored'];
    error: ProtocolRequestError | undefined;
    /**
     * What `transitive/metadata` said about the aggregate's packages, by `metadataKey`; empty while it said nothing. A newer
     * answer of the stream keeps it until its own ask answers; leaving All Projects drops it (UX-P5.1a).
     */
    metadata: ReadonlyMap<string, PackageMetadataLite>;
    /**
     * Whether the aggregate and its metadata have ended (UX-P5.1a): true once the stream failed with no answer, or its answer
     * lists no package, or the metadata ask for that answer answered or failed; never by a cancelled ask; false when not
     * enabled and while the stream has neither an answer nor an error.
     */
    settled: boolean;
    refresh: () => void;
}

interface TransitiveStored {
    status: AllProjectsTransitive['status'];
    chunks: ReadonlyMap<string, ProjectTransitiveChunk>;
    /** The chunks as the latest answer of the stream left them; the metadata belongs to these. */
    answered: ReadonlyMap<string, ProjectTransitiveChunk> | undefined;
    errored: AllProjectsTransitive['errored'];
    error: ProtocolRequestError | undefined;
}

const NO_TRANSITIVE: TransitiveStored = { status: 'idle', chunks: new Map(), answered: undefined, errored: [], error: undefined };
const NO_METADATA: ReadonlyMap<string, PackageMetadataLite> = new Map();

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

/** The state of a stream of `allProjects/installed`; the project picker keeps one of its own outside All Projects. */
export type AllProjectsStored = Stored;

const EMPTY: Stored = { seq: 0, status: 'idle', projects: undefined, chunks: new Map(), metadata: new Map(), errored: [], error: undefined, requesting: false };

export const EMPTY_ALL_PROJECTS: AllProjectsStored = EMPTY;

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

/** `AllProjectsTransitive.settled` once enabled (UX-P5.1a, architecture-advisor follow-up 2 DO 4). */
function transitiveSettled(transitive: TransitiveStored, settledAnswer: ReadonlyMap<string, ProjectTransitiveChunk> | undefined): boolean {
    const { answered } = transitive;
    if (answered === undefined) {
        return transitive.status === 'error';
    }
    const empty = [...answered.values()].every(chunk => chunk.frameworks.every(framework => framework.packages.length === 0));
    return empty || settledAnswer === answered;
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
export function AllProjectsProvider({ children, prefetchTransitive = false }: { children: React.ReactNode; prefetchTransitive?: boolean }): React.JSX.Element {
    const bus = useMessageBus();
    const active = useSession().committed?.selectedProject === ALL_PROJECTS;
    const [stored, dispatch] = useReducer(allProjectsReducer, EMPTY);
    const [asks, setAsks] = useState(0);
    const seq = useRef(0);
    const [transitiveEnabled, setTransitiveEnabled] = useState(false);
    const [transitiveAsks, setTransitiveAsks] = useState(0);
    const [transitive, setTransitive] = useState<TransitiveStored>(NO_TRANSITIVE);
    const [transitiveMetadata, setTransitiveMetadata] = useState<ReadonlyMap<string, PackageMetadataLite>>();
    // The stream answer whose metadata ask last ended, answered or failed (UX-P5.1a).
    const [settledAnswer, setSettledAnswer] = useState<ReadonlyMap<string, ProjectTransitiveChunk>>();
    const includePrerelease = useSession().committed?.includePrerelease ?? false;
    const [updatesAsks, setUpdatesAsks] = useState(0);
    const [updates, setUpdates] = useState<UpdatesStored>(NO_UPDATES);
    const updatesSeq = useRef(0);
    const latestUpdates = useRef({ unavailable: false, failed: new Set<string>() });
    latestUpdates.current.unavailable = updates.sourcesUnavailable;

    useEffect(() => {
        if (!active) {
            dispatch({ type: 'reset' });
            setTransitiveEnabled(false);
            setTransitive(NO_TRANSITIVE);
            setTransitiveMetadata(undefined);
            setSettledAnswer(undefined);
            setUpdates(previous => ({ ...NO_UPDATES, seq: previous.seq }));
            return undefined;
        }
        return bus.onEvent('resources/invalidated', event => {
            const keys = event.keys.map(entry => entry.key);
            if (keys.some(key => key === resourceKeys.projects() || key.startsWith('installed:'))) {
                setAsks(count => count + 1);
            }
            // The updates follow their own keys (the fan-out's key is never listed, ADR-009), never `installed:`.
            if (keys.some(key => key === resourceKeys.projects() || key.startsWith('updates:'))) {
                setUpdatesAsks(count => count + 1);
            }
            // A restore or a changed project changes what the assets files say.
            if (keys.some(key => key === resourceKeys.projects() || key.startsWith('installed:') || key.startsWith('transitive:'))) {
                setTransitiveAsks(count => count + 1);
            }
        });
    }, [bus, active]);

    // The updates stream: the chunks and the answer of the latest request only (N11); earlier rows stay until it answers.
    useEffect(() => {
        if (!active) {
            return undefined;
        }
        const mine = ++updatesSeq.current;
        const controller = new AbortController();
        const own = (apply: (previous: UpdatesStored) => UpdatesStored) => setUpdates(previous => (previous.seq === mine ? apply(previous) : previous));
        setUpdates(previous => ({ ...previous, seq: mine, status: previous.status === 'ready' ? 'ready' : 'loading', error: undefined, requesting: true }));
        bus.request('allProjects/updates', { includePrerelease }, {
            signal: controller.signal,
            onChunk: chunk => own(previous => {
                if (chunk.kind === 'start') {
                    return { ...previous, projects: chunk.projects };
                }
                if (chunk.kind === 'project') {
                    return { ...previous, chunks: new Map(previous.chunks).set(chunk.chunk.projectPath, chunk.chunk) };
                }
                return { ...previous, icons: new Map([...previous.icons, ...Object.entries(chunk.icons).map(([id, url]): [string, string] => [id.toLowerCase(), url])]) };
            }),
        }).then(
            ({ result }) => own(previous => {
                const listed = new Set(result.projectPaths);
                return { ...previous, status: 'ready', chunks: new Map([...previous.chunks].filter(([path]) => listed.has(path))), sourcesUnavailable: result.sourcesUnavailable === true, requesting: false };
            }),
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    own(previous => ({ ...previous, status: previous.status === 'ready' ? 'ready' : 'error', error: asRequestError(error), requesting: false }));
                }
            },
        );
        return () => controller.abort();
    }, [bus, active, includePrerelease, updatesAsks]);

    // A source that comes back while the answer said a source could not be checked: ask once more (as the updates slice).
    useEffect(() => bus.onEvent('sources/health', ({ failed }) => {
        const now = new Set(failed.map(source => source.url));
        const recovered = [...latestUpdates.current.failed].some(url => !now.has(url));
        latestUpdates.current.failed = now;
        if (!recovered || !latestUpdates.current.unavailable) {
            return;
        }
        const asked = updatesSeq.current;
        setTimeout(() => {
            if (updatesSeq.current === asked && latestUpdates.current.unavailable) {
                setUpdatesAsks(count => count + 1);
            }
        }, RECOVERY_DELAY_MS);
    }), [bus]);

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
                setTransitive(previous => {
                    const chunks = new Map([...previous.chunks].filter(([path]) => listed.has(path)));
                    return { status: 'ready', chunks, answered: chunks, errored: result.errored, error: undefined };
                });
            },
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    setTransitive(previous => ({ ...previous, status: previous.status === 'ready' ? 'ready' : 'error', error: asRequestError(error) }));
                }
            },
        );
        return () => controller.abort();
    }, [bus, active, transitiveEnabled, transitiveAsks]);

    // The main panel's eager stream (UX-P5.1a, `prefetchTransitive`): enabled once the fan-out answered, never from a timer or a
    // component; leaving All Projects resets it, and the next activation enables it again after its own first answer.
    useEffect(() => {
        if (prefetchTransitive && active && stored.status === 'ready') {
            setTransitiveEnabled(true);
        }
    }, [prefetchTransitive, active, stored.status]);

    // The lite metadata of the aggregate (icon, authors, Verified, vulnerabilities): one ask for the unique packages once
    // the stream has answered, again after each newer answer; an error is no metadata. The answered metadata is kept and
    // merged by key across newer answers (UX-P5.1a).
    const answered = transitive.answered;
    useEffect(() => {
        if (!active || answered === undefined) {
            return undefined;
        }
        const pairs = new Map<string, { id: string; version: string }>();
        for (const chunk of answered.values()) {
            for (const framework of chunk.frameworks) {
                for (const entry of framework.packages) {
                    const key = metadataKey(entry.id, entry.version);
                    if (!pairs.has(key)) {
                        pairs.set(key, { id: entry.id, version: entry.version });
                    }
                }
            }
        }
        if (pairs.size === 0) {
            return undefined;
        }
        const controller = new AbortController();
        const settle = (): void => {
            // A cancelled ask settles nothing: a newer answer or leaving All Projects asked again.
            if (!controller.signal.aborted) {
                setSettledAnswer(answered);
            }
        };
        bus.request('transitive/metadata', { packages: [...pairs.values()] }, { signal: controller.signal }).then(answer => {
            setTransitiveMetadata(previous => {
                const byKey = new Map(previous ?? []);
                for (const entry of answer.result.metadata) {
                    byKey.set(metadataKey(entry.id, entry.version), entry);
                }
                return byKey;
            });
            settle();
        }, () => {
            // No metadata is no error of the list; it settles.
            settle();
        });
        return () => controller.abort();
    }, [bus, active, answered]);

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
    const refreshUpdates = useCallback((): void => setUpdatesAsks(count => count + 1), []);

    const state = useMemo<AllProjectsState>(() => ({
        active,
        status: active ? stored.status : 'idle',
        projects: stored.projects,
        chunks: stored.chunks,
        metadata: stored.metadata,
        errored: stored.errored,
        error: stored.error,
        revalidating: stored.requesting && stored.status === 'ready',
        metadataSettled: active && stored.status === 'ready' && !stored.requesting,
        refresh,
        transitive: {
            enabled: active && transitiveEnabled,
            status: active && transitiveEnabled ? transitive.status : 'idle',
            chunks: transitive.chunks,
            errored: transitive.errored,
            error: transitive.error,
            metadata: active && transitiveMetadata !== undefined ? transitiveMetadata : NO_METADATA,
            settled: active && transitiveEnabled && transitiveSettled(transitive, settledAnswer),
            refresh: refreshTransitive,
        },
        enableTransitive,
        updates: {
            status: active ? updates.status : 'idle',
            projects: updates.projects,
            chunks: updates.chunks,
            icons: updates.icons,
            sourcesUnavailable: updates.sourcesUnavailable,
            error: updates.error,
            revalidating: updates.requesting && updates.status === 'ready',
            refreshUpdates,
        },
    }), [active, stored, refresh, transitiveEnabled, transitive, transitiveMetadata, settledAnswer, refreshTransitive, enableTransitive, updates, refreshUpdates]);

    return <AllProjectsContext.Provider value={state}>{children}</AllProjectsContext.Provider>;
}

export function useAllProjects(): AllProjectsState {
    const state = useContext(AllProjectsContext);
    if (state === null) {
        throw new Error('useAllProjects needs an AllProjectsProvider above it');
    }
    return state;
}

// ---- UX-P5.3a: the Consolidate model (F3, G5) -------------------------------------------------------------------------

/** One version of a package under All Projects and the projects that reference it at that version. */
export interface DriftVersion {
    /** The version as the first project lists it: its resolved version, else the version as specified. */
    version: string;
    projects: ReadonlyArray<{ projectPath: string; projectName: string }>;
}

/**
 * A reference a consolidation leaves as it is, with the sentence why: a central row, an SDK reference, an unresolved one, a floating
 * version or range, or one conditioned on some target frameworks.
 */
export interface DriftHeld {
    projectPath: string;
    projectName: string;
    version: string;
    reason: string;
}

/** A package that more than one project references at more than one version. */
export interface DriftEntry {
    id: string;
    /** The versions a consolidation can change, in the order of the projects. */
    versions: readonly DriftVersion[];
    /** The references it leaves; their known versions count towards the drift. */
    held: readonly DriftHeld[];
    /** How many distinct known versions the projects reference, held ones included (the row's "N versions"). */
    versionCount: number;
    /** How many projects reference the package, held ones included (the row's "in M projects"). */
    projectCount: number;
}

export interface VersionDrift {
    /**
     * Whether every project's list was read: false while the fan-out runs, after it failed, or when a project failed or is
     * unsupported. An incomplete reading is unknown, never "no drift" (empty is not unknown).
     */
    complete: boolean;
    /** The projects whose packages were not read, and why. */
    unread: ReadonlyArray<{ projectPath: string; projectName: string; reason: string }>;
    /** The drifting packages, by id. */
    entries: readonly DriftEntry[];
}

/** The key two versions are equal by: NuGet compares versions without case; build metadata never orders. */
const versionKey = (version: string): string => version.toLowerCase().replace(/\+.*$/, '');

/**
 * The packages whose version differs between projects under All Projects (F3 Consolidate, UX-P5.3a): from the lists the
 * fan-out streamed, each package that at least two projects reference at at least two versions. A row whose version is set
 * centrally (`central`) is held: a consolidation reaches it only through the central file; a `central-override` row joins
 * (N74). An SDK reference, a row `whyNotUpdatable` refuses, a floating version or range (a consolidation would replace the pattern
 * with a fixed version) and a reference conditioned on some target frameworks (no SDK probe shows what an add does to it) are held
 * with their reason (UX-P5.3b). A held row's known version counts towards the drift; a version that is not known (unresolved, or a
 * pattern without a resolved version) is no version.
 */
export function versionDrift(state: Pick<AllProjectsState, 'status' | 'projects' | 'chunks'>): VersionDrift {
    const unread: Array<{ projectPath: string; projectName: string; reason: string }> = [];
    type Gathered = { id: string; versions: Map<string, { version: string; projects: Array<{ projectPath: string; projectName: string }> }>; held: DriftHeld[]; projects: Set<string>; keys: Set<string> };
    const byId = new Map<string, Gathered>();
    for (const project of state.projects ?? []) {
        const chunk = state.chunks.get(project.path);
        const result = chunk?.result;
        if (result === undefined || result.unsupported !== undefined) {
            unread.push({ projectPath: project.path, projectName: project.name, reason: chunk?.error ?? result?.unsupported?.message ?? 'Its packages were not read yet.' });
            continue;
        }
        for (const entry of result.packages) {
            const version = entry.resolvedVersion || entry.version;
            const key = versionKey(version);
            const lower = entry.id.toLowerCase();
            const item: Gathered = byId.get(lower) ?? { id: entry.id, versions: new Map(), held: [], projects: new Set<string>(), keys: new Set<string>() };
            byId.set(lower, item);
            item.projects.add(project.path);
            const pattern = entry.versionType === 'floating' || entry.versionType === 'range';
            const known = entry.declaration !== 'unresolved' && entry.versionType !== 'unresolved' && (!pattern || Boolean(entry.resolvedVersion));
            if (known) {
                item.keys.add(key);
            }
            const reason = whyNotUpdatable(entry, result)
                ?? (isCentral(entry) ? `${entry.id} is set in the central package file of ${project.name}` : undefined)
                ?? (entry.isImplicit ? `${entry.id} is added by the .NET SDK` : undefined)
                ?? (pattern ? `${entry.id} uses a floating version or range in ${project.name}` : undefined)
                ?? (entry.targetFrameworks !== undefined ? `${entry.id} is referenced for some target frameworks only in ${project.name}` : undefined);
            if (reason !== undefined) {
                item.held.push({ projectPath: project.path, projectName: project.name, version, reason });
                continue;
            }
            const at = item.versions.get(key) ?? { version, projects: [] };
            item.versions.set(key, at);
            if (!at.projects.some(listed => listed.projectPath === project.path)) {
                at.projects.push({ projectPath: project.path, projectName: project.name });
            }
        }
    }
    const entries = [...byId.values()]
        .filter(item => item.projects.size > 1 && item.keys.size > 1)
        .map(item => ({ id: item.id, versions: [...item.versions.values()], held: item.held, versionCount: item.keys.size, projectCount: item.projects.size }))
        .sort((a, b) => a.id.toLowerCase().localeCompare(b.id.toLowerCase()));
    const complete = state.status === 'ready' && state.projects !== undefined && unread.length === 0;
    return { complete, unread, entries };
}

/**
 * The `ops/bulkUpdateAllProjects` payload that brings a drifting package to `version` (UX-P5.3a): one entry per project
 * whose version differs, the held references left out. The version is sent as chosen: the host applies it verbatim, a lower
 * one included.
 */
export function consolidationUpdates(entry: DriftEntry, version: string, sourceUrl?: string): ProjectBulkUpdate[] {
    const target = versionKey(version);
    return entry.versions
        .filter(at => versionKey(at.version) !== target)
        .flatMap(at => at.projects.map(project => ({ projectPath: project.projectPath, projectName: project.projectName, packages: [{ id: entry.id, version, ...(sourceUrl === undefined ? {} : { sourceUrl }) }] })));
}

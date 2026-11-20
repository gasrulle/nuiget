import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type React from 'react';
import { resourceKeys, type BulkOutcome, type OperationKind, type OperationOutcome, type OperationProgress, type OperationStatus, type RequestChunk, type RequestPayload, type RequestResult, type RequestType, type Surface } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';
import { useAllProjects } from './allProjects';
import { useInstalled } from './installed';
import { useUpdates } from './updates';

/** The requests that run on the operation queue: their response is an outcome. */
export type OperationRequestType = Extract<RequestType, `ops/${string}`>;

export type AnyOutcome = OperationOutcome | BulkOutcome;

export interface OpsState {
    /** Operations that are queued or running, by operation id, with what was last said about each. */
    active: ReadonlyMap<string, OperationProgress>;
    /** The last operation that ended, on either surface, from the event or the response. `sequence` goes up with each. */
    last: { outcome: AnyOutcome; sequence: number } | undefined;
    /**
     * The last outcome this surface asked for, from the response to its own request (UX-P4.6, A10), or from an event whose
     * `origin` is this surface, the operation its row menu started (UX-P4.fix-11): what only that surface says. `sequence`
     * goes up with each, so the same outcome twice is two announcements.
     */
    own: { outcome: AnyOutcome; sequence: number } | undefined;
    /** Ids of operations whose end was already recorded: an outcome arrives as an event and, where it was asked for, as a response. */
    ended: readonly string[];
    /**
     * Packages a successful edit left busy until their list catches up (X31, UX-P4.8b), by project and package: `lists` is
     * absent until the listing that follows the outcome, then says which of this surface's lists still owe their answer.
     */
    settling: ReadonlyMap<string, Settling>;
}

export interface Settling {
    kind: OperationKind;
    projectPath: string;
    packageId: string;
    lists?: { installed: boolean; updates: boolean };
}

export type OpsAction =
    | { type: 'progress'; progress: OperationProgress }
    /** `mine`: the event's `origin` is this surface (its row menu ran the operation, UX-P4.fix-11); `event`: it came as `ops/completed`. */
    | { type: 'completed'; outcome: AnyOutcome; mine?: boolean; event?: boolean }
    /** The `resources/invalidated` event after an outcome: whether it names the selected project's lists (none: every project). */
    | { type: 'listed'; projectPath?: string; installed: boolean; updates: boolean }
    /** A list of this surface settled, with an answer or an error. */
    | { type: 'listSettled'; list: 'installed' | 'updates' }
    /** The selection changed: no package waits for a list any more. */
    | { type: 'unselected' }
    /** The response to this surface's own request: its outcome, whether or not the event came first. */
    | { type: 'answered'; outcome: AnyOutcome }
    /** This surface asked for an operation: it is in progress from the call on, under an id of this surface. */
    | { type: 'asked'; localId: string; progress: OperationProgress }
    /** The first chunk of the request named the host's operation id: the entry moves under it. */
    | { type: 'named'; localId: string; opId: string }
    /** The request settled, with an outcome or without: neither the local entry nor the operation stays in progress. */
    | { type: 'settled'; localId: string; opId: string | undefined };

export const INITIAL_OPS: OpsState = { active: new Map(), last: undefined, own: undefined, ended: [], settling: new Map() };

const IN_PROGRESS: ReadonlySet<OperationStatus> = new Set<OperationStatus>(['queued', 'running', 'restoring']);
/** How many ended operation ids are remembered; an outcome is repeated within moments, not after dozens of others. */
const REMEMBERED = 32;

export function isBulkOutcome(outcome: AnyOutcome): outcome is BulkOutcome {
    return 'results' in outcome;
}

/**
 * A later report of an operation over what is known of it: status, steps and detail from the report, the projects
 * and packages as the union of both. A bulk operation reports one package per step; the others stay busy (MU3).
 * Paths are kept as the host sent them; ids are compared without case and keep their first spelling.
 */
function merge(previous: OperationProgress | undefined, report: OperationProgress): OperationProgress {
    const merged: OperationProgress = { ...previous, ...report };
    const paths = [...new Set([...(previous?.projectPaths ?? []), ...(report.projectPaths ?? [])])];
    const ids = new Map<string, string>();
    for (const id of [...(previous?.packageIds ?? []), ...(report.packageIds ?? [])]) {
        if (!ids.has(id.toLowerCase())) {
            ids.set(id.toLowerCase(), id);
        }
    }
    if (previous?.projectPaths !== undefined || report.projectPaths !== undefined) {
        merged.projectPaths = paths;
    }
    if (previous?.packageIds !== undefined || report.packageIds !== undefined) {
        merged.packageIds = [...ids.values()];
    }
    return merged;
}

/** The settling entries `step` keeps or changes (`undefined`: drop the entry); the same state when nothing changed. */
function settle(state: OpsState, step: (entry: Settling) => Settling | undefined): OpsState {
    let changed = false;
    const settling = new Map<string, Settling>();
    for (const [key, entry] of state.settling) {
        const next = step(entry);
        changed ||= next !== entry;
        if (next !== undefined) {
            settling.set(key, next);
        }
    }
    return changed ? { ...state, settling } : state;
}

export function opsReducer(state: OpsState, action: OpsAction): OpsState {
    if (action.type === 'listed') {
        return settle(state, entry => {
            if (entry.lists !== undefined) {
                return entry;
            }
            const match = action.projectPath === undefined || entry.projectPath === action.projectPath;
            const lists = { installed: match && action.installed, updates: match && action.updates };
            return lists.installed || lists.updates ? { ...entry, lists } : undefined;
        });
    }
    if (action.type === 'listSettled') {
        return settle(state, entry => {
            if (entry.lists?.[action.list] !== true) {
                return entry;
            }
            const lists = { ...entry.lists, [action.list]: false };
            return lists.installed || lists.updates ? { ...entry, lists } : undefined;
        });
    }
    if (action.type === 'unselected') {
        return state.settling.size === 0 ? state : { ...state, settling: new Map() };
    }
    if (action.type === 'asked') {
        return { ...state, active: new Map(state.active).set(action.localId, action.progress) };
    }
    if (action.type === 'named') {
        const local = state.active.get(action.localId);
        if (local === undefined) {
            return state;
        }
        const active = new Map(state.active);
        active.delete(action.localId);
        if (!state.ended.includes(action.opId)) {
            // Reports of the host may have come first: what they said stands, the call fills in the rest.
            const reported = state.active.get(action.opId);
            active.set(action.opId, { ...(reported === undefined ? local : merge(local, reported)), opId: action.opId });
        }
        return { ...state, active };
    }
    if (action.type === 'settled') {
        const active = new Map(state.active);
        const removedLocal = active.delete(action.localId);
        const removedOp = action.opId !== undefined && active.delete(action.opId);
        return removedLocal || removedOp ? { ...state, active } : state;
    }
    if (action.type === 'progress') {
        const { progress } = action;
        if (state.ended.includes(progress.opId)) {
            // Progress that arrives after the outcome does not bring the operation back.
            return state;
        }
        const active = new Map(state.active);
        if (IN_PROGRESS.has(progress.status)) {
            // A later report may name fewer projects or packages than an earlier one (one step of a bulk): keep them all.
            active.set(progress.opId, merge(state.active.get(progress.opId), progress));
        } else if (!active.delete(progress.opId)) {
            return state;
        }
        return { ...state, active };
    }
    if (action.type === 'answered') {
        // Never read against `ended`: the event of the same operation may have come first.
        return { ...state, own: { outcome: action.outcome, sequence: (state.own?.sequence ?? 0) + 1 } };
    }
    const { outcome } = action;
    if (state.ended.includes(outcome.opId)) {
        return state;
    }
    const active = new Map(state.active);
    active.delete(outcome.opId);
    // Only the event arms: the response of an outcome first recorded from it means this surface missed the listing (X31).
    const settling = new Map(state.settling);
    if (action.event === true) {
        for (const result of isBulkOutcome(outcome) ? outcome.results : [outcome]) {
            if (result.edit?.ok === true && result.packageId !== undefined) {
                settling.set(busyKey(result.projectPath, result.packageId), { kind: result.kind, projectPath: result.projectPath, packageId: result.packageId });
            }
        }
    }
    return {
        active,
        settling,
        last: { outcome, sequence: (state.last?.sequence ?? 0) + 1 },
        own: action.mine === true ? { outcome, sequence: (state.own?.sequence ?? 0) + 1 } : state.own,
        ended: [...state.ended, outcome.opId].slice(-REMEMBERED),
    };
}

const KIND_OF: Record<OperationRequestType, OperationKind> = {
    'ops/install': 'install',
    'ops/update': 'update',
    'ops/remove': 'remove',
    'ops/restore': 'restore',
    'ops/bulkInstall': 'install',
    'ops/bulkUpdate': 'update',
    'ops/bulkRemove': 'remove',
    'ops/bulkUpdateAllProjects': 'update',
    'ops/bulkRemoveAllProjects': 'remove',
};

/** Which projects and packages an operation touches, read from what was asked (the payloads of `src/protocol/messages.ts`). */
export function touchedBy<T extends OperationRequestType>(type: T, payload: RequestPayload<T>): Pick<OperationProgress, 'kind' | 'projectPaths' | 'packageIds'> {
    const asked = payload as {
        projectPath?: string;
        projectPaths?: string[];
        packageId?: string;
        packages?: Array<string | { id: string }>;
        projectUpdates?: Array<{ projectPath: string; packages: Array<{ id: string }> }>;
        projectRemovals?: Array<{ projectPath: string; packages: string[] }>;
    };
    const perProject = asked.projectUpdates ?? asked.projectRemovals ?? [];
    const projectPaths = [
        ...(asked.projectPath === undefined ? [] : [asked.projectPath]),
        ...(asked.projectPaths ?? []),
        ...perProject.map(entry => entry.projectPath),
    ];
    const packageIds = [
        ...(asked.packageId === undefined ? [] : [asked.packageId]),
        ...(asked.packages ?? []).map(entry => (typeof entry === 'string' ? entry : entry.id)),
        ...perProject.flatMap(entry => entry.packages.map(item => (typeof item === 'string' ? item : item.id))),
    ];
    return { kind: KIND_OF[type], projectPaths: [...new Set(projectPaths)], packageIds: [...new Set(packageIds)] };
}

/** The key under which a package of a project counts as busy. Package ids compare without case; paths are the host's. */
/** The key of a project and package in `busyPackages` and `settling`: the id in any case. */
export const busyKey = (projectPath: string, packageId: string): string => `${projectPath}|${packageId.toLowerCase()}`;

/** Every (project, package) pair an operation in progress touches. */
export function busyPackages(state: OpsState): ReadonlySet<string> {
    const keys = new Set<string>();
    for (const progress of state.active.values()) {
        for (const projectPath of progress.projectPaths ?? []) {
            for (const packageId of progress.packageIds ?? []) {
                keys.add(busyKey(projectPath, packageId));
            }
        }
    }
    return keys;
}

/**
 * The projects a restore in progress (queued or running, started on either surface) is about, as their paths were sent.
 * Keyed on the operation's kind: an edit's own restore step reports `restoring` too and is no restore (UX-P4.fix-10).
 */
export function restoringProjects(state: OpsState): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const progress of state.active.values()) {
        if (progress.kind === 'restore') {
            for (const projectPath of progress.projectPaths ?? []) {
                paths.add(projectPath);
            }
        }
    }
    return paths;
}

export interface OpsView extends OpsState {
    /**
     * Whether an operation in progress, started on either surface, touches this package of this project, or a successful edit of
     * it waits for the installed list to answer (X31).
     */
    isPackageBusy: (projectPath: string, packageId: string, updateList?: boolean) => boolean;
    /** Whether anything is queued or running. */
    isBusy: boolean;
}

export interface OpsActions {
    /**
     * Starts an operation and resolves with its outcome, whatever it is: an operation that was refused or failed
     * resolves too (`status`). It rejects only when the request itself could not be answered.
     */
    run: <T extends OperationRequestType>(type: T, payload: RequestPayload<T>) => Promise<RequestResult<T>>;
}

const OpsViewContext = createContext<OpsView | null>(null);
const OpsActionsContext = createContext<OpsActions | null>(null);

/**
 * The ops slice: which operations are in progress and how the last one ended (`last`, either surface) and how this
 * surface's own last one ended (`own`, its response only). Progress and outcomes arrive as events whoever started the
 * operation, so a row is busy on the surface that did not ask as well. The surface that asked also gets the outcome as
 * its response; `last` counts it once, and `own` holds it.
 */
export function OpsProvider({ children, surface }: { children: React.ReactNode; surface?: Surface }): React.JSX.Element {
    const bus = useMessageBus();
    const [state, dispatch] = useReducer(opsReducer, INITIAL_OPS);

    useEffect(() => {
        const unsubscribes = [
            bus.onEvent('ops/progress', progress => dispatch({ type: 'progress', progress })),
            bus.onEvent('ops/completed', outcome => dispatch({ type: 'completed', outcome, mine: surface !== undefined && outcome.origin === surface, event: true })),
            // The listing that follows an outcome in the same host turn: which of this surface's current keys it names (X31).
            bus.onEvent('resources/invalidated', event => {
                const { installed: one, updates: checked, all } = lists.current;
                const named = (key: string): boolean => event.keys.some(entry => entry.key === key);
                const path = one.projectPath;
                dispatch(all.active
                    ? { type: 'listed', installed: named(resourceKeys.projects()), updates: named(resourceKeys.projects()) }
                    : { type: 'listed', projectPath: path ?? '', installed: path !== null && named(resourceKeys.installed(path)), updates: path !== null && named(resourceKeys.updates(path, checked.includePrerelease)) });
            }),
        ];
        return () => unsubscribes.forEach(unsubscribe => unsubscribe());
    }, [bus, surface]);

    // A list settles when its request ends, answer or error: an edge, since the fan-out asks one commit after the listing.
    const installed = useInstalled();
    const updates = useUpdates();
    const all = useAllProjects();
    const lists = useRef({ installed, updates, all });
    lists.current = { installed, updates, all };
    const installedPending = installed.status === 'loading' || installed.revalidating || all.status === 'loading' || all.revalidating;
    const updatesPending = updates.status === 'loading' || updates.revalidating || all.updates.status === 'loading' || all.updates.revalidating;
    useEffect(() => {
        if (!installedPending) {
            dispatch({ type: 'listSettled', list: 'installed' });
        }
    }, [installedPending]);
    useEffect(() => {
        if (!updatesPending) {
            dispatch({ type: 'listSettled', list: 'updates' });
        }
    }, [updatesPending]);
    const selection = all.active ? null : installed.projectPath;
    useEffect(() => dispatch({ type: 'unselected' }), [selection]);

    const nextLocal = useRef(0);

    const run = useCallback(async <T extends OperationRequestType>(type: T, payload: RequestPayload<T>): Promise<RequestResult<T>> => {
        // In progress from the call: an operation that waits in the queue has no `ops/progress` yet, only a
        // `queued` chunk on this request (N61).
        const localId = `local:${++nextLocal.current}`;
        let opId: string | undefined;
        dispatch({ type: 'asked', localId, progress: { opId: localId, status: 'queued', ...touchedBy(type, payload) } });
        const onChunk = (chunk: RequestChunk<T>): void => {
            // Every operation request streams `OperationProgress` (`src/protocol/messages.ts`).
            const progress = chunk as OperationProgress;
            if (opId === undefined && typeof progress.opId === 'string') {
                opId = progress.opId;
                dispatch({ type: 'named', localId, opId });
            }
            dispatch({ type: 'progress', progress });
        };
        try {
            const answer = await bus.request(type, payload, { onChunk });
            // The response is the one terminal message the protocol promises (ADR-007). The host announces the
            // same outcome as `ops/completed`; recorded from here as well, a row cannot stay busy for want of an event.
            dispatch({ type: 'completed', outcome: answer.result as AnyOutcome });
            dispatch({ type: 'answered', outcome: answer.result as AnyOutcome });
            return answer.result;
        } finally {
            dispatch({ type: 'settled', localId, opId });
        }
    }, [bus]);

    const view = useMemo<OpsView>(() => {
        const busy = busyPackages(state);
        return {
            ...state,
            isBusy: state.active.size > 0,
            isPackageBusy: (projectPath, packageId, updateList) => {
                const key = busyKey(projectPath, packageId);
                const lists = state.settling.get(key)?.lists;
                return busy.has(key) || (state.settling.has(key) && (lists === undefined || lists[updateList === true ? 'updates' : 'installed']));
            },
        };
    }, [state]);
    const actions = useMemo<OpsActions>(() => ({ run }), [run]);

    return (
        <OpsActionsContext.Provider value={actions}>
            <OpsViewContext.Provider value={view}>{children}</OpsViewContext.Provider>
        </OpsActionsContext.Provider>
    );
}

export function useOps(): OpsView {
    const view = useContext(OpsViewContext);
    if (view === null) {
        throw new Error('useOps needs an OpsProvider above it');
    }
    return view;
}

/** Stable for the life of the surface. */
export function useOpsActions(): OpsActions {
    const actions = useContext(OpsActionsContext);
    if (actions === null) {
        throw new Error('useOpsActions needs an OpsProvider above it');
    }
    return actions;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type React from 'react';
import type { BulkOutcome, OperationKind, OperationOutcome, OperationProgress, OperationStatus, RequestChunk, RequestPayload, RequestResult, RequestType } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';

/** The requests that run on the operation queue: their response is an outcome. */
export type OperationRequestType = Extract<RequestType, `ops/${string}`>;

export type AnyOutcome = OperationOutcome | BulkOutcome;

export interface OpsState {
    /** Operations that are queued or running, by operation id, with what was last said about each. */
    active: ReadonlyMap<string, OperationProgress>;
    /** The last operation that ended, on either surface. `sequence` goes up with each, so the same outcome twice is two announcements. */
    last: { outcome: AnyOutcome; sequence: number } | undefined;
    /** Ids of operations whose end was already recorded: an outcome arrives as an event and, where it was asked for, as a response. */
    ended: readonly string[];
}

export type OpsAction =
    | { type: 'progress'; progress: OperationProgress }
    | { type: 'completed'; outcome: AnyOutcome }
    /** This surface asked for an operation: it is in progress from the call on, under an id of this surface. */
    | { type: 'asked'; localId: string; progress: OperationProgress }
    /** The first chunk of the request named the host's operation id: the entry moves under it. */
    | { type: 'named'; localId: string; opId: string }
    /** The request settled, with an outcome or without: neither the local entry nor the operation stays in progress. */
    | { type: 'settled'; localId: string; opId: string | undefined };

export const INITIAL_OPS: OpsState = { active: new Map(), last: undefined, ended: [] };

const IN_PROGRESS: ReadonlySet<OperationStatus> = new Set<OperationStatus>(['queued', 'running', 'restoring']);
/** How many ended operation ids are remembered; an outcome is repeated within moments, not after dozens of others. */
const REMEMBERED = 32;

export function isBulkOutcome(outcome: AnyOutcome): outcome is BulkOutcome {
    return 'results' in outcome;
}

export function opsReducer(state: OpsState, action: OpsAction): OpsState {
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
            active.set(action.opId, { ...local, ...state.active.get(action.opId), opId: action.opId });
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
            // A later report may leave out what an earlier one said (which projects, which packages): keep it.
            active.set(progress.opId, { ...state.active.get(progress.opId), ...progress });
        } else if (!active.delete(progress.opId)) {
            return state;
        }
        return { ...state, active };
    }
    const { outcome } = action;
    if (state.ended.includes(outcome.opId)) {
        return state;
    }
    const active = new Map(state.active);
    active.delete(outcome.opId);
    return {
        active,
        last: { outcome, sequence: (state.last?.sequence ?? 0) + 1 },
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
const busyKey = (projectPath: string, packageId: string): string => `${projectPath}|${packageId.toLowerCase()}`;

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

export interface OpsView extends OpsState {
    /** Whether an operation in progress, started on either surface, touches this package of this project. */
    isPackageBusy: (projectPath: string, packageId: string) => boolean;
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
 * The ops slice: which operations are in progress and how the last one ended, for both surfaces. Progress and
 * outcomes arrive as events whoever started the operation, so a row is busy on the surface that did not ask
 * as well. The surface that asked also gets the outcome as its response; it is counted once.
 */
export function OpsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const bus = useMessageBus();
    const [state, dispatch] = useReducer(opsReducer, INITIAL_OPS);

    useEffect(() => {
        const unsubscribes = [
            bus.onEvent('ops/progress', progress => dispatch({ type: 'progress', progress })),
            bus.onEvent('ops/completed', outcome => dispatch({ type: 'completed', outcome })),
        ];
        return () => unsubscribes.forEach(unsubscribe => unsubscribe());
    }, [bus]);

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
            return answer.result;
        } finally {
            dispatch({ type: 'settled', localId, opId });
        }
    }, [bus]);

    const view = useMemo<OpsView>(() => {
        const busy = busyPackages(state);
        return { ...state, isBusy: state.active.size > 0, isPackageBusy: (projectPath, packageId) => busy.has(busyKey(projectPath, packageId)) };
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

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import type React from 'react';
import type { BulkOutcome, OperationOutcome, OperationProgress, OperationStatus, RequestPayload, RequestResult, RequestType } from '../../../protocol';
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
    | { type: 'completed'; outcome: AnyOutcome };

export const INITIAL_OPS: OpsState = { active: new Map(), last: undefined, ended: [] };

const IN_PROGRESS: ReadonlySet<OperationStatus> = new Set<OperationStatus>(['queued', 'running', 'restoring']);
/** How many ended operation ids are remembered; an outcome is repeated within moments, not after dozens of others. */
const REMEMBERED = 32;

export function isBulkOutcome(outcome: AnyOutcome): outcome is BulkOutcome {
    return 'results' in outcome;
}

export function opsReducer(state: OpsState, action: OpsAction): OpsState {
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

    const run = useCallback(async <T extends OperationRequestType>(type: T, payload: RequestPayload<T>): Promise<RequestResult<T>> => {
        const answer = await bus.request(type, payload);
        // The response is the one terminal message the protocol promises (ADR-007). The host announces the same
        // outcome as `ops/completed`; recorded from here as well, a row cannot stay busy for want of an event.
        dispatch({ type: 'completed', outcome: answer.result as AnyOutcome });
        return answer.result;
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

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type React from 'react';
import type { SessionIntent, SessionSnapshot } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';

/** An intent the host has not answered yet. */
interface PendingIntent {
    id: number;
    intent: SessionIntent;
}

export interface SessionState {
    /** The last snapshot of the host that was applied (ADR-001): the truth. */
    committed: SessionSnapshot | undefined;
    /** What this surface asked for and has no answer to yet, oldest first. Presentation only. */
    pending: readonly PendingIntent[];
}

export type SessionAction =
    | { type: 'snapshot'; snapshot: SessionSnapshot }
    | { type: 'intent'; id: number; intent: SessionIntent }
    | { type: 'settled'; id: number };

export const INITIAL_SESSION: SessionState = { committed: undefined, pending: [] };

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
    switch (action.type) {
        case 'snapshot':
            // A snapshot of a lower or the same revision is one this surface has already moved past.
            return state.committed !== undefined && action.snapshot.rev <= state.committed.rev ? state : { ...state, committed: action.snapshot };
        case 'intent':
            return { ...state, pending: [...state.pending, { id: action.id, intent: action.intent }] };
        case 'settled':
            return { ...state, pending: state.pending.filter(entry => entry.id !== action.id) };
    }
}

/**
 * What the surface shows: the committed snapshot with every unanswered intent laid over it, oldest first. An
 * intent leaves only when its own request is answered, so the answer to an earlier intent never shows through
 * a later one (select B, then A: B's answer arrives and A stays on screen).
 */
export function presentedSession(state: SessionState): SessionSnapshot | undefined {
    if (state.committed === undefined) {
        return undefined;
    }
    return state.pending.reduce<SessionSnapshot>((shown, entry) => ({ ...shown, ...entry.intent }), state.committed);
}

export interface SessionView {
    /** What to render: committed state with this surface's unanswered changes on top. `undefined` until the first snapshot. */
    session: SessionSnapshot | undefined;
    /** What the host has committed. Requests for data follow this, never a pending value. */
    committed: SessionSnapshot | undefined;
    /** Whether a change of this surface is still unanswered. */
    isPending: boolean;
}

export interface SessionActions {
    /** Shows the change at once and asks the host for it. The host's answer replaces it; an error takes it back. */
    set: (intent: SessionIntent) => void;
}

const SessionViewContext = createContext<SessionView | null>(null);
const SessionActionsContext = createContext<SessionActions | null>(null);

/**
 * The session slice: the one selection of project, source, prerelease and restore that both surfaces share.
 * The host owns it; this surface asks for the current snapshot when it starts, follows `session/changed`, and
 * sends intents.
 */
export function SessionProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const bus = useMessageBus();
    const [state, dispatch] = useReducer(sessionReducer, INITIAL_SESSION);
    const nextIntent = useRef(0);

    useEffect(() => {
        let current = true;
        const unsubscribe = bus.onEvent('session/changed', snapshot => dispatch({ type: 'snapshot', snapshot }));
        bus.request('session/get', {}).then(answer => {
            if (current) {
                dispatch({ type: 'snapshot', snapshot: answer.result });
            }
        }, () => undefined);
        return () => {
            current = false;
            unsubscribe();
        };
    }, [bus]);

    const set = useCallback((intent: SessionIntent): void => {
        const id = ++nextIntent.current;
        dispatch({ type: 'intent', id, intent });
        bus.request('session/set', intent).then(answer => {
            // In one batch with the removal of the intent: the committed value is under it before it goes.
            dispatch({ type: 'snapshot', snapshot: answer.result });
            dispatch({ type: 'settled', id });
        }, () => dispatch({ type: 'settled', id }));
    }, [bus]);

    const view = useMemo<SessionView>(() => ({ session: presentedSession(state), committed: state.committed, isPending: state.pending.length > 0 }), [state]);
    const actions = useMemo<SessionActions>(() => ({ set }), [set]);

    return (
        <SessionActionsContext.Provider value={actions}>
            <SessionViewContext.Provider value={view}>{children}</SessionViewContext.Provider>
        </SessionActionsContext.Provider>
    );
}

export function useSession(): SessionView {
    const view = useContext(SessionViewContext);
    if (view === null) {
        throw new Error('useSession needs a SessionProvider above it');
    }
    return view;
}

/** Stable for the life of the surface: a component that only changes the session does not render when it changes. */
export function useSessionActions(): SessionActions {
    const actions = useContext(SessionActionsContext);
    if (actions === null) {
        throw new Error('useSessionActions needs a SessionProvider above it');
    }
    return actions;
}

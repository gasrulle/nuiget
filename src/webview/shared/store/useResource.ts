import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ProtocolRequestError, type ResourceKey } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';

/** Asks the host for the resource. It passes `signal` on to the bus, and returns what the bus resolved with. */
export type Requester<T> = (signal: AbortSignal) => Promise<{ result: T; generation?: number }>;

export interface ResourceState<T> {
    /** `idle`: no key. `loading`: asked, nothing to show yet. `ready`: `data` is there. `error`: the last request failed. */
    status: 'idle' | 'loading' | 'ready' | 'error';
    /** The last result that was applied for the current key. It stays while a newer one is on its way. */
    data: T | undefined;
    error: ProtocolRequestError | undefined;
    /** A request is on its way while `data` is shown: the list stays, a progress bar may appear. */
    revalidating: boolean;
    /** Asks again, for example from a "Retry" button. */
    refresh: () => void;
}

interface Stored<T> {
    /** The key the rest belongs to: a state of another key is never shown. */
    key: ResourceKey | null;
    status: ResourceState<T>['status'];
    data: T | undefined;
    error: ProtocolRequestError | undefined;
    requesting: boolean;
}

type Action<T> =
    | { type: 'requested'; key: ResourceKey }
    | { type: 'resolved'; key: ResourceKey; data: T }
    | { type: 'failed'; key: ResourceKey; error: ProtocolRequestError };

function reduce<T>(state: Stored<T>, action: Action<T>): Stored<T> {
    // What was stored for another key is gone the moment this key asks.
    const own: Stored<T> = state.key === action.key ? state : { key: action.key, status: 'loading', data: undefined, error: undefined, requesting: false };
    switch (action.type) {
        case 'requested':
            return { ...own, status: own.status === 'ready' ? 'ready' : 'loading', error: undefined, requesting: true };
        case 'resolved':
            return { key: action.key, status: 'ready', data: action.data, error: undefined, requesting: false };
        case 'failed':
            // Loading always ends. What was shown stays: an error does not blank a list.
            return { ...own, status: own.data === undefined ? 'error' : 'ready', error: action.error, requesting: false };
    }
}

const asRequestError = (error: unknown): ProtocolRequestError =>
    error instanceof ProtocolRequestError ? error : new ProtocolRequestError('failed', error instanceof Error ? error.message : String(error));

/**
 * One resource of the host, kept current (ADR-002, ADR-008). It is asked for when `key` is set or changes and
 * again whenever a `resources/invalidated` event names the key. Of several requests only the latest counts: an
 * answer to an earlier one is dropped. An answer computed for a generation below the one the latest event
 * listed for the key is out of date and is not applied either.
 */
export function useResource<T>(key: ResourceKey | null, requester: Requester<T>): ResourceState<T> {
    const bus = useMessageBus();
    const [stored, dispatch] = useReducer(reduce<T>, { key: null, status: 'idle', data: undefined, error: undefined, requesting: false });
    // The requester is usually a new closure on every render; the request uses the one of the latest render.
    const requesterRef = useRef(requester);
    requesterRef.current = requester;
    const start = useRef<() => void>(() => undefined);

    useEffect(() => {
        if (key === null) {
            return undefined;
        }
        // The requests of this key, counted: only the answer to the latest one is looked at.
        let latest = 0;
        let inFlight: AbortController | null = null;
        // The listed generation an out-of-date answer has already been asked again for.
        let askedAgainFor: number | undefined;
        const ask = (): void => {
            inFlight?.abort();
            const controller = new AbortController();
            inFlight = controller;
            const token = ++latest;
            dispatch({ type: 'requested', key });
            requesterRef.current(controller.signal).then(answer => {
                if (token !== latest) {
                    return;
                }
                const listed = bus.listedGeneration(key);
                if (answer.generation !== undefined && listed !== undefined && answer.generation < listed) {
                    // Out of date, and no newer request is on its way (it would have made this one an earlier one).
                    // Ask once more; a second out-of-date answer for the same listing ends the wait as an error.
                    if (askedAgainFor !== listed) {
                        askedAgainFor = listed;
                        ask();
                    } else {
                        dispatch({ type: 'failed', key, error: new ProtocolRequestError('failed', 'The host answered with a result that is out of date') });
                    }
                    return;
                }
                dispatch({ type: 'resolved', key, data: answer.result });
            }, (error: unknown) => {
                if (token === latest) {
                    dispatch({ type: 'failed', key, error: asRequestError(error) });
                }
            });
        };
        start.current = ask;
        ask();
        const unsubscribe = bus.onEvent('resources/invalidated', event => {
            if (event.keys.some(entry => entry.key === key)) {
                ask();
            }
        });
        return () => {
            unsubscribe();
            start.current = () => undefined;
            // Whatever is on its way is an earlier request from now on.
            latest++;
            inFlight?.abort();
        };
    }, [bus, key]);

    const refresh = useCallback(() => start.current(), []);

    if (key === null) {
        return { status: 'idle', data: undefined, error: undefined, revalidating: false, refresh };
    }
    if (stored.key !== key) {
        // The render in which the key changed: nothing of the previous key is shown, the request starts right after.
        return { status: 'loading', data: undefined, error: undefined, revalidating: false, refresh };
    }
    return { status: stored.status, data: stored.data, error: stored.error, revalidating: stored.requesting && stored.data !== undefined, refresh };
}

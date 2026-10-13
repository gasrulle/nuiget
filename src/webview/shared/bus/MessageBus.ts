import {
    makeCancel,
    makeRequest,
    parseOutbound,
    ProtocolRequestError,
    type EventPayload,
    type EventType,
    type RequestChunk,
    type RequestPayload,
    type RequestResult,
    type RequestType,
    type ResourceKey,
    type ResponseEnvelope,
} from '../../../protocol';

/** The part of `acquireVsCodeApi()` the bus needs: the way to the host. */
export interface HostPort {
    postMessage(message: unknown): void;
}

/** Where the host's messages arrive: `window` in a webview, an `EventTarget` in a test. */
export interface MessageSource {
    addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
    removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export interface RequestOptions<T extends RequestType> {
    /** Aborting it cancels the request: the host is told, and the promise rejects with `cancelled` at once. */
    signal?: AbortSignal;
    /** Intermediate chunks of this request, until its terminal response. */
    onChunk?: (chunk: RequestChunk<T>) => void;
}

/** An ok response: the result, and the generation of the resource it was computed for when the host read one (ADR-002). */
export interface Answer<T extends RequestType> {
    result: RequestResult<T>;
    generation?: number;
}

/**
 * The webview's end of the protocol (ADR-007, ADR-008). A request has exactly one outcome, and a message for a
 * request that is no longer waiting (answered, cancelled, never sent by this webview) is dropped.
 */
export interface MessageBus {
    /** Resolves with the ok response; rejects with a `ProtocolRequestError` that carries the code of an error response. */
    request<T extends RequestType>(type: T, payload: RequestPayload<T>, options?: RequestOptions<T>): Promise<Answer<T>>;
    /** Returns the function that removes the handler. */
    onEvent<T extends EventType>(type: T, handler: (payload: EventPayload<T>) => void): () => void;
    /**
     * The generation the latest `resources/invalidated` event that named `key` listed for it; `undefined` when
     * none has. A result of a lower generation is out of date. The event's own `generation` is a sequence
     * number and is not kept.
     */
    listedGeneration(key: ResourceKey): number | undefined;
    /** Stops listening and rejects what is still waiting with `disposed`. */
    dispose(): void;
}

interface Waiting {
    settle: (response: ResponseEnvelope) => void;
    fail: (error: ProtocolRequestError) => void;
    onChunk: ((chunk: unknown) => void) | undefined;
}

type Handler = (payload: never) => void;

export function createMessageBus(port: HostPort, source: MessageSource = window): MessageBus {
    const waiting = new Map<string, Waiting>();
    const handlers = new Map<EventType, Set<Handler>>();
    const listed = new Map<ResourceKey, number>();
    let disposed = false;

    const receive = (event: MessageEvent): void => {
        const message = parseOutbound(event.data);
        if (message === undefined) {
            return;
        }
        if (message.kind === 'stream') {
            waiting.get(message.id)?.onChunk?.(message.chunk);
        } else if (message.kind === 'response') {
            // Removed before it is settled: a second response for the same id finds nobody.
            const entry = waiting.get(message.id);
            waiting.delete(message.id);
            entry?.settle(message);
        } else {
            if (message.type === 'resources/invalidated') {
                // Before any handler runs, so that a handler that asks again compares with this event.
                for (const entry of (message.payload as EventPayload<'resources/invalidated'>).keys) {
                    listed.set(entry.key, entry.generation);
                }
            }
            for (const handler of [...(handlers.get(message.type) ?? [])]) {
                (handler as (payload: unknown) => void)(message.payload);
            }
        }
    };
    source.addEventListener('message', receive);

    return {
        request<T extends RequestType>(type: T, payload: RequestPayload<T>, options: RequestOptions<T> = {}): Promise<Answer<T>> {
            const { signal, onChunk } = options;
            if (disposed) {
                return Promise.reject(new ProtocolRequestError('disposed', 'The message bus is disposed'));
            }
            if (signal?.aborted) {
                return Promise.reject(new ProtocolRequestError('cancelled', 'The request was cancelled before it was sent'));
            }
            const envelope = makeRequest(type, payload);
            return new Promise<Answer<T>>((resolve, reject) => {
                const onAbort = (): void => {
                    // Forgotten first: the terminal `cancelled` response the host still sends is then dropped.
                    waiting.delete(envelope.id);
                    port.postMessage(makeCancel(envelope.id));
                    reject(new ProtocolRequestError('cancelled', 'The request was cancelled'));
                };
                waiting.set(envelope.id, {
                    onChunk: onChunk as ((chunk: unknown) => void) | undefined,
                    settle: response => {
                        signal?.removeEventListener('abort', onAbort);
                        if (response.ok) {
                            resolve({ result: response.result as RequestResult<T>, generation: response.generation });
                        } else {
                            reject(new ProtocolRequestError(response.error.code, response.error.message, response.error.details));
                        }
                    },
                    fail: error => {
                        signal?.removeEventListener('abort', onAbort);
                        reject(error);
                    },
                });
                signal?.addEventListener('abort', onAbort, { once: true });
                port.postMessage(envelope);
            });
        },

        onEvent<T extends EventType>(type: T, handler: (payload: EventPayload<T>) => void): () => void {
            const registered = handlers.get(type) ?? new Set<Handler>();
            handlers.set(type, registered);
            registered.add(handler as Handler);
            return () => {
                registered.delete(handler as Handler);
            };
        },

        listedGeneration(key: ResourceKey): number | undefined {
            return listed.get(key);
        },

        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
            source.removeEventListener('message', receive);
            handlers.clear();
            const abandoned = [...waiting.values()];
            waiting.clear();
            for (const entry of abandoned) {
                entry.fail(new ProtocolRequestError('disposed', 'The message bus is disposed'));
            }
        },
    };
}

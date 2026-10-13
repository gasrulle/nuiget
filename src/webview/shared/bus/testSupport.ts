/**
 * Test support for everything that talks to the host; nothing here is bundled.
 *
 * `createFakeHost` stands where the extension host is: it records what the webview posts and delivers what a
 * test makes the host say, as real `MessageEvent`s. The bus under test is the real one.
 */
import {
    makeError,
    makeEvent,
    makeOk,
    makeStream,
    type CancelEnvelope,
    type EventPayload,
    type EventType,
    type InboundEnvelope,
    type ProtocolErrorCode,
    type RequestChunk,
    type RequestEnvelope,
    type RequestResult,
    type RequestType,
    type ResourceKey,
} from '../../../protocol';
import { createMessageBus, type MessageBus } from './MessageBus';

export interface FakeHost {
    bus: MessageBus;
    /** Every envelope the webview posted, in order. */
    sent: InboundEnvelope[];
    /** The requests of one type, in the order they were sent. */
    requests<T extends RequestType>(type: T): Array<RequestEnvelope<T>>;
    /** The ids the webview cancelled, in order. */
    cancelled(): string[];
    /** Anything at all arrives from the host, an envelope or not. */
    deliver(message: unknown): void;
    respond<T extends RequestType>(request: RequestEnvelope<T>, result: RequestResult<T>, generation?: number): void;
    fail(request: RequestEnvelope, code: ProtocolErrorCode, message?: string): void;
    chunk<T extends RequestType>(request: RequestEnvelope<T>, chunk: RequestChunk<T>): void;
    event<T extends EventType>(type: T, payload: EventPayload<T>): void;
    /** `resources/invalidated` that lists `keys` with their generations; its own generation is a sequence number. */
    invalidate(keys: Array<[key: ResourceKey, generation: number]>, sequence?: number): void;
}

export function createFakeHost(): FakeHost {
    const target = new EventTarget();
    const sent: InboundEnvelope[] = [];
    const bus = createMessageBus({ postMessage: message => sent.push(message as InboundEnvelope) }, target as unknown as Window);
    const deliver = (message: unknown): void => {
        target.dispatchEvent(new MessageEvent('message', { data: message }));
    };
    return {
        bus,
        sent,
        requests: <T extends RequestType>(type: T) => sent.filter((message): message is RequestEnvelope<T> => message.kind === 'request' && message.type === type),
        cancelled: () => sent.filter((message): message is CancelEnvelope => message.kind === 'cancel').map(message => message.id),
        deliver,
        respond: (request, result, generation) => deliver(makeOk(request.id, request.type, result, generation)),
        fail: (request, code, message = code) => deliver(makeError(request.id, request.type, { code, message })),
        chunk: (request, chunk) => deliver(makeStream(request.id, request.type, chunk)),
        event: (type, payload) => deliver(makeEvent(type, payload)),
        invalidate: (keys, sequence = 1000) => deliver(makeEvent('resources/invalidated', {
            scope: { kind: 'workspace' },
            reason: 'manual-refresh',
            generation: sequence,
            keys: keys.map(([key, generation]) => ({ key, generation })),
        })),
    };
}

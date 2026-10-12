/**
 * Transport envelope for webview ↔ host messages.
 *
 * Exactly four shapes cross `postMessage`:
 *   request  (webview → host)   — correlated by `id`
 *   stream   (host → webview)   — intermediate chunk for a request `id`
 *   response (host → webview)   — the terminal answer for a request `id` (ok | error)
 *   event    (host → webview)   — uncorrelated notification
 */

import type { EventPayload, EventType, RequestChunk, RequestPayload, RequestResult, RequestType } from './messages';

export type ProtocolErrorCode =
    | 'cancelled'
    | 'queue-full'
    | 'invalid-request'
    | 'not-found'
    | 'unsupported'
    | 'disposed'
    | 'failed';

export interface ProtocolError {
    code: ProtocolErrorCode;
    message: string;
    details?: unknown;
}

export interface RequestEnvelope<T extends RequestType = RequestType> {
    kind: 'request';
    id: string;
    type: T;
    payload: RequestPayload<T>;
}

export interface CancelEnvelope {
    kind: 'cancel';
    /** The request id to cancel. The host still sends a terminal response (`cancelled`). */
    id: string;
}

export interface StreamEnvelope<T extends RequestType = RequestType> {
    kind: 'stream';
    id: string;
    type: T;
    chunk: RequestChunk<T>;
}

export type ResponseEnvelope<T extends RequestType = RequestType> =
    | { kind: 'response'; id: string; type: T; ok: true; result: RequestResult<T> }
    | { kind: 'response'; id: string; type: T; ok: false; error: ProtocolError };

export interface EventEnvelope<T extends EventType = EventType> {
    kind: 'event';
    type: T;
    payload: EventPayload<T>;
}

/** Everything a webview may send. */
export type InboundEnvelope = RequestEnvelope | CancelEnvelope;

/** Everything the host may send. */
export type OutboundEnvelope = StreamEnvelope | ResponseEnvelope | EventEnvelope;

let counter = 0;

/** Correlation ids are unique per webview instance; they only need to be unique within one surface. */
export function nextRequestId(prefix = 'r'): string {
    counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
    return `${prefix}${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function makeRequest<T extends RequestType>(type: T, payload: RequestPayload<T>, id = nextRequestId()): RequestEnvelope<T> {
    return { kind: 'request', id, type, payload };
}

export function makeCancel(id: string): CancelEnvelope {
    return { kind: 'cancel', id };
}

export function makeStream<T extends RequestType>(id: string, type: T, chunk: RequestChunk<T>): StreamEnvelope<T> {
    return { kind: 'stream', id, type, chunk };
}

export function makeOk<T extends RequestType>(id: string, type: T, result: RequestResult<T>): ResponseEnvelope<T> {
    return { kind: 'response', id, type, ok: true, result };
}

export function makeError<T extends RequestType>(id: string, type: T, error: ProtocolError): ResponseEnvelope<T> {
    return { kind: 'response', id, type, ok: false, error };
}

export function makeEvent<T extends EventType>(type: T, payload: EventPayload<T>): EventEnvelope<T> {
    return { kind: 'event', type, payload };
}

/** Error thrown on the webview side when a request resolves with `ok: false`. */
export class ProtocolRequestError extends Error {
    constructor(public readonly code: ProtocolErrorCode, message: string, public readonly details?: unknown) {
        super(message);
        this.name = 'ProtocolRequestError';
    }
}

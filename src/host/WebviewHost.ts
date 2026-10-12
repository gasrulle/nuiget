/**
 * Base class for both webview hosts.
 *
 * Responsibilities (ADR-007):
 *   - decode inbound envelopes with the protocol guards and dispatch to typed handlers;
 *   - guarantee exactly one terminal response per request id — handler throw → `failed`,
 *     unknown type → `unsupported`, cancel → `cancelled`, dispose → `disposed`;
 *   - forward stream chunks and events through a disposed-safe `post`.
 *
 * Hosts register handlers with `this.on('installed/get', async (payload, ctx) => …)`. A handler
 * receives a `RequestContext` with the request's `AbortSignal` and an `emit` for stream chunks.
 */

import type { Logger } from '../core/contracts';
import { redact } from '../core/logging';
import {
    makeError,
    makeEvent,
    makeOk,
    makeStream,
    parseInbound,
    ProtocolRequestError,
    type EventPayload,
    type EventType,
    type ProtocolError,
    type ProtocolErrorCode,
    type RequestChunk,
    type RequestEnvelope,
    type RequestPayload,
    type RequestResult,
    type RequestType,
    type Surface,
} from '../protocol';

export interface RequestContext<T extends RequestType> {
    id: string;
    surface: Surface;
    signal: AbortSignal;
    emit(chunk: RequestChunk<T>): void;
}

export type RequestHandler<T extends RequestType> = (payload: RequestPayload<T>, ctx: RequestContext<T>) => Promise<RequestResult<T>>;

/** Minimal webview surface the host needs; satisfied by `vscode.Webview`. */
export interface WebviewLike {
    postMessage(message: unknown): PromiseLike<boolean> | boolean | void;
}

/** Thrown by handlers to answer with a specific protocol error code. */
export class HostRequestError extends Error {
    constructor(public readonly code: ProtocolErrorCode, message: string, public readonly details?: unknown) {
        super(message);
        this.name = 'HostRequestError';
    }
}

/** Abort reasons of a request's signal: the surface was disposed, or the webview cancelled the request. */
export const ABORT_DISPOSED = 'disposed';
export const ABORT_CANCELLED = 'cancelled';

function abortCode(signal: AbortSignal): 'disposed' | 'cancelled' {
    return signal.reason === ABORT_DISPOSED ? 'disposed' : 'cancelled';
}

interface InFlight {
    type: RequestType;
    controller: AbortController;
}

export abstract class WebviewHost {
    private readonly handlers = new Map<RequestType, RequestHandler<RequestType>>();
    private readonly inFlight = new Map<string, InFlight>();
    private webview: WebviewLike | undefined;
    private disposed = false;

    protected constructor(public readonly surface: Surface, protected readonly logger?: Logger) {}

    /** Attach (or re-attach) the live webview this host posts to. */
    protected attach(webview: WebviewLike): void {
        this.webview = webview;
        this.disposed = false;
    }

    /** Detach on webview disposal: every in-flight request receives a `disposed` error. */
    protected detach(): void {
        this.disposed = true;
        this.webview = undefined;
        for (const [id, entry] of this.inFlight) {
            // The reason tells a handler that the surface went away, not that the user cancelled.
            entry.controller.abort(ABORT_DISPOSED);
            this.inFlight.delete(id);
        }
    }

    get isAttached(): boolean {
        return this.webview !== undefined && !this.disposed;
    }

    /** Register the handler for one request type (last registration wins). */
    public on<T extends RequestType>(type: T, handler: RequestHandler<T>): void {
        // Handlers are stored erased; `dispatch` only ever calls a handler with the payload of its own type.
        this.handlers.set(type, handler as unknown as RequestHandler<RequestType>);
    }

    /** Entry point for `webview.onDidReceiveMessage`. */
    protected async receive(raw: unknown): Promise<void> {
        const envelope = parseInbound(raw);
        if (!envelope) {
            this.logger?.warn(`[${this.surface}] ignoring invalid message: ${safeDescribe(raw)}`);
            return;
        }
        if (envelope.kind === 'cancel') {
            const entry = this.inFlight.get(envelope.id);
            if (entry) {
                entry.controller.abort(ABORT_CANCELLED);
            }
            return;
        }
        await this.dispatch(envelope);
    }

    private async dispatch(request: RequestEnvelope): Promise<void> {
        const handler = this.handlers.get(request.type);
        if (!handler) {
            this.respondError(request.id, request.type, { code: 'unsupported', message: `Request type ${request.type} is not supported by the ${this.surface} surface` });
            return;
        }
        const controller = new AbortController();
        this.inFlight.set(request.id, { type: request.type, controller });
        const ctx: RequestContext<RequestType> = {
            id: request.id,
            surface: this.surface,
            signal: controller.signal,
            emit: chunk => {
                if (this.inFlight.has(request.id)) {
                    this.post(makeStream(request.id, request.type, chunk));
                }
            },
        };
        try {
            const result = await handler(request.payload, ctx);
            if (controller.signal.aborted) {
                this.respondError(request.id, request.type, { code: abortCode(controller.signal), message: 'Request was cancelled' });
                return;
            }
            this.post(makeOk(request.id, request.type, result));
        } catch (error) {
            if (controller.signal.aborted) {
                this.respondError(request.id, request.type, { code: abortCode(controller.signal), message: 'Request was cancelled' });
                return;
            }
            this.respondError(request.id, request.type, toProtocolError(error));
            this.logger?.error(redact(`[${this.surface}] ${request.type} failed: ${error instanceof Error ? error.message : String(error)}`));
        } finally {
            this.inFlight.delete(request.id);
        }
    }

    private respondError(id: string, type: RequestType, error: ProtocolError): void {
        this.post(makeError(id, type, error));
    }

    /** Broadcast an uncorrelated event to this surface. */
    public sendEvent<T extends EventType>(type: T, payload: EventPayload<T>): void {
        this.post(makeEvent(type, payload));
    }

    protected post(message: unknown): void {
        if (!this.webview || this.disposed) {
            return;
        }
        try {
            void this.webview.postMessage(message);
        } catch (error) {
            this.logger?.warn(`[${this.surface}] postMessage failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /** Number of requests currently being handled (for tests and diagnostics). */
    get inFlightCount(): number {
        return this.inFlight.size;
    }
}

function toProtocolError(error: unknown): ProtocolError {
    if (error instanceof HostRequestError) {
        return { code: error.code, message: error.message, details: error.details };
    }
    if (error instanceof ProtocolRequestError) {
        return { code: error.code, message: error.message, details: error.details };
    }
    // A read that the Catalog cannot serve yet (ADR-009); told by its code, so that no host file needs the class.
    if (error instanceof Error && (error as { code?: unknown }).code === 'not-yet-available') {
        return { code: 'unsupported', message: error.message };
    }
    if (error instanceof Error) {
        return { code: 'failed', message: error.message };
    }
    return { code: 'failed', message: String(error) };
}

function safeDescribe(value: unknown): string {
    try {
        const text = JSON.stringify(value);
        return text.length > 200 ? `${text.slice(0, 200)}…` : text;
    } catch {
        return typeof value;
    }
}

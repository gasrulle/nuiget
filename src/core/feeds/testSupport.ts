/**
 * Test support for the feed clients; nothing here is bundled. `FakeTransport` answers requests from a handler and
 * records every request, so a test asserts both what a client sends and what it makes of the answer.
 */
import type { JsonResult, Transport, TransportRequest, TransportResult } from '../contracts';

export type FakeHandler = (request: TransportRequest) => TransportResult | Promise<TransportResult>;

export function ok(body: string | Buffer, headers: Record<string, string> = {}, status = 200): TransportResult {
    return { ok: true, status, headers, body: Buffer.isBuffer(body) ? body : Buffer.from(body), url: '' };
}

export function json(data: unknown, status = 200): TransportResult {
    return ok(JSON.stringify(data), { 'content-type': 'application/json' }, status);
}

export function fail(code: Extract<TransportResult, { ok: false }>['code'], status?: number, message = code): TransportResult {
    return status === undefined ? { ok: false, code, message } : { ok: false, code, message, status };
}

export class FakeTransport implements Transport {
    readonly requests: TransportRequest[] = [];

    constructor(private readonly handler: FakeHandler) {}

    async fetch(request: TransportRequest): Promise<TransportResult> {
        this.requests.push(request);
        const result = await this.handler(request);
        return result.ok ? { ...result, url: request.url } : result;
    }

    async fetchJson<T>(request: TransportRequest): Promise<JsonResult<T>> {
        const result = await this.fetch(request);
        if (!result.ok) {
            return result;
        }
        try {
            return { ok: true, status: result.status, data: JSON.parse(result.body.toString('utf8')) as T, url: result.url };
        } catch {
            return { ok: false, code: 'invalid-json', status: result.status, message: 'invalid json' };
        }
    }

    head(request: Omit<TransportRequest, 'method'>): Promise<TransportResult> {
        return this.fetch({ ...request, method: 'HEAD' });
    }

    dispose(): void {
        // Nothing to release.
    }

    urls(): string[] {
        return this.requests.map(request => request.url);
    }
}

export const silentLogger = { trace: () => undefined, debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

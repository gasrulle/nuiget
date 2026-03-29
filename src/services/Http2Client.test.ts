import { EventEmitter } from 'events';
import * as http from 'http';
import * as http2 from 'http2';
import * as https from 'https';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Http2Client, isSafeRedirectTarget } from '../services/Http2Client';

// Mock Node.js network modules to avoid real connections
vi.mock('http', () => ({
    request: vi.fn(),
}));

vi.mock('https', () => {
    class AgentMock {
        destroy = vi.fn();
        constructor() { }
    }
    return {
        request: vi.fn(),
        Agent: AgentMock,
    };
});

vi.mock('http2', () => ({
    connect: vi.fn(() => {
        const session = {
            closed: false,
            destroyed: false,
            close: vi.fn(),
            destroy: vi.fn(),
            request: vi.fn(),
            on: vi.fn(),
            setTimeout: vi.fn(),
        };
        return session;
    }),
    constants: {
        HTTP2_HEADER_PATH: ':path',
        HTTP2_HEADER_STATUS: ':status',
        HTTP2_HEADER_METHOD: ':method',
        HTTP2_HEADER_AUTHORIZATION: 'authorization',
        HTTP2_HEADER_ACCEPT: 'accept',
        HTTP2_HEADER_CONTENT_LENGTH: 'content-length',
    },
    sensitiveHeaders: Symbol('sensitiveHeaders'),
}));

// ──────────────────────────────────────────────
// Helper: create a mock HTTP/1.1 IncomingMessage (response)
// Data+end events are scheduled via setTimeout(0) so they fire AFTER
// process.nextTick callbacks (where the response callback registers handlers)
// ──────────────────────────────────────────────
function createMockHttp1Response(statusCode: number, body: string, headers: Record<string, string> = {}): EventEmitter & { statusCode: number; headers: Record<string, string> } {
    const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
    res.statusCode = statusCode;
    res.headers = headers;
    // Use setTimeout(0) — runs after nextTick, giving the callback time to register listeners
    setTimeout(() => {
        if (body) {
            res.emit('data', body);
        }
        res.emit('end');
    }, 0);
    return res;
}

// Helper: create a mock HTTP/1.1 ClientRequest
function createMockHttp1Request(): EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
    const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    req.destroy = vi.fn();
    req.end = vi.fn();
    return req;
}

// Helper: create a mock HTTP/2 stream
function createMockHttp2Stream(): EventEmitter & { close: ReturnType<typeof vi.fn>; setEncoding: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; setTimeout: ReturnType<typeof vi.fn> } {
    const stream = new EventEmitter() as EventEmitter & { close: ReturnType<typeof vi.fn>; setEncoding: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; setTimeout: ReturnType<typeof vi.fn> };
    stream.close = vi.fn();
    stream.setEncoding = vi.fn();
    stream.end = vi.fn();
    stream.setTimeout = vi.fn();
    return stream;
}

// ──────────────────────────────────────────────
// isSafeRedirectTarget — Security-critical pure function
// ──────────────────────────────────────────────
describe('isSafeRedirectTarget', () => {
    const ORIG = 'https://api.nuget.org/v3/index.json';

    describe('protocol validation', () => {
        it('allows HTTPS → HTTPS redirect', () => {
            expect(isSafeRedirectTarget('https://other.nuget.org/v3/index.json', ORIG)).toBe(true);
        });

        it('blocks HTTPS → HTTP downgrade', () => {
            expect(isSafeRedirectTarget('http://api.nuget.org/v3/index.json', ORIG)).toBe(false);
        });

        it('allows HTTP → HTTPS upgrade', () => {
            expect(isSafeRedirectTarget('https://api.nuget.org/v3/index.json', 'http://api.nuget.org/v3/index.json')).toBe(true);
        });

        it('allows HTTP → HTTP (no downgrade)', () => {
            expect(isSafeRedirectTarget('http://other.example.com/', 'http://example.com/')).toBe(true);
        });

        it('blocks ftp protocol', () => {
            expect(isSafeRedirectTarget('ftp://evil.com/file', ORIG)).toBe(false);
        });

        it('blocks file protocol', () => {
            expect(isSafeRedirectTarget('file:///etc/passwd', ORIG)).toBe(false);
        });

        it('blocks javascript protocol', () => {
            expect(isSafeRedirectTarget('javascript:alert(1)', ORIG)).toBe(false);
        });

        it('blocks data protocol', () => {
            expect(isSafeRedirectTarget('data:text/html,<h1>hi</h1>', ORIG)).toBe(false);
        });
    });

    describe('loopback detection', () => {
        it('blocks localhost', () => {
            expect(isSafeRedirectTarget('https://localhost/api', ORIG)).toBe(false);
        });

        it('blocks 127.0.0.1', () => {
            expect(isSafeRedirectTarget('https://127.0.0.1/api', ORIG)).toBe(false);
        });

        it('blocks ::1', () => {
            expect(isSafeRedirectTarget('https://[::1]/api', ORIG)).toBe(false);
        });
    });

    describe('private IPv4 ranges', () => {
        it('blocks 10.x.x.x (10.0.0.0/8)', () => {
            expect(isSafeRedirectTarget('https://10.0.0.1/', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://10.255.255.255/', ORIG)).toBe(false);
        });

        it('blocks 172.16-31.x.x (172.16.0.0/12)', () => {
            expect(isSafeRedirectTarget('https://172.16.0.1/', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://172.31.255.255/', ORIG)).toBe(false);
        });

        it('allows 172.15.x.x (not private)', () => {
            expect(isSafeRedirectTarget('https://172.15.0.1/', ORIG)).toBe(true);
        });

        it('allows 172.32.x.x (not private)', () => {
            expect(isSafeRedirectTarget('https://172.32.0.1/', ORIG)).toBe(true);
        });

        it('blocks 192.168.x.x (192.168.0.0/16)', () => {
            expect(isSafeRedirectTarget('https://192.168.0.1/', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://192.168.255.255/', ORIG)).toBe(false);
        });

        it('blocks 169.254.x.x link-local / cloud metadata', () => {
            expect(isSafeRedirectTarget('https://169.254.169.254/', ORIG)).toBe(false);
        });

        it('blocks 0.x.x.x (0.0.0.0/8)', () => {
            expect(isSafeRedirectTarget('https://0.0.0.0/', ORIG)).toBe(false);
        });
    });

    describe('private IPv6 ranges', () => {
        it('blocks fc00::/7 (unique local)', () => {
            expect(isSafeRedirectTarget('https://[fc00::1]/', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://[fd12::1]/', ORIG)).toBe(false);
        });

        it('blocks fe80::/10 (link-local)', () => {
            expect(isSafeRedirectTarget('https://[fe80::1]/', ORIG)).toBe(false);
        });

        it('blocks :: (all zeroes)', () => {
            expect(isSafeRedirectTarget('https://[::]/', ORIG)).toBe(false);
        });
    });

    describe('valid public URLs', () => {
        it('allows valid public HTTPS URLs', () => {
            expect(isSafeRedirectTarget('https://www.nuget.org/api/v2/', ORIG)).toBe(true);
            expect(isSafeRedirectTarget('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json', ORIG)).toBe(true);
        });

        it('allows URLs with ports', () => {
            expect(isSafeRedirectTarget('https://api.example.com:8443/v3/', ORIG)).toBe(true);
        });

        it('allows relative redirects resolved against original', () => {
            expect(isSafeRedirectTarget('/v3/registration/newtonsoft.json/index.json', ORIG)).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('returns false for malformed URLs', () => {
            expect(isSafeRedirectTarget('not-a-url', 'also-not-a-url')).toBe(false);
        });

        it('resolves empty string against original URL (safe)', () => {
            // new URL('', 'https://api.nuget.org') resolves to the original URL
            expect(isSafeRedirectTarget('', ORIG)).toBe(true);
        });
    });
});

// ──────────────────────────────────────────────
// Http2Client singleton pattern
// ──────────────────────────────────────────────
describe('Http2Client', () => {
    afterEach(() => {
        Http2Client.resetInstance();
    });

    describe('singleton pattern', () => {
        it('getInstance returns same instance', () => {
            const a = Http2Client.getInstance();
            const b = Http2Client.getInstance();
            expect(a).toBe(b);
        });

        it('resetInstance creates new instance on next call', () => {
            const first = Http2Client.getInstance();
            Http2Client.resetInstance();
            const second = Http2Client.getInstance();
            expect(first).not.toBe(second);
        });

        it('resetInstance is safe to call multiple times', () => {
            Http2Client.resetInstance();
            Http2Client.resetInstance();
            const instance = Http2Client.getInstance();
            expect(instance).toBeDefined();
        });
    });

    describe('closeAll', () => {
        it('can be called without error', () => {
            const client = Http2Client.getInstance();
            expect(() => client.closeAll()).not.toThrow();
        });

        it('can be called multiple times', () => {
            const client = Http2Client.getInstance();
            client.closeAll();
            client.closeAll();
            // No error thrown
        });
    });

    describe('public API existence', () => {
        it('has fetchJson method', () => {
            const client = Http2Client.getInstance();
            expect(typeof client.fetchJson).toBe('function');
        });

        it('has fetchJsonWithDetails method', () => {
            const client = Http2Client.getInstance();
            expect(typeof client.fetchJsonWithDetails).toBe('function');
        });

        it('has headRequest method', () => {
            const client = Http2Client.getInstance();
            expect(typeof client.headRequest).toBe('function');
        });

        it('has headRequestContentLength method', () => {
            const client = Http2Client.getInstance();
            expect(typeof client.headRequestContentLength).toBe('function');
        });
    });

    // ──────────────────────────────────────────────
    // fetchJson — HTTP/1.1 path (non-nuget.org URLs)
    // ──────────────────────────────────────────────
    describe('fetchJson (HTTP/1.1)', () => {
        it('returns parsed JSON on 200', async () => {
            const payload = { name: 'Newtonsoft.Json', version: '13.0.3' };
            const res = createMockHttp1Response(200, JSON.stringify(payload));
            const req = createMockHttp1Request();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJson<{ name: string; version: string }>('https://custom.source.com/v3/index.json');
            expect(result).toEqual(payload);
        });

        it('returns null on non-200 status', async () => {
            const res = createMockHttp1Response(404, '');
            const req = createMockHttp1Request();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJson('https://custom.source.com/notfound');
            expect(result).toBeNull();
        });

        it('returns null on invalid JSON', async () => {
            const res = createMockHttp1Response(200, 'not valid json{{{');
            const req = createMockHttp1Request();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJson('https://custom.source.com/bad-json');
            expect(result).toBeNull();
        });

        it('returns null on network error', async () => {
            const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
            req.destroy = vi.fn();
            req.end = vi.fn();

            vi.mocked(https.request).mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJson('https://custom.source.com/fail');
            expect(result).toBeNull();
        });

        it('returns null on timeout', async () => {
            const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
            req.destroy = vi.fn();
            req.end = vi.fn();

            vi.mocked(https.request).mockImplementation(() => {
                process.nextTick(() => req.emit('timeout'));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJson('https://custom.source.com/slow');
            expect(result).toBeNull();
        });

        it('returns null when max redirects exceeded', async () => {
            const client = Http2Client.getInstance();
            const result = await client.fetchJson('https://custom.source.com/loop', undefined, 0);
            expect(result).toBeNull();
        });

        it('follows safe redirects', async () => {
            const payload = { id: 'pkg' };
            let callCount = 0;

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                callCount++;
                if (callCount === 1) {
                    // First request: redirect
                    const redirectRes = createMockHttp1Response(302, '', { location: 'https://cdn.example.com/v3/data.json' });
                    process.nextTick(() => (cb as (r: unknown) => void)(redirectRes));
                } else {
                    // Second request: actual data
                    const dataRes = createMockHttp1Response(200, JSON.stringify(payload));
                    process.nextTick(() => (cb as (r: unknown) => void)(dataRes));
                }
                const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
                req.destroy = vi.fn();
                req.end = vi.fn();
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJson('https://custom.source.com/redirect');
            expect(result).toEqual(payload);
        });

        it('blocks unsafe redirects (SSRF)', async () => {
            const res = createMockHttp1Response(302, '', { location: 'https://127.0.0.1/internal' });
            const req = createMockHttp1Request();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJson('https://custom.source.com/evil-redirect');
            expect(result).toBeNull();
        });

        it('sends Authorization header when provided', async () => {
            const payload = { data: true };
            const res = createMockHttp1Response(200, JSON.stringify(payload));
            const req = createMockHttp1Request();
            let capturedOpts: https.RequestOptions | undefined;

            vi.mocked(https.request).mockImplementation((opts: unknown, cb: unknown) => {
                capturedOpts = opts as https.RequestOptions;
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            await client.fetchJson('https://custom.source.com/auth', 'Basic dXNlcjpwYXNz');
            expect((capturedOpts?.headers as Record<string, string>)['Authorization']).toBe('Basic dXNlcjpwYXNz');
        });

        it('uses http module for http:// URLs', async () => {
            const payload = { data: 'http' };
            const res = createMockHttp1Response(200, JSON.stringify(payload));
            const req = createMockHttp1Request();

            vi.mocked(http.request as unknown as ReturnType<typeof vi.fn>).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJson('http://insecure.source.com/v3/index.json');
            expect(result).toEqual(payload);
            expect(http.request).toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // fetchJsonWithDetails — HTTP/1.1 path
    // ──────────────────────────────────────────────
    describe('fetchJsonWithDetails (HTTP/1.1)', () => {
        it('returns data on 200', async () => {
            const payload = { count: 42 };
            const res = createMockHttp1Response(200, JSON.stringify(payload));
            const req = createMockHttp1Request();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJsonWithDetails<{ count: number }>('https://custom.source.com/details');
            expect(result.data).toEqual(payload);
            expect(result.error).toBeUndefined();
        });

        it('returns http-error on non-200 status', async () => {
            const res = createMockHttp1Response(500, '');
            const req = createMockHttp1Request();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJsonWithDetails('https://custom.source.com/fail');
            expect(result.data).toBeNull();
            expect(result.error?.type).toBe('http-error');
            expect(result.error?.statusCode).toBe(500);
        });

        it('returns parse-error on invalid JSON', async () => {
            const res = createMockHttp1Response(200, '<<invalid>>');
            const req = createMockHttp1Request();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJsonWithDetails('https://custom.source.com/bad');
            expect(result.data).toBeNull();
            expect(result.error?.type).toBe('parse-error');
        });

        it('returns network error on timeout', async () => {
            const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
            req.destroy = vi.fn();
            req.end = vi.fn();

            vi.mocked(https.request).mockImplementation(() => {
                process.nextTick(() => req.emit('timeout'));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJsonWithDetails('https://custom.source.com/timeout');
            expect(result.data).toBeNull();
            expect(result.error?.type).toBe('network');
            expect(result.error?.message).toContain('timed out');
        });

        it('returns network error on connection failure', async () => {
            const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
            req.destroy = vi.fn();
            req.end = vi.fn();

            vi.mocked(https.request).mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('ECONNRESET')));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJsonWithDetails('https://custom.source.com/err');
            expect(result.data).toBeNull();
            expect(result.error?.type).toBe('network');
            expect(result.error?.message).toBe('ECONNRESET');
        });

        it('returns too many redirects error', async () => {
            const client = Http2Client.getInstance();
            const result = await client.fetchJsonWithDetails('https://custom.source.com/loop', undefined, 0);
            expect(result.data).toBeNull();
            expect(result.error?.type).toBe('network');
            expect(result.error?.message).toContain('Too many redirects');
        });

        it('blocks unsafe redirect and returns error', async () => {
            const res = createMockHttp1Response(301, '', { location: 'https://10.0.0.1/internal' });
            const req = createMockHttp1Request();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJsonWithDetails('https://custom.source.com/ssrf');
            expect(result.data).toBeNull();
            expect(result.error?.type).toBe('network');
            expect(result.error?.message).toContain('disallowed');
        });

        it('strips auth header on cross-origin redirect', async () => {
            let callCount = 0;
            let secondOpts: https.RequestOptions | undefined;

            vi.mocked(https.request).mockImplementation((opts: unknown, cb: unknown) => {
                callCount++;
                if (callCount === 1) {
                    const redirectRes = createMockHttp1Response(302, '', { location: 'https://other-cdn.example.com/data.json' });
                    process.nextTick(() => (cb as (r: unknown) => void)(redirectRes));
                } else {
                    secondOpts = opts as https.RequestOptions;
                    const dataRes = createMockHttp1Response(200, JSON.stringify({ ok: true }));
                    process.nextTick(() => (cb as (r: unknown) => void)(dataRes));
                }
                const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
                req.destroy = vi.fn();
                req.end = vi.fn();
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            await client.fetchJsonWithDetails('https://custom.source.com/cross-origin', 'Basic secret');
            // Auth header should NOT be forwarded to different origin
            expect((secondOpts?.headers as Record<string, string> | undefined)?.['Authorization']).toBeUndefined();
        });
    });

    // ──────────────────────────────────────────────
    // fetchJson — HTTP/2 path (nuget.org URLs)
    // ──────────────────────────────────────────────
    describe('fetchJson (HTTP/2)', () => {
        it('returns parsed JSON on 200 via HTTP/2', async () => {
            const payload = { '@id': 'https://api.nuget.org/v3/index.json' };
            const stream = createMockHttp2Stream();

            const mockSession = {
                closed: false, destroyed: false,
                close: vi.fn(), destroy: vi.fn(),
                request: vi.fn(() => stream),
                on: vi.fn(), setTimeout: vi.fn(),
            };
            vi.mocked(http2.connect).mockReturnValue(mockSession as unknown as http2.ClientHttp2Session);

            // Simulate response + data + end on next tick
            process.nextTick(() => {
                stream.emit('response', { ':status': 200 });
                stream.emit('data', JSON.stringify(payload));
                stream.emit('end');
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJson('https://api.nuget.org/v3/index.json');
            expect(result).toEqual(payload);
        });

        it('returns null on non-200 HTTP/2 response', async () => {
            const stream = createMockHttp2Stream();

            const mockSession = {
                closed: false, destroyed: false,
                close: vi.fn(), destroy: vi.fn(),
                request: vi.fn(() => stream),
                on: vi.fn(), setTimeout: vi.fn(),
            };
            vi.mocked(http2.connect).mockReturnValue(mockSession as unknown as http2.ClientHttp2Session);

            process.nextTick(() => {
                stream.emit('response', { ':status': 404 });
                stream.emit('end');
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJson('https://api.nuget.org/v3/notfound');
            expect(result).toBeNull();
        });

        it('returns null on HTTP/2 stream error', async () => {
            const stream = createMockHttp2Stream();

            const mockSession = {
                closed: false, destroyed: false,
                close: vi.fn(), destroy: vi.fn(),
                request: vi.fn(() => stream),
                on: vi.fn(), setTimeout: vi.fn(),
            };
            vi.mocked(http2.connect).mockReturnValue(mockSession as unknown as http2.ClientHttp2Session);

            process.nextTick(() => {
                stream.emit('error', new Error('stream error'));
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJson('https://api.nuget.org/v3/error');
            expect(result).toBeNull();
        });

        it('returns null on max redirects exceeded (HTTP/2)', async () => {
            const client = Http2Client.getInstance();
            const result = await client.fetchJson('https://api.nuget.org/v3/loop', undefined, 0);
            expect(result).toBeNull();
        });
    });

    // ──────────────────────────────────────────────
    // fetchJsonWithDetails — HTTP/2 path
    // ──────────────────────────────────────────────
    describe('fetchJsonWithDetails (HTTP/2)', () => {
        it('returns data on 200 via HTTP/2', async () => {
            const payload = { resources: [] };
            const stream = createMockHttp2Stream();

            const mockSession = {
                closed: false, destroyed: false,
                close: vi.fn(), destroy: vi.fn(),
                request: vi.fn(() => stream),
                on: vi.fn(), setTimeout: vi.fn(),
            };
            vi.mocked(http2.connect).mockReturnValue(mockSession as unknown as http2.ClientHttp2Session);

            process.nextTick(() => {
                stream.emit('response', { ':status': 200 });
                stream.emit('data', JSON.stringify(payload));
                stream.emit('end');
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJsonWithDetails('https://api.nuget.org/v3/details');
            expect(result.data).toEqual(payload);
            expect(result.error).toBeUndefined();
        });

        it('returns http-error on non-200 HTTP/2', async () => {
            const stream = createMockHttp2Stream();

            const mockSession = {
                closed: false, destroyed: false,
                close: vi.fn(), destroy: vi.fn(),
                request: vi.fn(() => stream),
                on: vi.fn(), setTimeout: vi.fn(),
            };
            vi.mocked(http2.connect).mockReturnValue(mockSession as unknown as http2.ClientHttp2Session);

            process.nextTick(() => {
                stream.emit('response', { ':status': 503 });
                stream.emit('end');
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJsonWithDetails('https://api.nuget.org/v3/503');
            expect(result.data).toBeNull();
            expect(result.error?.type).toBe('http-error');
            expect(result.error?.statusCode).toBe(503);
        });

        it('returns parse-error on bad JSON via HTTP/2', async () => {
            const stream = createMockHttp2Stream();

            const mockSession = {
                closed: false, destroyed: false,
                close: vi.fn(), destroy: vi.fn(),
                request: vi.fn(() => stream),
                on: vi.fn(), setTimeout: vi.fn(),
            };
            vi.mocked(http2.connect).mockReturnValue(mockSession as unknown as http2.ClientHttp2Session);

            process.nextTick(() => {
                stream.emit('response', { ':status': 200 });
                stream.emit('data', '{broken json');
                stream.emit('end');
            });

            const client = Http2Client.getInstance();
            const result = await client.fetchJsonWithDetails('https://api.nuget.org/v3/bad');
            expect(result.data).toBeNull();
            expect(result.error?.type).toBe('parse-error');
        });

        it('returns network error on too many redirects (HTTP/2)', async () => {
            const client = Http2Client.getInstance();
            const result = await client.fetchJsonWithDetails('https://api.nuget.org/v3/loop', undefined, 0);
            expect(result.data).toBeNull();
            expect(result.error?.type).toBe('network');
            expect(result.error?.message).toContain('Too many redirects');
        });
    });

    // ──────────────────────────────────────────────
    // headRequest
    // ──────────────────────────────────────────────
    describe('headRequest (HTTP/1.1)', () => {
        it('returns status code on success', async () => {
            const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
            res.statusCode = 200;
            res.headers = {};
            const req = createMockHttp1Request();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const status = await client.headRequest('https://custom.source.com/icon.png');
            expect(status).toBe(200);
        });

        it('returns 404 for not found', async () => {
            const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
            res.statusCode = 404;
            res.headers = {};
            const req = createMockHttp1Request();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const status = await client.headRequest('https://custom.source.com/missing.png');
            expect(status).toBe(404);
        });

        it('returns 0 on error', async () => {
            const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
            req.destroy = vi.fn();
            req.end = vi.fn();

            vi.mocked(https.request).mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('fail')));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const status = await client.headRequest('https://custom.source.com/error');
            expect(status).toBe(0);
        });
    });

    // ──────────────────────────────────────────────
    // headRequestContentLength
    // ──────────────────────────────────────────────
    describe('headRequestContentLength', () => {
        it('returns content-length on 200', async () => {
            const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
            res.statusCode = 200;
            res.headers = { 'content-length': '12345' };
            const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; setTimeout: (ms: number, cb: () => void) => void };
            req.destroy = vi.fn();
            req.end = vi.fn();
            req.setTimeout = vi.fn();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const length = await client.headRequestContentLength('https://custom.source.com/package.nupkg');
            expect(length).toBe(12345);
        });

        it('returns -1 when no content-length header', async () => {
            const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
            res.statusCode = 200;
            res.headers = {};
            const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; setTimeout: (ms: number, cb: () => void) => void };
            req.destroy = vi.fn();
            req.end = vi.fn();
            req.setTimeout = vi.fn();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const length = await client.headRequestContentLength('https://custom.source.com/no-cl');
            expect(length).toBe(-1);
        });

        it('returns -1 on non-200 status', async () => {
            const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
            res.statusCode = 404;
            res.headers = { 'content-length': '0' };
            const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; setTimeout: (ms: number, cb: () => void) => void };
            req.destroy = vi.fn();
            req.end = vi.fn();
            req.setTimeout = vi.fn();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const length = await client.headRequestContentLength('https://custom.source.com/gone');
            expect(length).toBe(-1);
        });

        it('returns -1 on error', async () => {
            const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; setTimeout: (ms: number, cb: () => void) => void };
            req.destroy = vi.fn();
            req.end = vi.fn();
            req.setTimeout = vi.fn();

            vi.mocked(https.request).mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('ENOTFOUND')));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            const length = await client.headRequestContentLength('https://custom.source.com/err');
            expect(length).toBe(-1);
        });

        it('sends auth header when provided', async () => {
            const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
            res.statusCode = 200;
            res.headers = { 'content-length': '999' };
            const req = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; setTimeout: (ms: number, cb: () => void) => void };
            req.destroy = vi.fn();
            req.end = vi.fn();
            req.setTimeout = vi.fn();
            let capturedOpts: Record<string, unknown> | undefined;

            vi.mocked(https.request).mockImplementation((opts: unknown, cb: unknown) => {
                capturedOpts = opts as Record<string, unknown>;
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            await client.headRequestContentLength('https://custom.source.com/auth', 'Bearer token123');
            expect((capturedOpts?.headers as Record<string, string>)['Authorization']).toBe('Bearer token123');
        });
    });

    // ──────────────────────────────────────────────
    // shouldUseHttp2 routing (tested via fetchJson)
    // ──────────────────────────────────────────────
    describe('HTTP/2 vs HTTP/1.1 routing', () => {
        it('uses HTTP/2 for api.nuget.org', async () => {
            const stream = createMockHttp2Stream();
            const mockSession = {
                closed: false, destroyed: false,
                close: vi.fn(), destroy: vi.fn(),
                request: vi.fn(() => stream),
                on: vi.fn(), setTimeout: vi.fn(),
            };
            vi.mocked(http2.connect).mockReturnValue(mockSession as unknown as http2.ClientHttp2Session);

            process.nextTick(() => {
                stream.emit('response', { ':status': 200 });
                stream.emit('data', '{"http2":true}');
                stream.emit('end');
            });

            const client = Http2Client.getInstance();
            await client.fetchJson('https://api.nuget.org/v3/something');
            expect(http2.connect).toHaveBeenCalled();
        });

        it('uses HTTP/1.1 for non-nuget.org URLs', async () => {
            const payload = { http1: true };
            const res = createMockHttp1Response(200, JSON.stringify(payload));
            const req = createMockHttp1Request();

            vi.mocked(https.request).mockImplementation((_opts: unknown, cb: unknown) => {
                process.nextTick(() => (cb as (r: unknown) => void)(res));
                return req as unknown as http.ClientRequest;
            });

            const client = Http2Client.getInstance();
            await client.fetchJson('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json');
            expect(https.request).toHaveBeenCalled();
        });
    });
});

import * as http from 'http';
import * as http2 from 'http2';
import type { AddressInfo } from 'net';
import * as zlib from 'zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeTransport, type NodeTransportOptions, type RequestFunction } from './Transport';

type Handler = (request: http.IncomingMessage, response: http.ServerResponse) => void;

const servers: Array<http.Server | http2.Http2Server> = [];
const transports: NodeTransport[] = [];

/** A local HTTP/1.1 server; its origin is `http://127.0.0.1:<port>`. */
async function serve(handler: Handler): Promise<{ origin: string; server: http.Server; hits: () => number }> {
    let hits = 0;
    const server = http.createServer((request, response) => {
        hits++;
        handler(request, response);
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, hits: () => hits };
}

/** A local cleartext HTTP/2 server answering `h2` for every path but `/refuse`, which it resets before answering. */
async function serveH2(): Promise<{ url: string; streams: () => number }> {
    let streams = 0;
    const server = http2.createServer();
    server.on('stream', (stream, headers) => {
        streams++;
        if (headers[':path'] === '/refuse') {
            // Closing with an error code emits `error` on the server's own stream; that is the test's intent.
            stream.on('error', () => undefined);
            stream.close(http2.constants.NGHTTP2_REFUSED_STREAM);
            return;
        }
        stream.respond({ ':status': 200, 'content-type': 'text/plain' });
        stream.end('h2');
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, streams: () => streams };
}

function transport(options: Partial<NodeTransportOptions> = {}): NodeTransport {
    const created = new NodeTransport({ proxy: { isConfigured: () => false }, http2Origins: [], allowLoopback: true, ...options });
    transports.push(created);
    return created;
}

const text = (result: Awaited<ReturnType<NodeTransport['fetch']>>): string => (result.ok ? result.body.toString('utf8') : `failure:${result.code}`);

/** A port nothing listens on. */
async function closedPort(): Promise<string> {
    const { origin, server } = await serve(() => undefined);
    await new Promise<void>(resolve => server.close(() => resolve()));
    servers.splice(servers.indexOf(server), 1);
    return origin;
}

afterEach(async () => {
    for (const created of transports.splice(0)) {
        created.dispose();
    }
    await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
        if ('closeAllConnections' in server) {
            server.closeAllConnections();
        }
        server.close(() => resolve());
    })));
});

describe('NodeTransport: requests and responses', () => {
    it('GET returns the status, the headers, the body and the final URL', async () => {
        const { origin } = await serve((request, response) => {
            response.setHeader('x-path', request.url ?? '');
            response.end('hello');
        });
        const result = await transport().fetch({ url: `${origin}/v3/index.json?x=1` });
        expect(result).toMatchObject({ ok: true, status: 200, url: `${origin}/v3/index.json?x=1` });
        expect(text(result)).toBe('hello');
        expect(result.ok && result.headers['x-path']).toBe('/v3/index.json?x=1');
    });

    it('HEAD returns the status and no body, and does not read one', async () => {
        const methods: string[] = [];
        const { origin } = await serve((request, response) => {
            methods.push(request.method ?? '');
            response.setHeader('content-length', '5');
            response.end();
        });
        const result = await transport().head({ url: `${origin}/package.nupkg` });
        expect(result).toMatchObject({ ok: true, status: 200 });
        expect(result.ok && result.body.length).toBe(0);
        expect(methods).toEqual(['HEAD']);
    });

    it('fetchJson asks for JSON, strips a byte order mark and parses', async () => {
        let accept: string | undefined;
        const { origin } = await serve((request, response) => {
            accept = request.headers.accept;
            response.end('﻿{"version":"3.0.0"}');
        });
        const result = await transport().fetchJson<{ version: string }>({ url: `${origin}/index.json` });
        expect(result).toEqual({ ok: true, status: 200, data: { version: '3.0.0' }, url: `${origin}/index.json` });
        expect(accept).toBe('application/json');
    });

    it('fetchJson reports a body that is no JSON as invalid-json with the status', async () => {
        const { origin } = await serve((_request, response) => response.end('<html>'));
        expect(await transport().fetchJson({ url: `${origin}/index.json` })).toMatchObject({ ok: false, code: 'invalid-json', status: 200 });
    });

    it('sends a user agent of its own unless the caller gives one', async () => {
        const agents: Array<string | undefined> = [];
        const { origin } = await serve((request, response) => {
            agents.push(request.headers['user-agent']);
            response.end();
        });
        await transport().fetch({ url: origin });
        await transport().fetch({ url: origin, headers: { 'User-Agent': 'custom/1.0' } });
        expect(agents).toEqual(['nUIget', 'custom/1.0']);
    });

    it('an error status is http-error with the status, and its body is not read (error-body policy)', async () => {
        let written = 0;
        let closed = false;
        const { origin } = await serve((_request, response) => {
            response.on('close', () => {
                closed = true;
            });
            response.writeHead(500, { 'content-type': 'text/plain' });
            // A body far beyond the size cap: it must neither be read nor count against the cap.
            const chunk = Buffer.alloc(64 * 1024, 'x');
            const pump = (): void => {
                while (written < 50 * 1024 * 1024 && response.write(chunk)) {
                    written += chunk.length;
                }
                if (written < 50 * 1024 * 1024) {
                    response.once('drain', pump);
                }
            };
            pump();
        });
        const result = await transport().fetch({ url: origin, maxBytes: 1024 });
        expect(result).toMatchObject({ ok: false, code: 'http-error', status: 500, message: 'HTTP 500' });
        // The transport hangs up at once instead of draining what the server keeps sending.
        await vi.waitFor(() => expect(closed).toBe(true), { timeout: 2_000 });
        expect(written).toBeLessThan(50 * 1024 * 1024);
    });

    it('a refused connection is a network failure that says so', async () => {
        const result = await transport().fetch({ url: `${await closedPort()}/index.json` });
        expect(result).toMatchObject({ ok: false, code: 'network' });
        expect(!result.ok && result.message).toMatch(/refused/i);
    });

    it('an invalid URL and a scheme other than http and https are refused without a request', async () => {
        expect(await transport().fetch({ url: 'not a url' })).toMatchObject({ ok: false, code: 'network' });
        expect(await transport().fetch({ url: 'file:///etc/passwd' })).toMatchObject({ ok: false, code: 'network', message: 'Unsupported URL scheme: file:' });
    });
});

describe('NodeTransport: size and encoding', () => {
    it('a declared length over the cap is too-large before the body is read', async () => {
        const { origin } = await serve((_request, response) => {
            response.setHeader('content-length', '2048');
            response.end(Buffer.alloc(2048));
        });
        expect(await transport().fetch({ url: origin, maxBytes: 1024 })).toMatchObject({ ok: false, code: 'too-large' });
    });

    it('a streamed body without a length is cut at the cap', async () => {
        const { origin } = await serve((_request, response) => {
            response.write(Buffer.alloc(800));
            response.end(Buffer.alloc(800));
        });
        expect(await transport().fetch({ url: origin, maxBytes: 1024 })).toMatchObject({ ok: false, code: 'too-large' });
        expect(await transport().fetch({ url: origin, maxBytes: 4096 })).toMatchObject({ ok: true });
    });

    it('asks for and decodes gzip and deflate when compressed responses are accepted', async () => {
        const encodings: Array<string | undefined> = [];
        const { origin } = await serve((request, response) => {
            encodings.push(request.headers['accept-encoding']);
            const deflate = request.url === '/deflate';
            response.setHeader('content-encoding', deflate ? 'deflate' : 'gzip');
            response.end((deflate ? zlib.deflateSync : zlib.gzipSync)(Buffer.from('{"data":[1,2,3]}')));
        });
        const t = transport();
        expect(await t.fetchJson({ url: `${origin}/gzip`, acceptCompressed: true })).toMatchObject({ ok: true, data: { data: [1, 2, 3] } });
        expect(await t.fetchJson({ url: `${origin}/deflate`, acceptCompressed: true })).toMatchObject({ ok: true, data: { data: [1, 2, 3] } });
        expect(encodings).toEqual(['gzip, deflate', 'gzip, deflate']);
    });

    it('a compressed body that decodes beyond the cap is too-large', async () => {
        const { origin } = await serve((_request, response) => {
            response.setHeader('content-encoding', 'gzip');
            response.end(zlib.gzipSync(Buffer.alloc(1024 * 1024)));
        });
        expect(await transport().fetch({ url: origin, acceptCompressed: true, maxBytes: 64 * 1024 })).toMatchObject({ ok: false, code: 'too-large' });
    });
});

describe('NodeTransport: time and cancellation', () => {
    it('a server that does not answer in time is a timeout', async () => {
        const { origin } = await serve(() => undefined);
        expect(await transport().fetch({ url: origin, timeoutMs: 100 })).toMatchObject({ ok: false, code: 'timeout' });
    });

    it('an abort during the request cancels it, and an aborted signal sends nothing', async () => {
        const { origin, hits } = await serve(() => undefined);
        const controller = new AbortController();
        const pending = transport().fetch({ url: origin, signal: controller.signal });
        setTimeout(() => controller.abort(), 20);
        expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
        const before = hits();
        expect(await transport().fetch({ url: origin, signal: AbortSignal.abort() })).toMatchObject({ ok: false, code: 'cancelled' });
        expect(hits()).toBe(before);
    });

    it('an abort during the DNS lookup of a redirect target cancels the request', async () => {
        const { origin } = await serve((_request, response) => {
            response.writeHead(302, { location: 'http://feed.example/next' });
            response.end();
        });
        const controller = new AbortController();
        const resolver = vi.fn(() => {
            setTimeout(() => controller.abort(), 10);
            return new Promise<string[]>(() => undefined);
        });
        expect(await transport({ resolver }).fetch({ url: origin, signal: controller.signal })).toMatchObject({ ok: false, code: 'cancelled' });
        expect(resolver).toHaveBeenCalledWith('feed.example');
    });

    it('the DNS lookup of a redirect target counts against the deadline', async () => {
        const { origin } = await serve((_request, response) => {
            response.writeHead(302, { location: 'http://feed.example/next' });
            response.end();
        });
        const resolver = (): Promise<string[]> => new Promise(() => undefined);
        const started = Date.now();
        expect(await transport({ resolver }).fetch({ url: origin, timeoutMs: 150 })).toMatchObject({ ok: false, code: 'timeout' });
        expect(Date.now() - started).toBeLessThan(2_000);
    });
});

describe('NodeTransport: redirects', () => {
    it('follows up to five redirects and reports the final URL; the sixth is too-many-redirects', async () => {
        const { origin } = await serve((request, response) => {
            const step = Number(new URL(request.url ?? '/', 'http://x').searchParams.get('step') ?? '0');
            if (step < 5) {
                response.writeHead(302, { location: `/hop?step=${step + 1}` });
                response.end();
                return;
            }
            response.end(`landed ${step}`);
        });
        const result = await transport().fetch({ url: `${origin}/hop?step=0` });
        expect(text(result)).toBe('landed 5');
        expect(result.ok && result.url).toBe(`${origin}/hop?step=5`);
        expect(await transport().fetch({ url: `${origin}/hop?step=-1` })).toMatchObject({ ok: false, code: 'too-many-redirects' });
    });

    it('a redirect without Location is http-error', async () => {
        const { origin } = await serve((_request, response) => {
            response.writeHead(301);
            response.end();
        });
        expect(await transport().fetch({ url: origin })).toMatchObject({ ok: false, code: 'http-error', status: 301 });
    });

    it('a redirect to a private address is redirect-blocked', async () => {
        const { origin } = await serve((_request, response) => {
            response.writeHead(302, { location: 'http://10.0.0.5/v3/index.json' });
            response.end();
        });
        expect(await transport().fetch({ url: origin })).toMatchObject({ ok: false, code: 'redirect-blocked' });
    });

    it('a redirect to a name that resolves to a private address is redirect-blocked', async () => {
        const { origin } = await serve((_request, response) => {
            response.writeHead(302, { location: 'http://feed.example/v3/index.json' });
            response.end();
        });
        const result = await transport({ resolver: async () => ['192.168.1.20'] }).fetch({ url: origin });
        expect(result).toMatchObject({ ok: false, code: 'redirect-blocked' });
        expect(!result.ok && result.message).toMatch(/non-public address/);
    });

    it('a redirect target that does not resolve is refused with redirect-blocked', async () => {
        const { origin } = await serve((_request, response) => {
            response.writeHead(302, { location: 'http://nowhere.example/v3/index.json' });
            response.end();
        });
        const result = await transport({ resolver: async () => [] }).fetch({ url: origin });
        expect(result).toMatchObject({ ok: false, code: 'redirect-blocked' });
        expect(!result.ok && result.message).toContain('nowhere.example does not resolve');
        // With a proxy in use the proxy resolves names: no local lookup, the string checks alone apply.
        const resolver = vi.fn(async () => [] as string[]);
        const proxied = transport({ resolver, proxy: { isConfigured: () => true } });
        const viaProxy = await proxied.fetch({ url: origin, timeoutMs: 300 });
        expect(resolver).not.toHaveBeenCalled();
        expect(viaProxy).not.toMatchObject({ code: 'redirect-blocked' });
    });

    it('forwards Authorization to the same origin and drops it for another origin', async () => {
        const seen: Array<[string, string | undefined]> = [];
        const other = await serve((request, response) => {
            seen.push(['other', request.headers.authorization]);
            response.end('other');
        });
        const { origin } = await serve((request, response) => {
            seen.push([request.url ?? '', request.headers.authorization]);
            if (request.url === '/start') {
                response.writeHead(302, { location: '/same' });
            } else if (request.url === '/same') {
                response.writeHead(302, { location: `${other.origin}/elsewhere` });
            }
            response.end('');
        });
        const result = await transport().fetch({ url: `${origin}/start`, headers: { Authorization: 'Basic c2VjcmV0' } });
        expect(text(result)).toBe('other');
        expect(seen).toEqual([['/start', 'Basic c2VjcmV0'], ['/same', 'Basic c2VjcmV0'], ['other', undefined]]);
    });
});

describe('NodeTransport: proxy and HTTP/2 (ADR-005, docs/adr/005-proxy-matrix.md)', () => {
    /** Records what Transport hands to the request functions, then makes the real request. */
    function recordingRequests(): { calls: Array<Record<string, unknown>>; hook: { http: RequestFunction; https: RequestFunction } } {
        const calls: Array<Record<string, unknown>> = [];
        const record = (real: typeof http.request): RequestFunction => (options, callback) => {
            calls.push({ ...options } as Record<string, unknown>);
            return real(options, callback);
        };
        return { calls, hook: { http: record(http.request), https: record(http.request) } };
    }

    it('passes no agent to the request functions so the host proxy patch applies', async () => {
        const { origin } = await serve((_request, response) => response.end('ok'));
        const { calls, hook } = recordingRequests();
        expect(text(await transport({ httpRequest: hook }).fetch({ url: `${origin}/a` }))).toBe('ok');
        expect(calls).toHaveLength(1);
        expect('agent' in calls[0]).toBe(false);
        expect(calls[0]).toMatchObject({ hostname: '127.0.0.1', path: '/a', method: 'GET' });
        expect(calls[0]).not.toHaveProperty('rejectUnauthorized');
    });

    it('uses HTTP/2 for an allow-listed origin only while the proxy predicate is false', async () => {
        const h1 = await serve((_request, response) => response.end('h1'));
        const h2 = await serveH2();
        let proxied = false;
        const connect = vi.fn(() => http2.connect(h2.url));
        const t = transport({ http2Origins: [h1.origin], http2Connect: connect, proxy: { isConfigured: () => proxied } });
        expect(text(await t.fetch({ url: `${h1.origin}/a` }))).toBe('h2');
        expect(text(await t.fetch({ url: `${h1.origin}/b` }))).toBe('h2');
        // One pooled session for both requests.
        expect(connect).toHaveBeenCalledTimes(1);
        expect(t.http2SessionCount).toBe(1);
        proxied = true;
        expect(text(await t.fetch({ url: `${h1.origin}/c` }))).toBe('h1');
        // An origin that is not allow-listed never uses HTTP/2.
        proxied = false;
        const other = transport({ http2Origins: ['https://api.nuget.org'], http2Connect: connect });
        expect(text(await other.fetch({ url: `${h1.origin}/d` }))).toBe('h1');
        expect(connect).toHaveBeenCalledTimes(1);
    });

    it("a connection-level HTTP/2 failure downgrades the origin for the transport's lifetime", async () => {
        const h1 = await serve((_request, response) => response.end('h1'));
        const dead = await closedPort();
        const connect = vi.fn(() => http2.connect(dead));
        const t = transport({ http2Origins: [h1.origin], http2Connect: connect });
        expect(text(await t.fetch({ url: `${h1.origin}/a` }))).toBe('h1');
        expect(text(await t.fetch({ url: `${h1.origin}/b` }))).toBe('h1');
        expect(text(await t.fetch({ url: `${h1.origin}/c` }))).toBe('h1');
        // No second attempt and no cooldown that runs out: HTTP/1.1 from the first failure on.
        expect(connect).toHaveBeenCalledTimes(1);
        // A connect that throws at once downgrades as well.
        const throwing = vi.fn((): http2.ClientHttp2Session => {
            throw new Error('ERR_SSL_WRONG_VERSION_NUMBER');
        });
        const t2 = transport({ http2Origins: [h1.origin], http2Connect: throwing });
        expect(text(await t2.fetch({ url: `${h1.origin}/a` }))).toBe('h1');
        expect(text(await t2.fetch({ url: `${h1.origin}/b` }))).toBe('h1');
        expect(throwing).toHaveBeenCalledTimes(1);
    });

    it('reset() restores HTTP/2 for a downgraded origin', async () => {
        const h1 = await serve((_request, response) => response.end('h1'));
        const h2 = await serveH2();
        const dead = await closedPort();
        let target = dead;
        const connect = vi.fn(() => http2.connect(target));
        const t = transport({ http2Origins: [h1.origin], http2Connect: connect });
        expect(text(await t.fetch({ url: `${h1.origin}/a` }))).toBe('h1');
        target = h2.url;
        expect(text(await t.fetch({ url: `${h1.origin}/b` }))).toBe('h1');
        t.reset();
        expect(text(await t.fetch({ url: `${h1.origin}/c` }))).toBe('h2');
        expect(connect).toHaveBeenCalledTimes(2);
        // reset() also closes live sessions: the next request opens a new one.
        t.reset();
        expect(t.http2SessionCount).toBe(0);
        expect(text(await t.fetch({ url: `${h1.origin}/d` }))).toBe('h2');
        expect(connect).toHaveBeenCalledTimes(3);
    });

    it('h2→h1 fallback: a stream refused on a live session goes over HTTP/1.1 once and keeps HTTP/2', async () => {
        const h1 = await serve((_request, response) => response.end('h1'));
        const h2 = await serveH2();
        const connect = vi.fn(() => http2.connect(h2.url));
        const t = transport({ http2Origins: [h1.origin], http2Connect: connect });
        expect(text(await t.fetch({ url: `${h1.origin}/refuse` }))).toBe('h1');
        expect(text(await t.fetch({ url: `${h1.origin}/next` }))).toBe('h2');
        expect(h2.streams()).toBe(2);
        expect(connect).toHaveBeenCalledTimes(1);
    });

    it('dispose closes the sessions and every later request is cancelled', async () => {
        const h1 = await serve((_request, response) => response.end('h1'));
        const h2 = await serveH2();
        const t = transport({ http2Origins: [h1.origin], http2Connect: () => http2.connect(h2.url) });
        expect(text(await t.fetch({ url: `${h1.origin}/a` }))).toBe('h2');
        t.dispose();
        expect(t.http2SessionCount).toBe(0);
        expect(await t.fetch({ url: `${h1.origin}/b` })).toMatchObject({ ok: false, code: 'cancelled' });
        // Disposing twice is harmless.
        t.dispose();
    });

    it('ignores an allow-listed origin that is no URL, and says so', () => {
        const warn = vi.fn();
        transport({ http2Origins: ['not an origin'], logger: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() } as never });
        expect(warn).toHaveBeenCalledWith('Ignoring invalid HTTP/2 origin not an origin');
    });
});

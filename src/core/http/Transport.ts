import * as dns from 'dns';
import * as http from 'http';
import * as http2 from 'http2';
import * as https from 'https';
import type { Readable } from 'stream';
import * as zlib from 'zlib';
import type { JsonResult, Logger, Transport, TransportErrorCode, TransportFailure, TransportRequest, TransportResult } from '../contracts';
import { classifyAddress, isRedirectStatus, redactUrl, resolveRedirect } from './ssrf';

/**
 * The single socket-opening module (ADR-005, `docs/adr/005-proxy-matrix.md`).
 *
 * HTTP/1.1 goes through Node's `https`/`http` request functions **without an agent of its own**. The VS Code
 * extension host patches those functions: it resolves the proxy (`http.proxy`, the proxy environment, the
 * operating-system or PAC configuration), authenticates to it and adds the operating-system certificates. A
 * caller's agent would be dropped under `http.proxySupport: override` and would bypass the proxy under `on`, so
 * none is passed; connections are then reused only where the host's Node keeps the global agent alive (Node 19+).
 * `http.proxyStrictSSL` and `http.proxyAuthorization` are not applied by the host to extensions and are not
 * emulated here; certificate verification is never disabled.
 *
 * HTTP/2 (`http2.connect`) is outside the host patch: it is used only for allow-listed origins and only while the
 * injected proxy predicate is false. What the predicate cannot see (an operating-system or PAC proxy, a
 * TLS-intercepting proxy) shows as a connection-level failure, after which the origin uses HTTP/1.1 for the life
 * of this instance (`reset()` clears that, for example after an `http.*` setting changed).
 */

export interface ProxyState {
    /** True when a proxy is known to be in use: then HTTP/2 is not tried and redirect targets are not resolved locally. */
    isConfigured(): boolean;
}

/** `http.request` / `https.request` as Transport calls them; the default looks the function up at call time. */
export type RequestFunction = (options: https.RequestOptions, callback: (response: http.IncomingMessage) => void) => http.ClientRequest;

export interface NodeTransportOptions {
    proxy: ProxyState;
    /** Origins (`scheme://host[:port]`) known to speak HTTP/2. Default: `https://api.nuget.org`. */
    http2Origins?: string[];
    /** Resolves a hostname to its addresses; used to re-validate redirect targets. Default: `dns.lookup`. */
    resolver?: (hostname: string) => Promise<string[]>;
    /** Treat loopback redirect targets as public. Only for tests that run local servers. */
    allowLoopback?: boolean;
    logger?: Logger;
    now?: () => number;
    /** Test hook replacing `http2.connect`. */
    http2Connect?: (origin: string) => http2.ClientHttp2Session;
    /**
     * Test hook replacing `http.request`/`https.request`. Without it the module's function is looked up on every
     * request, so the extension host's patch of the module is what runs.
     */
    httpRequest?: { http: RequestFunction; https: RequestFunction };
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_H2_SESSIONS = 10;
const H2_IDLE_MS = 60_000;
const DNS_CACHE_MS = 60_000;
const DEFAULT_USER_AGENT = 'nUIget';
const EMPTY = Buffer.alloc(0);
// Hop-by-hop headers are illegal in HTTP/2 and make `session.request()` throw.
const CONNECTION_HEADERS = new Set(['host', 'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te']);
const FALLBACK = Symbol('http1-fallback');

interface HopContext {
    deadline: number;
    maxBytes: number;
    signal?: AbortSignal;
}

interface HopResponse {
    status: number;
    headers: Record<string, string>;
    body: Buffer;
}

interface ResponseHead {
    status: number;
    headers: Record<string, string>;
    stream: Readable;
}

type HopOutcome = { ok: true; response: HopResponse } | TransportFailure;

interface SessionEntry {
    origin: string;
    session: http2.ClientHttp2Session;
    lastUsed: number;
    active: number;
}

interface DnsCacheEntry {
    addresses: string[];
    expires: number;
}

function failure(code: TransportErrorCode, message: string, status?: number): TransportFailure {
    return status === undefined ? { ok: false, code, message } : { ok: false, code, message, status };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function describeNetworkError(error: unknown): string {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
    const message = errorMessage(error);
    switch (code) {
        case 'ECONNREFUSED':
            return `Connection refused (${code})`;
        case 'ENOTFOUND':
        case 'EAI_AGAIN':
            return `DNS resolution failed (${code})`;
        case 'ETIMEDOUT':
        case 'ESOCKETTIMEDOUT':
            return `Connection timed out (${code})`;
        case 'ECONNRESET':
            return `Connection reset by the server (${code})`;
        default:
            if (/certificate|ssl|tls/i.test(message) || code.startsWith('ERR_TLS') || code.startsWith('CERT_') || code.startsWith('UNABLE_TO')) {
                return `TLS error: ${message}`;
            }
            return code ? `${message} (${code})` : message;
    }
}

function normalizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers ?? {})) {
        const key = name.trim().toLowerCase();
        if (key !== '' && value !== undefined) {
            result[key] = String(value);
        }
    }
    return result;
}

function flattenHeaders(headers: http.IncomingHttpHeaders | http2.IncomingHttpHeaders): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
        if (name.startsWith(':') || value === undefined) {
            continue;
        }
        result[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    return result;
}

function bareHostname(url: URL): string {
    return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function effectiveTimeout(timeoutMs: number | undefined): number {
    return timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
}

function effectiveMaxBytes(maxBytes: number | undefined): number {
    return maxBytes !== undefined && Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES;
}

function stripBom(text: string): string {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function defaultResolver(hostname: string): Promise<string[]> {
    const results = await dns.promises.lookup(hostname, { all: true });
    return results.map(entry => entry.address);
}

const defaultHttpRequest = {
    http: ((options, callback) => http.request(options, callback)) as RequestFunction,
    https: ((options, callback) => https.request(options, callback)) as RequestFunction,
};

function defaultHttp2Connect(origin: string): http2.ClientHttp2Session {
    return http2.connect(origin, { minVersion: 'TLSv1.2', rejectUnauthorized: true });
}

/**
 * Settles one request hop exactly once: enforces the overall deadline and the abort signal, and
 * tears the underlying request down when the hop ends in a failure.
 */
class HopController<Extra = never> {
    private settled = false;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private readonly teardowns: Array<() => void> = [];
    private readonly onAbort = (): void => this.settle(failure('cancelled', 'Request was cancelled'));

    constructor(private readonly ctx: HopContext, private readonly resolve: (outcome: HopOutcome | Extra) => void, now: () => number) {
        if (ctx.signal?.aborted) {
            this.settle(failure('cancelled', 'Request was cancelled'));
            return;
        }
        const remaining = ctx.deadline - now();
        if (remaining <= 0) {
            this.settle(failure('timeout', 'Request timed out'));
            return;
        }
        this.timer = setTimeout(() => this.settle(failure('timeout', 'Request timed out')), remaining);
        ctx.signal?.addEventListener('abort', this.onAbort, { once: true });
    }

    get done(): boolean {
        return this.settled;
    }

    /** Registers cleanup that runs if the hop fails (timeout, abort, size cap, network error). */
    onTeardown(teardown: () => void): void {
        if (this.settled) {
            teardown();
            return;
        }
        this.teardowns.push(teardown);
    }

    settle(outcome: HopOutcome | Extra): void {
        if (this.settled) {
            return;
        }
        this.settled = true;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        this.ctx.signal?.removeEventListener('abort', this.onAbort);
        const succeeded = typeof outcome === 'object' && outcome !== null && 'ok' in outcome && outcome.ok;
        if (!succeeded) {
            for (const teardown of this.teardowns) {
                try {
                    teardown();
                } catch {
                    // The request is already being abandoned; a failing teardown changes nothing.
                }
            }
        }
        this.resolve(outcome);
    }

    fail(code: TransportErrorCode, message: string, status?: number): void {
        this.settle(failure(code, message, status));
    }

    /** Consumes the response body according to `method`/status, applying the size cap and decoding. */
    readResponse(head: ResponseHead, method: 'GET' | 'HEAD', teardown: () => void): void {
        const { status, headers, stream } = head;
        this.onTeardown(teardown);
        const wantBody = method !== 'HEAD' && !isRedirectStatus(status) && status < 400;
        if (!wantBody) {
            // Error-body policy: the body of a redirect, an error status or a HEAD response is never read. The
            // head is all a caller gets, and the stream is closed at once instead of draining an unbounded body.
            this.settle({ ok: true, response: { status, headers, body: EMPTY } });
            try {
                teardown();
            } catch {
                // Closing a stream that already ended changes nothing.
            }
            return;
        }

        const contentLength = Number(headers['content-length']);
        if (Number.isFinite(contentLength) && contentLength > this.ctx.maxBytes) {
            this.fail('too-large', `Response of ${contentLength} bytes exceeds the ${this.ctx.maxBytes} byte limit`);
            return;
        }

        const encoding = (headers['content-encoding'] ?? '').trim().toLowerCase();
        let source: Readable = stream;
        if (encoding === 'gzip' || encoding === 'x-gzip') {
            source = stream.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
            source = stream.pipe(zlib.createInflate());
        }

        const chunks: Buffer[] = [];
        let received = 0;
        const limit = this.ctx.maxBytes;
        const tooLarge = (): void => this.fail('too-large', `Response exceeds the ${limit} byte limit`);
        if (source !== stream) {
            let rawReceived = 0;
            stream.on('data', (chunk: Buffer) => {
                rawReceived += chunk.length;
                if (rawReceived > limit) {
                    tooLarge();
                }
            });
            stream.on('error', (error: unknown) => this.fail('network', describeNetworkError(error)));
            this.onTeardown(() => source.destroy());
        }
        source.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (received > limit) {
                tooLarge();
                return;
            }
            chunks.push(chunk);
        });
        source.on('end', () => this.settle({ ok: true, response: { status, headers, body: Buffer.concat(chunks) } }));
        source.on('error', (error: unknown) => this.fail('network', `Failed to read response: ${describeNetworkError(error)}`));
    }
}

/** HTTP transport for Node: HTTP/1.1 through the request functions the host patches, pooled HTTP/2 for allow-listed origins. */
export class NodeTransport implements Transport {
    private readonly proxy: ProxyState;
    private readonly http2Origins: Set<string>;
    private readonly resolver: (hostname: string) => Promise<string[]>;
    private readonly allowLoopback: boolean;
    private readonly logger: Logger | undefined;
    private readonly now: () => number;
    private readonly connect: (origin: string) => http2.ClientHttp2Session;
    private readonly request: { http: RequestFunction; https: RequestFunction };
    /** Insertion order doubles as LRU order: entries are re-inserted on use. */
    private readonly sessions = new Map<string, SessionEntry>();
    /** Origins whose HTTP/2 connection failed: HTTP/1.1 for the life of this instance, or until `reset()`. */
    private readonly downgraded = new Set<string>();
    private readonly dnsCache = new Map<string, DnsCacheEntry>();
    private sweeper: ReturnType<typeof setInterval> | undefined;
    private disposed = false;

    constructor(options: NodeTransportOptions) {
        this.proxy = options.proxy;
        this.http2Origins = new Set<string>();
        for (const origin of options.http2Origins ?? ['https://api.nuget.org']) {
            try {
                this.http2Origins.add(new URL(origin).origin);
            } catch {
                options.logger?.warn(`Ignoring invalid HTTP/2 origin ${origin}`);
            }
        }
        this.resolver = options.resolver ?? defaultResolver;
        this.allowLoopback = options.allowLoopback === true;
        this.logger = options.logger;
        this.now = options.now ?? (() => Date.now());
        this.connect = options.http2Connect ?? defaultHttp2Connect;
        this.request = options.httpRequest ?? defaultHttpRequest;
    }

    /**
     * Closes the HTTP/2 sessions and forgets the downgraded origins and resolved names, so that the next request
     * decides afresh. The composition root calls it when an `http.*` setting changes. Not part of the `Transport`
     * contract.
     */
    reset(): void {
        for (const entry of [...this.sessions.values()]) {
            this.closeEntry(entry);
        }
        this.downgraded.clear();
        this.dnsCache.clear();
    }

    /** Number of pooled HTTP/2 sessions (diagnostics). */
    get http2SessionCount(): number {
        return this.sessions.size;
    }

    async fetch(request: TransportRequest): Promise<TransportResult> {
        if (this.disposed) {
            return failure('cancelled', 'Transport has been disposed');
        }
        let url: URL;
        try {
            url = new URL(request.url);
        } catch {
            return failure('network', `Invalid URL: ${redactUrl(request.url)}`);
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return failure('network', `Unsupported URL scheme: ${url.protocol}`);
        }

        const ctx: HopContext = {
            deadline: this.now() + effectiveTimeout(request.timeoutMs),
            maxBytes: effectiveMaxBytes(request.maxBytes),
            signal: request.signal,
        };
        let method: 'GET' | 'HEAD' = request.method ?? 'GET';
        let headers = normalizeHeaders(request.headers);
        if (headers['user-agent'] === undefined) {
            headers['user-agent'] = DEFAULT_USER_AGENT;
        }
        if (request.acceptCompressed) {
            headers['accept-encoding'] = 'gzip, deflate';
        }

        for (let redirects = 0; ; redirects++) {
            const outcome = await this.executeHop(url, method, headers, ctx);
            if (!outcome.ok) {
                return outcome;
            }
            const { status, headers: responseHeaders, body } = outcome.response;
            if (status < 100) {
                return failure('network', 'Malformed response: missing status');
            }
            if (isRedirectStatus(status)) {
                const location = responseHeaders['location'];
                if (!location) {
                    return failure('http-error', `HTTP ${status} without a Location header`, status);
                }
                if (redirects >= MAX_REDIRECTS) {
                    return failure('too-many-redirects', `Stopped after ${MAX_REDIRECTS} redirects`);
                }
                const resolution = resolveRedirect(url.href, status, location, headers['authorization'], { allowLoopback: this.allowLoopback });
                if (!resolution) {
                    this.logger?.warn(`Blocked redirect from ${redactUrl(url.href)} to ${redactUrl(location)}`);
                    return failure('redirect-blocked', `Redirect to ${redactUrl(location)} was blocked`);
                }
                const target = new URL(resolution.url);
                const verdict = await this.checkRedirectTarget(url, target, ctx);
                if (verdict !== 'allowed') {
                    if (verdict === 'cancelled' || verdict === 'timeout') {
                        return failure(verdict, verdict === 'cancelled' ? 'Request was cancelled' : 'Request timed out');
                    }
                    const reason = verdict === 'unresolved' ? `${bareHostname(target)} does not resolve` : 'it resolves to a non-public address';
                    this.logger?.warn(`Blocked redirect from ${redactUrl(url.href)} to ${redactUrl(target.href)}: ${reason}`);
                    return failure('redirect-blocked', `Redirect to ${redactUrl(target.href)} was blocked: ${reason}`);
                }
                const nextHeaders = { ...headers };
                delete nextHeaders['authorization'];
                if (resolution.forwardAuth !== undefined) {
                    nextHeaders['authorization'] = resolution.forwardAuth;
                }
                this.logger?.trace(`Following ${status} redirect to ${redactUrl(target.href)}`);
                headers = nextHeaders;
                url = target;
                if (resolution.switchToGet && method !== 'HEAD') {
                    method = 'GET';
                }
                continue;
            }
            if (status >= 400) {
                return failure('http-error', `HTTP ${status}`, status);
            }
            return { ok: true, status, headers: responseHeaders, body, url: url.href };
        }
    }

    async fetchJson<T>(request: TransportRequest): Promise<JsonResult<T>> {
        const headers = { accept: 'application/json', ...normalizeHeaders(request.headers) };
        const result = await this.fetch({ ...request, headers });
        if (!result.ok) {
            return result;
        }
        try {
            const data = JSON.parse(stripBom(result.body.toString('utf8'))) as T;
            return { ok: true, status: result.status, data, url: result.url };
        } catch {
            return failure('invalid-json', `Response from ${redactUrl(result.url)} is not valid JSON`, result.status);
        }
    }

    head(request: Omit<TransportRequest, 'method'>): Promise<TransportResult> {
        return this.fetch({ ...request, method: 'HEAD' });
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.stopSweeper();
        for (const entry of [...this.sessions.values()]) {
            this.closeEntry(entry);
        }
        this.downgraded.clear();
        this.dnsCache.clear();
    }

    private async executeHop(url: URL, method: 'GET' | 'HEAD', headers: Record<string, string>, ctx: HopContext): Promise<HopOutcome> {
        if (this.shouldUseHttp2(url)) {
            const outcome = await this.hopHttp2(url, method, headers, ctx);
            if (outcome !== FALLBACK) {
                return outcome;
            }
            this.logger?.debug(`HTTP/2 unavailable for ${url.origin}; using HTTP/1.1`);
        }
        return this.hopHttp1(url, method, headers, ctx);
    }

    private shouldUseHttp2(url: URL): boolean {
        return this.http2Origins.has(url.origin) && !this.downgraded.has(url.origin) && !this.proxy.isConfigured();
    }

    private hopHttp1(url: URL, method: 'GET' | 'HEAD', headers: Record<string, string>, ctx: HopContext): Promise<HopOutcome> {
        return new Promise<HopOutcome>(resolve => {
            const hop = new HopController(ctx, resolve, this.now);
            if (hop.done) {
                return;
            }
            const secure = url.protocol === 'https:';
            // No `agent`: the extension host's proxy patch decides the connection (ADR-005).
            const options: https.RequestOptions = {
                protocol: url.protocol,
                hostname: bareHostname(url),
                port: url.port || (secure ? 443 : 80),
                path: `${url.pathname}${url.search}`,
                method,
                headers,
            };
            let request: http.ClientRequest;
            try {
                request = (secure ? this.request.https : this.request.http)(options, response => {
                    hop.readResponse(
                        { status: response.statusCode ?? 0, headers: flattenHeaders(response.headers), stream: response },
                        method,
                        () => request.destroy(),
                    );
                });
            } catch (error) {
                hop.fail('network', describeNetworkError(error));
                return;
            }
            hop.onTeardown(() => request.destroy());
            request.on('error', (error: unknown) => hop.fail('network', describeNetworkError(error)));
            request.end();
        });
    }

    private hopHttp2(url: URL, method: 'GET' | 'HEAD', headers: Record<string, string>, ctx: HopContext): Promise<HopOutcome | typeof FALLBACK> {
        const entry = this.acquireSession(url.origin);
        if (!entry) {
            return Promise.resolve(FALLBACK);
        }
        return new Promise<HopOutcome | typeof FALLBACK>(resolve => {
            const hop = new HopController<typeof FALLBACK>(ctx, resolve, this.now);
            if (hop.done) {
                return;
            }
            const requestHeaders: http2.OutgoingHttpHeaders = { ':method': method, ':path': `${url.pathname}${url.search}` };
            for (const [name, value] of Object.entries(headers)) {
                if (!CONNECTION_HEADERS.has(name)) {
                    requestHeaders[name] = value;
                }
            }
            let stream: http2.ClientHttp2Stream;
            try {
                stream = entry.session.request(requestHeaders);
            } catch (error) {
                this.logger?.debug(`HTTP/2 request to ${url.origin} failed to start: ${errorMessage(error)}`);
                this.noteSessionFailure(entry);
                hop.settle(FALLBACK);
                return;
            }
            entry.active++;
            let responded = false;
            const cancel = (): void => {
                if (!stream.closed && !stream.destroyed) {
                    stream.close(http2.constants.NGHTTP2_CANCEL);
                }
            };
            stream.once('close', () => {
                entry.active = Math.max(0, entry.active - 1);
                entry.lastUsed = this.now();
                if (!responded) {
                    this.noteSessionFailure(entry);
                    hop.settle(FALLBACK);
                }
            });
            stream.on('response', responseHeaders => {
                responded = true;
                const rawStatus = responseHeaders[':status'];
                hop.readResponse({ status: typeof rawStatus === 'number' ? rawStatus : 0, headers: flattenHeaders(responseHeaders), stream }, method, cancel);
            });
            stream.on('error', (error: unknown) => {
                if (responded) {
                    hop.fail('network', describeNetworkError(error));
                    return;
                }
                this.logger?.debug(`HTTP/2 stream to ${url.origin} failed before a response: ${errorMessage(error)}`);
                this.noteSessionFailure(entry);
                hop.settle(FALLBACK);
            });
            hop.onTeardown(cancel);
            stream.end();
        });
    }

    /** Returns a live pooled session for `origin`, creating one unless the pool is saturated. */
    private acquireSession(origin: string): SessionEntry | undefined {
        if (this.disposed) {
            return undefined;
        }
        this.pruneDeadSessions();
        const now = this.now();
        const existing = this.sessions.get(origin);
        if (existing) {
            existing.lastUsed = now;
            this.sessions.delete(origin);
            this.sessions.set(origin, existing);
            return existing;
        }
        if (this.sessions.size >= MAX_H2_SESSIONS && !this.evictIdleSession()) {
            return undefined;
        }
        let session: http2.ClientHttp2Session;
        try {
            session = this.connect(origin);
        } catch (error) {
            this.logger?.debug(`HTTP/2 connect to ${origin} failed: ${errorMessage(error)}; HTTP/1.1 from now on`);
            this.downgraded.add(origin);
            return undefined;
        }
        const entry: SessionEntry = { origin, session, lastUsed: now, active: 0 };
        session.on('error', (error: unknown) => {
            this.logger?.debug(`HTTP/2 session for ${origin} failed: ${errorMessage(error)}; HTTP/1.1 from now on`);
            this.downgraded.add(origin);
            this.removeEntry(entry);
        });
        session.on('close', () => this.removeEntry(entry));
        this.sessions.set(origin, entry);
        this.startSweeper();
        return entry;
    }

    /**
     * A failure before any response. When the connection itself is gone (DNS, connect, TLS handshake, a dropped
     * session) the origin uses HTTP/1.1 for the life of this instance; a stream reset on a live session only sends
     * this request over HTTP/1.1.
     */
    private noteSessionFailure(entry: SessionEntry): void {
        if (entry.session.closed || entry.session.destroyed) {
            this.downgraded.add(entry.origin);
            this.removeEntry(entry);
        }
    }

    private removeEntry(entry: SessionEntry): void {
        if (this.sessions.get(entry.origin) === entry) {
            this.sessions.delete(entry.origin);
        }
        if (this.sessions.size === 0) {
            this.stopSweeper();
        }
    }

    private closeEntry(entry: SessionEntry): void {
        this.removeEntry(entry);
        try {
            entry.session.close();
        } catch {
            // Closing an already-broken session is a no-op for our purposes.
        }
    }

    private pruneDeadSessions(): void {
        for (const entry of [...this.sessions.values()]) {
            if (entry.session.closed || entry.session.destroyed) {
                this.removeEntry(entry);
            }
        }
    }

    /** Evicts the least recently used idle session; sessions with active streams are never closed. */
    private evictIdleSession(): boolean {
        for (const entry of this.sessions.values()) {
            if (entry.active === 0) {
                this.closeEntry(entry);
                return true;
            }
        }
        return false;
    }

    private sweep(): void {
        this.pruneDeadSessions();
        const now = this.now();
        for (const entry of [...this.sessions.values()]) {
            if (entry.active === 0 && now - entry.lastUsed >= H2_IDLE_MS) {
                this.closeEntry(entry);
            }
        }
    }

    private startSweeper(): void {
        if (this.sweeper) {
            return;
        }
        this.sweeper = setInterval(() => this.sweep(), H2_IDLE_MS);
        this.sweeper.unref();
    }

    private stopSweeper(): void {
        if (this.sweeper) {
            clearInterval(this.sweeper);
            this.sweeper = undefined;
        }
    }

    /**
     * Redirect targets named by hostname are re-validated by resolved address so a public-looking name cannot
     * steer the request at the local network; a name that does not resolve is refused. The lookup counts against
     * the request's deadline and ends with its signal. Skipped while a proxy is configured: the proxy opens the
     * connection and local DNS may not even resolve external names (ADR-005).
     */
    private async checkRedirectTarget(current: URL, target: URL, ctx: HopContext): Promise<'allowed' | 'non-public' | 'unresolved' | 'timeout' | 'cancelled'> {
        const host = bareHostname(target);
        if (host === bareHostname(current) || classifyAddress(host) !== undefined || this.proxy.isConfigured()) {
            return 'allowed';
        }
        const looked = await this.withinDeadline(this.resolve(host), ctx);
        if (looked === 'timeout' || looked === 'cancelled') {
            return looked;
        }
        if (looked.length === 0) {
            return 'unresolved';
        }
        const publicOnly = looked.every(address => {
            const addressClass = classifyAddress(address);
            return addressClass === 'public' || (addressClass === 'loopback' && this.allowLoopback);
        });
        return publicOnly ? 'allowed' : 'non-public';
    }

    /** `work`, unless the request's deadline passes or its signal aborts first. */
    private withinDeadline<T>(work: Promise<T>, ctx: HopContext): Promise<T | 'timeout' | 'cancelled'> {
        if (ctx.signal?.aborted) {
            return Promise.resolve('cancelled');
        }
        const remaining = ctx.deadline - this.now();
        if (remaining <= 0) {
            return Promise.resolve('timeout');
        }
        return new Promise(resolve => {
            const timer = setTimeout(() => finish('timeout'), remaining);
            const onAbort = (): void => finish('cancelled');
            const finish = (value: T | 'timeout' | 'cancelled'): void => {
                clearTimeout(timer);
                ctx.signal?.removeEventListener('abort', onAbort);
                resolve(value);
            };
            ctx.signal?.addEventListener('abort', onAbort, { once: true });
            work.then(finish, () => finish([] as unknown as T));
        });
    }

    private async resolve(hostname: string): Promise<string[]> {
        const now = this.now();
        const cached = this.dnsCache.get(hostname);
        if (cached && cached.expires > now) {
            return cached.addresses;
        }
        let addresses: string[];
        try {
            addresses = await this.resolver(hostname);
        } catch (error) {
            this.logger?.debug(`Could not resolve ${hostname}: ${errorMessage(error)}`);
            addresses = [];
        }
        this.dnsCache.set(hostname, { addresses, expires: now + DNS_CACHE_MS });
        return addresses;
    }
}

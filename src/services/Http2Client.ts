import * as http from 'http';
import * as http2 from 'http2';
import * as https from 'https';
import * as tls from 'tls';

/**
 * Result type for HTTP fetch operations with error information.
 * Allows callers to distinguish between "not found" and "network error".
 */
export interface FetchResult<T> {
    data: T | null;
    error?: {
        type: 'network' | 'http-error' | 'parse-error';
        message: string;
        statusCode?: number;
    };
}

/**
 * HTTP/2 client with connection session reuse for NuGet API calls.
 * Uses HTTP/2 multiplexing for *.nuget.org sources (verified supported).
 * Falls back to HTTP/1.1 for other sources.
 * Includes session pool limit (MAX_SESSIONS) with LRU eviction to prevent memory accumulation.
 */
export class Http2Client {
    private static instance: Http2Client;

    // Maximum concurrent HTTP/2 sessions to prevent memory accumulation
    private static readonly MAX_SESSIONS = 10;

    // HTTP/2 sessions keyed by origin (e.g., "https://api.nuget.org")
    private sessions: Map<string, http2.ClientHttp2Session> = new Map();
    // Track session order for LRU eviction (oldest first)
    private sessionOrder: string[] = [];

    // HTTP/1.1 agent with keepAlive for non-HTTP/2 sources
    private httpsAgent = new https.Agent({
        keepAlive: true,
        maxSockets: 10,
        timeout: 30000,
        minVersion: 'TLSv1.2' as tls.SecureVersion
    });

    // Origins known to support HTTP/2
    // Note: Azure Search endpoints (azuresearch-*.nuget.org) removed due to TLS
    // compatibility issues with Electron's BoringSSL - they use HTTP/1.1 fallback
    private readonly http2Origins = new Set([
        'https://api.nuget.org'
    ]);

    private constructor() { }

    public static getInstance(): Http2Client {
        if (!Http2Client.instance) {
            Http2Client.instance = new Http2Client();
        }
        return Http2Client.instance;
    }

    /**
     * Check if a URL should use HTTP/2
     */
    private shouldUseHttp2(url: string): boolean {
        try {
            const parsed = new URL(url);
            const origin = `${parsed.protocol}//${parsed.host}`;
            return this.http2Origins.has(origin);
        } catch {
            return false;
        }
    }

    /**
     * Get or create HTTP/2 session for an origin.
     * Implements LRU eviction when MAX_SESSIONS is reached.
     */
    private getSession(origin: string): http2.ClientHttp2Session {
        let session = this.sessions.get(origin);

        if (session && !session.closed && !session.destroyed) {
            // Move to end of order (most recently used)
            const idx = this.sessionOrder.indexOf(origin);
            if (idx > -1) {
                this.sessionOrder.splice(idx, 1);
                this.sessionOrder.push(origin);
            }
            return session;
        }

        // Evict oldest session if at capacity
        if (this.sessions.size >= Http2Client.MAX_SESSIONS) {
            const oldestOrigin = this.sessionOrder.shift();
            if (oldestOrigin) {
                const oldSession = this.sessions.get(oldestOrigin);
                if (oldSession && !oldSession.closed && !oldSession.destroyed) {
                    oldSession.close();
                }
                this.sessions.delete(oldestOrigin);
            }
        }

        // Create new session with TLS 1.2+ (required by modern NuGet servers)
        session = http2.connect(origin, {
            minVersion: 'TLSv1.2' as tls.SecureVersion,
            rejectUnauthorized: true
        });

        // Handle session errors - clean up both map and order
        session.on('error', () => {
            this.sessions.delete(origin);
            const idx = this.sessionOrder.indexOf(origin);
            if (idx > -1) {
                this.sessionOrder.splice(idx, 1);
            }
        });

        session.on('close', () => {
            this.sessions.delete(origin);
            const idx = this.sessionOrder.indexOf(origin);
            if (idx > -1) {
                this.sessionOrder.splice(idx, 1);
            }
        });

        // Set timeout to close idle sessions
        session.setTimeout(60000, () => {
            session?.close();
            this.sessions.delete(origin);
            const idx = this.sessionOrder.indexOf(origin);
            if (idx > -1) {
                this.sessionOrder.splice(idx, 1);
            }
        });

        this.sessions.set(origin, session);
        this.sessionOrder.push(origin);
        return session;
    }

    /**
     * Fetch JSON using HTTP/2 for supported origins, HTTP/1.1 otherwise
     * @param url The URL to fetch
     * @param authHeader Optional Authorization header value (e.g., "Basic xxxxx")
     */
    public fetchJson<T>(url: string, authHeader?: string): Promise<T | null> {
        if (this.shouldUseHttp2(url)) {
            return this.fetchJsonHttp2<T>(url);
        }
        return this.fetchJsonHttp1<T>(url, authHeader);
    }

    /**
     * Fetch JSON with detailed error information.
     * Use this when you need to distinguish between "not found" and "network error".
     * @param url The URL to fetch
     * @param authHeader Optional Authorization header value
     */
    public fetchJsonWithDetails<T>(url: string, authHeader?: string): Promise<FetchResult<T>> {
        if (this.shouldUseHttp2(url)) {
            return this.fetchJsonHttp2WithDetails<T>(url);
        }
        return this.fetchJsonHttp1WithDetails<T>(url, authHeader);
    }

    /**
     * HTTP/2 JSON fetch with multiplexing and error details
     */
    private fetchJsonHttp2WithDetails<T>(url: string): Promise<FetchResult<T>> {
        return new Promise((resolve) => {
            try {
                const parsed = new URL(url);
                const origin = `${parsed.protocol}//${parsed.host}`;
                const session = this.getSession(origin);

                const req = session.request({
                    ':method': 'GET',
                    ':path': parsed.pathname + parsed.search,
                    'accept': 'application/json'
                });

                req.setEncoding('utf8');

                let data = '';
                let statusCode = 0;
                let redirected = false;

                req.on('response', (headers) => {
                    statusCode = headers[':status'] || 0;

                    // Handle redirects
                    if (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) {
                        const location = headers['location'] as string;
                        if (location) {
                            redirected = true;
                            req.close();
                            this.fetchJsonWithDetails<T>(location).then(resolve);
                        }
                    }
                });

                req.on('data', (chunk) => {
                    if (!redirected) {
                        data += chunk;
                    }
                });

                req.on('end', () => {
                    if (redirected) {
                        return;
                    }
                    if (statusCode !== 200) {
                        resolve({
                            data: null,
                            error: {
                                type: 'http-error',
                                message: `HTTP ${statusCode}`,
                                statusCode
                            }
                        });
                        return;
                    }
                    try {
                        resolve({ data: JSON.parse(data) });
                    } catch {
                        resolve({
                            data: null,
                            error: {
                                type: 'parse-error',
                                message: 'Failed to parse JSON response'
                            }
                        });
                    }
                });

                req.on('error', (err) => {
                    if (!redirected) {
                        resolve({
                            data: null,
                            error: {
                                type: 'network',
                                message: err.message || 'Network error'
                            }
                        });
                    }
                });

                req.end();
            } catch (err) {
                resolve({
                    data: null,
                    error: {
                        type: 'network',
                        message: err instanceof Error ? err.message : 'Unknown error'
                    }
                });
            }
        });
    }

    /**
     * HTTP/1.1 JSON fetch with error details
     */
    private fetchJsonHttp1WithDetails<T>(url: string, authHeader?: string): Promise<FetchResult<T>> {
        return new Promise((resolve) => {
            const client = url.startsWith('https://') ? https : http;
            const parsed = new URL(url);

            const headers: Record<string, string> = {
                'Accept': 'application/json'
            };
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }

            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'GET',
                headers,
                agent: url.startsWith('https://') ? this.httpsAgent : undefined
            };

            const req = client.request(options, (res) => {
                // Handle redirects
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl) {
                        const redirectParsed = new URL(redirectUrl, url);
                        const sameOrigin = redirectParsed.origin === parsed.origin;
                        this.fetchJsonHttp1WithDetails<T>(redirectUrl, sameOrigin ? authHeader : undefined).then(resolve);
                        return;
                    }
                }

                if (res.statusCode !== 200) {
                    resolve({
                        data: null,
                        error: {
                            type: 'http-error',
                            message: `HTTP ${res.statusCode}`,
                            statusCode: res.statusCode
                        }
                    });
                    return;
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ data: JSON.parse(data) });
                    } catch {
                        resolve({
                            data: null,
                            error: {
                                type: 'parse-error',
                                message: 'Failed to parse JSON response'
                            }
                        });
                    }
                });
            });

            req.on('error', (err) => {
                resolve({
                    data: null,
                    error: {
                        type: 'network',
                        message: err.message || 'Network error'
                    }
                });
            });

            req.end();
        });
    }

    /**
     * HTTP/2 JSON fetch with multiplexing
     */
    private fetchJsonHttp2<T>(url: string): Promise<T | null> {
        return new Promise((resolve) => {
            try {
                const parsed = new URL(url);
                const origin = `${parsed.protocol}//${parsed.host}`;
                const session = this.getSession(origin);

                const req = session.request({
                    ':method': 'GET',
                    ':path': parsed.pathname + parsed.search,
                    'accept': 'application/json'
                });

                req.setEncoding('utf8');

                let data = '';
                let statusCode = 0;
                let redirected = false;

                req.on('response', (headers) => {
                    statusCode = headers[':status'] || 0;

                    // Handle redirects
                    if (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) {
                        const location = headers['location'] as string;
                        if (location) {
                            redirected = true;
                            req.close();
                            this.fetchJson<T>(location).then(resolve);
                        }
                    }
                });

                req.on('data', (chunk) => {
                    if (!redirected) {
                        data += chunk;
                    }
                });

                req.on('end', () => {
                    if (redirected) {
                        return; // Already resolved via redirect
                    }
                    if (statusCode !== 200) {
                        resolve(null);
                        return;
                    }
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve(null);
                    }
                });

                req.on('error', () => {
                    if (!redirected) {
                        resolve(null);
                    }
                });

                req.end();
            } catch {
                resolve(null);
            }
        });
    }

    /**
     * HTTP/1.1 JSON fetch with connection reuse (keepAlive)
     * @param url The URL to fetch
     * @param authHeader Optional Authorization header value
     */
    private fetchJsonHttp1<T>(url: string, authHeader?: string): Promise<T | null> {
        return new Promise((resolve) => {
            const client = url.startsWith('https://') ? https : http;
            const parsed = new URL(url);

            const headers: Record<string, string> = {
                'Accept': 'application/json'
            };
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }

            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'GET',
                headers,
                agent: url.startsWith('https://') ? this.httpsAgent : undefined
            };

            const req = client.request(options, (res) => {
                // Handle redirects
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl) {
                        // Preserve auth header on same-origin redirects only
                        const redirectParsed = new URL(redirectUrl, url);
                        const sameOrigin = redirectParsed.origin === parsed.origin;
                        this.fetchJsonHttp1<T>(redirectUrl, sameOrigin ? authHeader : undefined).then(resolve);
                        return;
                    }
                }

                if (res.statusCode !== 200) {
                    resolve(null);
                    return;
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve(null);
                    }
                });
            });

            req.on('error', () => {
                resolve(null);
            });

            req.end();
        });
    }

    /**
     * HEAD request to check if a resource exists (for icon validation)
     */
    public headRequest(url: string): Promise<number> {
        if (this.shouldUseHttp2(url)) {
            return this.headRequestHttp2(url);
        }
        return this.headRequestHttp1(url);
    }

    /**
     * HTTP/2 HEAD request
     */
    private headRequestHttp2(url: string): Promise<number> {
        return new Promise((resolve) => {
            try {
                const parsed = new URL(url);
                const origin = `${parsed.protocol}//${parsed.host}`;
                const session = this.getSession(origin);

                const req = session.request({
                    ':method': 'HEAD',
                    ':path': parsed.pathname + parsed.search
                });

                req.on('response', (headers) => {
                    const statusCode = headers[':status'] || 0;
                    req.close();
                    resolve(statusCode);
                });

                req.on('error', () => {
                    resolve(0);
                });

                req.end();
            } catch {
                resolve(0);
            }
        });
    }

    /**
     * HTTP/1.1 HEAD request
     */
    private headRequestHttp1(url: string): Promise<number> {
        return new Promise((resolve) => {
            const client = url.startsWith('https://') ? https : http;
            const parsed = new URL(url);

            const options = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'HEAD',
                agent: url.startsWith('https://') ? this.httpsAgent : undefined
            };

            const req = client.request(options, (res) => {
                resolve(res.statusCode || 0);
            });

            req.on('error', () => {
                resolve(0);
            });

            req.end();
        });
    }

    /**
     * Close all HTTP/2 sessions (call on extension deactivate)
     */
    public closeAll(): void {
        for (const session of this.sessions.values()) {
            try {
                session.close();
            } catch {
                // Ignore errors during cleanup
            }
        }
        this.sessions.clear();
        this.sessionOrder = [];
    }
}

// Export singleton instance
export const http2Client = Http2Client.getInstance();

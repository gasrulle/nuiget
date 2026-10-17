/**
 * Images of a package README, fetched by the host and delivered as `data:` URIs (ADR-006): the webview's CSP allows no
 * remote image origin, and a private feed's images need its credential. A README image URL comes from package content,
 * not from configuration, so this fetch checks the first hop itself; the `Transport` re-checks only redirect targets,
 * because a configured feed may legitimately live on a private address.
 */

import { LruMap } from '../cache/LruMap';
import type { Logger, Transport } from '../contracts';
import { classifyAddress, isLocalhostName } from '../http';
import { MAX_ICON_BYTES, toImageDataUri } from './icons';
import { consoleFallbackLogger, headerValue, redactUrl } from './wire';

/** Same cap as icons (ADR-006); a larger one is an amendment of that ADR. */
export const MAX_README_IMAGE_BYTES = MAX_ICON_BYTES;
export const README_IMAGE_CACHE_CAPACITY = 64;
export const README_IMAGE_TIMEOUT_MS = 10_000;

export interface ReadmeImageFetcherOptions {
    /** The `Authorization` value of a configured source, by its URL; sent only to that source's own origin. */
    getAuthHeader?: (sourceUrl: string) => Promise<string | undefined>;
    cacheCapacity?: number;
    timeoutMs?: number;
    logger?: Logger;
}

export class ReadmeImageFetcher {
    /** Found images only: a miss is never cached, so a transient outage does not pin a broken image. */
    private readonly cache: LruMap<string, string>;
    private readonly getAuthHeader: ReadmeImageFetcherOptions['getAuthHeader'];
    private readonly timeoutMs: number;
    private readonly logger: Logger;

    constructor(private readonly transport: Transport, options: ReadmeImageFetcherOptions = {}) {
        this.cache = new LruMap(options.cacheCapacity ?? README_IMAGE_CACHE_CAPACITY);
        this.getAuthHeader = options.getAuthHeader;
        this.timeoutMs = options.timeoutMs ?? README_IMAGE_TIMEOUT_MS;
        this.logger = options.logger ?? consoleFallbackLogger;
    }

    /** The image at `url` as a `data:` URI, or `null` when it is refused, unreachable or not an image. */
    async fetch(url: string, sourceUrl?: string, signal?: AbortSignal): Promise<string | null> {
        if (signal?.aborted) {
            return null;
        }
        const cached = this.cache.get(url);
        if (cached !== undefined) {
            return cached;
        }
        const target = parseAllowedUrl(url);
        if (!target) {
            this.logger.debug(`[ReadmeImage] Refused ${redactUrl(url)}: only https URLs of public hosts are fetched`);
            return null;
        }

        const headers: Record<string, string> = {};
        const authorization = await this.authorizationFor(target, sourceUrl);
        if (authorization !== undefined) {
            headers['authorization'] = authorization;
        }
        if (signal?.aborted) {
            return null;
        }

        const result = await this.transport.fetch({ url, headers, signal, timeoutMs: this.timeoutMs, maxBytes: MAX_README_IMAGE_BYTES });
        if (!result.ok || result.status < 200 || result.status >= 300) {
            const reason = result.ok ? `HTTP ${result.status}` : result.code;
            this.logger.debug(`[ReadmeImage] No image at ${redactUrl(url)}: ${reason}`);
            return null;
        }
        const dataUri = toImageDataUri(headerValue(result.headers, 'content-type'), result.body, MAX_README_IMAGE_BYTES);
        if (dataUri === undefined) {
            this.logger.debug(`[ReadmeImage] ${redactUrl(url)} is empty, too large or not an image`);
            return null;
        }
        this.cache.set(url, dataUri);
        return dataUri;
    }

    clear(): void {
        this.cache.clear();
    }

    private async authorizationFor(target: URL, sourceUrl: string | undefined): Promise<string | undefined> {
        if (sourceUrl === undefined || !this.getAuthHeader || !sameOrigin(target, sourceUrl)) {
            return undefined;
        }
        try {
            return await this.getAuthHeader(sourceUrl);
        } catch {
            return undefined;
        }
    }
}

/** An https URL whose host is a name other than `localhost` or a public IP literal; anything else is refused. */
function parseAllowedUrl(url: string): URL | undefined {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== 'https:') {
        return undefined;
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (isLocalhostName(host)) {
        return undefined;
    }
    const addressClass = classifyAddress(host);
    return addressClass === undefined || addressClass === 'public' ? parsed : undefined;
}

function sameOrigin(target: URL, sourceUrl: string): boolean {
    try {
        return new URL(sourceUrl).origin === target.origin;
    } catch {
        return false;
    }
}

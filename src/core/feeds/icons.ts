/**
 * Host-side package icon resolution. Icons are fetched through the flat-container `/icon`
 * endpoint of the sources a package may be asked about and delivered as `data:` URIs, so the
 * webviews never open network connections and private feeds work with credentials.
 */

import { cacheKeys } from '../cache/CachePolicy';
import type { TieredCache } from '../cache/TieredCache';
import type { OutboundPolicy } from '../contracts';
import { normalizeId, parseVersion } from '../versioning';
import { filterAllowedSources, type FlatContainerClient, type IconFetch, type IconResolver, type ResolvedSource } from './types';

/** Cache for resolved icons: a string is a data URI, `null` a known miss, `undefined` unknown. */
export interface IconCache {
    get(key: string): string | null | undefined;
    set(key: string, value: string | null, ttlMs: number): void;
}

/** Icons that exist never change for a given package version, so a hit is kept indefinitely. */
export const ICON_FOUND_TTL_MS = Number.POSITIVE_INFINITY;
/** A miss is retried after a day — a feed may start serving icons later. */
export const ICON_MISS_TTL_MS = 24 * 60 * 60 * 1000;
/** Consecutive misses per source before that source is skipped until `reset()`. */
export const ICON_SOURCE_MISS_THRESHOLD = 5;
/** Largest icon body accepted (a details-panel icon is a few KB; this guards against HTML/login pages). */
export const MAX_ICON_BYTES = 256 * 1024;

/** Build the cache key for one package version on one source. */
export function iconCacheKey(packageId: string, version: string, sourceUrl: string): string {
    return cacheKeys.icon(packageId, version, sourceUrl);
}

/**
 * Small in-memory `IconCache` with per-entry TTL and an insertion-order eviction cap. The
 * composition root may substitute a `CachePolicy`-backed cache; this one keeps the resolver
 * usable on its own and in tests.
 */
export class MemoryIconCache implements IconCache {
    private readonly entries = new Map<string, { value: string | null; expiresAt: number }>();

    constructor(private readonly capacity = 2000, private readonly now: () => number = Date.now) {}

    get(key: string): string | null | undefined {
        const entry = this.entries.get(key);
        if (!entry) {
            return undefined;
        }
        if (entry.expiresAt <= this.now()) {
            this.entries.delete(key);
            return undefined;
        }
        return entry.value;
    }

    set(key: string, value: string | null, ttlMs: number): void {
        if (!(ttlMs > 0)) {
            this.entries.delete(key);
            return;
        }
        this.entries.delete(key);
        if (this.entries.size >= this.capacity) {
            const oldest = this.entries.keys().next();
            if (!oldest.done) {
                this.entries.delete(oldest.value);
            }
        }
        const expiresAt = Number.isFinite(ttlMs) ? this.now() + ttlMs : Number.POSITIVE_INFINITY;
        this.entries.set(key, { value, expiresAt });
    }

    get size(): number {
        return this.entries.size;
    }

    clear(): void {
        this.entries.clear();
    }
}

/**
 * `IconCache` over the core's `TieredCache`: a found icon is stored as `iconFound` (kept, persisted), a known miss as
 * `iconMissing` (24 h, persisted), so icon data URIs count against the persistent tier's byte budget (plan item
 * P1.4) instead of going around it. The lifetimes are the cache policy's; the resolver's `ttlMs` only picks the kind.
 */
export class TieredCacheIconCache implements IconCache {
    constructor(private readonly cache: Pick<TieredCache, 'get' | 'set'>) {}

    get(key: string): string | null | undefined {
        const value = this.cache.get<string | null>(key);
        return typeof value === 'string' || value === null ? value : undefined;
    }

    set(key: string, value: string | null, _ttlMs: number): void {
        this.cache.set(key, value, value === null ? 'iconMissing' : 'iconFound');
    }
}

const IMAGE_SIGNATURES: Array<{ type: string; matches: (body: Buffer) => boolean }> = [
    { type: 'image/png', matches: body => body.length >= 8 && body.readUInt32BE(0) === 0x89504e47 },
    { type: 'image/jpeg', matches: body => body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff },
    { type: 'image/gif', matches: body => body.length >= 4 && body.toString('latin1', 0, 4) === 'GIF8' },
    { type: 'image/webp', matches: body => body.length >= 12 && body.toString('latin1', 0, 4) === 'RIFF' && body.toString('latin1', 8, 12) === 'WEBP' },
    { type: 'image/x-icon', matches: body => body.length >= 4 && body.readUInt32LE(0) === 0x00010000 },
    { type: 'image/bmp', matches: body => body.length >= 2 && body.toString('latin1', 0, 2) === 'BM' },
    { type: 'image/svg+xml', matches: body => /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(body.toString('utf8', 0, Math.min(body.length, 1024)).replace(/^\uFEFF/, '')) },
];

/**
 * Normalize the declared content type, falling back to signature sniffing when a feed serves
 * icons as `application/octet-stream`. Returns `undefined` for anything that is not an image.
 */
function imageContentType(declared: string | undefined, body: Buffer): string | undefined {
    const mediaType = (declared ?? '').split(';')[0].trim().toLowerCase();
    if (mediaType.startsWith('image/')) {
        return mediaType;
    }
    if (mediaType === '' || mediaType === 'application/octet-stream' || mediaType === 'binary/octet-stream') {
        return IMAGE_SIGNATURES.find(signature => signature.matches(body))?.type;
    }
    return undefined;
}

/** Icons exist only for concrete versions; specs such as `1.*` or `[1.0,2.0)` have none. */
function isConcreteVersion(version: string): boolean {
    return parseVersion(version) !== undefined;
}

export class DefaultIconResolver implements IconResolver {
    private readonly consecutiveMisses = new Map<string, number>();
    /** One resolution per package version and source set, shared by every caller until all of them have given up. */
    private readonly inFlight = new Map<string, Flight>();

    constructor(
        private readonly flat: FlatContainerClient,
        private readonly cache: IconCache,
        private readonly policy: OutboundPolicy,
    ) {}

    /** Resolve the icon for one package version: cache, then each allowed source in order. */
    icon(sources: ResolvedSource[], packageId: string, version: string, signal?: AbortSignal): Promise<string | undefined> {
        if (!isConcreteVersion(version) || signal?.aborted) {
            return Promise.resolve(undefined);
        }
        const allowed = filterAllowedSources(this.policy, packageId, sources);
        if (allowed.length === 0) {
            return Promise.resolve(undefined);
        }

        const pending: ResolvedSource[] = [];
        for (const source of allowed) {
            const cached = this.cache.get(iconCacheKey(packageId, version, source.source.url));
            if (typeof cached === 'string') {
                return Promise.resolve(cached);
            }
            if (cached === undefined) {
                pending.push(source);
            }
        }
        if (pending.length === 0) {
            return Promise.resolve(undefined);
        }

        const flightKey = `${normalizeId(packageId)}@${version.toLowerCase()}|${pending.map(s => s.source.url).sort().join(',')}`;
        let flight = this.inFlight.get(flightKey);
        if (!flight) {
            const controller = new AbortController();
            const created: Flight = { controller, waiting: 0, promise: Promise.resolve(undefined) };
            created.promise = this.resolveFromSources(pending, packageId, version, controller.signal).finally(() => {
                if (this.inFlight.get(flightKey) === created) {
                    this.inFlight.delete(flightKey);
                }
            });
            this.inFlight.set(flightKey, created);
            flight = created;
        }
        return join(flight, signal);
    }

    /** Forget circuit-breaker state so every source is probed again (manual refresh, source changes). */
    reset(): void {
        this.consecutiveMisses.clear();
    }

    /** True when `sourceUrl` is currently skipped because it kept answering without an icon. */
    isSourceSuppressed(sourceUrl: string): boolean {
        return (this.consecutiveMisses.get(sourceUrl) ?? 0) >= ICON_SOURCE_MISS_THRESHOLD;
    }

    private async resolveFromSources(sources: ResolvedSource[], packageId: string, version: string, signal: AbortSignal): Promise<string | undefined> {
        for (const source of sources) {
            if (signal.aborted) {
                return undefined;
            }
            const sourceUrl = source.source.url;
            if (this.isSourceSuppressed(sourceUrl)) {
                continue;
            }

            let response: IconFetch;
            try {
                response = await this.flat.icon(source, packageId, version, signal);
            } catch (error) {
                response = { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
            }
            // A feed that could not answer says nothing about the icon: neither a miss for the breaker nor a cached
            // "no icon" (a 24 h miss after a transient outage, C-feeds-2). The next source may still have it.
            if (response.kind === 'failed') {
                continue;
            }

            const dataUri = response.kind === 'found' ? toDataUri(response) : undefined;
            const key = iconCacheKey(packageId, version, sourceUrl);
            if (dataUri !== undefined) {
                this.consecutiveMisses.delete(sourceUrl);
                this.cache.set(key, dataUri, ICON_FOUND_TTL_MS);
                return dataUri;
            }
            this.consecutiveMisses.set(sourceUrl, (this.consecutiveMisses.get(sourceUrl) ?? 0) + 1);
            this.cache.set(key, null, ICON_MISS_TTL_MS);
        }
        return undefined;
    }
}

interface Flight {
    promise: Promise<string | undefined>;
    /** Aborted when the last caller waiting for the flight has given up. */
    controller: AbortController;
    waiting: number;
}

/**
 * Waits for `flight` on behalf of one caller. A caller that aborts gets `undefined` at once and leaves; the flight goes on
 * for the others and stops only when nobody waits any more. A caller without a signal never leaves.
 */
function join(flight: Flight, signal: AbortSignal | undefined): Promise<string | undefined> {
    flight.waiting++;
    const leave = (): void => {
        flight.waiting--;
        if (flight.waiting === 0) {
            flight.controller.abort();
        }
    };
    if (!signal) {
        return flight.promise;
    }
    if (signal.aborted) {
        leave();
        return Promise.resolve(undefined);
    }
    return new Promise(resolve => {
        const onAbort = (): void => {
            leave();
            resolve(undefined);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        void flight.promise.then(value => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        });
    });
}

/**
 * The `data:` URI of an image body, or `undefined` for an empty body, one over `maxBytes`, or anything that is not an
 * image (an HTML login page served with status 200). Shared by the icon resolver and the README-image fetch.
 */
export function toImageDataUri(contentType: string | undefined, body: Buffer, maxBytes = MAX_ICON_BYTES): string | undefined {
    if (body.length === 0 || body.length > maxBytes) {
        return undefined;
    }
    const imageType = imageContentType(contentType, body);
    if (!imageType) {
        return undefined;
    }
    return `data:${imageType};base64,${body.toString('base64')}`;
}

function toDataUri(response: { contentType: string; body: Buffer }): string | undefined {
    return toImageDataUri(response.contentType, response.body);
}

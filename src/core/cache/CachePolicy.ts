/**
 * Single definition of cache lifetimes, invalidation scopes and key shapes for every
 * network-derived cache in `src/core`. Keys always carry every dimension that can change the
 * cached value (lower-cased id/version, source URL, prerelease flag), so two feeds can never
 * share an entry.
 */

import type { InvalidationScope } from '../../protocol/domain';

export type CacheKind =
    | 'versions'
    | 'lite'
    | 'metadata'
    | 'iconFound'
    | 'iconMissing'
    | 'search'
    | 'readme'
    | 'serviceIndex'
    | 'failedEndpoint'
    | 'vulnerability'
    | 'sources';

export interface CacheKindPolicy {
    /** Lifetime in milliseconds; `0` means the entry never expires. */
    ttlMs: number;
    /** Whether entries of this kind are written through to the persistent tier. */
    persist: boolean;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const CACHE_POLICY: Readonly<Record<CacheKind, CacheKindPolicy>> = Object.freeze({
    versions: { ttlMs: 3 * MINUTE, persist: true },
    lite: { ttlMs: 5 * MINUTE, persist: true },
    metadata: { ttlMs: 10 * MINUTE, persist: false },
    iconFound: { ttlMs: 0, persist: true },
    iconMissing: { ttlMs: 24 * HOUR, persist: true },
    search: { ttlMs: 2 * MINUTE, persist: true },
    readme: { ttlMs: 0, persist: true },
    serviceIndex: { ttlMs: 10 * MINUTE, persist: false },
    failedEndpoint: { ttlMs: 2 * MINUTE, persist: false },
    vulnerability: { ttlMs: 1 * HOUR, persist: false },
    sources: { ttlMs: 30_000, persist: false },
});

/** Returns the lifetime for a cache kind (`0` = never expires). */
export function ttlFor(kind: CacheKind): number {
    return CACHE_POLICY[kind].ttlMs;
}

export type CacheScope = 'all' | 'network' | 'sources' | 'versions' | 'icons' | 'metadata' | 'vulnerabilities';

/** Key prefix (`<kind>:`) for each kind; icons share one prefix because found/missing differ only in TTL. */
export const KEY_PREFIX = Object.freeze({
    versions: 'versions:',
    lite: 'lite:',
    metadata: 'metadata:',
    icon: 'icon:',
    search: 'search:',
    readme: 'readme:',
    serviceIndex: 'serviceIndex:',
    failedEndpoint: 'failedEndpoint:',
    vulnerability: 'vulnerability:',
    sources: 'sources:',
});

const SCOPE_PREFIXES: Readonly<Record<Exclude<CacheScope, 'all'>, readonly string[]>> = Object.freeze({
    network: [
        KEY_PREFIX.serviceIndex,
        KEY_PREFIX.failedEndpoint,
        KEY_PREFIX.search,
        KEY_PREFIX.lite,
        KEY_PREFIX.versions,
        KEY_PREFIX.metadata,
        KEY_PREFIX.vulnerability,
    ],
    sources: [KEY_PREFIX.sources, KEY_PREFIX.serviceIndex, KEY_PREFIX.failedEndpoint],
    versions: [KEY_PREFIX.versions],
    icons: [KEY_PREFIX.icon],
    metadata: [KEY_PREFIX.metadata, KEY_PREFIX.lite],
    vulnerabilities: [KEY_PREFIX.vulnerability],
});

/** Key prefixes cleared by a scope; `undefined` for `'all'` (clear everything). */
export function prefixesForScope(scope: CacheScope): readonly string[] | undefined {
    return scope === 'all' ? undefined : SCOPE_PREFIXES[scope];
}

/** Canonical form of a source URL/path for cache keys: trimmed, lower-cased, no trailing separators. */
export function normalizeSourceUrl(sourceUrl: string): string {
    return sourceUrl.trim().replace(/[\\/]+$/, '').toLowerCase();
}

function id(packageId: string): string {
    return packageId.trim().toLowerCase();
}

function version(value: string): string {
    return value.trim().toLowerCase();
}

function prerelease(includePrerelease: boolean): string {
    return includePrerelease ? 'pre' : 'stable';
}

/** Builders for every cache key; use these instead of hand-written strings. */
export const cacheKeys = {
    versions: (packageId: string, sourceUrl: string, includePrerelease: boolean, listedOnly: boolean): string =>
        `${KEY_PREFIX.versions}${id(packageId)}|${normalizeSourceUrl(sourceUrl)}|${prerelease(includePrerelease)}|${listedOnly ? 'listed' : 'full'}`,

    lite: (packageId: string, sourceUrl: string, packageVersion?: string): string =>
        `${KEY_PREFIX.lite}${id(packageId)}@${packageVersion ? version(packageVersion) : 'latest'}|${normalizeSourceUrl(sourceUrl)}`,

    metadata: (packageId: string, packageVersion: string, sourceUrl: string): string =>
        `${KEY_PREFIX.metadata}${id(packageId)}@${version(packageVersion)}|${normalizeSourceUrl(sourceUrl)}`,

    icon: (packageId: string, packageVersion: string, sourceUrl: string): string =>
        `${KEY_PREFIX.icon}${id(packageId)}@${version(packageVersion)}|${normalizeSourceUrl(sourceUrl)}`,

    readme: (packageId: string, packageVersion: string, sourceUrl: string): string =>
        `${KEY_PREFIX.readme}${id(packageId)}@${version(packageVersion)}|${normalizeSourceUrl(sourceUrl)}`,

    search: (query: string, sourceUrls: readonly string[], includePrerelease: boolean, take: number, exactMatch = false): string => {
        const sources = [...new Set(sourceUrls.map(normalizeSourceUrl))].sort().join(',');
        return `${KEY_PREFIX.search}${query.trim().toLowerCase()}|${sources}|${prerelease(includePrerelease)}|${take}|${exactMatch ? 'exact' : 'fuzzy'}`;
    },

    serviceIndex: (sourceUrl: string): string => `${KEY_PREFIX.serviceIndex}${normalizeSourceUrl(sourceUrl)}`,

    failedEndpoint: (sourceUrl: string): string => `${KEY_PREFIX.failedEndpoint}${normalizeSourceUrl(sourceUrl)}`,

    vulnerability: (sourceUrl: string): string => `${KEY_PREFIX.vulnerability}${normalizeSourceUrl(sourceUrl)}`,

    sources: (projectDir: string): string => `${KEY_PREFIX.sources}${projectDir.trim()}`,
} as const;

/**
 * Key prefixes of the entries that go stale when a package changes: its version lists and its metadata.
 * Icons and READMEs are keyed by an exact version and never change, so they are not listed. Each prefix
 * ends with the delimiter that follows the id, so `serilog` never matches `serilog.sinks.console`.
 */
export function packageKeyPrefixes(packageId: string): readonly string[] {
    const lowerId = id(packageId);
    return [
        `${KEY_PREFIX.versions}${lowerId}|`,
        `${KEY_PREFIX.lite}${lowerId}@`,
        `${KEY_PREFIX.metadata}${lowerId}@`,
    ];
}

/** What a cache drops for one invalidation: whole scopes, and the entries of single packages. */
export interface CacheInvalidation {
    scopes: readonly CacheScope[];
    packageIds: readonly string[];
}

/**
 * Translates an invalidation of query resources (ADR-002) into the feed data that those resources are
 * computed from:
 *
 *   workspace          → network, sources   everything fetched from a feed
 *   sources            → network, sources   a changed feed list or credential can change any of it
 *   package, metadata  → the packages       their version lists and metadata (`packageKeyPrefixes`)
 *   project            → nothing            project files changed, feed data did not
 *
 * Icons and READMEs are never dropped here: they are keyed by an exact version and do not change.
 */
export function invalidationToCacheScopes(scope: InvalidationScope): CacheInvalidation {
    switch (scope.kind) {
        case 'workspace':
        case 'sources':
            return { scopes: ['network', 'sources'], packageIds: [] };
        case 'package':
        case 'metadata':
            return { scopes: [], packageIds: [...scope.packageIds] };
        case 'project':
            return { scopes: [], packageIds: [] };
    }
}

/**
 * Interfaces for NuGet feed clients (`src/core/feeds`). Implementations depend only on
 * `Transport`, `CredentialProvider`, `OutboundPolicy`, `CachePolicy` and the version module.
 */

import type { DotnetRunner, Logger, OutboundPolicy, Transport } from '../contracts';
import type {
    FailedSource,
    InstalledPackage,
    NuGetSource,
    PackageMetadata,
    PackageMetadataLite,
    PackageSearchResult,
    PackageUpdate,
    PackageVulnerability,
    QuickSearchSourceResult,
} from '../../protocol/domain';

/** Resolved service endpoints from a NuGet V3 service index. */
export interface ServiceEndpoints {
    packageBaseAddress?: string;
    registrationsBaseUrl?: string;
    searchQueryService?: string;
    searchAutocompleteService?: string;
    vulnerabilityInfoUrl?: string;
    readmeUriTemplate?: string;
}

/** A source with everything needed to query it (endpoints + auth), resolved once per batch. */
export interface ResolvedSource {
    source: NuGetSource;
    endpoints: ServiceEndpoints;
    authHeader?: string;
}

export interface SourceHealth {
    /** Sources currently considered unreachable (within the failure TTL). */
    failed(): FailedSource[];
    isHealthy(sourceUrl: string): boolean;
    markFailed(sourceUrl: string, error: string): void;
    markHealthy(sourceUrl: string): void;
    /** Clears failure state so the next access retries the network. */
    reset(): void;
}

export interface ServiceIndexClient {
    /** Discover endpoints for a V3 source; `{}` for local or unreachable sources. Cached; failures cached for 120 s. */
    endpoints(sourceUrl: string, signal?: AbortSignal): Promise<ServiceEndpoints>;
    /** Resolve endpoints + auth for every enabled, remote, healthy source among `sources`. */
    resolve(sources: NuGetSource[], signal?: AbortSignal): Promise<ResolvedSource[]>;
    readonly health: SourceHealth;
    /** Probe all sources now (used by the health monitor and manual refresh). */
    probe(sources: NuGetSource[], signal?: AbortSignal): Promise<void>;
    clearCaches(): void;
}

export interface SearchOptions {
    query: string;
    includePrerelease: boolean;
    take: number;
    exactMatch?: boolean;
    signal?: AbortSignal;
}

export interface SearchClient extends SearchByIdClient {
    /** Multi-source search: V3 API for sources with a search service, CLI fallback (`dotnet package search --format json`) for the rest. */
    search(sources: ResolvedSource[], cliFallbackSources: NuGetSource[], options: SearchOptions, cwd: string): Promise<PackageSearchResult[]>;
    quickSearch(sources: ResolvedSource[], query: string, includePrerelease: boolean, perSource: number, signal?: AbortSignal): Promise<QuickSearchSourceResult[]>;
    /** `packageid:` lookup used for lite metadata (verified, authors, iconUrl, description). */
    lookup(source: ResolvedSource, packageId: string, signal?: AbortSignal): Promise<PackageMetadataLite | undefined>;
}

export interface VersionListOptions {
    includePrerelease: boolean;
    /** Only versions the server lists (excludes unlisted). Required for update candidates. */
    listedOnly: boolean;
    signal?: AbortSignal;
}

export interface RegistrationClient {
    /** All versions for a package from one source (listed-only via search/registration, otherwise the flat-container index). Sorted descending. */
    versions(source: ResolvedSource, packageId: string, options: VersionListOptions): Promise<string[] | undefined>;
    metadata(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<PackageMetadata | undefined>;
}

export interface FlatContainerClient {
    versionIndex(source: ResolvedSource, packageId: string, signal?: AbortSignal): Promise<string[] | undefined>;
    nuspec(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<string | undefined>;
    packageSize(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<number | undefined>;
    /** Download the .nupkg to a temp file; caller deletes it. */
    downloadPackage(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<string | undefined>;
    /**
     * The flat-container icon of a package version. `missing` is the feed's definitive answer that there is no usable
     * icon (404/410, no flat container, an empty, oversized or non-image body); `failed` is a transient error (network,
     * timeout, 5xx, 429, cancellation) that must not be cached as "no icon" (plan item P4.4).
     */
    icon(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<IconFetch>;
}

export type IconFetch =
    | { kind: 'found'; contentType: string; body: Buffer }
    | { kind: 'missing' }
    | { kind: 'failed'; reason: string };

export interface VulnerabilityClient {
    /** Known vulnerabilities for a package version across resolved sources (1 h TTL). */
    forPackage(sources: ResolvedSource[], packageId: string, version: string, signal?: AbortSignal): Promise<PackageVulnerability[]>;
    clear(): void;
}

export interface UpdateChecker {
    /**
     * Find updates for installed packages. Skips `declaration: 'unresolved'` and floating/range specs
     * whose resolved version is unknown. Streams each found update through `onFound`.
     */
    check(
        sources: ResolvedSource[],
        installed: InstalledPackage[],
        includePrerelease: boolean,
        onFound?: (update: PackageUpdate) => void,
        signal?: AbortSignal,
    ): Promise<{ updates: PackageUpdate[]; sourcesUnavailable: boolean }>;
}

export interface MetadataEnricher {
    /** Lite metadata (icon, verified, authors, vulnerabilities) for many packages, honouring `OutboundPolicy`. */
    enrich(sources: ResolvedSource[], packages: Array<{ id: string; version: string }>, signal?: AbortSignal): Promise<PackageMetadataLite[]>;
}

export interface MetadataResolver {
    /** Registration → flat-container nuspec → search → offline global-packages folder. */
    metadata(sources: ResolvedSource[], packageId: string, version: string, signal?: AbortSignal): Promise<PackageMetadata | undefined>;
    versions(sources: ResolvedSource[], packageId: string, options: VersionListOptions): Promise<string[]>;
    readme(sources: ResolvedSource[], packageId: string, version: string, signal?: AbortSignal): Promise<string | undefined>;
}

export interface IconResolver {
    /** `data:` URI for the package icon or undefined. Cached forever when found, 24 h when not. */
    icon(sources: ResolvedSource[], packageId: string, version: string, signal?: AbortSignal): Promise<string | undefined>;
}

export interface FeedsDeps {
    transport: Transport;
    runner: DotnetRunner;
    policy: OutboundPolicy;
    getAuthHeader: (sourceUrl: string) => Promise<string | undefined>;
    logger?: Logger;
}

/** Sources (subset of `sources`) that `policy` allows for `packageId`, preserving order. */
export function filterAllowedSources(policy: OutboundPolicy, packageId: string, sources: ResolvedSource[]): ResolvedSource[] {
    const allowed = new Set(policy.allowedSourcesFor(packageId, sources.map(s => s.source)).map(s => s.url));
    return sources.filter(s => allowed.has(s.source.url));
}

/** Search result for one exact package id, including its version list and download count. */
export interface SearchByIdClient {
    searchById(source: ResolvedSource, packageId: string, includePrerelease: boolean, signal?: AbortSignal): Promise<PackageSearchResult | undefined>;
}

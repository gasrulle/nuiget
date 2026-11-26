/**
 * The feed clients the Catalog uses. The members that hold no outbound policy are built once and shared (the service
 * index, which owns the source health, the credential provider, the flat container, the vulnerability data, the README
 * extraction and README images, the offline reader, the icon cache); the policy-bound clients are built once per
 * `nuget.config` chain through `forPolicy` (ADR-009 d.5).
 */

import { cacheKeys } from '../cache/CachePolicy';
import type { TieredCache } from '../cache/TieredCache';
import type { CredentialProvider, DotnetRunner, Logger, OutboundPolicy, Transport } from '../contracts';
import type { PackageMetadataLite } from '../../protocol/domain';
import {
    DefaultFlatContainerClient,
    DefaultIconResolver,
    DefaultMetadataEnricher,
    DefaultMetadataResolver,
    DefaultRegistrationClient,
    DefaultSearchClient,
    DefaultUpdateChecker,
    DefaultVulnerabilityClient,
    OfflineMetadataReader,
    ReadmeExtractor,
    ReadmeImageFetcher,
    TieredCacheIconCache,
    toLiteMetadata,
    type FlatContainerClient,
    type IconCache,
    type IconResolver,
    type MetadataEnricher,
    type DeprecationFetch,
    type MetadataResolver,
    type RegistrationClient,
    type ResolvedSource,
    type SearchClient,
    type ServiceIndexClient,
    type UpdateChecker,
    type VulnerabilityClient,
} from '../feeds';

/** The clients bound to one outbound policy, that is to one `nuget.config` chain. */
export interface PolicyClients {
    search: SearchClient;
    registration: RegistrationClient;
    updates: UpdateChecker;
    icons: IconResolver & { reset(): void };
    resolver: MetadataResolver;
    /** Lite metadata with live vulnerabilities, for installed rows. */
    enricher: MetadataEnricher;
    /** Lite metadata without vulnerabilities, for search results and updates: neither downloads the vulnerability data. */
    searchEnricher: MetadataEnricher;
}

export interface FeedClients {
    transport: Transport;
    serviceIndex: ServiceIndexClient;
    credentials: CredentialProvider;
    flat: FlatContainerClient;
    vulnerabilities: VulnerabilityClient;
    readme: Pick<ReadmeExtractor, 'extract'>;
    readmeImages: Pick<ReadmeImageFetcher, 'fetch' | 'clear'>;
    offline: Pick<OfflineMetadataReader, 'metadata'>;
    iconCache: IconCache;
    forPolicy(policy: OutboundPolicy): PolicyClients;
    /** Forget the service-index caches and health, the credentials, the vulnerability data and the README images. */
    reset(): void;
}

export interface FeedClientsOptions {
    transport: Transport;
    runner: DotnetRunner;
    serviceIndex: ServiceIndexClient;
    credentials: CredentialProvider;
    cache: Pick<TieredCache, 'get' | 'set'>;
    globalPackagesFolder: () => Promise<string | undefined>;
    logger?: Logger;
}

/** "Not consulted": an enricher handed this leaves `vulnerabilities` absent. */
export const NO_VULNERABILITY_DATA: VulnerabilityClient = {
    forPackage: async () => ({ vulnerabilities: [], sourcesUnavailable: true }),
    vulnerableAmong: () => undefined,
    clear() {
        // Holds nothing.
    },
};

/**
 * The lite lookup through the `lite` cache: an answer, or `null` when the source does not know the id, is kept for the
 * kind's lifetime and answered without a request. A source that could not answer (network, timeout, rate limit,
 * cancellation) is asked again next time: nothing is stored for it, so no failure is ever persisted (P9.1).
 */
export function liteLookup(search: Pick<SearchClient, 'searchById'>, cache: Pick<TieredCache, 'get' | 'set'>): Pick<SearchClient, 'lookup'> {
    return {
        async lookup(source: ResolvedSource, packageId: string, signal?: AbortSignal): Promise<PackageMetadataLite | undefined> {
            const key = cacheKeys.lite(packageId, source.source.url);
            const cached = cache.get<PackageMetadataLite | null>(key);
            if (cached !== undefined) {
                return cached ?? undefined;
            }
            const fetched = await search.searchById(source, packageId, true, signal);
            if (fetched.kind === 'failed') {
                return undefined;
            }
            const found = fetched.kind === 'found' ? toLiteMetadata(fetched.result) : undefined;
            if (signal?.aborted) {
                return found;
            }
            cache.set<PackageMetadataLite | null>(key, found ?? null, 'lite');
            return found;
        },
    };
}

/**
 * The installed version's deprecation through the `metadata` cache kind (UX-P5.2a, architecture-advisor ruling of 2026-11-26,
 * DO 6): an entry holds a `found` answer, with or without a deprecation, or a `missing` one, keyed by id, version and source,
 * and is answered without a request for the kind's lifetime (memory only). A `failed` read, and anything read after the
 * caller cancelled, is never stored, so a failure is asked again next time and never remembered as "not deprecated".
 */
export function deprecationLookup(registration: Pick<RegistrationClient, 'deprecation'>, cache: Pick<TieredCache, 'get' | 'set'>): Pick<RegistrationClient, 'deprecation'> {
    return {
        async deprecation(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<DeprecationFetch> {
            const key = cacheKeys.metadata(packageId, version, source.source.url);
            const cached = cache.get<DeprecationFetch>(key);
            if (cached !== undefined) {
                return cached;
            }
            const fetched = await registration.deprecation(source, packageId, version, signal);
            if (fetched.kind !== 'failed' && !signal?.aborted) {
                cache.set<DeprecationFetch>(key, fetched, 'metadata');
            }
            return fetched;
        },
    };
}

export function createFeedClients(options: FeedClientsOptions): FeedClients {
    const { transport, runner, serviceIndex, credentials, cache, logger } = options;
    const flat = new DefaultFlatContainerClient({ transport, logger });
    const vulnerabilities = new DefaultVulnerabilityClient({ transport, logger });
    const readme = new ReadmeExtractor(transport, flat, { logger });
    const readmeImages = new ReadmeImageFetcher(transport, { getAuthHeader: url => credentials.getAuthHeader(url), logger });
    const offline = new OfflineMetadataReader({ globalPackagesFolder: options.globalPackagesFolder, logger });
    const iconCache = new TieredCacheIconCache(cache);
    return {
        transport,
        serviceIndex,
        credentials,
        flat,
        vulnerabilities,
        readme,
        readmeImages,
        offline,
        iconCache,
        forPolicy(policy: OutboundPolicy): PolicyClients {
            const search = new DefaultSearchClient({ transport, runner, policy, logger });
            const registration = new DefaultRegistrationClient({ transport, policy, logger }, search, flat);
            const icons = new DefaultIconResolver(flat, iconCache, policy);
            const lookup = liteLookup(search, cache);
            return {
                search,
                registration,
                updates: new DefaultUpdateChecker({ policy, logger }, registration),
                icons,
                resolver: new DefaultMetadataResolver({ policy, logger }, { registration, flat, search, readme, offline }),
                // Only the installed views' enrichment reads the installed version's deprecation; Browse rows carry the search's.
                enricher: new DefaultMetadataEnricher({ policy, logger }, lookup, icons, vulnerabilities, { deprecations: deprecationLookup(registration, cache) }),
                searchEnricher: new DefaultMetadataEnricher({ policy, logger }, lookup, icons, NO_VULNERABILITY_DATA),
            };
        },
        reset() {
            serviceIndex.clearCaches();
            credentials.clear();
            vulnerabilities.clear();
            readmeImages.clear();
        },
    };
}

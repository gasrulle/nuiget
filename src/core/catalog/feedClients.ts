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
    type FlatContainerClient,
    type IconCache,
    type IconResolver,
    type MetadataEnricher,
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
    clear() {
        // Holds nothing.
    },
};

/**
 * `lookup` through the `lite` cache: an answer, or `null` when the source does not know the id, is kept for the kind's
 * lifetime and answered without a request; nothing else is stored (icons and vulnerabilities have their own caches).
 */
export function liteLookup(search: Pick<SearchClient, 'lookup'>, cache: Pick<TieredCache, 'get' | 'set'>): Pick<SearchClient, 'lookup'> {
    return {
        async lookup(source: ResolvedSource, packageId: string, signal?: AbortSignal): Promise<PackageMetadataLite | undefined> {
            const key = cacheKeys.lite(packageId, source.source.url);
            const cached = cache.get<PackageMetadataLite | null>(key);
            if (cached !== undefined) {
                return cached ?? undefined;
            }
            const found = await search.lookup(source, packageId, signal);
            if (signal?.aborted) {
                return found;
            }
            cache.set<PackageMetadataLite | null>(key, found ?? null, 'lite');
            return found;
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
                enricher: new DefaultMetadataEnricher({ policy, logger }, lookup, icons, vulnerabilities),
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

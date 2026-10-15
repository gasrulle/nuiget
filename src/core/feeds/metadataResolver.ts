/**
 * Package details across sources: for each source the policy allows for the id, in order, the registration, then the
 * flat-container nuspec, then the search service; the first source with an answer wins and names itself in `sourceUrl`.
 * When no allowed source produced metadata, for any reason, the global-packages folder answers (`offline: true`): the
 * clients do not tell a source that failed from one that does not know the package. Nothing is cached here, so the same
 * id and version from two sources never share an answer (F6); the coordinator caches under keys that carry the source.
 */

import type { PackageMetadata, PackageSearchResult } from '../../protocol/domain';
import { normalize, sortDescending } from '../versioning';
import { nuspecToMetadata, parseNuspec } from './nuspec';
import type { OfflineMetadataReader } from './offline';
import type { ReadmeExtractor } from './readme';
import {
    filterAllowedSources,
    type FeedsDeps,
    type FlatContainerClient,
    type MetadataResolver,
    type RegistrationClient,
    type ResolvedSource,
    type SearchByIdClient,
    type VersionListOptions,
    type VersionsOutcome,
} from './types';

export interface MetadataResolverClients {
    registration: RegistrationClient;
    flat: FlatContainerClient;
    search: SearchByIdClient;
    readme: Pick<ReadmeExtractor, 'extract'>;
    offline: Pick<OfflineMetadataReader, 'metadata'>;
}

/** Package metadata from a search row, for a source that has neither a registration nor a flat container. */
export function searchResultToMetadata(row: PackageSearchResult, version: string): PackageMetadata {
    const metadata: PackageMetadata = { id: row.id, version, description: row.description, authors: row.authors, dependencies: [] };
    if (row.totalDownloads !== undefined) {
        metadata.totalDownloads = row.totalDownloads;
    }
    if (row.sourceUrl !== undefined) {
        metadata.sourceUrl = row.sourceUrl;
    }
    return metadata;
}

export class DefaultMetadataResolver implements MetadataResolver {
    private readonly deps: Pick<FeedsDeps, 'policy'>;

    constructor(deps: Pick<FeedsDeps, 'policy' | 'logger'>, private readonly clients: MetadataResolverClients) {
        this.deps = deps;
    }

    async metadata(sources: ResolvedSource[], packageId: string, version: string, signal?: AbortSignal): Promise<PackageMetadata | undefined> {
        for (const source of filterAllowedSources(this.deps.policy, packageId, sources)) {
            const metadata = await this.fromSource(source, packageId, version, signal);
            if (metadata) {
                return metadata;
            }
        }
        return this.clients.offline.metadata(packageId, version);
    }

    async versions(sources: ResolvedSource[], packageId: string, options: VersionListOptions): Promise<VersionsOutcome> {
        const allowed = filterAllowedSources(this.deps.policy, packageId, sources);
        const answers = await Promise.all(allowed.map(source => this.clients.registration.versions(source, packageId, options)));
        const seen = new Set<string>();
        const versions: string[] = [];
        for (const version of answers.flatMap(answer => answer ?? [])) {
            const key = (normalize(version) ?? version).toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                versions.push(version);
            }
        }
        return { versions: sortDescending(versions), sourcesUnavailable: answers.some(answer => answer === undefined) };
    }

    readme(sources: ResolvedSource[], packageId: string, version: string, signal?: AbortSignal): Promise<string | undefined> {
        return this.clients.readme.extract(filterAllowedSources(this.deps.policy, packageId, sources), packageId, version, signal);
    }

    /** Registration, then the flat-container nuspec, then the search service of one allowed source. */
    private async fromSource(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<PackageMetadata | undefined> {
        const registered = await this.clients.registration.metadata(source, packageId, version, signal);
        if (registered) {
            return registered;
        }
        if (source.endpoints.packageBaseAddress) {
            const text = await this.clients.flat.nuspec(source, packageId, version, signal);
            const nuspec = text === undefined ? undefined : parseNuspec(text);
            if (nuspec) {
                return nuspecToMetadata(nuspec, { sourceUrl: source.source.url });
            }
        }
        if (source.endpoints.searchQueryService) {
            const fetched = await this.clients.search.searchById(source, packageId, true, signal);
            if (fetched.kind === 'found') {
                return searchResultToMetadata({ ...fetched.result, sourceUrl: source.source.url }, version);
            }
        }
        return undefined;
    }
}

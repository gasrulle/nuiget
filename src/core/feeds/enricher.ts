/**
 * Lite metadata for many packages: verification, authors and description from the first allowed source whose search
 * service knows the id, the icon as a `data:` URI from the icon resolver (which asks the policy itself), and the known
 * vulnerabilities from every source's data. A package whose vulnerability data could not be read completely keeps
 * `vulnerabilities` absent (unknown), never `[]` (none). Each package is enriched on its own; one failure leaves that entry
 * bare and the others intact.
 */

import type { Logger } from '../contracts';
import type { PackageMetadataLite } from '../../protocol/domain';
import { redact } from '../logging';
import {
    filterAllowedSources,
    type FeedsDeps,
    type IconResolver,
    type MetadataEnricher,
    type ResolvedSource,
    type SearchClient,
    type VulnerabilityClient,
} from './types';
import { consoleFallbackLogger, mapWithConcurrency } from './wire';

export const ENRICH_CONCURRENCY = 8;

export interface MetadataEnricherOptions {
    concurrency?: number;
}

export class DefaultMetadataEnricher implements MetadataEnricher {
    private readonly deps: Pick<FeedsDeps, 'policy'>;
    private readonly logger: Logger;
    private readonly concurrency: number;

    constructor(
        deps: Pick<FeedsDeps, 'policy' | 'logger'>,
        private readonly search: Pick<SearchClient, 'lookup'>,
        private readonly icons: IconResolver,
        private readonly vulnerabilities: VulnerabilityClient,
        options: MetadataEnricherOptions = {},
    ) {
        this.deps = deps;
        this.logger = deps.logger ?? consoleFallbackLogger;
        this.concurrency = options.concurrency ?? ENRICH_CONCURRENCY;
    }

    enrich(sources: ResolvedSource[], packages: Array<{ id: string; version: string }>, signal?: AbortSignal): Promise<PackageMetadataLite[]> {
        return mapWithConcurrency(packages, this.concurrency, async ({ id, version }): Promise<PackageMetadataLite> => {
            const lite: PackageMetadataLite = { id, version };
            try {
                const [found, iconUrl, known] = await Promise.all([
                    this.lookup(sources, id, signal),
                    this.icons.icon(sources, id, version, signal),
                    this.vulnerabilities.forPackage(sources, id, version, signal),
                ]);
                if (found?.verified !== undefined) {
                    lite.verified = found.verified;
                }
                if (found?.authors) {
                    lite.authors = found.authors;
                }
                if (found?.description) {
                    lite.description = found.description;
                }
                if (iconUrl !== undefined) {
                    lite.iconUrl = iconUrl;
                }
                if (!known.sourcesUnavailable) {
                    lite.vulnerabilities = known.vulnerabilities;
                }
            } catch (error) {
                this.logger.warn(`[Enrich] ${id}@${version} failed: ${redact(error instanceof Error ? error.message : String(error))}`);
            }
            return lite;
        });
    }

    /** The first allowed source, in source order, whose search service knows the id. */
    private async lookup(sources: ResolvedSource[], id: string, signal?: AbortSignal): Promise<PackageMetadataLite | undefined> {
        for (const source of filterAllowedSources(this.deps.policy, id, sources)) {
            const found = await this.search.lookup(source, id, signal);
            if (found) {
                return found;
            }
        }
        return undefined;
    }
}

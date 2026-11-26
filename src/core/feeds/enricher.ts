/**
 * Lite metadata for many packages: verification, authors and description from the first allowed source whose search
 * service knows the id, the icon as a `data:` URI from the icon resolver (which asks the policy itself), and the known
 * vulnerabilities from every source's data. A package whose vulnerability data could not be read completely keeps
 * `vulnerabilities` absent (unknown), never `[]` (none). Each package is enriched on its own; one failure leaves that entry
 * bare and the others intact. The vulnerability leg is bounded once per call (X33, UX-P4.9): past the deadline a package keeps
 * its icon and authors with `vulnerabilities` absent, and the shared data set keeps loading for the next ask. With a
 * deprecation lookup, each entry also carries the deprecation of its own version, read from the registration of the first
 * allowed source that knows it, under the same deadline (UX-P5.2a, ADR-009 d.1); a read that fails, or ends past the
 * deadline, leaves it absent.
 */

import type { Logger } from '../contracts';
import type { PackageDeprecation, PackageMetadataLite } from '../../protocol/domain';
import { redact } from '../logging';
import {
    filterAllowedSources,
    type FeedsDeps,
    type IconResolver,
    type MetadataEnricher,
    type RegistrationClient,
    type ResolvedSource,
    type SearchClient,
    type VulnerabilityClient,
} from './types';
import { consoleFallbackLogger, mapWithConcurrency } from './wire';

export const ENRICH_CONCURRENCY = 8;

/** How long one `enrich` call waits for vulnerability data before it answers without it (X33, UX-P4.9; a product budget). */
export const VULNERABILITY_WAIT_MS = 5_000;

/** What a vulnerability read resolves to once the call's deadline passed. */
const EXPIRED = Symbol('expired');

export interface MetadataEnricherOptions {
    concurrency?: number;
    /** The one deadline of a call for the vulnerability and deprecation legs; icons and authors are never bounded by it. */
    vulnerabilityWaitMs?: number;
    /** The installed version's deprecation (UX-P5.2a); without it no registration is read and `deprecation` stays absent. */
    deprecations?: Pick<RegistrationClient, 'deprecation'>;
}

export class DefaultMetadataEnricher implements MetadataEnricher {
    private readonly deps: Pick<FeedsDeps, 'policy'>;
    private readonly logger: Logger;
    private readonly concurrency: number;
    private readonly vulnerabilityWaitMs: number;
    private readonly deprecations: Pick<RegistrationClient, 'deprecation'> | undefined;

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
        this.vulnerabilityWaitMs = options.vulnerabilityWaitMs ?? VULNERABILITY_WAIT_MS;
        this.deprecations = options.deprecations;
    }

    enrich(sources: ResolvedSource[], packages: Array<{ id: string; version: string }>, signal?: AbortSignal): Promise<PackageMetadataLite[]> {
        // One deadline for the whole call: a timer per package would add up to rounds × the bound under the concurrency limit.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<typeof EXPIRED>(resolve => {
            timer = setTimeout(() => resolve(EXPIRED), this.vulnerabilityWaitMs);
        });
        // The bound is for a read still downloading: past the deadline each read gets one macrotask, so a read the loaded data
        // set answers (within microtasks) still wins, and a package reached after the deadline keeps its vulnerabilities.
        const expired = (): Promise<typeof EXPIRED> => deadline.then(() => new Promise<typeof EXPIRED>(resolve => setTimeout(() => resolve(EXPIRED), 0)));
        return mapWithConcurrency(packages, this.concurrency, async ({ id, version }): Promise<PackageMetadataLite> => {
            const lite: PackageMetadataLite = { id, version };
            // A cancelled request asks no feed for the packages it has not reached; they stay bare.
            if (signal?.aborted) {
                return lite;
            }
            try {
                const reading = this.vulnerabilities.forPackage(sources, id, version, signal);
                // A read the deadline left behind may still reject: it is no longer anyone's to report.
                reading.catch(() => undefined);
                // A deprecation read that throws leaves only `deprecation` absent, never the icon and authors beside it.
                const deprecating = this.deprecation(sources, id, version, signal).catch(() => undefined);
                const [found, iconUrl, known, deprecation] = await Promise.all([
                    this.lookup(sources, id, signal),
                    this.icons.icon(sources, id, version, signal),
                    Promise.race([reading, expired()]),
                    Promise.race([deprecating, expired()]),
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
                // Past the deadline the data is unknown: absent, never `[]` ("Empty is not unknown").
                if (known !== EXPIRED && !known.sourcesUnavailable) {
                    lite.vulnerabilities = known.vulnerabilities;
                }
                // Past the deadline, or with no source that answered, the deprecation is unknown: absent.
                if (deprecation !== EXPIRED && deprecation !== undefined) {
                    lite.deprecation = deprecation;
                }
            } catch (error) {
                if (signal?.aborted) {
                    return lite;
                }
                this.logger.warn(`[Enrich] ${id}@${version} failed: ${redact(error instanceof Error ? error.message : String(error))}`);
            }
            return lite;
        }).finally(() => clearTimeout(timer));
    }

    /**
     * The deprecation of this version from the first allowed source, in source order, whose registration answers `found`;
     * a source that does not know the version or could not answer passes to the next. `undefined` when none says.
     */
    private async deprecation(sources: ResolvedSource[], id: string, version: string, signal?: AbortSignal): Promise<PackageDeprecation | undefined> {
        if (this.deprecations === undefined) {
            return undefined;
        }
        for (const source of filterAllowedSources(this.deps.policy, id, sources)) {
            if (signal?.aborted) {
                return undefined;
            }
            const fetched = await this.deprecations.deprecation(source, id, version, signal);
            if (fetched.kind === 'found') {
                return fetched.deprecation;
            }
        }
        return undefined;
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

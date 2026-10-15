/**
 * Version lists and package metadata of one source. A listed-only list (the one update candidates come from) reads the
 * search service, which leaves unlisted versions out, or else the registration index without its `listed: false`
 * entries; a full list reads the flat-container index, which keeps them. Metadata comes from the registration leaf or
 * index. Both send a package id, so both ask the outbound policy first (ADR-005). Nothing is cached here: the Catalog
 * keys versions and metadata through the coordinator (plan item P4.9).
 */

import type { Logger } from '../contracts';
import type { PackageDependencyGroup, PackageMetadata } from '../../protocol/domain';
import { normalize, parseVersion, sortDescending } from '../versioning';
import { versionSegment } from './flatContainer';
import {
    filterAllowedSources,
    type FeedsDeps,
    type FlatContainerClient,
    type RegistrationClient,
    type ResolvedSource,
    type SearchByIdClient,
    type VersionListOptions,
} from './types';
import {
    asString,
    authHeaders,
    consoleFallbackLogger,
    isRecord,
    mapWithConcurrency,
    pathSegment,
    redactUrl,
    registrationAuthors,
    trimTrailingSlash,
    type NuGetRegistrationEntry,
    type NuGetRegistrationPage,
} from './wire';

/** Registration pages and catalog entries fetched at once for one package. */
export const REGISTRATION_CONCURRENCY = 4;

interface Leaf {
    entry: NuGetRegistrationEntry;
    listed: boolean;
}

function sameVersion(a: string, b: string): boolean {
    return (normalize(a) ?? a).toLowerCase() === (normalize(b) ?? b).toLowerCase();
}

/** Distinct versions, without prereleases unless asked, newest first. */
function finishVersions(versions: readonly string[], includePrerelease: boolean): string[] {
    const kept = new Map<string, string>();
    for (const version of versions) {
        const parsed = parseVersion(version);
        if (!parsed || (parsed.isPrerelease && !includePrerelease)) {
            continue;
        }
        const key = parsed.normalized.toLowerCase();
        if (!kept.has(key)) {
            kept.set(key, version);
        }
    }
    return sortDescending([...kept.values()]);
}

function dependencyGroups(entry: NuGetRegistrationEntry): PackageDependencyGroup[] {
    const groups = Array.isArray(entry.dependencyGroups) ? entry.dependencyGroups.filter(isRecord) : [];
    return groups.map(group => ({
        targetFramework: asString(group.targetFramework) ?? 'Any',
        dependencies: (Array.isArray(group.dependencies) ? group.dependencies.filter(isRecord) : []).flatMap(dependency => {
            const id = asString(dependency.id);
            return id ? [{ id, versionRange: asString(dependency.range) ?? asString(dependency.version) ?? '*' }] : [];
        }),
    }));
}

/** Package metadata from a catalog entry; `undefined` when the entry has no id or version. */
export function registrationToMetadata(entry: NuGetRegistrationEntry, sourceUrl: string): PackageMetadata | undefined {
    const id = asString(entry.id);
    const version = asString(entry.version);
    if (!id || !version) {
        return undefined;
    }
    const metadata: PackageMetadata = {
        id,
        version,
        description: asString(entry.description) ?? asString(entry.summary) ?? '',
        authors: registrationAuthors(entry),
        dependencies: dependencyGroups(entry),
        sourceUrl,
    };
    const license = asString(entry.licenseExpression);
    if (license) {
        metadata.license = license;
    }
    const licenseUrl = asString(entry.licenseUrl);
    if (licenseUrl) {
        metadata.licenseUrl = licenseUrl;
    }
    const projectUrl = asString(entry.projectUrl);
    if (projectUrl) {
        metadata.projectUrl = projectUrl;
    }
    const published = asString(entry.published);
    if (published) {
        metadata.published = published;
    }
    return metadata;
}

export class DefaultRegistrationClient implements RegistrationClient {
    private readonly deps: Pick<FeedsDeps, 'transport' | 'policy'>;
    private readonly logger: Logger;

    constructor(
        deps: Pick<FeedsDeps, 'transport' | 'policy' | 'logger'>,
        private readonly search: SearchByIdClient,
        private readonly flat: FlatContainerClient,
    ) {
        this.deps = deps;
        this.logger = deps.logger ?? consoleFallbackLogger;
    }

    /**
     * Versions of a package on one source, newest first. `[]` when the source does not have the package or the policy does
     * not allow asking it; `undefined` when the source could not answer.
     */
    async versions(source: ResolvedSource, packageId: string, options: VersionListOptions): Promise<string[] | undefined> {
        if (filterAllowedSources(this.deps.policy, packageId, [source]).length === 0) {
            return [];
        }
        let versions: readonly string[] | undefined;
        if (!options.listedOnly) {
            versions = await this.flat.versionIndex(source, packageId, options.signal);
        } else if (source.endpoints.searchQueryService) {
            const fetched = await this.search.searchById(source, packageId, options.includePrerelease, options.signal);
            if (fetched.kind === 'failed') {
                return undefined;
            }
            if (fetched.kind === 'missing') {
                return [];
            }
            versions = fetched.result.versions.length > 0 ? fetched.result.versions : [fetched.result.version];
        } else if (source.endpoints.registrationsBaseUrl) {
            const leaves = await this.leaves(source, packageId, options.signal);
            versions = leaves?.filter(leaf => leaf.listed).map(leaf => asString(leaf.entry.version)).filter((version): version is string => version !== undefined);
        }
        return versions === undefined ? undefined : finishVersions(versions, options.includePrerelease);
    }

    /** Registration metadata of one package version; `undefined` when it is unknown, not allowed or unreachable. */
    async metadata(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<PackageMetadata | undefined> {
        const base = source.endpoints.registrationsBaseUrl;
        if (!base || filterAllowedSources(this.deps.policy, packageId, [source]).length === 0) {
            return undefined;
        }
        const leafUrl = `${trimTrailingSlash(base.trim())}/${pathSegment(packageId)}/${versionSegment(version)}.json`;
        const leaf = await this.getJson(source, leafUrl, signal);
        let entry: NuGetRegistrationEntry | undefined;
        if (leaf.ok && isRecord(leaf.data)) {
            entry = await this.catalogEntry(source, leaf.data as NuGetRegistrationEntry, signal);
        } else {
            entry = (await this.leaves(source, packageId, signal))?.find(candidate => {
                const candidateVersion = asString(candidate.entry.version);
                return candidateVersion !== undefined && sameVersion(candidateVersion, version);
            })?.entry;
        }
        return entry ? registrationToMetadata(entry, source.source.url) : undefined;
    }

    /** Every leaf of the registration index with its catalog entry; `[]` for an unknown package, `undefined` on failure. */
    private async leaves(source: ResolvedSource, packageId: string, signal?: AbortSignal): Promise<Leaf[] | undefined> {
        const base = source.endpoints.registrationsBaseUrl;
        if (!base) {
            return undefined;
        }
        const index = await this.getJson(source, `${trimTrailingSlash(base.trim())}/${pathSegment(packageId)}/index.json`, signal);
        if (!index.ok) {
            return index.notFound ? [] : undefined;
        }
        if (!isRecord(index.data) || !Array.isArray(index.data.items)) {
            return undefined;
        }
        const pages = await mapWithConcurrency((index.data.items as unknown[]).filter(isRecord) as NuGetRegistrationPage[], REGISTRATION_CONCURRENCY, async page => {
            if (Array.isArray(page.items)) {
                return page.items;
            }
            const pageUrl = asString(page['@id']);
            const fetched = pageUrl ? await this.getJson(source, pageUrl, signal) : undefined;
            return fetched?.ok && isRecord(fetched.data) && Array.isArray(fetched.data.items) ? (fetched.data.items as NuGetRegistrationEntry[]) : undefined;
        });
        if (pages.some(page => page === undefined)) {
            return undefined;
        }
        const items = pages.flatMap(page => (page ?? []).filter(isRecord)) as NuGetRegistrationEntry[];
        const leaves = await mapWithConcurrency(items, REGISTRATION_CONCURRENCY, async (item): Promise<Leaf | undefined> => {
            const entry = await this.catalogEntry(source, item, signal);
            return entry ? { entry, listed: item.listed !== false && entry.listed !== false } : undefined;
        });
        return leaves.some(leaf => leaf === undefined) ? undefined : (leaves as Leaf[]);
    }

    /** The catalog entry of a leaf: inline, behind a URL, or the leaf itself when it carries the fields. */
    private async catalogEntry(source: ResolvedSource, leaf: NuGetRegistrationEntry, signal?: AbortSignal): Promise<NuGetRegistrationEntry | undefined> {
        const catalog = leaf.catalogEntry;
        if (isRecord(catalog)) {
            return catalog as NuGetRegistrationEntry;
        }
        if (typeof catalog === 'string') {
            const fetched = await this.getJson(source, catalog, signal);
            return fetched.ok && isRecord(fetched.data) ? (fetched.data as NuGetRegistrationEntry) : undefined;
        }
        return asString(leaf.version) ? leaf : undefined;
    }

    private async getJson(source: ResolvedSource, url: string, signal?: AbortSignal): Promise<{ ok: true; data: unknown } | { ok: false; notFound: boolean }> {
        const result = await this.deps.transport.fetchJson<unknown>({ url, headers: authHeaders(source), signal });
        if (result.ok && result.status >= 200 && result.status < 300) {
            return { ok: true, data: result.data };
        }
        const status = result.ok ? result.status : result.status;
        if (status !== 404) {
            this.logger.debug(`[Registration] ${redactUrl(url)} did not answer: ${result.ok ? `HTTP ${result.status}` : result.code}`);
        }
        return { ok: false, notFound: status === 404 };
    }
}

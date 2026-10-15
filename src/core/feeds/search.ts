/**
 * Package search across the sources a caller hands in: the V3 search service of every source that has one, and
 * `dotnet package search --format json` for the rest (local folders, feeds without a search service). A free-text query
 * goes to every source it is given; a query that names a package id (`exactMatch`, `searchById`, `lookup`) goes only to
 * the sources the outbound policy allows for that id (ADR-005). No source is special by its address, and nothing here
 * caches: the Catalog decides what to keep.
 */

import type { DotnetResult, Logger } from '../contracts';
import type { NuGetSource, PackageMetadataLite, PackageSearchResult, QuickSearchSourceResult } from '../../protocol/domain';
import { packageSearchArgs } from '../cli/commands';
import { isValidPackageId } from '../cli/validate';
import { redact, redactArgv } from '../logging';
import { normalizeId, sortDescending } from '../versioning';
import { sortByRelevance } from './relevance';
import {
    filterAllowedSources,
    type FeedsDeps,
    type ResolvedSource,
    type SearchByIdFetch,
    type SearchClient,
    type SearchOptions,
    type SearchOutcome,
} from './types';
import {
    authHeaders,
    consoleFallbackLogger,
    entryAuthors,
    entryDescription,
    entryDownloads,
    entryId,
    entryVerified,
    entryVersion,
    entryVersions,
    isRecord,
    readAutocompleteIds,
    readSearchEntries,
    redactUrl,
    type CliSearchOutput,
    type CliSearchPackage,
    type CliSearchProblem,
} from './wire';

export const SEARCH_TIMEOUT_MS = 15_000;
export const CLI_SEARCH_TIMEOUT_MS = 60_000;

export interface SearchClientOptions {
    timeoutMs?: number;
    cliTimeoutMs?: number;
}

function stripBom(text: string): string {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * The JSON document in the stdout of `dotnet package search --format json`. The SDK may write `info :` or `warn :` lines
 * before it, so the document runs from the first line that starts with `{` to the last `}`. `undefined` when there is no
 * document or it has no `searchResult` array.
 */
export function extractCliSearchOutput(stdout: string): CliSearchOutput | undefined {
    const text = stripBom(stdout);
    const lines = text.split('\n');
    let offset = 0;
    let start = -1;
    for (const line of lines) {
        if (line.trimStart().startsWith('{')) {
            start = offset + (line.length - line.trimStart().length);
            break;
        }
        offset += line.length + 1;
    }
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) {
        return undefined;
    }
    let document: unknown;
    try {
        document = JSON.parse(text.slice(start, end + 1));
    } catch {
        return undefined;
    }
    return isRecord(document) && Array.isArray(document.searchResult) ? (document as CliSearchOutput) : undefined;
}

function withoutTrailingSlash(url: string): string {
    return url.replace(/\/+$/, '');
}

/**
 * The fallback source a CLI `sourceName` stands for: the CLI echoes the configured name, or the `--source` value as given.
 */
export function cliSourceFor(sourceName: string, sources: readonly NuGetSource[]): NuGetSource | undefined {
    const name = sourceName.toLowerCase();
    return sources.find(source => source.name.toLowerCase() === name)
        ?? sources.find(source => source.url === sourceName)
        ?? sources.find(source => withoutTrailingSlash(source.url).toLowerCase() === withoutTrailingSlash(sourceName).toLowerCase());
}

/** `--exact-match` lists one entry per version: one row per id, every version newest first, the newest as `version`. */
export function groupExactMatchEntries(packages: readonly CliSearchPackage[]): PackageSearchResult[] {
    const groups = new Map<string, { id: string; versions: string[]; totalDownloads?: number }>();
    for (const entry of packages) {
        const version = entry.version ?? entry.latestVersion;
        if (typeof entry.id !== 'string' || entry.id === '' || typeof version !== 'string' || version === '') {
            continue;
        }
        const key = normalizeId(entry.id);
        const group = groups.get(key) ?? { id: entry.id, versions: [] };
        group.versions.push(version);
        if (typeof entry.totalDownloads === 'number') {
            group.totalDownloads = entry.totalDownloads;
        }
        groups.set(key, group);
    }
    return [...groups.values()].map(group => {
        const versions = sortDescending(group.versions);
        const row: PackageSearchResult = { id: group.id, version: versions[0], versions, description: '', authors: '' };
        if (group.totalDownloads !== undefined) {
            row.totalDownloads = group.totalDownloads;
        }
        return row;
    });
}

function cliRow(entry: CliSearchPackage): PackageSearchResult | undefined {
    const version = entry.latestVersion ?? entry.version;
    if (typeof entry.id !== 'string' || entry.id === '' || typeof version !== 'string' || version === '') {
        return undefined;
    }
    const row: PackageSearchResult = { id: entry.id, version, versions: [], description: '', authors: typeof entry.owners === 'string' ? entry.owners : '' };
    if (typeof entry.totalDownloads === 'number') {
        row.totalDownloads = entry.totalDownloads;
    }
    return row;
}

function searchUrl(endpoint: string, params: Record<string, string>): string | undefined {
    let url: URL;
    try {
        url = new URL(endpoint);
    } catch {
        return undefined;
    }
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}

function queryParams(q: string, take: number, includePrerelease: boolean): Record<string, string> {
    const params: Record<string, string> = { q, take: String(take), semVerLevel: '2.0.0' };
    if (includePrerelease) {
        params.prerelease = 'true';
    }
    return params;
}

type SourceAnswer = { ok: true; rows: PackageSearchResult[] } | { ok: false; reason: string };

interface CliAnswer {
    rows: PackageSearchResult[];
    origins: number;
    unavailable: boolean;
}

export class DefaultSearchClient implements SearchClient {
    private readonly deps: Pick<FeedsDeps, 'transport' | 'runner' | 'policy'>;
    private readonly logger: Logger;
    private readonly timeoutMs: number;
    private readonly cliTimeoutMs: number;

    constructor(deps: Pick<FeedsDeps, 'transport' | 'runner' | 'policy' | 'logger'>, options: SearchClientOptions = {}) {
        this.deps = deps;
        this.logger = deps.logger ?? consoleFallbackLogger;
        this.timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS;
        this.cliTimeoutMs = options.cliTimeoutMs ?? CLI_SEARCH_TIMEOUT_MS;
    }

    async search(sources: ResolvedSource[], cliFallbackSources: NuGetSource[], options: SearchOptions, cwd: string): Promise<SearchOutcome> {
        const query = options.query.trim();
        let apiSources = sources.filter(source => source.endpoints.searchQueryService);
        let cliSources = cliFallbackSources;
        if (options.exactMatch) {
            if (!isValidPackageId(query)) {
                return { results: [], sourcesUnavailable: false };
            }
            apiSources = filterAllowedSources(this.deps.policy, query, apiSources);
            cliSources = this.deps.policy.allowedSourcesFor(query, cliSources);
        }

        const q = options.exactMatch ? `packageid:${query}` : query;
        const [apiAnswers, cli] = await Promise.all([
            Promise.all(apiSources.map(source => this.searchSource(source, q, options))),
            cliSources.length > 0 ? this.searchCli(cliSources, query, options, cwd) : Promise.resolve<CliAnswer>({ rows: [], origins: 0, unavailable: false }),
        ]);

        let unavailable = cli.unavailable;
        let origins = cli.origins;
        const seen = new Set<string>();
        const merged: PackageSearchResult[] = [];
        for (const answer of apiAnswers) {
            if (!answer.ok) {
                unavailable = true;
                continue;
            }
            if (answer.rows.length > 0) {
                origins++;
            }
            for (const row of answer.rows) {
                const key = normalizeId(row.id);
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push(row);
                }
            }
        }
        for (const row of cli.rows) {
            const key = normalizeId(row.id);
            if (!seen.has(key)) {
                seen.add(key);
                merged.push(row);
            }
        }

        const ranked = origins >= 2 ? sortByRelevance(merged, query) : merged;
        return { results: ranked.slice(0, options.take), sourcesUnavailable: unavailable };
    }

    async quickSearch(sources: ResolvedSource[], query: string, includePrerelease: boolean, perSource: number, signal?: AbortSignal): Promise<QuickSearchSourceResult[]> {
        const q = query.trim();
        if (q === '') {
            return [];
        }
        const groups = await Promise.all(sources.map(async (source): Promise<QuickSearchSourceResult | undefined> => {
            const autocomplete = source.endpoints.searchAutocompleteService;
            const endpoint = autocomplete ?? source.endpoints.searchQueryService;
            const url = endpoint ? searchUrl(endpoint, queryParams(q, perSource, includePrerelease)) : undefined;
            if (!url) {
                return undefined;
            }
            const result = await this.deps.transport.fetchJson<unknown>({ url, headers: authHeaders(source), timeoutMs: this.timeoutMs, signal });
            if (!result.ok || result.status < 200 || result.status >= 300) {
                this.logger.debug(`[Search] Quick search failed at ${redactUrl(url)}: ${result.ok ? `HTTP ${result.status}` : result.code}`);
                return undefined;
            }
            const ids = autocomplete
                ? readAutocompleteIds(result.data)
                : readSearchEntries(result.data).map(entryId).filter((id): id is string => id !== undefined);
            const packageIds = ids.slice(0, perSource);
            return packageIds.length > 0 ? { sourceName: source.source.name, sourceUrl: source.source.url, packageIds } : undefined;
        }));
        return groups.filter((group): group is QuickSearchSourceResult => group !== undefined);
    }

    async searchById(source: ResolvedSource, packageId: string, includePrerelease: boolean, signal?: AbortSignal): Promise<SearchByIdFetch> {
        if (filterAllowedSources(this.deps.policy, packageId, [source]).length === 0) {
            return { kind: 'missing' };
        }
        const answer = await this.searchSource(source, `packageid:${packageId}`, { query: packageId, includePrerelease, take: 1, signal });
        if (!answer.ok) {
            return { kind: 'failed', reason: answer.reason };
        }
        const wanted = normalizeId(packageId);
        const result = answer.rows.find(row => normalizeId(row.id) === wanted);
        return result ? { kind: 'found', result } : { kind: 'missing' };
    }

    async lookup(source: ResolvedSource, packageId: string, signal?: AbortSignal): Promise<PackageMetadataLite | undefined> {
        const fetched = await this.searchById(source, packageId, true, signal);
        if (fetched.kind !== 'found') {
            return undefined;
        }
        const { id, version, verified, authors, description } = fetched.result;
        const lite: PackageMetadataLite = { id, version, authors, description };
        if (verified !== undefined) {
            lite.verified = verified;
        }
        return lite;
    }

    private async searchSource(source: ResolvedSource, q: string, options: SearchOptions): Promise<SourceAnswer> {
        const endpoint = source.endpoints.searchQueryService;
        const url = endpoint ? searchUrl(endpoint, queryParams(q, options.take, options.includePrerelease)) : undefined;
        if (!url) {
            return { ok: false, reason: 'no search service' };
        }
        const result = await this.deps.transport.fetchJson<unknown>({ url, headers: authHeaders(source), timeoutMs: this.timeoutMs, signal: options.signal });
        if (!result.ok || result.status < 200 || result.status >= 300) {
            const reason = result.ok ? `http-error ${result.status}` : result.code;
            this.logger.debug(`[Search] ${redactUrl(url)} did not answer: ${reason}`);
            return { ok: false, reason };
        }
        const rows: PackageSearchResult[] = [];
        for (const entry of readSearchEntries(result.data)) {
            const id = entryId(entry);
            const version = entryVersion(entry);
            if (!id || !version) {
                this.logger.debug(`[Search] Skipped an entry without id or version from ${redactUrl(source.source.url)}`);
                continue;
            }
            const row: PackageSearchResult = {
                id,
                version,
                versions: sortDescending(entryVersions(entry)),
                description: entryDescription(entry),
                authors: entryAuthors(entry),
                sourceUrl: source.source.url,
            };
            const downloads = entryDownloads(entry);
            if (downloads !== undefined) {
                row.totalDownloads = downloads;
            }
            const verified = entryVerified(entry);
            if (verified !== undefined) {
                row.verified = verified;
            }
            rows.push(row);
        }
        return { ok: true, rows };
    }

    private async searchCli(sources: NuGetSource[], query: string, options: SearchOptions, cwd: string): Promise<CliAnswer> {
        const unavailable: CliAnswer = { rows: [], origins: 0, unavailable: true };
        let argv: string[];
        try {
            argv = packageSearchArgs({
                query,
                sources: sources.map(source => source.url),
                prerelease: options.includePrerelease,
                exactMatch: options.exactMatch,
                // The CLI ignores --take with --exact-match and lists every version; never send the two together.
                take: options.exactMatch ? undefined : options.take,
            });
        } catch (error) {
            this.logger.warn(`[Search] Cannot search the CLI sources: ${redact(error instanceof Error ? error.message : String(error))}`);
            return unavailable;
        }
        let result: DotnetResult;
        try {
            result = await this.deps.runner.run(argv, { cwd, timeoutMs: this.cliTimeoutMs, signal: options.signal });
        } catch (error) {
            this.logger.warn(`[Search] ${redactArgv(argv).join(' ')} could not start: ${redact(error instanceof Error ? error.message : String(error))}`);
            return unavailable;
        }
        if (result.cancelled || result.timedOut) {
            this.logger.debug(`[Search] ${redactArgv(argv).join(' ')} ${result.cancelled ? 'was cancelled' : 'timed out'}`);
            return unavailable;
        }
        const output = extractCliSearchOutput(result.stdout);
        if (!output) {
            this.logger.warn(`[Search] ${redactArgv(argv).join(' ')} exited with ${result.exitCode} without a search result`);
            return unavailable;
        }

        const problems: CliSearchProblem[] = [...(output.problems ?? [])];
        const rows: PackageSearchResult[] = [];
        let origins = 0;
        for (const sourceResult of output.searchResult ?? []) {
            problems.push(...(sourceResult.problems ?? []));
            const packages = sourceResult.packages ?? [];
            const sourceRows = options.exactMatch
                ? groupExactMatchEntries(packages)
                : packages.map(cliRow).filter((row): row is PackageSearchResult => row !== undefined);
            const sourceUrl = typeof sourceResult.sourceName === 'string' ? cliSourceFor(sourceResult.sourceName, sources)?.url : undefined;
            for (const row of sourceRows) {
                if (sourceUrl !== undefined) {
                    row.sourceUrl = sourceUrl;
                }
                rows.push(row);
            }
            if (sourceRows.length > 0) {
                origins++;
            }
        }
        if (problems.length > 0) {
            const text = problems.map(problem => problem.text ?? problem.problemType ?? 'unknown problem').join('; ');
            this.logger.warn(`[Search] ${redactArgv(argv).join(' ')}: ${redact(text)}`);
        }
        return { rows, origins, unavailable: problems.length > 0 };
    }
}

/**
 * Catalog — the use cases both hosts call (ADR-009). Each read is one coordinator query over the
 * project model, so main panel and sidebar share one computation per resource and generation.
 *
 * Streams are `emit` callbacks, so that a host can forward chunks as protocol `stream` envelopes
 * while the coordinator caches the final value. A feed-dependent read resolves its sources, outbound policy and
 * credentials from one feed context per `nuget.config` chain (ADR-009 d.5): through `ProjectContextProvider.get` for a
 * project-scoped read, through the directory the host names for a read without a project. An incomplete feed answer is
 * delivered but never cached (`IncompleteResultError`, ADR-009 d.8).
 */

import type { Logger, ProjectEvaluator, ProjectInspector, QueryCoordinator, QueryHandle, SourceProvider } from '../contracts';
import { StaleQueryError } from '../contracts';
import type {
    FailedSource,
    InstalledResult,
    InvalidationReason,
    InvalidationScope,
    NuGetSource,
    PackageMetadata,
    PackageMetadataLite,
    PackageSearchResult,
    PackageUpdate,
    Project,
    QuickSearchSourceResult,
    TransitiveErrorKind,
    TransitiveResult,
} from '../../protocol/domain';
import { resourceKeys } from '../../protocol/domain';
import { filterAllowedSources, type ResolvedSource } from '../feeds';
import type { RequestChunk } from '../../protocol/messages';
import { redact } from '../logging';
import { getProjectDependencyMap, type AssetsReader, type ProjectContextProvider } from '../project';
import { batchedPromiseAll } from '../util/concurrency';
import { normalize, parseVersion, sortDescending } from '../versioning';
import type { FeedClients } from './feedClients';
import type { FeedContext, FeedContexts } from './feedContexts';

export interface CatalogDeps {
    coordinator: QueryCoordinator;
    inspector: ProjectInspector;
    /** Absent until the MSBuild evaluator exists (P6.2); `installed` then answers with the provisional result alone. */
    evaluator?: ProjectEvaluator;
    contexts: Pick<ProjectContextProvider, 'get'>;
    sources: SourceProvider;
    assets: Pick<AssetsReader, 'getPackageDependencies' | 'getTransitivePackages'>;
    /** Project discovery for the whole workspace (host adapter over `workspace.findFiles`). */
    discoverProjects: () => Promise<Project[]>;
    /** The shared feed clients (transport, service index and health, credentials, caches). */
    feeds: FeedClients;
    /** One feed context per `nuget.config` chain: sources, mapping, policy and the policy-bound clients. */
    feedContexts: FeedContexts;
    logger?: Logger;
}

/** A read that is a resource of the query coordinator, with the generation it was computed for (ADR-002). */
export interface CatalogValue<T> {
    value: T;
    /** What the host puts on the ok response; a webview compares it with the generation an invalidation lists for the key. */
    generation: number;
}

export interface InstalledQueryResult {
    result: InstalledResult;
    /** The generation of the computation that `result` (and `upgrade`) belongs to. */
    generation: number;
    /**
     * Present only when an evaluation has started. Resolves with the authoritative result, or with
     * `result` again when the evaluation fails or is superseded; never rejects.
     */
    upgrade?: Promise<InstalledResult>;
}

export interface UpdatesQueryResult {
    projectPath: string;
    updates: PackageUpdate[];
    sourcesUnavailable: boolean;
    generation: number;
}

export interface SearchQueryOptions {
    query: string;
    sourceUrls?: string[];
    includePrerelease: boolean;
    take?: number;
    exactMatch?: boolean;
}

export interface SearchQueryResult {
    results: PackageSearchResult[];
    /** An unreachable source is not an empty result. */
    sourcesUnavailable?: boolean;
}

/**
 * A feed-dependent computation that ends with an incomplete answer (`sourcesUnavailable`, offline or no metadata) throws
 * this carrier, so the coordinator stores nothing (it caches successes only); `queryWithRetry` is the one place that
 * catches it and answers its value with the handle's generation (ADR-009 d.8).
 */
export class IncompleteResultError<T> extends Error {
    readonly code = 'incomplete-result';

    constructor(readonly value: T) {
        super('incomplete feed answer');
        this.name = 'IncompleteResultError';
    }
}

type InstalledChunk = { kind: 'provisional'; result: InstalledResult } | RequestChunk<'installed/get'>;

const ALL_PROJECTS_CONCURRENCY = 4;
/** Results asked of a search that names no `take` (the default of the `nuiget.searchResultLimit` setting). */
const DEFAULT_SEARCH_TAKE = 50;
const STALE_ATTEMPTS = 3;

export class Catalog {
    constructor(private readonly deps: CatalogDeps) {}

    // ─── projects & sources ─────────────────────────────────────────────────

    projects(signal?: AbortSignal): Promise<CatalogValue<Project[]>> {
        return queryWithRetry(() => this.deps.coordinator.query<Project[]>(resourceKeys.projects(), () => this.deps.discoverProjects()), signal);
    }

    /** Sources effective for a directory. The caller names the directory; none is guessed here. */
    sources(projectDir: string, signal?: AbortSignal): Promise<CatalogValue<NuGetSource[]>> {
        return queryWithRetry(() => this.deps.coordinator.query<NuGetSource[]>(resourceKeys.sources(projectDir), () => this.deps.sources.listSources(projectDir)), signal);
    }

    // ─── single project ─────────────────────────────────────────────────────

    /**
     * Installed packages of a project. Resolves as soon as the provisional (static) result exists;
     * when an evaluation has started, `upgrade` delivers the authoritative result, which is also
     * what the coordinator caches for later readers.
     */
    async installed(projectPath: string, emit?: (chunk: RequestChunk<'installed/get'>) => void, signal?: AbortSignal): Promise<InstalledQueryResult> {
        for (let attempt = 1; ; attempt++) {
            let provisionalArrived!: (result: InstalledResult) => void;
            const provisional = new Promise<InstalledResult>(resolve => { provisionalArrived = resolve; });
            const handle = this.deps.coordinator.query<InstalledResult, InstalledChunk>(
                resourceKeys.installed(projectPath),
                (ctx, emitChunk) => this.computeInstalled(projectPath, ctx.signal, emitChunk),
                chunk => {
                    if (chunk.kind === 'provisional') {
                        provisionalArrived(chunk.result);
                    } else {
                        emit?.(chunk);
                    }
                },
            );
            releaseWhenDone(handle, signal);
            try {
                const first = await Promise.race([
                    provisional.then(result => ({ result, final: false })),
                    handle.value.then(result => ({ result, final: true })),
                ]);
                // A joiner and a cache hit see no provisional chunk: the value they get is the final one.
                return first.final
                    ? { result: first.result, generation: handle.generation }
                    : { result: first.result, generation: handle.generation, upgrade: handle.value.catch(() => first.result) };
            } catch (error) {
                if (!(error instanceof StaleQueryError)) {
                    throw error;
                }
                handle.release();
                if (attempt >= STALE_ATTEMPTS) {
                    throw error;
                }
            }
        }
    }

    private async computeInstalled(projectPath: string, signal: AbortSignal, emit: (chunk: InstalledChunk) => void): Promise<InstalledResult> {
        const [inspected, context] = await Promise.all([
            this.deps.inspector.inspect(projectPath),
            // A source listing that fails must not hide the package list.
            this.deps.contexts.get(projectPath).catch((error: unknown) => {
                this.deps.logger?.warn(redact(`Execution context of ${projectPath} could not be built: ${describe(error)}`));
                return undefined;
            }),
        ]);
        if (context !== undefined) {
            // The computation's own walk of the config chain registers the directory's feed context: no second walk.
            void this.deps.feedContexts.register(projectPath, context.context.configFiles).catch((error: unknown) => {
                this.deps.logger?.debug(redact(`Feed context of ${projectPath} could not be registered: ${describe(error)}`));
            });
        }
        // What the inspector calls unsupported stays as it is; an SDK below 10 keeps the packages (D13).
        const provisional: InstalledResult = !inspected.unsupported && context?.unsupported ? { ...inspected, unsupported: context.unsupported } : inspected;
        const evaluator = this.deps.evaluator;
        if (evaluator === undefined || provisional.unsupported || context === undefined) {
            return provisional;
        }
        emit({ kind: 'provisional', result: provisional });
        try {
            const evaluated = await evaluator.evaluate(context.context, signal);
            // Keep what only the static inspection knows (props declarations, resolved versions).
            const byId = new Map(provisional.packages.map(pkg => [pkg.id.toLowerCase(), pkg]));
            return {
                ...evaluated,
                packages: evaluated.packages.map(pkg => {
                    const prior = byId.get(pkg.id.toLowerCase());
                    return prior ? { ...prior, ...pkg, resolvedVersion: pkg.resolvedVersion ?? prior.resolvedVersion } : pkg;
                }),
            };
        } catch {
            return provisional;
        }
    }

    /**
     * Updates of a project's installed packages. Found rows stream bare through `emitFound`; the answer carries their
     * icon, verification and authors. An answer with `sourcesUnavailable` is delivered and not cached.
     */
    async updates(projectPath: string, includePrerelease: boolean, emitFound?: (update: PackageUpdate) => void, signal?: AbortSignal): Promise<UpdatesQueryResult> {
        const { value, generation } = await queryWithRetry(() => this.deps.coordinator.query<Omit<UpdatesQueryResult, 'generation'>, PackageUpdate>(
            resourceKeys.updates(projectPath, includePrerelease),
            (ctx, emit) => this.computeUpdates(projectPath, includePrerelease, emit, ctx.signal),
            emitFound,
        ), signal);
        return { ...value, generation };
    }

    private async computeUpdates(projectPath: string, includePrerelease: boolean, emit: (update: PackageUpdate) => void, signal: AbortSignal): Promise<Omit<UpdatesQueryResult, 'generation'>> {
        // `installed` first: its computation registers the chain, so the feed context below walks nothing.
        const { result, upgrade } = await this.installed(projectPath, undefined, signal);
        const final = upgrade ? await upgrade : result;
        const context = await this.deps.feedContexts.forProject(projectPath).catch((error: unknown) => {
            this.deps.logger?.warn(redact(`Feed context of ${projectPath} could not be built: ${describe(error)}`));
            return undefined;
        });
        if (context === undefined) {
            // A context that cannot be built says nothing about the updates: unknown, not empty.
            throw new IncompleteResultError({ projectPath, updates: [], sourcesUnavailable: true });
        }
        const { resolved, excluded } = await this.deps.feedContexts.resolve(context, undefined, signal);
        const checked = await context.clients.updates.check(resolved, final.packages, includePrerelease, emit, signal);
        const lite = await context.clients.searchEnricher.enrich(resolved, checked.updates.map(update => ({ id: update.id, version: update.latestVersion })), signal);
        const byId = new Map(lite.map(entry => [entry.id.toLowerCase(), entry]));
        const updates = checked.updates.map(update => {
            const entry = byId.get(update.id.toLowerCase());
            const enriched: PackageUpdate = { ...update };
            if (entry?.iconUrl !== undefined) {
                enriched.iconUrl = entry.iconUrl;
            }
            if (entry?.verified !== undefined) {
                enriched.verified = entry.verified;
            }
            if (entry?.authors !== undefined) {
                enriched.authors = entry.authors;
            }
            return enriched;
        });
        const value = { projectPath, updates, sourcesUnavailable: checked.sourcesUnavailable || excluded.length > 0 };
        if (value.sourcesUnavailable) {
            throw new IncompleteResultError(value);
        }
        return value;
    }

    transitive(projectPath: string, signal?: AbortSignal): Promise<CatalogValue<TransitiveResult>> {
        return queryWithRetry(() => this.deps.coordinator.query<TransitiveResult>(resourceKeys.transitive(projectPath), () => this.deps.assets.getTransitivePackages(projectPath)), signal);
    }

    /**
     * Lite metadata, with live vulnerabilities, for any list of package versions, under the chain of `directory`. Not a
     * resource. Under `ALL_PROJECTS` the host names the first workspace folder, so that folder's chain applies.
     */
    async transitiveMetadata(directory: string, packages: Array<{ id: string; version: string }>, signal?: AbortSignal): Promise<PackageMetadataLite[]> {
        const context = await this.deps.feedContexts.forDirectory(directory);
        const { resolved } = await this.deps.feedContexts.resolve(context, undefined, signal);
        return context.clients.enricher.enrich(resolved, packages, signal);
    }

    /** Package → dependency ids of a project, for the order of bulk edits (`PackageWorkflows`). */
    packageDependencies(projectPath: string): Promise<Map<string, string[]>> {
        return this.deps.assets.getPackageDependencies(projectPath);
    }

    /** Project → referenced projects among `projectPaths`, for the order of multi-project work. */
    projectDependencies(projectPaths: string[]): Promise<Map<string, string[]>> {
        return getProjectDependencyMap(projectPaths);
    }

    // ─── all projects (fan-outs over the per-project resources; their payload is the chunks) ───

    async allProjectsInstalled(
        emit: (chunk: RequestChunk<'allProjects/installed'>) => void,
        signal: AbortSignal,
    ): Promise<{ projectPaths: string[]; errored: Array<{ projectPath: string; error: string }> }> {
        // A fan-out is not a resource (ADR-009): it reports no generation of its own.
        const { value: projects } = await this.projects(signal);
        emit({ kind: 'start', projects });
        const errored: Array<{ projectPath: string; error: string }> = [];
        await batchedPromiseAll(projects, async project => {
            if (signal.aborted) {
                return;
            }
            const origin = { projectPath: project.path, projectName: project.name, workspaceFolder: project.workspaceFolder };
            try {
                const { result, upgrade } = await this.installed(project.path, undefined, signal);
                if (!signal.aborted) {
                    emit({ kind: 'project', chunk: { ...origin, result } });
                }
                const authoritative = await upgrade;
                // An evaluation that failed resolves with the provisional result again; nothing new to say then.
                if (authoritative !== undefined && authoritative !== result && !signal.aborted) {
                    emit({ kind: 'project', chunk: { ...origin, result: authoritative } });
                }
                if (!signal.aborted) {
                    await this.emitInstalledMetadata(project.path, authoritative ?? result, emit, signal);
                }
            } catch (error) {
                const message = redact(describe(error));
                errored.push({ projectPath: project.path, error: message });
                if (!signal.aborted) {
                    emit({ kind: 'project', chunk: { ...origin, error: message } });
                }
            }
        }, ALL_PROJECTS_CONCURRENCY);
        return { projectPaths: projects.map(project => project.path), errored };
    }

    /** Lite metadata of a project's rows as a `metadata` chunk; a failed enrichment is logged, the list is already shown. */
    private async emitInstalledMetadata(projectPath: string, result: InstalledResult, emit: (chunk: RequestChunk<'allProjects/installed'>) => void, signal: AbortSignal): Promise<void> {
        const rows = result.packages.flatMap(pkg => {
            const version = pkg.resolvedVersion ?? pkg.version;
            return parseVersion(version) ? [{ id: pkg.id, version }] : [];
        });
        if (rows.length === 0) {
            return;
        }
        try {
            const context = await this.deps.feedContexts.forProject(projectPath);
            const { resolved } = await this.deps.feedContexts.resolve(context, undefined, signal);
            const packages = await context.clients.enricher.enrich(resolved, rows, signal);
            if (!signal.aborted) {
                emit({ kind: 'metadata', projectPath, packages });
            }
        } catch (error) {
            this.deps.logger?.warn(redact(`Lite metadata of ${projectPath} could not be read: ${describe(error)}`));
        }
    }

    async allProjectsUpdates(
        includePrerelease: boolean,
        emit: (chunk: RequestChunk<'allProjects/updates'>) => void,
        signal: AbortSignal,
    ): Promise<{ projectPaths: string[]; sourcesUnavailable?: boolean }> {
        // A fan-out is not a resource (ADR-009): it reports no generation of its own.
        const { value: projects } = await this.projects(signal);
        emit({ kind: 'start', projects });
        let sourcesUnavailable = false;
        await batchedPromiseAll(projects, async project => {
            if (signal.aborted) {
                return;
            }
            const origin = { projectPath: project.path, projectName: project.name, workspaceFolder: project.workspaceFolder };
            try {
                const result = await this.updates(project.path, includePrerelease, undefined, signal);
                sourcesUnavailable ||= result.sourcesUnavailable;
                if (signal.aborted) {
                    return;
                }
                emit({ kind: 'project', chunk: { ...origin, updates: result.updates } });
                const icons: Record<string, string> = {};
                for (const update of result.updates) {
                    if (update.iconUrl !== undefined) {
                        icons[update.id.toLowerCase()] = update.iconUrl;
                    }
                }
                if (Object.keys(icons).length > 0) {
                    emit({ kind: 'icons', icons });
                }
            } catch (error) {
                if (!signal.aborted) {
                    emit({ kind: 'project', chunk: { ...origin, updates: [], error: redact(describe(error)) } });
                }
            }
        }, ALL_PROJECTS_CONCURRENCY);
        return sourcesUnavailable ? { projectPaths: projects.map(project => project.path), sourcesUnavailable } : { projectPaths: projects.map(project => project.path) };
    }

    async allProjectsTransitive(
        emit: (chunk: RequestChunk<'allProjects/transitive'>) => void,
        signal: AbortSignal,
    ): Promise<{ projectPaths: string[]; errored: Array<{ projectPath: string; errorKind: TransitiveErrorKind }> }> {
        // A fan-out is not a resource (ADR-009): it reports no generation of its own.
        const { value: projects } = await this.projects(signal);
        emit({ kind: 'start', projects });
        const errored: Array<{ projectPath: string; errorKind: TransitiveErrorKind }> = [];
        await batchedPromiseAll(projects, async project => {
            if (signal.aborted) {
                return;
            }
            const { value: result } = await this.transitive(project.path, signal);
            if (result.errorKind) {
                errored.push({ projectPath: project.path, errorKind: result.errorKind });
            }
            if (!signal.aborted) {
                emit({
                    kind: 'project',
                    chunk: { projectPath: project.path, projectName: project.name, workspaceFolder: project.workspaceFolder, frameworks: result.frameworks, dataSourceAvailable: result.dataSourceAvailable, errorKind: result.errorKind },
                });
            }
        }, ALL_PROJECTS_CONCURRENCY);
        return { projectPaths: projects.map(project => project.path), errored };
    }

    // ─── search & package details (not coordinator resources: keyed by user input) ───

    /** Search the directory's sources: API sources through their search service, the rest (local included) through the CLI. */
    async search(directory: string, options: SearchQueryOptions, emitMetadata: (packages: PackageMetadataLite[]) => void, signal: AbortSignal): Promise<SearchQueryResult> {
        const context = await this.deps.feedContexts.forDirectory(directory);
        const { selected, resolved, excluded } = await this.deps.feedContexts.resolve(context, options.sourceUrls, signal);
        const apiSources = resolved.filter(source => source.endpoints.searchQueryService);
        const apiUrls = new Set(apiSources.map(source => source.source.url));
        const excludedUrls = new Set(excluded.map(source => source.url));
        const cliFallback = selected.filter(source => !apiUrls.has(source.url) && !excludedUrls.has(source.url));
        const outcome = await context.clients.search.search(apiSources, cliFallback, {
            query: options.query,
            includePrerelease: options.includePrerelease,
            take: options.take ?? DEFAULT_SEARCH_TAKE,
            exactMatch: options.exactMatch,
            signal,
        }, directory);
        const lite = await context.clients.searchEnricher.enrich(resolved, outcome.results.map(result => ({ id: result.id, version: result.version })), signal);
        if (lite.length > 0) {
            emitMetadata(lite);
        }
        const sourcesUnavailable = outcome.sourcesUnavailable || excluded.length > 0;
        return sourcesUnavailable ? { results: outcome.results, sourcesUnavailable } : { results: outcome.results };
    }

    async quickSearch(directory: string, sourceUrls: string[], query: string, includePrerelease: boolean, perSource: number, signal: AbortSignal): Promise<QuickSearchSourceResult[]> {
        const context = await this.deps.feedContexts.forDirectory(directory);
        const { resolved } = await this.deps.feedContexts.resolve(context, sourceUrls, signal);
        return resolved.length === 0 ? [] : context.clients.search.quickSearch(resolved, query, includePrerelease, perSource, signal);
    }

    /**
     * Every version of a package (unlisted included) on the allowed sources of the directory, or on the one named. One
     * resource per source (`resourceKeys.versions(id, source.url, …)`); the `'all'` key is never written (N70).
     */
    async versions(directory: string, packageId: string, sourceUrl: string | undefined, includePrerelease: boolean, signal: AbortSignal): Promise<{ versions: string[]; sourcesUnavailable: boolean }> {
        const { context, allowed, excluded } = await this.allowedSources(directory, packageId, sourceUrl, signal);
        const answers = await Promise.all(allowed.map(source => queryWithRetry(() => this.deps.coordinator.query<{ versions: string[]; sourcesUnavailable: boolean }>(
            resourceKeys.versions(packageId, source.source.url, includePrerelease),
            async ctx => {
                const outcome = await context.clients.resolver.versions([source], packageId, { includePrerelease, listedOnly: false, signal: ctx.signal });
                if (outcome.sourcesUnavailable) {
                    throw new IncompleteResultError(outcome);
                }
                return outcome;
            },
        ), signal)));
        const seen = new Set<string>();
        const versions: string[] = [];
        for (const version of answers.flatMap(answer => answer.value.versions)) {
            const key = (normalize(version) ?? version).toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                versions.push(version);
            }
        }
        return { versions: sortDescending(versions), sourcesUnavailable: answers.some(answer => answer.value.sourcesUnavailable) || excluded.length > 0 };
    }

    /**
     * Details of one package version: the first allowed source in order whose answer is not offline, each source one
     * resource (`resourceKeys.metadata(id, version, source.url)`); when none answered, the offline copy, outside the
     * coordinator. Vulnerabilities are present when known and absent when unknown.
     */
    async metadata(directory: string, packageId: string, version: string, sourceUrl: string | undefined, signal: AbortSignal): Promise<PackageMetadata | undefined> {
        const { context, resolved, allowed } = await this.allowedSources(directory, packageId, sourceUrl, signal);
        let found: PackageMetadata | undefined;
        for (const source of allowed) {
            const { value } = await queryWithRetry(() => this.deps.coordinator.query<PackageMetadata | undefined>(
                resourceKeys.metadata(packageId, version, source.source.url),
                async ctx => {
                    const answer = await context.clients.resolver.metadata([source], packageId, version, ctx.signal);
                    // Only metadata this source gave may be cached: the coordinator has no lifetime for an offline copy.
                    if (answer === undefined || answer.offline === true) {
                        throw new IncompleteResultError<PackageMetadata | undefined>(undefined);
                    }
                    return answer;
                },
            ), signal);
            if (value !== undefined) {
                found = value;
                break;
            }
        }
        found ??= await context.clients.resolver.metadata([], packageId, version);
        if (found === undefined) {
            return undefined;
        }
        const known = await this.deps.feeds.vulnerabilities.forPackage(resolved, packageId, version, signal);
        return known.sourcesUnavailable ? found : { ...found, vulnerabilities: known.vulnerabilities };
    }

    async readme(directory: string, packageId: string, version: string, sourceUrl: string | undefined, signal: AbortSignal): Promise<string | undefined> {
        const context = await this.deps.feedContexts.forDirectory(directory);
        const { resolved } = await this.deps.feedContexts.resolve(context, sourceUrl ? [sourceUrl] : undefined, signal);
        return context.clients.resolver.readme(resolved, packageId, version, signal);
    }

    /** A README image as a `data:` URI, or `null` when it is refused, unreachable or not an image (ADR-006). */
    readmeImage(url: string, sourceUrl: string | undefined, signal?: AbortSignal): Promise<string | null> {
        return this.deps.feeds.readmeImages.fetch(url, sourceUrl, signal);
    }

    /** Warm the credentials and service indexes of the directory's sources; resolves once the chain is registered. */
    async prewarm(directory: string, sourceUrl?: string): Promise<void> {
        const context = await this.deps.feedContexts.forDirectory(directory);
        const urls = context.sources
            .filter(source => source.enabled && !source.isLocal && (sourceUrl === undefined || source.url === sourceUrl))
            .map(source => source.url);
        this.deps.feeds.credentials.prewarm(urls);
        for (const url of urls) {
            void this.deps.feeds.serviceIndex.endpoints(url).catch(() => undefined);
        }
    }

    /** Sources currently considered unreachable. */
    sourceHealth(): FailedSource[] {
        return this.deps.feeds.serviceIndex.health.failed();
    }

    private async allowedSources(directory: string, packageId: string, sourceUrl: string | undefined, signal: AbortSignal): Promise<{ context: FeedContext; resolved: ResolvedSource[]; allowed: ResolvedSource[]; excluded: NuGetSource[] }> {
        const context = await this.deps.feedContexts.forDirectory(directory);
        const { resolved, excluded } = await this.deps.feedContexts.resolve(context, sourceUrl ? [sourceUrl] : undefined, signal);
        return { context, resolved, allowed: filterAllowedSources(context.policy, packageId, resolved), excluded };
    }

    // ─── invalidation ───────────────────────────────────────────────────────

    /** The single entry for invalidation (ADR-009). */
    invalidate(scope: InvalidationScope, reason: InvalidationReason): void {
        if (scope.kind === 'sources' || scope.kind === 'workspace') {
            this.deps.sources.invalidate();
            this.deps.feedContexts.clear();
            this.deps.feeds.reset();
        }
        this.deps.coordinator.invalidate(scope, reason);
    }
}

/**
 * Ask a query and, when its generation is superseded while it runs, release the handle and ask
 * again: at most three times, the third `StaleQueryError` is thrown. The generation reported is the one
 * of the attempt that resolved.
 */
async function queryWithRetry<T>(open: () => QueryHandle<T>, signal?: AbortSignal): Promise<CatalogValue<T>> {
    for (let attempt = 1; ; attempt++) {
        const handle = open();
        releaseWhenDone(handle, signal);
        try {
            return { value: await handle.value, generation: handle.generation };
        } catch (error) {
            if (error instanceof IncompleteResultError) {
                return { value: error.value as T, generation: handle.generation };
            }
            if (!(error instanceof StaleQueryError)) {
                throw error;
            }
            handle.release();
            if (attempt >= STALE_ATTEMPTS) {
                throw error;
            }
        }
    }
}

/** With a signal the handle lives until the caller aborts; without one, until the value settles. */
function releaseWhenDone<T>(handle: QueryHandle<T>, signal: AbortSignal | undefined): void {
    const release = (): void => handle.release();
    if (signal === undefined) {
        handle.value.then(release, release);
    } else {
        signal.addEventListener('abort', release, { once: true });
    }
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Catalog — the use cases both hosts call (ADR-009). Each read is one coordinator query over the
 * project model, so main panel and sidebar share one computation per resource and generation.
 *
 * Streams are `emit` callbacks, so that a host can forward chunks as protocol `stream` envelopes
 * while the coordinator caches the final value. The methods that need a package feed are declared
 * and throw until the feeds are wired in (plan item P4.9).
 */

import type { Logger, ProjectEvaluator, ProjectInspector, QueryCoordinator, QueryHandle, SourceProvider } from '../contracts';
import { StaleQueryError } from '../contracts';
import type {
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
import type { RequestChunk } from '../../protocol/messages';
import { redact } from '../logging';
import { getProjectDependencyMap, type AssetsReader, type ProjectContextProvider } from '../project';
import { batchedPromiseAll } from '../util/concurrency';

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

/** Thrown by the Catalog methods that need a package feed, until plan item P4.9 wires the feeds in. */
export class NotYetAvailableError extends Error {
    readonly code = 'not-yet-available';

    constructor(readonly method: string, readonly item = 'P4.9') {
        super(`not-yet-available: Catalog.${method} arrives with plan item ${item}`);
        this.name = 'NotYetAvailableError';
    }
}

type InstalledChunk = { kind: 'provisional'; result: InstalledResult } | RequestChunk<'installed/get'>;

const ALL_PROJECTS_CONCURRENCY = 4;
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

    async updates(_projectPath: string, _includePrerelease: boolean, _emitFound?: (update: PackageUpdate) => void, _signal?: AbortSignal): Promise<UpdatesQueryResult> {
        throw new NotYetAvailableError('updates'); // REMOVAL GATE: P4.9
    }

    transitive(projectPath: string, signal?: AbortSignal): Promise<CatalogValue<TransitiveResult>> {
        return queryWithRetry(() => this.deps.coordinator.query<TransitiveResult>(resourceKeys.transitive(projectPath), () => this.deps.assets.getTransitivePackages(projectPath)), signal);
    }

    async transitiveMetadata(_projectPath: string | undefined, _packages: Array<{ id: string; version: string }>, _signal?: AbortSignal): Promise<PackageMetadataLite[]> {
        throw new NotYetAvailableError('transitiveMetadata'); // REMOVAL GATE: P4.9
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

    async allProjectsUpdates(
        _includePrerelease: boolean,
        _emit: (chunk: RequestChunk<'allProjects/updates'>) => void,
        _signal: AbortSignal,
    ): Promise<{ projectPaths: string[]; sourcesUnavailable?: boolean }> {
        throw new NotYetAvailableError('allProjectsUpdates'); // REMOVAL GATE: P4.9
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

    async search(_options: SearchQueryOptions, _emitMetadata: (packages: PackageMetadataLite[]) => void, _signal: AbortSignal): Promise<SearchQueryResult> {
        throw new NotYetAvailableError('search'); // REMOVAL GATE: P4.9
    }

    async quickSearch(_query: string, _sourceUrls: string[], _includePrerelease: boolean, _perSource: number, _signal: AbortSignal): Promise<QuickSearchSourceResult[]> {
        throw new NotYetAvailableError('quickSearch'); // REMOVAL GATE: P4.9
    }

    async versions(_packageId: string, _sourceUrl: string | undefined, _includePrerelease: boolean, _signal: AbortSignal): Promise<string[]> {
        throw new NotYetAvailableError('versions'); // REMOVAL GATE: P4.9
    }

    async metadata(_packageId: string, _version: string, _sourceUrl: string | undefined, _signal: AbortSignal): Promise<PackageMetadata | undefined> {
        throw new NotYetAvailableError('metadata'); // REMOVAL GATE: P4.9
    }

    async readme(_packageId: string, _version: string, _sourceUrl: string | undefined, _signal: AbortSignal): Promise<string | undefined> {
        throw new NotYetAvailableError('readme'); // REMOVAL GATE: P4.9
    }

    // ─── invalidation ───────────────────────────────────────────────────────

    /** The single entry for invalidation (ADR-009). */
    invalidate(scope: InvalidationScope, reason: InvalidationReason): void {
        if (scope.kind === 'sources' || scope.kind === 'workspace') {
            this.deps.sources.invalidate();
            // REMOVAL GATE: P4.9 (the service-index caches and the icon resolver are reset here as well)
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

import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { Logger, ProjectEvaluator, ProjectExecutionContext, QueryCoordinator, QueryHandle, SourceProvider } from '../contracts';
import { StaleQueryError } from '../contracts';
import type { InstalledResult, NuGetSource, PackageMetadata, PackageMetadataLite, PackageUpdate, Project, TransitiveResult } from '../../protocol/domain';
import { resourceKeys } from '../../protocol/domain';
import type { RequestChunk } from '../../protocol/messages';
import type { ProjectContextResult } from '../project';
import { DefaultQueryCoordinator } from '../queries';
import type { ResolvedSource, ServiceEndpoints, ServiceIndexClient } from '../feeds';
import type { NuGetConfigDocument } from '../sources';
import { Catalog, FeedContexts, type CatalogDeps, type FeedClients, type PolicyClients } from './index';

const appPath = path.resolve('/w/App/App.csproj');
const libPath = path.resolve('/w/Lib/Lib.csproj');
const app: Project = { name: 'App.csproj', path: appPath, workspaceFolder: 'w' };
const lib: Project = { name: 'Lib.csproj', path: libPath };

const provisionalOf = (projectPath: string): InstalledResult => ({
    projectPath,
    fidelity: 'provisional',
    isCpm: false,
    packages: [
        { id: 'Newtonsoft.Json', version: '13.0.3', versionType: 'standard', declaration: 'project', resolvedVersion: '13.0.3' },
        { id: 'StyleCop.Analyzers', version: '1.2.0', versionType: 'standard', declaration: 'props', definedIn: 'Directory.Build.props' },
    ],
});
const authoritativeOf = (projectPath: string): InstalledResult => ({
    projectPath,
    fidelity: 'authoritative',
    isCpm: false,
    packages: [
        { id: 'newtonsoft.json', version: '13.0.3', versionType: 'standard', declaration: 'project' },
        { id: 'Implicit.Sdk', version: '8.0.0', versionType: 'standard', declaration: 'project', isImplicit: true },
    ],
});
const contextOf = (projectPath: string): ProjectExecutionContext => ({ projectPath, projectDir: path.dirname(projectPath), configFiles: [], sourceUrls: [], revision: 'abcdef0123456789' });

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function fakeSources(listings: Record<string, NuGetSource[]> = {}) {
    const unused = async () => ({ ok: true });
    return {
        listSources: vi.fn<SourceProvider['listSources']>(async dir => listings[dir] ?? []),
        configFiles: () => [],
        add: unused,
        remove: unused,
        enable: unused,
        disable: unused,
        invalidate: vi.fn<SourceProvider['invalidate']>(),
    } satisfies SourceProvider;
}

function fakeEvaluator(evaluate: ProjectEvaluator['evaluate']) {
    return { evaluate: vi.fn(evaluate), cachedFidelity: () => undefined } satisfies ProjectEvaluator;
}

function fakeLogger() {
    return { trace: vi.fn<Logger['trace']>(), debug: vi.fn<Logger['debug']>(), info: vi.fn<Logger['info']>(), warn: vi.fn<Logger['warn']>(), error: vi.fn<Logger['error']>() } satisfies Logger;
}

const appDir = path.dirname(appPath);
const remote = (name: string, enabled = true): NuGetSource => ({ name, url: `https://${name}.example/v3/index.json`, enabled });
const localFeed: NuGetSource = { name: 'local', url: path.resolve('/feeds/local'), enabled: true, isLocal: true };

/** A config document that maps source names to package patterns. */
function mappingDocument(file: string, mapping: Record<string, string[]>): NuGetConfigDocument {
    return { path: file, sources: [], disabled: [], credentials: [], mapping: Object.entries(mapping).map(([key, patterns]) => ({ kind: 'item' as const, key, patterns })) };
}

interface FeedRigOptions {
    /** Source listing per directory. */
    listings?: Record<string, NuGetSource[]>;
    /** `nuget.config` chain per directory. */
    chains?: Record<string, string[]>;
    documents?: Record<string, NuGetConfigDocument>;
    /** URLs the service index leaves out (unhealthy). */
    unhealthy?: string[];
    /** Endpoints per URL; default: a search service. */
    endpoints?: Record<string, ServiceEndpoints>;
    getContext?: (projectPath: string) => Promise<ProjectContextResult>;
}

/** Feed clients over `vi.fn` fakes, one shared `PolicyClients`, and a real `FeedContexts` over fake config reading. */
function feedRig(options: FeedRigOptions = {}) {
    const listings = options.listings ?? { [appDir]: [remote('feed')] };
    const chains = options.chains ?? {};
    const unhealthy = new Set(options.unhealthy ?? []);
    const resolvedOf = (source: NuGetSource): ResolvedSource => ({ source, endpoints: options.endpoints?.[source.url] ?? { searchQueryService: source.url.replace('/v3/index.json', '/query') } });
    const serviceIndex = {
        endpoints: vi.fn((_sourceUrl: string, _signal?: AbortSignal) => new Promise<ServiceEndpoints>(() => undefined)),
        resolve: vi.fn(async (sources: NuGetSource[]) => sources.filter(source => source.enabled && !source.isLocal && !unhealthy.has(source.url)).map(resolvedOf)),
        health: { failed: vi.fn(() => [{ url: 'https://down.example/v3/index.json', error: 'timeout' }]), isHealthy: vi.fn(() => true), markFailed: vi.fn(), markHealthy: vi.fn(), reset: vi.fn() },
        probe: vi.fn(async () => undefined),
        clearCaches: vi.fn(),
    } satisfies ServiceIndexClient;
    const clients = {
        search: {
            search: vi.fn<PolicyClients['search']['search']>(async () => ({ results: [], sourcesUnavailable: false })),
            quickSearch: vi.fn<PolicyClients['search']['quickSearch']>(async () => []),
            searchById: vi.fn<PolicyClients['search']['searchById']>(async () => ({ kind: 'missing' })),
            lookup: vi.fn<PolicyClients['search']['lookup']>(async () => undefined),
        },
        registration: { versions: vi.fn(), metadata: vi.fn() },
        updates: { check: vi.fn<PolicyClients['updates']['check']>(async () => ({ updates: [], sourcesUnavailable: false })) },
        icons: { icon: vi.fn(async () => undefined), reset: vi.fn() },
        resolver: {
            metadata: vi.fn<PolicyClients['resolver']['metadata']>(async () => undefined),
            versions: vi.fn<PolicyClients['resolver']['versions']>(async () => ({ versions: [], sourcesUnavailable: false })),
            readme: vi.fn<PolicyClients['resolver']['readme']>(async () => '# Readme'),
        },
        enricher: { enrich: vi.fn<PolicyClients['enricher']['enrich']>(async (_sources, packages) => packages.map(({ id, version }) => ({ id, version }))) },
        searchEnricher: { enrich: vi.fn<PolicyClients['searchEnricher']['enrich']>(async (_sources, packages) => packages.map(({ id, version }) => ({ id, version }))) },
    } satisfies PolicyClients;
    const policies: unknown[] = [];
    const feeds = {
        transport: {} as FeedClients['transport'],
        serviceIndex,
        credentials: { getAuthHeader: vi.fn(async () => undefined), prewarm: vi.fn(), clear: vi.fn() },
        flat: {} as FeedClients['flat'],
        vulnerabilities: { forPackage: vi.fn<FeedClients['vulnerabilities']['forPackage']>(async () => ({ vulnerabilities: [], sourcesUnavailable: false })), clear: vi.fn() },
        readme: { extract: vi.fn() },
        readmeImages: { fetch: vi.fn(async () => 'data:image/png;base64,AAAA'), clear: vi.fn() },
        offline: { metadata: vi.fn() },
        iconCache: { get: vi.fn(), set: vi.fn() },
        forPolicy: vi.fn((policy: unknown) => {
            policies.push(policy);
            return clients;
        }),
        reset: vi.fn(),
    } satisfies FeedClients;
    const sources = fakeSources(listings);
    const contexts = {
        get: vi.fn(options.getContext ?? (async (projectPath: string): Promise<ProjectContextResult> => ({ context: { ...contextOf(projectPath), configFiles: chains[path.dirname(projectPath)] ?? [] } }))),
        configFilesFor: vi.fn(async (directory: string) => chains[directory] ?? []),
    };
    const configs = { readChain: vi.fn(async (files: readonly string[]) => files.map(file => options.documents?.[file]).filter((document): document is NuGetConfigDocument => document !== undefined)) };
    const feedContexts = new FeedContexts({ contexts, sources, configs, feeds });
    return { feeds, clients, serviceIndex, sources, contexts, feedContexts, policies, resolvedOf };
}

function makeDeps(overrides: Partial<CatalogDeps> = {}): CatalogDeps {
    const rig = feedRig();
    return {
        feeds: rig.feeds,
        feedContexts: rig.feedContexts,
        coordinator: new DefaultQueryCoordinator(),
        inspector: { inspect: vi.fn(async (projectPath: string) => provisionalOf(projectPath)) },
        contexts: { get: vi.fn(async (projectPath: string): Promise<ProjectContextResult> => ({ context: contextOf(projectPath) })) },
        sources: fakeSources(),
        assets: {
            getPackageDependencies: vi.fn(async () => new Map([['a', ['b']]])),
            getTransitivePackages: vi.fn(async (projectPath: string): Promise<TransitiveResult> => ({ projectPath, frameworks: [], dataSourceAvailable: true })),
        },
        discoverProjects: vi.fn(async () => [app, lib]),
        ...overrides,
    };
}

/** A coordinator whose handles are scripted: each `query` takes the next outcome. */
function scriptedCoordinator(outcomes: Array<{ value?: unknown; error?: unknown }>) {
    const handles: Array<QueryHandle<unknown> & { release: ReturnType<typeof vi.fn> }> = [];
    const query = vi.fn((key: string) => {
        const outcome = outcomes[handles.length];
        const value = outcome.error !== undefined ? Promise.reject(outcome.error) : Promise.resolve(outcome.value);
        value.catch(() => undefined);
        const handle = { key, generation: handles.length + 1, value, release: vi.fn() };
        handles.push(handle);
        return handle;
    });
    const coordinator = { query, invalidate: vi.fn(), generationOf: () => 0, peek: () => undefined, onDidInvalidate: () => ({ dispose: () => undefined }), dispose: () => undefined } as unknown as QueryCoordinator;
    return { coordinator, handles, query };
}

describe('Catalog.installed', () => {
    it('installed resolves before evaluator', async () => {
        const evaluation = deferred<InstalledResult>();
        const evaluator = fakeEvaluator(() => evaluation.promise);
        const deps = makeDeps({ evaluator });
        const catalog = new Catalog(deps);

        const { result, upgrade } = await catalog.installed(appPath);
        // Settled while the evaluator is still pending.
        expect(result.fidelity).toBe('provisional');
        expect(result).toEqual(provisionalOf(appPath));
        expect(upgrade).toBeDefined();
        expect(evaluator.evaluate).toHaveBeenCalledWith(contextOf(appPath), expect.any(AbortSignal));
        expect(deps.coordinator.peek(resourceKeys.installed(appPath))).toBeUndefined();

        evaluation.resolve(authoritativeOf(appPath));
        const authoritative = await upgrade;
        expect(authoritative?.fidelity).toBe('authoritative');
        // The evaluation wins where both know a field; the inspection keeps what only it knows.
        expect(authoritative?.packages).toEqual([
            { id: 'newtonsoft.json', version: '13.0.3', versionType: 'standard', declaration: 'project', resolvedVersion: '13.0.3' },
            { id: 'Implicit.Sdk', version: '8.0.0', versionType: 'standard', declaration: 'project', isImplicit: true },
        ]);
        expect(deps.coordinator.peek<InstalledResult>(resourceKeys.installed(appPath))?.value.fidelity).toBe('authoritative');
    });

    it('installed: cache hit returns the authoritative without upgrade', async () => {
        const evaluator = fakeEvaluator(async context => authoritativeOf(context.projectPath));
        const deps = makeDeps({ evaluator });
        const catalog = new Catalog(deps);
        await (await catalog.installed(appPath)).upgrade;

        const again = await catalog.installed(appPath);
        expect(again.result.fidelity).toBe('authoritative');
        expect(again.upgrade).toBeUndefined();
        expect(evaluator.evaluate).toHaveBeenCalledTimes(1);
        expect(deps.inspector.inspect).toHaveBeenCalledTimes(1);
    });

    it('a reader that joins during the evaluation gets the authoritative result without upgrade', async () => {
        const evaluation = deferred<InstalledResult>();
        const catalog = new Catalog(makeDeps({ evaluator: fakeEvaluator(() => evaluation.promise) }));
        const first = await catalog.installed(appPath);
        const joiner = catalog.installed(appPath);
        evaluation.resolve(authoritativeOf(appPath));
        expect((await joiner).result.fidelity).toBe('authoritative');
        expect((await joiner).upgrade).toBeUndefined();
        expect((await first.upgrade)?.fidelity).toBe('authoritative');
    });

    it('answers with the provisional result alone when there is no evaluator', async () => {
        const deps = makeDeps();
        const answer = await new Catalog(deps).installed(appPath);
        expect(answer).toEqual({ result: provisionalOf(appPath), generation: 1 });
        expect(deps.coordinator.peek<InstalledResult>(resourceKeys.installed(appPath))?.value.fidelity).toBe('provisional');
    });

    it('upgrade resolves with the provisional result when the evaluation fails or is superseded, and never rejects', async () => {
        const failing = new Catalog(makeDeps({ evaluator: fakeEvaluator(async () => { throw new Error('MSB4025'); }) }));
        const failed = await failing.installed(appPath);
        expect(await failed.upgrade).toBe(failed.result);

        const evaluation = deferred<InstalledResult>();
        const deps = makeDeps({ evaluator: fakeEvaluator(() => evaluation.promise) });
        const catalog = new Catalog(deps);
        const superseded = await catalog.installed(appPath);
        catalog.invalidate({ kind: 'project', projectPaths: [appPath] }, 'file-watcher');
        expect(await superseded.upgrade).toBe(superseded.result);
        evaluation.resolve(authoritativeOf(appPath));
    });

    it('installed: sdk-too-old keeps packages and marks unsupported', async () => {
        const unsupported = { reason: 'sdk-too-old' as const, message: 'requires .NET SDK 10 or newer' };
        const evaluator = fakeEvaluator(async context => authoritativeOf(context.projectPath));
        const deps = makeDeps({ evaluator, contexts: { get: async projectPath => ({ context: contextOf(projectPath), unsupported }) } });
        const { result, upgrade } = await new Catalog(deps).installed(appPath);
        expect(result.packages.length).toBeGreaterThan(0);
        expect(result.packages).toEqual(provisionalOf(appPath).packages);
        expect(result.unsupported).toEqual({ reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' });
        expect(upgrade).toBeUndefined();
        expect(evaluator.evaluate).not.toHaveBeenCalled();
    });

    it('installed: inspector unsupported wins', async () => {
        const parseFailed: InstalledResult = { projectPath: appPath, packages: [], fidelity: 'provisional', isCpm: false, unsupported: { reason: 'parse-failed', message: 'the project file or an imported props file could not be read or parsed' } };
        const evaluator = fakeEvaluator(async context => authoritativeOf(context.projectPath));
        const deps = makeDeps({
            evaluator,
            inspector: { inspect: async () => parseFailed },
            contexts: { get: async projectPath => ({ context: contextOf(projectPath), unsupported: { reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' } }) },
        });
        const { result, upgrade } = await new Catalog(deps).installed(appPath);
        expect(result).toEqual(parseFailed);
        expect(upgrade).toBeUndefined();
        expect(evaluator.evaluate).not.toHaveBeenCalled();
    });

    it('installed: context failure keeps the provisional result', async () => {
        const logger = fakeLogger();
        const evaluator = fakeEvaluator(async context => authoritativeOf(context.projectPath));
        const deps = makeDeps({ evaluator, logger, contexts: { get: async () => { throw new Error('dotnet nuget list source failed, --password hunter2'); } } });
        const { result, upgrade } = await new Catalog(deps).installed(appPath);
        expect(result).toEqual(provisionalOf(appPath));
        expect(upgrade).toBeUndefined();
        expect(evaluator.evaluate).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(`Execution context of ${appPath} could not be built: dotnet nuget list source failed, --password [REDACTED]`);
    });

    it('releases its handle when the caller aborts', async () => {
        const { coordinator, handles } = scriptedCoordinator([{ value: provisionalOf(appPath) }]);
        const controller = new AbortController();
        await new Catalog(makeDeps({ coordinator })).installed(appPath, undefined, controller.signal);
        expect(handles[0].release).not.toHaveBeenCalled();
        controller.abort();
        expect(handles[0].release).toHaveBeenCalledTimes(1);
    });
});

describe('Catalog stale retry', () => {
    it('stale retry releases handle', async () => {
        const { coordinator, handles, query } = scriptedCoordinator([{ error: new StaleQueryError(resourceKeys.projects(), 1) }, { value: [app] }]);
        // The scripted handles count from 1: the answer is the second handle's, and so is the generation.
        expect(await new Catalog(makeDeps({ coordinator })).projects()).toEqual({ value: [app], generation: 2 });
        expect(query).toHaveBeenCalledTimes(2);
        // The stale handle and the one that answered: a call without a signal releases when the value settles.
        expect(handles.map(handle => handle.release.mock.calls.length > 0)).toEqual([true, true]);

        // With a signal the answering handle lives until the caller aborts; the stale one is released at once.
        const controller = new AbortController();
        const withSignal = scriptedCoordinator([{ error: new StaleQueryError(resourceKeys.projects(), 1) }, { value: [app] }]);
        expect(await new Catalog(makeDeps({ coordinator: withSignal.coordinator })).projects(controller.signal)).toEqual({ value: [app], generation: 2 });
        expect(withSignal.handles.map(handle => handle.release.mock.calls.length)).toEqual([1, 0]);
        const installed = scriptedCoordinator([{ error: new StaleQueryError(resourceKeys.installed(appPath), 1) }, { value: provisionalOf(appPath) }]);
        expect((await new Catalog(makeDeps({ coordinator: installed.coordinator })).installed(appPath, undefined, controller.signal)).result).toEqual(provisionalOf(appPath));
        expect(installed.handles.map(handle => handle.release.mock.calls.length)).toEqual([1, 0]);
        controller.abort();
        expect(withSignal.handles[1].release).toHaveBeenCalledTimes(1);
    });

    it('stale retry gives up after three attempts', async () => {
        const errors = [1, 2, 3].map(generation => new StaleQueryError(resourceKeys.transitive(appPath), generation));
        const { coordinator, handles, query } = scriptedCoordinator(errors.map(error => ({ error })));
        await expect(new Catalog(makeDeps({ coordinator })).transitive(appPath)).rejects.toBe(errors[2]);
        expect(query).toHaveBeenCalledTimes(3);
        expect(handles.every(handle => handle.release.mock.calls.length > 0)).toBe(true);

        const installed = scriptedCoordinator(errors.map(error => ({ error })));
        await expect(new Catalog(makeDeps({ coordinator: installed.coordinator })).installed(appPath)).rejects.toBe(errors[2]);
        expect(installed.handles).toHaveLength(3);
        expect(installed.handles.every(handle => handle.release.mock.calls.length > 0)).toBe(true);
    });

    it('does not retry an error that is not stale', async () => {
        const { coordinator, query } = scriptedCoordinator([{ error: new Error('discovery failed') }, { value: [] }]);
        await expect(new Catalog(makeDeps({ coordinator })).projects()).rejects.toThrow('discovery failed');
        expect(query).toHaveBeenCalledTimes(1);
    });
});

describe('Catalog reads', () => {
    it('projects uses the projects key', async () => {
        const deps = makeDeps();
        const catalog = new Catalog(deps);
        expect(await catalog.projects()).toEqual({ value: [app, lib], generation: 1 });
        expect(await catalog.projects()).toEqual({ value: [app, lib], generation: 1 });
        expect(deps.discoverProjects).toHaveBeenCalledTimes(1);
        expect(deps.coordinator.peek(resourceKeys.projects())?.value).toEqual([app, lib]);
    });

    it('sources queries per directory', async () => {
        const dirA = path.resolve('/w/App');
        const dirB = path.resolve('/w/Lib');
        const feed: NuGetSource = { name: 'Private Feed', url: 'https://feed.example/v3/index.json', enabled: true };
        const sources = fakeSources({ [dirA]: [feed] });
        const deps = makeDeps({ sources });
        const catalog = new Catalog(deps);
        expect(await catalog.sources(dirA)).toEqual({ value: [feed], generation: 1 });
        expect(await catalog.sources(dirB)).toEqual({ value: [], generation: 1 });
        await catalog.sources(dirA);
        expect(sources.listSources.mock.calls.map(call => call[0])).toEqual([dirA, dirB]);
        expect(deps.coordinator.peek(`sources:${dirA}`)?.value).toEqual([feed]);
        expect(deps.coordinator.peek(`sources:${dirB}`)?.value).toEqual([]);
    });

    it('reads transitive packages through the coordinator and dependencies directly', async () => {
        const deps = makeDeps();
        const catalog = new Catalog(deps);
        expect(await catalog.transitive(appPath)).toEqual({ value: { projectPath: appPath, frameworks: [], dataSourceAvailable: true }, generation: 1 });
        await catalog.transitive(appPath);
        expect(deps.assets.getTransitivePackages).toHaveBeenCalledTimes(1);
        expect(await catalog.packageDependencies(appPath)).toEqual(new Map([['a', ['b']]]));
        expect(deps.assets.getPackageDependencies).toHaveBeenCalledWith(appPath);
        expect((await catalog.projectDependencies([])).size).toBe(0);
    });

    it("a cache hit and a joiner report the computation's generation", async () => {
        const discovery = deferred<Project[]>();
        const deps = makeDeps({ discoverProjects: vi.fn(() => discovery.promise) });
        const catalog = new Catalog(deps);
        const first = catalog.projects();
        const joiner = catalog.projects();
        discovery.resolve([app]);
        const answers = [await first, await joiner, await catalog.projects()];
        expect(deps.discoverProjects).toHaveBeenCalledTimes(1);
        expect(answers.map(answer => answer.generation)).toEqual([1, 1, 1]);
        expect(deps.coordinator.generationOf(resourceKeys.projects())).toBe(1);

        // After an invalidation the next read is of the next generation, the one the event lists for the key.
        deps.coordinator.invalidate({ kind: 'workspace' }, 'manual-refresh');
        deps.discoverProjects = vi.fn(async () => [app, lib]);
        expect(await new Catalog(deps).projects()).toEqual({ value: [app, lib], generation: 2 });
        expect(deps.coordinator.generationOf(resourceKeys.projects())).toBe(2);
    });

    it('a stale retry reports the generation it finally resolved for', async () => {
        const runs = [deferred<Project[]>(), deferred<Project[]>()];
        const discoverProjects = vi.fn(() => runs[discoverProjects.mock.calls.length - 1].promise);
        const deps = makeDeps({ discoverProjects });
        const answer = new Catalog(deps).projects();
        await Promise.resolve();
        // The first computation is overtaken while it runs; what it finds later is never the answer.
        deps.coordinator.invalidate({ kind: 'workspace' }, 'manual-refresh');
        runs[0].resolve([app]);
        await vi.waitFor(() => expect(discoverProjects).toHaveBeenCalledTimes(2));
        runs[1].resolve([app, lib]);
        expect(await answer).toEqual({ value: [app, lib], generation: 2 });
        expect(deps.coordinator.generationOf(resourceKeys.projects())).toBe(2);
    });

    it("installed reports the handle's generation with and without an upgrade", async () => {
        const plain = makeDeps();
        expect((await new Catalog(plain).installed(appPath)).generation).toBe(plain.coordinator.generationOf(resourceKeys.installed(appPath)));

        const evaluation = deferred<InstalledResult>();
        const deps = makeDeps({ evaluator: fakeEvaluator(() => evaluation.promise) });
        const catalog = new Catalog(deps);
        const running = await catalog.installed(appPath);
        expect(running.upgrade).toBeDefined();
        expect(running.generation).toBe(1);
        evaluation.resolve({ ...provisionalOf(appPath), fidelity: 'authoritative' });
        await running.upgrade;
        // The cache hit after the evaluation is the same computation, so the same generation.
        const hit = await catalog.installed(appPath);
        expect(hit).toMatchObject({ generation: 1, result: { fidelity: 'authoritative' } });
        expect(hit.upgrade).toBeUndefined();
        expect(deps.coordinator.generationOf(resourceKeys.installed(appPath))).toBe(1);
    });
});

describe('Catalog.invalidate', () => {
    it('invalidate: sources scope clears the source listings', () => {
        const { coordinator } = scriptedCoordinator([]);
        const sources = fakeSources();
        const catalog = new Catalog(makeDeps({ coordinator, sources }));
        catalog.invalidate({ kind: 'sources' }, 'source-changed');
        expect(sources.invalidate).toHaveBeenCalledTimes(1);
        expect(coordinator.invalidate).toHaveBeenLastCalledWith({ kind: 'sources' }, 'source-changed');
        catalog.invalidate({ kind: 'workspace' }, 'manual-refresh');
        expect(sources.invalidate).toHaveBeenCalledTimes(2);
        expect(coordinator.invalidate).toHaveBeenLastCalledWith({ kind: 'workspace' }, 'manual-refresh');
    });

    it('invalidate: project scope does not', () => {
        const { coordinator } = scriptedCoordinator([]);
        const sources = fakeSources();
        const scope = { kind: 'project' as const, projectPaths: [appPath] };
        new Catalog(makeDeps({ coordinator, sources })).invalidate(scope, 'operation');
        expect(sources.invalidate).not.toHaveBeenCalled();
        expect(coordinator.invalidate).toHaveBeenCalledWith(scope, 'operation');
    });
});

describe('Catalog all-projects fan-outs', () => {
    it('allProjectsInstalled streams protocol chunks', async () => {
        const chunks: Array<RequestChunk<'allProjects/installed'>> = [];
        const deps = makeDeps({
            inspector: { inspect: async projectPath => { if (projectPath === libPath) { throw new Error('EACCES, token=abc123'); } return provisionalOf(projectPath); } },
        });
        const result = await new Catalog(deps).allProjectsInstalled(chunk => { chunks.push(chunk); }, new AbortController().signal);
        expect(chunks[0]).toEqual({ kind: 'start', projects: [app, lib] });
        const byPath = Object.fromEntries(chunks.slice(1).map(chunk => chunk.kind === 'project' ? [chunk.chunk.projectPath, chunk.chunk] : ['', undefined]));
        expect(byPath[appPath]).toEqual({ projectPath: appPath, projectName: 'App.csproj', workspaceFolder: 'w', result: provisionalOf(appPath) });
        expect(byPath[libPath]).toEqual({ projectPath: libPath, projectName: 'Lib.csproj', workspaceFolder: undefined, error: 'EACCES, token=[REDACTED]' });
        expect(chunks).toHaveLength(3);
        expect(result).toEqual({ projectPaths: [appPath, libPath], errored: [{ projectPath: libPath, error: 'EACCES, token=[REDACTED]' }] });
    });

    it('allProjectsInstalled sends a second chunk when an evaluation delivers the authoritative result', async () => {
        const chunks: Array<RequestChunk<'allProjects/installed'>> = [];
        const deps = makeDeps({ discoverProjects: async () => [app], evaluator: fakeEvaluator(async context => authoritativeOf(context.projectPath)) });
        await new Catalog(deps).allProjectsInstalled(chunk => { chunks.push(chunk); }, new AbortController().signal);
        expect(chunks.map(chunk => chunk.kind === 'project' ? chunk.chunk.result?.fidelity : chunk.kind)).toEqual(['start', 'provisional', 'authoritative']);
    });

    it('allProjectsTransitive streams protocol chunks and lists the projects that failed', async () => {
        const chunks: Array<RequestChunk<'allProjects/transitive'>> = [];
        const deps = makeDeps({
            assets: {
                getPackageDependencies: async () => new Map(),
                getTransitivePackages: async projectPath => projectPath === libPath
                    ? { projectPath, frameworks: [], dataSourceAvailable: true, errorKind: 'parse-failed' }
                    : { projectPath, frameworks: [{ targetFramework: 'net8.0', packages: [] }], dataSourceAvailable: true },
            },
        });
        const result = await new Catalog(deps).allProjectsTransitive(chunk => { chunks.push(chunk); }, new AbortController().signal);
        expect(chunks).toEqual([
            { kind: 'start', projects: [app, lib] },
            { kind: 'project', chunk: { projectPath: appPath, projectName: 'App.csproj', workspaceFolder: 'w', frameworks: [{ targetFramework: 'net8.0', packages: [] }], dataSourceAvailable: true, errorKind: undefined } },
            { kind: 'project', chunk: { projectPath: libPath, projectName: 'Lib.csproj', workspaceFolder: undefined, frameworks: [], dataSourceAvailable: true, errorKind: 'parse-failed' } },
        ]);
        expect(result).toEqual({ projectPaths: [appPath, libPath], errored: [{ projectPath: libPath, errorKind: 'parse-failed' }] });
    });

    it('stops emitting once the caller has aborted', async () => {
        const controller = new AbortController();
        const chunks: unknown[] = [];
        const deps = makeDeps({ discoverProjects: async () => { controller.abort(); return [app, lib]; } });
        await new Catalog(deps).allProjectsInstalled(chunk => { chunks.push(chunk); }, controller.signal);
        expect(chunks).toEqual([{ kind: 'start', projects: [app, lib] }]);
    });
});

describe('Catalog feed reads', () => {
    const update = (id: string, sourceUrl = remote('feed').url): PackageUpdate => ({ id, installedVersion: '13.0.3', latestVersion: '13.0.4', sourceUrl });
    const s1 = remote('s1');
    const s2 = remote('s2');
    const s3 = remote('s3');

    function catalogWith(rig: ReturnType<typeof feedRig>, coordinator: QueryCoordinator = new DefaultQueryCoordinator()) {
        const deps = makeDeps({ coordinator, sources: rig.sources, contexts: rig.contexts, feeds: rig.feeds, feedContexts: rig.feedContexts });
        return { catalog: new Catalog(deps), coordinator: deps.coordinator as DefaultQueryCoordinator };
    }

    it('updates: streams bare found rows, answers rows enriched with icon, verified and authors, and reports its generation', async () => {
        const rig = feedRig();
        rig.clients.updates.check.mockImplementation(async (_sources, _installed, _pre, onFound) => {
            onFound?.(update('Newtonsoft.Json'));
            return { updates: [update('Newtonsoft.Json')], sourcesUnavailable: false };
        });
        rig.clients.searchEnricher.enrich.mockImplementation(async (_sources, packages) => packages.map(({ id, version }) => ({ id: id.toLowerCase(), version, iconUrl: 'data:image/png;base64,AAAA', verified: true, authors: 'James' })));
        const { catalog, coordinator } = catalogWith(rig);
        const found: PackageUpdate[] = [];

        const result = await catalog.updates(appPath, false, row => found.push(row));

        expect(found).toEqual([update('Newtonsoft.Json')]);
        expect(result).toEqual({ projectPath: appPath, updates: [{ ...update('Newtonsoft.Json'), iconUrl: 'data:image/png;base64,AAAA', verified: true, authors: 'James' }], sourcesUnavailable: false, generation: expect.any(Number) });
        expect(coordinator.peek(resourceKeys.updates(appPath, false))?.generation).toBe(result.generation);
        expect(rig.clients.searchEnricher.enrich).toHaveBeenCalledWith([rig.resolvedOf(remote('feed'))], [{ id: 'Newtonsoft.Json', version: '13.0.4' }], expect.any(AbortSignal));
        expect(rig.clients.enricher.enrich).not.toHaveBeenCalled();
    });

    it('updates: a source that could not answer is delivered with sourcesUnavailable and the resource is not cached', async () => {
        const rig = feedRig();
        rig.clients.updates.check.mockResolvedValue({ updates: [update('Newtonsoft.Json')], sourcesUnavailable: true });
        const { catalog, coordinator } = catalogWith(rig);

        const first = await catalog.updates(appPath, false);
        expect(first).toMatchObject({ updates: [update('Newtonsoft.Json')], sourcesUnavailable: true, generation: expect.any(Number) });
        expect(coordinator.peek(resourceKeys.updates(appPath, false))).toBeUndefined();

        await catalog.updates(appPath, false);
        expect(rig.clients.updates.check).toHaveBeenCalledTimes(2);
    });

    it('updates: an excluded unhealthy source sets sourcesUnavailable', async () => {
        const rig = feedRig({ listings: { [appDir]: [remote('feed'), remote('down')] }, unhealthy: [remote('down').url] });

        const result = await catalogWith(rig).catalog.updates(appPath, false);

        expect(result.sourcesUnavailable).toBe(true);
        expect(rig.clients.updates.check).toHaveBeenCalledWith([rig.resolvedOf(remote('feed'))], expect.any(Array), false, expect.any(Function), expect.any(AbortSignal));
    });

    it('updates: a context that cannot be built answers unavailable, not empty', async () => {
        const rig = feedRig({ getContext: async () => { throw new Error('dotnet nuget config paths failed'); } });

        const result = await catalogWith(rig).catalog.updates(appPath, false);

        expect(result).toMatchObject({ projectPath: appPath, updates: [], sourcesUnavailable: true });
        expect(rig.clients.updates.check).not.toHaveBeenCalled();
    });

    it('updates: both surfaces share one computation per project and prerelease flag', async () => {
        const rig = feedRig();
        const { catalog } = catalogWith(rig);

        const [main, sidebar] = await Promise.all([catalog.updates(appPath, false), catalog.updates(appPath, false)]);
        await catalog.updates(appPath, true);

        expect(main.generation).toBe(sidebar.generation);
        expect(rig.clients.updates.check).toHaveBeenCalledTimes(2);
        expect(rig.clients.updates.check.mock.calls.map(call => call[2])).toEqual([false, true]);
    });

    it('allProjectsUpdates: streams start, one project chunk and one icons chunk per project, and ORs sourcesUnavailable', async () => {
        const libDir = path.dirname(libPath);
        const rig = feedRig({ listings: { [appDir]: [remote('feed')], [libDir]: [remote('feed')] } });
        rig.clients.updates.check.mockImplementation(async (_sources, installed) => {
            const appRows = installed.some(pkg => pkg.id === 'StyleCop.Analyzers') ? [update('Newtonsoft.Json')] : [];
            return { updates: appRows, sourcesUnavailable: appRows.length === 0 };
        });
        rig.clients.searchEnricher.enrich.mockImplementation(async (_sources, packages) => packages.map(({ id, version }) => ({ id, version, iconUrl: 'data:image/png;base64,AAAA' })));
        const inspector = { inspect: vi.fn(async (projectPath: string) => (projectPath === appPath ? provisionalOf(projectPath) : { ...provisionalOf(projectPath), packages: [] })) };
        const deps = makeDeps({ sources: rig.sources, contexts: rig.contexts, feeds: rig.feeds, feedContexts: rig.feedContexts, inspector });
        const chunks: Array<RequestChunk<'allProjects/updates'>> = [];

        const result = await new Catalog(deps).allProjectsUpdates(false, chunk => chunks.push(chunk), new AbortController().signal);

        expect(result).toEqual({ projectPaths: [appPath, libPath], sourcesUnavailable: true });
        expect(chunks[0]).toEqual({ kind: 'start', projects: [app, lib] });
        expect(chunks.filter(chunk => chunk.kind === 'project').map(chunk => chunk.kind === 'project' && [chunk.chunk.projectPath, chunk.chunk.updates.length])).toEqual(expect.arrayContaining([[appPath, 1], [libPath, 0]]));
        expect(chunks.filter(chunk => chunk.kind === 'icons')).toEqual([{ kind: 'icons', icons: { 'newtonsoft.json': 'data:image/png;base64,AAAA' } }]);
    });

    it('versions: for \'all\' sources queries one resource per allowed source and merges them newest first (N70)', async () => {
        const dirA = path.resolve('/w/A');
        const dirB = path.resolve('/w/B');
        const rig = feedRig({ listings: { [dirA]: [s1, s3], [dirB]: [s2] }, chains: { [dirA]: ['/w/A/nuget.config'], [dirB]: ['/w/B/nuget.config'] } });
        const answers: Record<string, string[]> = { [s1.url]: ['1.0.0', '2.0.0'], [s2.url]: ['9.0.0'], [s3.url]: ['3.0.0', '1.0'] };
        rig.clients.resolver.versions.mockImplementation(async sources => ({ versions: answers[sources[0].source.url], sourcesUnavailable: false }));
        const coordinator = new DefaultQueryCoordinator();
        const query = vi.spyOn(coordinator, 'query');
        const { catalog } = catalogWith(rig, coordinator);
        const signal = new AbortController().signal;

        await expect(catalog.versions(dirA, 'Contoso.Lib', undefined, false, signal)).resolves.toEqual({ versions: ['3.0.0', '2.0.0', '1.0.0'], sourcesUnavailable: false });
        await expect(catalog.versions(dirB, 'Contoso.Lib', undefined, false, signal)).resolves.toEqual({ versions: ['9.0.0'], sourcesUnavailable: false });

        const keys = query.mock.calls.map(call => call[0]);
        expect(keys).toEqual([
            resourceKeys.versions('Contoso.Lib', s1.url, false),
            resourceKeys.versions('Contoso.Lib', s3.url, false),
            resourceKeys.versions('Contoso.Lib', s2.url, false),
        ]);
        expect(keys.filter(key => key.includes('|all|'))).toEqual([]);
        expect(rig.clients.resolver.versions).toHaveBeenCalledWith([rig.resolvedOf(s1)], 'Contoso.Lib', { includePrerelease: false, listedOnly: false, signal: expect.any(AbortSignal) });
    });

    it('versions: a source the policy refuses is neither asked nor read', async () => {
        const rig = feedRig({
            listings: { [appDir]: [s1, s2] },
            chains: { [appDir]: ['/w/nuget.config'] },
            documents: { '/w/nuget.config': mappingDocument('/w/nuget.config', { s1: ['Contoso.*'], s2: ['Other.*'] }) },
        });
        rig.clients.resolver.versions.mockResolvedValue({ versions: ['1.0.0'], sourcesUnavailable: false });
        const coordinator = new DefaultQueryCoordinator();
        const query = vi.spyOn(coordinator, 'query');

        await catalogWith(rig, coordinator).catalog.versions(appDir, 'Other.Lib', undefined, false, new AbortController().signal);

        expect(rig.clients.resolver.versions).toHaveBeenCalledTimes(1);
        expect(rig.clients.resolver.versions.mock.calls[0][0]).toEqual([rig.resolvedOf(s2)]);
        expect(query.mock.calls.map(call => call[0])).toEqual([resourceKeys.versions('Other.Lib', s2.url, false)]);
    });

    it('versions: an unavailable or excluded source is delivered with the flag and no resource is cached', async () => {
        const rig = feedRig({ listings: { [appDir]: [s1] } });
        rig.clients.resolver.versions.mockResolvedValue({ versions: ['1.0.0'], sourcesUnavailable: true });
        const { catalog, coordinator } = catalogWith(rig);
        const signal = new AbortController().signal;

        await expect(catalog.versions(appDir, 'Lib', undefined, false, signal)).resolves.toEqual({ versions: ['1.0.0'], sourcesUnavailable: true });
        expect(coordinator.peek(resourceKeys.versions('Lib', s1.url, false))).toBeUndefined();

        const excludedRig = feedRig({ listings: { [appDir]: [s1, s2] }, unhealthy: [s2.url] });
        excludedRig.clients.resolver.versions.mockResolvedValue({ versions: [], sourcesUnavailable: false });
        await expect(catalogWith(excludedRig).catalog.versions(appDir, 'Lib', s2.url, false, signal)).resolves.toEqual({ versions: [], sourcesUnavailable: true });
        expect(excludedRig.clients.resolver.versions).not.toHaveBeenCalled();
    });

    it('metadata: the first allowed source in order answers and is cached under its own key', async () => {
        const rig = feedRig({ listings: { [appDir]: [s1, s2] } });
        const fromS2: PackageMetadata = { id: 'Lib', version: '1.0.0', description: 'S2', authors: '', dependencies: [], sourceUrl: s2.url };
        rig.clients.resolver.metadata.mockImplementation(async sources => (sources[0]?.source.url === s2.url ? fromS2 : undefined));
        const { catalog, coordinator } = catalogWith(rig);
        const signal = new AbortController().signal;

        await expect(catalog.metadata(appDir, 'Lib', '1.0.0', undefined, signal)).resolves.toEqual({ ...fromS2, vulnerabilities: [] });
        expect(coordinator.peek(resourceKeys.metadata('Lib', '1.0.0', s2.url))?.value).toEqual(fromS2);
        expect(coordinator.peek(resourceKeys.metadata('Lib', '1.0.0', s1.url))).toBeUndefined();

        await catalog.metadata(appDir, 'Lib', '1.0.0', undefined, signal);
        expect(rig.clients.resolver.metadata.mock.calls.map(call => call[0][0]?.source.url)).toEqual([s1.url, s2.url, s1.url]);
    });

    it('metadata: an offline or missing answer is delivered and never cached', async () => {
        const rig = feedRig({ listings: { [appDir]: [s1] } });
        const offline: PackageMetadata = { id: 'Lib', version: '1.0.0', description: 'restored', authors: '', dependencies: [], offline: true };
        rig.clients.resolver.metadata.mockResolvedValue(offline);
        const { catalog, coordinator } = catalogWith(rig);
        const signal = new AbortController().signal;

        await expect(catalog.metadata(appDir, 'Lib', '1.0.0', undefined, signal)).resolves.toMatchObject({ offline: true, description: 'restored' });
        expect(coordinator.peek(resourceKeys.metadata('Lib', '1.0.0', s1.url))).toBeUndefined();
        expect(rig.clients.resolver.metadata).toHaveBeenLastCalledWith([], 'Lib', '1.0.0');

        rig.clients.resolver.metadata.mockResolvedValue(undefined);
        await expect(catalog.metadata(appDir, 'Lib', '1.0.0', undefined, signal)).resolves.toBeUndefined();
        expect(coordinator.peek(resourceKeys.metadata('Lib', '1.0.0', s1.url))).toBeUndefined();
    });

    it('metadata: vulnerabilities are present when known and absent when unavailable', async () => {
        const rig = feedRig({ listings: { [appDir]: [s1] } });
        rig.clients.resolver.metadata.mockResolvedValue({ id: 'Lib', version: '1.0.0', description: '', authors: '', dependencies: [], sourceUrl: s1.url });
        const known = { advisoryUrl: 'https://advisories.example/1', severity: 'High' as const };
        rig.feeds.vulnerabilities.forPackage.mockResolvedValueOnce({ vulnerabilities: [known], sourcesUnavailable: false }).mockResolvedValueOnce({ vulnerabilities: [], sourcesUnavailable: true });
        const { catalog } = catalogWith(rig);
        const signal = new AbortController().signal;

        await expect(catalog.metadata(appDir, 'Lib', '1.0.0', undefined, signal)).resolves.toMatchObject({ vulnerabilities: [known] });
        await expect(catalog.metadata(appDir, 'Lib', '1.0.0', undefined, signal)).resolves.not.toHaveProperty('vulnerabilities');
        expect(rig.feeds.vulnerabilities.forPackage).toHaveBeenCalledWith([rig.resolvedOf(s1)], 'Lib', '1.0.0', signal);
    });

    it('search: partitions the directory\'s sources into API, CLI fallback and excluded, runs the CLI in the directory and emits one metadata chunk before resolving', async () => {
        const plain = remote('plain');
        const down = remote('down');
        const rig = feedRig({ listings: { [appDir]: [s1, plain, localFeed, down] }, unhealthy: [down.url], endpoints: { [plain.url]: { packageBaseAddress: 'https://plain.example/flat/' } } });
        rig.clients.search.search.mockResolvedValue({ results: [{ id: 'Lib', version: '1.0.0', versions: [], description: '', authors: '' }], sourcesUnavailable: false });
        const events: string[] = [];
        rig.clients.searchEnricher.enrich.mockImplementation(async (_sources, packages): Promise<PackageMetadataLite[]> => packages.map(({ id, version }) => ({ id, version, authors: 'Ada' })));
        const signal = new AbortController().signal;

        const result = await catalogWith(rig).catalog.search(appDir, { query: 'lib', includePrerelease: true, take: 10 }, packages => events.push(`metadata ${packages.length}`), signal).then(value => {
            events.push('resolved');
            return value;
        });

        expect(rig.clients.search.search).toHaveBeenCalledWith([rig.resolvedOf(s1)], [plain, localFeed], { query: 'lib', includePrerelease: true, take: 10, exactMatch: undefined, signal }, appDir);
        expect(result).toEqual({ results: [expect.objectContaining({ id: 'Lib' })], sourcesUnavailable: true });
        expect(events).toEqual(['metadata 1', 'resolved']);
    });

    it('search: a selected source that is not enabled in the directory is ignored', async () => {
        const rig = feedRig({ listings: { [appDir]: [s1, remote('off', false)] } });

        await catalogWith(rig).catalog.search(appDir, { query: 'lib', includePrerelease: false, sourceUrls: [remote('off').url, 'https://unknown.example/v3/index.json'] }, () => undefined, new AbortController().signal);

        expect(rig.serviceIndex.resolve).toHaveBeenCalledWith([], expect.any(AbortSignal));
        expect(rig.clients.search.search).toHaveBeenCalledWith([], [], expect.objectContaining({ take: 50 }), appDir);
    });

    it('quickSearch: intersects the asked sources with the directory\'s and answers [] without one', async () => {
        const rig = feedRig({ listings: { [appDir]: [s1, s2] } });
        const { catalog } = catalogWith(rig);
        const signal = new AbortController().signal;

        await catalog.quickSearch(appDir, [s2.url, 'https://other.example/v3/index.json'], 'lib', false, 5, signal);
        expect(rig.clients.search.quickSearch).toHaveBeenCalledWith([rig.resolvedOf(s2)], 'lib', false, 5, signal);

        await expect(catalog.quickSearch(appDir, [], 'lib', false, 5, signal)).resolves.toEqual([]);
        expect(rig.clients.search.quickSearch).toHaveBeenCalledTimes(1);
    });

    it('transitiveMetadata: lite metadata for any package list with live vulnerabilities', async () => {
        const rig = feedRig();
        const packages = [{ id: 'A', version: '1.0.0' }, { id: 'B', version: '2.0.0' }];

        await expect(catalogWith(rig).catalog.transitiveMetadata(appDir, packages)).resolves.toEqual(packages);

        expect(rig.clients.enricher.enrich).toHaveBeenCalledWith([rig.resolvedOf(remote('feed'))], packages, undefined);
        expect(rig.clients.searchEnricher.enrich).not.toHaveBeenCalled();
    });

    it('readme and readmeImage delegate with the signal', async () => {
        const rig = feedRig({ listings: { [appDir]: [s1, s2] } });
        const { catalog } = catalogWith(rig);
        const signal = new AbortController().signal;

        await expect(catalog.readme(appDir, 'Lib', '1.0.0', s2.url, signal)).resolves.toBe('# Readme');
        expect(rig.clients.resolver.readme).toHaveBeenCalledWith([rig.resolvedOf(s2)], 'Lib', '1.0.0', signal);
        await expect(catalog.readmeImage('https://img.example/a.png', s1.url, signal)).resolves.toBe('data:image/png;base64,AAAA');
        expect(rig.feeds.readmeImages.fetch).toHaveBeenCalledWith('https://img.example/a.png', s1.url, signal);
    });

    it('prewarm registers the directory\'s chain before warming credentials and service indexes, and resolves at once', async () => {
        const rig = feedRig({ listings: { [appDir]: [s1, remote('off', false), localFeed, s2] } });
        const order: string[] = [];
        rig.contexts.configFilesFor.mockImplementation(async () => {
            order.push('chain');
            return [];
        });
        rig.feeds.credentials.prewarm.mockImplementation(() => order.push('credentials'));
        const { catalog } = catalogWith(rig);

        await catalog.prewarm(appDir);
        await catalog.prewarm(appDir, s2.url);

        expect(order).toEqual(['chain', 'credentials', 'credentials']);
        expect(rig.feeds.credentials.prewarm.mock.calls).toEqual([[[s1.url, s2.url]], [[s2.url]]]);
        expect(rig.serviceIndex.endpoints.mock.calls.map(call => call[0])).toEqual([s1.url, s2.url, s2.url]);
        expect(catalog.sourceHealth()).toEqual([{ url: 'https://down.example/v3/index.json', error: 'timeout' }]);
    });

    it('invalidate: sources and workspace clear the feed contexts, the service-index caches, the icon resolvers and the README-image cache; project and metadata do not', async () => {
        const rig = feedRig();
        const { catalog } = catalogWith(rig);
        const signal = new AbortController().signal;
        await catalog.quickSearch(appDir, [remote('feed').url], 'x', false, 5, signal);

        catalog.invalidate({ kind: 'project', projectPaths: [appPath] }, 'operation');
        catalog.invalidate({ kind: 'metadata', packageIds: ['x'] }, 'operation');
        await catalog.quickSearch(appDir, [remote('feed').url], 'x', false, 5, signal);
        expect(rig.contexts.configFilesFor).toHaveBeenCalledTimes(1);
        expect(rig.feeds.reset).not.toHaveBeenCalled();
        expect(rig.clients.icons.reset).not.toHaveBeenCalled();

        catalog.invalidate({ kind: 'sources' }, 'source-changed');
        expect(rig.feeds.reset).toHaveBeenCalledTimes(1);
        expect(rig.clients.icons.reset).toHaveBeenCalledTimes(1);
        await catalog.quickSearch(appDir, [remote('feed').url], 'x', false, 5, signal);
        expect(rig.contexts.configFilesFor).toHaveBeenCalledTimes(2);

        catalog.invalidate({ kind: 'workspace' }, 'manual-refresh');
        expect(rig.feeds.reset).toHaveBeenCalledTimes(2);
    });
});

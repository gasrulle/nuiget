import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { Logger, ProjectEvaluator, ProjectExecutionContext, QueryCoordinator, QueryHandle, SourceProvider } from '../contracts';
import { StaleQueryError } from '../contracts';
import type { InstalledResult, NuGetSource, Project, TransitiveResult } from '../../protocol/domain';
import { resourceKeys } from '../../protocol/domain';
import type { RequestChunk } from '../../protocol/messages';
import type { ProjectContextResult } from '../project';
import { DefaultQueryCoordinator } from '../queries';
import { Catalog, NotYetAvailableError, type CatalogDeps } from './index';

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

function makeDeps(overrides: Partial<CatalogDeps> = {}): CatalogDeps {
    return {
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

    it('feed methods throw not-yet-available before any query', async () => {
        const { coordinator, query } = scriptedCoordinator([]);
        const catalog = new Catalog(makeDeps({ coordinator }));
        const signal = new AbortController().signal;
        const gated: Array<[string, () => Promise<unknown>]> = [
            ['updates', () => catalog.updates(appPath, false)],
            ['allProjectsUpdates', () => catalog.allProjectsUpdates(false, () => undefined, signal)],
            ['transitiveMetadata', () => catalog.transitiveMetadata(appPath, [])],
            ['search', () => catalog.search({ query: 'json', includePrerelease: false }, () => undefined, signal)],
            ['quickSearch', () => catalog.quickSearch('json', [], false, 5, signal)],
            ['versions', () => catalog.versions('Newtonsoft.Json', undefined, false, signal)],
            ['metadata', () => catalog.metadata('Newtonsoft.Json', '13.0.3', undefined, signal)],
            ['readme', () => catalog.readme('Newtonsoft.Json', '13.0.3', undefined, signal)],
        ];
        for (const [method, call] of gated) {
            const error = await call().catch((caught: unknown) => caught);
            expect(error).toBeInstanceOf(NotYetAvailableError);
            expect(error).toMatchObject({ code: 'not-yet-available', method, item: 'P4.9', name: 'NotYetAvailableError', message: `not-yet-available: Catalog.${method} arrives with plan item P4.9` });
            await expect(call()).rejects.toThrow(NotYetAvailableError);
        }
        expect(query).not.toHaveBeenCalled();
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

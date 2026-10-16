import * as path from 'path';
import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../core/catalog';
import type { InvalidationEvent, Logger, OperationRunContext, ProjectExecutionContext, ProjectMutator, SessionStore, SourceProvider } from '../core/contracts';
import { DefaultOperationQueue, type PackageWorkflows } from '../core/ops';
import {
    ALL_PROJECTS,
    makeCancel,
    makeRequest,
    REQUEST_TYPES,
    resourceKeys,
    type BulkOutcome,
    type InstalledResult,
    type OperationOutcome,
    type OutboundEnvelope,
    type RequestPayload,
    type RequestType,
    type SessionSnapshot,
} from '../protocol';
import { createMockExtensionContext } from '../test/__mocks__/vscode';
import { invalidateAfter, registerSharedHandlers } from './handlers';
import { createWorkflowDeps, HostEvents, renderWebviewHtml, type HostServices } from './services';
import { SidebarHost } from './SidebarHost';
import { WebviewHost, type WebviewLike } from './WebviewHost';

const workspace = path.resolve('/w');
const appPath = path.join(workspace, 'App', 'App.csproj');
const libPath = path.join(workspace, 'Lib', 'Lib.csproj');
const feed = { name: 'Private Feed', url: 'https://feed.example/v3/index.json', enabled: true };

class TestHost extends WebviewHost {
    public readonly sent: OutboundEnvelope[] = [];
    public readonly page: WebviewLike = { postMessage: (message: unknown) => { this.sent.push(message as OutboundEnvelope); return true; } };

    constructor(services: HostServices) {
        super('main');
        this.attach(this.page);
        registerSharedHandlers(this, services);
    }

    receiveRaw(raw: unknown): Promise<void> { return this.receive(raw); }
    detachNow(): void { this.detach(); }
    responses(id?: string) { return this.sent.filter(message => message.kind === 'response' && (id === undefined || message.id === id)); }
}

const provisional: InstalledResult = { projectPath: appPath, fidelity: 'provisional', isCpm: false, packages: [] };
const authoritative: InstalledResult = { projectPath: appPath, fidelity: 'authoritative', isCpm: false, packages: [] };
const singleOutcome = (ctx: OperationRunContext, kind: 'install' | 'update' | 'remove', projectPath: string, packageId: string): OperationOutcome =>
    ({ opId: ctx.opId, kind, status: 'completed', projectPath, packageId, edit: { ok: true }, restore: { ok: true } });
const bulkOutcome = (ctx: OperationRunContext, projectPaths: string[] = []): BulkOutcome =>
    ({ opId: ctx.opId, status: 'completed', results: [], restores: projectPaths.map(projectPath => ({ projectPath, ok: true })) });

function makeServices(options: { selectedProject?: string; workspaceFolder?: string | null } = {}) {
    const snapshot: SessionSnapshot = { rev: 1, selectedProject: options.selectedProject ?? appPath, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' };
    const catalog = {
        // The four reads that are coordinator resources answer with the generation they were computed for.
        projects: vi.fn(async () => ({ value: [{ name: 'App.csproj', path: appPath }, { name: 'Lib.csproj', path: libPath }], generation: 3 })),
        sources: vi.fn(async () => ({ value: [feed], generation: 5 })),
        installed: vi.fn(async (): Promise<{ result: InstalledResult; generation: number; upgrade?: Promise<InstalledResult> }> => ({ result: provisional, generation: 7 })),
        transitive: vi.fn(async (projectPath: string) => ({ value: { projectPath, frameworks: [], dataSourceAvailable: true }, generation: 4 })),
        allProjectsInstalled: vi.fn(async () => ({ projectPaths: [appPath], errored: [] })),
        allProjectsTransitive: vi.fn(async () => ({ projectPaths: [appPath], errored: [] })),
        packageDependencies: vi.fn(async () => new Map<string, string[]>()),
        projectDependencies: vi.fn(async () => new Map<string, string[]>()),
        invalidate: vi.fn(),
        updates: vi.fn(async (projectPath: string) => ({ projectPath, updates: [], sourcesUnavailable: false, generation: 6 })),
        allProjectsUpdates: vi.fn(async () => ({ projectPaths: [appPath] })),
        transitiveMetadata: vi.fn(async () => []),
        search: vi.fn(async () => ({ results: [] })),
        quickSearch: vi.fn(async () => []),
        versions: vi.fn(async (): Promise<{ versions: string[]; sourcesUnavailable: boolean }> => ({ versions: ['1.0.0'], sourcesUnavailable: false })),
        metadata: vi.fn(async () => undefined),
        readme: vi.fn(async () => undefined),
        readmeImage: vi.fn(async (): Promise<string | null> => 'data:image/png;base64,AAAA'),
        prewarm: vi.fn(async () => undefined),
        sourceHealth: vi.fn(() => []),
    };
    const workflows = {
        single: vi.fn(async (ctx: OperationRunContext, request: { kind: 'install' | 'update' | 'remove'; projectPath: string; packageId: string }) => singleOutcome(ctx, request.kind, request.projectPath, request.packageId)),
        restore: vi.fn(async (ctx: OperationRunContext, projectPaths: string[]) => bulkOutcome(ctx, projectPaths)),
        bulkInstall: vi.fn(async (ctx: OperationRunContext) => bulkOutcome(ctx)),
        bulkUpdate: vi.fn(async (ctx: OperationRunContext) => bulkOutcome(ctx)),
        bulkRemove: vi.fn(async (ctx: OperationRunContext) => bulkOutcome(ctx)),
        bulkUpdateAllProjects: vi.fn(async (ctx: OperationRunContext) => bulkOutcome(ctx)),
        bulkRemoveAllProjects: vi.fn(async (ctx: OperationRunContext) => bulkOutcome(ctx)),
    };
    const mutation = vi.fn(async () => ({ ok: true }));
    const mutator = { canMutate: vi.fn(async () => ({ ok: true as const, isCpm: false })), previewCpmImpact: vi.fn<ProjectMutator['previewCpmImpact']>(async () => undefined) } satisfies ProjectMutator;
    const sources = { listSources: vi.fn(async () => [feed]), configFiles: vi.fn(() => []), add: mutation, remove: mutation, enable: mutation, disable: mutation, invalidate: vi.fn() } satisfies SourceProvider;
    const session = { snapshot, apply: vi.fn(async () => snapshot), reconcile: vi.fn(async () => snapshot), onDidChange: () => ({ dispose: () => undefined }) };
    const logger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } satisfies Logger;
    const queue = new DefaultOperationQueue();
    const events = new HostEvents();
    const announceOperation = vi.fn((outcome: OperationOutcome | BulkOutcome) => { events.operationCompleted.fire(outcome); });
    const invalidate = vi.fn();
    const workspaceFolder = options.workspaceFolder === null ? undefined : options.workspaceFolder ?? workspace;
    const services: HostServices = {
        context: createMockExtensionContext() as unknown as vscode.ExtensionContext,
        logger,
        session: session as unknown as SessionStore,
        catalog: catalog as unknown as Catalog,
        queue,
        workflows: workflows as unknown as PackageWorkflows,
        mutator,
        contextFor: vi.fn(async (projectPath: string): Promise<ProjectExecutionContext> => ({ projectPath, projectDir: path.dirname(projectPath), configFiles: [], sourceUrls: [], revision: 'r' })),
        sources,
        onOperationCompleted: events.operationCompleted.event,
        onOperationProgress: queue.onProgress,
        onConfigChanged: events.configChanged.event,
        onProjectsChanged: events.projectsChanged.event,
        invalidate,
        announceOperation,
        config: () => ({ searchDebounceMode: 'quicksearch', quickSearchResultsPerSource: 5, searchResultLimit: 20, enablePerformanceLogging: false, treeIndent: 8, isWindows: false }),
        workspaceFolderFor: () => workspaceFolder,
    };
    return { services, catalog, workflows, sources, session, queue, announceOperation, invalidate, logger };
}

/** A valid payload for every request of the protocol. */
const payloads: { [T in RequestType]: RequestPayload<T> } = {
    'session/get': {},
    'session/set': { includePrerelease: true },
    'config/get': {},
    'layout/get': {},
    'layout/set': { splitPosition: 40 },
    'projects/list': {},
    'installed/get': { projectPath: appPath },
    'updates/get': { projectPath: appPath, includePrerelease: false },
    'transitive/get': { projectPath: appPath },
    'transitive/metadata': { packages: [{ id: 'X', version: '1.0.0' }] },
    'allProjects/installed': {},
    'allProjects/updates': { includePrerelease: false },
    'allProjects/transitive': {},
    'search/query': { query: 'json', includePrerelease: false },
    'search/autocomplete': { query: 'json', sources: [{ name: feed.name, url: feed.url }], includePrerelease: false },
    'package/versions': { packageId: 'X', includePrerelease: false },
    'package/metadata': { packageId: 'X', version: '1.0.0' },
    'package/readme': { packageId: 'X', version: '1.0.0' },
    'readme/image': { url: 'https://example.test/a.png' },
    'package/prewarm': {},
    'sources/list': {},
    'sources/refresh': {},
    'sources/configFiles': {},
    'sources/add': { url: 'https://new.example/v3/index.json', name: 'New' },
    'sources/remove': { sourceName: feed.name },
    'sources/enable': { sourceName: feed.name },
    'sources/disable': { sourceName: feed.name },
    'ops/install': { projectPath: appPath, packageId: 'X', version: '1.0.0' },
    'ops/update': { projectPath: appPath, packageId: 'X', version: '2.0.0' },
    'ops/remove': { projectPath: appPath, packageId: 'X' },
    'ops/restore': { projectPaths: [appPath] },
    'ops/bulkInstall': { projectPaths: [appPath, libPath], packageId: 'X' },
    'ops/bulkUpdate': { projectPath: appPath, packages: [{ id: 'X', version: '2.0.0' }] },
    'ops/bulkRemove': { projectPath: appPath, packages: ['X'] },
    'ops/bulkUpdateAllProjects': { projectUpdates: [{ projectPath: appPath, projectName: 'App', packages: [{ id: 'X', version: '2.0.0' }] }] },
    'ops/bulkRemoveAllProjects': { projectRemovals: [{ projectPath: appPath, projectName: 'App', packages: ['X'] }] },
    'cpm/preview': { projectPath: appPath, packageId: 'Serilog', version: '4.1.0' },
    'refresh/all': {},
    'ui/contextMenu': { packageId: 'X', context: 'installed', projectPath: appPath },
    'ui/openSourceSettings': {},
    'ui/viewPackage': { packageId: 'X' },
    'ui/copyToClipboard': { text: 'X' },
    'ui/openExternal': { url: 'https://example.test/' },
    'perf/mark': { name: 'webviewReady' },
};

/** Requests that only a concrete host registers, not the shared handlers. */
const hostOnly: RequestType[] = ['ui/contextMenu', 'ui/openSourceSettings', 'ui/viewPackage'];

/** The requests whose result is a resource of the query coordinator. */
const resourceReads: RequestType[] = ['projects/list', 'installed/get', 'updates/get', 'transitive/get', 'sources/list', 'sources/refresh', 'sources/add', 'sources/remove', 'sources/enable', 'sources/disable'];

const errorOf = (host: TestHost, id: string) => {
    const [response] = host.responses(id);
    return response.kind === 'response' && !response.ok ? response.error : undefined;
};
const resultOf = (host: TestHost, id: string): unknown => {
    const [response] = host.responses(id);
    return response.kind === 'response' && response.ok ? response.result : undefined;
};

beforeEach(() => {
    // Members of the VS Code API that the shared mock does not have.
    const env = vscode.env as unknown as Record<string, unknown>;
    env.openExternal = vi.fn(async () => true);
    const window = vscode.window as unknown as Record<string, unknown>;
    window.setStatusBarMessage = vi.fn();
    window.showWarningMessage = vi.fn();
    (vscode.commands as unknown as Record<string, unknown>).executeCommand = vi.fn(async () => undefined);
});

describe('shared handlers: every request of the protocol', () => {
    it.each(REQUEST_TYPES)('%s: one request → exactly one terminal response', async type => {
        const { services } = makeServices();
        const host = new TestHost(services);
        await host.receiveRaw(makeRequest(type, payloads[type], 'r1'));
        await services.queue.waitIdle();
        expect(host.responses('r1')).toHaveLength(1);
        expect(host.responses()).toHaveLength(1);
        const error = errorOf(host, 'r1');
        if (hostOnly.includes(type)) {
            expect(error?.code).toBe('unsupported');
        } else {
            expect(error).toBeUndefined();
        }
        // A response that is a coordinator resource carries its generation, and no other response does (ADR-007).
        const [response] = host.responses('r1');
        if (resourceReads.includes(type)) {
            expect(typeof (response as { generation?: unknown }).generation).toBe('number');
        } else {
            expect('generation' in response).toBe(false);
        }
        expect(host.inFlightCount).toBe(0);
    });

    it('the ten resource responses carry the generation the Catalog reported', async () => {
        const { services } = makeServices();
        const host = new TestHost(services);
        for (const type of resourceReads) {
            await host.receiveRaw(makeRequest(type, payloads[type], type));
        }
        const generations = Object.fromEntries(resourceReads.map(type => [type, (host.responses(type)[0] as { generation?: number }).generation]));
        expect(generations).toEqual({
            'projects/list': 3,
            'installed/get': 7,
            'updates/get': 6,
            'transitive/get': 4,
            'sources/list': 5,
            'sources/refresh': 5,
            'sources/add': 5,
            'sources/remove': 5,
            'sources/enable': 5,
            'sources/disable': 5,
        });
    });

    it('cpm/preview answers the mutator\'s preview over the chain-less context, null without a central entry, and rejects ALL_PROJECTS', async () => {
        const { services } = makeServices();
        const host = new TestHost(services);
        const preview = { centralPropsPath: path.join(workspace, 'Directory.Packages.props'), packageId: 'Serilog', fromVersion: '4.0.0', toVersion: '4.1.0', affectedProjects: [appPath, libPath] };
        vi.mocked(services.mutator.previewCpmImpact).mockResolvedValueOnce(preview);
        await host.receiveRaw(makeRequest('cpm/preview', { projectPath: appPath, packageId: 'Serilog', version: '4.1.0' }, 'p1'));
        expect(resultOf(host, 'p1')).toEqual({ preview });
        expect(services.contextFor).toHaveBeenCalledWith(appPath);
        expect(services.mutator.previewCpmImpact).toHaveBeenCalledWith(expect.objectContaining({ projectPath: appPath }), 'Serilog', '4.1.0');

        await host.receiveRaw(makeRequest('cpm/preview', { projectPath: appPath, packageId: 'Absent', version: '1.0.0' }, 'p2'));
        expect(resultOf(host, 'p2')).toEqual({ preview: null });

        await host.receiveRaw(makeRequest('cpm/preview', { projectPath: ALL_PROJECTS, packageId: 'Serilog', version: '4.1.0' }, 'p3'));
        expect(errorOf(host, 'p3')).toMatchObject({ code: 'invalid-request' });
        expect(services.contextFor).toHaveBeenCalledTimes(2);
    });

    it('covers the 44 requests of the protocol', () => {
        expect(REQUEST_TYPES).toHaveLength(44);
        expect(Object.keys(payloads).sort()).toEqual([...REQUEST_TYPES].sort());
    });

    it('feed reads pass the selected project\'s directory and the payload to the Catalog', async () => {
        const { services, catalog } = makeServices();
        const host = new TestHost(services);
        const directory = path.dirname(appPath);
        const packages = [{ id: 'A', version: '1.0.0' }];
        await host.receiveRaw(makeRequest('search/query', { query: 'json', sourceUrls: [feed.url], includePrerelease: true, exactMatch: true }, 's'));
        await host.receiveRaw(makeRequest('search/autocomplete', { query: 'js', sources: [{ name: feed.name, url: feed.url }], includePrerelease: false }, 'q'));
        await host.receiveRaw(makeRequest('package/versions', { packageId: 'A', sourceUrl: feed.url, includePrerelease: true }, 'v'));
        await host.receiveRaw(makeRequest('package/metadata', { packageId: 'A', version: '1.0.0' }, 'm'));
        await host.receiveRaw(makeRequest('package/readme', { packageId: 'A', version: '1.0.0', sourceUrl: feed.url }, 'r'));
        await host.receiveRaw(makeRequest('transitive/metadata', { packages }, 't'));

        expect(catalog.search).toHaveBeenCalledWith(directory, { query: 'json', sourceUrls: [feed.url], includePrerelease: true, take: 20, exactMatch: true }, expect.any(Function), expect.any(AbortSignal));
        expect(catalog.quickSearch).toHaveBeenCalledWith(directory, [feed.url], 'js', false, 5, expect.any(AbortSignal));
        expect(catalog.versions).toHaveBeenCalledWith(directory, 'A', feed.url, true, expect.any(AbortSignal));
        expect(catalog.metadata).toHaveBeenCalledWith(directory, 'A', '1.0.0', undefined, expect.any(AbortSignal));
        expect(catalog.readme).toHaveBeenCalledWith(directory, 'A', '1.0.0', feed.url, expect.any(AbortSignal));
        expect(catalog.transitiveMetadata).toHaveBeenCalledWith(directory, packages, expect.any(AbortSignal));
        expect(resultOf(host, 'v')).toEqual({ packageId: 'A', versions: ['1.0.0'] });
        expect('generation' in host.responses('v')[0]).toBe(false);
    });

    it('package/versions: no versions and sourcesUnavailable is a failed response, otherwise the list', async () => {
        const { services, catalog } = makeServices();
        const host = new TestHost(services);
        catalog.versions
            .mockResolvedValueOnce({ versions: [], sourcesUnavailable: true })
            .mockResolvedValueOnce({ versions: [], sourcesUnavailable: false })
            .mockResolvedValueOnce({ versions: ['2.0.0'], sourcesUnavailable: true });
        for (const id of ['down', 'unknown', 'partial']) {
            await host.receiveRaw(makeRequest('package/versions', { packageId: 'A', includePrerelease: false }, id));
        }
        expect(errorOf(host, 'down')).toEqual({ code: 'failed', message: 'No package source could be reached for this package' });
        expect(resultOf(host, 'unknown')).toEqual({ packageId: 'A', versions: [] });
        expect(resultOf(host, 'partial')).toEqual({ packageId: 'A', versions: ['2.0.0'] });
    });

    it('readme/image answers through Catalog.readmeImage and package/prewarm awaits Catalog.prewarm', async () => {
        const { services, catalog } = makeServices();
        const host = new TestHost(services);
        await host.receiveRaw(makeRequest('readme/image', { url: 'https://example.test/a.png', sourceUrl: feed.url }, 'image'));
        expect(resultOf(host, 'image')).toEqual({ url: 'https://example.test/a.png', dataUri: 'data:image/png;base64,AAAA' });
        expect(catalog.readmeImage).toHaveBeenCalledWith('https://example.test/a.png', feed.url, expect.any(AbortSignal));

        let release: () => void = () => undefined;
        catalog.prewarm.mockImplementationOnce(() => new Promise<undefined>(resolve => { release = () => resolve(undefined); }));
        const pending = host.receiveRaw(makeRequest('package/prewarm', { sourceUrl: feed.url }, 'prewarm'));
        await Promise.resolve();
        expect(host.responses('prewarm')).toHaveLength(0);
        release();
        await pending;
        expect(resultOf(host, 'prewarm')).toEqual({});
        expect(catalog.prewarm).toHaveBeenCalledWith(path.dirname(appPath), feed.url);
    });

    it('requireProject rejects ALL_PROJECTS', async () => {
        const { services, workflows, catalog } = makeServices();
        const host = new TestHost(services);
        await host.receiveRaw(makeRequest('installed/get', { projectPath: ALL_PROJECTS }, 'a'));
        await host.receiveRaw(makeRequest('transitive/get', { projectPath: ALL_PROJECTS, forceRestore: true }, 'b'));
        await host.receiveRaw(makeRequest('ops/install', { projectPath: ALL_PROJECTS, packageId: 'X' }, 'c'));
        await host.receiveRaw(makeRequest('ops/bulkUpdate', { projectPath: ALL_PROJECTS, packages: [{ id: 'X', version: '2.0.0' }] }, 'd'));
        await host.receiveRaw(makeRequest('ops/remove', { projectPath: '', packageId: 'X' }, 'e'));
        for (const id of ['a', 'b', 'c', 'd', 'e']) {
            expect(errorOf(host, id)).toEqual({ code: 'invalid-request', message: 'A specific project is required for this action', details: undefined });
        }
        expect(Object.values(workflows).every(fn => fn.mock.calls.length === 0)).toBe(true);
        expect(catalog.installed).not.toHaveBeenCalled();
        expect(services.queue.isBusy).toBe(false);
    });
});

describe('shared handlers: reads', () => {
    it('installed/get answers with the final result', async () => {
        const { services, catalog } = makeServices();
        const host = new TestHost(services);
        await host.receiveRaw(makeRequest('installed/get', { projectPath: appPath }, 'plain'));
        expect(resultOf(host, 'plain')).toEqual(provisional);

        catalog.installed.mockImplementationOnce(async (...args: unknown[]) => {
            (args[1] as (chunk: unknown) => void)({ kind: 'provisional', result: provisional });
            return { result: provisional, generation: 7, upgrade: Promise.resolve(authoritative) };
        });
        await host.receiveRaw(makeRequest('installed/get', { projectPath: appPath }, 'upgraded'));
        expect(resultOf(host, 'upgraded')).toEqual(authoritative);
        // The provisional chunk passes through as the Catalog emits it, before the evaluated response.
        const stream = host.sent.filter(message => message.kind === 'stream');
        expect(stream).toEqual([{ kind: 'stream', id: 'upgraded', type: 'installed/get', chunk: { kind: 'provisional', result: provisional } }]);
        expect(host.sent.indexOf(stream[0])).toBeLessThan(host.sent.indexOf(host.responses('upgraded')[0]));
    });

    it('search/query emits the metadata chunk before its response', async () => {
        const { services, catalog } = makeServices();
        const host = new TestHost(services);
        const results = [{ id: 'Contoso.Json', version: '2.0.0', description: '', authors: '', versions: ['2.0.0'], sourceUrl: feed.url }];
        catalog.search.mockImplementationOnce(async (...args: unknown[]) => {
            (args[2] as (packages: unknown) => void)([{ id: 'Contoso.Json', version: '2.0.0', verified: true }]);
            // The shared mock is typed by its default answer, which has no results.
            return { results: results as never[], sourcesUnavailable: true };
        });

        await host.receiveRaw(makeRequest('search/query', { query: 'json', includePrerelease: false }, 's'));

        const stream = host.sent.filter(message => message.kind === 'stream');
        expect(stream).toEqual([{ kind: 'stream', id: 's', type: 'search/query', chunk: { kind: 'metadata', packages: [{ id: 'Contoso.Json', version: '2.0.0', verified: true }] } }]);
        expect(host.sent.indexOf(stream[0])).toBeLessThan(host.sent.indexOf(host.responses('s')[0]));
        expect(resultOf(host, 's')).toEqual({ query: 'json', results, sourcesUnavailable: true });
        // Search results are keyed by what the user typed, not a coordinator resource: no generation.
        expect('generation' in host.responses('s')[0]).toBe(false);
    });

    it('sources/list resolves the selected project\'s directory', async () => {
        const selected = makeServices();
        const host = new TestHost(selected.services);
        await host.receiveRaw(makeRequest('sources/list', {}, 'a'));
        // The sources a webview lists name the config file that declares them (P5.8).
        expect(selected.catalog.sources).toHaveBeenCalledWith(path.dirname(appPath), expect.any(AbortSignal), { configFiles: true });
        expect(resultOf(host, 'a')).toEqual({ sources: [feed], failed: [] });

        const all = makeServices({ selectedProject: ALL_PROJECTS });
        const allHost = new TestHost(all.services);
        await allHost.receiveRaw(makeRequest('sources/refresh', {}, 'b'));
        expect(all.catalog.sources).toHaveBeenCalledWith(workspace, expect.any(AbortSignal), { configFiles: true });
        expect(all.invalidate).toHaveBeenCalledWith({ kind: 'sources' }, 'manual-refresh');

        const nothing = makeServices({ selectedProject: '', workspaceFolder: null });
        const emptyHost = new TestHost(nothing.services);
        await emptyHost.receiveRaw(makeRequest('sources/list', {}, 'c'));
        expect(errorOf(emptyHost, 'c')).toEqual({ code: 'not-found', message: 'No project or workspace folder to resolve package sources for', details: undefined });
        expect(nothing.catalog.sources).not.toHaveBeenCalled();
    });

    it('a source mutation runs in that directory, invalidates and reconciles the session', async () => {
        const { services, sources, invalidate, session } = makeServices();
        const host = new TestHost(services);
        await host.receiveRaw(makeRequest('sources/disable', { sourceName: feed.name }, 'a'));
        expect(sources.disable).toHaveBeenCalledWith(feed.name, path.dirname(appPath));
        expect(invalidate).toHaveBeenCalledWith({ kind: 'sources' }, 'source-changed');
        expect(session.reconcile).toHaveBeenCalledWith(expect.any(Array), [feed.url]);
        expect(resultOf(host, 'a')).toEqual({ sources: [feed], disabledUrl: feed.url });

        sources.add.mockResolvedValueOnce({ ok: false, error: 'error: the source already exists' } as never);
        await host.receiveRaw(makeRequest('sources/add', { url: feed.url, name: feed.name }, 'b'));
        expect(errorOf(host, 'b')).toMatchObject({ code: 'failed', message: 'error: the source already exists' });
    });

    it('a mutation answers with the attributed sources; the pre-reads of remove and disable ask without', async () => {
        const { services, catalog } = makeServices();
        const host = new TestHost(services);
        const directory = path.dirname(appPath);
        for (const [type, payload] of [['sources/add', { url: feed.url }], ['sources/remove', { sourceName: feed.name }], ['sources/enable', { sourceName: feed.name }], ['sources/disable', { sourceName: feed.name }]] as const) {
            catalog.sources.mockClear();
            await host.receiveRaw(makeRequest(type, payload as never, type));
            const calls = catalog.sources.mock.calls as unknown[][];
            // The answer: one attributed read after the mutation.
            expect(calls.filter(call => (call[2] as { configFiles?: boolean } | undefined)?.configFiles === true), type).toEqual([[directory, undefined, { configFiles: true }]]);
            // remove and disable read the URL first, without the chain.
            expect(calls.filter(call => call[2] === undefined), type).toHaveLength(type === 'sources/remove' || type === 'sources/disable' ? 1 : 0);
        }
    });

    it('perf/mark is logged at info only while performance logging is on', async () => {
        const { services, logger } = makeServices();
        const host = new TestHost(services);
        await host.receiveRaw(makeRequest('perf/mark', { name: 'webviewReady', detail: '12 ms' }, 'a'));
        expect(logger.debug).toHaveBeenCalledWith('[perf] main webviewReady 12 ms');
        expect(logger.info).not.toHaveBeenCalled();
        const config = services.config();
        services.config = () => ({ ...config, enablePerformanceLogging: true });
        await host.receiveRaw(makeRequest('perf/mark', { name: 'firstUsefulRender' }, 'b'));
        expect(logger.info).toHaveBeenCalledWith('[perf] main firstUsefulRender');
    });

    it('resources/invalidated forwards the coordinator event unchanged', () => {
        const { services } = makeServices();
        const host = new TestHost(services);
        const event: InvalidationEvent = { scope: { kind: 'project', projectPaths: [appPath] }, reason: 'operation', generation: 7, keys: [{ key: resourceKeys.installed(appPath), generation: 3 }] };
        host.sendEvent('resources/invalidated', event);
        expect(host.sent).toEqual([{ kind: 'event', type: 'resources/invalidated', payload: event }]);
    });
});

describe('shared handlers: operations', () => {
    /** Workflows that wait until released, so that the queue fills up. */
    function blockedSingle(workflows: ReturnType<typeof makeServices>['workflows']) {
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        workflows.single.mockImplementation(async (ctx, request) => { await gate; return singleOutcome(ctx, request.kind, request.projectPath, request.packageId); });
        return release;
    }
    const tick = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); } };

    it('ops/*: a refused submission answers with the ticket\'s rejected outcome (Y2)', async () => {
        const { services, workflows, announceOperation } = makeServices();
        const release = blockedSingle(workflows);
        const host = new TestHost(services);
        const pending = [1, 2, 3, 4, 5, 6, 7].map(n => host.receiveRaw(makeRequest('ops/install', { projectPath: appPath, packageId: `P${n}` }, `r${n}`)));
        await tick();
        // One runs, five wait; the seventh is answered at once, while the others are still pending.
        expect(host.responses()).toHaveLength(1);
        const refused = resultOf(host, 'r7') as OperationOutcome;
        expect(refused).toMatchObject({ kind: 'install', status: 'rejected', projectPath: appPath, packageId: 'P7', message: 'the operation queue is full (1 running, 5 waiting)' });
        expect(refused.opId).toMatch(/^[0-9a-f-]{36}$/);
        expect(refused.opId).not.toBe('rejected');
        const opening = host.sent.find(message => message.kind === 'stream' && message.id === 'r7');
        expect(opening).toMatchObject({ chunk: { opId: refused.opId, status: 'rejected' } });
        expect(announceOperation).toHaveBeenCalledWith(refused);

        release();
        await Promise.all(pending);
        expect(host.responses()).toHaveLength(7);
        expect(workflows.single).toHaveBeenCalledTimes(6);
    });

    it('ops/*: the outcome is announced and invalidation follows the edit', async () => {
        const { services, announceOperation, invalidate, workflows } = makeServices();
        const host = new TestHost(services);
        await host.receiveRaw(makeRequest('ops/update', { projectPath: appPath, packageId: 'X', version: '2.0.0', sourceUrl: feed.url }, 'a'));
        const outcome = resultOf(host, 'a') as OperationOutcome;
        expect(outcome).toMatchObject({ kind: 'update', status: 'completed', packageId: 'X' });
        expect(workflows.single).toHaveBeenCalledWith(expect.objectContaining({ opId: outcome.opId }), { kind: 'update', projectPath: appPath, packageId: 'X', version: '2.0.0', sourceUrl: feed.url }, { skipRestore: false });
        expect(announceOperation).toHaveBeenCalledTimes(1);
        expect(announceOperation).toHaveBeenCalledWith(outcome);
        expect(invalidate.mock.calls).toEqual([[{ kind: 'project', projectPaths: [appPath] }, 'operation'], [{ kind: 'metadata', packageIds: ['X'] }, 'operation']]);
        // The request sees its own progress: the opening chunk carries the ticket's id.
        expect(host.sent.find(message => message.kind === 'stream')).toMatchObject({ id: 'a', chunk: { opId: outcome.opId, status: 'queued' } });
    });

    it('transitive/get: forceRestore runs through the queue as PackageWorkflows.restore (Y3)', async () => {
        const { services, workflows, catalog, announceOperation } = makeServices();
        const host = new TestHost(services);
        const order: string[] = [];
        workflows.restore.mockImplementation(async (ctx, projectPaths) => { order.push('restore'); return bulkOutcome(ctx, projectPaths); });
        catalog.transitive.mockImplementation(async projectPath => { order.push('transitive'); return { value: { projectPath, frameworks: [], dataSourceAvailable: true }, generation: 4 }; });
        await host.receiveRaw(makeRequest('transitive/get', { projectPath: appPath, forceRestore: true }, 'a'));
        expect(order).toEqual(['restore', 'transitive']);
        const announced = announceOperation.mock.calls[0][0];
        expect(workflows.restore).toHaveBeenCalledWith(expect.objectContaining({ opId: announced.opId }), [appPath]);
        expect(resultOf(host, 'a')).toEqual({ projectPath: appPath, frameworks: [], dataSourceAvailable: true });
        // The request declares no chunk: the restore's progress is the `ops/progress` event, not a stream.
        expect(host.sent.filter(message => message.kind === 'stream')).toEqual([]);

        // A restore that the queue refuses is an error, not stale data presented as fresh.
        const full = makeServices();
        const release = blockedSingle(full.workflows);
        const fullHost = new TestHost(full.services);
        const pending = [1, 2, 3, 4, 5, 6].map(n => fullHost.receiveRaw(makeRequest('ops/install', { projectPath: appPath, packageId: `P${n}` }, `r${n}`)));
        await tick();
        await fullHost.receiveRaw(makeRequest('transitive/get', { projectPath: appPath, forceRestore: true }, 'refused'));
        expect(errorOf(fullHost, 'refused')).toMatchObject({ code: 'failed', message: 'the operation queue is full (1 running, 5 waiting)' });
        expect(full.catalog.transitive).not.toHaveBeenCalled();
        release();
        await Promise.all(pending);
    });

    it('ops/bulk*: an empty batch never reaches the workflow', async () => {
        const { services, workflows, announceOperation } = makeServices();
        const host = new TestHost(services);
        await host.receiveRaw(makeRequest('ops/bulkUpdate', { projectPath: appPath, packages: [] }, 'a'));
        await host.receiveRaw(makeRequest('ops/bulkRemove', { projectPath: appPath, packages: [] }, 'b'));
        await host.receiveRaw(makeRequest('ops/bulkUpdateAllProjects', { projectUpdates: [{ projectPath: appPath, projectName: 'App', packages: [] }, { projectPath: ALL_PROJECTS, projectName: 'All', packages: [{ id: 'X', version: '2.0.0' }] }] }, 'c'));
        await host.receiveRaw(makeRequest('ops/bulkRemoveAllProjects', { projectRemovals: [] }, 'd'));
        for (const id of ['a', 'b', 'c', 'd']) {
            expect(errorOf(host, id)).toEqual({ code: 'invalid-request', message: 'No packages selected', details: undefined });
        }
        await host.receiveRaw(makeRequest('ops/restore', { projectPaths: [ALL_PROJECTS, ''] }, 'e'));
        expect(errorOf(host, 'e')).toMatchObject({ code: 'invalid-request', message: 'No projects to restore' });
        await host.receiveRaw(makeRequest('ops/bulkInstall', { projectPaths: [], packageId: 'X' }, 'f'));
        expect(errorOf(host, 'f')).toMatchObject({ code: 'invalid-request', message: 'No projects selected' });
        expect(Object.values(workflows).every(fn => fn.mock.calls.length === 0)).toBe(true);
        expect(announceOperation).not.toHaveBeenCalled();

        // Entries without packages or without a real project are left out of a batch that has others.
        await host.receiveRaw(makeRequest('ops/bulkRemoveAllProjects', { projectRemovals: [{ projectPath: appPath, projectName: 'App', packages: [] }, { projectPath: libPath, projectName: 'Lib', packages: ['X'] }] }, 'g'));
        expect(workflows.bulkRemoveAllProjects).toHaveBeenCalledWith(expect.anything(), [{ projectPath: libPath, projectName: 'Lib', packages: ['X'] }], { skipRestore: false });
    });

    it('surface disposal does not cancel a queued operation (N9)', async () => {
        const { services, workflows, announceOperation, queue } = makeServices();
        const release = blockedSingle(workflows);
        const submit = vi.spyOn(queue, 'submit');
        const cancels = () => submit.mock.results.map(result => vi.mocked((result.value as { cancel: () => void }).cancel));
        submit.mockImplementation(((...args: Parameters<typeof queue.submit>) => {
            const ticket = DefaultOperationQueue.prototype.submit.apply(queue, args);
            return { ...ticket, cancel: vi.fn(() => ticket.cancel()) };
        }) as typeof queue.submit);

        const host = new TestHost(services);
        const running = host.receiveRaw(makeRequest('ops/install', { projectPath: appPath, packageId: 'Running' }, 'r1'));
        const waiting = host.receiveRaw(makeRequest('ops/install', { projectPath: appPath, packageId: 'Waiting' }, 'r2'));
        await tick();
        host.detachNow();
        await tick();
        // The surface is gone; what it queued goes on and is announced to the other surface.
        expect(cancels().every(cancel => cancel.mock.calls.length === 0)).toBe(true);
        release();
        await Promise.all([running, waiting]);
        expect(workflows.single).toHaveBeenCalledTimes(2);
        expect(announceOperation.mock.calls.map(call => (call[0] as OperationOutcome).status)).toEqual(['completed', 'completed']);
        expect(host.responses()).toEqual([]);

        // A cancel that the webview sends does cancel the operation.
        const second = makeServices();
        const releaseSecond = blockedSingle(second.workflows);
        const secondSubmit = vi.spyOn(second.queue, 'submit');
        const cancelling = new TestHost(second.services);
        const first = cancelling.receiveRaw(makeRequest('ops/install', { projectPath: appPath, packageId: 'Running' }, 'r1'));
        const queued = cancelling.receiveRaw(makeRequest('ops/install', { projectPath: appPath, packageId: 'Waiting' }, 'r2'));
        await tick();
        await cancelling.receiveRaw(makeCancel('r2'));
        await queued;
        expect(errorOf(cancelling, 'r2')).toMatchObject({ code: 'cancelled' });
        expect(second.announceOperation).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled', packageId: 'Waiting' }));
        releaseSecond();
        await first;
        expect(second.workflows.single).toHaveBeenCalledTimes(1);
        expect(secondSubmit).toHaveBeenCalledTimes(2);
    });
});

describe('services', () => {
    it('renderWebviewHtml: CSP per ADR-006 with font-src and a fresh nonce', () => {
        const webview = { cspSource: 'https://mock-csp-source', asWebviewUri: (uri: vscode.Uri) => uri } as unknown as vscode.Webview;
        const render = () => renderWebviewHtml(webview, vscode.Uri.file('/extension'), { script: 'webview.js', style: 'webview.css', rootId: 'root', title: 'nUIget <2.0>' });
        const html = render();
        const nonce = /<script nonce="([^"]+)"/.exec(html)?.[1] ?? '';
        expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
        const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1];
        expect(policy).toBe(`default-src 'none'; img-src https://mock-csp-source data:; style-src https://mock-csp-source; font-src https://mock-csp-source; script-src 'nonce-${nonce}'; connect-src 'none'`);
        expect(html).toContain('<title>nUIget &lt;2.0&gt;</title>');
        expect(html).not.toContain('unsafe-inline');
        expect(/<script nonce="([^"]+)"/.exec(render())?.[1]).not.toBe(nonce);
    });

    it('createWorkflowDeps: the execution context is asked once per project per operation, without the config chain', async () => {
        const { services, catalog, queue } = makeServices();
        const contextOf = (projectPath: string): ProjectExecutionContext => ({ projectPath, projectDir: path.dirname(projectPath), configFiles: [], sourceUrls: [], revision: 'r' });
        const get = vi.fn(async (projectPath: string) => ({ context: contextOf(projectPath) }));
        const deps = createWorkflowDeps({
            runner: { run: vi.fn(), sdkVersion: vi.fn(), clearSdkCache: vi.fn() },
            catalog: services.catalog,
            mutator: services.mutator,
            contexts: { get },
            workspaceFolderFor: () => workspace,
            queue: { onDidChange: () => ({ dispose: () => undefined }) },
        });
        expect(deps.mutator).toBe(services.mutator);
        expect(await deps.contextFor(appPath)).toEqual(contextOf(appPath));
        // The same project spelled differently is the same question (`path.join` would hide the difference).
        await deps.contextFor(`${path.dirname(appPath)}${path.sep}.${path.sep}App.csproj`);
        await deps.contextFor(libPath);
        expect(get.mock.calls).toEqual([[appPath, workspace, { configChain: false }], [libPath, workspace, { configChain: false }]]);

        // A context that cannot be built is not remembered.
        get.mockRejectedValueOnce(new Error('sources unavailable'));
        const other = path.join(workspace, 'Other', 'Other.csproj');
        await expect(deps.contextFor(other)).rejects.toThrow('sources unavailable');
        await deps.contextFor(other);
        expect(get).toHaveBeenCalledTimes(4);

        await deps.packageDependencies(appPath);
        await deps.projectDependencies([appPath, libPath]);
        expect(catalog.packageDependencies).toHaveBeenCalledWith(appPath);
        expect(catalog.projectDependencies).toHaveBeenCalledWith([appPath, libPath]);
        expect(queue.isBusy).toBe(false);
    });

    it('the execution context is asked again for the next operation', async () => {
        const { services } = makeServices();
        let changed!: (counts: { active: number; pending: number }) => void;
        const get = vi.fn(async (projectPath: string) => ({ context: { projectPath, projectDir: path.dirname(projectPath), configFiles: [], sourceUrls: [], revision: 'r' } }));
        const deps = createWorkflowDeps({
            runner: { run: vi.fn(), sdkVersion: vi.fn(), clearSdkCache: vi.fn() },
            catalog: services.catalog,
            mutator: services.mutator,
            contexts: { get },
            queue: { onDidChange: listener => { changed = listener; return { dispose: () => undefined }; } },
        });
        await deps.contextFor(appPath);
        await deps.contextFor(appPath);
        expect(get).toHaveBeenCalledTimes(1);
        // Every change of the queue ends the memo, also while something still runs: the next operation asks again.
        changed({ active: 1, pending: 0 });
        await deps.contextFor(appPath);
        expect(get).toHaveBeenCalledTimes(2);
        changed({ active: 0, pending: 0 });
        await deps.contextFor(appPath);
        expect(get).toHaveBeenCalledTimes(3);
    });

    it('invalidation after a CPM edit covers the affected projects', () => {
        const { services, invalidate } = makeServices();
        invalidateAfter(services, { opId: 'o1', kind: 'update', status: 'completed', projectPath: appPath, packageId: 'X', version: '2.0.0', edit: { ok: true }, restore: { ok: true }, affectedProjects: [libPath] });
        expect(invalidate.mock.calls).toEqual([[{ kind: 'project', projectPaths: [appPath, libPath] }, 'operation'], [{ kind: 'metadata', packageIds: ['X'] }, 'operation']]);

        invalidate.mockClear();
        const other = path.join(workspace, 'Other', 'Other.csproj');
        invalidateAfter(services, {
            opId: 'o2',
            status: 'completed',
            results: [
                { opId: 'o2', kind: 'update', status: 'completed', projectPath: appPath, packageId: 'X', edit: { ok: true }, affectedProjects: [libPath, other] },
                { opId: 'o2', kind: 'update', status: 'failed', projectPath: appPath, packageId: 'Y', edit: { ok: false, error: 'no' }, affectedProjects: [path.join(workspace, 'Never', 'Never.csproj')] },
            ],
            restores: [{ projectPath: appPath, ok: true }, { projectPath: libPath, ok: true }, { projectPath: other, ok: true }],
        });
        expect(invalidate.mock.calls[0]).toEqual([{ kind: 'project', projectPaths: [appPath, libPath, other] }, 'operation']);
    });
});

describe('SidebarHost', () => {
    it('SidebarHost: a context-menu action submits a typed operation and never fabricates a request', async () => {
        const { services, workflows, announceOperation, queue } = makeServices();
        const submit = vi.spyOn(queue, 'submit');
        const posted: OutboundEnvelope[] = [];
        let deliver!: (message: unknown) => void;
        const view = {
            webview: {
                options: {},
                html: '',
                cspSource: 'https://mock-csp-source',
                asWebviewUri: (uri: vscode.Uri) => uri,
                postMessage: (message: unknown) => { posted.push(message as OutboundEnvelope); return true; },
                onDidReceiveMessage: (listener: (message: unknown) => void) => { deliver = listener; return { dispose: () => undefined }; },
            },
            visible: true,
            title: undefined as string | undefined,
            onDidChangeVisibility: () => ({ dispose: () => undefined }),
            onDidDispose: () => ({ dispose: () => undefined }),
        };
        vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ label: 'Uninstall', action: 'uninstall' } as never);

        const sidebar = new SidebarHost(services);
        sidebar.resolveWebviewView(view as unknown as vscode.WebviewView);
        expect(view.webview.html).toContain('sidebar.js');
        deliver(makeRequest('ui/contextMenu', { packageId: 'X', context: 'installed', projectPath: appPath, installedVersion: '1.0.0' }, 'menu'));
        await vi.waitFor(() => expect(posted.some(message => message.kind === 'response')).toBe(true));

        expect(submit).toHaveBeenCalledTimes(1);
        expect(submit.mock.calls[0][0]).toBe('uninstall X');
        expect(workflows.single).toHaveBeenCalledWith(expect.anything(), { kind: 'remove', projectPath: appPath, packageId: 'X' }, { skipRestore: false });
        expect(announceOperation).toHaveBeenCalledTimes(1);
        // The only response is the one for the request the webview sent; the outcome travels as an event.
        expect(posted.filter(message => message.kind === 'response')).toEqual([{ kind: 'response', id: 'menu', type: 'ui/contextMenu', ok: true, result: { handled: true } }]);
        sidebar.dispose();
    });

    /** A resolved sidebar whose webview records what it is sent; `send` delivers a request and waits for its response. */
    function resolvedSidebar(services: ReturnType<typeof makeServices>['services']) {
        const posted: OutboundEnvelope[] = [];
        let deliver!: (message: unknown) => void;
        const view = {
            webview: {
                options: {}, html: '', cspSource: 'https://mock-csp-source', asWebviewUri: (uri: vscode.Uri) => uri,
                postMessage: (message: unknown) => { posted.push(message as OutboundEnvelope); return true; },
                onDidReceiveMessage: (listener: (message: unknown) => void) => { deliver = listener; return { dispose: () => undefined }; },
            },
            visible: true, title: undefined as string | undefined,
            onDidChangeVisibility: () => ({ dispose: () => undefined }), onDidDispose: () => ({ dispose: () => undefined }),
        };
        const sidebar = new SidebarHost(services);
        sidebar.resolveWebviewView(view as unknown as vscode.WebviewView);
        const send = async (payload: Record<string, unknown>, id: string): Promise<unknown> => {
            deliver(makeRequest('ui/contextMenu', payload as never, id));
            await vi.waitFor(() => expect(posted.some(message => message.kind === 'response' && message.id === id)).toBe(true));
            const response = posted.find(message => message.kind === 'response' && message.id === id) as { result?: unknown };
            return response.result;
        };
        return { sidebar, send };
    }

    const centralPreview = (affectedProjects: string[]) => ({ centralPropsPath: path.join(workspace, 'Directory.Packages.props'), packageId: 'X', fromVersion: '1.0.0', toVersion: '2.0.0', affectedProjects });

    it('SidebarHost: an update of a centrally managed package shows the projects it changes first and submits only when confirmed', async () => {
        const { services, workflows } = makeServices();
        vi.mocked(services.mutator.previewCpmImpact).mockResolvedValueOnce(centralPreview([appPath, libPath]));
        vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ label: 'Update to 2.0.0', action: 'update-latest' } as never);
        const warning = vi.mocked(vscode.window.showWarningMessage);
        warning.mockResolvedValueOnce('Update central version' as never);
        const { sidebar, send } = resolvedSidebar(services);
        expect(await send({ packageId: 'X', context: 'updates', projectPath: appPath, installedVersion: '1.0.0', latestVersion: '2.0.0' }, 'menu')).toEqual({ handled: true });
        expect(services.contextFor).toHaveBeenCalledWith(appPath);
        expect(services.mutator.previewCpmImpact).toHaveBeenCalledWith(expect.objectContaining({ projectPath: appPath }), 'X', '2.0.0');
        expect(warning).toHaveBeenCalledWith('Update the central version of X?', { modal: true, detail: '1.0.0 → 2.0.0 in Directory.Packages.props applies to: App.csproj, Lib.csproj' }, 'Update central version');
        expect(workflows.single).toHaveBeenCalledTimes(1);
        expect(workflows.single).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'update', projectPath: appPath, packageId: 'X', version: '2.0.0' }), { skipRestore: false });
        sidebar.dispose();
    });

    it('SidebarHost: the central change cancelled in the modal submits nothing', async () => {
        const { services, workflows, queue } = makeServices();
        const submit = vi.spyOn(queue, 'submit');
        vi.mocked(services.mutator.previewCpmImpact).mockResolvedValueOnce(centralPreview([appPath, libPath]));
        vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ label: 'Update to 2.0.0', action: 'update-latest' } as never);
        const { sidebar, send } = resolvedSidebar(services);
        expect(await send({ packageId: 'X', context: 'updates', projectPath: appPath, installedVersion: '1.0.0', latestVersion: '2.0.0' }, 'menu')).toEqual({ handled: false });
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(submit).not.toHaveBeenCalled();
        expect(workflows.single).not.toHaveBeenCalled();
        sidebar.dispose();
    });

    it('SidebarHost: a package without a central entry is submitted without a modal', async () => {
        const { services, workflows } = makeServices();
        vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ label: 'Update to 2.0.0', action: 'update-latest' } as never);
        const { sidebar, send } = resolvedSidebar(services);
        expect(await send({ packageId: 'X', context: 'updates', projectPath: appPath, installedVersion: '1.0.0', latestVersion: '2.0.0' }, 'menu')).toEqual({ handled: true });
        expect(services.mutator.previewCpmImpact).toHaveBeenCalledTimes(1);
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(workflows.single).toHaveBeenCalledTimes(1);
        sidebar.dispose();
    });

    it('SidebarHost: no versions and every source unreachable says so and submits nothing', async () => {
        const { services, catalog, queue } = makeServices();
        const submit = vi.spyOn(queue, 'submit');
        catalog.versions.mockResolvedValueOnce({ versions: [], sourcesUnavailable: true });
        vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ label: 'Update to version…', action: 'update-version' } as never);
        const warning = vi.mocked(vscode.window.showWarningMessage);
        warning.mockClear();
        const { sidebar, send } = resolvedSidebar(services);

        expect(await send({ packageId: 'X', context: 'updates', projectPath: appPath, installedVersion: '1.0.0', latestVersion: '2.0.0' }, 'menu')).toEqual({ handled: false });
        expect(warning).toHaveBeenCalledWith('No package source could be reached for this package');
        // No version list was shown and nothing was submitted.
        expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
        expect(submit).not.toHaveBeenCalled();
        sidebar.dispose();
    });

    it('SidebarHost: install from browse under All Projects picks the projects; one project is ops/install, several are ops/bulkInstall', async () => {
        const { services, workflows } = makeServices();
        const pick = vi.mocked(vscode.window.showQuickPick);
        const { sidebar, send } = resolvedSidebar(services);
        const request = { packageId: 'X', context: 'browse', projectPath: ALL_PROJECTS, latestVersion: '2.0.0', installedProjects: [{ projectPath: libPath, projectName: 'Lib.csproj', version: '1.0.0' }] };

        pick.mockResolvedValueOnce({ label: 'Install latest', action: 'install-latest' } as never);
        pick.mockImplementationOnce(async items => (items as unknown as Array<{ detail: string; picked: boolean }>).filter(item => item.picked) as never);
        expect(await send(request, 'one')).toEqual({ handled: true });
        expect(workflows.single).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ kind: 'install', projectPath: appPath, packageId: 'X', version: '2.0.0' }), expect.anything());

        pick.mockResolvedValueOnce({ label: 'Install latest', action: 'install-latest' } as never);
        pick.mockImplementationOnce(async items => items as never);
        expect(await send(request, 'two')).toEqual({ handled: true });
        const [, projects, packageId, version] = workflows.bulkInstall.mock.calls.at(-1) as unknown as [unknown, Array<{ path: string } | string>, string, string];
        expect(projects.map(project => (typeof project === 'string' ? project : project.path))).toEqual([appPath, libPath]);
        expect([packageId, version]).toEqual(['X', '2.0.0']);
        sidebar.dispose();
    });

    it('bulk install from the actions menu leaves out the projects where the package has a central entry and says so', async () => {
        const { services, workflows } = makeServices();
        const pick = vi.mocked(vscode.window.showQuickPick);
        const info = vi.mocked(vscode.window.showInformationMessage);
        info.mockClear();
        const { sidebar, send } = resolvedSidebar(services);
        const request = { packageId: 'X', context: 'browse', projectPath: ALL_PROJECTS, latestVersion: '2.0.0', installedProjects: [] };
        vi.mocked(services.mutator.previewCpmImpact).mockImplementation(async context => (context.projectPath === libPath ? centralPreview([libPath]) : undefined));

        pick.mockResolvedValueOnce({ label: 'Install latest', action: 'install-latest' } as never);
        pick.mockImplementationOnce(async items => items as never);
        expect(await send(request, 'bulk')).toEqual({ handled: true });

        expect(services.mutator.previewCpmImpact).toHaveBeenCalledWith(expect.objectContaining({ projectPath: libPath }), 'X', '2.0.0');
        expect(info).toHaveBeenCalledWith('Not installed in Lib.csproj: X has a central entry there; install it from the project to see the preview');
        // One target remains: the single path, without a modal (no preview there), and no bulk install.
        expect(workflows.bulkInstall).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(workflows.single).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ kind: 'install', projectPath: appPath, packageId: 'X', version: '2.0.0' }), expect.anything());
        sidebar.dispose();
    });
});

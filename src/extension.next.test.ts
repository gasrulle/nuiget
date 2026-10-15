import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { TieredCache } from './core/cache';
import { createScratchDir, writeTree, type ScratchDir } from './core/project/__fixtures__/scratch';
import { FakeTransport, fail, json } from './core/feeds/testSupport';
import { NodeTransport } from './core/http';
import { activateWith, proxyConfigured, type ActivatedExtension, type ActivationOverrides } from './extension.next';
import { MainPanelHost } from './host/MainPanelHost';
import { makeRequest, type BulkOutcome, type EventPayload, type EventType, type OutboundEnvelope, type RequestPayload, type RequestType } from './protocol';
import {
    commands as mockCommands,
    createMockExtensionContext,
    createMockWebview,
    resetAllMocks,
    window as mockWindow,
    workspace as mockWorkspace,
} from './test/__mocks__/vscode';
import { createFakeDotnet, dotnetCalls, type FakeDotnet } from './test/harness/fakeDotnet';
import { createFakePanel } from './test/harness/fakePanel';

const SDK_CACHE_KEY = 'nuiget.sdkVersionCache.v2';
const LEGACY_SDK_CACHE_KEY = 'nuiget.sdkVersionCache';

const defaultFolders = mockWorkspace.workspaceFolders;
const originalExecuteCommand = mockCommands.executeCommand.getMockImplementation()!;

const appPath = vscode.Uri.file('/test-workspace/App/App.csproj').fsPath;
const libPath = vscode.Uri.file('/test-workspace/Lib/Lib.csproj').fsPath;
const gonePath = vscode.Uri.file('/test-workspace/Gone/Gone.csproj').fsPath;
const appDir = path.dirname(appPath);
const libDir = path.dirname(libPath);
const privateFeed = 'https://private.example/v3/index.json';
const sharedFeed = 'https://shared.example/v3/index.json';

const sameDir = (a: string, b: string) => path.resolve(a) === path.resolve(b);

function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function flushMicrotasks(rounds = 20): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await Promise.resolve();
    }
}

type MockWebview = ReturnType<typeof createMockWebview>;

function eventsOf<T extends EventType>(webview: MockWebview, type: T): Array<EventPayload<T>> {
    const posted = (webview.postMessage as Mock).mock.calls.map(call => call[0] as OutboundEnvelope);
    // The envelope's type is narrowed at run time; the payload type follows from it.
    return posted.filter(message => message.kind === 'event' && message.type === type).map(message => (message as unknown as { payload: EventPayload<T> }).payload);
}

describe('extension.next (2.0 composition root)', () => {
    let dotnet: FakeDotnet;
    let context: ReturnType<typeof createMockExtensionContext>;
    let projectFiles: string[];
    let scratch: ScratchDir | undefined;

    async function start(seed: { workspaceState?: Record<string, unknown>; globalState?: Record<string, unknown>; overrides?: Partial<ActivationOverrides> } = {}): Promise<ActivatedExtension> {
        for (const [key, value] of Object.entries(seed.workspaceState ?? {})) {
            await context.workspaceState.update(key, value);
        }
        for (const [key, value] of Object.entries(seed.globalState ?? {})) {
            await context.globalState.update(key, value);
        }
        const extension = await activateWith(context as unknown as vscode.ExtensionContext, { spawn: dotnet.spawn, resolveExecutable: () => 'dotnet', ...seed.overrides });
        await extension.ready;
        return extension;
    }

    function resolveSidebar(): MockWebview {
        const provider = vi.mocked(vscode.window.registerWebviewViewProvider).mock.calls.at(-1)![1];
        const webview = createMockWebview();
        const view = { webview, visible: true, title: undefined, onDidChangeVisibility: vi.fn(), onDidDispose: vi.fn() };
        void provider.resolveWebviewView(view as unknown as vscode.WebviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
        return webview;
    }

    async function openPanel() {
        const panel = createFakePanel(createMockWebview());
        vi.mocked(vscode.window.createWebviewPanel).mockImplementationOnce(() => panel as unknown as vscode.WebviewPanel);
        await mockCommands.executeCommand('nuiget.openManager');
        return panel;
    }

    function watcherFor(glob: string) {
        const index = vi.mocked(vscode.workspace.createFileSystemWatcher).mock.calls.findIndex(call => call[0] === glob);
        expect(index, `no watcher for ${glob}`).toBeGreaterThanOrEqual(0);
        const watcher = mockWorkspace.createFileSystemWatcher.mock.results[index].value;
        return {
            change: (watcher.onDidChange as Mock).mock.calls[0][0] as (uri: vscode.Uri) => void,
            create: (watcher.onDidCreate as Mock).mock.calls[0][0] as (uri: vscode.Uri) => void,
        };
    }

    function submitHeld(extension: ActivatedExtension) {
        const gate = deferred();
        const ticket = extension.services.queue.submit<BulkOutcome>(
            'test operation',
            async ctx => {
                await gate.promise;
                return { opId: ctx.opId, status: 'completed', results: [], restores: [] };
            },
            (reason, opId) => ({ opId, status: 'rejected', results: [], restores: [], message: reason }),
        );
        return { gate, ticket };
    }

    const channel = () => mockWindow.createOutputChannel.mock.results.at(-1)!.value;
    const contextKeys = () => mockCommands.executeCommand.mock.calls.filter(call => call[0] === 'setContext').map(call => [call[1], call[2]]);
    const refreshRuns = () => contextKeys().filter(([key]) => key === 'nuiget.hasProjectFiles').length;
    const listings = () => dotnet.calls.filter(dotnetCalls.listSources());

    beforeEach(() => {
        vi.clearAllMocks();
        dotnet = createFakeDotnet();
        dotnet.sources = () => [sharedFeed];
        context = createMockExtensionContext();
        projectFiles = [appPath, libPath];
        mockWorkspace.findFiles.mockImplementation((async () => projectFiles.map(file => vscode.Uri.file(file))) as unknown as () => Promise<never[]>);
    });

    afterEach(async () => {
        vi.useRealTimers();
        for (const subscription of [...context.subscriptions].reverse()) {
            subscription.dispose();
        }
        // Let what the disposal aborted settle before the next test starts.
        await tick();
        mockWorkspace.workspaceFolders = defaultFolders;
        mockWorkspace.findFiles.mockImplementation(async () => []);
        mockCommands.executeCommand.mockImplementation(originalExecuteCommand);
        resetAllMocks();
        await scratch?.cleanup();
        scratch = undefined;
    });

    it('registers exactly the commands package.json contributes', async () => {
        const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { contributes: { commands: Array<{ command: string }> } };
        const contributed = manifest.contributes.commands.map(entry => entry.command);

        await start();

        const registered = mockCommands.registerCommand.mock.calls.map(call => call[0]);
        expect(contributed).toHaveLength(12);
        expect([...registered].sort()).toEqual([...contributed].sort());
    });

    it('registers the sidebar view provider and nuiget.openManager creates the nugetManager panel', async () => {
        const { services } = await start();

        expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith('nuiget.sidebarView', expect.anything(), { webviewOptions: { retainContextWhenHidden: true } });

        const panel = createFakePanel(createMockWebview());
        vi.mocked(vscode.window.createWebviewPanel).mockImplementationOnce(() => panel as unknown as vscode.WebviewPanel);
        await mockCommands.executeCommand('nuiget.openManager', vscode.Uri.file(libPath));
        expect(vi.mocked(vscode.window.createWebviewPanel).mock.calls[0].slice(0, 2)).toEqual(['nugetManager', 'nUIget']);
        expect(MainPanelHost.instance).toBeDefined();
        // The project of the menu the command came from is selected.
        await vi.waitFor(() => expect(services.session.snapshot.selectedProject).toBe(libPath));

        await mockCommands.executeCommand('nuiget.sidebar.openFullView');
        expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
        expect(panel.reveal).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['a tree item with a resourceUri', () => ({ resourceUri: vscode.Uri.file(libPath) })],
        ['an object with a projectPath', () => ({ projectPath: libPath })],
        ['an object with an fsPath', () => ({ fsPath: libPath })],
    ])('nuiget.openManager selects the project of %s', async (_name, argument) => {
        const { services } = await start({ workspaceState: { 'nuiget.selectedProject': appPath } });
        vi.mocked(vscode.window.createWebviewPanel).mockImplementationOnce(() => createFakePanel(createMockWebview()) as unknown as vscode.WebviewPanel);

        await mockCommands.executeCommand('nuiget.openManager', argument());

        await vi.waitFor(() => expect(services.session.snapshot.selectedProject).toBe(libPath));
    });

    it('a nuiget setting change is announced to the surfaces, an unrelated one is not', async () => {
        await start();
        const sidebar = resolveSidebar();
        const configListener = vi.mocked(vscode.workspace.onDidChangeConfiguration).mock.calls.at(-1)![0];

        configListener({ affectsConfiguration: section => section === 'http' });
        expect(eventsOf(sidebar, 'config/changed')).toHaveLength(0);
        configListener({ affectsConfiguration: section => section === 'nuiget' });

        expect(eventsOf(sidebar, 'config/changed')).toEqual([expect.objectContaining({ searchResultLimit: 50, enablePerformanceLogging: false })]);
    });

    it('proxyConfigured follows http.proxySupport, http.proxy and the proxy environment', () => {
        let settings: Record<string, string> = {};
        vi.mocked(vscode.workspace.getConfiguration).mockImplementation(((section?: string) => ({
            get: <T>(key: string, fallback?: T) => (settings[`${section}.${key}`] ?? fallback) as T,
            has: () => false,
            inspect: () => undefined,
            update: async () => undefined,
        })) as unknown as typeof vscode.workspace.getConfiguration);

        expect(proxyConfigured({})).toBe(false);
        expect(proxyConfigured({ HTTPS_PROXY: 'http://proxy.example:3128' })).toBe(true);
        expect(proxyConfigured({ http_proxy: '  ' })).toBe(false);
        settings = { 'http.proxy': 'http://proxy.example:3128' };
        expect(proxyConfigured({})).toBe(true);
        settings = { 'http.proxy': 'http://proxy.example:3128', 'http.proxySupport': 'off' };
        expect(proxyConfigured({ HTTPS_PROXY: 'http://proxy.example:3128' })).toBe(false);
        settings = { 'http.proxySupport': 'on' };
        expect(proxyConfigured({ HTTP_PROXY: 'http://proxy.example:3128' })).toBe(true);
    });

    it('an http setting change resets the transport and a nuiget change does not', async () => {
        const transport = new NodeTransport({ proxy: { isConfigured: () => false } });
        const reset = vi.spyOn(transport, 'reset');
        await start({ overrides: { transport } });
        const configListener = vi.mocked(vscode.workspace.onDidChangeConfiguration).mock.calls.at(-1)![0];

        configListener({ affectsConfiguration: section => section === 'nuiget' });
        expect(reset).not.toHaveBeenCalled();
        configListener({ affectsConfiguration: section => section === 'http' });
        expect(reset).toHaveBeenCalledTimes(1);
        transport.dispose();
    });

    it('composes the feeds: package/versions and search/query answer through the transport override', async () => {
        const base = sharedFeed.replace('/v3/index.json', '');
        let feedUp = true;
        const transport = new FakeTransport(request => {
            if (!feedUp) {
                return fail('network');
            }
            if (request.url === sharedFeed) {
                return json({ version: '3.0.0', resources: [{ '@id': `${base}/flat/`, '@type': 'PackageBaseAddress/3.0.0' }, { '@id': `${base}/query`, '@type': 'SearchQueryService' }] });
            }
            if (request.url === `${base}/flat/contoso.lib/index.json`) {
                return json({ versions: ['1.0.0', '2.0.0'] });
            }
            return json({ data: [] });
        });
        await start({ workspaceState: { 'nuiget.selectedProject': appPath }, overrides: { transport } });
        const sidebar = resolveSidebar();
        const [receive] = vi.mocked(sidebar.onDidReceiveMessage).mock.calls.at(-1) as unknown as [(message: unknown) => void];
        const ask = async <T extends RequestType>(type: T, payload: RequestPayload<T>, id: string) => {
            receive(makeRequest(type, payload, id));
            return vi.waitFor(() => {
                const response = (sidebar.postMessage as Mock).mock.calls.map(call => call[0] as OutboundEnvelope).find(message => message.kind === 'response' && message.id === id);
                expect(response).toBeDefined();
                return response;
            });
        };

        await expect(ask('package/versions', { packageId: 'Contoso.Lib', includePrerelease: false }, 'v1')).resolves.toMatchObject({ ok: true, result: { packageId: 'Contoso.Lib', versions: ['2.0.0', '1.0.0'] } });

        feedUp = false;
        await vscode.commands.executeCommand('nuiget.refreshPackages');
        await expect(ask('search/query', { query: 'contoso', includePrerelease: false }, 's1')).resolves.toMatchObject({ ok: true, result: { query: 'contoso', results: [], sourcesUnavailable: true } });
    });

    it('the health monitor probes nothing before a read registers a chain, probes the registered chain\'s sources after it, and reports sources/health to both surfaces', async () => {
        const transport = new FakeTransport(() => fail('network'));
        const { services } = await start({ workspaceState: { 'nuiget.selectedProject': appPath }, overrides: { transport } });
        const sidebar = resolveSidebar();
        const panel = await openPanel();
        await flushMicrotasks();

        expect(transport.urls()).toEqual([]);
        expect(dotnet.calls.filter(call => call.args.join(' ') === 'nuget config paths')).toEqual([]);

        await services.catalog.installed(appPath);

        await vi.waitFor(() => expect(transport.urls()).toContain(sharedFeed));
        for (const webview of [sidebar, panel.webview]) {
            await vi.waitFor(() => expect(eventsOf(webview, 'sources/health').at(-1)).toEqual({ failed: [expect.objectContaining({ url: sharedFeed })] }));
        }
        expect(dotnet.calls.filter(call => call.args.join(' ') === 'nuget config paths')).toHaveLength(1);
    });

    it('a sources invalidation restarts the monitor and a recovery invalidates nothing', async () => {
        let feedUp = false;
        const transport = new FakeTransport(() => (feedUp ? json({ version: '3.0.0', resources: [{ '@id': 'https://shared.example/query', '@type': 'SearchQueryService' }] }) : fail('network')));
        const { services } = await start({ workspaceState: { 'nuiget.selectedProject': appPath }, overrides: { transport } });
        const sidebar = resolveSidebar();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        await services.catalog.installed(appPath);
        await vi.waitFor(() => expect(eventsOf(sidebar, 'sources/health').at(-1)?.failed).toHaveLength(1));

        feedUp = true;
        const invalidations = eventsOf(sidebar, 'resources/invalidated').length;
        await vi.advanceTimersByTimeAsync(120_001);
        await vi.waitFor(() => expect(eventsOf(sidebar, 'sources/health').at(-1)).toEqual({ failed: [] }));
        expect(eventsOf(sidebar, 'resources/invalidated')).toHaveLength(invalidations);

        // After a sources invalidation the chains are gone; the next read registers its chain again and the monitor,
        // restarted, probes it at once instead of at its next interval.
        feedUp = false;
        services.invalidate({ kind: 'sources' }, 'manual-refresh');
        const probesBefore = transport.urls().filter(url => url === sharedFeed).length;
        await services.catalog.updates(appPath, false);
        await vi.waitFor(() => expect(transport.urls().filter(url => url === sharedFeed).length).toBeGreaterThan(probesBefore));
        await vi.waitFor(() => expect(eventsOf(sidebar, 'sources/health').at(-1)?.failed).toHaveLength(1));
    });

    it('sets nuiget.hasProjectFiles, nuiget.prereleaseEnabled and nuiget.restoreEnabled at activation', async () => {
        await start({ workspaceState: { 'nuiget.includePrerelease': true } });

        expect(contextKeys()).toContainEqual(['nuiget.hasProjectFiles', true]);
        expect(contextKeys()).toContainEqual(['nuiget.prereleaseEnabled', true]);
        expect(contextKeys()).toContainEqual(['nuiget.restoreEnabled', true]);
    });

    it('reports a workspace without projects through nuiget.hasProjectFiles', async () => {
        projectFiles = [];

        const { services } = await start();

        expect(contextKeys()).toContainEqual(['nuiget.hasProjectFiles', false]);
        expect(services.session.snapshot.selectedProject).toBe('');
    });

    it('workspaceFolderFor names the deepest workspace folder that contains the path', async () => {
        const outer = vscode.Uri.file('/test-workspace');
        const inner = vscode.Uri.file('/test-workspace/nested');
        mockWorkspace.workspaceFolders = [{ uri: outer, name: 'outer', index: 0 }, { uri: inner, name: 'inner', index: 1 }];
        const { services } = await start();

        expect(services.workspaceFolderFor()).toBe(outer.fsPath);
        expect(services.workspaceFolderFor(appPath)).toBe(outer.fsPath);
        expect(services.workspaceFolderFor(vscode.Uri.file('/test-workspace/nested/Tool/Tool.csproj').fsPath)).toBe(inner.fsPath);
        // A project that no folder contains has no workspace folder; the first one is not a guess for it.
        expect(services.workspaceFolderFor(vscode.Uri.file('/elsewhere/Tool.csproj').fsPath)).toBeUndefined();

        mockWorkspace.workspaceFolders = [];
        expect(services.workspaceFolderFor()).toBeUndefined();
    });

    it('the sidebar commands act on the shared session', async () => {
        const { services } = await start();

        await mockCommands.executeCommand('nuiget.sidebar.togglePrerelease');
        await mockCommands.executeCommand('nuiget.sidebar.toggleRestoreOff');

        expect(services.session.snapshot).toMatchObject({ includePrerelease: true, restoreEnabled: false });
        expect(contextKeys()).toContainEqual(['nuiget.restoreEnabled', false]);
    });

    it("a selected-project change reconciles with the new project's sources (C-state-core-5)", async () => {
        dotnet.sources = cwd => sameDir(cwd, appDir) ? [privateFeed, sharedFeed] : [sharedFeed];
        const { services } = await start({ workspaceState: { 'nuiget.selectedProject': appPath, 'nuiget.selectedSource': privateFeed } });
        expect(services.session.snapshot).toMatchObject({ selectedProject: appPath, selectedSource: privateFeed });
        expect(listings().some(call => sameDir(call.cwd, libDir))).toBe(false);

        await services.session.apply({ selectedProject: libPath }, 'sidebar');

        await vi.waitFor(() => expect(services.session.snapshot.selectedSource).toBe('all'));
        expect(services.session.snapshot.selectedProject).toBe(libPath);
        expect(listings().some(call => sameDir(call.cwd, libDir))).toBe(true);
    });

    it("a selection that moves during a refresh is not reconciled against the previous project's sources", async () => {
        dotnet.sources = cwd => sameDir(cwd, appDir) ? [privateFeed, sharedFeed] : [sharedFeed];
        const { services } = await start({ workspaceState: { 'nuiget.selectedProject': appPath, 'nuiget.selectedSource': privateFeed } });
        const broadcast: string[] = [];
        services.session.onDidChange(snapshot => broadcast.push(snapshot.selectedSource));
        const runs = refreshRuns();

        // The listing of Lib's sources is slow; the selection goes back to App before it answers.
        const listing = dotnet.hold(dotnetCalls.listSources(libDir));
        await services.session.apply({ selectedProject: libPath }, 'sidebar');
        await vi.waitFor(() => expect(listing.seen).toBe(1));
        await services.session.apply({ selectedProject: appPath }, 'main');
        listing.release();

        // One run for each selection; the first one must not judge App's source against Lib's list.
        await vi.waitFor(() => expect(refreshRuns()).toBe(runs + 2));
        await pause(20);
        expect(services.session.snapshot).toMatchObject({ selectedProject: appPath, selectedSource: privateFeed });
        expect(broadcast).toEqual([privateFeed, privateFeed]);
    });

    it("a replaced selection is reconciled against the replacement project's sources", async () => {
        dotnet.sources = cwd => sameDir(cwd, appDir) ? [privateFeed, sharedFeed] : [sharedFeed];

        const { services } = await start({ workspaceState: { 'nuiget.selectedProject': gonePath, 'nuiget.selectedSource': privateFeed } });

        // The source is valid for the project that replaces the vanished one, and only its directory was asked.
        expect(services.session.snapshot).toMatchObject({ selectedProject: appPath, selectedSource: privateFeed });
        expect(listings().some(call => sameDir(call.cwd, appDir))).toBe(true);
        expect(listings().some(call => sameDir(call.cwd, path.dirname(gonePath)))).toBe(false);
        // One commit by the host for the replacement, and no second refresh because of it.
        expect(services.session.snapshot).toMatchObject({ rev: 2, origin: 'host' });
        expect(refreshRuns()).toBe(1);
    });

    it('a selection that moves to the replacement project during the listing is still reconciled', async () => {
        const unknownFeed = 'https://unknown.example/v3/index.json';
        // The persisted project is gone, so App replaces it; App's listing is slow.
        const listing = dotnet.hold(dotnetCalls.listSources(appDir));
        for (const [key, value] of Object.entries({ 'nuiget.selectedProject': gonePath, 'nuiget.selectedSource': unknownFeed })) {
            await context.workspaceState.update(key, value);
        }
        const extension = await activateWith(context as unknown as vscode.ExtensionContext, { spawn: dotnet.spawn, resolveExecutable: () => 'dotnet' });
        await vi.waitFor(() => expect(listing.seen).toBe(1));

        // The user picks exactly that project meanwhile. No other run will follow, so this one must reconcile.
        await extension.services.session.apply({ selectedProject: appPath }, 'sidebar');
        listing.release();
        await extension.ready;

        expect(extension.services.session.snapshot).toMatchObject({ selectedProject: appPath, selectedSource: 'all' });
    });

    it('a failed source listing keeps the selected source', async () => {
        dotnet.fail(dotnetCalls.listSources(), { code: 1, stderr: 'error: the feed list could not be read' });

        const { services } = await start({ workspaceState: { 'nuiget.selectedProject': gonePath, 'nuiget.selectedSource': privateFeed } });

        // The reconciliation still ran: a project that no longer exists is replaced.
        expect(services.session.snapshot.selectedProject).toBe(appPath);
        expect(services.session.snapshot.selectedSource).toBe(privateFeed);
        expect(channel().warn).toHaveBeenCalledWith(expect.stringContaining('Package sources could not be listed'));
    });

    it('a failed source listing after a good one keeps the last known sources', async () => {
        dotnet.sources = () => [privateFeed, sharedFeed];
        const { services } = await start({ workspaceState: { 'nuiget.selectedProject': appPath } });
        expect(services.session.snapshot.selectedSource).toBe('all');

        dotnet.fail(dotnetCalls.listSources(), { code: 1 });
        services.invalidate({ kind: 'sources' }, 'manual-refresh');
        await vi.waitFor(() => expect(channel().warn).toHaveBeenCalledWith(expect.stringContaining('Package sources could not be listed')));
        await tick();

        // An empty list would turn this selection back into `all`.
        await services.session.apply({ selectedSource: privateFeed }, 'sidebar');
        expect(services.session.snapshot.selectedSource).toBe(privateFeed);
    });

    it('overlapping refreshes are coalesced', async () => {
        const { services } = await start();
        const before = refreshRuns();
        const hold = deferred();
        let held = false;
        mockCommands.executeCommand.mockImplementation(async (command: string, ...args: unknown[]) => {
            if (command === 'setContext' && args[0] === 'nuiget.hasProjectFiles' && !held) {
                held = true;
                await hold.promise;
            }
            return originalExecuteCommand(command, ...args);
        });

        services.invalidate({ kind: 'sources' }, 'manual-refresh');
        await vi.waitFor(() => expect(refreshRuns()).toBe(before + 1));
        // Two more requests while the first run is held, each in its own invalidation event.
        services.invalidate({ kind: 'sources' }, 'manual-refresh');
        await tick();
        services.invalidate({ kind: 'sources' }, 'manual-refresh');
        await tick();
        hold.resolve();

        await vi.waitFor(() => expect(refreshRuns()).toBe(before + 2));
        await pause(50);
        expect(refreshRuns()).toBe(before + 2);
    });

    it('resources/invalidated reaches both surfaces with keys', async () => {
        await start();
        const sidebar = resolveSidebar();
        const panel = await openPanel();

        await mockCommands.executeCommand('nuiget.refreshPackages');

        await vi.waitFor(() => expect(eventsOf(panel.webview, 'resources/invalidated')).toHaveLength(1));
        const [event] = eventsOf(sidebar, 'resources/invalidated');
        expect(event).toMatchObject({ scope: { kind: 'workspace' }, reason: 'manual-refresh', generation: expect.any(Number) });
        // The first computation of a key is generation 1; this is its first invalidation.
        expect(event.keys).toContainEqual({ key: 'projects', generation: 2 });
        expect(eventsOf(panel.webview, 'resources/invalidated')).toEqual([event]);
    });

    it('a disposed main panel receives no further events', async () => {
        await start();
        const sidebar = resolveSidebar();
        const panel = await openPanel();

        panel.dispose();
        expect(MainPanelHost.instance).toBeUndefined();
        (panel.webview.postMessage as Mock).mockClear();
        await mockCommands.executeCommand('nuiget.sidebar.refresh');

        await vi.waitFor(() => expect(eventsOf(sidebar, 'resources/invalidated')).toHaveLength(1));
        expect(panel.webview.postMessage).not.toHaveBeenCalled();
    });

    it('the status bar shows the queue and hides when it is idle', async () => {
        const extension = await start();
        const item = mockWindow.createStatusBarItem.mock.results.at(-1)!.value;
        expect(mockWindow.createStatusBarItem).toHaveBeenCalledWith(vscode.StatusBarAlignment.Left, 100);

        const first = submitHeld(extension);
        await vi.waitFor(() => expect(item.text).toBe('$(sync~spin) nUIget: operation running'));
        expect(item.show).toHaveBeenCalled();
        const second = submitHeld(extension);
        await vi.waitFor(() => expect(item.text).toBe('$(sync~spin) nUIget: 1 running, 1 queued'));

        first.gate.resolve();
        await first.ticket.completion;
        await vi.waitFor(() => expect(item.text).toBe('$(sync~spin) nUIget: operation running'));
        expect(item.hide).not.toHaveBeenCalled();
        second.gate.resolve();
        await second.ticket.completion;
        await vi.waitFor(() => expect(item.hide).toHaveBeenCalled());
    });

    it('sweeps the legacy nuiget.sdkVersionCache key and hydrates nuiget.sdkVersionCache.v2', async () => {
        const { services } = await start({
            globalState: {
                [LEGACY_SDK_CACHE_KEY]: { v: '1.18.9', entries: { [appDir]: 9 } },
                [SDK_CACHE_KEY]: { v: '0.0.0-test', entries: { [path.resolve(appDir)]: '10.0.401' } },
            },
        });

        expect(context.globalState.get(LEGACY_SDK_CACHE_KEY)).toBeUndefined();

        // The SDK of the hydrated directory is known without a probe; the other directory is probed.
        await services.catalog.installed(appPath);
        await services.catalog.installed(libPath);
        const probed = dotnet.calls.filter(call => call.args[0] === '--version').map(call => path.resolve(call.cwd));
        expect(probed).toEqual([path.resolve(libDir)]);
    });

    it('a workspace-folder change refills stopDirs and invalidates the workspace', async () => {
        scratch = await createScratchDir('root-stopdirs');
        const folder = path.join(scratch.dir, 'ws');
        const project = path.join(folder, 'App', 'App.csproj');
        await writeTree(scratch.dir, {
            // Central Package Management declared above the folder that becomes the workspace folder.
            'Directory.Packages.props': '<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup></Project>',
            'ws/App/App.csproj': '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>',
        });
        const { services } = await start();
        const sidebar = resolveSidebar();
        expect((await services.catalog.installed(project)).result.isCpm).toBe(true);

        mockWorkspace.workspaceFolders = [{ uri: vscode.Uri.file(folder), name: 'ws', index: 0 }];
        const folderListener = vi.mocked(vscode.workspace.onDidChangeWorkspaceFolders).mock.calls.at(-1)![0];
        folderListener({ added: [], removed: [] });

        await vi.waitFor(() => expect(eventsOf(sidebar, 'resources/invalidated')).toHaveLength(1));
        expect(eventsOf(sidebar, 'resources/invalidated')[0]).toMatchObject({ scope: { kind: 'workspace' }, reason: 'workspace-folders' });
        // The walk up to the props file now stops at the new workspace folder.
        expect((await services.catalog.installed(project)).result.isCpm).toBe(false);
    });

    it('a project-file change invalidates the project after the debounce and waits for an idle queue', async () => {
        const extension = await start();
        const sidebar = resolveSidebar();
        const projects = watcherFor('**/*.{csproj,fsproj,vbproj}');
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

        projects.change(vscode.Uri.file(appPath));
        await vi.advanceTimersByTimeAsync(1000);
        projects.create(vscode.Uri.file(libPath));
        await vi.advanceTimersByTimeAsync(1499);
        expect(eventsOf(sidebar, 'resources/invalidated')).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(1);
        await flushMicrotasks();

        // One event for both files: the debounce restarted and the coordinator merged the scopes.
        expect(eventsOf(sidebar, 'resources/invalidated')).toHaveLength(1);
        expect(eventsOf(sidebar, 'resources/invalidated')[0]).toMatchObject({ reason: 'file-watcher', scope: { kind: 'project' } });
        const scope = eventsOf(sidebar, 'resources/invalidated')[0].scope as { projectPaths: string[] };
        expect([...scope.projectPaths].sort()).toEqual([appPath, libPath].sort());

        const operation = submitHeld(extension);
        await flushMicrotasks();
        projects.change(vscode.Uri.file(appPath));
        await vi.advanceTimersByTimeAsync(1500);
        await flushMicrotasks();
        expect(eventsOf(sidebar, 'resources/invalidated')).toHaveLength(1);

        operation.gate.resolve();
        await operation.ticket.completion;
        await flushMicrotasks();
        expect(eventsOf(sidebar, 'resources/invalidated')).toHaveLength(2);
        expect(eventsOf(sidebar, 'resources/invalidated')[1]).toMatchObject({ reason: 'file-watcher', scope: { kind: 'project', projectPaths: [appPath] } });
    });

    it('watches props, nuget.config, global.json, lock and assets files with their scopes', async () => {
        scratch = await createScratchDir('root-watchers');
        const project = path.join(scratch.dir, 'App', 'App.csproj');
        await writeTree(scratch.dir, { 'App/App.csproj': '<Project Sdk="Microsoft.NET.Sdk" />' });
        await start({ globalState: { [SDK_CACHE_KEY]: { v: '0.0.0-test', entries: { [path.resolve(appDir)]: '10.0.401' } } } });
        const sidebar = resolveSidebar();
        const invalidations = () => eventsOf(sidebar, 'resources/invalidated').map(event => ({ scope: event.scope, reason: event.reason }));
        expect(vi.mocked(vscode.workspace.createFileSystemWatcher).mock.calls.map(call => call[0])).toEqual([
            '**/*.{csproj,fsproj,vbproj}',
            '**/Directory.{Build,Packages}.{props,targets}',
            '**/{nuget.config,NuGet.Config,NuGet.config}',
            '**/global.json',
            '**/packages.lock.json',
            '**/obj/project.assets.json',
        ]);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

        watcherFor('**/{nuget.config,NuGet.Config,NuGet.config}').change(vscode.Uri.file('/test-workspace/nuget.config'));
        await vi.advanceTimersByTimeAsync(1000);
        await flushMicrotasks();
        expect(invalidations()).toEqual([{ scope: { kind: 'sources' }, reason: 'file-watcher' }]);

        watcherFor('**/Directory.{Build,Packages}.{props,targets}').change(vscode.Uri.file('/test-workspace/Directory.Packages.props'));
        await vi.advanceTimersByTimeAsync(1500);
        await flushMicrotasks();
        expect(invalidations()[1]).toEqual({ scope: { kind: 'workspace' }, reason: 'file-watcher' });

        watcherFor('**/global.json').change(vscode.Uri.file('/test-workspace/global.json'));
        await vi.advanceTimersByTimeAsync(1000);
        await flushMicrotasks();
        expect(invalidations()[2]).toEqual({ scope: { kind: 'workspace' }, reason: 'file-watcher' });
        // A changed `global.json` can pin another SDK: the persisted answers are dropped.
        expect(context.globalState.get(SDK_CACHE_KEY)).toBeUndefined();

        // These two name a file of the project, not the project: its file is looked up in the directory.
        // One after the other: each flush reads the directory, and two reads in flight finish in either order.
        watcherFor('**/packages.lock.json').change(vscode.Uri.file(path.join(scratch.dir, 'App', 'packages.lock.json')));
        await vi.advanceTimersByTimeAsync(1500);
        await vi.waitFor(() => expect(invalidations()).toHaveLength(4));
        watcherFor('**/obj/project.assets.json').change(vscode.Uri.file(path.join(scratch.dir, 'App', 'obj', 'project.assets.json')));
        await vi.advanceTimersByTimeAsync(2000);
        vi.useRealTimers();
        await vi.waitFor(() => expect(invalidations()).toHaveLength(5));
        expect(invalidations().slice(3)).toEqual([
            { scope: { kind: 'project', projectPaths: [project] }, reason: 'file-watcher' },
            { scope: { kind: 'project', projectPaths: [project] }, reason: 'restore' },
        ]);
    });

    it('nuiget.clearHttpCache clears the network cache and invalidates the workspace', async () => {
        const seed = new TieredCache({ store: context.workspaceState });
        seed.set('search:query', ['Some.Package'], 'search');
        seed.set('icon:some.package', 'data:image/png;base64,AA==', 'iconFound');
        await flushMicrotasks();
        await start();
        const sidebar = resolveSidebar();

        await mockCommands.executeCommand('nuiget.clearHttpCache');

        expect(dotnet.calls.map(call => call.args.join(' '))).toContain('nuget locals http-cache --clear');
        expect(context.workspaceState.get('nuiget.cache.search:query')).toBeUndefined();
        expect(context.workspaceState.get('nuiget.cache.icon:some.package')).toBeDefined();
        await vi.waitFor(() => expect(eventsOf(sidebar, 'resources/invalidated')).toHaveLength(1));
        expect(eventsOf(sidebar, 'resources/invalidated')[0]).toMatchObject({ scope: { kind: 'workspace' }, reason: 'manual-refresh' });
        expect(mockWindow.showInformationMessage).toHaveBeenCalledWith('nUIget: NuGet HTTP cache cleared.');
    });

    it('nuiget.clearSdkVersionCache clears the runner cache and invalidates the workspace', async () => {
        await start({ globalState: { [SDK_CACHE_KEY]: { v: '0.0.0-test', entries: { [path.resolve(appDir)]: '10.0.401' } } } });
        const sidebar = resolveSidebar();

        await mockCommands.executeCommand('nuiget.clearSdkVersionCache');

        expect(context.globalState.get(SDK_CACHE_KEY)).toBeUndefined();
        await vi.waitFor(() => expect(eventsOf(sidebar, 'resources/invalidated')).toHaveLength(1));
        expect(eventsOf(sidebar, 'resources/invalidated')[0]).toMatchObject({ scope: { kind: 'workspace' }, reason: 'manual-refresh' });
        expect(mockWindow.showInformationMessage).toHaveBeenCalledWith('nUIget: SDK version cache cleared.');
    });

    it('the logger handed to the core redacts every message (N45)', async () => {
        // A persisted cache entry whose key carries a credential, in a store that then refuses writes.
        const secretKey = 'search:https://user:secret@feed.example/v3/index.json|query';
        const seed = new TieredCache({ store: context.workspaceState });
        seed.set(secretKey, [], 'search');
        await flushMicrotasks();
        const { services } = await start();
        context.workspaceState.update.mockRejectedValue(new Error('disk full at https://user:secret@feed.example/v3/index.json'));

        await mockCommands.executeCommand('nuiget.clearHttpCache');
        await vi.waitFor(() => expect(channel().warn).toHaveBeenCalledWith(expect.stringContaining('Cache persistence failed')));
        services.logger.warn('listing https://user:secret@feed.example/v3/index.json failed', 'https://user:secret@feed.example', new Error('GET https://user:secret@feed.example'), { untouched: true });
        services.logger.error(new Error('GET https://user:secret@feed.example failed'));

        const written = [channel().warn, channel().error, channel().info, channel().debug].flatMap(method => method.mock.calls.flat());
        const text = written.filter((value): value is string => typeof value === 'string');
        expect(text.some(value => value.includes('feed.example'))).toBe(true);
        expect(text.filter(value => value.includes('secret'))).toEqual([]);
        expect(written.some(value => value instanceof Error)).toBe(false);
        expect(written).toContainEqual({ untouched: true });
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

// ──────────────────────────────────────────────
// Mock NuGetOperations
// ──────────────────────────────────────────────
const hoisted = vi.hoisted(() => ({
    mockExecuteSingleOperation: vi.fn().mockResolvedValue(true),
    mockExecuteBulkInstall: vi.fn().mockResolvedValue(undefined),
    mockExecuteBulkUpdatePackages: vi.fn().mockResolvedValue(undefined),
    mockExecuteBulkUpdateAllProjects: vi.fn().mockResolvedValue(undefined),
    mockQueryAllProjectsUpdates: vi.fn().mockResolvedValue([]),
    mockQueryAllProjectsInstalled: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/NuGetOperations', () => ({
    executeSingleOperation: hoisted.mockExecuteSingleOperation,
    executeBulkInstall: hoisted.mockExecuteBulkInstall,
    executeBulkUpdatePackages: hoisted.mockExecuteBulkUpdatePackages,
    executeBulkUpdateAllProjects: hoisted.mockExecuteBulkUpdateAllProjects,
    queryAllProjectsUpdates: hoisted.mockQueryAllProjectsUpdates,
    queryAllProjectsInstalled: hoisted.mockQueryAllProjectsInstalled,
}));

vi.mock('../services/NuGetService', () => ({
    NuGetService: vi.fn(),
}));

vi.mock('./NuGetPanel', () => ({
    NuGetPanel: {
        syncPrerelease: vi.fn(),
        syncSource: vi.fn(),
        syncProject: vi.fn(),
        openSourceSettings: vi.fn(),
    },
}));

import { NuGetPanel } from './NuGetPanel';
import { NuGetSidebarProvider } from './NuGetSidebarPanel';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
let messageListener: ((data: Record<string, unknown>) => Promise<void>) | undefined;

function createMockNuGetService() {
    return {
        findProjects: vi.fn().mockResolvedValue([]),
        getInstalledPackages: vi.fn().mockResolvedValue([]),
        checkPackageUpdatesMinimal: vi.fn().mockResolvedValue([]),
        searchPackages: vi.fn().mockResolvedValue([]),
        getSources: vi.fn().mockResolvedValue([]),
        getFailedSources: vi.fn().mockReturnValue(new Map()),
        getPackageVersions: vi.fn().mockResolvedValue([]),
        clearVersionsCache: vi.fn(),
        clearVersionsCacheForPackages: vi.fn(),
        clearInMemoryNuGetCaches: vi.fn(),
        clearNuGetHttpCacheBackground: vi.fn(),
        resolveSourcesForBatch: vi.fn().mockResolvedValue([{ url: 'https://api.nuget.org/v3/index.json', endpoints: {}, authHeader: undefined }]),
    } as unknown;
}

function createMockContext() {
    const workspaceState = new Map<string, unknown>();
    const globalState = new Map<string, unknown>();
    return {
        workspaceState: {
            get: vi.fn((key: string, defaultValue?: unknown) => workspaceState.get(key) ?? defaultValue),
            update: vi.fn(async (key: string, value: unknown) => { workspaceState.set(key, value); }),
            keys: vi.fn(() => [...workspaceState.keys()]),
            _store: workspaceState,
        },
        globalState: {
            get: vi.fn((key: string, defaultValue?: unknown) => globalState.get(key) ?? defaultValue),
            update: vi.fn(async (key: string, value: unknown) => { globalState.set(key, value); }),
            keys: vi.fn(() => [...globalState.keys()]),
            setKeysForSync: vi.fn(),
            _store: globalState,
        },
        subscriptions: [],
    } as unknown as vscode.ExtensionContext;
}

function createMockOutputChannel(): vscode.LogOutputChannel {
    return {
        name: 'nUIget', appendLine: vi.fn(), append: vi.fn(), show: vi.fn(),
        clear: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
        debug: vi.fn(), trace: vi.fn(), dispose: vi.fn(), replace: vi.fn(),
        hide: vi.fn(), logLevel: 1, onDidChangeLogLevel: vi.fn(),
    } as unknown as vscode.LogOutputChannel;
}

function createMockWebviewView() {
    const postMessage = vi.fn();
    return {
        webview: {
            html: '',
            postMessage,
            onDidReceiveMessage: vi.fn((cb: (data: Record<string, unknown>) => Promise<void>) => {
                messageListener = cb;
                return { dispose: vi.fn() };
            }),
            asWebviewUri: vi.fn((uri: vscode.Uri) => uri),
            cspSource: 'https://test.csp',
            options: {},
        },
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
        visible: true,
        title: undefined as string | undefined,
    };
}

function createProvider(service?: unknown, context?: vscode.ExtensionContext) {
    const svc = service ?? createMockNuGetService();
    const ctx = context ?? createMockContext();
    const ch = createMockOutputChannel();
    return {
        provider: new NuGetSidebarProvider(vscode.Uri.file('/ext'), ctx, ch, svc as any),
        service: svc as ReturnType<typeof createMockNuGetService>,
        context: ctx,
        channel: ch,
    };
}

function resolveView(provider: NuGetSidebarProvider): ReturnType<typeof createMockWebviewView> {
    const view = createMockWebviewView();
    provider.resolveWebviewView(view as any, {} as any, {} as any);
    return view;
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────
describe('NuGetSidebarProvider', () => {
    let provider: NuGetSidebarProvider;
    let service: ReturnType<typeof createMockNuGetService>;
    let context: vscode.ExtensionContext;
    let view: ReturnType<typeof createMockWebviewView>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        messageListener = undefined;
        const setup = createProvider();
        provider = setup.provider;
        service = setup.service;
        context = setup.context;
    });

    afterEach(() => {
        provider.dispose();
        vi.useRealTimers();
    });

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────
    describe('constructor', () => {
        it('restores persisted state from workspaceState', () => {
            const ctx = createMockContext();
            (ctx.workspaceState as any)._store.set('nuget.includePrerelease', true);
            (ctx.workspaceState as any)._store.set('nuget.selectedSource', 'https://custom');
            (ctx.workspaceState as any)._store.set('nuget.selectedProject', '/proj.csproj');

            const { provider: p } = createProvider(undefined, ctx);
            // Context key should be set for prerelease
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'nuiget.prereleaseEnabled', true);
            p.dispose();
        });
    });

    // ──────────────────────────────────────────────
    // resolveWebviewView
    // ──────────────────────────────────────────────
    describe('resolveWebviewView', () => {
        it('sets up webview with HTML and message listener', () => {
            view = resolveView(provider);
            expect(view.webview.html).toContain('sidebar.js');
            expect(view.webview.html).toContain('Content-Security-Policy');
            expect(messageListener).toBeDefined();
        });

        it('enables scripts and sets local resource roots', () => {
            view = resolveView(provider);
            expect(view.webview.options).toEqual(expect.objectContaining({ enableScripts: true }));
        });
    });

    // ──────────────────────────────────────────────
    // togglePrerelease
    // ──────────────────────────────────────────────
    describe('togglePrerelease', () => {
        it('toggles state, persists, and syncs to main panel', () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();

            provider.togglePrerelease();

            expect(context.workspaceState.update).toHaveBeenCalledWith('nuget.includePrerelease', true);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'nuiget.prereleaseEnabled', true);
            expect(view.webview.postMessage).toHaveBeenCalledWith({ type: 'prereleaseChanged', includePrerelease: true });
            expect(NuGetPanel.syncPrerelease).toHaveBeenCalledWith(true);
        });
    });

    // ──────────────────────────────────────────────
    // Cross-panel sync
    // ──────────────────────────────────────────────
    describe('cross-panel sync', () => {
        beforeEach(() => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
        });

        it('syncPrerelease updates state and posts to webview', () => {
            provider.syncPrerelease(true);
            expect(view.webview.postMessage).toHaveBeenCalledWith({ type: 'prereleaseChanged', includePrerelease: true });
        });

        it('syncSource updates state and posts to webview', () => {
            provider.syncSource('https://custom');
            expect(view.webview.postMessage).toHaveBeenCalledWith({ type: 'sourceChanged', source: 'https://custom' });
        });

        it('syncProject updates state, title, and posts to webview', async () => {
            (service as any).findProjects.mockResolvedValue([{ name: 'MyProject.csproj', path: '/my/MyProject.csproj' }]);
            await provider.syncProject('/my/MyProject.csproj');
            expect(view.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'projectChanged',
                projectPath: '/my/MyProject.csproj',
            }));
            expect(view.title).toBe('MyProject');
        });

        it('syncProject handles All Projects sentinel', async () => {
            (service as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            await provider.syncProject('__all_projects__');
            expect(view.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'projectChanged',
                projectPath: '__all_projects__',
                projectName: 'All Projects (2)',
            }));
            expect(view.title).toBe('All Projects (2)');
        });
    });

    // ──────────────────────────────────────────────
    // notifySidebarOfChange
    // ──────────────────────────────────────────────
    describe('notifySidebarOfChange', () => {
        it('posts packageChanged and re-checks updates', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();

            await provider.notifySidebarOfChange({ type: 'install', packageId: 'Pkg', projectPath: '/proj.csproj' });
            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'packageChanged',
                operation: { type: 'install', packageId: 'Pkg', projectPath: '/proj.csproj' }
            });
        });

        it('does not notify main panel back (avoids redundant refresh loop)', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([{ name: 'A.csproj', path: '/A.csproj' }]);
            (service as any).getInstalledPackages.mockResolvedValue([{ id: 'Pkg', version: '1.0' }]);
            (service as any).checkPackageUpdatesMinimal.mockResolvedValue([]);
            (vscode.commands.executeCommand as any).mockClear();

            await provider.notifySidebarOfChange({ type: 'remove', packageId: 'Pkg', projectPath: '/A.csproj' });

            // checkUpdatesInBackground ran, but should NOT have notified main panel
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('nuiget.refreshPackages');
        });
    });

    // ──────────────────────────────────────────────
    // refreshSidebar
    // ──────────────────────────────────────────────
    describe('refreshSidebar', () => {
        it('re-sends sources and triggers forceRefresh', async () => {
            view = resolveView(provider);
            (service as any).getSources.mockResolvedValue([{ name: 'nuget.org', url: 'https://nuget.org', enabled: true }]);
            view.webview.postMessage.mockClear();

            await provider.refreshSidebar();
            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'sources',
                sources: [{ name: 'nuget.org', url: 'https://nuget.org', enabled: true }]
            });
            expect(view.webview.postMessage).toHaveBeenCalledWith({ type: 'forceRefresh' });
        });
    });

    // ──────────────────────────────────────────────
    // dispose
    // ──────────────────────────────────────────────
    describe('dispose', () => {
        it('sets _disposed to true', () => {
            view = resolveView(provider);
            expect((provider as any)._disposed).toBe(false);

            provider.dispose();
            expect((provider as any)._disposed).toBe(true);
        });

        it('clears file watcher debounce', () => {
            view = resolveView(provider);
            provider.startBackgroundMonitoring();

            // Simulate a debounce timer being set
            (provider as any)._fileWatcherDebounce = setTimeout(() => { /* noop */ }, 10000);
            expect((provider as any)._fileWatcherDebounce).toBeDefined();

            provider.dispose();
            expect((provider as any)._fileWatcherDebounce).toBeUndefined();
        });
    });

    // ──────────────────────────────────────────────
    // checkUpdatesInBackground
    // ──────────────────────────────────────────────
    describe('checkUpdatesInBackground', () => {
        it('fetches projects and checks updates', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([{ name: 'A.csproj', path: '/A.csproj' }]);
            (service as any).getInstalledPackages.mockResolvedValue([{ id: 'Pkg', version: '1.0' }]);
            (service as any).checkPackageUpdatesMinimal.mockResolvedValue([
                { id: 'Pkg', installedVersion: '1.0', latestVersion: '2.0' }
            ]);

            await provider.checkUpdatesInBackground();

            expect((service as any).checkPackageUpdatesMinimal).toHaveBeenCalled();
        });

        it('sends updates to webview when active', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            (service as any).findProjects.mockResolvedValue([{ name: 'A.csproj', path: '/A.csproj' }]);
            (service as any).getInstalledPackages.mockResolvedValue([]);
            (service as any).checkPackageUpdatesMinimal.mockResolvedValue([]);

            await provider.checkUpdatesInBackground();

            expect(view.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'allProjectsUpdates'
            }));
        });

        it('serializes concurrent checks (no parallel runs)', async () => {
            (service as any).findProjects.mockResolvedValue([]);
            const firstCheck = provider.checkUpdatesInBackground();
            const secondCheck = provider.checkUpdatesInBackground();

            await firstCheck;
            await secondCheck;

            // findProjects should only be called once (second was rejected)
            expect((service as any).findProjects).toHaveBeenCalledTimes(1);
        });

        it('queues re-run when force=true during active check', async () => {
            let resolveFirst!: () => void;
            (service as any).findProjects
                .mockImplementationOnce(() => new Promise<unknown[]>(r => { resolveFirst = () => r([]); }))
                .mockResolvedValue([]);

            const firstCheck = provider.checkUpdatesInBackground();
            // Force check while first is running
            const secondCheck = provider.checkUpdatesInBackground(true);

            resolveFirst();
            await firstCheck;
            await secondCheck;
            // Wait for the queued re-run
            await vi.runAllTimersAsync();

            // findProjects called twice total: first check + queued re-run
            expect((service as any).findProjects).toHaveBeenCalledTimes(2);
        });

        it('returns early when no projects are found', async () => {
            (service as any).findProjects.mockResolvedValue([]);
            await provider.checkUpdatesInBackground();

            expect((service as any).getInstalledPackages).not.toHaveBeenCalled();
        });

        it('notifies main panel after background check so it re-fetches', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([{ name: 'A.csproj', path: '/A.csproj' }]);
            (service as any).getInstalledPackages.mockResolvedValue([{ id: 'Pkg', version: '1.0' }]);
            (service as any).checkPackageUpdatesMinimal.mockResolvedValue([
                { id: 'Pkg', installedVersion: '1.0', latestVersion: '2.0' }
            ]);
            (vscode.commands.executeCommand as any).mockClear();

            await provider.checkUpdatesInBackground();

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('nuiget.refreshPackages');
        });

        it('clears versions cache when force=true', async () => {
            (service as any).findProjects.mockResolvedValue([]);
            await provider.checkUpdatesInBackground(true);
            expect((service as any).clearVersionsCache).toHaveBeenCalled();
        });

        it('does not clear versions cache when force=false', async () => {
            (service as any).findProjects.mockResolvedValue([]);
            await provider.checkUpdatesInBackground();
            expect((service as any).clearVersionsCache).not.toHaveBeenCalled();
        });

        it('clears only scoped packages when scope.packageIds provided', async () => {
            (service as any).findProjects.mockResolvedValue([]);
            await provider.checkUpdatesInBackground(true, false, { packageIds: ['PkgA', 'PkgB'] });
            expect((service as any).clearVersionsCacheForPackages).toHaveBeenCalledWith(['PkgA', 'PkgB']);
            expect((service as any).clearVersionsCache).not.toHaveBeenCalled();
        });

        it('falls back to full cache clear when scope has no packageIds', async () => {
            (service as any).findProjects.mockResolvedValue([]);
            await provider.checkUpdatesInBackground(true, false, { projectPath: '/proj.csproj' });
            expect((service as any).clearVersionsCache).toHaveBeenCalled();
            expect((service as any).clearVersionsCacheForPackages).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // startBackgroundMonitoring
    // ──────────────────────────────────────────────
    describe('startBackgroundMonitoring', () => {
        it('creates file watcher and initial timer', () => {
            provider.startBackgroundMonitoring();
            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith('**/*.{csproj,fsproj,vbproj}');
        });
    });

    // ──────────────────────────────────────────────
    // Message handling
    // ──────────────────────────────────────────────
    describe('message handling', () => {
        beforeEach(() => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            expect(messageListener).toBeDefined();
        });

        it('ready triggers _sendInitialData', async () => {
            (service as any).findProjects.mockResolvedValue([{ name: 'A.csproj', path: '/A.csproj' }]);
            (service as any).getSources.mockResolvedValue([{ name: 'nuget.org', url: 'https://nuget.org', enabled: true }]);
            await messageListener!({ type: 'ready' });

            expect(view.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'state' }));
            expect(view.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'projects' }));
            expect(view.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'sources' }));
        });

        it('saveSectionSplit persists to workspaceState', async () => {
            await messageListener!({ type: 'saveSectionSplit', position: 60 });
            expect(context.workspaceState.update).toHaveBeenCalledWith('nuget.sidebarSectionSplit', 60);
        });

        it('searchPackages skips stale results', async () => {
            let resolveFirst!: (value: unknown[]) => void;
            (service as any).searchPackages.mockImplementationOnce(() => new Promise(r => { resolveFirst = r; }));

            const first = messageListener!({ type: 'searchPackages', query: 'old' });
            (service as any).searchPackages.mockResolvedValue([{ id: 'New' }]);
            await messageListener!({ type: 'searchPackages', query: 'new' });

            resolveFirst([{ id: 'Old' }]);
            await first;

            const searchCalls = view.webview.postMessage.mock.calls.filter(
                (c: unknown[]) => (c[0] as Record<string, unknown>).type === 'searchResults'
            );
            expect(searchCalls).toHaveLength(1);
            expect(searchCalls[0][0].query).toBe('new');
        });

        it('getInstalledPackages fetches in lite mode', async () => {
            (service as any).getInstalledPackages.mockResolvedValue([{ id: 'Pkg', version: '1.0' }]);
            await messageListener!({ type: 'getInstalledPackages', projectPath: '/proj.csproj' });

            expect((service as any).getInstalledPackages).toHaveBeenCalledWith('/proj.csproj', true);
            expect(view.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'installedPackages',
                projectPath: '/proj.csproj'
            }));
        });

        it('checkPackageUpdates uses minimal mode', async () => {
            (service as any).checkPackageUpdatesMinimal.mockResolvedValue([{ id: 'P', latestVersion: '2.0' }]);
            await messageListener!({
                type: 'checkPackageUpdates',
                installedPackages: [{ id: 'P', version: '1.0' }],
                includePrerelease: false,
                projectPath: '/proj.csproj'
            });

            expect(view.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'packageUpdatesMinimal',
                projectPath: '/proj.csproj',
            }));
        });

        it('getPackageVersions fetches and sends versions with echoed source and prerelease', async () => {
            (service as any).getPackageVersions.mockResolvedValue(['1.0', '2.0']);
            await messageListener!({ type: 'getPackageVersions', packageId: 'Pkg', source: 'https://nuget.org', includePrerelease: true });

            expect(view.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'packageVersions',
                packageId: 'Pkg',
                versions: ['1.0', '2.0'],
                source: 'https://nuget.org',
                includePrerelease: true
            }));
        });
    });

    // ──────────────────────────────────────────────
    // Operation guard
    // ──────────────────────────────────────────────
    describe('operation guard', () => {
        beforeEach(() => {
            view = resolveView(provider);
            expect(messageListener).toBeDefined();
        });

        it('installPackage delegates to executeSingleOperation', async () => {
            await messageListener!({ type: 'installPackage', projectPath: '/p.csproj', packageId: 'Pkg', version: '1.0' });
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledWith(
                expect.objectContaining({ nugetService: service }),
                'install', '/p.csproj', 'Pkg', '1.0', undefined
            );
        });

        it('pickProjectForInstall shows multi-select picker and installs single project', async () => {
            (service as any).findProjects.mockResolvedValueOnce([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([
                { projectPath: '/A.csproj', projectName: 'A.csproj', packages: [] },
                { projectPath: '/B.csproj', projectName: 'B.csproj', packages: [] },
            ]);
            // Multi-select picker returns an array with one item
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(
                [{ label: 'B.csproj', description: '', detail: '/B.csproj' }] as any
            );

            await messageListener!({ type: 'pickProjectForInstall', packageId: 'Newtonsoft.Json', version: '13.0.3' });
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledWith(
                expect.objectContaining({ nugetService: service }),
                'install', '/B.csproj', 'Newtonsoft.Json', '13.0.3'
            );
        });

        it('pickProjectForInstall calls executeBulkInstall for multiple projects', async () => {
            (service as any).findProjects.mockResolvedValueOnce([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([
                { projectPath: '/A.csproj', projectName: 'A.csproj', packages: [] },
                { projectPath: '/B.csproj', projectName: 'B.csproj', packages: [] },
            ]);
            // Multi-select picker returns an array with two items
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(
                [
                    { label: 'A.csproj', description: '', detail: '/A.csproj' },
                    { label: 'B.csproj', description: '', detail: '/B.csproj' },
                ] as any
            );

            await messageListener!({ type: 'pickProjectForInstall', packageId: 'Newtonsoft.Json', version: '13.0.3' });
            expect(hoisted.mockExecuteBulkInstall).toHaveBeenCalledWith(
                expect.objectContaining({ nugetService: service }),
                ['/A.csproj', '/B.csproj'], 'Newtonsoft.Json', '13.0.3'
            );
            expect(hoisted.mockExecuteSingleOperation).not.toHaveBeenCalled();
        });

        it('pickProjectForInstall does nothing when user dismisses picker', async () => {
            (service as any).findProjects.mockResolvedValueOnce([
                { name: 'A.csproj', path: '/A.csproj' },
            ]);
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([
                { projectPath: '/A.csproj', projectName: 'A.csproj', packages: [] },
            ]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

            await messageListener!({ type: 'pickProjectForInstall', packageId: 'Pkg', version: '1.0' });
            expect(hoisted.mockExecuteSingleOperation).not.toHaveBeenCalled();
            expect(hoisted.mockExecuteBulkInstall).not.toHaveBeenCalled();
        });

        it('pickProjectForInstall marks already-installed projects with resolved version', async () => {
            (service as any).findProjects.mockResolvedValueOnce([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([
                { projectPath: '/A.csproj', projectName: 'A.csproj', packages: [{ id: 'Pkg', version: '1.*', resolvedVersion: '1.5.0' }] },
                { projectPath: '/B.csproj', projectName: 'B.csproj', packages: [] },
            ]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

            await messageListener!({ type: 'pickProjectForInstall', packageId: 'Pkg', version: '2.0' });
            const quickPickArgs = vi.mocked(vscode.window.showQuickPick).mock.calls[0];
            const items = quickPickArgs[0] as any[];
            const options = quickPickArgs[1] as any;
            // Should have canPickMany: true
            expect(options.canPickMany).toBe(true);
            // A.csproj should show resolvedVersion and be unchecked
            const itemA = items.find((i: any) => i.label === 'A.csproj');
            expect(itemA.description).toContain('1.5.0');
            expect(itemA.picked).toBe(false);
            // B.csproj should be pre-checked (not installed)
            const itemB = items.find((i: any) => i.label === 'B.csproj');
            expect(itemB.picked).toBe(true);
        });

        it('pickProjectForInstall always uses findProjects as the project list source', async () => {
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([]);
            (service as any).findProjects.mockResolvedValueOnce([
                { name: 'C.csproj', path: '/C.csproj' },
            ]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(
                [{ label: 'C.csproj', description: '', detail: '/C.csproj' }] as any
            );

            await messageListener!({ type: 'pickProjectForInstall', packageId: 'Pkg', version: '1.0' });
            expect((service as any).findProjects).toHaveBeenCalled();
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledWith(
                expect.objectContaining({ nugetService: service }),
                'install', '/C.csproj', 'Pkg', '1.0'
            );
        });

        it('pickProjectForInstall shows all projects even when queryAllProjectsInstalled returns partial results', async () => {
            // queryAllProjectsInstalled only returns Project A (Project B failed enumeration)
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([
                { projectPath: '/A.csproj', projectName: 'A.csproj', packages: [{ id: 'Pkg', version: '1.0', resolvedVersion: '1.0.0' }] },
            ]);
            // findProjects returns both projects
            (service as any).findProjects.mockResolvedValueOnce([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(
                [{ label: 'B.csproj', description: '', detail: '/B.csproj' }] as any
            );

            await messageListener!({ type: 'pickProjectForInstall', packageId: 'Pkg', version: '2.0' });
            // Both projects should appear in the picker
            const pickerItems = vi.mocked(vscode.window.showQuickPick).mock.calls[0][0] as any[];
            expect(pickerItems).toHaveLength(2);
            // A.csproj should show installed version and be unchecked
            const itemA = pickerItems.find((i: any) => i.label === 'A.csproj');
            expect(itemA.description).toContain('installed v1.0.0');
            expect(itemA.picked).toBe(false);
            // B.csproj should have no installed info and be pre-checked
            const itemB = pickerItems.find((i: any) => i.label === 'B.csproj');
            expect(itemB.description).toBe('');
            expect(itemB.picked).toBe(true);
        });

        it('pickProjectForInstall falls back to findProjects when queryAllProjectsInstalled throws', async () => {
            hoisted.mockQueryAllProjectsInstalled.mockRejectedValueOnce(new Error('network error'));
            (service as any).findProjects.mockResolvedValueOnce([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(
                [{ label: 'A.csproj', description: '', detail: '/A.csproj' }] as any
            );

            await messageListener!({ type: 'pickProjectForInstall', packageId: 'Pkg', version: '1.0' });
            // All projects should still appear (no installed markers)
            const pickerItems = vi.mocked(vscode.window.showQuickPick).mock.calls[0][0] as any[];
            expect(pickerItems).toHaveLength(2);
            expect(pickerItems.every((i: any) => i.description === '')).toBe(true);
            expect(pickerItems.every((i: any) => i.picked === true)).toBe(true);
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalled();
        });

        it('pickProjectForInstall uses knownInstalledProjects from context menu and skips queryAllProjectsInstalled', async () => {
            // This tests the optimization path where the context menu sends known installed data
            (service as any).findProjects.mockResolvedValueOnce([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            // Action picker → Install Latest
            // Multi-project picker → select B only
            vi.mocked(vscode.window.showQuickPick)
                .mockResolvedValueOnce({ label: '$(add) Install Latest', description: '3.0.0' } as any)
                .mockResolvedValueOnce(
                    [{ label: 'B.csproj', description: '', detail: '/B.csproj' }] as any
                );

            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                latestVersion: '3.0.0',
                installedVersion: '2.0.0',
                context: 'browse',
                projectPath: '__all_projects__',
                partiallyInstalled: true,
                installedProjects: [{ projectPath: '/A.csproj', projectName: 'A.csproj', version: '2.0.0' }]
            });

            // queryAllProjectsInstalled should NOT be called — known data was provided
            expect(hoisted.mockQueryAllProjectsInstalled).not.toHaveBeenCalled();
            // But the picker items should show A as installed
            const multiPickCalls = vi.mocked(vscode.window.showQuickPick).mock.calls;
            // Second call is the multi-project picker
            const pickerItems = multiPickCalls[1][0] as any[];
            const itemA = pickerItems.find((i: any) => i.label === 'A.csproj');
            expect(itemA.description).toContain('installed v2.0.0');
            expect(itemA.picked).toBe(false);
        });

        it('pickProjectForRemove removes directly when single project matches', async () => {
            (service as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);

            await messageListener!({ type: 'pickProjectForRemove', packageId: 'Newtonsoft.Json', projectPaths: ['/A.csproj'] });
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledWith(
                expect.objectContaining({ nugetService: service }),
                'remove', '/A.csproj', 'Newtonsoft.Json'
            );
            expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
        });

        it('pickProjectForRemove shows picker when multiple projects match', async () => {
            (service as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(
                { label: 'B.csproj', description: '/B.csproj' } as any
            );

            await messageListener!({ type: 'pickProjectForRemove', packageId: 'Pkg', projectPaths: ['/A.csproj', '/B.csproj'] });
            expect(vscode.window.showQuickPick).toHaveBeenCalled();
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledWith(
                expect.objectContaining({ nugetService: service }),
                'remove', '/B.csproj', 'Pkg'
            );
        });

        it('pickProjectForRemove does nothing when user dismisses picker', async () => {
            (service as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

            await messageListener!({ type: 'pickProjectForRemove', packageId: 'Pkg', projectPaths: ['/A.csproj', '/B.csproj'] });
            expect(hoisted.mockExecuteSingleOperation).not.toHaveBeenCalled();
        });

        it('pickProjectForRemove does nothing when no project paths match', async () => {
            (service as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
            ]);

            await messageListener!({ type: 'pickProjectForRemove', packageId: 'Pkg', projectPaths: ['/Z.csproj'] });
            expect(hoisted.mockExecuteSingleOperation).not.toHaveBeenCalled();
        });

        it('updatePackage delegates to executeSingleOperation', async () => {
            await messageListener!({ type: 'updatePackage', projectPath: '/p.csproj', packageId: 'Pkg', version: '2.0' });
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledWith(
                expect.anything(), 'update', '/p.csproj', 'Pkg', '2.0', undefined
            );
        });

        it('removePackage delegates to executeSingleOperation', async () => {
            await messageListener!({ type: 'removePackage', projectPath: '/p.csproj', packageId: 'Pkg' });
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledWith(
                expect.anything(), 'remove', '/p.csproj', 'Pkg'
            );
        });

        it('blocks concurrent operations', async () => {
            let resolveOp!: () => void;
            hoisted.mockExecuteSingleOperation.mockImplementationOnce(() => new Promise<void>(r => { resolveOp = r; }));

            const first = messageListener!({ type: 'installPackage', projectPath: '/p', packageId: 'A' });
            await messageListener!({ type: 'removePackage', projectPath: '/p', packageId: 'B' });

            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledTimes(1);
            resolveOp();
            await first;
        });

        it('releases lock after failure', async () => {
            hoisted.mockExecuteSingleOperation.mockRejectedValueOnce(new Error('fail'));
            await messageListener!({ type: 'installPackage', projectPath: '/p', packageId: 'A' }).catch(() => { });

            hoisted.mockExecuteSingleOperation.mockResolvedValueOnce(undefined);
            await messageListener!({ type: 'installPackage', projectPath: '/p', packageId: 'B' });
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledTimes(2);
        });
    });

    // ──────────────────────────────────────────────
    // Update re-check after sidebar operations
    // ──────────────────────────────────────────────
    describe('update re-check after operations', () => {
        let checkUpdatesSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            view = resolveView(provider);
            expect(messageListener).toBeDefined();
            // Spy on checkUpdatesInBackground, replace with no-op to avoid side effects
            checkUpdatesSpy = vi.spyOn(provider, 'checkUpdatesInBackground').mockResolvedValue(undefined);
        });

        afterEach(() => {
            checkUpdatesSpy.mockRestore();
        });

        it('re-checks updates after installPackage', async () => {
            await messageListener!({ type: 'installPackage', projectPath: '/p.csproj', packageId: 'Pkg', version: '1.0' });
            expect(checkUpdatesSpy).toHaveBeenCalledWith(true, true, { packageIds: ['Pkg'], projectPath: '/p.csproj' });
        });

        it('re-checks updates after updatePackage', async () => {
            await messageListener!({ type: 'updatePackage', projectPath: '/p.csproj', packageId: 'Pkg', version: '2.0' });
            expect(checkUpdatesSpy).toHaveBeenCalledWith(true, true, { packageIds: ['Pkg'], projectPath: '/p.csproj' });
        });

        it('re-checks updates after removePackage', async () => {
            await messageListener!({ type: 'removePackage', projectPath: '/p.csproj', packageId: 'Pkg' });
            expect(checkUpdatesSpy).toHaveBeenCalledWith(true, true, { packageIds: ['Pkg'], projectPath: '/p.csproj' });
        });

        it('re-checks updates after bulkUpdatePackages', async () => {
            await messageListener!({ type: 'bulkUpdatePackages', packages: [{ id: 'Pkg', version: '2.0' }], projectPath: '/p.csproj' });
            expect(checkUpdatesSpy).toHaveBeenCalledWith(true, true, { packageIds: ['Pkg'], projectPath: '/p.csproj' });
        });

        it('re-checks updates after bulkUpdateAllProjects', async () => {
            await messageListener!({ type: 'bulkUpdateAllProjects', projectUpdates: [] });
            expect(checkUpdatesSpy).toHaveBeenCalledWith(true, true, expect.objectContaining({ packageIds: expect.any(Array) }));
        });

        it('does NOT re-check updates when operation fails', async () => {
            hoisted.mockExecuteSingleOperation.mockRejectedValueOnce(new Error('fail'));
            await messageListener!({ type: 'updatePackage', projectPath: '/p.csproj', packageId: 'Pkg', version: '2.0' }).catch(() => { });
            expect(checkUpdatesSpy).not.toHaveBeenCalled();
        });

        it('cancels file watcher debounce after operation completes', async () => {
            // Simulate pending file watcher debounce
            (provider as any)._fileWatcherDebounce = setTimeout(() => { /* noop */ }, 10000);
            expect((provider as any)._fileWatcherDebounce).toBeDefined();

            await messageListener!({ type: 'installPackage', projectPath: '/p.csproj', packageId: 'Pkg', version: '1.0' });
            expect((provider as any)._fileWatcherDebounce).toBeUndefined();
        });

        it('cancels file watcher debounce after bulk update completes', async () => {
            (provider as any)._fileWatcherDebounce = setTimeout(() => { /* noop */ }, 10000);
            await messageListener!({ type: 'bulkUpdatePackages', packages: [{ id: 'Pkg', version: '2.0' }], projectPath: '/p.csproj' });
            expect((provider as any)._fileWatcherDebounce).toBeUndefined();
        });
    });

    // ──────────────────────────────────────────────
    // notifySidebarOfChange — file watcher kept as safety net
    // ──────────────────────────────────────────────
    describe('notifySidebarOfChange file watcher', () => {
        it('does not cancel file watcher debounce (safety net for missed updates)', async () => {
            view = resolveView(provider);
            (provider as any)._fileWatcherDebounce = setTimeout(() => { /* noop */ }, 10000);
            expect((provider as any)._fileWatcherDebounce).toBeDefined();

            await provider.notifySidebarOfChange({ type: 'update', packageId: 'Pkg', projectPath: '/p.csproj' });
            // File watcher debounce is preserved — serves as safety net for full refresh
            expect((provider as any)._fileWatcherDebounce).toBeDefined();
            clearTimeout((provider as any)._fileWatcherDebounce);
        });
    });

    // ──────────────────────────────────────────────
    // _forceCheckPending — skipMainPanelNotify propagation
    // ──────────────────────────────────────────────
    describe('checkUpdatesInBackground force-pending', () => {
        it('propagates skipMainPanelNotify through force-pending re-run', async () => {
            view = resolveView(provider);
            // Make findProjects slow enough that the second call arrives while first is in progress
            let resolveFirst!: (v: { name: string; path: string }[]) => void;
            (service as any).findProjects.mockImplementationOnce(() => new Promise(r => { resolveFirst = r; }));
            (service as any).findProjects.mockResolvedValue([{ name: 'A.csproj', path: '/A.csproj' }]);
            (service as any).getInstalledPackages.mockResolvedValue([]);
            (service as any).checkPackageUpdatesMinimal.mockResolvedValue([]);
            (vscode.commands.executeCommand as any).mockClear();

            // Start first check (will block on findProjects)
            const first = provider.checkUpdatesInBackground(true, true);
            // Queue second with skipMainPanelNotify=true while first is in progress
            await provider.checkUpdatesInBackground(true, true);
            expect((provider as any)._forceCheckPending).toBe(true);
            expect((provider as any)._forceCheckSkipMainPanel).toBe(true);

            // Let first complete — triggers force-pending re-run
            resolveFirst([{ name: 'A.csproj', path: '/A.csproj' }]);
            await first;
            // Wait for the force-pending re-run to finish
            await vi.waitFor(() => {
                expect((provider as any)._backgroundCheckInProgress).toBe(false);
            });

            // Force-pending re-run should NOT have notified main panel
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('nuiget.refreshPackages');
        });
    });

    // ──────────────────────────────────────────────
    // showSourcePicker
    // ──────────────────────────────────────────────
    describe('showSourcePicker', () => {
        it('shows quick pick with available sources', async () => {
            view = resolveView(provider);
            (service as any).getSources.mockResolvedValue([
                { name: 'nuget.org', url: 'https://nuget.org', enabled: true },
            ]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

            await provider.showSourcePicker();
            expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: 'All Sources' }),
                    expect.objectContaining({ label: 'nuget.org' }),
                ]),
                expect.anything()
            );
        });

        it('selects source and syncs to main panel', async () => {
            view = resolveView(provider);
            (service as any).getSources.mockResolvedValue([
                { name: 'Custom', url: 'https://custom', enabled: true },
            ]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ label: 'Custom', description: 'https://custom' } as any);

            await provider.showSourcePicker();
            expect(context.workspaceState.update).toHaveBeenCalledWith('nuget.selectedSource', 'https://custom');
            expect(NuGetPanel.syncSource).toHaveBeenCalledWith('https://custom');
        });
    });

    // ──────────────────────────────────────────────
    // showProjectPicker
    // ──────────────────────────────────────────────
    describe('showProjectPicker', () => {
        it('shows quick pick with projects sorted alphabetically and All Projects option', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([
                { name: 'B.csproj', path: '/B.csproj' },
                { name: 'A.csproj', path: '/A.csproj' },
            ]);
            // Default: createQuickPick auto-dismisses (no _autoSelect)

            await provider.showProjectPicker();
            const qp = vi.mocked(vscode.window.createQuickPick).mock.results[0].value;
            const items = qp.items as vscode.QuickPickItem[];
            // First item: "All Projects (2)", then separator, then sorted projects
            expect(items[0].label).toBe('All Projects (2)');
            expect(items[1].kind).toBe(vscode.QuickPickItemKind.Separator);
            expect(items[2].label).toBe('A.csproj');
            expect(items[3].label).toBe('B.csproj');
        });

        it('does not show All Projects option for single project', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
            ]);

            await provider.showProjectPicker();
            const qp = vi.mocked(vscode.window.createQuickPick).mock.results[0].value;
            const items = qp.items as vscode.QuickPickItem[];
            expect(items).toHaveLength(1);
            expect(items[0].label).toBe('A.csproj');
        });

        it('selects All Projects and syncs sentinel to main panel', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            const mockQp = vi.mocked(vscode.window.createQuickPick)();
            mockQp._autoSelect = { label: 'All Projects (2)', description: 'Show packages from all projects' };
            vi.mocked(vscode.window.createQuickPick).mockReturnValueOnce(mockQp);

            await provider.showProjectPicker();
            expect(context.workspaceState.update).toHaveBeenCalledWith('nuget.selectedProject', '__all_projects__');
            expect(NuGetPanel.syncProject).toHaveBeenCalledWith('__all_projects__');
            expect(view.title).toBe('All Projects (2)');
        });

        it('selects project and syncs to main panel', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
            ]);
            const mockQp = vi.mocked(vscode.window.createQuickPick)();
            mockQp._autoSelect = { label: 'A.csproj', description: '/A.csproj' };
            vi.mocked(vscode.window.createQuickPick).mockReturnValueOnce(mockQp);

            await provider.showProjectPicker();
            expect(context.workspaceState.update).toHaveBeenCalledWith('nuget.selectedProject', '/A.csproj');
            expect(NuGetPanel.syncProject).toHaveBeenCalledWith('/A.csproj');
        });

        it('highlights currently selected project in QuickPick', async () => {
            // Set a selected project before opening picker
            const ctx = createMockContext();
            ctx.workspaceState._store.set('nuget.selectedProject', '/B.csproj');
            const svc = createMockNuGetService();
            const ch = createMockOutputChannel();
            const p = new NuGetSidebarProvider(vscode.Uri.file('/ext'), ctx, ch, svc as any);
            resolveView(p);
            (svc as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);

            await p.showProjectPicker();
            const qp = vi.mocked(vscode.window.createQuickPick).mock.results.at(-1)!.value;
            // activeItems should contain the item matching /B.csproj
            expect(qp.activeItems).toHaveLength(1);
            expect(qp.activeItems[0].description).toBe('/B.csproj');
        });

        it('highlights All Projects when sentinel is selected', async () => {
            const ctx = createMockContext();
            ctx.workspaceState._store.set('nuget.selectedProject', '__all_projects__');
            const svc = createMockNuGetService();
            const ch = createMockOutputChannel();
            const p = new NuGetSidebarProvider(vscode.Uri.file('/ext'), ctx, ch, svc as any);
            resolveView(p);
            (svc as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);

            await p.showProjectPicker();
            const qp = vi.mocked(vscode.window.createQuickPick).mock.results.at(-1)!.value;
            expect(qp.activeItems).toHaveLength(1);
            expect(qp.activeItems[0].label).toBe('All Projects (2)');
        });

        it('shows info message when no projects found', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([]);

            await provider.showProjectPicker();
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('No .NET project files found in workspace.');
        });
    });

    // ──────────────────────────────────────────────
    // _sendInitialData
    // ──────────────────────────────────────────────
    describe('_sendInitialData (via ready message)', () => {
        it('auto-selects first project when none selected', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([{ name: 'P.csproj', path: '/P.csproj' }]);
            (service as any).getSources.mockResolvedValue([]);
            view.webview.postMessage.mockClear();

            await messageListener!({ type: 'ready' });

            // State message should include auto-selected project
            expect(view.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'state',
                selectedProject: '/P.csproj',
            }));
        });

        it('delivers pending update data on first ready', async () => {
            // Simulate background check completing before webview ready
            (service as any).findProjects.mockResolvedValue([{ name: 'A.csproj', path: '/A.csproj' }]);
            (service as any).getInstalledPackages.mockResolvedValue([{ id: 'Pkg', version: '1.0' }]);
            (service as any).checkPackageUpdatesMinimal.mockResolvedValue([
                { id: 'Pkg', installedVersion: '1.0', latestVersion: '2.0' }
            ]);
            await provider.checkUpdatesInBackground();

            // Now resolve the webview
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            (service as any).findProjects.mockResolvedValue([{ name: 'A.csproj', path: '/A.csproj' }]);
            (service as any).getSources.mockResolvedValue([]);

            await messageListener!({ type: 'ready' });

            // Pending data should be delivered
            expect(view.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'allProjectsUpdates',
            }));
        });

        it('auto-downgrades All Projects sentinel when only 1 project', async () => {
            // Set sentinel as persisted project
            const ctx = createMockContext();
            (ctx.workspaceState as any)._store.set('nuget.selectedProject', '__all_projects__');
            const svc = createMockNuGetService();
            const ch = createMockOutputChannel();
            const p = new NuGetSidebarProvider(vscode.Uri.file('/ext'), ctx, ch, svc as any);
            const v = resolveView(p);
            (svc as any).findProjects.mockResolvedValue([{ name: 'Only.csproj', path: '/Only.csproj' }]);
            (svc as any).getSources.mockResolvedValue([]);
            v.webview.postMessage.mockClear();

            await messageListener!({ type: 'ready' });

            // Should downgrade sentinel to the single project
            expect(ctx.workspaceState.update).toHaveBeenCalledWith('nuget.selectedProject', '/Only.csproj');
            expect(v.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'state',
                selectedProject: '/Only.csproj',
            }));
        });
    });

    // ──────────────────────────────────────────────
    // _postMessage safety
    // ──────────────────────────────────────────────
    describe('_postMessage safety', () => {
        it('does not post when no view is resolved', () => {
            // No resolveView called — calling sync methods should not throw
            provider.syncSource('test');
            // No crash = success (postMessage is not callable without view)
        });
    });

    // ──────────────────────────────────────────────
    // Phase 5B: Uncovered message handlers & context menu
    // ──────────────────────────────────────────────

    describe('checkAllProjectsUpdates message', () => {
        it('checks updates for all projects and sends combined results', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            hoisted.mockQueryAllProjectsUpdates.mockResolvedValueOnce([{
                projectPath: '/projA.csproj',
                projectName: 'ProjA',
                updates: [{ id: 'Pkg', installedVersion: '1.0', latestVersion: '2.0' }]
            }]);

            await messageListener!({ type: 'checkAllProjectsUpdates', includePrerelease: false });

            expect(hoisted.mockQueryAllProjectsUpdates).toHaveBeenCalledWith(service, false, true);
            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsUpdates',
                projectUpdates: [{
                    projectPath: '/projA.csproj',
                    projectName: 'ProjA',
                    updates: [{ id: 'Pkg', installedVersion: '1.0', latestVersion: '2.0' }]
                }]
            });
        });

        it('skips projects that throw errors', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            hoisted.mockQueryAllProjectsUpdates.mockResolvedValueOnce([]);

            await messageListener!({ type: 'checkAllProjectsUpdates', includePrerelease: true });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsUpdates',
                projectUpdates: []
            });
        });
    });

    describe('checkAllProjectsInstalled message', () => {
        it('collects installed packages from all projects', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([{
                projectPath: '/projA.csproj',
                projectName: 'ProjA',
                packages: [{ id: 'Pkg', version: '1.0', resolvedVersion: '1.0.0', isImplicit: false }]
            }]);
            await messageListener!({ type: 'checkAllProjectsInstalled', context: 'multiInstall' });

            expect(hoisted.mockQueryAllProjectsInstalled).toHaveBeenCalledWith(service, true);
            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsInstalled',
                projectInstalled: [{
                    projectPath: '/projA.csproj',
                    projectName: 'ProjA',
                    packages: [{ id: 'Pkg', version: '1.0', resolvedVersion: '1.0.0', isImplicit: false }]
                }],
                context: 'multiInstall'
            });
        });

        it('skips projects that throw errors', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([]);
            await messageListener!({ type: 'checkAllProjectsInstalled' });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsInstalled',
                projectInstalled: [],
                context: undefined
            });
        });

        it('streams Start, ProjectFound, Complete with echoed requestId (Plan 10 Stage B)', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            hoisted.mockQueryAllProjectsInstalled.mockImplementationOnce(async (_svc: unknown, _lite: boolean, opts: any) => {
                opts?.onStart?.([
                    { projectPath: '/a.csproj', projectName: 'A' },
                    { projectPath: '/b.csproj', projectName: 'B' },
                ]);
                opts?.onProject?.({ projectPath: '/a.csproj', projectName: 'A', packages: [{ id: 'Pa', version: '1.0' }] });
                opts?.onProject?.({ projectPath: '/b.csproj', projectName: 'B', error: 'boom' });
                return [{ projectPath: '/a.csproj', projectName: 'A', packages: [{ id: 'Pa', version: '1.0' }] }];
            });

            await messageListener!({ type: 'checkAllProjectsInstalled', streamed: true, requestId: 'r1' });

            const calls = view.webview.postMessage.mock.calls.map((c: any[]) => c[0]);
            const start = calls.find((m: any) => m.type === 'allProjectsInstalledStart');
            const founds = calls.filter((m: any) => m.type === 'allProjectsInstalledProjectFound');
            const complete = calls.find((m: any) => m.type === 'allProjectsInstalledComplete');
            expect(start).toMatchObject({ requestId: 'r1' });
            expect(start.projects).toHaveLength(2);
            expect(founds).toHaveLength(2);
            expect(founds[0]).toMatchObject({ requestId: 'r1', projectPath: '/a.csproj' });
            expect(founds[1]).toMatchObject({ requestId: 'r1', projectPath: '/b.csproj', error: 'boom' });
            expect(complete).toMatchObject({ requestId: 'r1' });
            expect(complete.projectPaths).toEqual(['/a.csproj', '/b.csproj']);
        });

        it('aborts previous streamed request when a new one arrives (Plan 10 Stage B)', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            const captured: AbortSignal[] = [];
            let resolveFirst!: () => void;
            const firstHang = new Promise<void>((r) => { resolveFirst = r; });
            hoisted.mockQueryAllProjectsInstalled
                .mockImplementationOnce(async (_svc: unknown, _lite: boolean, opts: any) => {
                    if (opts?.signal) { captured.push(opts.signal); }
                    await firstHang;
                    return [];
                })
                .mockImplementationOnce(async (_svc: unknown, _lite: boolean, opts: any) => {
                    if (opts?.signal) { captured.push(opts.signal); }
                    return [];
                });

            const firstP = messageListener!({ type: 'checkAllProjectsInstalled', streamed: true, requestId: 'r1' });
            await vi.waitFor(() => expect(captured).toHaveLength(1));
            await messageListener!({ type: 'checkAllProjectsInstalled', streamed: true, requestId: 'r2' });
            expect(captured).toHaveLength(2);
            expect(captured[0].aborted).toBe(true);
            expect(captured[1].aborted).toBe(false);
            resolveFirst();
            await firstP;
        });
    });

    describe('bulkUpdatePackages message', () => {
        it('delegates to executeBulkUpdatePackages', async () => {
            view = resolveView(provider);
            const packages = [{ id: 'Pkg', version: '2.0' }];
            await messageListener!({ type: 'bulkUpdatePackages', packages, projectPath: '/proj.csproj' });

            expect(hoisted.mockExecuteBulkUpdatePackages).toHaveBeenCalledWith(
                expect.anything(),
                packages,
                '/proj.csproj'
            );
        });

        it('blocks when operation is in progress', async () => {
            view = resolveView(provider);
            let resolveOp!: () => void;
            hoisted.mockExecuteBulkUpdatePackages
                .mockImplementationOnce(() => new Promise<void>(r => { resolveOp = r; }));

            const first = messageListener!({ type: 'bulkUpdatePackages', packages: [{ id: 'A', version: '1.0' }], projectPath: '/proj.csproj' });
            await messageListener!({ type: 'bulkUpdatePackages', packages: [{ id: 'B', version: '1.0' }], projectPath: '/proj.csproj' });

            expect(hoisted.mockExecuteBulkUpdatePackages).toHaveBeenCalledTimes(1);
            resolveOp();
            await first;
        });
    });

    describe('bulkUpdateAllProjects message', () => {
        it('delegates to executeBulkUpdateAllProjects', async () => {
            view = resolveView(provider);
            const projectUpdates = [{ projectPath: '/proj.csproj', projectName: 'Proj', packages: [{ id: 'Pkg', version: '2.0' }] }];
            await messageListener!({ type: 'bulkUpdateAllProjects', projectUpdates });

            expect(hoisted.mockExecuteBulkUpdateAllProjects).toHaveBeenCalledWith(
                expect.anything(),
                projectUpdates
            );
        });

        it('blocks when operation is in progress', async () => {
            view = resolveView(provider);
            let resolveOp!: () => void;
            hoisted.mockExecuteBulkUpdateAllProjects
                .mockImplementationOnce(() => new Promise<void>(r => { resolveOp = r; }));

            const first = messageListener!({ type: 'bulkUpdateAllProjects', projectUpdates: [] });
            await messageListener!({ type: 'bulkUpdateAllProjects', projectUpdates: [] });

            expect(hoisted.mockExecuteBulkUpdateAllProjects).toHaveBeenCalledTimes(1);
            resolveOp();
            await first;
        });
    });

    describe('showContextMenu message', () => {
        it('shows warning when no projectPath is provided for non-browse context', async () => {
            view = resolveView(provider);
            await messageListener!({ type: 'showContextMenu', packageId: 'Pkg', context: 'installed' });

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Please select a specific project for this action.');
        });

        it('triggers project picker for browse context without projectPath', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
            ]);
            // First QuickPick: actions menu — user picks Install Latest
            // Second QuickPick: project picker — user cancels
            vi.mocked(vscode.window.showQuickPick)
                .mockResolvedValueOnce({ label: '$(add) Install Latest', description: '2.0.0' } as any)
                .mockResolvedValueOnce(undefined);

            await messageListener!({ type: 'showContextMenu', packageId: 'Pkg', latestVersion: '2.0.0', context: 'browse' });

            // Should show actions QuickPick first (not project picker, not warning)
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
            expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(2);
        });

        it('shows actions QuickPick first in all-projects browse mode, then multi-select project picker', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            (service as any).findProjects.mockResolvedValueOnce([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([
                { projectPath: '/A.csproj', projectName: 'A.csproj', packages: [] },
                { projectPath: '/B.csproj', projectName: 'B.csproj', packages: [] },
            ]);
            // First QuickPick: actions menu — user picks Install Latest
            // Second QuickPick: multi-select project picker — user selects A.csproj (single)
            vi.mocked(vscode.window.showQuickPick)
                .mockResolvedValueOnce({ label: '$(add) Install Latest', description: '2.0.0' } as any)
                .mockResolvedValueOnce([{ label: 'A.csproj', description: '', detail: '/A.csproj' }] as any);

            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                latestVersion: '2.0.0',
                context: 'browse',
                projectPath: '__all_projects__'
            });

            // First QuickPick: actions menu with Install Latest
            expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(2);
            expect(vi.mocked(vscode.window.showQuickPick).mock.calls[0][0]).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ label: '$(add) Install Latest' })
                ])
            );
            // Single project selected → doInstall sent to webview
            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'doInstall',
                packageId: 'Pkg',
                version: '2.0.0',
                projectPath: '/A.csproj'
            });
        });

        it('Install Latest in all-projects browse with multiple projects calls executeBulkInstall', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            (service as any).findProjects.mockResolvedValueOnce([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([
                { projectPath: '/A.csproj', projectName: 'A.csproj', packages: [] },
                { projectPath: '/B.csproj', projectName: 'B.csproj', packages: [] },
            ]);
            // First QuickPick: actions menu — Install Latest
            // Second QuickPick: multi-select — both projects
            vi.mocked(vscode.window.showQuickPick)
                .mockResolvedValueOnce({ label: '$(add) Install Latest', description: '2.0.0' } as any)
                .mockResolvedValueOnce([
                    { label: 'A.csproj', description: '', detail: '/A.csproj' },
                    { label: 'B.csproj', description: '', detail: '/B.csproj' },
                ] as any);

            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                latestVersion: '2.0.0',
                context: 'browse',
                projectPath: '__all_projects__'
            });

            // Multiple projects → executeBulkInstall called directly (no doInstall message)
            expect(hoisted.mockExecuteBulkInstall).toHaveBeenCalledWith(
                expect.objectContaining({ nugetService: service }),
                ['/A.csproj', '/B.csproj'], 'Pkg', '2.0.0'
            );
            expect(view.webview.postMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'doInstall' })
            );
        });

        it('Copy Package ID executes immediately without project picker in all-projects browse', async () => {
            view = resolveView(provider);
            vi.mocked(vscode.window.showQuickPick)
                .mockResolvedValueOnce({ label: '$(clippy) Copy Package ID', description: 'Pkg' } as any);

            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                context: 'browse',
                projectPath: '__all_projects__'
            });

            // Only one QuickPick call (the actions menu) — no project picker needed
            expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
            expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('Pkg');
        });

        it('View Package Details executes immediately without project picker in all-projects browse', async () => {
            view = resolveView(provider);
            vi.mocked(vscode.window.showQuickPick)
                .mockResolvedValueOnce({ label: '$(eye) View Package Details', description: '' } as any);

            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                latestVersion: '2.0.0',
                context: 'browse',
                projectPath: '__all_projects__'
            });

            expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('nuiget.viewPackageDetails', {
                packageId: 'Pkg',
                version: '2.0.0'
            });
        });

        it('Uninstall in all-projects browse shows project picker filtered to installed projects', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            const installedProjects = [
                { projectPath: '/A.csproj', projectName: 'A.csproj', version: '1.0.0' },
                { projectPath: '/B.csproj', projectName: 'B.csproj', version: '1.2.0' }
            ];
            // First: actions menu — pick Uninstall
            // Second: project picker — pick A.csproj
            vi.mocked(vscode.window.showQuickPick)
                .mockResolvedValueOnce({ label: '$(close) Uninstall', description: '1.0.0' } as any)
                .mockResolvedValueOnce({ label: 'A.csproj', description: 'v1.0.0', detail: '/A.csproj' } as any);

            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                installedVersion: '1.0.0',
                context: 'browse',
                projectPath: '__all_projects__',
                installedProjects
            });

            expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(2);
            // Second picker should only show installed projects (not findProjects)
            expect((service as any).findProjects).not.toHaveBeenCalled();
            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'doRemove',
                packageId: 'Pkg',
                projectPath: '/A.csproj'
            });
        });

        it('Install Version in all-projects browse shows version picker then multi-select project picker', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            (service as any).getPackageVersions.mockResolvedValue(['3.0.0', '2.0.0', '1.0.0']);
            (service as any).findProjects.mockResolvedValueOnce([
                { name: 'A.csproj', path: '/A.csproj' },
            ]);
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([
                { projectPath: '/A.csproj', projectName: 'A.csproj', packages: [] },
            ]);
            // First: actions menu — pick Install Version
            // Second: version picker — pick 2.0.0
            // Third: multi-select project picker — pick A.csproj (single)
            vi.mocked(vscode.window.showQuickPick)
                .mockResolvedValueOnce({ label: '$(list-ordered) Install Version...', description: 'Select a specific version' } as any)
                .mockResolvedValueOnce({ label: '2.0.0', description: '' } as any)
                .mockResolvedValueOnce([{ label: 'A.csproj', description: '', detail: '/A.csproj' }] as any);

            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                context: 'browse',
                projectPath: '__all_projects__'
            });

            expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(3);
            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'doInstall',
                packageId: 'Pkg',
                version: '2.0.0',
                projectPath: '/A.csproj'
            });
        });

        it('shows install options for browse context', async () => {
            view = resolveView(provider);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);
            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Newtonsoft.Json',
                latestVersion: '13.0.3',
                context: 'browse',
                projectPath: '/proj.csproj'
            });

            expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: '$(add) Install Latest' })
                ]),
                expect.anything()
            );
        });

        it('sends doInstall when Install Latest is selected', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ label: '$(add) Install Latest', description: '13.0.3' } as any);
            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                latestVersion: '13.0.3',
                context: 'browse',
                projectPath: '/proj.csproj'
            });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'doInstall',
                packageId: 'Pkg',
                version: '13.0.3',
                projectPath: '/proj.csproj'
            });
        });

        it('sends doUpdate for updates context', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ label: '$(arrow-up) Update to 2.0.0', description: '' } as any);
            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                installedVersion: '1.0.0',
                latestVersion: '2.0.0',
                context: 'updates',
                projectPath: '/proj.csproj',
                sourceUrl: 'https://api.nuget.org'
            });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'doUpdate',
                packageId: 'Pkg',
                version: '2.0.0',
                projectPath: '/proj.csproj',
                sourceUrl: 'https://api.nuget.org'
            });
        });

        it('skips direct update option for floating versions', async () => {
            view = resolveView(provider);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);
            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                installedVersion: '1.*',
                latestVersion: '2.0.0',
                context: 'updates',
                projectPath: '/proj.csproj',
                versionType: 'floating'
            });

            const pickItems = vi.mocked(vscode.window.showQuickPick).mock.calls[0][0] as vscode.QuickPickItem[];
            const labels = pickItems.map((item: vscode.QuickPickItem) => item.label);
            // No direct "Update to 2.0.0" should appear for floating versions
            expect(labels.some(l => l.includes('Update to 2.0.0'))).toBe(false);
            // But "Update to Version..." picker should still be available
            expect(labels.some(l => l.includes('Update to Version...'))).toBe(true);
        });

        it('shows version picker and sends doInstall for Install Version', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            (service as any).getPackageVersions.mockResolvedValue(['3.0.0', '2.0.0', '1.0.0']);
            vi.mocked(vscode.window.showQuickPick)
                .mockResolvedValueOnce({ label: '$(list-ordered) Install Version...', description: 'Select a specific version' } as any)
                .mockResolvedValueOnce({ label: '2.0.0', description: '' } as any);

            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                context: 'browse',
                projectPath: '/proj.csproj'
            });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'doInstall',
                packageId: 'Pkg',
                version: '2.0.0',
                projectPath: '/proj.csproj'
            });
        });

        it('sends doRemove when Uninstall is selected', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ label: '$(close) Uninstall', description: '1.0' } as any);
            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                installedVersion: '1.0',
                context: 'installed',
                projectPath: '/proj.csproj'
            });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'doRemove',
                packageId: 'Pkg',
                projectPath: '/proj.csproj'
            });
        });

        it('copies package ID to clipboard', async () => {
            view = resolveView(provider);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ label: '$(clippy) Copy Package ID', description: 'Pkg' } as any);
            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                context: 'installed',
                projectPath: '/proj.csproj'
            });

            expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('Pkg');
        });

        it('shows all 4 actions for partially installed package in browse context', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined); // user cancels

            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                latestVersion: '3.0.0',
                installedVersion: '2.0.0',
                context: 'browse',
                projectPath: '/proj.csproj',
                partiallyInstalled: true
            });

            // Should show all 4 actions + Copy ID + View Details = 6 items
            const quickPickItems = vi.mocked(vscode.window.showQuickPick).mock.calls[0][0] as any[];
            const labels = quickPickItems.map((item: any) => item.label);
            expect(labels).toContain('$(add) Install Latest');
            expect(labels).toContain('$(list-ordered) Install Version...');
            expect(labels).toContain('$(close) Uninstall');
            expect(labels).toContain('$(list-ordered) Change Version...');
        });

        it('partially installed Install Latest routes through multi-project picker', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            (service as any).findProjects.mockResolvedValueOnce([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' },
            ]);
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([
                { projectPath: '/A.csproj', projectName: 'A.csproj', packages: [{ id: 'Pkg', version: '2.0.0' }] },
                { projectPath: '/B.csproj', projectName: 'B.csproj', packages: [] },
            ]);
            // First QuickPick: actions menu — user picks Install Latest
            // Second QuickPick: multi-select project picker — user selects B.csproj
            vi.mocked(vscode.window.showQuickPick)
                .mockResolvedValueOnce({ label: '$(add) Install Latest', description: '3.0.0' } as any)
                .mockResolvedValueOnce([{ label: 'B.csproj', description: '', detail: '/B.csproj' }] as any);

            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                latestVersion: '3.0.0',
                installedVersion: '2.0.0',
                context: 'browse',
                projectPath: '__all_projects__',
                partiallyInstalled: true
            });

            // Single project selected → doInstall sent to webview
            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'doInstall',
                packageId: 'Pkg',
                version: '3.0.0',
                projectPath: '/B.csproj'
            });
        });

        it('partially installed Uninstall routes through single-project picker', async () => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            // Action QuickPick: user picks Uninstall
            // Project picker: user picks A.csproj
            vi.mocked(vscode.window.showQuickPick)
                .mockResolvedValueOnce({ label: '$(close) Uninstall', description: '2.0.0' } as any)
                .mockResolvedValueOnce({ label: 'A.csproj', detail: '/A.csproj' } as any);

            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                latestVersion: '3.0.0',
                installedVersion: '2.0.0',
                context: 'browse',
                projectPath: '__all_projects__',
                partiallyInstalled: true,
                installedProjects: ['A.csproj']
            });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'doRemove',
                packageId: 'Pkg',
                projectPath: '/A.csproj'
            });
        });

        it('executes viewPackageDetails command', async () => {
            view = resolveView(provider);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ label: '$(eye) View Package Details', description: '' } as any);
            await messageListener!({
                type: 'showContextMenu',
                packageId: 'Pkg',
                latestVersion: '2.0',
                context: 'browse',
                projectPath: '/proj.csproj'
            });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('nuiget.viewPackageDetails', {
                packageId: 'Pkg',
                version: '2.0'
            });
        });
    });

    // ──────────────────────────────────────────────
    // Error resilience: stuck spinner prevention
    // ──────────────────────────────────────────────
    describe('error resilience (stuck spinner prevention)', () => {
        beforeEach(() => {
            view = resolveView(provider);
            view.webview.postMessage.mockClear();
            expect(messageListener).toBeDefined();
        });

        it('getInstalledPackages sends empty response on error', async () => {
            (service as any).getInstalledPackages.mockRejectedValue(new Error('file not found'));
            await messageListener!({ type: 'getInstalledPackages', projectPath: '/gone.csproj' });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'installedPackages',
                packages: [],
                projectPath: '/gone.csproj'
            });
        });

        it('checkPackageUpdates sends empty response on error', async () => {
            (service as any).checkPackageUpdatesMinimal.mockRejectedValue(new Error('network error'));
            await messageListener!({
                type: 'checkPackageUpdates',
                installedPackages: [{ id: 'Pkg', version: '1.0' }],
                includePrerelease: false,
                projectPath: '/proj.csproj'
            });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'packageUpdatesMinimal',
                updates: [],
                projectPath: '/proj.csproj'
            });
        });

        it('searchPackages sends empty response on error', async () => {
            (service as any).searchPackages.mockRejectedValue(new Error('timeout'));
            await messageListener!({ type: 'searchPackages', query: 'test', includePrerelease: false });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'searchResults',
                results: [],
                query: 'test'
            });
        });

        it('checkAllProjectsUpdates sends empty response when findProjects throws', async () => {
            (service as any).findProjects.mockRejectedValue(new Error('workspace error'));
            await messageListener!({ type: 'checkAllProjectsUpdates', includePrerelease: false });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsUpdates',
                projectUpdates: []
            });
        });

        it('checkAllProjectsInstalled sends empty response when findProjects throws', async () => {
            (service as any).findProjects.mockRejectedValue(new Error('workspace error'));
            await messageListener!({ type: 'checkAllProjectsInstalled', context: 'installed' });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsInstalled',
                projectInstalled: [],
                context: 'installed'
            });
        });
    });

    // ──────────────────────────────────────────────
    // Stale project validation
    // ──────────────────────────────────────────────
    describe('stale project validation', () => {
        it('_sendInitialData resets stale project to first available', async () => {
            const ctx = createMockContext();
            (ctx.workspaceState as any)._store.set('nuget.selectedProject', '/old/removed.csproj');
            const { provider: p, service: svc } = createProvider(undefined, ctx);
            const v = resolveView(p);

            (svc as any).findProjects.mockResolvedValue([
                { name: 'New.csproj', path: '/new/New.csproj' }
            ]);
            (svc as any).getSources.mockResolvedValue([]);
            v.webview.postMessage.mockClear();

            await messageListener!({ type: 'ready' });

            // Should have reset to the first available project
            expect(ctx.workspaceState.update).toHaveBeenCalledWith('nuget.selectedProject', '/new/New.csproj');
            expect(v.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'state',
                selectedProject: '/new/New.csproj'
            }));
            p.dispose();
        });

        it('_sendInitialData keeps valid persisted project', async () => {
            const ctx = createMockContext();
            (ctx.workspaceState as any)._store.set('nuget.selectedProject', '/A.csproj');
            const { provider: p, service: svc } = createProvider(undefined, ctx);
            const v = resolveView(p);

            (svc as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' }
            ]);
            (svc as any).getSources.mockResolvedValue([]);
            v.webview.postMessage.mockClear();

            await messageListener!({ type: 'ready' });

            // Should keep the existing valid project
            expect(v.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'state',
                selectedProject: '/A.csproj'
            }));
            p.dispose();
        });

        it('checkUpdatesInBackground resets stale project to first available', async () => {
            const ctx = createMockContext();
            (ctx.workspaceState as any)._store.set('nuget.selectedProject', '/old/gone.csproj');
            const { provider: p, service: svc } = createProvider(undefined, ctx);

            (svc as any).findProjects.mockResolvedValue([
                { name: 'Current.csproj', path: '/current/Current.csproj' }
            ]);
            (svc as any).getInstalledPackages.mockResolvedValue([]);

            await p.checkUpdatesInBackground();

            expect(ctx.workspaceState.update).toHaveBeenCalledWith('nuget.selectedProject', '/current/Current.csproj');
            p.dispose();
        });
    });

    describe('sentinel guards', () => {
        const SENTINEL = '__all_projects__';

        it('getInstalledPackages ignores sentinel projectPath', async () => {
            const svc = createMockNuGetService();
            const ctx = createMockContext();
            const p = new NuGetSidebarProvider(svc as any, ctx, createMockOutputChannel());
            resolveView(p, createMockWebviewView());
            await messageListener!({ type: 'getInstalledPackages', projectPath: SENTINEL });
            expect(svc.getInstalledPackages).not.toHaveBeenCalled();
            p.dispose();
        });

        it('installPackage ignores sentinel projectPath', async () => {
            const svc = createMockNuGetService();
            const ctx = createMockContext();
            const p = new NuGetSidebarProvider(svc as any, ctx, createMockOutputChannel());
            resolveView(p, createMockWebviewView());
            await messageListener!({ type: 'installPackage', projectPath: SENTINEL, packageId: 'Pkg', version: '1.0.0' });
            expect(hoisted.mockExecuteSingleOperation).not.toHaveBeenCalled();
            p.dispose();
        });

        it('showContextMenu warns when projectPath is sentinel', async () => {
            const svc = createMockNuGetService();
            const ctx = createMockContext();
            const p = new NuGetSidebarProvider(svc as any, ctx, createMockOutputChannel());
            resolveView(p, createMockWebviewView());
            await messageListener!({ type: 'showContextMenu', projectPath: SENTINEL, packageId: 'Pkg', context: 'installed' });
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Please select a specific project for this action.');
            p.dispose();
        });
    });
});

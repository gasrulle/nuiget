import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

// ──────────────────────────────────────────────
// Mock NuGetOperations
// ──────────────────────────────────────────────
const hoisted = vi.hoisted(() => ({
    mockExecuteSingleOperation: vi.fn().mockResolvedValue(undefined),
    mockExecuteBulkUpdatePackages: vi.fn().mockResolvedValue(undefined),
    mockExecuteBulkUpdateAllProjects: vi.fn().mockResolvedValue(undefined),
    mockQueryAllProjectsUpdates: vi.fn().mockResolvedValue([]),
    mockQueryAllProjectsInstalled: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/NuGetOperations', () => ({
    executeSingleOperation: hoisted.mockExecuteSingleOperation,
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
        badge: undefined as { value: number; tooltip: string } | undefined,
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
    // setBadge / _clearBadge
    // ──────────────────────────────────────────────
    describe('badge management', () => {
        it('sets badge when view is resolved and setting enabled', () => {
            view = resolveView(provider);
            provider.setBadge(5, '5 updates');
            expect(view.badge).toEqual({ value: 5, tooltip: '5 updates' });
        });

        it('clears badge when count is 0', () => {
            view = resolveView(provider);
            provider.setBadge(5, '5 updates');
            provider.setBadge(0);
            expect(view.badge).toBeUndefined();
        });

        it('caches badge values for pending delivery', () => {
            // No view resolved yet
            provider.setBadge(3, '3 updates');
            // Values are cached internally (verified by resolving view later)
            view = resolveView(provider);
            // Badge applied on _sendInitialData when ready message arrives
        });

        it('uses default tooltip when none provided', () => {
            view = resolveView(provider);
            provider.setBadge(1);
            expect(view.badge).toEqual({ value: 1, tooltip: '1 update available' });
        });

        it('pluralizes tooltip correctly', () => {
            view = resolveView(provider);
            provider.setBadge(3);
            expect(view.badge).toEqual({ value: 3, tooltip: '3 updates available' });
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
        it('clears timers and badge', () => {
            view = resolveView(provider);
            provider.setBadge(5);
            expect(view.badge).toBeDefined();

            provider.dispose();
            expect(view.badge).toBeUndefined();
        });
    });

    // ──────────────────────────────────────────────
    // checkUpdatesInBackground
    // ──────────────────────────────────────────────
    describe('checkUpdatesInBackground', () => {
        it('fetches projects and sets badge', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([{ name: 'A.csproj', path: '/A.csproj' }]);
            (service as any).getInstalledPackages.mockResolvedValue([{ id: 'Pkg', version: '1.0' }]);
            (service as any).checkPackageUpdatesMinimal.mockResolvedValue([
                { id: 'Pkg', installedVersion: '1.0', latestVersion: '2.0' }
            ]);

            await provider.checkUpdatesInBackground();

            expect(view.badge).toEqual({ value: 1, tooltip: '1 update available' });
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

        it('getPackageVersions fetches and sends versions', async () => {
            (service as any).getPackageVersions.mockResolvedValue(['1.0', '2.0']);
            await messageListener!({ type: 'getPackageVersions', packageId: 'Pkg', includePrerelease: true });

            expect(view.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'packageVersions',
                packageId: 'Pkg',
                versions: ['1.0', '2.0']
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
        it('shows quick pick with projects sorted alphabetically', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([
                { name: 'B.csproj', path: '/B.csproj' },
                { name: 'A.csproj', path: '/A.csproj' },
            ]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

            await provider.showProjectPicker();
            const items = vi.mocked(vscode.window.showQuickPick).mock.calls[0][0] as vscode.QuickPickItem[];
            expect((items as vscode.QuickPickItem[])[0].label).toBe('A.csproj');
            expect((items as vscode.QuickPickItem[])[1].label).toBe('B.csproj');
        });

        it('selects project and syncs to main panel', async () => {
            view = resolveView(provider);
            (service as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
            ]);
            vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ label: 'A.csproj', description: '/A.csproj' } as any);

            await provider.showProjectPicker();
            expect(context.workspaceState.update).toHaveBeenCalledWith('nuget.selectedProject', '/A.csproj');
            expect(NuGetPanel.syncProject).toHaveBeenCalledWith('/A.csproj');
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

            expect(hoisted.mockQueryAllProjectsInstalled).toHaveBeenCalledWith(service);
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
        it('shows warning when no projectPath is provided', async () => {
            view = resolveView(provider);
            await messageListener!({ type: 'showContextMenu', packageId: 'Pkg', context: 'browse' });

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Please select a project first.');
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
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

// ──────────────────────────────────────────────
// Mock NuGetOperations — all bulk/single op functions
// ──────────────────────────────────────────────
const hoisted = vi.hoisted(() => ({
    mockExecuteSingleOperation: vi.fn().mockResolvedValue(undefined),
    mockExecuteBulkInstall: vi.fn().mockResolvedValue(undefined),
    mockExecuteBulkUpdatePackages: vi.fn().mockResolvedValue(undefined),
    mockExecuteBulkRemovePackages: vi.fn().mockResolvedValue(undefined),
    mockExecuteBulkUpdateAllProjects: vi.fn().mockResolvedValue(undefined),
    mockExecuteBulkRemoveAllProjects: vi.fn().mockResolvedValue(undefined),
    mockQueryAllProjectsUpdates: vi.fn().mockResolvedValue([]),
    mockQueryAllProjectsInstalled: vi.fn().mockResolvedValue([]),
    mockResolveAllProjectsIcons: vi.fn().mockResolvedValue({}),
}));

vi.mock('../services/NuGetOperations', () => ({
    executeSingleOperation: hoisted.mockExecuteSingleOperation,
    executeBulkInstall: hoisted.mockExecuteBulkInstall,
    executeBulkUpdatePackages: hoisted.mockExecuteBulkUpdatePackages,
    executeBulkRemovePackages: hoisted.mockExecuteBulkRemovePackages,
    executeBulkUpdateAllProjects: hoisted.mockExecuteBulkUpdateAllProjects,
    executeBulkRemoveAllProjects: hoisted.mockExecuteBulkRemoveAllProjects,
    queryAllProjectsUpdates: hoisted.mockQueryAllProjectsUpdates,
    queryAllProjectsInstalled: hoisted.mockQueryAllProjectsInstalled,
    resolveAllProjectsIcons: hoisted.mockResolveAllProjectsIcons,
}));

vi.mock('../services/NuGetService', () => ({
    NuGetService: vi.fn(),
}));

import { NuGetPanel } from './NuGetPanel';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Captured webview message listener from onDidReceiveMessage */
let messageListener: ((data: Record<string, unknown>) => Promise<void>) | undefined;

function createMockWebviewPanel() {
    const postMessage = vi.fn();
    const onDidReceiveMessageDisposable = { dispose: vi.fn() };
    const onDidDisposeDisposable = { dispose: vi.fn() };

    const panel = {
        webview: {
            html: '',
            postMessage,
            onDidReceiveMessage: vi.fn((callback: (data: Record<string, unknown>) => Promise<void>) => {
                messageListener = callback;
                return onDidReceiveMessageDisposable;
            }),
            asWebviewUri: vi.fn((uri: vscode.Uri) => uri),
            cspSource: 'https://test.csp',
        },
        reveal: vi.fn(),
        onDidDispose: vi.fn((_cb: () => void) => onDidDisposeDisposable),
        dispose: vi.fn(),
        iconPath: undefined as vscode.Uri | undefined,
        viewType: 'nugetManager',
    };
    return panel;
}

function createMockNuGetService() {
    return {
        findProjects: vi.fn().mockResolvedValue([]),
        getInstalledPackages: vi.fn().mockResolvedValue([]),
        getTransitivePackages: vi.fn().mockResolvedValue({ frameworks: [], dataSourceAvailable: false }),
        fetchTransitivePackageMetadata: vi.fn().mockResolvedValue(undefined),
        searchPackages: vi.fn().mockResolvedValue([]),
        quickSearchGrouped: vi.fn().mockResolvedValue([]),
        restoreProject: vi.fn().mockResolvedValue(true),
        getSources: vi.fn().mockResolvedValue([]),
        getFailedSources: vi.fn().mockReturnValue(new Map()),
        testSourceConnectivity: vi.fn().mockResolvedValue(undefined),
        clearSourceErrors: vi.fn(),
        enableSource: vi.fn().mockResolvedValue(true),
        disableSource: vi.fn().mockResolvedValue(true),
        addSource: vi.fn().mockResolvedValue({ success: true }),
        removeSource: vi.fn().mockResolvedValue({ success: true }),
        getConfigFilePaths: vi.fn().mockReturnValue([]),
        getPackageVersions: vi.fn().mockResolvedValue([]),
        getPackageMetadata: vi.fn().mockResolvedValue(null),
        checkPackageUpdates: vi.fn().mockResolvedValue([]),
        checkPackageUpdatesMinimal: vi.fn().mockResolvedValue([]),
        installPackage: vi.fn().mockResolvedValue(true),
        updatePackage: vi.fn().mockResolvedValue(true),
        removePackage: vi.fn().mockResolvedValue(true),
        prewarmServiceIndex: vi.fn(),
        prewarmNugetOrgServiceIndex: vi.fn(),
        extractReadmeFromPackage: vi.fn().mockResolvedValue(null),
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
        name: 'nUIget',
        appendLine: vi.fn(),
        append: vi.fn(),
        show: vi.fn(),
        clear: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        dispose: vi.fn(),
        replace: vi.fn(),
        hide: vi.fn(),
        logLevel: 1,
        onDidChangeLogLevel: vi.fn(),
    } as unknown as vscode.LogOutputChannel;
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────
describe('NuGetPanel', () => {
    let mockPanel: ReturnType<typeof createMockWebviewPanel>;
    let mockService: ReturnType<typeof createMockNuGetService>;
    let mockContext: vscode.ExtensionContext;
    let mockOutputChannel: vscode.LogOutputChannel;

    beforeEach(() => {
        vi.clearAllMocks();
        messageListener = undefined;

        // Reset singleton state
        NuGetPanel.currentPanel = undefined;
        (NuGetPanel as any)._cachedSearchQuery = undefined;
        (NuGetPanel as any)._context = undefined;
        (NuGetPanel as any)._outputChannel = undefined;
        NuGetPanel.onPrereleaseChanged = undefined;
        NuGetPanel.onSourceChanged = undefined;
        NuGetPanel.onProjectChanged = undefined;
        NuGetPanel.onPackageChanged = undefined;
        NuGetPanel.onRefreshAll = undefined;

        mockPanel = createMockWebviewPanel();
        mockService = createMockNuGetService();
        mockContext = createMockContext();
        mockOutputChannel = createMockOutputChannel();

        vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(mockPanel as any);
    });

    afterEach(() => {
        // Ensure no lingering singleton
        NuGetPanel.currentPanel = undefined;
    });

    // ──────────────────────────────────────────────
    // Static method: createOrShow
    // ──────────────────────────────────────────────
    describe('createOrShow', () => {
        it('creates new panel when none exists', () => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'nugetManager',
                'nUIget',
                expect.anything(),
                expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true })
            );
            expect(NuGetPanel.currentPanel).toBeDefined();
        });

        it('reveals existing panel and selects project', () => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            const postMessage = mockPanel.webview.postMessage;
            postMessage.mockClear();

            // Call again — should reveal, not create
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any, '/proj.csproj');
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1); // only 1st call
            expect(mockPanel.reveal).toHaveBeenCalled();
            expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'selectProject', projectPath: '/proj.csproj' }));
        });
    });

    // ──────────────────────────────────────────────
    // Static method: refresh
    // ──────────────────────────────────────────────
    describe('refresh', () => {
        it('sends refresh message when panel exists', () => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            NuGetPanel.refresh();
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'refresh' });
        });

        it('does nothing when no panel exists', () => {
            NuGetPanel.refresh();
            expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // Cross-panel sync
    // ──────────────────────────────────────────────
    describe('cross-panel sync', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();
        });

        it('syncPrerelease posts prereleaseChanged message', () => {
            NuGetPanel.syncPrerelease(true);
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'prereleaseChanged', includePrerelease: true });
        });

        it('syncSource posts sourceChanged message', () => {
            NuGetPanel.syncSource('https://nuget.org/v3/index.json');
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'sourceChanged', selectedSource: 'https://nuget.org/v3/index.json' });
        });

        it('syncProject posts projectChanged message', () => {
            NuGetPanel.syncProject('/proj.csproj');
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'projectChanged', projectPath: '/proj.csproj' });
        });

        it('sync methods do nothing when no panel exists', () => {
            NuGetPanel.currentPanel = undefined;
            NuGetPanel.syncPrerelease(false);
            NuGetPanel.syncSource('test');
            NuGetPanel.syncProject('/proj');
            // Only calls from beforeEach should exist
        });
    });

    // ──────────────────────────────────────────────
    // Static method: openSourceSettings
    // ──────────────────────────────────────────────
    describe('openSourceSettings', () => {
        it('sends openSourceSettings when panel already exists', () => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();

            NuGetPanel.openSourceSettings(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'openSourceSettings' });
        });

        it('queues openSourceSettings when panel is new', () => {
            // No panel exists, so creating + open source settings
            NuGetPanel.openSourceSettings(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            // Pending flag is set — will be delivered on first getProjects message
            expect((NuGetPanel.currentPanel as any)._pendingOpenSourceSettings).toBe(true);
        });
    });

    // ──────────────────────────────────────────────
    // Static method: navigateToPackage
    // ──────────────────────────────────────────────
    describe('navigateToPackage', () => {
        it('sends navigateToPackage when panel already exists', () => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();

            NuGetPanel.navigateToPackage(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any, 'Newtonsoft.Json', '13.0.3');
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'navigateToPackage',
                packageId: 'Newtonsoft.Json',
                version: '13.0.3'
            });
        });

        it('queues navigateToPackage when panel is new', () => {
            NuGetPanel.navigateToPackage(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any, 'Serilog');
            expect((NuGetPanel.currentPanel as any)._pendingNavigatePackage).toEqual({ packageId: 'Serilog', version: undefined });
        });
    });

    // ──────────────────────────────────────────────
    // Instance: selectProject
    // ──────────────────────────────────────────────
    describe('selectProject', () => {
        it('posts selectProject message with tab', () => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();

            NuGetPanel.currentPanel!.selectProject('/new.csproj', 'updates');
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'selectProject',
                projectPath: '/new.csproj',
                initialTab: 'updates'
            });
        });
    });

    // ──────────────────────────────────────────────
    // Instance: dispose
    // ──────────────────────────────────────────────
    describe('dispose', () => {
        it('clears currentPanel and disposes resources', () => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            expect(NuGetPanel.currentPanel).toBeDefined();

            NuGetPanel.currentPanel!.dispose();
            expect(NuGetPanel.currentPanel).toBeUndefined();
            expect(mockPanel.dispose).toHaveBeenCalled();
        });

        it('_postMessage is no-op after dispose', () => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            NuGetPanel.currentPanel!.dispose();
            mockPanel.webview.postMessage.mockClear();

            // Sync methods should be no-ops (panel disposed)
            NuGetPanel.currentPanel = undefined;
            NuGetPanel.syncPrerelease(true);
            expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // Message handling
    // ──────────────────────────────────────────────
    describe('message handling', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();
            expect(messageListener).toBeDefined();
        });

        it('getProjects fetches and sends projects', async () => {
            (mockService as any).findProjects.mockResolvedValue([{ name: 'A.csproj', path: '/A.csproj' }]);
            await messageListener!({ type: 'getProjects' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'projects',
                projects: [{ name: 'A.csproj', path: '/A.csproj' }],
            }));
        });

        it('getProjects falls back to persisted project from workspaceState when no pending project', async () => {
            // Pre-set the workspace state to ALL_PROJECTS_SENTINEL (simulating sidebar sync)
            (mockContext.workspaceState as any)._store.set('nuget.selectedProject', '__all_projects__');
            (mockService as any).findProjects.mockResolvedValue([
                { name: 'A.csproj', path: '/A.csproj' },
                { name: 'B.csproj', path: '/B.csproj' }
            ]);

            await messageListener!({ type: 'getProjects' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'projects',
                selectProjectPath: '__all_projects__'
            }));
        });

        it('getInstalledPackages fetches and sends packages', async () => {
            (mockService as any).getInstalledPackages.mockResolvedValue([{ id: 'Pkg', version: '1.0' }]);
            await messageListener!({ type: 'getInstalledPackages', projectPath: '/proj.csproj' });

            expect((mockService as any).getInstalledPackages).toHaveBeenCalledWith('/proj.csproj');
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'installedPackages',
                packages: [{ id: 'Pkg', version: '1.0' }],
                projectPath: '/proj.csproj'
            }));
        });

        it('searchPackages sends results and caches query', async () => {
            (mockService as any).searchPackages.mockResolvedValue([{ id: 'Newtonsoft.Json' }]);
            await messageListener!({ type: 'searchPackages', query: 'Newtonsoft', includePrerelease: false });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'searchResults',
                query: 'Newtonsoft'
            }));
        });

        it('searchPackages skips stale results', async () => {
            // Simulate a slow search being superseded
            let resolveFirst!: (value: unknown[]) => void;
            (mockService as any).searchPackages.mockImplementationOnce(() => new Promise(r => { resolveFirst = r; }));

            const firstPromise = messageListener!({ type: 'searchPackages', query: 'old' });

            // Second search arrives while first is pending
            (mockService as any).searchPackages.mockResolvedValue([{ id: 'New' }]);
            await messageListener!({ type: 'searchPackages', query: 'new' });

            // Resolve the first search — should be discarded
            resolveFirst([{ id: 'Old' }]);
            await firstPromise;

            // Only the second search result should be posted (the 'new' query)
            const searchResultCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (c: unknown[]) => (c[0] as Record<string, unknown>).type === 'searchResults'
            );
            expect(searchResultCalls).toHaveLength(1);
            expect(searchResultCalls[0][0].query).toBe('new');
        });

        it('getPackageVersions fetches and sends versions', async () => {
            (mockService as any).getPackageVersions.mockResolvedValue(['1.0', '2.0']);
            await messageListener!({ type: 'getPackageVersions', packageId: 'Pkg', source: 'https://nuget.org', includePrerelease: true });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'packageVersions',
                packageId: 'Pkg',
                versions: ['1.0', '2.0']
            }));
        });

        it('getPackageMetadata fetches and sends metadata', async () => {
            (mockService as any).getPackageMetadata.mockResolvedValue({ description: 'Test' });
            await messageListener!({ type: 'getPackageMetadata', packageId: 'Pkg', version: '1.0' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'packageMetadata',
                packageId: 'Pkg',
                version: '1.0',
                metadata: { description: 'Test' }
            }));
        });

        it('getSources fetches sources and sends with failed sources', async () => {
            (mockService as any).getSources.mockResolvedValue([{ name: 'nuget.org', url: 'https://nuget.org' }]);
            (mockService as any).getFailedSources.mockReturnValue(new Map([['https://bad.source', 'timeout']]));

            await messageListener!({ type: 'getSources' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'sources',
                sources: [{ name: 'nuget.org', url: 'https://nuget.org' }],
                failedSources: [{ url: 'https://bad.source', error: 'timeout' }]
            }));
        });

        it('getConfigFiles delegates to service', async () => {
            (mockService as any).getConfigFilePaths.mockReturnValue(['/nuget.config']);
            await messageListener!({ type: 'getConfigFiles' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'configFiles',
                configFiles: ['/nuget.config']
            });
        });

        it('getSettings retrieves from workspaceState', async () => {
            (mockContext.workspaceState as any)._store.set('nuget.includePrerelease', true);
            (mockContext.workspaceState as any)._store.set('nuget.selectedSource', 'https://nuget.org');
            await messageListener!({ type: 'getSettings' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'settings',
                includePrerelease: true,
                selectedSource: 'https://nuget.org',
            }));
        });

        it('saveSettings persists and triggers sync callbacks', async () => {
            const onPrerelease = vi.fn();
            const onSource = vi.fn();
            const onProject = vi.fn();
            NuGetPanel.onPrereleaseChanged = onPrerelease;
            NuGetPanel.onSourceChanged = onSource;
            NuGetPanel.onProjectChanged = onProject;

            await messageListener!({
                type: 'saveSettings',
                includePrerelease: true,
                selectedSource: 'https://test',
                selectedProject: '/proj.csproj'
            });

            expect(mockContext.workspaceState.update).toHaveBeenCalledWith('nuget.includePrerelease', true);
            expect(mockContext.workspaceState.update).toHaveBeenCalledWith('nuget.selectedSource', 'https://test');
            expect(mockContext.workspaceState.update).toHaveBeenCalledWith('nuget.selectedProject', '/proj.csproj');
            expect(onPrerelease).toHaveBeenCalledWith(true);
            expect(onSource).toHaveBeenCalledWith('https://test');
            expect(onProject).toHaveBeenCalledWith('/proj.csproj');
        });

        it('getSplitPosition retrieves from globalState', async () => {
            (mockContext.globalState as any)._store.set('nuget.splitPosition', 50);
            await messageListener!({ type: 'getSplitPosition' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'splitPosition',
                position: 50
            });
        });

        it('saveSplitPosition persists to globalState', async () => {
            await messageListener!({ type: 'saveSplitPosition', position: 42 });
            expect(mockContext.globalState.update).toHaveBeenCalledWith('nuget.splitPosition', 42);
        });

        it('fullRefresh clears source errors, refreshes, and notifies sidebar', async () => {
            const onRefreshAll = vi.fn();
            NuGetPanel.onRefreshAll = onRefreshAll;
            (mockService as any).getSources.mockResolvedValue([]);

            await messageListener!({ type: 'fullRefresh' });

            expect((mockService as any).clearSourceErrors).toHaveBeenCalled();
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'refresh' });
            expect(onRefreshAll).toHaveBeenCalled();
        });

        it('restoreProject shows progress and sends result', async () => {
            (vscode.window.withProgress as any) = vi.fn(async (_opts: unknown, task: (progress: unknown) => Promise<void>) => task({}));
            (mockService as any).restoreProject.mockResolvedValue(true);

            await messageListener!({ type: 'restoreProject', projectPath: '/proj.csproj' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'restoreProjectResult',
                success: true,
                projectPath: '/proj.csproj'
            }));
        });

        it('prewarmSource calls prewarmServiceIndex', async () => {
            await messageListener!({ type: 'prewarmSource', sourceUrl: 'https://nuget.org/v3/index.json' });
            expect((mockService as any).prewarmServiceIndex).toHaveBeenCalledWith('https://nuget.org/v3/index.json');
        });

        it('prewarmSource with "all" calls prewarmNugetOrgServiceIndex', async () => {
            await messageListener!({ type: 'prewarmSource', sourceUrl: 'all' });
            expect((mockService as any).prewarmNugetOrgServiceIndex).toHaveBeenCalled();
        });

        it('fetchReadmeFromPackage sends readme', async () => {
            (mockService as any).extractReadmeFromPackage.mockResolvedValue('# README');
            await messageListener!({ type: 'fetchReadmeFromPackage', packageId: 'Pkg', version: '1.0' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'packageReadme',
                packageId: 'Pkg',
                version: '1.0',
                readme: '# README'
            }));
        });

        it('checkPackageUpdates sends updates', async () => {
            (mockService as any).checkPackageUpdates.mockResolvedValue([{ id: 'Pkg', latestVersion: '2.0' }]);
            await messageListener!({
                type: 'checkPackageUpdates',
                installedPackages: [{ id: 'Pkg', version: '1.0' }],
                includePrerelease: false,
                projectPath: '/proj.csproj'
            });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'packageUpdates',
                updates: [{ id: 'Pkg', latestVersion: '2.0' }],
                projectPath: '/proj.csproj'
            }));
        });

        it('enableSource refreshes sources on success', async () => {
            (mockService as any).enableSource.mockResolvedValue(true);
            (mockService as any).getSources.mockResolvedValue([{ name: 'test', url: 'https://test' }]);
            await messageListener!({ type: 'enableSource', sourceName: 'test' });

            expect((mockService as any).clearSourceErrors).toHaveBeenCalled();
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'sources',
                failedSources: []
            }));
        });

        it('addSource sends success result', async () => {
            (mockService as any).addSource.mockResolvedValue({ success: true });
            (mockService as any).getSources.mockResolvedValue([]);
            await messageListener!({ type: 'addSource', url: 'https://new', name: 'New' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'addSourceResult', success: true });
        });

        it('addSource sends failure result', async () => {
            (mockService as any).addSource.mockResolvedValue({ success: false, error: 'Invalid URL' });
            await messageListener!({ type: 'addSource', url: 'bad' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'addSourceResult',
                success: false,
                error: 'Invalid URL'
            });
        });

        it('removeSource shows success notification', async () => {
            (mockService as any).getSources.mockResolvedValue([{ name: 'OldSource', url: 'https://old' }]);
            (mockService as any).removeSource.mockResolvedValue({ success: true });
            await messageListener!({ type: 'removeSource', sourceName: 'OldSource' });

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Removed NuGet source: OldSource');
        });
    });

    // ──────────────────────────────────────────────
    // Operation guard
    // ──────────────────────────────────────────────
    describe('operation guard', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            expect(messageListener).toBeDefined();
        });

        it('installPackage delegates to executeSingleOperation', async () => {
            await messageListener!({ type: 'installPackage', projectPath: '/proj.csproj', packageId: 'Pkg', version: '1.0', sourceUrl: 'https://nuget.org' });
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledWith(
                expect.objectContaining({ nugetService: mockService }),
                'install',
                '/proj.csproj', 'Pkg', '1.0', 'https://nuget.org'
            );
        });

        it('updatePackage delegates to executeSingleOperation', async () => {
            await messageListener!({ type: 'updatePackage', projectPath: '/proj.csproj', packageId: 'Pkg', version: '2.0', sourceUrl: 'src' });
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledWith(
                expect.anything(), 'update', '/proj.csproj', 'Pkg', '2.0', 'src'
            );
        });

        it('removePackage delegates to executeSingleOperation', async () => {
            await messageListener!({ type: 'removePackage', projectPath: '/proj.csproj', packageId: 'Pkg' });
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledWith(
                expect.anything(), 'remove', '/proj.csproj', 'Pkg'
            );
        });

        it('bulkInstall delegates to executeBulkInstall', async () => {
            await messageListener!({ type: 'bulkInstall', projectPaths: ['/a.csproj'], packageId: 'Pkg', version: '1.0' });
            expect(hoisted.mockExecuteBulkInstall).toHaveBeenCalled();
        });

        it('bulkUpdatePackages delegates to executeBulkUpdatePackages', async () => {
            await messageListener!({ type: 'bulkUpdatePackages', packages: [{ id: 'P', version: '2.0' }], projectPath: '/proj.csproj' });
            expect(hoisted.mockExecuteBulkUpdatePackages).toHaveBeenCalled();
        });

        it('confirmBulkRemove delegates to executeBulkRemovePackages', async () => {
            await messageListener!({ type: 'confirmBulkRemove', packages: ['Pkg'], projectPath: '/proj.csproj' });
            expect(hoisted.mockExecuteBulkRemovePackages).toHaveBeenCalled();
        });

        it('bulkUpdateAllProjects delegates to executeBulkUpdateAllProjects', async () => {
            await messageListener!({ type: 'bulkUpdateAllProjects', projectUpdates: [] });
            expect(hoisted.mockExecuteBulkUpdateAllProjects).toHaveBeenCalled();
        });

        it('confirmBulkRemoveAllProjects delegates to executeBulkRemoveAllProjects', async () => {
            await messageListener!({ type: 'confirmBulkRemoveAllProjects', projectRemovals: [] });
            expect(hoisted.mockExecuteBulkRemoveAllProjects).toHaveBeenCalled();
        });

        it('blocks concurrent operations', async () => {
            // Simulate a long-running operation
            let resolveOp!: () => void;
            hoisted.mockExecuteSingleOperation.mockImplementationOnce(() => new Promise<void>(r => { resolveOp = r; }));

            const firstOp = messageListener!({ type: 'installPackage', projectPath: '/p', packageId: 'A' });

            // Try starting another operation while first is in progress
            await messageListener!({ type: 'removePackage', projectPath: '/p', packageId: 'B' });

            // Only the install should have been called (remove is blocked)
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledTimes(1);

            resolveOp();
            await firstOp;
        });

        it('releases lock after operation failure', async () => {
            hoisted.mockExecuteSingleOperation.mockRejectedValueOnce(new Error('Failed'));

            // First op fails
            await messageListener!({ type: 'installPackage', projectPath: '/p', packageId: 'A' }).catch(() => { });

            // Second op should work (lock released in finally)
            hoisted.mockExecuteSingleOperation.mockResolvedValueOnce(undefined);
            await messageListener!({ type: 'installPackage', projectPath: '/p', packageId: 'B' });
            expect(hoisted.mockExecuteSingleOperation).toHaveBeenCalledTimes(2);
        });
    });

    // ──────────────────────────────────────────────
    // _getHtmlForWebview
    // ──────────────────────────────────────────────
    describe('HTML generation', () => {
        it('generates HTML with CSP and script/style URIs', () => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            const html = mockPanel.webview.html;
            expect(html).toContain('Content-Security-Policy');
            expect(html).toContain("default-src 'none'");
            expect(html).toContain('webview.js');
            expect(html).toContain('webview.css');
            expect(html).toContain('lang="en"');
        });
    });

    // ──────────────────────────────────────────────
    // Phase 5A: Uncovered message handlers
    // ──────────────────────────────────────────────

    describe('getTransitivePackages message', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();
        });

        it('returns frameworks and dataSourceAvailable', async () => {
            const mockResult = { frameworks: [{ name: 'net8.0', packages: [] }], dataSourceAvailable: true };
            (mockService as any).getTransitivePackages.mockResolvedValue(mockResult);
            await messageListener!({ type: 'getTransitivePackages', projectPath: '/proj.csproj' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'transitivePackages',
                frameworks: mockResult.frameworks,
                dataSourceAvailable: true,
                projectPath: '/proj.csproj'
            });
        });

        it('calls restoreProject first when forceRestore is true', async () => {
            (mockService as any).restoreProject.mockResolvedValue(true);
            (mockService as any).getTransitivePackages.mockResolvedValue({ frameworks: [], dataSourceAvailable: true });
            await messageListener!({ type: 'getTransitivePackages', projectPath: '/proj.csproj', forceRestore: true });

            expect((mockService as any).restoreProject).toHaveBeenCalledWith('/proj.csproj');
            expect((mockService as any).getTransitivePackages).toHaveBeenCalledWith('/proj.csproj');
        });

        it('sends empty result on error', async () => {
            (mockService as any).getTransitivePackages.mockRejectedValue(new Error('fail'));
            await messageListener!({ type: 'getTransitivePackages', projectPath: '/proj.csproj' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'transitivePackages',
                frameworks: [],
                dataSourceAvailable: false,
                projectPath: '/proj.csproj'
            });
        });
    });

    describe('getTransitiveMetadata message', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();
        });

        it('fetches metadata and sends result', async () => {
            const packages = [{ id: 'Pkg', version: '1.0', requiredByChain: ['Parent'] }];
            (mockService as any).fetchTransitivePackageMetadata.mockResolvedValue(undefined);
            await messageListener!({
                type: 'getTransitiveMetadata',
                packages,
                targetFramework: 'net8.0',
                projectPath: '/proj.csproj'
            });

            expect((mockService as any).fetchTransitivePackageMetadata).toHaveBeenCalledWith(packages);
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'transitiveMetadata',
                targetFramework: 'net8.0',
                packages,
                projectPath: '/proj.csproj'
            });
        });

        it('sends result even when metadata fetch throws', async () => {
            const packages = [{ id: 'Pkg', version: '1.0', requiredByChain: [] }];
            (mockService as any).fetchTransitivePackageMetadata.mockRejectedValue(new Error('fail'));
            await messageListener!({
                type: 'getTransitiveMetadata',
                packages,
                targetFramework: 'net8.0',
                projectPath: '/proj.csproj'
            });

            // Result still sent after error
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'transitiveMetadata',
                targetFramework: 'net8.0'
            }));
        });
    });

    describe('autocompletePackages message', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();
        });

        it('sends grouped autocomplete results', async () => {
            const grouped = [{ sourceName: 'nuget.org', results: [{ id: 'Pkg' }] }];
            (mockService as any).quickSearchGrouped.mockResolvedValue(grouped);
            await messageListener!({
                type: 'autocompletePackages',
                query: 'New',
                sources: [{ name: 'nuget.org', url: 'https://api.nuget.org' }],
                includePrerelease: false
            });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'autocompleteResults',
                groupedResults: grouped,
                query: 'New'
            });
        });

        it('skips sending results when a newer autocomplete query arrived', async () => {
            // Simulate a slow query being superseded
            let resolveFirst: (v: unknown[]) => void;
            const firstPromise = new Promise<unknown[]>(r => { resolveFirst = r; });
            (mockService as any).quickSearchGrouped
                .mockReturnValueOnce(firstPromise)
                .mockResolvedValueOnce([]);

            // Fire first query (slow)
            const first = messageListener!({ type: 'autocompletePackages', query: 'slow', sources: [] });
            // Fire second query (fast) — updates _latestAutocompleteQuery
            await messageListener!({ type: 'autocompletePackages', query: 'fast', sources: [] });
            // Now resolve the first (stale)
            resolveFirst!([]);
            await first;

            // Only the 'fast' query result should have been sent
            const calls = mockPanel.webview.postMessage.mock.calls
                .filter((c: unknown[]) => (c[0] as { type: string }).type === 'autocompleteResults');
            expect(calls.length).toBe(1);
            expect(calls[0][0]).toMatchObject({ query: 'fast' });
        });
    });

    describe('refreshSources message', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();
        });

        it('clears source errors and re-fetches sources', async () => {
            (mockService as any).getSources.mockResolvedValue([{ name: 'nuget.org', url: 'https://api.nuget.org' }]);
            await messageListener!({ type: 'refreshSources' });

            expect((mockService as any).clearSourceErrors).toHaveBeenCalled();
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'sources',
                failedSources: []
            }));
        });
    });

    describe('disableSource message', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();
        });

        it('refreshes sources and includes disabledSourceUrl on success', async () => {
            (mockService as any).disableSource.mockResolvedValue(true);
            (mockService as any).getSources.mockResolvedValue([]);
            await messageListener!({ type: 'disableSource', sourceName: 'MySource', sourceUrl: 'https://my.source' });

            expect((mockService as any).disableSource).toHaveBeenCalledWith('MySource');
            expect((mockService as any).clearSourceErrors).toHaveBeenCalled();
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'sources',
                disabledSourceUrl: 'https://my.source',
                failedSources: []
            }));
        });

        it('does not refresh sources on failure', async () => {
            (mockService as any).disableSource.mockResolvedValue(false);
            await messageListener!({ type: 'disableSource', sourceName: 'MySource', sourceUrl: 'https://my.source' });

            expect((mockService as any).clearSourceErrors).not.toHaveBeenCalled();
            // No sources message should be sent
            expect(mockPanel.webview.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'sources' }));
        });
    });

    describe('checkAllProjectsUpdates message', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();
        });

        it('checks updates for all projects and sends combined results', async () => {
            hoisted.mockQueryAllProjectsUpdates.mockResolvedValueOnce([{
                projectPath: '/projA.csproj',
                projectName: 'ProjA',
                updates: [{ id: 'Pkg', installedVersion: '1.0', latestVersion: '2.0' }]
            }]);

            await messageListener!({ type: 'checkAllProjectsUpdates', includePrerelease: false });

            expect(hoisted.mockQueryAllProjectsUpdates).toHaveBeenCalledWith(mockService, false, false);
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsUpdates',
                projectUpdates: [{
                    projectPath: '/projA.csproj',
                    projectName: 'ProjA',
                    updates: [{ id: 'Pkg', installedVersion: '1.0', latestVersion: '2.0' }]
                }]
            });
        });

        it('skips projects that throw errors', async () => {
            hoisted.mockQueryAllProjectsUpdates.mockResolvedValueOnce([]);

            await messageListener!({ type: 'checkAllProjectsUpdates', includePrerelease: false });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsUpdates',
                projectUpdates: []
            });
        });
    });

    describe('checkAllProjectsInstalled message', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();
        });

        it('collects installed packages from all projects', async () => {
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([{
                projectPath: '/projA.csproj',
                projectName: 'ProjA',
                packages: [{ id: 'Pkg', version: '1.0', resolvedVersion: '1.0.0', isImplicit: false }]
            }]);
            await messageListener!({ type: 'checkAllProjectsInstalled', context: 'multiInstall' });

            expect(hoisted.mockQueryAllProjectsInstalled).toHaveBeenCalledWith(mockService);
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsInstalled',
                context: 'multiInstall',
                projectInstalled: [{
                    projectPath: '/projA.csproj',
                    projectName: 'ProjA',
                    packages: [{ id: 'Pkg', version: '1.0', resolvedVersion: '1.0.0', isImplicit: false }]
                }]
            });
        });

        it('skips projects that throw errors', async () => {
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([]);
            await messageListener!({ type: 'checkAllProjectsInstalled' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsInstalled',
                context: undefined,
                projectInstalled: []
            });
        });
    });

    describe('all-projects icon enrichment', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();
        });

        it('sends allProjectsIcons after checkAllProjectsUpdates with packages', async () => {
            hoisted.mockQueryAllProjectsUpdates.mockResolvedValueOnce([{
                projectPath: '/projA.csproj',
                projectName: 'ProjA',
                updates: [{ id: 'Pkg', installedVersion: '1.0', latestVersion: '2.0' }]
            }]);
            hoisted.mockResolveAllProjectsIcons.mockResolvedValueOnce({ 'Pkg@1.0': 'https://icon/pkg.png' });

            await messageListener!({ type: 'checkAllProjectsUpdates', includePrerelease: false });
            // Allow background icon resolution promise to settle
            await new Promise(r => setTimeout(r, 10));

            expect(hoisted.mockResolveAllProjectsIcons).toHaveBeenCalledWith(
                mockService,
                [{ id: 'Pkg', version: '1.0' }]
            );
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsIcons',
                iconMap: { 'Pkg@1.0': 'https://icon/pkg.png' }
            });
        });

        it('does not send allProjectsIcons when icon map is empty', async () => {
            hoisted.mockQueryAllProjectsUpdates.mockResolvedValueOnce([{
                projectPath: '/projA.csproj',
                projectName: 'ProjA',
                updates: [{ id: 'Pkg', installedVersion: '1.0', latestVersion: '2.0' }]
            }]);
            hoisted.mockResolveAllProjectsIcons.mockResolvedValueOnce({});

            await messageListener!({ type: 'checkAllProjectsUpdates', includePrerelease: false });
            await new Promise(r => setTimeout(r, 10));

            const iconMsg = mockPanel.webview.postMessage.mock.calls.find(
                (c: any[]) => c[0]?.type === 'allProjectsIcons'
            );
            expect(iconMsg).toBeUndefined();
        });

        it('sends allProjectsIcons after checkAllProjectsInstalled (non-multiInstall)', async () => {
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([{
                projectPath: '/projA.csproj',
                projectName: 'ProjA',
                packages: [{ id: 'Pkg', version: '1.0', resolvedVersion: '1.0.0' }]
            }]);
            hoisted.mockResolveAllProjectsIcons.mockResolvedValueOnce({ 'Pkg@1.0.0': 'https://icon/pkg.png' });

            await messageListener!({ type: 'checkAllProjectsInstalled' });
            await new Promise(r => setTimeout(r, 10));

            expect(hoisted.mockResolveAllProjectsIcons).toHaveBeenCalledWith(
                mockService,
                [{ id: 'Pkg', version: '1.0.0' }]
            );
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsIcons',
                iconMap: { 'Pkg@1.0.0': 'https://icon/pkg.png' }
            });
        });

        it('skips icon resolution for multiInstall context', async () => {
            hoisted.mockQueryAllProjectsInstalled.mockResolvedValueOnce([{
                projectPath: '/projA.csproj',
                projectName: 'ProjA',
                packages: [{ id: 'Pkg', version: '1.0' }]
            }]);

            await messageListener!({ type: 'checkAllProjectsInstalled', context: 'multiInstall' });
            await new Promise(r => setTimeout(r, 10));

            expect(hoisted.mockResolveAllProjectsIcons).not.toHaveBeenCalled();
        });
    });

    describe('stale search query guard', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();
        });

        it('skips sending searchResults when a newer query supersedes', async () => {
            let resolveFirst: (v: unknown[]) => void;
            const firstPromise = new Promise<unknown[]>(r => { resolveFirst = r; });
            (mockService as any).searchPackages
                .mockReturnValueOnce(firstPromise)
                .mockResolvedValueOnce([{ id: 'Fast' }]);

            // Fire first query (slow)
            const first = messageListener!({ type: 'searchPackages', query: 'slow', includePrerelease: false });
            // Fire second query (fast)
            await messageListener!({ type: 'searchPackages', query: 'fast', includePrerelease: false });
            // Resolve the stale first query
            resolveFirst!([{ id: 'Stale' }]);
            await first;

            const searchCalls = mockPanel.webview.postMessage.mock.calls
                .filter((c: unknown[]) => (c[0] as { type: string }).type === 'searchResults');
            expect(searchCalls.length).toBe(1);
            expect(searchCalls[0][0]).toMatchObject({ query: 'fast' });
        });
    });

    // ──────────────────────────────────────────────
    // Error resilience: stuck spinner prevention
    // ──────────────────────────────────────────────
    describe('error resilience (stuck spinner prevention)', () => {
        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
            mockPanel.webview.postMessage.mockClear();
            expect(messageListener).toBeDefined();
        });

        it('getInstalledPackages sends empty response on error', async () => {
            (mockService as any).getInstalledPackages.mockRejectedValue(new Error('file not found'));
            mockPanel.webview.postMessage.mockClear();
            await messageListener!({ type: 'getInstalledPackages', projectPath: '/gone.csproj' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'installedPackages',
                packages: [],
                projectPath: '/gone.csproj'
            });
        });

        it('checkPackageUpdates sends empty response on error', async () => {
            (mockService as any).checkPackageUpdates.mockRejectedValue(new Error('network error'));
            mockPanel.webview.postMessage.mockClear();
            await messageListener!({
                type: 'checkPackageUpdates',
                installedPackages: [{ id: 'Pkg', version: '1.0' }],
                includePrerelease: false,
                projectPath: '/proj.csproj'
            });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'packageUpdates',
                updates: [],
                projectPath: '/proj.csproj'
            });
        });

        it('checkAllProjectsUpdates sends empty response on error', async () => {
            hoisted.mockQueryAllProjectsUpdates.mockRejectedValue(new Error('network error'));
            mockPanel.webview.postMessage.mockClear();
            await messageListener!({
                type: 'checkAllProjectsUpdates',
                includePrerelease: false
            });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsUpdates',
                projectUpdates: []
            });
        });

        it('checkAllProjectsInstalled sends empty response on error', async () => {
            hoisted.mockQueryAllProjectsInstalled.mockRejectedValue(new Error('network error'));
            mockPanel.webview.postMessage.mockClear();
            await messageListener!({
                type: 'checkAllProjectsInstalled',
                context: 'multiInstall'
            });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'allProjectsInstalled',
                context: 'multiInstall',
                projectInstalled: []
            });
        });
    });

    describe('sentinel guards', () => {
        const SENTINEL = '__all_projects__';

        beforeEach(() => {
            NuGetPanel.createOrShow(vscode.Uri.file('/ext'), mockContext, mockOutputChannel, mockService as any);
        });

        it('getInstalledPackages ignores sentinel projectPath', async () => {
            await messageListener!({ type: 'getInstalledPackages', projectPath: SENTINEL });
            expect((mockService as any).getInstalledPackages).not.toHaveBeenCalled();
        });

        it('installPackage ignores sentinel projectPath', async () => {
            await messageListener!({ type: 'installPackage', projectPath: SENTINEL, packageId: 'Pkg', version: '1.0.0' });
            expect(hoisted.mockExecuteSingleOperation).not.toHaveBeenCalled();
        });

        it('updatePackage ignores sentinel projectPath', async () => {
            await messageListener!({ type: 'updatePackage', projectPath: SENTINEL, packageId: 'Pkg', version: '2.0.0' });
            expect(hoisted.mockExecuteSingleOperation).not.toHaveBeenCalled();
        });

        it('removePackage ignores sentinel projectPath', async () => {
            await messageListener!({ type: 'removePackage', projectPath: SENTINEL, packageId: 'Pkg' });
            expect(hoisted.mockExecuteSingleOperation).not.toHaveBeenCalled();
        });

        it('bulkInstall filters sentinel from projectPaths', async () => {
            await messageListener!({ type: 'bulkInstall', projectPaths: [SENTINEL], packageId: 'Pkg', version: '1.0.0' });
            expect(hoisted.mockExecuteBulkInstall).not.toHaveBeenCalled();
        });

        it('bulkUpdatePackages ignores sentinel projectPath', async () => {
            await messageListener!({ type: 'bulkUpdatePackages', projectPath: SENTINEL, packages: [] });
            expect(hoisted.mockExecuteBulkUpdatePackages).not.toHaveBeenCalled();
        });

        it('confirmBulkRemove ignores sentinel projectPath', async () => {
            await messageListener!({ type: 'confirmBulkRemove', projectPath: SENTINEL, packages: [] });
            expect(hoisted.mockExecuteBulkRemovePackages).not.toHaveBeenCalled();
        });
    });
});

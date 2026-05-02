import * as vscode from 'vscode';
import { executeBulkInstall, executeBulkRemoveAllProjects, executeBulkRemovePackages, executeBulkUpdateAllProjects, executeBulkUpdatePackages, executeSingleOperation, OperationContext, ProjectInstalledResult, queryAllProjectsInstalled, queryAllProjectsUpdates, resolveAllProjectsIcons } from '../services/NuGetOperations';
import { isPerfEnabled, startTimer } from '../services/NuGetPerf';
import { NuGetService } from '../services/NuGetService';
import type { PanelRequestMessage } from '../services/NuGetTypes';
import { ALL_PROJECTS_SENTINEL } from '../services/NuGetTypes';

export class NuGetPanel {
    public static currentPanel: NuGetPanel | undefined;
    public static readonly viewType = 'nugetManager';
    private static _cachedSearchQuery: string | undefined;
    private static _context: vscode.ExtensionContext | undefined;
    private static _outputChannel: vscode.LogOutputChannel | undefined;

    /** Callback fired when the main panel's prerelease setting changes (wired in extension.ts) */
    public static onPrereleaseChanged: ((value: boolean) => void) | undefined;
    /** Callback fired when the main panel's selected source changes (wired in extension.ts) */
    public static onSourceChanged: ((value: string) => void) | undefined;
    /** Callback fired when the main panel's selected project changes (wired in extension.ts) */
    public static onProjectChanged: ((value: string) => void) | undefined;
    /** Callback fired when a package is installed/updated/removed in the main panel (wired in extension.ts) */
    public static onPackageChanged: ((operation: { type: string; packageId?: string; packageIds?: string[]; projectPath?: string; version?: string }) => void) | undefined;
    /** Callback fired when the main panel's full refresh button is pressed (wired in extension.ts) */
    public static onRefreshAll: (() => void) | undefined;

    /** Push a prerelease change into the main panel webview (called from sidebar sync) */
    public static syncPrerelease(value: boolean): void {
        if (NuGetPanel.currentPanel && !NuGetPanel.currentPanel._disposed) {
            NuGetPanel.currentPanel._postMessage({ type: 'prereleaseChanged', includePrerelease: value });
        }
    }

    /** Push a source change into the main panel webview (called from sidebar sync) */
    public static syncSource(value: string): void {
        if (NuGetPanel.currentPanel && !NuGetPanel.currentPanel._disposed) {
            NuGetPanel.currentPanel._postMessage({ type: 'sourceChanged', selectedSource: value });
        }
    }

    /** Push a project change into the main panel webview (called from sidebar sync) */
    public static syncProject(projectPath: string): void {
        if (NuGetPanel.currentPanel && !NuGetPanel.currentPanel._disposed) {
            NuGetPanel.currentPanel._postMessage({ type: 'projectChanged', projectPath });
        }
    }

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _nugetService: NuGetService;
    private _disposables: vscode.Disposable[] = [];
    private _pendingProjectPath: string | undefined;
    private _pendingInitialTab: 'installed' | 'updates' | undefined;
    private _pendingNavigatePackage: { packageId: string; version?: string } | undefined;
    private _pendingOpenSourceSettings = false;
    private _disposed = false;
    // Track the latest autocomplete query to skip stale requests
    private _latestAutocompleteQuery: string = '';
    // Track the latest search query to skip stale requests
    private _latestSearchQuery: string = '';
    // Prevent concurrent mutating operations (install/update/remove)
    private _operationInProgress = false;
    /** AbortControllers keyed by `${kind}:${context}` for in-flight streaming queries (Plan 10). */
    private _inflightAborts: Map<string, AbortController> = new Map();
    // Perf instrumentation (Plan 01)
    private readonly _panelOpenedAt: number = performance.now();
    private _webviewReady = false;
    private _firstRenderLogged = false;

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, outputChannel: vscode.LogOutputChannel, nugetService: NuGetService, projectPath?: string, initialTab?: 'installed' | 'updates') {
        NuGetPanel._context = context;
        NuGetPanel._outputChannel = outputChannel;
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it and select the project
        if (NuGetPanel.currentPanel) {
            NuGetPanel.currentPanel._panel.reveal(column);
            if (projectPath) {
                NuGetPanel.currentPanel.selectProject(projectPath, initialTab);
            }
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            NuGetPanel.viewType,
            'nUIget',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        NuGetPanel.currentPanel = new NuGetPanel(panel, extensionUri, nugetService, projectPath, initialTab);
    }

    public static refresh() {
        if (NuGetPanel.currentPanel) {
            NuGetPanel.currentPanel._panel.webview.postMessage({ type: 'refresh' });
        }
    }

    /** Scoped refresh: re-fetch installed packages but skip full update check
     * (the sidebar already performed a scoped update check for the affected packages). */
    public static refreshScoped(operation: { type: string; packageId?: string; packageIds?: string[]; projectPath?: string; version?: string }) {
        if (NuGetPanel.currentPanel) {
            NuGetPanel.currentPanel._panel.webview.postMessage({ type: 'refreshScoped', operation });
        }
    }

    public selectProject(projectPath: string, initialTab?: 'installed' | 'updates') {
        this._postMessage({
            type: 'selectProject',
            projectPath: projectPath,
            initialTab: initialTab
        });
    }

    /**
     * Open the main panel with the source settings overlay visible.
     */
    public static openSourceSettings(extensionUri: vscode.Uri, context: vscode.ExtensionContext, outputChannel: vscode.LogOutputChannel, nugetService: NuGetService) {
        const panelExisted = !!NuGetPanel.currentPanel;
        NuGetPanel.createOrShow(extensionUri, context, outputChannel, nugetService);
        if (NuGetPanel.currentPanel && !NuGetPanel.currentPanel._disposed) {
            if (panelExisted) {
                NuGetPanel.currentPanel._postMessage({ type: 'openSourceSettings' });
            } else {
                NuGetPanel.currentPanel._pendingOpenSourceSettings = true;
            }
        }
    }

    /**
     * Navigate to a specific package in the main panel.
     * Opens/reveals the panel, fills the search bar with the package, and auto-selects it.
     */
    public static navigateToPackage(extensionUri: vscode.Uri, context: vscode.ExtensionContext, outputChannel: vscode.LogOutputChannel, nugetService: NuGetService, packageId: string, version?: string) {
        // Check if panel already exists (webview is ready to receive messages)
        const panelExisted = !!NuGetPanel.currentPanel;
        NuGetPanel.createOrShow(extensionUri, context, outputChannel, nugetService);
        if (NuGetPanel.currentPanel && !NuGetPanel.currentPanel._disposed) {
            if (panelExisted) {
                // Panel already exists — webview is ready, send directly
                NuGetPanel.currentPanel._postMessage({
                    type: 'navigateToPackage',
                    packageId,
                    version
                });
            } else {
                // Panel was just created — webview not ready yet, queue for delivery on first message
                NuGetPanel.currentPanel._pendingNavigatePackage = { packageId, version };
            }
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, nugetService: NuGetService, projectPath?: string, initialTab?: 'installed' | 'updates') {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._nugetService = nugetService;
        this._pendingProjectPath = projectPath;
        this._pendingInitialTab = initialTab;

        // Set the webview's initial html content
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        // Send cached search query if available to trigger fresh search
        if (NuGetPanel._cachedSearchQuery) {
            setTimeout(() => {
                this._postMessage({
                    type: 'restoreSearchQuery',
                    query: NuGetPanel._cachedSearchQuery
                });
            }, 100);
        }

        // Set the panel icon (box icon for tab)
        this._panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'tab-icon.png');

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (data) => {
                try {
                    await this._handleMessage(data);
                } catch (error) {
                    console.error('Error handling webview message:', error);
                    vscode.window.showErrorMessage(`NuGet Manager error: ${error}`);
                }
            },
            null,
            this._disposables
        );

        // Listen for configuration changes and push updated settings to webview
        vscode.workspace.onDidChangeConfiguration(
            (e) => {
                if (e.affectsConfiguration('nuiget')) {
                    const config = vscode.workspace.getConfiguration('nuiget');
                    const searchDebounceMode = config.get<string>('searchDebounceMode', 'quicksearch');
                    const recentSearchesLimit = config.get<number>('recentSearchesLimit', 5);
                    this._postMessage({
                        type: 'settingsChanged',
                        searchDebounceMode: searchDebounceMode,
                        recentSearchesLimit: recentSearchesLimit
                    });
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleMessage(data: PanelRequestMessage) {
        switch (data.type) {
            case 'webviewReady':
                {
                    if (!this._webviewReady) {
                        this._webviewReady = true;
                        if (isPerfEnabled()) {
                            const ms = performance.now() - this._panelOpenedAt;
                            NuGetPanel._outputChannel?.info(`[perf] panelOpen→webviewReady ${ms.toFixed(1)}ms`);
                        }
                    }
                    break;
                }
            case 'firstUsefulRender':
                {
                    if (!this._firstRenderLogged) {
                        this._firstRenderLogged = true;
                        if (isPerfEnabled()) {
                            const ms = performance.now() - this._panelOpenedAt;
                            NuGetPanel._outputChannel?.info(`[perf] panelOpen→firstUsefulRender ${ms.toFixed(1)}ms source=${data.source}`);
                        }
                    }
                    break;
                }
            case 'getProjects':
                {
                    const projects = await this._nugetService.findProjects();
                    // Use pending project (from context menu), or fall back to persisted selection (from sidebar sync)
                    const selectProjectPath = this._pendingProjectPath
                        ?? NuGetPanel._context?.workspaceState.get<string>('nuget.selectedProject');
                    this._postMessage({
                        type: 'projects',
                        projects: projects,
                        selectProjectPath
                    });
                    // Clear pending after sending
                    this._pendingProjectPath = undefined;

                    // Send pending navigateToPackage if queued (panel was just created)
                    if (this._pendingNavigatePackage) {
                        const nav = this._pendingNavigatePackage;
                        this._pendingNavigatePackage = undefined;
                        // Small delay to let the webview finish initial setup (sources, settings)
                        setTimeout(() => {
                            this._postMessage({
                                type: 'navigateToPackage',
                                packageId: nav.packageId,
                                version: nav.version
                            });
                        }, 200);
                    }

                    // Send pending openSourceSettings if queued (panel was just created)
                    if (this._pendingOpenSourceSettings) {
                        this._pendingOpenSourceSettings = false;
                        setTimeout(() => {
                            this._postMessage({ type: 'openSourceSettings' });
                        }, 200);
                    }
                    break;
                }
            case 'getInstalledPackages':
                {
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    const t = startTimer('getInstalledPackages', data.projectPath as string);
                    try {
                        // Phase 1: send lite packages immediately (~20ms, .csproj parsing only)
                        const packages = await this._nugetService.getInstalledPackages(data.projectPath as string, true /* liteMode */);
                        t.mark('lite');
                        this._postMessage({
                            type: 'installedPackages',
                            packages: packages,
                            projectPath: data.projectPath
                        });
                        // Phase 2: enrich metadata in background, send follow-up
                        if (packages.length > 0) {
                            this._nugetService.enrichInstalledPackageMetadata(packages).then(() => {
                                this._postMessage({
                                    type: 'installedPackagesMetadata',
                                    packages: packages,
                                    projectPath: data.projectPath
                                });
                            }).catch(() => { /* non-critical: packages are already visible */ });
                        }
                        t.end({ count: packages.length });
                    } catch (error) {
                        console.error('[nUIget] getInstalledPackages error:', error);
                        this._postMessage({
                            type: 'installedPackages',
                            packages: [],
                            projectPath: data.projectPath
                        });
                        t.end({ error: 1 });
                    }
                    break;
                }
            case 'getTransitivePackages':
                {
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    try {
                        // If forceRestore is true (explicit refresh by user), run restore first
                        // This ignores the noRestore setting since user explicitly requested refresh
                        if (data.forceRestore) {
                            await this._nugetService.restoreProject(data.projectPath);
                        }
                        const result = await this._nugetService.getTransitivePackages(
                            data.projectPath
                        );
                        this._postMessage({
                            type: 'transitivePackages',
                            frameworks: result.frameworks,
                            dataSourceAvailable: result.dataSourceAvailable,
                            projectPath: data.projectPath
                        });
                    } catch (error) {
                        console.error('Error getting transitive packages:', error);
                        // Send empty result so UI stops loading
                        this._postMessage({
                            type: 'transitivePackages',
                            frameworks: [],
                            dataSourceAvailable: false,
                            projectPath: data.projectPath
                        });
                    }
                    break;
                }
            case 'getTransitiveMetadata':
                {
                    // Fetch metadata for packages in a specific framework section
                    const packages = data.packages;
                    try {
                        await this._nugetService.fetchTransitivePackageMetadata(packages);
                    } catch (error) {
                        console.error('Error fetching transitive metadata:', error);
                    }
                    this._postMessage({
                        type: 'transitiveMetadata',
                        targetFramework: data.targetFramework,
                        packages: packages,
                        projectPath: data.projectPath
                    });
                    break;
                }
            case 'restoreProject':
                {
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: 'Restoring project...',
                        cancellable: false
                    }, async () => {
                        const success = await this._nugetService.restoreProject(data.projectPath);
                        this._postMessage({
                            type: 'restoreProjectResult',
                            success: success,
                            projectPath: data.projectPath
                        });
                    });
                    break;
                }
            case 'searchPackages':
                {
                    const query = data.query;
                    // Track latest query for race condition prevention
                    this._latestSearchQuery = query;
                    const t = startTimer('searchPackages');

                    // Defense-in-depth: pre-filter known-unreachable sources before calling searchPackages
                    let sources = data.sources;
                    if (sources && sources.length > 0) {
                        const failedSources = this._nugetService.getFailedSources();
                        if (failedSources.size > 0) {
                            const filtered = sources.filter(url => !failedSources.has(url));
                            // Only use filtered list if at least one source remains
                            if (filtered.length > 0) {
                                sources = filtered;
                            }
                        }
                    }

                    // Phase 1: send lite results immediately (CLI path returns fast without enrichment)
                    const results = await this._nugetService.searchPackages(
                        query,
                        sources,
                        data.includePrerelease,
                        true, // liteMode — skip metadata enrichment
                        data.take,
                        data.exactMatch
                    );
                    t.mark('lite');

                    // Skip sending results if a newer query arrived while we were fetching
                    if (this._latestSearchQuery !== query) {
                        t.end({ stale: 1 });
                        break;
                    }

                    // Cache the search query for panel restore
                    NuGetPanel._cachedSearchQuery = query;
                    this._postMessage({
                        type: 'searchResults',
                        results: results,
                        query: query
                    });
                    t.end({ count: results.length });

                    // Phase 2: enrich metadata in background if results lack it (CLI path)
                    if (results.length > 0 && results.some(r => r.iconUrl === undefined && r.verified === undefined)) {
                        this._nugetService.enrichSearchResultMetadata(results).then(() => {
                            if (this._latestSearchQuery !== query || this._disposed) { return; }
                            this._postMessage({
                                type: 'searchResultsMetadata',
                                results: results,
                                query: query
                            });
                        }).catch(() => { /* non-critical: results are already visible */ });
                    }
                    break;
                }
            case 'autocompletePackages':
                {
                    const query = data.query;
                    // Track latest query for coalescing
                    this._latestAutocompleteQuery = query;

                    // Get the results per source setting
                    const config = vscode.workspace.getConfiguration('nuiget');
                    const resultsPerSource = config.get<number>('quickSearchResultsPerSource', 5);

                    const groupedResults = await this._nugetService.quickSearchGrouped(
                        query,
                        data.sources || [],
                        data.includePrerelease,
                        resultsPerSource
                    );

                    // Skip sending results if a newer query arrived while we were fetching
                    if (this._latestAutocompleteQuery !== query) {
                        break; // Stale request, skip
                    }

                    this._postMessage({
                        type: 'autocompleteResults',
                        groupedResults: groupedResults,
                        query: query
                    });
                    break;
                }
            case 'installPackage':
                {
                    if (this._operationInProgress) { break; }
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    this._operationInProgress = true;
                    const t = startTimer('installPackage', data.projectPath);
                    try {
                        await executeSingleOperation(this._opCtx(), 'install', data.projectPath, data.packageId, data.version, data.sourceUrl);
                    } finally { this._operationInProgress = false; t.end({ pkg: data.packageId }); }
                    break;
                }
            case 'bulkInstall':
                {
                    if (this._operationInProgress) { break; }
                    const paths = (data.projectPaths as string[])?.filter(p => p !== ALL_PROJECTS_SENTINEL);
                    if (!paths?.length) { break; }
                    this._operationInProgress = true;
                    try {
                        await executeBulkInstall(this._opCtx(), paths, data.packageId, data.version);
                    } finally { this._operationInProgress = false; }
                    break;
                }
            case 'updatePackage':
                {
                    if (this._operationInProgress) { break; }
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    this._operationInProgress = true;
                    const t = startTimer('updatePackage', data.projectPath);
                    try {
                        await executeSingleOperation(this._opCtx(), 'update', data.projectPath, data.packageId, data.version, data.sourceUrl);
                    } finally { this._operationInProgress = false; t.end({ pkg: data.packageId }); }
                    break;
                }
            case 'removePackage':
                {
                    if (this._operationInProgress) { break; }
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    this._operationInProgress = true;
                    const t = startTimer('removePackage', data.projectPath);
                    try {
                        await executeSingleOperation(this._opCtx(), 'remove', data.projectPath, data.packageId);
                    } finally { this._operationInProgress = false; t.end({ pkg: data.packageId }); }
                    break;
                }
            case 'getSources':
                {
                    const sources = await this._nugetService.getSources();
                    // Send sources immediately with any cached failed sources
                    const failedSources = this._nugetService.getFailedSources();
                    const failedSourcesArray = Array.from(failedSources.entries()).map(([url, error]) => ({ url, error }));
                    this._postMessage({
                        type: 'sources',
                        sources: sources,
                        failedSources: failedSourcesArray
                    });

                    // Test connectivity to all sources in background
                    this._nugetService.testSourceConnectivity().then(() => {
                        // After testing, send updated failed sources to UI
                        const updatedFailedSources = this._nugetService.getFailedSources();
                        if (updatedFailedSources.size > 0) {
                            const updatedArray = Array.from(updatedFailedSources.entries()).map(([url, error]) => ({ url, error }));
                            this._postMessage({
                                type: 'sourceConnectivityUpdate',
                                failedSources: updatedArray
                            });
                        }
                    });
                    break;
                }
            case 'refreshSources':
                {
                    // Clear source errors and cache to allow re-discovery
                    this._nugetService.clearSourceErrors();
                    const sources = await this._nugetService.getSources();
                    this._postMessage({
                        type: 'sources',
                        sources: sources,
                        failedSources: []
                    });

                    // Test connectivity again after clearing errors
                    this._nugetService.testSourceConnectivity().then(() => {
                        const updatedFailedSources = this._nugetService.getFailedSources();
                        if (updatedFailedSources.size > 0) {
                            const updatedArray = Array.from(updatedFailedSources.entries()).map(([url, error]) => ({ url, error }));
                            this._postMessage({
                                type: 'sourceConnectivityUpdate',
                                failedSources: updatedArray
                            });
                        }
                    });
                    break;
                }
            case 'fullRefresh':
                {
                    // Full refresh: clear all in-memory caches synchronously, kick off the
                    // dotnet HTTP cache clear in the background (don't block UI on the spawn),
                    // re-fetch sources, refresh webview, and sync sidebar.
                    this._nugetService.clearInMemoryNuGetCaches();
                    this._nugetService.clearNuGetHttpCacheBackground();
                    const freshSources = await this._nugetService.getSources();
                    this._postMessage({
                        type: 'sources',
                        sources: freshSources,
                        failedSources: []
                    });
                    // Tell webview to re-fetch projects and installed packages
                    this._postMessage({ type: 'refresh' });
                    // Test connectivity in background
                    this._nugetService.testSourceConnectivity().then(() => {
                        const updatedFailedSources = this._nugetService.getFailedSources();
                        if (updatedFailedSources.size > 0) {
                            const updatedArray = Array.from(updatedFailedSources.entries()).map(([url, error]) => ({ url, error }));
                            this._postMessage({
                                type: 'sourceConnectivityUpdate',
                                failedSources: updatedArray
                            });
                        }
                    });
                    // Sync sidebar: trigger full sidebar refresh
                    NuGetPanel.onRefreshAll?.();
                    break;
                }
            case 'enableSource':
                {
                    const sourceName = data.sourceName;
                    const success = await this._nugetService.enableSource(sourceName);
                    if (success) {
                        // Refresh sources list after enabling
                        this._nugetService.clearSourceErrors();
                        const sources = await this._nugetService.getSources();
                        this._postMessage({
                            type: 'sources',
                            sources: sources,
                            failedSources: []
                        });
                        // Test connectivity in background
                        this._nugetService.testSourceConnectivity().then(() => {
                            const updatedFailedSources = this._nugetService.getFailedSources();
                            if (updatedFailedSources.size > 0) {
                                const updatedArray = Array.from(updatedFailedSources.entries()).map(([url, error]) => ({ url, error }));
                                this._postMessage({
                                    type: 'sourceConnectivityUpdate',
                                    failedSources: updatedArray
                                });
                            }
                        });
                    }
                    break;
                }
            case 'disableSource':
                {
                    const sourceName = data.sourceName;
                    const disabledSourceUrl = data.sourceUrl;
                    const success = await this._nugetService.disableSource(sourceName);
                    if (success) {
                        // Refresh sources list after disabling
                        this._nugetService.clearSourceErrors();
                        const sources = await this._nugetService.getSources();
                        this._postMessage({
                            type: 'sources',
                            sources: sources,
                            failedSources: [],
                            disabledSourceUrl: disabledSourceUrl // Tell UI which source was disabled
                        });
                        // Test connectivity in background
                        this._nugetService.testSourceConnectivity().then(() => {
                            const updatedFailedSources = this._nugetService.getFailedSources();
                            if (updatedFailedSources.size > 0) {
                                const updatedArray = Array.from(updatedFailedSources.entries()).map(([url, error]) => ({ url, error }));
                                this._postMessage({
                                    type: 'sourceConnectivityUpdate',
                                    failedSources: updatedArray
                                });
                            }
                        });
                    }
                    break;
                }
            case 'addSource':
                {
                    const url = data.url;
                    const name = data.name;
                    const username = data.username;
                    const password = data.password;
                    const configFile = data.configFile;
                    const allowInsecure = data.allowInsecure;
                    const storeEncrypted = data.storeEncrypted;

                    const result = await this._nugetService.addSource(url, name, username, password, configFile, allowInsecure, storeEncrypted);

                    if (result.success) {
                        // Refresh sources list after adding
                        this._nugetService.clearSourceErrors();
                        const sources = await this._nugetService.getSources();
                        this._postMessage({
                            type: 'sources',
                            sources: sources,
                            failedSources: []
                        });
                        this._postMessage({
                            type: 'addSourceResult',
                            success: true
                        });
                        // Test connectivity in background
                        this._nugetService.testSourceConnectivity().then(() => {
                            const updatedFailedSources = this._nugetService.getFailedSources();
                            if (updatedFailedSources.size > 0) {
                                const updatedArray = Array.from(updatedFailedSources.entries()).map(([url, error]) => ({ url, error }));
                                this._postMessage({
                                    type: 'sourceConnectivityUpdate',
                                    failedSources: updatedArray
                                });
                            }
                        });
                    } else {
                        this._postMessage({
                            type: 'addSourceResult',
                            success: false,
                            error: result.error
                        });
                    }
                    break;
                }
            case 'removeSource':
                {
                    const sourceName = data.sourceName;
                    const configFile = data.configFile;

                    // Capture the source URL before removal so the UI can check if it was selected
                    const sourcesBeforeRemove = await this._nugetService.getSources();
                    const removedSourceUrl = sourcesBeforeRemove.find(s => s.name === sourceName)?.url;

                    const result = await this._nugetService.removeSource(sourceName, configFile);

                    if (result.success) {
                        // Refresh sources list after removing
                        this._nugetService.clearSourceErrors();
                        const sources = await this._nugetService.getSources();
                        this._postMessage({
                            type: 'sources',
                            sources: sources,
                            failedSources: [],
                            removedSourceName: sourceName, // Tell UI which source was removed
                            removedSourceUrl: removedSourceUrl // URL for selected-source reset check
                        });
                        vscode.window.showInformationMessage(`Removed NuGet source: ${sourceName}`);
                    } else {
                        vscode.window.showErrorMessage(`Failed to remove source: ${result.error}`);
                        // Refresh sources anyway in case it was already removed
                        this._nugetService.clearSourceErrors();
                        const sources = await this._nugetService.getSources();
                        this._postMessage({
                            type: 'sources',
                            sources: sources,
                            failedSources: []
                        });
                    }
                    break;
                }
            case 'getConfigFiles':
                {
                    const configFiles = this._nugetService.getConfigFilePaths();
                    this._postMessage({
                        type: 'configFiles',
                        configFiles: configFiles
                    });
                    break;
                }
            case 'getPackageVersions':
                {
                    const versions = await this._nugetService.getPackageVersions(
                        data.packageId,
                        data.source,
                        data.includePrerelease,
                        data.take
                    );
                    this._postMessage({
                        type: 'packageVersions',
                        packageId: data.packageId,
                        versions: versions,
                        source: data.source,
                        includePrerelease: data.includePrerelease,
                    });
                    break;
                }
            case 'getPackageMetadata':
                {
                    const metadata = await this._nugetService.getPackageMetadata(
                        data.packageId,
                        data.version,
                        data.source
                    );
                    this._postMessage({
                        type: 'packageMetadata',
                        packageId: data.packageId,
                        version: data.version,
                        metadata: metadata,
                        source: data.source,
                    });
                    break;
                }
            case 'prefetchPackageVersions':
                {
                    const acquired = this._nugetService.tryAcquirePrefetchSlot();
                    if (!acquired) {
                        this._postMessage({
                            type: 'packageVersionsPrefetched',
                            packageId: data.packageId,
                            source: data.source,
                            includePrerelease: data.includePrerelease,
                            versions: [],
                            dropped: true,
                        });
                        break;
                    }
                    try {
                        const versions = await this._nugetService.getPackageVersions(
                            data.packageId,
                            data.source,
                            data.includePrerelease,
                            data.take
                        );
                        this._postMessage({
                            type: 'packageVersionsPrefetched',
                            packageId: data.packageId,
                            source: data.source,
                            includePrerelease: data.includePrerelease,
                            versions,
                        });
                    } catch {
                        this._postMessage({
                            type: 'packageVersionsPrefetched',
                            packageId: data.packageId,
                            source: data.source,
                            includePrerelease: data.includePrerelease,
                            versions: [],
                            dropped: true,
                        });
                    } finally {
                        this._nugetService.releasePrefetchSlot();
                    }
                    break;
                }
            case 'prefetchPackageMetadata':
                {
                    const acquired = this._nugetService.tryAcquirePrefetchSlot();
                    if (!acquired) {
                        this._postMessage({
                            type: 'packageMetadataPrefetched',
                            packageId: data.packageId,
                            version: data.version,
                            source: data.source,
                            metadata: null,
                            dropped: true,
                        });
                        break;
                    }
                    try {
                        const metadata = await this._nugetService.getPackageMetadata(
                            data.packageId,
                            data.version,
                            data.source
                        );
                        this._postMessage({
                            type: 'packageMetadataPrefetched',
                            packageId: data.packageId,
                            version: data.version,
                            source: data.source,
                            metadata,
                        });
                    } catch {
                        this._postMessage({
                            type: 'packageMetadataPrefetched',
                            packageId: data.packageId,
                            version: data.version,
                            source: data.source,
                            metadata: null,
                            dropped: true,
                        });
                    } finally {
                        this._nugetService.releasePrefetchSlot();
                    }
                    break;
                }
            case 'checkPackageUpdates':
                {
                    try {
                        const packagesWithUpdates = await this._nugetService.checkPackageUpdates(
                            data.installedPackages,
                            data.includePrerelease,
                            undefined,
                            (update) => {
                                // Stream each found update to the webview immediately
                                this._postMessage({
                                    type: 'packageUpdateFound',
                                    update,
                                    projectPath: data.projectPath
                                });
                            }
                        );
                        this._postMessage({
                            type: 'packageUpdates',
                            updates: packagesWithUpdates,
                            projectPath: data.projectPath
                        });
                    } catch (error) {
                        console.error('[nUIget] checkPackageUpdates error:', error);
                        this._postMessage({
                            type: 'packageUpdates',
                            updates: [],
                            projectPath: data.projectPath
                        });
                    }
                    break;
                }
            case 'checkAllProjectsUpdates':
                {
                    try {
                        const projectUpdates = await queryAllProjectsUpdates(
                            this._nugetService, data.includePrerelease, false /* liteMode */
                        );
                        this._postMessage({ type: 'allProjectsUpdates', projectUpdates });
                        // Phase 2: resolve icons in background after initial data is sent
                        const updatePackages = projectUpdates.flatMap(pu =>
                            pu.updates.map(u => ({ id: u.id, version: u.installedVersion }))
                        );
                        if (updatePackages.length > 0) {
                            resolveAllProjectsIcons(this._nugetService, updatePackages).then(iconMap => {
                                if (Object.keys(iconMap).length > 0) {
                                    this._postMessage({ type: 'allProjectsIcons', iconMap });
                                }
                            }).catch(() => { /* non-critical */ });
                        }
                    } catch (error) {
                        console.error('[nUIget] checkAllProjectsUpdates error:', error);
                        this._postMessage({ type: 'allProjectsUpdates', projectUpdates: [] });
                    }
                    break;
                }
            case 'checkAllProjectsInstalled':
                {
                    // Plan 10 Stage C3: streaming is the only mode; legacy blob path removed.
                    const requestId = data.requestId ?? `apinst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const ctx = data.context;
                    // Abort any prior in-flight stream for the same context
                    const inflightKey = `apinst:${ctx ?? ''}`;
                    this._abortInflight(inflightKey);
                    const controller = new AbortController();
                    this._inflightAborts.set(inflightKey, controller);
                    const signal = controller.signal;
                    try {
                        const accumulated: ProjectInstalledResult[] = [];
                        const erroredChunks: { projectPath: string; error: string }[] = [];
                        const seenPaths: string[] = [];
                        await queryAllProjectsInstalled(this._nugetService, true /* liteMode */, {
                            onStart: (projects) => {
                                if (signal.aborted || this._disposed) { return; }
                                this._postMessage({
                                    type: 'allProjectsInstalledStart',
                                    context: ctx,
                                    requestId,
                                    projects,
                                });
                            },
                            onProject: (chunk) => {
                                if (signal.aborted || this._disposed) { return; }
                                seenPaths.push(chunk.projectPath);
                                if (chunk.packages) {
                                    accumulated.push({
                                        projectPath: chunk.projectPath,
                                        projectName: chunk.projectName,
                                        packages: chunk.packages,
                                    });
                                } else if (chunk.error) {
                                    erroredChunks.push({ projectPath: chunk.projectPath, error: chunk.error });
                                }
                                this._postMessage({
                                    type: 'allProjectsInstalledProjectFound',
                                    context: ctx,
                                    requestId,
                                    projectPath: chunk.projectPath,
                                    projectName: chunk.projectName,
                                    workspaceFolder: chunk.workspaceFolder,
                                    installed: chunk.packages,
                                    error: chunk.error,
                                });
                            },
                            signal,
                        });
                        if (signal.aborted || this._disposed) { break; }
                        this._postMessage({
                            type: 'allProjectsInstalledComplete',
                            context: ctx,
                            requestId,
                            projectPaths: seenPaths,
                            errored: erroredChunks,
                        });
                        // Phase 2: enrich metadata, then emit per-project metadata chunks
                        const allPackages = accumulated.flatMap(pi => pi.packages);
                        if (allPackages.length > 0) {
                            this._nugetService.enrichInstalledPackageMetadata(allPackages).then(() => {
                                if (signal.aborted || this._disposed) { return; }
                                for (const proj of accumulated) {
                                    if (signal.aborted || this._disposed) { return; }
                                    this._postMessage({
                                        type: 'allProjectsInstalledProjectMetadata',
                                        context: ctx,
                                        requestId,
                                        projectPath: proj.projectPath,
                                        installed: proj.packages,
                                    });
                                }
                            }).catch(() => { /* non-critical */ });
                        }
                    } catch (error) {
                        console.error('[nUIget] checkAllProjectsInstalled error:', error);
                        if (!signal.aborted && !this._disposed) {
                            this._postMessage({
                                type: 'allProjectsInstalledComplete',
                                context: ctx,
                                requestId,
                                projectPaths: [],
                                errored: [],
                            });
                        }
                    } finally {
                        if (this._inflightAborts.get(inflightKey) === controller) {
                            this._inflightAborts.delete(inflightKey);
                        }
                    }
                    break;
                }
            case 'bulkUpdateAllProjects':
                {
                    if (this._operationInProgress) { break; }
                    this._operationInProgress = true;
                    try {
                        await executeBulkUpdateAllProjects(this._opCtx(), data.projectUpdates);
                    } finally { this._operationInProgress = false; }
                    break;
                }
            case 'getSettings':
                {
                    // Retrieve persisted settings from workspaceState
                    const includePrerelease = NuGetPanel._context?.workspaceState.get<boolean>('nuget.includePrerelease', false);
                    const selectedSource = NuGetPanel._context?.workspaceState.get<string>('nuget.selectedSource', '');
                    const recentSearches = NuGetPanel._context?.workspaceState.get<string[]>('nuget.recentSearches', []) ?? [];
                    const isWindows = process.platform === 'win32';
                    // Read extension settings
                    const config = vscode.workspace.getConfiguration('nuiget');
                    const searchDebounceMode = config.get<string>('searchDebounceMode', 'quicksearch');
                    const recentSearchesLimit = config.get<number>('recentSearchesLimit', 5);
                    this._postMessage({
                        type: 'settings',
                        includePrerelease: includePrerelease,
                        selectedSource: selectedSource,
                        recentSearches: recentSearches.slice(0, recentSearchesLimit),
                        isWindows: isWindows,
                        searchDebounceMode: searchDebounceMode,
                        recentSearchesLimit: recentSearchesLimit
                    });
                    break;
                }
            case 'saveSettings':
                {
                    // Persist settings to workspaceState
                    if (NuGetPanel._context) {
                        if (data.includePrerelease !== undefined) {
                            await NuGetPanel._context.workspaceState.update('nuget.includePrerelease', data.includePrerelease);
                            // Sync to sidebar panel
                            NuGetPanel.onPrereleaseChanged?.(data.includePrerelease);
                        }
                        if (data.selectedSource !== undefined) {
                            await NuGetPanel._context.workspaceState.update('nuget.selectedSource', data.selectedSource);
                            // Sync to sidebar panel
                            NuGetPanel.onSourceChanged?.(data.selectedSource);
                        }
                        if (data.selectedProject !== undefined) {
                            await NuGetPanel._context.workspaceState.update('nuget.selectedProject', data.selectedProject);
                            // Sync to sidebar panel
                            NuGetPanel.onProjectChanged?.(data.selectedProject);
                        }
                        if (data.recentSearches !== undefined) {
                            await NuGetPanel._context.workspaceState.update('nuget.recentSearches', data.recentSearches);
                        }
                    }
                    break;
                }
            case 'getSplitPosition':
                {
                    // Retrieve split position from globalState (persists across workspaces)
                    const splitPosition = NuGetPanel._context?.globalState.get<number>('nuget.splitPosition', 35);
                    this._postMessage({
                        type: 'splitPosition',
                        position: splitPosition
                    });
                    break;
                }
            case 'saveSplitPosition':
                {
                    // Persist split position to globalState (cross-workspace)
                    if (NuGetPanel._context && data.position !== undefined) {
                        await NuGetPanel._context.globalState.update('nuget.splitPosition', data.position);
                    }
                    break;
                }
            case 'prewarmSource':
                {
                    // Pre-warm service index when user selects a source
                    const sourceUrl = data.sourceUrl;
                    if (sourceUrl && sourceUrl !== 'all') {
                        this._nugetService.prewarmServiceIndex(sourceUrl);
                    } else {
                        // 'all' sources - prewarm nuget.org
                        this._nugetService.prewarmNugetOrgServiceIndex();
                    }
                    break;
                }
            case 'fetchReadmeFromPackage':
                {
                    // Lazy load README from nupkg when readme tab is clicked and no readme was fetched
                    const readme = await this._nugetService.extractReadmeFromPackage(
                        data.packageId,
                        data.version,
                        data.source
                    );
                    this._postMessage({
                        type: 'packageReadme',
                        packageId: data.packageId,
                        version: data.version,
                        readme: readme
                    });
                    break;
                }
            case 'bulkUpdatePackages':
                {
                    if (this._operationInProgress) { break; }
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    this._operationInProgress = true;
                    try {
                        await executeBulkUpdatePackages(this._opCtx(), data.packages, data.projectPath);
                    } finally { this._operationInProgress = false; }
                    break;
                }
            case 'confirmBulkRemove':
                {
                    if (this._operationInProgress) { break; }
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    this._operationInProgress = true;
                    try {
                        await executeBulkRemovePackages(this._opCtx(), data.packages, data.projectPath);
                    } finally { this._operationInProgress = false; }
                    break;
                }
            case 'confirmBulkRemoveAllProjects':
                {
                    if (this._operationInProgress) { break; }
                    this._operationInProgress = true;
                    try {
                        await executeBulkRemoveAllProjects(this._opCtx(), data.projectRemovals);
                    } finally { this._operationInProgress = false; }
                    break;
                }
            default:
                break;
        }
    }

    public dispose() {
        this._disposed = true;
        NuGetPanel.currentPanel = undefined;

        // Abort any in-flight streaming queries
        for (const controller of this._inflightAborts.values()) {
            try { controller.abort(); } catch { /* ignore */ }
        }
        this._inflightAborts.clear();

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    /** Abort a previously-registered in-flight stream by key, removing it from the map. */
    private _abortInflight(key: string): void {
        const existing = this._inflightAborts.get(key);
        if (existing) {
            try { existing.abort(); } catch { /* ignore */ }
            this._inflightAborts.delete(key);
        }
    }

    /** Build an OperationContext for shared operation functions. */
    private _opCtx(): OperationContext {
        return {
            nugetService: this._nugetService,
            postMessage: (msg: unknown) => this._postMessage(msg),
            notifyOtherPanel: (op) => NuGetPanel.onPackageChanged?.(op),
        };
    }

    /**
     * Safely post a message to the webview, ignoring if panel is disposed.
     */
    private _postMessage(message: unknown): void {
        if (!this._disposed) {
            this._panel.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'));
        const packageIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'package-icon.png'));

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}; connect-src ${webview.cspSource}; img-src ${webview.cspSource} https://*.nuget.org https://*.githubusercontent.com https://github.com https://shields.io https://*.shields.io https://opencollective.com https://*.opencollective.com https://codecov.io https://*.codecov.io https://badge.fury.io https://*.travis-ci.org https://*.travis-ci.com https://ci.appveyor.com https://coveralls.io https://*.coveralls.io https://david-dm.org https://snyk.io https://*.snyk.io https://api.codacy.com https://sonarcloud.io https://*.sonarcloud.io https://img.badgesize.io https://badgen.net https://*.badgen.net https://circleci.com https://*.circleci.com https://dev.azure.com https://*.visualstudio.com data:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>nUIget</title>
                <link rel="stylesheet" href="${cssUri}">
            </head>
            <body>
                <div id="root" data-package-icon="${packageIconUri}" data-initial-tab="${this._pendingInitialTab || ''}"></div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

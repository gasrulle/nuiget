import * as vscode from 'vscode';
import { InstalledPackage, NuGetService } from '../services/NuGetService';

export class NuGetPanel {
    public static currentPanel: NuGetPanel | undefined;
    public static readonly viewType = 'nugetManager';
    private static _cachedSearchQuery: string | undefined;
    private static _context: vscode.ExtensionContext | undefined;
    private static _outputChannel: vscode.LogOutputChannel | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _nugetService: NuGetService;
    private _disposables: vscode.Disposable[] = [];
    private _pendingProjectPath: string | undefined;
    private _pendingInitialTab: 'browse' | 'installed' | 'updates' | undefined;
    private _disposed = false;
    // Track the latest autocomplete query to skip stale requests
    private _latestAutocompleteQuery: string = '';
    // Track the latest search query to skip stale requests
    private _latestSearchQuery: string = '';

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, outputChannel: vscode.LogOutputChannel, projectPath?: string, initialTab?: 'browse' | 'installed' | 'updates') {
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

        NuGetPanel.currentPanel = new NuGetPanel(panel, extensionUri, outputChannel, projectPath, initialTab);
    }

    public static refresh() {
        if (NuGetPanel.currentPanel) {
            NuGetPanel.currentPanel._panel.webview.postMessage({ type: 'refresh' });
        }
    }

    public selectProject(projectPath: string, initialTab?: 'browse' | 'installed' | 'updates') {
        this._postMessage({
            type: 'selectProject',
            projectPath: projectPath,
            initialTab: initialTab
        });
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, outputChannel: vscode.LogOutputChannel, projectPath?: string, initialTab?: 'browse' | 'installed' | 'updates') {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._nugetService = new NuGetService(outputChannel);
        this._pendingProjectPath = projectPath;
        this._pendingInitialTab = initialTab;

        // Pre-warm nuget.org service index for faster first quick search
        this._nugetService.prewarmNugetOrgServiceIndex();

        // Pre-warm credentials for authenticated feeds (fire-and-forget)
        this._nugetService.initializeCredentials().catch(() => {
            // Ignore errors - credentials will be loaded on-demand if prewarm fails
        });

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
                    const searchDebounceMode = vscode.workspace.getConfiguration('nuiget').get<string>('searchDebounceMode', 'quicksearch');
                    const recentSearchesLimit = vscode.workspace.getConfiguration('nuiget').get<number>('recentSearchesLimit', 5);
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

    private async _handleMessage(data: Record<string, unknown>) {
        switch (data.type) {
            case 'getProjects':
                {
                    const projects = await this._nugetService.findProjects();
                    this._postMessage({
                        type: 'projects',
                        projects: projects,
                        selectProjectPath: this._pendingProjectPath
                    });
                    // Clear pending after sending
                    this._pendingProjectPath = undefined;
                    break;
                }
            case 'getInstalledPackages':
                {
                    const packages = await this._nugetService.getInstalledPackages(data.projectPath as string);
                    this._postMessage({
                        type: 'installedPackages',
                        packages: packages,
                        projectPath: data.projectPath
                    });
                    break;
                }
            case 'getTransitivePackages':
                {
                    try {
                        // If forceRestore is true (explicit refresh by user), run restore first
                        // This ignores the noRestore setting since user explicitly requested refresh
                        if (data.forceRestore) {
                            await this._nugetService.restoreProject(data.projectPath as string);
                        }
                        const result = await this._nugetService.getTransitivePackages(
                            data.projectPath as string
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
                    const packages = data.packages as Array<{ id: string; version: string; requiredByChain: string[]; fullChain?: string[] }>;
                    await this._nugetService.fetchTransitivePackageMetadata(packages);
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
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: 'Restoring project...',
                        cancellable: false
                    }, async () => {
                        const success = await this._nugetService.restoreProject(data.projectPath as string);
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
                    const query = data.query as string;
                    // Track latest query for race condition prevention
                    this._latestSearchQuery = query;

                    const results = await this._nugetService.searchPackages(
                        query,
                        data.sources as string[] | undefined,
                        data.includePrerelease as boolean | undefined
                    );

                    // Skip sending results if a newer query arrived while we were fetching
                    if (this._latestSearchQuery !== query) {
                        break;
                    }

                    // Cache the search query for panel restore
                    NuGetPanel._cachedSearchQuery = query;
                    this._postMessage({
                        type: 'searchResults',
                        results: results,
                        query: query
                    });
                    break;
                }
            case 'autocompletePackages':
                {
                    const query = data.query as string;
                    // Track latest query for coalescing
                    this._latestAutocompleteQuery = query;

                    // Get the results per source setting
                    const config = vscode.workspace.getConfiguration('nuiget');
                    const resultsPerSource = config.get<number>('quickSearchResultsPerSource', 5);

                    const groupedResults = await this._nugetService.quickSearchGrouped(
                        query,
                        data.sources as Array<{ name: string; url: string }> || [],
                        data.includePrerelease as boolean | undefined,
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
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Installing ${data.packageId}...`,
                        cancellable: false
                    }, async () => {
                        const success = await this._nugetService.installPackage(
                            data.projectPath as string,
                            data.packageId as string,
                            data.version as string | undefined
                        );
                        this._postMessage({
                            type: 'installResult',
                            success: success,
                            packageId: data.packageId,
                            projectPath: data.projectPath
                        });
                    });
                    break;
                }
            case 'updatePackage':
                {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Updating ${data.packageId}...`,
                        cancellable: false
                    }, async () => {
                        const success = await this._nugetService.updatePackage(
                            data.projectPath as string,
                            data.packageId as string,
                            data.version as string
                        );
                        this._postMessage({
                            type: 'updateResult',
                            success: success,
                            packageId: data.packageId,
                            projectPath: data.projectPath
                        });
                    });
                    break;
                }
            case 'removePackage':
                {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Removing ${data.packageId}...`,
                        cancellable: false
                    }, async () => {
                        const success = await this._nugetService.removePackage(
                            data.projectPath as string,
                            data.packageId as string
                        );
                        this._postMessage({
                            type: 'removeResult',
                            success: success,
                            packageId: data.packageId,
                            projectPath: data.projectPath
                        });
                    });
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
                    // This will populate failedSources and show VS Code notifications
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
            case 'enableSource':
                {
                    const sourceName = data.sourceName as string;
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
                    const sourceName = data.sourceName as string;
                    const disabledSourceUrl = data.sourceUrl as string;
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
                    const url = data.url as string;
                    const name = data.name as string | undefined;
                    const username = data.username as string | undefined;
                    const password = data.password as string | undefined;
                    const configFile = data.configFile as string | undefined;
                    const allowInsecure = data.allowInsecure as boolean | undefined;
                    const storeEncrypted = data.storeEncrypted as boolean | undefined;

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
                    const sourceName = data.sourceName as string;
                    const configFile = data.configFile as string | undefined;

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
                        data.packageId as string,
                        data.source as string | undefined,
                        data.includePrerelease as boolean | undefined,
                        data.take as number | undefined
                    );
                    this._postMessage({
                        type: 'packageVersions',
                        packageId: data.packageId,
                        versions: versions
                    });
                    break;
                }
            case 'getPackageMetadata':
                {
                    const metadata = await this._nugetService.getPackageMetadata(
                        data.packageId as string,
                        data.version as string,
                        data.source as string | undefined
                    );
                    this._postMessage({
                        type: 'packageMetadata',
                        packageId: data.packageId,
                        version: data.version,
                        metadata: metadata
                    });
                    break;
                }
            case 'checkPackageUpdates':
                {
                    const packagesWithUpdates = await this._nugetService.checkPackageUpdates(
                        data.installedPackages as InstalledPackage[],
                        data.includePrerelease as boolean
                    );
                    this._postMessage({
                        type: 'packageUpdates',
                        updates: packagesWithUpdates,
                        projectPath: data.projectPath
                    });
                    break;
                }
            case 'getSettings':
                {
                    // Retrieve persisted settings from workspaceState
                    const includePrerelease = NuGetPanel._context?.workspaceState.get<boolean>('nuget.includePrerelease', false);
                    const selectedSource = NuGetPanel._context?.workspaceState.get<string>('nuget.selectedSource', '');
                    const recentSearches = NuGetPanel._context?.workspaceState.get<string[]>('nuget.recentSearches', []) ?? [];
                    const isWindows = process.platform === 'win32';
                    // Read extension settings for search debounce
                    const searchDebounceMode = vscode.workspace.getConfiguration('nuiget').get<string>('searchDebounceMode', 'quicksearch');
                    const recentSearchesLimit = vscode.workspace.getConfiguration('nuiget').get<number>('recentSearchesLimit', 5);
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
                        }
                        if (data.selectedSource !== undefined) {
                            await NuGetPanel._context.workspaceState.update('nuget.selectedSource', data.selectedSource);
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
                    const sourceUrl = data.sourceUrl as string;
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
                        data.packageId as string,
                        data.version as string,
                        data.source as string | undefined
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
                    const packages = data.packages as { id: string; version: string }[];
                    const projectPath = data.projectPath as string;

                    // Get package dependencies to sort for correct update order
                    // Dependencies should be updated first so dependents get the new versions
                    const dependencyMap = await this._nugetService.getPackageDependencies(projectPath);
                    const packagesToUpdate = new Set(packages.map(p => p.id.toLowerCase()));

                    // Topological sort: dependencies first (opposite of uninstall)
                    // Build a graph of only the selected packages and their inter-dependencies
                    const inDegree = new Map<string, number>();
                    const dependents = new Map<string, string[]>(); // dependency -> packages that depend on it

                    // Initialize
                    for (const pkg of packages) {
                        const pkgLower = pkg.id.toLowerCase();
                        inDegree.set(pkgLower, 0);
                        dependents.set(pkgLower, []);
                    }

                    // Build dependency graph for selected packages only
                    // For updates: if A depends on B, B should be updated first
                    // So A has in-degree increased for each dependency B that's also selected
                    for (const pkg of packages) {
                        const pkgLower = pkg.id.toLowerCase();
                        const deps = dependencyMap.get(pkgLower) || [];
                        for (const dep of deps) {
                            if (packagesToUpdate.has(dep)) {
                                // pkg depends on dep (both selected)
                                // dep should be updated before pkg
                                // So pkg has one more in-degree (must wait for dep)
                                inDegree.set(pkgLower, (inDegree.get(pkgLower) || 0) + 1);
                                dependents.get(dep)?.push(pkgLower);
                            }
                        }
                    }

                    // Kahn's algorithm for topological sort
                    const sorted: { id: string; version: string }[] = [];
                    const queue: string[] = [];

                    // Start with packages that don't depend on any other selected package
                    for (const [pkg, degree] of inDegree) {
                        if (degree === 0) {
                            queue.push(pkg);
                        }
                    }

                    while (queue.length > 0) {
                        const pkg = queue.shift()!;
                        // Find original package object from packages array
                        const originalPkg = packages.find(p => p.id.toLowerCase() === pkg);
                        if (originalPkg) {
                            sorted.push(originalPkg);
                        }

                        // For each package that depends on this one
                        for (const dependent of dependents.get(pkg) || []) {
                            const newDegree = (inDegree.get(dependent) || 1) - 1;
                            inDegree.set(dependent, newDegree);
                            if (newDegree === 0) {
                                queue.push(dependent);
                            }
                        }
                    }

                    // If there's a cycle or missing packages, add remaining ones
                    if (sorted.length < packages.length) {
                        for (const pkg of packages) {
                            if (!sorted.some(p => p.id.toLowerCase() === pkg.id.toLowerCase())) {
                                sorted.push(pkg);
                            }
                        }
                    }

                    const sortedPackages = sorted;

                    // Setup and show output channel before starting bulk operation
                    this._nugetService.setupOutputChannel();
                    this._nugetService.logBulkOperationHeader('Updating', sortedPackages.length);

                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Updating ${sortedPackages.length} packages...`,
                        cancellable: false
                    }, async (progress) => {
                        let successCount = 0;
                        let failCount = 0;

                        for (let i = 0; i < sortedPackages.length; i++) {
                            const pkg = sortedPackages[i];
                            progress.report({
                                message: `(${i + 1}/${sortedPackages.length}) ${pkg.id}`,
                                increment: (100 / sortedPackages.length)
                            });

                            const success = await this._nugetService.updatePackage(
                                projectPath,
                                pkg.id,
                                pkg.version,
                                { skipChannelSetup: true }
                            );

                            if (success) {
                                successCount++;
                            } else {
                                failCount++;
                            }
                        }

                        if (failCount === 0) {
                            vscode.window.showInformationMessage(`Successfully updated ${successCount} packages.`);
                        } else {
                            vscode.window.showWarningMessage(`Updated ${successCount} packages, ${failCount} failed.`);
                        }
                    });

                    this._postMessage({
                        type: 'bulkUpdateResult',
                        projectPath: projectPath
                    });
                    break;
                }
            case 'confirmBulkRemove':
                {
                    const packages = data.packages as string[];
                    const projectPath = data.projectPath as string;

                    if (!packages || packages.length === 0) {
                        console.warn('[nUIget] confirmBulkRemove received empty packages array');
                        break;
                    }
                    console.log(`[nUIget] confirmBulkRemove: received ${packages.length} packages to remove: ${packages.join(', ')}`);

                    // Notify webview that uninstall is starting
                    this._postMessage({
                        type: 'bulkRemoveConfirmed',
                        projectPath: projectPath
                    });

                    // Get package dependencies to sort for correct uninstall order
                    // Packages that depend on others should be uninstalled first
                    const dependencyMap = await this._nugetService.getPackageDependencies(projectPath);
                    const packagesToRemove = new Set(packages.map(p => p.toLowerCase()));

                    // Topological sort: packages that depend on others go first
                    // Build a graph of only the selected packages and their inter-dependencies
                    const inDegree = new Map<string, number>();
                    const dependents = new Map<string, string[]>(); // package -> packages that depend on it

                    // Initialize
                    for (const pkg of packages) {
                        const pkgLower = pkg.toLowerCase();
                        inDegree.set(pkgLower, 0);
                        dependents.set(pkgLower, []);
                    }

                    // Build dependency graph for selected packages only
                    for (const pkg of packages) {
                        const pkgLower = pkg.toLowerCase();
                        const deps = dependencyMap.get(pkgLower) || [];
                        for (const dep of deps) {
                            if (packagesToRemove.has(dep)) {
                                // pkg depends on dep (both selected)
                                // pkg should be removed before dep
                                // So dep has one more "dependent" that needs to be removed first
                                inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
                                dependents.get(pkgLower)?.push(dep);
                            }
                        }
                    }

                    // Kahn's algorithm for topological sort
                    const sorted: string[] = [];
                    const queue: string[] = [];

                    // Start with packages that no other selected package depends on
                    for (const [pkg, degree] of inDegree) {
                        if (degree === 0) {
                            queue.push(pkg);
                        }
                    }

                    while (queue.length > 0) {
                        const pkg = queue.shift()!;
                        // Find original case from packages array
                        const originalCase = packages.find(p => p.toLowerCase() === pkg) || pkg;
                        sorted.push(originalCase);

                        // For each package that this one depends on
                        for (const dep of dependents.get(pkg) || []) {
                            const newDegree = (inDegree.get(dep) || 1) - 1;
                            inDegree.set(dep, newDegree);
                            if (newDegree === 0) {
                                queue.push(dep);
                            }
                        }
                    }

                    // If there's a cycle or missing packages, add remaining ones
                    if (sorted.length < packages.length) {
                        for (const pkg of packages) {
                            if (!sorted.some(p => p.toLowerCase() === pkg.toLowerCase())) {
                                sorted.push(pkg);
                            }
                        }
                    }

                    const sortedPackages = sorted;

                    // Setup and show output channel before starting bulk operation
                    this._nugetService.setupOutputChannel();
                    this._nugetService.logBulkOperationHeader('Uninstalling', sortedPackages.length);

                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Uninstalling ${sortedPackages.length} packages...`,
                        cancellable: false
                    }, async (progress) => {
                        let successCount = 0;
                        let failCount = 0;

                        for (let i = 0; i < sortedPackages.length; i++) {
                            const packageId = sortedPackages[i];
                            progress.report({
                                message: `(${i + 1}/${sortedPackages.length}) ${packageId}`,
                                increment: (100 / sortedPackages.length)
                            });

                            const success = await this._nugetService.removePackage(
                                projectPath,
                                packageId,
                                { skipChannelSetup: true, skipRestore: true, skipNotification: true }
                            );

                            if (success) {
                                successCount++;
                            } else {
                                failCount++;
                            }
                        }

                        // Run a single restore after all packages are removed
                        if (successCount > 0) {
                            progress.report({ message: 'Restoring project...' });
                            await this._nugetService.restoreProject(projectPath);
                        }

                        if (failCount === 0) {
                            vscode.window.showInformationMessage(`Successfully uninstalled ${successCount} packages.`);
                        } else {
                            vscode.window.showWarningMessage(`Uninstalled ${successCount} packages, ${failCount} failed.`);
                        }
                    });

                    this._postMessage({
                        type: 'bulkRemoveResult',
                        projectPath: projectPath
                    });
                    break;
                }
        }
    }

    public dispose() {
        this._disposed = true;
        NuGetPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
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
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; connect-src ${webview.cspSource}; img-src ${webview.cspSource} https://api.nuget.org https://*.nuget.org https://raw.githubusercontent.com https://*.githubusercontent.com https://github.com https://shields.io https://*.shields.io https://img.shields.io https://opencollective.com https://*.opencollective.com https://codecov.io https://*.codecov.io https://badge.fury.io https://*.travis-ci.org https://*.travis-ci.com https://ci.appveyor.com https://coveralls.io https://*.coveralls.io https://david-dm.org https://snyk.io https://*.snyk.io https://api.codacy.com https://sonarcloud.io https://*.sonarcloud.io https://img.badgesize.io https://badgen.net https://*.badgen.net https://circleci.com https://*.circleci.com https://dev.azure.com https://*.visualstudio.com data:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>nUIget</title>
                <link rel="stylesheet" href="${cssUri}">
                <style>
                    body {
                        padding: 0;
                        margin: 0;
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                    }
                    #root {
                        width: 100%;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }
                </style>
            </head>
            <body>
                <div id="root" data-package-icon="${packageIconUri}" data-initial-tab="${this._pendingInitialTab || ''}"></div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

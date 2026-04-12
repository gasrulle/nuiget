import * as vscode from 'vscode';
import { executeBulkUpdateAllProjects, executeBulkUpdatePackages, executeSingleOperation, OperationContext, queryAllProjectsInstalled, queryAllProjectsUpdates } from '../services/NuGetOperations';
import { NuGetService } from '../services/NuGetService';
import type { PickProjectForInstallMsg, PickProjectForRemoveMsg, ShowContextMenuMsg, SidebarRequestMessage } from '../services/NuGetTypes';
import { ALL_PROJECTS_SENTINEL } from '../services/NuGetTypes';
import { NuGetPanel } from './NuGetPanel';

/**
 * NuGetSidebarProvider — WebviewViewProvider for the sidebar panel.
 *
 * Always uses lite mode backend for maximum speed. Handles:
 * - Browse: full search (lite mode, no quick search)
 * - Installed: csproj-only parsing (lite mode)
 * - Updates: minimal update checks
 * - Install/Update/Remove via context menus and hover buttons
 *
 * Source/Project/Prerelease selection is handled via VS Code QuickPick
 * commands triggered from the view title bar.
 */
export class NuGetSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'nuiget.sidebarView';

    private _view?: vscode.WebviewView;
    private _disposed = false;

    // Sidebar state (persisted via workspaceState)
    private _selectedSource = 'all';
    private _selectedProject = '';
    private _includePrerelease = false;

    // Track the latest search query to skip stale requests
    private _latestSearchQuery = '';

    // Background update checking
    private _fileWatcherDebounce?: ReturnType<typeof setTimeout>;
    private _backgroundCheckInProgress = false;
    private _forceCheckPending = false;
    private _forceCheckSkipMainPanel = false;
    private _forceCheckScope?: { packageIds?: string[]; projectPath?: string };
    private _pendingProjectUpdates: { projectPath: string; projectName: string; updates: { id: string; installedVersion: string; latestVersion: string }[] }[] = [];
    private _pendingInstalledCount = -1;
    private _pendingInstalledProject = '';
    private _operationInProgress = false;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext,
        private readonly _outputChannel: vscode.LogOutputChannel,
        private readonly _nugetService: NuGetService
    ) {
        // Restore persisted state
        this._includePrerelease = this._context.workspaceState.get<boolean>('nuget.includePrerelease', false);
        this._selectedSource = this._context.workspaceState.get<string>('nuget.selectedSource', '') || 'all';
        this._selectedProject = this._context.workspaceState.get<string>('nuget.selectedProject', '');
        // Set initial context key for prerelease toggle icon
        vscode.commands.executeCommand('setContext', 'nuiget.prereleaseEnabled', this._includePrerelease);

        // Listen for configuration changes
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('workbench.tree.indent')) {
                    this._postMessage({ type: 'treeIndent', value: this._getTreeIndent() });
                }
            })
        );
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        this._disposed = false;
        this._updateTitle();

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the sidebar webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            try {
                await this._handleMessage(data);
            } catch (error) {
                console.error('[nUIget Sidebar] Error handling message:', error);
            }
        });

        // Handle visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                // Send current state when sidebar becomes visible
                this._sendState();
                // Focus the search input like native sidebar panels
                this._postMessage({ type: 'focusSearch' });
            }
        });

        // Handle disposal
        webviewView.onDidDispose(() => {
            this._disposed = true;
        });
    }

    /**
     * Start background monitoring: file watcher + periodic timer.
     * Called from extension.ts after activation so it runs even before
     * the sidebar webview is opened.
     */
    public startBackgroundMonitoring(): void {
        // Initial background check after a 2-second delay to let activation settle
        setTimeout(() => {
            this.checkUpdatesInBackground();
        }, 2000);

        // File watcher: *.csproj, *.fsproj, *.vbproj changes → debounced re-check
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{csproj,fsproj,vbproj}');
        const triggerDebounced = () => {
            if (this._fileWatcherDebounce) { clearTimeout(this._fileWatcherDebounce); }
            this._fileWatcherDebounce = setTimeout(() => {
                // Skip if an operation is in progress — the operation handler
                // manages its own post-op refresh cycle.
                if (this._operationInProgress) { return; }
                // Tell webview to re-fetch installed packages (csproj content changed)
                if (!this._disposed && this._view) {
                    this._postMessage({ type: 'forceRefresh' });
                }
                this.checkUpdatesInBackground(true);
                // Notify main panel so it also refreshes on external .csproj changes
                NuGetSidebarProvider._notifyMainPanel();
            }, 5000);
        };
        watcher.onDidChange(triggerDebounced);
        watcher.onDidCreate(triggerDebounced);
        watcher.onDidDelete(triggerDebounced);
        this._disposables.push(watcher);
    }

    /**
     * Check for updates in the background (without requiring webview).
     * Sends results to the webview if it's active and optionally
     * notifies the main panel. Uses lite mode + minimal checks.
     *
     * @param scope Optional scope to limit cache invalidation and project re-checking.
     *   - packageIds: Only invalidate version cache for these packages (instead of clearing all).
     *   - projectPath: Only re-check this project (keep cached data for other projects).
     *   When omitted, all projects are re-checked and the full versions cache is cleared on force.
     */
    public async checkUpdatesInBackground(force = false, skipMainPanelNotify = false, scope?: { packageIds?: string[]; projectPath?: string }): Promise<void> {
        if (this._backgroundCheckInProgress) {
            if (force) {
                this._forceCheckPending = true;
                // Preserve the most restrictive skipMainPanelNotify (true wins)
                if (skipMainPanelNotify) { this._forceCheckSkipMainPanel = true; }
                // Widen scope: if pending scope or new scope is unscoped, result is unscoped
                if (!scope || !this._forceCheckScope) {
                    this._forceCheckScope = undefined;
                } else {
                    // Merge: combine affected packageIds and clear projectPath if different
                    const mergedPkgs = new Set([
                        ...(this._forceCheckScope.packageIds ?? []),
                        ...(scope.packageIds ?? []),
                    ]);
                    this._forceCheckScope = {
                        packageIds: mergedPkgs.size > 0 ? [...mergedPkgs] : undefined,
                        projectPath: this._forceCheckScope.projectPath === scope.projectPath ? scope.projectPath : undefined,
                    };
                }
            }
            return;
        }
        this._backgroundCheckInProgress = true;

        // When force=true (post-operation re-check), invalidate stale version cache entries
        // so the re-check fetches fresh version lists from the API.
        // With a scope, only invalidate the affected packages — avoids re-fetching
        // versions for all packages (saves 20-30 HTTP requests per operation).
        if (force) {
            if (scope?.packageIds && scope.packageIds.length > 0) {
                this._nugetService.clearVersionsCacheForPackages(scope.packageIds);
            } else {
                this._nugetService.clearVersionsCache();
            }
        }

        try {
            const projects = await this._nugetService.findProjects();
            if (projects.length === 0) { return; }

            // Validate persisted project: if it no longer exists on disk, reset to first available
            if (this._selectedProject === ALL_PROJECTS_SENTINEL) {
                // Auto-downgrade sentinel to single project when workspace shrinks to 1 project
                if (projects.length === 1) {
                    this._outputChannel.info(`[Sidebar BG] Only 1 project in workspace. Downgrading from All Projects to ${projects[0].path}`);
                    this._selectedProject = projects[0].path;
                    this._context.workspaceState.update('nuget.selectedProject', this._selectedProject);
                    this._updateTitle();
                }
            } else if (this._selectedProject && !projects.some(p => p.path === this._selectedProject)) {
                this._outputChannel.info(`[Sidebar BG] Persisted project no longer exists: ${this._selectedProject}. Resetting to ${projects[0].path}`);
                this._selectedProject = projects[0].path;
                this._context.workspaceState.update('nuget.selectedProject', this._selectedProject);
                this._updateTitle();
            }

            // Auto-select first project if none selected
            if (!this._selectedProject && projects.length > 0) {
                this._selectedProject = projects[0].path;
                this._updateTitle();
            }

            let selectedProjectInstalledCount = -1;
            let allProjectUpdates: { projectPath: string; projectName: string; updates: { id: string; installedVersion: string; latestVersion: string }[] }[];

            // When scoped to a single project, only re-check that project and
            // merge results with the existing cached data for other projects.
            const scopedProjectPath = scope?.projectPath;
            const projectsToCheck = scopedProjectPath
                ? projects.filter(p => p.path === scopedProjectPath)
                : projects;

            // Check projects in parallel for faster display
            const projectResults = await Promise.all(projectsToCheck.map(async (project) => {
                try {
                    const installed = await this._nugetService.getInstalledPackages(project.path, true /* liteMode */);

                    let updates: { id: string; installedVersion: string; latestVersion: string }[] = [];
                    if (installed.length > 0) {
                        updates = await this._nugetService.checkPackageUpdatesMinimal(installed, this._includePrerelease);
                    }
                    return { project, installed, updates };
                } catch {
                    return { project, installed: [] as import('../services/NuGetService').InstalledPackage[], updates: [] as { id: string; installedVersion: string; latestVersion: string }[] };
                }
            }));

            if (scopedProjectPath) {
                // Merge: replace the scoped project's data in cached results, keep others unchanged
                allProjectUpdates = this._pendingProjectUpdates.filter(pu => pu.projectPath !== scopedProjectPath);
                for (const { project, installed, updates } of projectResults) {
                    if (project.path === this._selectedProject) {
                        selectedProjectInstalledCount = installed.length;
                    }
                    if (updates.length > 0) {
                        allProjectUpdates.push({
                            projectPath: project.path,
                            projectName: project.name,
                            updates
                        });
                    }
                }
                // Preserve cached installed count for unaffected selected project
                if (selectedProjectInstalledCount === -1 && this._pendingInstalledProject === this._selectedProject) {
                    selectedProjectInstalledCount = this._pendingInstalledCount;
                }
            } else {
                // Full re-check: aggregate all results
                allProjectUpdates = [];
                for (const { project, installed, updates } of projectResults) {
                    if (project.path === this._selectedProject) {
                        selectedProjectInstalledCount = installed.length;
                    }
                    if (updates.length > 0) {
                        allProjectUpdates.push({
                            projectPath: project.path,
                            projectName: project.name,
                            updates
                        });
                    }
                }
            }

            // Cache results for when the webview resolves later
            this._pendingProjectUpdates = allProjectUpdates;
            this._pendingInstalledCount = selectedProjectInstalledCount;
            this._pendingInstalledProject = this._selectedProject || '';

            // If webview is active, push all-projects results and installed count
            if (!this._disposed && this._view) {
                this._postMessage({ type: 'allProjectsUpdates', projectUpdates: allProjectUpdates });
                if (selectedProjectInstalledCount >= 0) {
                    this._postMessage({ type: 'installedCountUpdate', count: selectedProjectInstalledCount });
                }
            }

            // Notify main panel so it re-fetches installed packages and updates
            // (prevents stale data when sidebar detects changes the main panel missed)
            // Skip when the main panel initiated the change — it already has fresh data.
            if (!skipMainPanelNotify) {
                NuGetSidebarProvider._notifyMainPanel();
            }
        } catch (err) {
            this._outputChannel.error('checkUpdatesInBackground error:', String(err));
        } finally {
            this._backgroundCheckInProgress = false;
            if (this._forceCheckPending) {
                this._forceCheckPending = false;
                const skipNotify = this._forceCheckSkipMainPanel;
                this._forceCheckSkipMainPanel = false;
                const pendingScope = this._forceCheckScope;
                this._forceCheckScope = undefined;
                this.checkUpdatesInBackground(true, skipNotify, pendingScope);
            }
        }
    }

    /** Cancel any pending file watcher debounce to avoid redundant refreshes after operations */
    private _cancelFileWatcherDebounce(): void {
        if (this._fileWatcherDebounce) {
            clearTimeout(this._fileWatcherDebounce);
            this._fileWatcherDebounce = undefined;
        }
    }

    /** Dispose background monitoring resources */
    public dispose(): void {
        this._disposed = true;
        this._cancelFileWatcherDebounce();
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }

    // ------ Public methods called from extension.ts commands ------

    public async showSourcePicker(): Promise<void> {
        const sources = await this._nugetService.getSources();
        const enabledSources = sources.filter(s => s.enabled);

        const manageLabel = '$(gear) Manage NuGet Sources…';
        const items: vscode.QuickPickItem[] = [
            { label: 'All Sources', description: 'Search across all enabled sources', picked: this._selectedSource === 'all' }
        ];
        for (const source of enabledSources) {
            items.push({
                label: source.name,
                description: source.url,
                picked: this._selectedSource === source.url
            });
        }
        // Manage sources action (icon differentiates from source items)
        items.push({ label: manageLabel, alwaysShow: true });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select package source',
            title: 'nUIget — Package Source'
        });

        if (selected) {
            if (selected.label === manageLabel) {
                // Open main panel with source settings overlay
                NuGetPanel.openSourceSettings(this._extensionUri, this._context, this._outputChannel, this._nugetService);
            } else if (selected.label === 'All Sources') {
                this._selectedSource = 'all';
                this._postMessage({ type: 'sourceChanged', source: this._selectedSource });
                this._context.workspaceState.update('nuget.selectedSource', this._selectedSource);
                NuGetPanel.syncSource(this._selectedSource);
            } else {
                const source = enabledSources.find(s => s.name === selected.label);
                this._selectedSource = source?.url || 'all';
                this._postMessage({ type: 'sourceChanged', source: this._selectedSource });
                this._context.workspaceState.update('nuget.selectedSource', this._selectedSource);
                NuGetPanel.syncSource(this._selectedSource);
            }
        }
    }

    public async showProjectPicker(): Promise<void> {
        const projects = await this._nugetService.findProjects();
        if (projects.length === 0) {
            vscode.window.showInformationMessage('No .NET project files found in workspace.');
            return;
        }

        const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
        const items: vscode.QuickPickItem[] = [];

        // "All Projects" option (only when multiple projects)
        if (sorted.length > 1) {
            items.push({
                label: `All Projects (${sorted.length})`,
                description: 'Show packages from all projects'
            });
            items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
        }

        // Individual projects
        items.push(...sorted.map(p => ({
            label: p.name,
            description: p.path
        })));

        // Use createQuickPick to control activeItems (showQuickPick ignores `picked` for single-select)
        const selected = await new Promise<vscode.QuickPickItem | undefined>(resolve => {
            const qp = vscode.window.createQuickPick();
            qp.items = items;
            qp.placeholder = 'Select project';
            qp.title = 'nUIget — Project';

            // Set the active (highlighted) item to match current selection
            const activeItem = this._selectedProject === ALL_PROJECTS_SENTINEL
                ? items.find(i => i.label.startsWith('All Projects ('))
                : items.find(i => i.description === this._selectedProject);
            if (activeItem) { qp.activeItems = [activeItem]; }

            qp.onDidAccept(() => {
                resolve(qp.selectedItems[0]);
                qp.dispose();
            });
            qp.onDidHide(() => {
                resolve(undefined);
                qp.dispose();
            });
            qp.show();
        });

        if (selected) {
            // "All Projects" selected
            if (selected.label.startsWith('All Projects (')) {
                this._selectedProject = ALL_PROJECTS_SENTINEL;
                this._context.workspaceState.update('nuget.selectedProject', this._selectedProject);
                this._postMessage({ type: 'projectChanged', projectPath: ALL_PROJECTS_SENTINEL, projectName: `All Projects (${sorted.length})` });
                this._updateTitle(`All Projects (${sorted.length})`);
                NuGetPanel.syncProject(ALL_PROJECTS_SENTINEL);
                return;
            }

            const project = selected.description
                ? projects.find(p => p.path === selected.description)
                : undefined;
            if (project) {
                this._selectedProject = project.path;
                this._context.workspaceState.update('nuget.selectedProject', this._selectedProject);
                this._postMessage({ type: 'projectChanged', projectPath: project.path, projectName: project.name });
                this._updateTitle(project.name);
                // Sync to main panel
                NuGetPanel.syncProject(this._selectedProject);
            }
        }
    }

    public togglePrerelease(): void {
        this._includePrerelease = !this._includePrerelease;
        this._context.workspaceState.update('nuget.includePrerelease', this._includePrerelease);
        vscode.commands.executeCommand('setContext', 'nuiget.prereleaseEnabled', this._includePrerelease);
        this._postMessage({ type: 'prereleaseChanged', includePrerelease: this._includePrerelease });
        // Sync to main panel
        NuGetPanel.syncPrerelease(this._includePrerelease);
        // Re-check updates so sidebar reflects the new prerelease setting
        this.checkUpdatesInBackground();
        // Show feedback
        vscode.window.setStatusBarMessage(
            `nUIget: Pre-release ${this._includePrerelease ? 'enabled' : 'disabled'}`,
            2000
        );
    }

    /** Update prerelease state from an external source (main panel sync) without writing back to workspaceState */
    public syncPrerelease(value: boolean): void {
        this._includePrerelease = value;
        vscode.commands.executeCommand('setContext', 'nuiget.prereleaseEnabled', value);
        this._postMessage({ type: 'prereleaseChanged', includePrerelease: value });
        // Re-check updates so sidebar reflects the new prerelease setting
        this.checkUpdatesInBackground();
    }

    /** Update source selection from an external source (main panel sync) without writing back to workspaceState */
    public syncSource(value: string): void {
        this._selectedSource = value;
        this._postMessage({ type: 'sourceChanged', source: value });
    }

    /** Update project selection from an external source (main panel sync) without writing back to workspaceState */
    public async syncProject(projectPath: string): Promise<void> {
        this._selectedProject = projectPath;

        if (projectPath === ALL_PROJECTS_SENTINEL) {
            const projects = await this._nugetService.findProjects();
            const projectName = `All Projects (${projects.length})`;
            this._postMessage({ type: 'projectChanged', projectPath: ALL_PROJECTS_SENTINEL, projectName });
            this._updateTitle(projectName);
            return;
        }

        // Derive project name from path
        const projects = await this._nugetService.findProjects();
        const project = projects.find(p => p.path === projectPath);
        const projectName = project?.name || projectPath.split(/[\\/]/).pop() || '';
        this._postMessage({ type: 'projectChanged', projectPath, projectName });
        this._updateTitle(projectName);
    }

    /** Lightweight sidebar notification after a package operation from the main panel.
     * Skips HTTP cache clearing and source re-fetch (operation just talked to registry successfully).
     * Forwards operation details to sidebar webview for optimistic state updates. */
    public async notifySidebarOfChange(operation: { type: string; packageId?: string; packageIds?: string[]; projectPath?: string }): Promise<void> {
        // Cancel any pending file watcher debounce — the main panel operation already
        // completed the .csproj changes; we handle the refresh below.
        this._cancelFileWatcherDebounce();
        // Forward operation details to sidebar webview for surgical UI updates
        this._postMessage({ type: 'packageChanged', operation });
        // Re-check updates in background for data accuracy.
        // skipMainPanelNotify=true because the main panel initiated this change and
        // already has fresh data — a redundant refresh causes a slow second reload.
        // Pass operation metadata for selective cache invalidation (only affected packages,
        // not the entire versions cache) and scoped project re-checking.
        // Merge packageId (single ops) and packageIds (bulk ops) into a single list.
        const ids = operation.packageIds ?? (operation.packageId ? [operation.packageId] : undefined);
        await this.checkUpdatesInBackground(true, /* skipMainPanelNotify */ true, {
            packageIds: ids,
            projectPath: operation.projectPath,
        });
    }

    /** Full sidebar refresh: re-send sources, tell webview to re-fetch, and re-check updates */
    public async refreshSidebar(): Promise<void> {
        // Re-send sources (cache was just cleared by the caller)
        const sources = await this._nugetService.getSources();
        this._postMessage({ type: 'sources', sources: sources.filter(s => s.enabled) });
        // Tell webview to re-fetch installed packages and updates
        this._postMessage({ type: 'forceRefresh' });
        // Re-check updates (force bypass the in-progress guard)
        await this.checkUpdatesInBackground(true);
    }

    /** Update the sidebar title bar description with the current project name */
    private _updateTitle(projectName?: string): void {
        if (!this._view) { return; }
        if (this._selectedProject === ALL_PROJECTS_SENTINEL) {
            // projectName may already be "All Projects (N)" from the caller
            this._view.title = projectName && projectName.startsWith('All Projects') ? projectName : 'All Projects';
        } else if (projectName) {
            this._view.title = projectName.replace(/\.(csproj|fsproj|vbproj)$/, '');
        } else if (this._selectedProject) {
            const base = this._selectedProject.split(/[\\/]/).pop() || '';
            this._view.title = base.replace(/\.(csproj|fsproj|vbproj)$/, '');
        } else {
            this._view.title = undefined;
        }
    }

    // ------ Private message handling ------

    private async _handleMessage(data: SidebarRequestMessage): Promise<void> {
        switch (data.type) {
            case 'ready':
                {
                    // Sidebar webview is ready — send initial state
                    await this._sendInitialData();
                    break;
                }
            case 'saveSectionSplit':
                {
                    const position = data.position;
                    if (position !== undefined) {
                        await this._context.workspaceState.update('nuget.sidebarSectionSplit', position);
                    }
                    break;
                }
            case 'searchPackages':
                {
                    const query = data.query;
                    this._latestSearchQuery = query;

                    try {
                        // Always use lite mode for sidebar
                        let sources = data.sources as string[] | undefined;
                        if (sources && sources.length > 0) {
                            const failedSources = this._nugetService.getFailedSources();
                            if (failedSources.size > 0) {
                                const filtered = sources.filter(url => !failedSources.has(url));
                                if (filtered.length > 0) {
                                    sources = filtered;
                                }
                            }
                        }

                        const results = await this._nugetService.searchPackages(
                            query, sources, data.includePrerelease as boolean | undefined, true /* liteMode */
                        );

                        if (this._latestSearchQuery !== query) { break; }

                        this._postMessage({ type: 'searchResults', results, query });
                    } catch (error) {
                        console.error('[nUIget Sidebar] searchPackages error:', error);
                        if (this._latestSearchQuery === query) {
                            this._postMessage({ type: 'searchResults', results: [], query });
                        }
                    }
                    break;
                }
            case 'getInstalledPackages':
                {
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    try {
                        const packages = await this._nugetService.getInstalledPackages(
                            data.projectPath as string, true /* liteMode */
                        );
                        this._postMessage({
                            type: 'installedPackages',
                            packages,
                            projectPath: data.projectPath
                        });
                    } catch (error) {
                        console.error('[nUIget Sidebar] getInstalledPackages error:', error);
                        // Send empty response so the webview's loading spinner stops
                        this._postMessage({
                            type: 'installedPackages',
                            packages: [],
                            projectPath: data.projectPath
                        });
                    }
                    break;
                }
            case 'checkPackageUpdates':
                {
                    try {
                        // Always use minimal for sidebar
                        const minimalUpdates = await this._nugetService.checkPackageUpdatesMinimal(
                            data.installedPackages,
                            data.includePrerelease
                        );
                        this._postMessage({
                            type: 'packageUpdatesMinimal',
                            updates: minimalUpdates,
                            projectPath: data.projectPath
                        });
                    } catch (error) {
                        console.error('[nUIget Sidebar] checkPackageUpdates error:', error);
                        this._postMessage({
                            type: 'packageUpdatesMinimal',
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
                            this._nugetService, data.includePrerelease, true /* liteMode */
                        );
                        this._postMessage({ type: 'allProjectsUpdates', projectUpdates });
                    } catch (error) {
                        console.error('[nUIget Sidebar] checkAllProjectsUpdates error:', error);
                        this._postMessage({ type: 'allProjectsUpdates', projectUpdates: [] });
                    }
                    break;
                }
            case 'checkAllProjectsInstalled':
                {
                    try {
                        const projectInstalled = await queryAllProjectsInstalled(this._nugetService, true /* liteMode — sidebar stays lightweight */);
                        this._postMessage({ type: 'allProjectsInstalled', projectInstalled, context: data.context });
                    } catch (error) {
                        console.error('[nUIget Sidebar] checkAllProjectsInstalled error:', error);
                        this._postMessage({ type: 'allProjectsInstalled', projectInstalled: [], context: data.context });
                    }
                    break;
                }
            case 'installPackage':
                {
                    if (this._operationInProgress) { break; }
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    this._operationInProgress = true;
                    let installSuccess = false;
                    try {
                        installSuccess = await executeSingleOperation(this._opCtx(), 'install', data.projectPath, data.packageId, data.version, data.sourceUrl);
                    } finally {
                        this._operationInProgress = false;
                        this._cancelFileWatcherDebounce();
                        if (installSuccess) { this.checkUpdatesInBackground(true, true, { packageIds: [data.packageId], projectPath: data.projectPath }); }
                    }
                    break;
                }
            case 'pickProjectForInstall':
                {
                    if (this._operationInProgress) { break; }
                    await this._pickProjectAndInstall(data);
                    break;
                }
            case 'pickProjectForRemove':
                {
                    if (this._operationInProgress) { break; }
                    await this._pickProjectAndRemove(data);
                    break;
                }
            case 'updatePackage':
                {
                    if (this._operationInProgress) { break; }
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    this._operationInProgress = true;
                    let updateSuccess = false;
                    try {
                        updateSuccess = await executeSingleOperation(this._opCtx(), 'update', data.projectPath, data.packageId, data.version, data.sourceUrl);
                    } finally {
                        this._operationInProgress = false;
                        this._cancelFileWatcherDebounce();
                        if (updateSuccess) { this.checkUpdatesInBackground(true, true, { packageIds: [data.packageId], projectPath: data.projectPath }); }
                    }
                    break;
                }
            case 'removePackage':
                {
                    if (this._operationInProgress) { break; }
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    this._operationInProgress = true;
                    let removeSuccess = false;
                    try {
                        removeSuccess = await executeSingleOperation(this._opCtx(), 'remove', data.projectPath, data.packageId);
                    } finally {
                        this._operationInProgress = false;
                        this._cancelFileWatcherDebounce();
                        if (removeSuccess) { this.checkUpdatesInBackground(true, true, { packageIds: [data.packageId], projectPath: data.projectPath }); }
                    }
                    break;
                }
            case 'bulkUpdatePackages':
                {
                    if (this._operationInProgress) { break; }
                    if (data.projectPath === ALL_PROJECTS_SENTINEL) { break; }
                    this._operationInProgress = true;
                    try {
                        await executeBulkUpdatePackages(this._opCtx(), data.packages, data.projectPath);
                    } finally {
                        this._operationInProgress = false;
                        this._cancelFileWatcherDebounce();
                        this.checkUpdatesInBackground(true, true, { packageIds: data.packages.map((p: { id: string }) => p.id), projectPath: data.projectPath });
                    }
                    break;
                }
            case 'bulkUpdateAllProjects':
                {
                    if (this._operationInProgress) { break; }
                    this._operationInProgress = true;
                    try {
                        await executeBulkUpdateAllProjects(this._opCtx(), data.projectUpdates);
                    } finally {
                        this._operationInProgress = false;
                        this._cancelFileWatcherDebounce();
                        // Bulk all-projects: collect all affected packageIds, no single project scope
                        const allPkgIds = (data.projectUpdates as { packages: { id: string }[] }[]).flatMap((pu: { packages: { id: string }[] }) => pu.packages.map((p: { id: string }) => p.id));
                        this.checkUpdatesInBackground(true, true, { packageIds: allPkgIds });
                    }
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
                        versions,
                        source: data.source,
                        includePrerelease: data.includePrerelease
                    });
                    break;
                }
            case 'showContextMenu':
                {
                    await this._showContextMenu(data);
                    break;
                }

        }
    }

    // ------ Project picker for install (all-projects mode) ------

    private async _pickProjectAndInstall(data: PickProjectForInstallMsg): Promise<void> {
        const projects = await this._nugetService.findProjects();
        if (projects.length === 0) { return; }

        const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
        const items = sorted.map(p => ({ label: p.name, description: p.path }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Select project to install ${data.packageId}`,
            title: `nUIget — Install ${data.packageId}`
        });

        if (!selected) { return; }
        const project = selected.description
            ? projects.find(p => p.path === selected.description)
            : undefined;
        if (!project) { return; }

        this._operationInProgress = true;
        let pickInstallSuccess = false;
        try {
            pickInstallSuccess = await executeSingleOperation(this._opCtx(), 'install', project.path, data.packageId, data.version);
        } finally {
            this._operationInProgress = false;
            this._cancelFileWatcherDebounce();
            if (pickInstallSuccess) { this.checkUpdatesInBackground(true, true, { packageIds: [data.packageId], projectPath: project.path }); }
        }
    }

    private async _pickProjectAndRemove(data: PickProjectForRemoveMsg): Promise<void> {
        const projects = await this._nugetService.findProjects();
        if (projects.length === 0) { return; }

        // Filter to only the projects where this package is installed
        const pathSet = new Set(data.projectPaths.map(p => p.toLowerCase()));
        const matching = projects.filter(p => pathSet.has(p.path.toLowerCase()));
        if (matching.length === 0) { return; }

        // Single project — remove directly without picker
        if (matching.length === 1) {
            this._operationInProgress = true;
            let singleRemoveSuccess = false;
            try {
                singleRemoveSuccess = await executeSingleOperation(this._opCtx(), 'remove', matching[0].path, data.packageId);
            } finally {
                this._operationInProgress = false;
                this._cancelFileWatcherDebounce();
                if (singleRemoveSuccess) { this.checkUpdatesInBackground(true, true, { packageIds: [data.packageId], projectPath: matching[0].path }); }
            }
            return;
        }

        const sorted = [...matching].sort((a, b) => a.name.localeCompare(b.name));
        const items = sorted.map(p => ({ label: p.name, description: p.path }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Select project to uninstall ${data.packageId} from`,
            title: `nUIget — Uninstall ${data.packageId}`
        });

        if (!selected) { return; }
        const project = selected.description
            ? projects.find(p => p.path === selected.description)
            : undefined;
        if (!project) { return; }

        this._operationInProgress = true;
        let pickRemoveSuccess = false;
        try {
            pickRemoveSuccess = await executeSingleOperation(this._opCtx(), 'remove', project.path, data.packageId);
        } finally {
            this._operationInProgress = false;
            this._cancelFileWatcherDebounce();
            if (pickRemoveSuccess) { this.checkUpdatesInBackground(true, true, { packageIds: [data.packageId], projectPath: project.path }); }
        }
    }

    // ------ Context menu ------

    private async _showContextMenu(data: ShowContextMenuMsg): Promise<void> {
        const packageId = data.packageId;
        const installedVersion = data.installedVersion;
        const latestVersion = data.latestVersion;
        const context = data.context;
        const projectPath = data.projectPath;
        const versionType = data.versionType;
        const sourceUrl = data.sourceUrl;
        const isFloatingOrRange = versionType === 'floating' || versionType === 'range';
        const isAllProjectsBrowse = (!projectPath || projectPath === ALL_PROJECTS_SENTINEL) && context === 'browse';

        // Non-browse contexts with sentinel should never happen (installed/updates pass real projectPath)
        if (!projectPath || projectPath === ALL_PROJECTS_SENTINEL) {
            if (!isAllProjectsBrowse) {
                vscode.window.showWarningMessage('Please select a specific project for this action.');
                return;
            }
        }

        // ─── BUILD ACTIONS QUICKPICK ─────────────────────────────────────────
        const items: vscode.QuickPickItem[] = [];

        if (context === 'browse') {
            if (installedVersion) {
                // Already installed
                items.push({ label: '$(close) Uninstall', description: installedVersion });
                items.push({ label: '$(list-ordered) Change Version...', description: 'Select a specific version' });
            } else {
                items.push({ label: '$(add) Install Latest', description: latestVersion || '' });
                items.push({ label: '$(list-ordered) Install Version...', description: 'Select a specific version' });
            }
        } else if (context === 'installed') {
            items.push({ label: '$(list-ordered) Change Version...', description: 'Select a specific version' });
            items.push({ label: '$(close) Uninstall', description: installedVersion || '' });
        } else if (context === 'updates') {
            // Don't offer direct update for floating/range versions — they use patterns, not fixed versions
            if (!isFloatingOrRange) {
                items.push({ label: '$(arrow-up) Update to ' + (latestVersion || 'latest'), description: '' });
            }
            items.push({ label: '$(list-ordered) Update to Version...', description: 'Select a specific version' });
            items.push({ label: '$(close) Uninstall', description: installedVersion || '' });
        }

        items.push({ label: '$(clippy) Copy Package ID', description: packageId });
        items.push({ label: '$(eye) View Package Details', description: 'Open in full view' });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `${packageId} — Actions`,
            title: `nUIget — ${packageId}`
        });

        if (!selected) { return; }

        const label = selected.label;

        // ─── PROJECT-INDEPENDENT ACTIONS (execute immediately) ────────────────
        if (label.includes('Copy Package ID')) {
            await vscode.env.clipboard.writeText(packageId);
            vscode.window.setStatusBarMessage(`Copied "${packageId}" to clipboard`, 2000);
            return;
        }
        if (label.includes('View Package Details')) {
            vscode.commands.executeCommand('nuiget.viewPackageDetails', {
                packageId,
                version: latestVersion || installedVersion
            });
            return;
        }

        // ─── RESOLVE PROJECT (for all-projects browse, pick project after action) ─
        let resolvedProjectPath: string | undefined = projectPath;
        if (isAllProjectsBrowse) {
            // Version picker first for version-selection actions
            let selectedVersion: string | undefined;
            if (label.includes('Install Version') || label.includes('Change Version')) {
                selectedVersion = await this._pickVersion(packageId, installedVersion);
                if (!selectedVersion) { return; }
            }

            // Now pick the project
            resolvedProjectPath = await this._pickProjectForAction(
                packageId, label, data.installedProjects
            );
            if (!resolvedProjectPath) { return; }

            // Execute version-based actions that already have a version
            if (selectedVersion) {
                this._postMessage({ type: 'doInstall', packageId, version: selectedVersion, projectPath: resolvedProjectPath });
                return;
            }
        }

        if (!resolvedProjectPath) { return; }

        // ─── EXECUTE PROJECT-DEPENDENT ACTIONS ───────────────────────────────
        if (label.includes('Install Latest') || (label.includes('Update to ') && !label.includes('Update to Version'))) {
            const version = latestVersion || '';
            if (label.includes('Install')) {
                this._postMessage({ type: 'doInstall', packageId, version, projectPath: resolvedProjectPath });
            } else {
                this._postMessage({ type: 'doUpdate', packageId, version, projectPath: resolvedProjectPath, sourceUrl });
            }
        } else if (label.includes('Install Version') || label.includes('Change Version') || label.includes('Update to Version')) {
            const selectedVersion = await this._pickVersion(packageId, installedVersion);
            if (selectedVersion) {
                if (label.includes('Update to Version')) {
                    this._postMessage({ type: 'doUpdate', packageId, version: selectedVersion, projectPath: resolvedProjectPath, sourceUrl });
                } else {
                    this._postMessage({ type: 'doInstall', packageId, version: selectedVersion, projectPath: resolvedProjectPath });
                }
            }
        } else if (label.includes('Uninstall')) {
            this._postMessage({ type: 'doRemove', packageId, projectPath: resolvedProjectPath });
        }
    }

    /** Show version picker QuickPick and return the selected version, or undefined if cancelled. */
    private async _pickVersion(packageId: string, installedVersion?: string): Promise<string | undefined> {
        const versions = await this._nugetService.getPackageVersions(
            packageId,
            this._selectedSource === 'all' ? undefined : this._selectedSource,
            this._includePrerelease,
            50
        );
        if (versions.length === 0) {
            vscode.window.showInformationMessage(`No versions found for ${packageId}`);
            return undefined;
        }

        const versionItems = versions.map(v => ({
            label: v,
            description: v === installedVersion ? '(installed)' : ''
        }));

        const selectedVersion = await vscode.window.showQuickPick(versionItems, {
            placeHolder: `Select version for ${packageId}`,
            title: `nUIget — ${packageId} Versions`
        });

        return selectedVersion?.label;
    }

    /**
     * Show project picker for all-projects browse context menu.
     * For Uninstall/Change Version: only shows projects where the package is installed.
     * For Install: shows all projects, marking already-installed ones.
     */
    private async _pickProjectForAction(
        packageId: string,
        actionLabel: string,
        installedProjects?: Array<{ projectPath: string; projectName: string; version: string }>
    ): Promise<string | undefined> {
        const isUninstallOrChange = actionLabel.includes('Uninstall') || actionLabel.includes('Change Version');

        if (isUninstallOrChange && installedProjects && installedProjects.length > 0) {
            // Only show projects where the package is installed
            const items = installedProjects
                .sort((a, b) => a.projectName.localeCompare(b.projectName))
                .map(p => ({ label: p.projectName, description: `v${p.version}`, detail: p.projectPath }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Select project to ${actionLabel.includes('Uninstall') ? 'uninstall from' : 'change version in'}`,
                title: `nUIget — ${packageId}`
            });
            return selected?.detail;
        }

        // For install actions: show all projects, mark installed ones
        const projects = await this._nugetService.findProjects();
        if (projects.length === 0) { return undefined; }
        const installedMap = new Map(
            (installedProjects || []).map(p => [p.projectPath, p.version])
        );
        const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
        const items = sorted.map(p => {
            const ver = installedMap.get(p.path);
            return {
                label: p.name,
                description: ver ? `(installed v${ver})` : '',
                detail: p.path
            };
        });
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Select project to install ${packageId}`,
            title: `nUIget — ${packageId}`
        });
        return selected?.detail;
    }

    // ------ Helpers ------

    private async _sendInitialData(): Promise<void> {
        // Fetch projects first to auto-select if needed
        const projects = await this._nugetService.findProjects();

        // Validate persisted project: sentinel or missing
        if (this._selectedProject === ALL_PROJECTS_SENTINEL) {
            // Auto-downgrade sentinel when workspace shrinks to 1 project
            if (projects.length <= 1 && projects.length > 0) {
                this._outputChannel.info(`[Sidebar] Only ${projects.length} project(s) in workspace. Downgrading from All Projects to ${projects[0].path}`);
                this._selectedProject = projects[0].path;
                this._context.workspaceState.update('nuget.selectedProject', this._selectedProject);
                this._updateTitle();
            }
        } else if (this._selectedProject && projects.length > 0 && !projects.some(p => p.path === this._selectedProject)) {
            this._outputChannel.info(`[Sidebar] Persisted project no longer exists: ${this._selectedProject}. Resetting to ${projects[0].path}`);
            this._selectedProject = projects[0].path;
            this._context.workspaceState.update('nuget.selectedProject', this._selectedProject);
            this._updateTitle();
        }

        // Auto-select first project if none selected (before sending state)
        if (!this._selectedProject && projects.length > 0) {
            this._selectedProject = projects[0].path;
            this._updateTitle();
        }

        // Send current state FIRST so the webview knows selectedProject
        // before receiving the projects list (avoids wrong auto-select)
        const sectionSplit = this._context.workspaceState.get<number>('nuget.sidebarSectionSplit');
        this._postMessage({
            type: 'state',
            selectedSource: this._selectedSource,
            selectedProject: this._selectedProject,
            includePrerelease: this._includePrerelease,
            treeIndent: this._getTreeIndent(),
            ...(sectionSplit !== undefined && { sectionSplit })
        });

        // Send projects (webview already has selectedProject set)
        this._postMessage({ type: 'projects', projects });

        // Send sources
        const sources = await this._nugetService.getSources();
        this._postMessage({ type: 'sources', sources: sources.filter(s => s.enabled) });

        // Send cached background data if available (background check may have
        // completed before the webview resolved)
        if (this._pendingProjectUpdates.length > 0) {
            this._postMessage({ type: 'allProjectsUpdates', projectUpdates: this._pendingProjectUpdates });
            this._pendingProjectUpdates = [];
        }
        if (this._pendingInstalledCount >= 0 && this._pendingInstalledProject === this._selectedProject) {
            this._postMessage({ type: 'installedCountUpdate', count: this._pendingInstalledCount });
        }
        this._pendingInstalledCount = -1;
        this._pendingInstalledProject = '';
    }

    private _sendState(): void {
        this._postMessage({
            type: 'state',
            selectedSource: this._selectedSource,
            selectedProject: this._selectedProject,
            includePrerelease: this._includePrerelease,
            treeIndent: this._getTreeIndent()
        });
    }

    /** Read the user's workbench.tree.indent setting (default 8). */
    private _getTreeIndent(): number {
        return vscode.workspace.getConfiguration('workbench.tree').get<number>('indent', 8);
    }

    /** Build an OperationContext for shared operation functions. */
    private _opCtx(): OperationContext {
        return {
            nugetService: this._nugetService,
            postMessage: (msg: unknown) => this._postMessage(msg),
            notifyOtherPanel: (op) => NuGetSidebarProvider._notifyMainPanel(op),
        };
    }

    private _postMessage(message: unknown): void {
        if (!this._disposed && this._view) {
            this._view.webview.postMessage(message);
        }
    }

    /** Notify the main panel to refresh if it's open.
     * When operation scope is provided, sends a scoped refresh (skips expensive full update check).
     * Falls back to full refresh for file-watcher and other non-operation callers. */
    private static _notifyMainPanel(operation?: { type: string; packageId?: string; packageIds?: string[]; projectPath?: string }): void {
        // Import would be circular, so use command
        if (operation) {
            vscode.commands.executeCommand('nuiget.refreshPackagesScoped', operation);
        } else {
            vscode.commands.executeCommand('nuiget.refreshPackages');
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'sidebar.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'sidebar.css'));
        const packageIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'package-icon.png'));

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}; connect-src ${webview.cspSource}; img-src ${webview.cspSource};">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>nUIget Sidebar</title>
                <link rel="stylesheet" href="${cssUri}">
            </head>
            <body>
                <div id="sidebar-root" data-package-icon="${packageIconUri}"></div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

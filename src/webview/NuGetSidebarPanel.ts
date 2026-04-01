import * as vscode from 'vscode';
import { executeBulkUpdateAllProjects, executeBulkUpdatePackages, executeSingleOperation, OperationContext, queryAllProjectsInstalled, queryAllProjectsUpdates } from '../services/NuGetOperations';
import { NuGetService } from '../services/NuGetService';
import type { ShowContextMenuMsg, SidebarRequestMessage } from '../services/NuGetTypes';
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
    private _backgroundCheckTimer?: ReturnType<typeof setInterval>;
    private _fileWatcherDebounce?: ReturnType<typeof setTimeout>;
    private _backgroundCheckInProgress = false;
    private _forceCheckPending = false;
    private _pendingProjectUpdates: { projectPath: string; projectName: string; updates: { id: string; installedVersion: string; latestVersion: string }[] }[] = [];
    private _pendingInstalledCount = -1;
    private _pendingInstalledProject = '';
    private _pendingBadgeCount = 0;
    private _pendingBadgeTooltip = '';
    private _showActivityBarBadge: boolean;
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

        // Read badge setting
        this._showActivityBarBadge = vscode.workspace.getConfiguration('nuiget').get<boolean>('showActivityBarBadge', true);

        // Listen for configuration changes
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('nuiget.showActivityBarBadge')) {
                    this._showActivityBarBadge = vscode.workspace.getConfiguration('nuiget').get<boolean>('showActivityBarBadge', true);
                    if (this._showActivityBarBadge) {
                        // Re-apply cached badge
                        this.setBadge(this._pendingBadgeCount, this._pendingBadgeTooltip);
                    } else {
                        // Clear the badge
                        this._clearBadge();
                    }
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

        // Periodic re-check every 10 minutes (catches new upstream versions)
        this._backgroundCheckTimer = setInterval(() => {
            this.checkUpdatesInBackground();
        }, 10 * 60 * 1000);

        // File watcher: *.csproj, *.fsproj, *.vbproj changes → debounced re-check
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{csproj,fsproj,vbproj}');
        const triggerDebounced = () => {
            if (this._fileWatcherDebounce) { clearTimeout(this._fileWatcherDebounce); }
            this._fileWatcherDebounce = setTimeout(() => {
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
     * Sets the Activity Bar badge and optionally sends results to the
     * webview if it's active. Uses lite mode + minimal checks.
     */
    public async checkUpdatesInBackground(force = false): Promise<void> {
        if (this._backgroundCheckInProgress) {
            if (force) { this._forceCheckPending = true; }
            return;
        }
        this._backgroundCheckInProgress = true;

        try {
            const projects = await this._nugetService.findProjects();
            if (projects.length === 0) { return; }

            // Validate persisted project: if it no longer exists on disk, reset to first available
            if (this._selectedProject && !projects.some(p => p.path === this._selectedProject)) {
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
            const allProjectUpdates: { projectPath: string; projectName: string; updates: { id: string; installedVersion: string; latestVersion: string }[] }[] = [];

            // Check all projects in parallel for faster badge display
            const projectResults = await Promise.all(projects.map(async (project) => {
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

            // Aggregate results
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

            // Cache results for when the webview resolves later
            this._pendingProjectUpdates = allProjectUpdates;
            this._pendingInstalledCount = selectedProjectInstalledCount;
            this._pendingInstalledProject = this._selectedProject || '';

            // Update Activity Bar badge with total update count
            const totalUpdateCount = allProjectUpdates.reduce((sum, pu) => sum + pu.updates.length, 0);
            const badgeTooltip = this._buildBadgeTooltip(allProjectUpdates);
            this.setBadge(totalUpdateCount, badgeTooltip);

            // If webview is active, push all-projects results and installed count
            if (!this._disposed && this._view) {
                this._postMessage({ type: 'allProjectsUpdates', projectUpdates: allProjectUpdates });
                if (selectedProjectInstalledCount >= 0) {
                    this._postMessage({ type: 'installedCountUpdate', count: selectedProjectInstalledCount });
                }
            }
        } catch (err) {
            this._outputChannel.error('checkUpdatesInBackground error:', String(err));
        } finally {
            this._backgroundCheckInProgress = false;
            if (this._forceCheckPending) {
                this._forceCheckPending = false;
                this.checkUpdatesInBackground(true);
            }
        }
    }

    /** Dispose background monitoring resources */
    public dispose(): void {
        this._disposed = true;
        this._clearBadge();
        if (this._backgroundCheckTimer) {
            clearInterval(this._backgroundCheckTimer);
            this._backgroundCheckTimer = undefined;
        }
        if (this._fileWatcherDebounce) {
            clearTimeout(this._fileWatcherDebounce);
            this._fileWatcherDebounce = undefined;
        }
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
        const items: vscode.QuickPickItem[] = sorted.map(p => ({
            label: p.name,
            description: p.path,
            picked: this._selectedProject === p.path
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select project',
            title: 'nUIget — Project'
        });

        if (selected) {
            const project = projects.find(p => p.name === selected.label);
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
        // Re-check updates so badge reflects the new prerelease setting
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
        // Re-check updates so badge reflects the new prerelease setting
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
        // Derive project name from path
        const projects = await this._nugetService.findProjects();
        const project = projects.find(p => p.path === projectPath);
        const projectName = project?.name || projectPath.split(/[\\/]/).pop() || '';
        this._postMessage({ type: 'projectChanged', projectPath, projectName });
        this._updateTitle(projectName);
    }

    /** Update the Activity Bar badge with update count and per-project tooltip */
    public setBadge(count: number, tooltip?: string): void {
        this._pendingBadgeCount = count;
        this._pendingBadgeTooltip = tooltip || '';

        if (!this._showActivityBarBadge) { return; }

        if (this._view && 'badge' in this._view) {
            (this._view as vscode.WebviewView).badge = count > 0
                ? { value: count, tooltip: tooltip || `${count} update${count === 1 ? '' : 's'} available` }
                : undefined;
        }
    }

    /** Clear the badge from the Activity Bar */
    private _clearBadge(): void {
        if (this._view && 'badge' in this._view) {
            (this._view as vscode.WebviewView).badge = undefined;
        }
    }

    /** Build a per-project tooltip string from project update data */
    private _buildBadgeTooltip(projectUpdates: { projectName: string; updates: { id: string }[] }[]): string {
        if (projectUpdates.length === 0) { return ''; }
        if (projectUpdates.length === 1) {
            const count = projectUpdates[0].updates.length;
            return `${count} update${count === 1 ? '' : 's'} available`;
        }
        const totalCount = projectUpdates.reduce((sum, pu) => sum + pu.updates.length, 0);
        const summary = `${totalCount} update${totalCount === 1 ? '' : 's'} available`;
        const perProject = projectUpdates
            .map(pu => `${pu.projectName} — ${pu.updates.length} update${pu.updates.length === 1 ? '' : 's'}`)
            .join('\n');
        return `${summary}\n${perProject}`;
    }

    /** Lightweight sidebar notification after a package operation from the main panel.
     * Skips HTTP cache clearing and source re-fetch (operation just talked to registry successfully).
     * Forwards operation details to sidebar webview for optimistic state updates. */
    public async notifySidebarOfChange(operation: { type: string; packageId?: string; projectPath?: string }): Promise<void> {
        // Forward operation details to sidebar webview for surgical UI updates
        this._postMessage({ type: 'packageChanged', operation });
        // Re-check updates in background for badge accuracy
        await this.checkUpdatesInBackground(true);
    }

    /** Full sidebar refresh: re-send sources, tell webview to re-fetch, and update badge */
    public async refreshSidebar(): Promise<void> {
        // Re-send sources (cache was just cleared by the caller)
        const sources = await this._nugetService.getSources();
        this._postMessage({ type: 'sources', sources: sources.filter(s => s.enabled) });
        // Tell webview to re-fetch installed packages and updates
        this._postMessage({ type: 'forceRefresh' });
        // Re-check updates for badge (force bypass the in-progress guard)
        await this.checkUpdatesInBackground(true);
    }

    /** Update the sidebar title bar description with the current project name */
    private _updateTitle(projectName?: string): void {
        if (!this._view) { return; }
        if (projectName) {
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
                        const projectInstalled = await queryAllProjectsInstalled(this._nugetService);
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
                    this._operationInProgress = true;
                    try {
                        await executeSingleOperation(this._opCtx(), 'install', data.projectPath, data.packageId, data.version, data.sourceUrl);
                    } finally {
                        this._operationInProgress = false;
                        this.checkUpdatesInBackground(true);
                    }
                    break;
                }
            case 'updatePackage':
                {
                    if (this._operationInProgress) { break; }
                    this._operationInProgress = true;
                    try {
                        await executeSingleOperation(this._opCtx(), 'update', data.projectPath, data.packageId, data.version, data.sourceUrl);
                    } finally {
                        this._operationInProgress = false;
                        this.checkUpdatesInBackground(true);
                    }
                    break;
                }
            case 'removePackage':
                {
                    if (this._operationInProgress) { break; }
                    this._operationInProgress = true;
                    try {
                        await executeSingleOperation(this._opCtx(), 'remove', data.projectPath, data.packageId);
                    } finally {
                        this._operationInProgress = false;
                        this.checkUpdatesInBackground(true);
                    }
                    break;
                }
            case 'bulkUpdatePackages':
                {
                    if (this._operationInProgress) { break; }
                    this._operationInProgress = true;
                    try {
                        await executeBulkUpdatePackages(this._opCtx(), data.packages, data.projectPath);
                    } finally {
                        this._operationInProgress = false;
                        this.checkUpdatesInBackground(true);
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
                        this.checkUpdatesInBackground(true);
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
                        versions
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

        if (!projectPath) {
            vscode.window.showWarningMessage('Please select a project first.');
            return;
        }

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

        if (label.includes('Install Latest') || (label.includes('Update to ') && !label.includes('Update to Version'))) {
            const version = latestVersion || '';
            if (label.includes('Install')) {
                this._postMessage({ type: 'doInstall', packageId, version, projectPath });
            } else {
                this._postMessage({ type: 'doUpdate', packageId, version, projectPath, sourceUrl });
            }
        } else if (label.includes('Install Version') || label.includes('Change Version') || label.includes('Update to Version')) {
            // Fetch versions and show picker
            const versions = await this._nugetService.getPackageVersions(
                packageId,
                this._selectedSource === 'all' ? undefined : this._selectedSource,
                this._includePrerelease,
                50
            );
            if (versions.length === 0) {
                vscode.window.showInformationMessage(`No versions found for ${packageId}`);
                return;
            }

            const versionItems = versions.map(v => ({
                label: v,
                description: v === installedVersion ? '(installed)' : ''
            }));

            const selectedVersion = await vscode.window.showQuickPick(versionItems, {
                placeHolder: `Select version for ${packageId}`,
                title: `nUIget — ${packageId} Versions`
            });

            if (selectedVersion) {
                if (label.includes('Install Version')) {
                    this._postMessage({ type: 'doInstall', packageId, version: selectedVersion.label, projectPath });
                } else if (label.includes('Change Version')) {
                    // Change version = install specific version (dotnet add package replaces existing)
                    this._postMessage({ type: 'doInstall', packageId, version: selectedVersion.label, projectPath });
                } else {
                    this._postMessage({ type: 'doUpdate', packageId, version: selectedVersion.label, projectPath });
                }
            }
        } else if (label.includes('Uninstall')) {
            this._postMessage({ type: 'doRemove', packageId, projectPath });
        } else if (label.includes('Copy Package ID')) {
            await vscode.env.clipboard.writeText(packageId);
            vscode.window.setStatusBarMessage(`Copied "${packageId}" to clipboard`, 2000);
        } else if (label.includes('View Package Details')) {
            vscode.commands.executeCommand('nuiget.viewPackageDetails', {
                packageId,
                version: latestVersion || installedVersion
            });
        }
    }

    // ------ Helpers ------

    private async _sendInitialData(): Promise<void> {
        // Fetch projects first to auto-select if needed
        const projects = await this._nugetService.findProjects();

        // Validate persisted project: if it no longer exists on disk, reset to first available.
        // This prevents a stuck loading spinner when the project was moved/renamed/deleted.
        if (this._selectedProject && projects.length > 0 && !projects.some(p => p.path === this._selectedProject)) {
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

        // Apply pending badge (may have been set before view resolved)
        if (this._pendingBadgeCount > 0) {
            this.setBadge(this._pendingBadgeCount, this._pendingBadgeTooltip);
        }
    }

    private _sendState(): void {
        this._postMessage({
            type: 'state',
            selectedSource: this._selectedSource,
            selectedProject: this._selectedProject,
            includePrerelease: this._includePrerelease
        });
    }

    /** Build an OperationContext for shared operation functions. */
    private _opCtx(): OperationContext {
        return {
            nugetService: this._nugetService,
            postMessage: (msg: unknown) => this._postMessage(msg),
            notifyOtherPanel: () => NuGetSidebarProvider._notifyMainPanel(),
        };
    }

    private _postMessage(message: unknown): void {
        if (!this._disposed && this._view) {
            this._view.webview.postMessage(message);
        }
    }

    /** Notify the main panel to refresh if it's open */
    private static _notifyMainPanel(): void {
        // Import would be circular, so use command
        vscode.commands.executeCommand('nuiget.refreshPackages');
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

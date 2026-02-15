import * as vscode from 'vscode';
import { InstalledPackage, NuGetService } from '../services/NuGetService';
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
        // Initial background check after a 5-second delay to avoid competing with activation
        setTimeout(() => this.checkUpdatesInBackground(), 5000);

        // Periodic re-check every 10 minutes (catches new upstream versions)
        this._backgroundCheckTimer = setInterval(() => {
            this.checkUpdatesInBackground();
        }, 10 * 60 * 1000);

        // File watcher: *.csproj, *.fsproj, *.vbproj changes → debounced re-check
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{csproj,fsproj,vbproj}');
        const triggerDebounced = () => {
            if (this._fileWatcherDebounce) clearTimeout(this._fileWatcherDebounce);
            this._fileWatcherDebounce = setTimeout(() => this.checkUpdatesInBackground(), 5000);
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
    public async checkUpdatesInBackground(): Promise<void> {
        if (this._backgroundCheckInProgress) return; // skip if already running
        this._backgroundCheckInProgress = true;

        try {
            const projects = await this._nugetService.findProjects();
            if (projects.length === 0) return;

            // Auto-select first project if none selected
            if (!this._selectedProject && projects.length > 0) {
                this._selectedProject = projects[0].path;
                this._updateTitle();
            }

            let totalUpdates = 0;
            let selectedProjectInstalledCount = -1;
            const allProjectUpdates: { projectPath: string; projectName: string; updates: { id: string; installedVersion: string; latestVersion: string }[] }[] = [];

            for (const project of projects) {
                try {
                    const installed = await this._nugetService.getInstalledPackages(project.path, true /* liteMode */);
                    // Track installed count for the selected project (for sidebar badge)
                    if (project.path === this._selectedProject) {
                        selectedProjectInstalledCount = installed.length;
                    }
                    if (installed.length > 0) {
                        const updates = await this._nugetService.checkPackageUpdatesMinimal(installed, this._includePrerelease);
                        if (updates.length > 0) {
                            totalUpdates += updates.length;
                            allProjectUpdates.push({
                                projectPath: project.path,
                                projectName: project.name,
                                updates
                            });
                        }
                    }
                } catch {
                    // Skip individual project errors silently
                }
            }

            // Always set badge (works even without webview)
            this.setBadge(totalUpdates);

            // If webview is active, push all-projects results and installed count
            if (!this._disposed && this._view) {
                this._postMessage({ type: 'allProjectsUpdates', projectUpdates: allProjectUpdates });
                if (selectedProjectInstalledCount >= 0) {
                    this._postMessage({ type: 'installedCountUpdate', count: selectedProjectInstalledCount });
                }
            }
        } catch {
            // Background check failed silently — don't bother the user
        } finally {
            this._backgroundCheckInProgress = false;
        }
    }

    /** Dispose background monitoring resources */
    public dispose(): void {
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

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select package source',
            title: 'nUIget — Package Source'
        });

        if (selected) {
            if (selected.label === 'All Sources') {
                this._selectedSource = 'all';
            } else {
                const source = enabledSources.find(s => s.name === selected.label);
                this._selectedSource = source?.url || 'all';
            }
            this._postMessage({ type: 'sourceChanged', source: this._selectedSource });
            this._context.workspaceState.update('nuget.selectedSource', this._selectedSource);
            // Sync to main panel
            NuGetPanel.syncSource(this._selectedSource);
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

    /** Update the Activity Bar badge with update count */
    public setBadge(count: number): void {
        if (this._view) {
            this._view.badge = count > 0
                ? { value: count, tooltip: `${count} package update${count !== 1 ? 's' : ''} available` }
                : undefined;
        }
    }

    /** Update the sidebar title bar with the current project name */
    private _updateTitle(projectName?: string): void {
        if (!this._view) return;
        if (projectName) {
            this._view.title = projectName.replace(/\.(csproj|fsproj|vbproj)$/, '');
        } else if (this._selectedProject) {
            const base = this._selectedProject.split(/[\\/]/).pop() || '';
            this._view.title = base.replace(/\.(csproj|fsproj|vbproj)$/, '');
        } else {
            this._view.title = 'Packages';
        }
    }

    // ------ Private message handling ------

    private async _handleMessage(data: Record<string, unknown>): Promise<void> {
        switch (data.type) {
            case 'ready':
                {
                    // Sidebar webview is ready — send initial state
                    await this._sendInitialData();
                    break;
                }
            case 'searchPackages':
                {
                    const query = data.query as string;
                    this._latestSearchQuery = query;

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

                    if (this._latestSearchQuery !== query) break;

                    // Save to recent searches
                    await this._addRecentSearch(query);

                    this._postMessage({ type: 'searchResults', results, query });
                    break;
                }
            case 'getInstalledPackages':
                {
                    const packages = await this._nugetService.getInstalledPackages(
                        data.projectPath as string, true /* liteMode */
                    );
                    this._postMessage({
                        type: 'installedPackages',
                        packages,
                        projectPath: data.projectPath
                    });
                    break;
                }
            case 'checkPackageUpdates':
                {
                    // Always use minimal for sidebar
                    const minimalUpdates = await this._nugetService.checkPackageUpdatesMinimal(
                        data.installedPackages as InstalledPackage[],
                        data.includePrerelease as boolean
                    );
                    this._postMessage({
                        type: 'packageUpdatesMinimal',
                        updates: minimalUpdates,
                        projectPath: data.projectPath
                    });
                    break;
                }
            case 'checkAllProjectsUpdates':
                {
                    const includePrerelease = data.includePrerelease as boolean;
                    const projects = await this._nugetService.findProjects();
                    const allProjectsUpdates: { projectPath: string; projectName: string; updates: { id: string; installedVersion: string; latestVersion: string }[] }[] = [];
                    let totalUpdates = 0;

                    for (const project of projects) {
                        try {
                            const installedPackages = await this._nugetService.getInstalledPackages(project.path, true);
                            if (installedPackages.length > 0) {
                                const updates = await this._nugetService.checkPackageUpdatesMinimal(installedPackages, includePrerelease);
                                if (updates.length > 0) {
                                    totalUpdates += updates.length;
                                    allProjectsUpdates.push({
                                        projectPath: project.path,
                                        projectName: project.name,
                                        updates
                                    });
                                }
                            }
                        } catch (error) {
                            console.error(`[nUIget Sidebar] Failed to check updates for ${project.name}:`, error);
                        }
                    }

                    this._postMessage({ type: 'allProjectsUpdates', projectUpdates: allProjectsUpdates });
                    this.setBadge(totalUpdates);
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
                            success,
                            packageId: data.packageId,
                            projectPath: data.projectPath
                        });
                        // Also notify the main panel if open
                        NuGetSidebarProvider._notifyMainPanel();
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
                            success,
                            packageId: data.packageId,
                            projectPath: data.projectPath
                        });
                        NuGetSidebarProvider._notifyMainPanel();
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
                            success,
                            packageId: data.packageId,
                            projectPath: data.projectPath
                        });
                        NuGetSidebarProvider._notifyMainPanel();
                    });
                    break;
                }
            case 'bulkUpdatePackages':
                {
                    const packages = data.packages as { id: string; version: string }[];
                    const projectPath = data.projectPath as string;

                    this._nugetService.setupOutputChannel();

                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Updating ${packages.length} packages...`,
                        cancellable: false
                    }, async (progress) => {
                        let successCount = 0;
                        let failCount = 0;

                        for (let i = 0; i < packages.length; i++) {
                            const pkg = packages[i];
                            progress.report({
                                message: `(${i + 1}/${packages.length}) ${pkg.id}`,
                                increment: 100 / packages.length
                            });
                            const success = await this._nugetService.updatePackage(
                                projectPath, pkg.id, pkg.version, { skipChannelSetup: true }
                            );
                            if (success) successCount++; else failCount++;
                        }

                        if (failCount === 0) {
                            vscode.window.showInformationMessage(`Updated ${successCount} packages successfully.`);
                        } else {
                            vscode.window.showWarningMessage(`Updated ${successCount}, failed ${failCount}.`);
                        }
                    });

                    this._postMessage({ type: 'bulkUpdateResult', projectPath });
                    NuGetSidebarProvider._notifyMainPanel();
                    break;
                }
            case 'bulkUpdateAllProjects':
                {
                    const projectUpdates = data.projectUpdates as { projectPath: string; projectName: string; packages: { id: string; version: string }[] }[];
                    if (!projectUpdates || projectUpdates.length === 0) break;

                    const totalPackages = projectUpdates.reduce((sum, pu) => sum + pu.packages.length, 0);
                    this._nugetService.setupOutputChannel();

                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Updating ${totalPackages} packages across ${projectUpdates.length} projects...`,
                        cancellable: false
                    }, async (progress) => {
                        let totalSuccess = 0;
                        let totalFail = 0;
                        let completed = 0;

                        for (const pu of projectUpdates) {
                            this._nugetService.logBulkOperationHeader(`Updating ${pu.packages.length} packages for ${pu.projectName}`, 0);
                            for (const pkg of pu.packages) {
                                completed++;
                                progress.report({
                                    message: `(${completed}/${totalPackages}) ${pu.projectName}: ${pkg.id}`,
                                    increment: 100 / totalPackages
                                });
                                const success = await this._nugetService.updatePackage(
                                    pu.projectPath, pkg.id, pkg.version, { skipChannelSetup: true }
                                );
                                if (success) totalSuccess++; else totalFail++;
                            }
                        }

                        if (totalFail === 0) {
                            vscode.window.showInformationMessage(`Updated ${totalSuccess} packages across ${projectUpdates.length} projects.`);
                        } else {
                            vscode.window.showWarningMessage(`Updated ${totalSuccess}, failed ${totalFail} across ${projectUpdates.length} projects.`);
                        }
                    });

                    this._postMessage({ type: 'bulkUpdateAllProjectsResult' });
                    NuGetSidebarProvider._notifyMainPanel();
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
                        versions
                    });
                    break;
                }
            case 'showContextMenu':
                {
                    await this._showContextMenu(data);
                    break;
                }
            case 'getRecentSearches':
                {
                    const searches = this._context.workspaceState.get<string[]>('nuget.recentSearches', []);
                    const limit = vscode.workspace.getConfiguration('nuiget').get<number>('recentSearchesLimit', 5);
                    this._postMessage({
                        type: 'recentSearches',
                        searches: searches.slice(0, limit)
                    });
                    break;
                }
            case 'clearRecentSearches':
                {
                    await this._context.workspaceState.update('nuget.recentSearches', []);
                    this._postMessage({ type: 'recentSearches', searches: [] });
                    break;
                }
        }
    }

    // ------ Context menu ------

    private async _showContextMenu(data: Record<string, unknown>): Promise<void> {
        const packageId = data.packageId as string;
        const installedVersion = data.installedVersion as string | undefined;
        const latestVersion = data.latestVersion as string | undefined;
        const context = data.context as 'browse' | 'installed' | 'updates';
        const projectPath = data.projectPath as string;

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
            items.push({ label: '$(arrow-up) Update to ' + (latestVersion || 'latest'), description: '' });
            items.push({ label: '$(list-ordered) Update to Version...', description: 'Select a specific version' });
            items.push({ label: '$(close) Uninstall', description: installedVersion || '' });
        }

        items.push({ label: '$(clippy) Copy Package ID', description: packageId });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `${packageId} — Actions`,
            title: `nUIget — ${packageId}`
        });

        if (!selected) return;

        const label = selected.label;

        if (label.includes('Install Latest') || label.includes('Update to ')) {
            const version = latestVersion || '';
            if (label.includes('Install')) {
                this._postMessage({ type: 'doInstall', packageId, version, projectPath });
            } else {
                this._postMessage({ type: 'doUpdate', packageId, version, projectPath });
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
        }
    }

    // ------ Helpers ------

    private async _sendInitialData(): Promise<void> {
        // Fetch projects first to auto-select if needed
        const projects = await this._nugetService.findProjects();

        // Auto-select first project if none selected (before sending state)
        if (!this._selectedProject && projects.length > 0) {
            this._selectedProject = projects[0].path;
            this._updateTitle();
        }

        // Send recent searches
        const recentSearches = this._context.workspaceState.get<string[]>('nuget.recentSearches', []);
        const limit = vscode.workspace.getConfiguration('nuiget').get<number>('recentSearchesLimit', 5);

        // Send current state FIRST so the webview knows selectedProject
        // before receiving the projects list (avoids wrong auto-select)
        this._postMessage({
            type: 'state',
            selectedSource: this._selectedSource,
            selectedProject: this._selectedProject,
            includePrerelease: this._includePrerelease,
            recentSearches: recentSearches.slice(0, limit)
        });

        // Send projects (webview already has selectedProject set)
        this._postMessage({ type: 'projects', projects });

        // Send sources
        const sources = await this._nugetService.getSources();
        this._postMessage({ type: 'sources', sources: sources.filter(s => s.enabled) });
    }

    private _sendState(): void {
        this._postMessage({
            type: 'state',
            selectedSource: this._selectedSource,
            selectedProject: this._selectedProject,
            includePrerelease: this._includePrerelease
        });
    }

    private async _addRecentSearch(query: string): Promise<void> {
        const limit = vscode.workspace.getConfiguration('nuiget').get<number>('recentSearchesLimit', 5);
        if (limit === 0) return;

        let searches = this._context.workspaceState.get<string[]>('nuget.recentSearches', []);
        // Remove duplicates and add to front
        searches = [query, ...searches.filter(s => s.toLowerCase() !== query.toLowerCase())].slice(0, limit);
        await this._context.workspaceState.update('nuget.recentSearches', searches);
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
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; connect-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>nUIget Sidebar</title>
                <link rel="stylesheet" href="${cssUri}">
                <style>
                    body {
                        padding: 0;
                        margin: 0;
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-sideBar-background, var(--vscode-editor-background));
                    }
                    #sidebar-root {
                        width: 100%;
                        min-height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }
                </style>
            </head>
            <body>
                <div id="sidebar-root" data-package-icon="${packageIconUri}"></div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

import * as vscode from 'vscode';
import { http2Client } from './services/Http2Client';
import { configurePerf } from './services/NuGetPerf';
import { NuGetService } from './services/NuGetService';
import { workspaceCache } from './services/WorkspaceCache';
import { NuGetPanel } from './webview/NuGetPanel';
import { NuGetSidebarProvider } from './webview/NuGetSidebarPanel';

let outputChannel: vscode.LogOutputChannel;
let nugetService: NuGetService;

export async function activate(context: vscode.ExtensionContext) {
    // Initialize workspace cache for persistent caching
    workspaceCache.initialize(context);

    // Create log output channel for package operations (supports color-coded log levels)
    outputChannel = vscode.window.createOutputChannel('nUIget', { log: true });
    context.subscriptions.push(outputChannel);
    outputChannel.info('nUIget extension is now active');

    // Initialize performance instrumentation (no-op unless nuiget.enablePerformanceLogging)
    context.subscriptions.push(configurePerf(outputChannel));

    // Create shared NuGetService singleton — reused by both main panel and sidebar
    nugetService = new NuGetService(outputChannel);

    // Plan 11: hydrate persisted SDK version cache so warm starts skip the
    // ~250ms `dotnet --version` probe per project directory. Snapshot is keyed
    // by extension version, so an upgrade automatically discards stale entries.
    const extensionVersion = context.extension?.packageJSON?.version ?? '0.0.0';
    nugetService.hydrateSdkVersionCache(context.globalState, 'nuiget.sdkVersionCache', extensionVersion);

    // Start background source health monitor — validates all enabled sources at startup,
    // then self-schedules: 120s if any fail, 5min if all healthy. Replaces per-search blocking.
    nugetService.startSourceHealthMonitor();
    context.subscriptions.push({ dispose: () => nugetService.stopSourceHealthMonitor() });

    // Pre-warm credentials for authenticated feeds (fire-and-forget)
    nugetService.initializeCredentials().catch(() => { /* ignore */ });

    // Set context key for conditional sidebar visibility
    let projectFileDebounce: ReturnType<typeof setTimeout> | undefined;
    const updateProjectFilesContext = async () => {
        const projects = await nugetService.findProjects();
        vscode.commands.executeCommand('setContext', 'nuiget.hasProjectFiles', projects.length > 0);
    };
    updateProjectFilesContext().catch(error => {
        console.error('[nUIget] Failed to update project files context:', error);
    });
    const projectFileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{csproj,fsproj,vbproj}');
    const debouncedUpdate = () => {
        if (projectFileDebounce) { clearTimeout(projectFileDebounce); }
        projectFileDebounce = setTimeout(updateProjectFilesContext, 1500);
    };
    projectFileWatcher.onDidCreate(debouncedUpdate);
    projectFileWatcher.onDidDelete(debouncedUpdate);
    context.subscriptions.push({ dispose: () => { if (projectFileDebounce) { clearTimeout(projectFileDebounce); } } });
    context.subscriptions.push(projectFileWatcher);

    // Watch global.json for SDK version changes → invalidate SDK version cache
    const globalJsonWatcher = vscode.workspace.createFileSystemWatcher('**/global.json');
    const invalidateSdkCache = () => nugetService.clearSdkVersionCache();
    globalJsonWatcher.onDidChange(invalidateSdkCache);
    globalJsonWatcher.onDidCreate(invalidateSdkCache);
    globalJsonWatcher.onDidDelete(invalidateSdkCache);
    context.subscriptions.push(globalJsonWatcher);

    // Register sidebar webview provider
    // One-time migration: legacy `nuiget.noRestore` config setting → `nuget.restoreEnabled` workspaceState.
    // The setting was removed in favour of a synced UI toggle (sidebar title-bar icon + main panel checkbox).
    //
    // Multi-root handling: `inspect()` without a resource URI does not surface workspaceFolder-scoped
    // values in multi-root workspaces. We probe each folder's URI and apply a "most restrictive wins"
    // collapse — if the user set `noRestore: true` for any scope (global/workspace/any folder), we
    // migrate to `restoreEnabled: false`. This errs on the side of preserving a user's explicit opt-out.
    const restoreMigrated = context.workspaceState.get<boolean>('nuget.restoreEnabledMigrated', false);
    if (!restoreMigrated) {
        const probes: (boolean | undefined)[] = [];
        const rootInspect = vscode.workspace.getConfiguration('nuiget').inspect<boolean>('noRestore');
        probes.push(rootInspect?.globalValue, rootInspect?.workspaceValue);
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            const folderInspect = vscode.workspace.getConfiguration('nuiget', folder.uri).inspect<boolean>('noRestore');
            probes.push(folderInspect?.workspaceFolderValue);
        }
        const explicit = probes.filter((v): v is boolean => typeof v === 'boolean');
        if (explicit.length > 0) {
            // Most-restrictive wins: any `noRestore: true` → `restoreEnabled: false`.
            const anyNoRestore = explicit.some(v => v === true);
            await context.workspaceState.update('nuget.restoreEnabled', !anyNoRestore);
        }
        await context.workspaceState.update('nuget.restoreEnabledMigrated', true);
    }

    // Synchronously initialize the in-memory restore cache + context keys BEFORE registering the
    // sidebar provider so the title-bar icon paints with the correct state on first activation.
    const restoreEnabled = context.workspaceState.get<boolean>('nuget.restoreEnabled', true);
    const includePrerelease = context.workspaceState.get<boolean>('nuget.includePrerelease', false);
    NuGetPanel.initRestoreCache(restoreEnabled);
    await Promise.all([
        vscode.commands.executeCommand('setContext', 'nuiget.restoreEnabled', restoreEnabled),
        vscode.commands.executeCommand('setContext', 'nuiget.prereleaseEnabled', includePrerelease),
    ]);

    const sidebarProvider = new NuGetSidebarProvider(context.extensionUri, context, outputChannel, nugetService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            NuGetSidebarProvider.viewType,
            sidebarProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Start background update monitoring (file watcher + 10-min timer)
    sidebarProvider.startBackgroundMonitoring();
    context.subscriptions.push({ dispose: () => sidebarProvider.dispose() });

    // Workspace folder add/remove → refresh main panel + sidebar so any in-flight
    // streamed All-Projects enumeration aborts and restarts with the new folder list.
    // Debounce 300ms to coalesce rapid add+remove sequences.
    let workspaceFoldersDebounce: ReturnType<typeof setTimeout> | undefined;
    const workspaceFoldersListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        if (workspaceFoldersDebounce) { clearTimeout(workspaceFoldersDebounce); }
        workspaceFoldersDebounce = setTimeout(() => {
            workspaceFoldersDebounce = undefined;
            NuGetPanel.refresh();
            sidebarProvider.refreshSidebar();
        }, 300);
    });
    context.subscriptions.push(workspaceFoldersListener);
    context.subscriptions.push({ dispose: () => { if (workspaceFoldersDebounce) { clearTimeout(workspaceFoldersDebounce); workspaceFoldersDebounce = undefined; } } });

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.openManager', (contextArg?: unknown) => {
            // Extract project path from context menu argument
            let projectPath: string | undefined;

            if (contextArg) {
                // Explorer context menu: contextArg is a Uri
                if (contextArg instanceof vscode.Uri) {
                    projectPath = contextArg.fsPath;
                }
                // Solution Explorer context menu: contextArg may be a tree item with various structures
                else if (typeof contextArg === 'object') {
                    const arg = contextArg as Record<string, unknown>;
                    // Try resourceUri (common pattern)
                    if (arg.resourceUri instanceof vscode.Uri) {
                        projectPath = arg.resourceUri.fsPath;
                    }
                    // Try fsPath directly
                    else if (typeof arg.fsPath === 'string') {
                        projectPath = arg.fsPath;
                    }
                    // Try path property
                    else if (typeof arg.path === 'string') {
                        projectPath = arg.path;
                    }
                    // C# Dev Kit may use projectPath or filePath
                    else if (typeof arg.projectPath === 'string') {
                        projectPath = arg.projectPath;
                    }
                    else if (typeof arg.filePath === 'string') {
                        projectPath = arg.filePath;
                    }
                }
            }

            // Always start on 'installed' tab — browse is now an inline search mode, not a separate tab
            const initialTab: 'installed' | 'updates' = 'installed';
            NuGetPanel.createOrShow(context.extensionUri, context, outputChannel, nugetService, projectPath, initialTab);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.refreshPackages', () => {
            // Internal command: sidebar calls this after install/update/remove to sync main panel
            NuGetPanel.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.refreshPackagesScoped', (operation?: { type: string; packageId?: string; packageIds?: string[]; projectPath?: string }) => {
            // Internal command: sidebar calls this with operation scope after install/update/remove
            // to sync main panel without triggering a full update check (sidebar already checked)
            if (operation) {
                NuGetPanel.refreshScoped(operation);
            } else {
                NuGetPanel.refresh();
            }
        })
    );

    // Sidebar title bar commands
    // Wire up cross-panel prerelease sync: main panel → sidebar
    NuGetPanel.onPrereleaseChanged = (value: boolean) => {
        sidebarProvider.syncPrerelease(value);
    };
    // Wire up cross-panel "Restore after operations" sync: main panel → sidebar
    NuGetPanel.onRestoreChanged = (value: boolean) => {
        sidebarProvider.syncRestore(value);
    };
    // Wire up cross-panel source sync: main panel → sidebar
    NuGetPanel.onSourceChanged = (value: string) => {
        sidebarProvider.syncSource(value);
    };
    // Wire up cross-panel project sync: main panel → sidebar
    NuGetPanel.onProjectChanged = (value: string) => {
        sidebarProvider.syncProject(value);
    };
    // Wire up cross-panel package change sync: main panel → sidebar
    // Uses lightweight notification path that skips HTTP cache clearing and source re-fetch
    NuGetPanel.onPackageChanged = (operation) => {
        sidebarProvider.notifySidebarOfChange(operation);
    };
    // Wire up cross-panel full refresh sync: main panel → sidebar
    NuGetPanel.onRefreshAll = () => {
        sidebarProvider.refreshSidebar();
    };
    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.sidebar.selectSource', () => {
            sidebarProvider.showSourcePicker();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.sidebar.selectProject', () => {
            sidebarProvider.showProjectPicker();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.sidebar.togglePrerelease', () => {
            sidebarProvider.togglePrerelease();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.sidebar.togglePrereleaseOff', () => {
            sidebarProvider.togglePrerelease();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.sidebar.toggleRestore', () => sidebarProvider.toggleRestore())
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.sidebar.toggleRestoreOff', () => sidebarProvider.toggleRestore())
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.sidebar.refresh', () => {
            // refreshSidebar() handles cache clearing (sync in-memory + background disk)
            sidebarProvider.refreshSidebar();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.sidebar.openFullView', () => {
            NuGetPanel.createOrShow(context.extensionUri, context, outputChannel, nugetService);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.clearHttpCache', async () => {
            await nugetService.clearNuGetHttpCache();
            vscode.window.showInformationMessage('nUIget: NuGet HTTP cache cleared.');
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.clearSdkVersionCache', async () => {
            // Plan 11 fix (I3): expose a manual escape hatch in case the persisted
            // SDK-major map gets stale (rare; extension-version stamping handles
            // most cases automatically).
            nugetService.clearSdkVersionCache();
            await nugetService.flushPersistedSdkCache();
            vscode.window.showInformationMessage('nUIget: SDK version cache cleared.');
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.viewPackageDetails', (args: { packageId: string; version?: string }) => {
            if (args?.packageId) {
                NuGetPanel.navigateToPackage(context.extensionUri, context, outputChannel, nugetService, args.packageId, args.version);
            }
        })
    );
}

export function deactivate() {
    // Close HTTP/2 sessions to clean up resources
    http2Client.closeAll();
}

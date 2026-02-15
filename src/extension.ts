import * as vscode from 'vscode';
import { http2Client } from './services/Http2Client';
import { NuGetService } from './services/NuGetService';
import { workspaceCache } from './services/WorkspaceCache';
import { NuGetPanel } from './webview/NuGetPanel';
import { NuGetSidebarProvider } from './webview/NuGetSidebarPanel';

let outputChannel: vscode.LogOutputChannel;
let nugetService: NuGetService;

export function activate(context: vscode.ExtensionContext) {
    console.log('nUIget extension is now active');

    // Initialize workspace cache for persistent caching
    workspaceCache.initialize(context);

    // Create log output channel for package operations (supports color-coded log levels)
    outputChannel = vscode.window.createOutputChannel('nUIget', { log: true });
    context.subscriptions.push(outputChannel);

    // Create shared NuGetService singleton — reused by both main panel and sidebar
    nugetService = new NuGetService(outputChannel);

    // Pre-warm nuget.org service index for faster first search
    nugetService.prewarmNugetOrgServiceIndex();

    // Pre-warm credentials for authenticated feeds (fire-and-forget)
    nugetService.initializeCredentials().catch(() => {
        // Ignore errors - credentials will be loaded on-demand if prewarm fails
    });

    // Register sidebar webview provider
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

            // Default to 'installed' tab when opened from context menu (project-specific intent)
            // Default to 'browse' tab when opened from command palette (discovery intent)
            const initialTab = projectPath ? 'installed' : 'browse';
            NuGetPanel.createOrShow(context.extensionUri, context, outputChannel, nugetService, projectPath, initialTab);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.refreshPackages', () => {
            NuGetPanel.refresh();
        })
    );

    // Sidebar title bar commands
    // Wire up cross-panel prerelease sync: main panel → sidebar
    NuGetPanel.onPrereleaseChanged = (value: boolean) => {
        sidebarProvider.syncPrerelease(value);
    };
    // Wire up cross-panel source sync: main panel → sidebar
    NuGetPanel.onSourceChanged = (value: string) => {
        sidebarProvider.syncSource(value);
    };
    // Wire up cross-panel project sync: main panel → sidebar
    NuGetPanel.onProjectChanged = (value: string) => {
        sidebarProvider.syncProject(value);
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
        vscode.commands.registerCommand('nuiget.sidebar.openFullView', () => {
            NuGetPanel.createOrShow(context.extensionUri, context, outputChannel, nugetService);
        })
    );
}

export function deactivate() {
    // Close HTTP/2 sessions to clean up resources
    http2Client.closeAll();
}

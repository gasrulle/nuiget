import * as vscode from 'vscode';
import { http2Client } from './services/Http2Client';
import { workspaceCache } from './services/WorkspaceCache';
import { NuGetPanel } from './webview/NuGetPanel';

let outputChannel: vscode.LogOutputChannel;

export function activate(context: vscode.ExtensionContext) {
    console.log('nUIget extension is now active');

    // Initialize workspace cache for persistent caching
    workspaceCache.initialize(context);

    // Create log output channel for package operations (supports color-coded log levels)
    outputChannel = vscode.window.createOutputChannel('nUIget', { log: true });
    context.subscriptions.push(outputChannel);

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
            NuGetPanel.createOrShow(context.extensionUri, context, outputChannel, projectPath, initialTab);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nuiget.refreshPackages', () => {
            NuGetPanel.refresh();
        })
    );
}

export function deactivate() {
    // Close HTTP/2 sessions to clean up resources
    http2Client.closeAll();
}

/**
 * Shared host services: everything both webview hosts need from VS Code, assembled once by
 * `extension.ts`. Hosts stay thin adapters (ADR-007); business logic lives in `src/core`.
 */

import { randomBytes } from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import type { DotnetRunner, Event, Logger, OperationQueue, ProjectInspector, SessionStore, SourceProvider } from '../core/contracts';
import type { Catalog } from '../core/catalog';
import type { PackageWorkflows, WorkflowDeps } from '../core/ops';
import type { BulkOutcome, ExtensionConfig, InvalidationReason, InvalidationScope, OperationOutcome, OperationProgress, Project } from '../protocol';
import { Emitter } from '../core/util/events';
import { normalizeProjectPath } from '../core/util/paths';

export interface HostServices {
    readonly context: vscode.ExtensionContext;
    readonly logger: Logger;
    readonly session: SessionStore;
    readonly catalog: Catalog;
    readonly queue: OperationQueue;
    readonly workflows: PackageWorkflows;
    readonly sources: SourceProvider;
    /** Fired after any operation completes (either surface); hosts forward it as `ops/completed`. */
    readonly onOperationCompleted: Event<OperationOutcome | BulkOutcome>;
    /** `queue.onProgress`; hosts forward it as `ops/progress`. */
    readonly onOperationProgress: Event<OperationProgress>;
    readonly onConfigChanged: Event<ExtensionConfig>;
    readonly onProjectsChanged: Event<Project[]>;
    /** Invalidate resources and let both hosts broadcast. */
    invalidate(scope: InvalidationScope, reason: InvalidationReason): void;
    /** Emit a completed operation to every surface. */
    announceOperation(outcome: OperationOutcome | BulkOutcome): void;
    config(): ExtensionConfig;
    /** Workspace folder (fsPath) containing `projectPath`, or the first folder when none is given; `undefined` without a workspace. */
    workspaceFolderFor(projectPath?: string): string | undefined;
}

export interface WorkflowDepsOptions {
    runner: DotnetRunner;
    catalog: Catalog;
    inspector: ProjectInspector;
    queue: Pick<OperationQueue, 'onDidChange'>;
    logger?: Logger;
    onCommand?: WorkflowDeps['onCommand'];
}

/**
 * The dependencies of `PackageWorkflows` as the host supplies them. Whether a project uses Central
 * Package Management is asked once per project while an operation runs: the answer is kept until the
 * queue has nothing running. A project that the inspector cannot support rejects, which makes the
 * workflow refuse the edit; a read that fails is not kept.
 */
export function createWorkflowDeps(deps: WorkflowDepsOptions): WorkflowDeps {
    const cpm = new Map<string, Promise<boolean>>();
    deps.queue.onDidChange(({ active }) => {
        if (active === 0) {
            cpm.clear();
        }
    });
    return {
        runner: deps.runner,
        packageDependencies: projectPath => deps.catalog.packageDependencies(projectPath),
        projectDependencies: projectPaths => deps.catalog.projectDependencies(projectPaths),
        isCpmProject: projectPath => {
            const key = normalizeProjectPath(projectPath);
            let answer = cpm.get(key);
            if (answer === undefined) {
                answer = deps.inspector.inspect(projectPath).then(result => {
                    if (result.unsupported) {
                        throw new Error(result.unsupported.message);
                    }
                    return result.isCpm;
                });
                cpm.set(key, answer);
                answer.catch(() => {
                    if (cpm.get(key) === answer) {
                        cpm.delete(key);
                    }
                });
            }
            return answer;
        },
        logger: deps.logger,
        onCommand: deps.onCommand,
    };
}

export function readExtensionConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration('nuiget');
    const mode = config.get<string>('searchDebounceMode', 'quicksearch');
    return {
        searchDebounceMode: mode === 'fullsearch' ? 'fullsearch' : 'quicksearch',
        quickSearchResultsPerSource: config.get<number>('quickSearchResultsPerSource', 5),
        searchResultLimit: config.get<number>('searchResultLimit', 50),
        enablePerformanceLogging: config.get<boolean>('enablePerformanceLogging', false),
        treeIndent: vscode.workspace.getConfiguration('workbench.tree').get<number>('indent', 8),
        isWindows: process.platform === 'win32',
    };
}

/** Build the webview HTML with a hardened CSP (ADR-006: no remote origins; images are `data:` URIs). */
export function renderWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, options: { script: string; style: string; rootId: string; title: string; dataset?: Record<string, string> }): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', options.script));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', options.style));
    const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'package-icon.png'));
    const nonce = createNonce();
    const dataset = Object.entries({ 'package-icon': iconUri.toString(), ...(options.dataset ?? {}) })
        .map(([key, value]) => ` data-${key}="${escapeAttribute(value)}"`)
        .join('');
    const csp = [
        "default-src 'none'",
        `img-src ${webview.cspSource} data:`,
        `style-src ${webview.cspSource}`,
        `font-src ${webview.cspSource}`,
        `script-src 'nonce-${nonce}'`,
        "connect-src 'none'",
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(options.title)}</title>
    <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <div id="${options.rootId}"${dataset}></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/** 16 random bytes, fresh for every render (ADR-006). */
function createNonce(): string {
    return randomBytes(16).toString('base64');
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch));
}

function escapeAttribute(text: string): string {
    return escapeHtml(text);
}

/** VS Code `LogOutputChannel` adapter for the core `Logger` contract. */
export function loggerFor(channel: vscode.LogOutputChannel): Logger {
    return {
        trace: (message, ...args) => channel.trace(message, ...args),
        debug: (message, ...args) => channel.debug(message, ...args),
        info: (message, ...args) => channel.info(message, ...args),
        warn: (message, ...args) => channel.warn(message, ...args),
        error: (message, ...args) => channel.error(message as string, ...args),
    };
}

/** Small typed broadcast hub used by `extension.ts` to implement `HostServices` events. */
export class HostEvents {
    readonly operationCompleted = new Emitter<OperationOutcome | BulkOutcome>();
    readonly operationProgress = new Emitter<OperationProgress>();
    readonly configChanged = new Emitter<ExtensionConfig>();
    readonly projectsChanged = new Emitter<Project[]>();

    dispose(): void {
        this.operationCompleted.dispose();
        this.operationProgress.dispose();
        this.configChanged.dispose();
        this.projectsChanged.dispose();
    }
}

export function projectDisplayName(projectPath: string): string {
    return path.basename(projectPath).replace(/\.(csproj|fsproj|vbproj)$/i, '');
}

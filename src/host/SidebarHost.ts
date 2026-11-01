/**
 * Sidebar host: the Activity Bar `WebviewView`. Registers the shared handlers plus the
 * requests that only the host's own UI serves (context menu, open full view), keeps the view title in sync with the
 * active project, and exposes the title-bar command implementations (pickers/toggles).
 */

import * as vscode from 'vscode';
import type { InvalidationEvent } from '../core/contracts';
import { ALL_PROJECTS, type ContextMenuRequest, type EventPayload, type SessionSnapshot } from '../protocol';
import { registerSharedHandlers, sourceDirectory } from './handlers';
import { MainPanelHost } from './MainPanelHost';
import { MANAGE_SOURCES, pickContextMenuAction, pickProject, pickSource, projectDisplayName } from './pickers';
import { runRowAction } from './rowMenu';
import { renderWebviewHtml, type HostServices } from './services';
import { WebviewHost } from './WebviewHost';

export class SidebarHost extends WebviewHost implements vscode.WebviewViewProvider {
    public static readonly viewType = 'nuiget.sidebarView';

    private view: vscode.WebviewView | undefined;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly services: HostServices) {
        super('sidebar', services.logger);
        registerSharedHandlers(this, services);
        this.on('ui/contextMenu', async request => ({ handled: await this.showContextMenu(request) }));
        this.on('ui/openSourceSettings', async () => { MainPanelHost.openSourceSettings(services); return {}; });
        this.on('ui/viewPackage', async ({ packageId, version }) => { MainPanelHost.navigateToPackage(services, packageId, version); return {}; });

        this.disposables.push(
            vscode.Disposable.from(services.session.onDidChange(snapshot => {
                this.sendEvent('session/changed', snapshot);
                void this.updateTitle(snapshot);
                void vscode.commands.executeCommand('setContext', 'nuiget.prereleaseEnabled', snapshot.includePrerelease);
                void vscode.commands.executeCommand('setContext', 'nuiget.restoreEnabled', snapshot.restoreEnabled);
            })),
            services.onProjectsChanged(projects => this.sendEvent('projects/changed', { projects })),
            services.onOperationProgress(progress => this.sendEvent('ops/progress', progress)),
            services.onOperationCompleted(outcome => this.sendEvent('ops/completed', outcome)),
            services.onConfigChanged(config => this.sendEvent('config/changed', config)),
        );
        void vscode.commands.executeCommand('setContext', 'nuiget.prereleaseEnabled', services.session.snapshot.includePrerelease);
        void vscode.commands.executeCommand('setContext', 'nuiget.restoreEnabled', services.session.snapshot.restoreEnabled);
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.services.context.extensionUri] };
        webviewView.webview.html = renderWebviewHtml(webviewView.webview, this.services.context.extensionUri, {
            script: 'sidebar.js',
            style: 'sidebar.css',
            rootId: 'sidebar-root',
            title: 'nUIget',
        });
        this.attach(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(message => { void this.receive(message); }, null, this.disposables);
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.sendEvent('ui/focusSearch', {});
            }
        }, null, this.disposables);
        webviewView.onDidDispose(() => {
            this.detach();
            this.view = undefined;
        }, null, this.disposables);
        void this.updateTitle(this.services.session.snapshot);
    }

    /** The coordinator's event, forwarded as it is (ADR-002). */
    public notifyInvalidated(event: InvalidationEvent): void {
        this.sendEvent('resources/invalidated', event);
    }

    public notifySourceHealth(payload: EventPayload<'sources/health'>): void {
        this.sendEvent('sources/health', payload);
    }

    // ── title-bar commands ──

    async showProjectPicker(): Promise<void> {
        const { value: projects } = await this.services.catalog.projects();
        const selected = await pickProject(projects, this.services.session.snapshot.selectedProject);
        if (selected !== undefined) {
            await this.services.session.apply({ selectedProject: selected }, 'sidebar');
        }
    }

    async showSourcePicker(): Promise<void> {
        const { value: sources } = await this.services.catalog.sources(sourceDirectory(this.services));
        const selected = await pickSource(sources, this.services.session.snapshot.selectedSource);
        if (selected === MANAGE_SOURCES) {
            MainPanelHost.openSourceSettings(this.services);
        } else if (selected !== undefined) {
            await this.services.session.apply({ selectedSource: selected }, 'sidebar');
        }
    }

    async togglePrerelease(): Promise<void> {
        const next = !this.services.session.snapshot.includePrerelease;
        await this.services.session.apply({ includePrerelease: next }, 'sidebar');
        vscode.window.setStatusBarMessage(`nUIget: Pre-release ${next ? 'enabled' : 'disabled'}`, 2000);
    }

    async toggleRestore(): Promise<void> {
        const next = !this.services.session.snapshot.restoreEnabled;
        await this.services.session.apply({ restoreEnabled: next }, 'sidebar');
        vscode.window.setStatusBarMessage(`nUIget: Restore after operations ${next ? 'enabled' : 'disabled'}`, 2000);
    }

    refresh(): void {
        this.services.invalidate({ kind: 'workspace' }, 'manual-refresh');
    }

    // ── context menu ──

    private async showContextMenu(request: ContextMenuRequest): Promise<boolean> {
        const isAllProjectsBrowse = (!request.projectPath || request.projectPath === ALL_PROJECTS) && request.context === 'browse';
        if ((!request.projectPath || request.projectPath === ALL_PROJECTS) && !isAllProjectsBrowse) {
            void vscode.window.showWarningMessage('Select a specific project for this action.');
            return false;
        }
        const action = await pickContextMenuAction({
            packageId: request.packageId,
            context: request.context,
            installedVersion: request.installedVersion,
            latestVersion: request.latestVersion,
            partiallyInstalled: request.partiallyInstalled,
            floatingOrRange: request.versionType === 'floating' || request.versionType === 'range',
        });
        if (!action) {
            return false;
        }
        return runRowAction(this.services, action, request);
    }

    private async updateTitle(snapshot: SessionSnapshot): Promise<void> {
        if (!this.view) {
            return;
        }
        if (snapshot.selectedProject === ALL_PROJECTS) {
            const projects = await this.services.catalog.projects().then(listed => listed.value, () => []);
            this.view.title = `All Projects (${projects.length})`;
        } else if (snapshot.selectedProject) {
            this.view.title = projectDisplayName(snapshot.selectedProject);
        } else {
            this.view.title = undefined;
        }
    }

    public dispose(): void {
        this.detach();
        for (const d of this.disposables.splice(0)) {
            d.dispose();
        }
    }
}

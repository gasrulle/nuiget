/**
 * Sidebar host: the Activity Bar `WebviewView`. Registers the shared handlers plus the
 * requests that only the host's own UI serves (context menu, open full view), keeps the view title in sync with the
 * active project, and exposes the title-bar command implementations (pickers/toggles).
 */

import * as path from 'path';
import * as vscode from 'vscode';
import type { InvalidationEvent } from '../core/contracts';
import { redact } from '../core/logging';
import { ALL_PROJECTS, type ContextMenuRequest, type EventPayload, type SessionSnapshot } from '../protocol';
import { operations, registerSharedHandlers, settleOperation, sourceDirectory } from './handlers';
import { MainPanelHost } from './MainPanelHost';
import { MANAGE_SOURCES, pickContextMenuAction, pickProject, pickProjectsForInstall, pickSingleProject, pickSource, pickVersion, projectDisplayName } from './pickers';
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
        switch (action) {
            case 'copy-id':
                await vscode.env.clipboard.writeText(request.packageId);
                vscode.window.setStatusBarMessage(`Copied "${request.packageId}" to clipboard`, 2000);
                return true;
            case 'view-details':
                MainPanelHost.navigateToPackage(this.services, request.packageId, request.latestVersion ?? request.installedVersion);
                return true;
            default:
                break;
        }

        const snapshot = this.services.session.snapshot;
        const sourceUrl = request.sourceUrl ?? (snapshot.selectedSource === 'all' ? undefined : snapshot.selectedSource);
        const versionFor = async (fallback?: string) => {
            if (action === 'install-version' || action === 'change-version' || action === 'update-version') {
                const { versions, sourcesUnavailable } = await this.services.catalog.versions(sourceDirectory(this.services), request.packageId, sourceUrl, snapshot.includePrerelease, new AbortController().signal);
                // Empty is not unknown: with no source reached, there is nothing to pick and nothing is submitted.
                if (versions.length === 0 && sourcesUnavailable) {
                    void vscode.window.showWarningMessage('No package source could be reached for this package');
                    return undefined;
                }
                return pickVersion(request.packageId, versions.slice(0, 50), request.installedVersion);
            }
            return fallback;
        };

        if (isAllProjectsBrowse) {
            const { value: projects } = await this.services.catalog.projects();
            const installedIn = new Map((request.installedProjects ?? []).map(p => [p.projectPath, p.version]));
            if (action === 'install-latest' || action === 'install-version') {
                const version = await versionFor(request.latestVersion);
                if (action === 'install-version' && !version) {
                    return false;
                }
                const picked = await pickProjectsForInstall(request.packageId, projects, installedIn);
                if (!picked) {
                    return false;
                }
                const targets = picked.length > 1 ? await this.withoutCentralEntries(picked, projects, request.packageId, version) : picked;
                if (targets.length === 0) {
                    return true;
                }
                if (targets.length === 1) {
                    if (!await this.confirmCentralChange(targets[0], request.packageId, version)) {
                        return false;
                    }
                    await settleOperation(this.services, operations.install(this.services, { projectPath: targets[0], packageId: request.packageId, version, sourceUrl }));
                } else {
                    await settleOperation(this.services, operations.bulkInstall(this.services, { projectPaths: targets, packageId: request.packageId, version }));
                }
                return true;
            }
            const candidates = (request.installedProjects ?? []).map(p => ({ projectPath: p.projectPath, projectName: p.projectName, version: p.version }));
            const target = await pickSingleProject(`nUIget — ${request.packageId}`, action === 'uninstall' ? 'Select the project to uninstall from' : 'Select the project to change the version in', candidates);
            if (!target) {
                return false;
            }
            if (action === 'uninstall') {
                await settleOperation(this.services, operations.remove(this.services, { projectPath: target, packageId: request.packageId }));
                return true;
            }
            const version = await versionFor();
            if (!version || !await this.confirmCentralChange(target, request.packageId, version)) {
                return false;
            }
            await settleOperation(this.services, operations.install(this.services, { projectPath: target, packageId: request.packageId, version, sourceUrl }));
            return true;
        }

        const projectPath = request.projectPath;
        switch (action) {
            case 'install-latest':
                if (!await this.confirmCentralChange(projectPath, request.packageId, request.latestVersion)) {
                    return false;
                }
                await settleOperation(this.services, operations.install(this.services, { projectPath, packageId: request.packageId, version: request.latestVersion, sourceUrl }));
                return true;
            case 'update-latest':
                if (!request.latestVersion || !await this.confirmCentralChange(projectPath, request.packageId, request.latestVersion)) {
                    return false;
                }
                await settleOperation(this.services, operations.update(this.services, { projectPath, packageId: request.packageId, version: request.latestVersion, sourceUrl }));
                return true;
            case 'install-version':
            case 'change-version':
            case 'update-version': {
                const version = await versionFor();
                if (!version || !await this.confirmCentralChange(projectPath, request.packageId, version)) {
                    return false;
                }
                if (action === 'update-version') {
                    await settleOperation(this.services, operations.update(this.services, { projectPath, packageId: request.packageId, version, sourceUrl }));
                } else {
                    await settleOperation(this.services, operations.install(this.services, { projectPath, packageId: request.packageId, version, sourceUrl }));
                }
                return true;
            }
            case 'uninstall':
                await settleOperation(this.services, operations.remove(this.services, { projectPath, packageId: request.packageId }));
                return true;
            default:
                return false;
        }
    }

    /**
     * A change of a centrally managed version reaches every project that uses the central entry (ADR-004 tier 3): the
     * user confirms it in a modal that lists them before anything is submitted. No preview (not CPM, no central entry
     * yet) needs no confirmation; the gate of the operation decides. A preview that fails lets the gate decide too.
     */
    private async confirmCentralChange(projectPath: string, packageId: string, version: string | undefined): Promise<boolean> {
        if (version === undefined) {
            return true;
        }
        let preview;
        try {
            preview = await this.services.mutator.previewCpmImpact(await this.services.contextFor(projectPath), packageId, version);
        } catch (error) {
            this.services.logger.warn(redact(`Central Package Management preview of ${packageId} failed: ${error instanceof Error ? error.message : String(error)}`));
            return true;
        }
        if (preview === undefined) {
            return true;
        }
        const projects = await this.services.catalog.projects().then(listed => listed.value, () => []);
        const names = preview.affectedProjects.map(affected => projects.find(project => project.path === affected)?.name ?? path.basename(affected));
        const choice = await vscode.window.showWarningMessage(
            `Update the central version of ${packageId}?`,
            { modal: true, detail: `${preview.fromVersion ?? '(none)'} → ${version} in ${path.basename(preview.centralPropsPath)} applies to: ${names.join(', ')}` },
            'Update central version',
        );
        return choice === 'Update central version';
    }

    /**
     * A bulk install shows no preview, so it leaves out every target where the package has a central entry, or where
     * the preview could not be taken, and says which (N76): installing there changes the central version for every
     * project that uses it, which the single install from that project shows first. Without a version the mutator
     * refuses each CPM target on its own.
     */
    private async withoutCentralEntries(targets: string[], projects: ReadonlyArray<{ name: string; path: string }>, packageId: string, version: string | undefined): Promise<string[]> {
        if (version === undefined) {
            return targets;
        }
        const kept: string[] = [];
        const left: string[] = [];
        for (const target of targets) {
            let preview;
            try {
                preview = await this.services.mutator.previewCpmImpact(await this.services.contextFor(target), packageId, version);
            } catch (error) {
                this.services.logger.warn(redact(`Central Package Management preview of ${packageId} failed: ${error instanceof Error ? error.message : String(error)}`));
                preview = null;
            }
            (preview === undefined ? kept : left).push(target);
        }
        if (left.length > 0) {
            const names = left.map(target => projects.find(project => project.path === target)?.name ?? path.basename(target));
            void vscode.window.showInformationMessage(`Not installed in ${names.join(', ')}: ${packageId} has a central entry there; install it from the project to see the preview`);
        }
        return kept;
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

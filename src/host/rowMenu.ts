/**
 * The row's actions, on the host: what the commands of VS Code's `webview/context` menu run on both surfaces (ADR-013
 * Decision 4, UX-P2.9a) and what the sidebar's `ui/contextMenu` handler still reaches until the request is retired (P4.1).
 * A context object is webview input: a command takes it through `isRowMenuContext`, never as it comes.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { redact } from '../core/logging';
import { ALL_PROJECTS, type ContextMenuRequest } from '../protocol';
import { operations, settleOperation, sourceDirectory } from './handlers';
import { MainPanelHost } from './MainPanelHost';
import { pickProjectsForInstall, pickSingleProject, pickVersion, type ContextMenuAction } from './pickers';
import type { HostServices } from './services';

type RowSection = 'installedRow' | 'updateRow' | 'browseRow' | 'transitiveRow';

/** What a row's `data-vscode-context` carries: the request's fields, the section and the facts the `when` clauses read. */
export interface RowMenuContext extends Omit<ContextMenuRequest, 'context'> {
    webviewSection: RowSection;
    'nuiget.installed'?: boolean;
    'nuiget.partial'?: boolean;
    'nuiget.floating'?: boolean;
    'nuiget.central'?: boolean;
    /** The row cannot be written here (SDK, props, unresolved, a read-only project): its write items hide, and a command refuses it. */
    'nuiget.readOnly'?: boolean;
    preventDefaultContextMenuItems?: boolean;
    webview?: string;
}

const SECTION_CONTEXT: Record<RowSection, ContextMenuRequest['context']> = { installedRow: 'installed', transitiveRow: 'installed', updateRow: 'updates', browseRow: 'browse' };

const isOptional = (value: unknown, type: 'string' | 'boolean'): boolean => value === undefined || typeof value === type;

export function isRowMenuContext(arg: unknown): arg is RowMenuContext {
    if (typeof arg !== 'object' || arg === null) {
        return false;
    }
    const context = arg as Record<string, unknown>;
    const projects = context.installedProjects;
    return typeof context.webviewSection === 'string' && Object.hasOwn(SECTION_CONTEXT, context.webviewSection)
        && typeof context.packageId === 'string' && context.packageId !== ''
        && typeof context.projectPath === 'string'
        && ['installedVersion', 'latestVersion', 'versionType', 'sourceUrl'].every(key => isOptional(context[key], 'string'))
        && ['partiallyInstalled', 'nuiget.installed', 'nuiget.partial', 'nuiget.floating', 'nuiget.central', 'nuiget.readOnly'].every(key => isOptional(context[key], 'boolean'))
        && (projects === undefined || (Array.isArray(projects) && projects.every(project => typeof project === 'object' && project !== null
            && typeof (project as Record<string, unknown>).projectPath === 'string'
            && typeof (project as Record<string, unknown>).projectName === 'string'
            && typeof (project as Record<string, unknown>).version === 'string')));
}

/** Runs one of the row's actions; true when it went through. */
export async function runRowAction(services: HostServices, action: ContextMenuAction, request: ContextMenuRequest): Promise<boolean> {
    switch (action) {
        case 'copy-id':
            await vscode.env.clipboard.writeText(request.packageId);
            vscode.window.setStatusBarMessage(`Copied "${request.packageId}" to clipboard`, 2000);
            return true;
        case 'view-details':
            MainPanelHost.navigateToPackage(services, request.packageId, request.latestVersion ?? request.installedVersion);
            return true;
        default:
            break;
    }

    // After copying and showing, which need no project: a transitive row under All Projects has none.
    const isAllProjectsBrowse = (!request.projectPath || request.projectPath === ALL_PROJECTS) && request.context === 'browse';
    if ((!request.projectPath || request.projectPath === ALL_PROJECTS) && !isAllProjectsBrowse) {
        void vscode.window.showWarningMessage('Select a specific project for this action.');
        return false;
    }

    // An install without a version writes a floating `*` (gotcha "A webview install without a version").
    if (action === 'install-latest' && !request.latestVersion) {
        void vscode.window.showWarningMessage(`No latest version of ${request.packageId} is known`);
        return false;
    }

    const snapshot = services.session.snapshot;
    const sourceUrl = request.sourceUrl ?? (snapshot.selectedSource === 'all' ? undefined : snapshot.selectedSource);
    const versionFor = async (fallback?: string) => {
        if (action === 'install-version' || action === 'change-version' || action === 'update-version') {
            const { versions, sourcesUnavailable } = await services.catalog.versions(sourceDirectory(services), request.packageId, sourceUrl, snapshot.includePrerelease, new AbortController().signal);
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
        const { value: projects } = await services.catalog.projects();
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
            const targets = picked.length > 1 ? await withoutCentralEntries(services, picked, projects, request.packageId, version) : picked;
            if (targets.length === 0) {
                return true;
            }
            if (targets.length === 1) {
                if (!await confirmCentralChange(services, targets[0], request.packageId, version)) {
                    return false;
                }
                await settleOperation(services, operations.install(services, { projectPath: targets[0], packageId: request.packageId, version, sourceUrl }));
            } else {
                await settleOperation(services, operations.bulkInstall(services, { projectPaths: targets, packageId: request.packageId, version }));
            }
            return true;
        }
        const candidates = (request.installedProjects ?? []).map(p => ({ projectPath: p.projectPath, projectName: p.projectName, version: p.version }));
        const target = await pickSingleProject(`nUIget — ${request.packageId}`, action === 'uninstall' ? 'Select the project to uninstall from' : 'Select the project to change the version in', candidates);
        if (!target) {
            return false;
        }
        if (action === 'uninstall') {
            await settleOperation(services, operations.remove(services, { projectPath: target, packageId: request.packageId }));
            return true;
        }
        const version = await versionFor();
        if (!version || !await confirmCentralChange(services, target, request.packageId, version)) {
            return false;
        }
        await settleOperation(services, operations.install(services, { projectPath: target, packageId: request.packageId, version, sourceUrl }));
        return true;
    }

    const projectPath = request.projectPath;
    switch (action) {
        case 'install-latest':
            if (!await confirmCentralChange(services, projectPath, request.packageId, request.latestVersion)) {
                return false;
            }
            await settleOperation(services, operations.install(services, { projectPath, packageId: request.packageId, version: request.latestVersion, sourceUrl }));
            return true;
        case 'update-latest':
            if (!request.latestVersion || !await confirmCentralChange(services, projectPath, request.packageId, request.latestVersion)) {
                return false;
            }
            await settleOperation(services, operations.update(services, { projectPath, packageId: request.packageId, version: request.latestVersion, sourceUrl }));
            return true;
        case 'install-version':
        case 'change-version':
        case 'update-version': {
            const version = await versionFor();
            if (!version || !await confirmCentralChange(services, projectPath, request.packageId, version)) {
                return false;
            }
            if (action === 'update-version') {
                await settleOperation(services, operations.update(services, { projectPath, packageId: request.packageId, version, sourceUrl }));
            } else {
                await settleOperation(services, operations.install(services, { projectPath, packageId: request.packageId, version, sourceUrl }));
            }
            return true;
        }
        case 'uninstall':
            await settleOperation(services, operations.remove(services, { projectPath, packageId: request.packageId }));
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
async function confirmCentralChange(services: HostServices, projectPath: string, packageId: string, version: string | undefined): Promise<boolean> {
    if (version === undefined) {
        return true;
    }
    let preview;
    try {
        preview = await services.mutator.previewCpmImpact(await services.contextFor(projectPath), packageId, version);
    } catch (error) {
        services.logger.warn(redact(`Central Package Management preview of ${packageId} failed: ${error instanceof Error ? error.message : String(error)}`));
        return true;
    }
    if (preview === undefined) {
        return true;
    }
    const projects = await services.catalog.projects().then(listed => listed.value, () => []);
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
async function withoutCentralEntries(services: HostServices, targets: string[], projects: ReadonlyArray<{ name: string; path: string }>, packageId: string, version: string | undefined): Promise<string[]> {
    if (version === undefined) {
        return targets;
    }
    const kept: string[] = [];
    const left: string[] = [];
    for (const target of targets) {
        let preview;
        try {
            preview = await services.mutator.previewCpmImpact(await services.contextFor(target), packageId, version);
        } catch (error) {
            services.logger.warn(redact(`Central Package Management preview of ${packageId} failed: ${error instanceof Error ? error.message : String(error)}`));
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

const COMMANDS: ReadonlyArray<readonly [string, ContextMenuAction]> = [
    ['nuiget.row.installLatest', 'install-latest'],
    ['nuiget.row.installVersion', 'install-version'],
    ['nuiget.row.uninstall', 'uninstall'],
    ['nuiget.row.changeVersion', 'change-version'],
    ['nuiget.row.updateLatest', 'update-latest'],
    ['nuiget.row.updateVersion', 'update-version'],
    ['nuiget.row.copyId', 'copy-id'],
    ['nuiget.row.viewDetails', 'view-details'],
];

/** What a read-only row admits: it copies and shows, and nothing else reaches it, whatever the argument says. */
const READ_ONLY: readonly ContextMenuAction[] = ['copy-id', 'view-details'];

/** Binds the hidden commands of the `webview/context` menu; VS Code hands each the row's context object as its first argument. */
export function registerRowMenuCommands(services: HostServices, register: (command: string, handler: (...args: unknown[]) => unknown) => void): void {
    for (const [command, action] of COMMANDS) {
        register(command, async (arg: unknown) => {
            if (!isRowMenuContext(arg)) {
                services.logger.warn(`${command}: the row's context is malformed`);
                return;
            }
            if ((arg.webviewSection === 'transitiveRow' || arg['nuiget.readOnly'] === true) && !READ_ONLY.includes(action)) {
                services.logger.warn(`${command}: the row is read-only`);
                return;
            }
            await runRowAction(services, action, {
                packageId: arg.packageId,
                projectPath: arg.projectPath,
                installedVersion: arg.installedVersion,
                latestVersion: arg.latestVersion,
                versionType: arg.versionType,
                sourceUrl: arg.sourceUrl,
                installedProjects: arg.installedProjects,
                partiallyInstalled: arg.partiallyInstalled,
                context: SECTION_CONTEXT[arg.webviewSection],
            });
        });
    }
}

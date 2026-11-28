/**
 * The Command Palette's package commands (UX-P5.7a, G7; architecture-advisor opening ruling of 2026-11-28, strings by the
 * design-advisor's ruling of the same day): Check for Package Updates, Update All Packages, Install Package... and Restore
 * Packages. Each acts on the session's selection as read at the call and never changes it. Installs go through the row
 * menu's flow (`runRowAction`: the version pick, the central confirmation, N77); Update All takes the one update-candidate
 * rule of the panels (`updateRule.ts`, central rows out, N76) and every operation is submitted through `submitFromHost`, whose
 * outcome `feedback.ts` reports. Every text shown here is composed in this file.
 */
import * as vscode from 'vscode';
import { isValidPackageId } from '../core/cli/validate';
import { normalizeProjectPath } from '../core/util/paths';
import { ALL_PROJECTS, type Project } from '../protocol';
import { updateCandidates } from '../webview/shared/installed/updateRule';
import { operations, submitFromHost } from './handlers';
import { MainPanelHost } from './MainPanelHost';
import { pickSingleProject } from './pickers';
import { runRowAction } from './rowMenu';
import type { HostServices } from './services';

/** The modal's one button, compared with the choice it returns. */
const UPDATE = 'Update';

/** At most this many lines of packages in the modal: a native modal does not scroll. */
const MODAL_LINES = 10;

/** The session's selected project, when it is one project. */
function selectedProject(services: HostServices): string | undefined {
    const selected = services.session.snapshot.selectedProject;
    return selected === '' || selected === ALL_PROJECTS ? undefined : selected;
}

async function listedProjects(services: HostServices): Promise<Project[]> {
    return (await services.catalog.projects()).value;
}

/** Check for Package Updates: the selection's updates asked again, then the manager on its Updates tab. */
function checkForUpdates(services: HostServices): void {
    const projectPath = selectedProject(services);
    services.catalog.invalidate(projectPath === undefined ? { kind: 'workspace' } : { kind: 'project', projectPaths: [projectPath] }, 'manual-refresh');
    MainPanelHost.createOrShow(services, { projectPath: services.session.snapshot.selectedProject || undefined, initialTab: 'updates' });
}

/** Update All Packages: one project's update candidates, confirmed in a modal, submitted as one bulk update. */
async function updateAllPackages(services: HostServices): Promise<void> {
    let projectPath = selectedProject(services);
    const projects = await listedProjects(services);
    if (projectPath === undefined) {
        if (projects.length === 0) {
            void vscode.window.showInformationMessage('nUIget: No .NET projects found in this workspace.');
            return;
        }
        projectPath = await pickSingleProject('nUIget — Update All Packages', 'Select the project to update', projects.map(project => ({ projectPath: project.path, projectName: project.name })));
        if (projectPath === undefined) {
            return;
        }
    }
    // Matched as MainPanelHost.showPackage matches: Windows casing and separators differ (P1.7).
    const target = normalizeProjectPath(projectPath);
    const project = projects.find(listed => normalizeProjectPath(listed.path) === target)?.name ?? projectPath;
    const signal = new AbortController().signal;
    const [{ updates, sourcesUnavailable }, installed] = await Promise.all([
        services.catalog.updates(projectPath, services.session.snapshot.includePrerelease, undefined, signal),
        services.catalog.installed(projectPath, undefined, signal).then(answer => answer.upgrade ?? answer.result),
    ]);
    if (updates.length === 0) {
        // Empty is not unknown: with a source unread nothing says the project is up to date.
        if (sourcesUnavailable) {
            void vscode.window.showWarningMessage(`nUIget: The updates for ${project} could not be checked: some package sources could not be reached.`);
        } else {
            void vscode.window.showInformationMessage(`nUIget: No updates available for ${project}.`);
        }
        return;
    }
    // The host keeps no busy set: the queue runs one operation at a time (a deviation recorded in the item's note).
    const candidates = updateCandidates(updates, installed, () => false);
    if (candidates.length === 0) {
        void vscode.window.showInformationMessage(`nUIget: No update for ${project} can join a bulk update. Update them one by one on the Updates tab.`);
        return;
    }
    const lines = candidates.slice(0, MODAL_LINES).map(update => `${update.id} ${update.installedVersion} → ${update.latestVersion}`);
    if (candidates.length > MODAL_LINES) {
        lines.push(`and ${candidates.length - MODAL_LINES} more`);
    }
    const count = candidates.length;
    const choice = await vscode.window.showInformationMessage(
        count === 1 ? `Update 1 package in ${project}?` : `Update ${count} packages in ${project}?`,
        { modal: true, detail: lines.join('\n') },
        UPDATE,
    );
    if (choice !== UPDATE) {
        return;
    }
    const packages = candidates.map(update => ({ id: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl }));
    await submitFromHost(services, operations.bulkUpdate(services, { projectPath, packages }), { kind: 'update', projectPaths: [projectPath], packageIds: packages.map(entry => entry.id) });
}

/** Install Package...: an exact id, then the row menu's install flow into the selection. */
async function installPackage(services: HostServices): Promise<void> {
    const typed = await vscode.window.showInputBox({
        title: 'nUIget — Install Package',
        placeHolder: 'Package ID, for example Newtonsoft.Json',
        prompt: 'Enter the exact ID of the package to install',
        validateInput: value => (value.trim() === '' || isValidPackageId(value.trim()) ? undefined : 'Enter a valid package ID, for example Newtonsoft.Json.'),
    });
    const packageId = typed?.trim() ?? '';
    if (packageId === '' || !isValidPackageId(packageId)) {
        return;
    }
    await runRowAction(services, 'install-version', { packageId, context: 'browse', projectPath: selectedProject(services) ?? ALL_PROJECTS });
}

/** Restore Packages: the selected project, or every listed project. */
async function restorePackages(services: HostServices): Promise<void> {
    const selected = selectedProject(services);
    const projectPaths = selected === undefined ? (await listedProjects(services)).map(project => project.path) : [selected];
    if (projectPaths.length === 0) {
        void vscode.window.showInformationMessage('nUIget: No .NET projects found in this workspace.');
        return;
    }
    await submitFromHost(services, operations.restore(services, { projectPaths }), { kind: 'restore', projectPaths, packageIds: [] });
}

/** Registers the four palette commands; `nuiget.openManager` and `nuiget.refreshPackages` stay where they are. */
export function registerPaletteCommands(services: HostServices, register: (command: string, handler: (...args: unknown[]) => unknown) => void): void {
    register('nuiget.checkForUpdates', () => checkForUpdates(services));
    register('nuiget.updateAllPackages', () => updateAllPackages(services));
    register('nuiget.installPackage', () => installPackage(services));
    register('nuiget.restorePackages', () => restorePackages(services));
}

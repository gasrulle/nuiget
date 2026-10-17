/**
 * QuickPick-based choosers used by the sidebar title-bar commands and context menu.
 * Pure VS Code chrome; every selection is routed back through `SessionStore` or the shared handlers.
 */

import * as vscode from 'vscode';
import { ALL_PROJECTS, type NuGetSource, type Project } from '../protocol';
import { projectDisplayName } from './services';

export async function pickProject(projects: Project[], current: string): Promise<string | undefined> {
    if (projects.length === 0) {
        void vscode.window.showInformationMessage('No .NET project files found in the workspace.');
        return undefined;
    }
    const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
    const items: Array<vscode.QuickPickItem & { value?: string }> = [];
    if (sorted.length > 1) {
        items.push({ label: `All Projects (${sorted.length})`, description: 'Show packages from every project', value: ALL_PROJECTS });
        items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
    }
    for (const project of sorted) {
        items.push({ label: project.name, description: project.path, value: project.path });
    }
    return new Promise(resolve => {
        const picker = vscode.window.createQuickPick<vscode.QuickPickItem & { value?: string }>();
        picker.items = items;
        picker.placeholder = 'Select project';
        picker.title = 'nUIget — Project';
        const active = items.find(item => item.value === current);
        if (active) {
            picker.activeItems = [active];
        }
        picker.onDidAccept(() => { resolve(picker.selectedItems[0]?.value); picker.dispose(); });
        picker.onDidHide(() => { resolve(undefined); picker.dispose(); });
        picker.show();
    });
}

export const MANAGE_SOURCES = '__manage_sources__';

export async function pickSource(sources: NuGetSource[], current: string): Promise<string | undefined> {
    const enabled = sources.filter(s => s.enabled);
    const items: Array<vscode.QuickPickItem & { value: string }> = [
        { label: 'All Sources', description: 'Search across all enabled sources', value: 'all', picked: current === 'all' },
        ...enabled.map(source => ({ label: source.name, description: source.url, value: source.url, picked: current === source.url })),
        { label: '$(gear) Manage NuGet Sources…', alwaysShow: true, value: MANAGE_SOURCES },
    ];
    const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select package source', title: 'nUIget — Package Source' });
    return selected?.value;
}

export async function pickVersion(packageId: string, versions: string[], installedVersion?: string): Promise<string | undefined> {
    if (versions.length === 0) {
        void vscode.window.showInformationMessage(`No versions found for ${packageId}`);
        return undefined;
    }
    const selected = await vscode.window.showQuickPick(
        versions.map(v => ({ label: v, description: v === installedVersion ? '(installed)' : '' })),
        { placeHolder: `Select version for ${packageId}`, title: `nUIget — ${packageId} versions` },
    );
    return selected?.label;
}

export async function pickProjectsForInstall(packageId: string, projects: Project[], installedIn: Map<string, string>): Promise<string[] | undefined> {
    if (projects.length === 0) {
        return undefined;
    }
    const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
    const selected = await vscode.window.showQuickPick(
        sorted.map(project => {
            const installed = installedIn.get(project.path);
            return { label: project.name, description: installed ? `(installed ${installed})` : '', detail: project.path, picked: !installed };
        }),
        { placeHolder: `Select projects to install ${packageId} into`, title: `nUIget — Install ${packageId}`, canPickMany: true },
    );
    if (!selected || selected.length === 0) {
        return undefined;
    }
    return selected.map(item => item.detail);
}

export async function pickSingleProject(title: string, placeHolder: string, candidates: Array<{ projectPath: string; projectName: string; version?: string }>): Promise<string | undefined> {
    if (candidates.length === 1) {
        return candidates[0].projectPath;
    }
    const selected = await vscode.window.showQuickPick(
        [...candidates].sort((a, b) => a.projectName.localeCompare(b.projectName)).map(c => ({ label: c.projectName, description: c.version ? `v${c.version}` : '', detail: c.projectPath })),
        { placeHolder, title },
    );
    return selected?.detail;
}

export type ContextMenuAction = 'install-latest' | 'install-version' | 'uninstall' | 'change-version' | 'update-latest' | 'update-version' | 'copy-id' | 'view-details';

interface ActionItem extends vscode.QuickPickItem {
    action: ContextMenuAction;
}

export async function pickContextMenuAction(options: { packageId: string; context: 'browse' | 'installed' | 'updates'; installedVersion?: string; latestVersion?: string; partiallyInstalled?: boolean; floatingOrRange?: boolean }): Promise<ContextMenuAction | undefined> {
    const items: ActionItem[] = [];
    const { context, installedVersion, latestVersion } = options;
    if (context === 'browse') {
        if (options.partiallyInstalled && installedVersion) {
            items.push({ label: '$(add) Install latest', description: latestVersion ?? '', action: 'install-latest' });
            items.push({ label: '$(list-ordered) Install version…', action: 'install-version' });
            items.push({ label: '$(close) Uninstall', description: installedVersion, action: 'uninstall' });
            items.push({ label: '$(list-ordered) Change version…', action: 'change-version' });
        } else if (installedVersion) {
            items.push({ label: '$(close) Uninstall', description: installedVersion, action: 'uninstall' });
            items.push({ label: '$(list-ordered) Change version…', action: 'change-version' });
        } else {
            items.push({ label: '$(add) Install latest', description: latestVersion ?? '', action: 'install-latest' });
            items.push({ label: '$(list-ordered) Install version…', action: 'install-version' });
        }
    } else if (context === 'installed') {
        items.push({ label: '$(list-ordered) Change version…', action: 'change-version' });
        items.push({ label: '$(close) Uninstall', description: installedVersion ?? '', action: 'uninstall' });
    } else {
        if (!options.floatingOrRange) {
            items.push({ label: `$(arrow-up) Update to ${latestVersion ?? 'latest'}`, action: 'update-latest' });
        }
        items.push({ label: '$(list-ordered) Update to version…', action: 'update-version' });
        items.push({ label: '$(close) Uninstall', description: installedVersion ?? '', action: 'uninstall' });
    }
    items.push({ label: '$(clippy) Copy package ID', description: options.packageId, action: 'copy-id' });
    items.push({ label: '$(eye) View package details', description: 'Open in the full view', action: 'view-details' });
    const selected = await vscode.window.showQuickPick(items, { placeHolder: `${options.packageId} — actions`, title: `nUIget — ${options.packageId}` });
    return selected?.action;
}

export { projectDisplayName };

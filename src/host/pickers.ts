/**
 * QuickPick-based choosers used by the sidebar title-bar commands and context menu.
 * Pure VS Code chrome; every selection is routed back through `SessionStore` or the shared handlers.
 */

import * as vscode from 'vscode';
import { ALL_PROJECTS, type NuGetSource, type Project } from '../protocol';
import { projectDisplayName } from './services';

export async function pickProject(projects: Project[], current: string): Promise<string | undefined> {
    if (projects.length === 0) {
        void vscode.window.showInformationMessage('nUIget: No .NET projects found in this workspace.');
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
        { label: '$(gear) Manage Package Sources...', alwaysShow: true, value: MANAGE_SOURCES },
    ];
    const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select package source', title: 'nUIget — Package Source' });
    return selected?.value;
}

export async function pickVersion(packageId: string, versions: string[], installedVersion?: string): Promise<string | undefined> {
    if (versions.length === 0) {
        void vscode.window.showInformationMessage(`nUIget: No versions of ${packageId} were found.`);
        return undefined;
    }
    const selected = await vscode.window.showQuickPick(
        versions.map(v => ({ label: v, description: v === installedVersion ? '(installed)' : '' })),
        { placeHolder: `Select version for ${packageId}`, title: `nUIget — ${packageId} Versions` },
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
        [...candidates].sort((a, b) => a.projectName.localeCompare(b.projectName)).map(c => ({ label: c.projectName, description: c.version ?? '', detail: c.projectPath })),
        { placeHolder, title },
    );
    return selected?.detail;
}

export { projectDisplayName };

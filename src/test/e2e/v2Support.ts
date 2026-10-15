import * as assert from 'assert';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Shared steps of the 2.0 extension-host suites (`v2-*.e2e.test.ts`, plan items P3.5 and P5.12a). They wait with a
 * bounded poll, never a fixed sleep, run `dotnet` with an argument vector (noun-first `dotnet package …`, .NET SDK 10)
 * and leave the fixture project as they found it.
 */

/** Every command the manifest contributes; the 2.0 entry registers all of them. */
export const CONTRIBUTED_COMMANDS = [
    'nuiget.openManager', 'nuiget.refreshPackages', 'nuiget.sidebar.selectSource', 'nuiget.sidebar.selectProject',
    'nuiget.sidebar.togglePrerelease', 'nuiget.sidebar.togglePrereleaseOff', 'nuiget.sidebar.toggleRestore',
    'nuiget.sidebar.toggleRestoreOff', 'nuiget.sidebar.refresh', 'nuiget.sidebar.openFullView', 'nuiget.clearHttpCache',
    'nuiget.clearSdkVersionCache',
];

/** Commands only the 1.x entry registers (`src/extension.ts`); a 2.0 build has none of them. */
export const LEGACY_ONLY_COMMANDS = ['nuiget.refreshPackagesScoped', 'nuiget.viewPackageDetails'];

/** The view type of the 2.0 main panel (`MainPanelHost.viewType`). */
const MAIN_PANEL_VIEW_TYPE = 'nugetManager';

/** Activates the extension under test and returns it. */
export async function activateExtension(): Promise<vscode.Extension<unknown>> {
    const extension = vscode.extensions.getExtension('Gasrulle.nuiget');
    assert.ok(extension, 'The extension is not installed in the test host');
    if (!extension.isActive) {
        await extension.activate();
    }
    assert.ok(extension.isActive, 'The extension did not activate');
    return extension;
}

/** Waits until `condition` holds, looking every 250 ms; fails with `what` after `timeoutMs`. */
export async function until(condition: () => boolean | Promise<boolean>, what: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await condition())) {
        if (Date.now() > deadline) {
            assert.fail(`Timed out after ${timeoutMs} ms waiting until ${what}`);
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
}

/** Runs `dotnet` with an argument vector, never through a shell. */
export function dotnet(args: string[], cwd: string): Promise<{ code: number; output: string }> {
    return new Promise(resolve => {
        execFile('dotnet', args, { cwd, env: { ...process.env, DOTNET_CLI_UI_LANGUAGE: 'en', DOTNET_NOLOGO: '1' } }, (error, stdout, stderr) => {
            const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
            resolve({ code, output: `${stdout}${stderr}${error && typeof error.code !== 'number' ? error.message : ''}` });
        });
    });
}

/** The tabs of the 2.0 main panel, in every tab group. */
export function mainPanelTabs(): vscode.Tab[] {
    return vscode.window.tabGroups.all
        .flatMap(group => group.tabs)
        .filter(tab => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith(MAIN_PANEL_VIEW_TYPE));
}

/** Waits until the 2.0 main panel has a tab. */
export async function waitForMainPanel(timeoutMs = 30_000): Promise<void> {
    await until(() => mainPanelTabs().length > 0, 'the 2.0 main panel has a tab', timeoutMs);
}

/** Closes every editor and waits until no main panel tab is left. */
export async function closeAllEditors(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await until(() => mainPanelTabs().length === 0, 'no main panel tab is left', 30_000);
}

/** The fixture project, with its content as found, to be written back by `restore`. */
export interface FixtureProject {
    path: string;
    directory: string;
    original: string;
    read(): string;
    restore(): void;
}

export async function fixtureProject(): Promise<FixtureProject> {
    const files = await vscode.workspace.findFiles('**/*.csproj', '**/node_modules/**', 1);
    assert.ok(files.length > 0, 'No .csproj found in the workspace');
    const projectPath = files[0].fsPath;
    const original = fs.readFileSync(projectPath, 'utf-8');
    return {
        path: projectPath,
        directory: path.dirname(projectPath),
        original,
        read: () => fs.readFileSync(projectPath, 'utf-8'),
        restore: () => fs.writeFileSync(projectPath, original, 'utf-8'),
    };
}

import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { closeAllEditors, CONTRIBUTED_COMMANDS, dotnet, mainPanelTabs, until, waitForMainPanel } from './v2Support';

/**
 * The 2.0 entries in the extension host (plan item P3.5). Run with `npm run test:e2e` after a
 * `node esbuild.mjs --production` build; `.vscode-test.mjs` selects this file.
 *
 * An extension-host test sees commands, views and files, not the DOM of a webview: that the sidebar lists and
 * uninstalls packages is shown by `src/test/ui/v2/sidebar.ui.test.ts`. Here: the build under test is the 2.0
 * one, it activates, its view and commands answer, and it lives with a project file that changes under it.
 * The only `dotnet` command is noun-first (`dotnet package remove --project`), which needs .NET SDK 10. Since P5.12a
 * the file also carries the legacy `sidebar.e2e.test.ts` (Open Full View), and its helpers are in `v2Support.ts`.
 */
suite('2.0 sidebar', () => {
    let csprojPath: string;
    let originalCsproj: string | undefined;

    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension('Gasrulle.nuiget');
        assert.ok(extension, 'The extension is not installed in the test host');
        if (!extension.isActive) {
            await extension.activate();
        }
        const csprojFiles = await vscode.workspace.findFiles('**/*.csproj', '**/node_modules/**', 1);
        assert.ok(csprojFiles.length > 0, 'No .csproj found in the workspace');
        csprojPath = csprojFiles[0].fsPath;
        originalCsproj = fs.readFileSync(csprojPath, 'utf-8');
    });

    suiteTeardown(async () => {
        // The fixture project is shared with the other suites: leave it as it was found.
        if (csprojPath && originalCsproj !== undefined) {
            fs.writeFileSync(csprojPath, originalCsproj, 'utf-8');
        }
        await closeAllEditors();
    });

    test('the 2.0 entry is the one under test', async () => {
        const commands = new Set(await vscode.commands.getCommands(true));
        assert.deepStrictEqual(CONTRIBUTED_COMMANDS.filter(command => !commands.has(command)), [], 'contributed commands that are not registered');
    });

    test('the sidebar view resolves and its commands answer', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.nuiget-sidebar');
        await vscode.commands.executeCommand('nuiget.sidebar.refresh');
        // Twice: the prerelease switch is back where it was.
        await vscode.commands.executeCommand('nuiget.sidebar.togglePrerelease');
        await vscode.commands.executeCommand('nuiget.sidebar.togglePrereleaseOff');
    });

    test('Open Full View from the sidebar opens the main panel (P5.12a, port of sidebar.e2e.test.ts)', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.nuiget-sidebar');
        await vscode.commands.executeCommand('nuiget.sidebar.openFullView');
        await waitForMainPanel();
        assert.strictEqual(mainPanelTabs().length, 1);
    });

    test('a noun-first package remove outside the extension is seen without an error', async function () {
        this.timeout(180_000);
        assert.ok(originalCsproj?.includes('Include="Serilog"'), 'The fixture project no longer references Serilog');

        const removed = await dotnet(['package', 'remove', 'Serilog', '--project', csprojPath], vscode.Uri.joinPath(vscode.Uri.file(csprojPath), '..').fsPath);
        assert.strictEqual(removed.code, 0, `dotnet package remove failed:\n${removed.output}`);
        await until(() => !fs.readFileSync(csprojPath, 'utf-8').includes('Include="Serilog"'), 'the project file no longer references Serilog', 60_000);
        assert.ok(fs.readFileSync(csprojPath, 'utf-8').includes('Include="Newtonsoft.Json"'), 'The other reference is gone as well');

        // The extension's watcher has seen the edit by now or will; asking it to refresh on top must not fail.
        await vscode.commands.executeCommand('nuiget.sidebar.refresh');
        await vscode.commands.executeCommand('nuiget.refreshPackages');
    });
});

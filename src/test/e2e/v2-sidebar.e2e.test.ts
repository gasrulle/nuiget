import * as assert from 'assert';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';

/**
 * The 2.0 entries in the extension host (plan item P3.5). Run with `NUIGET_V2=1 npm run test:e2e` after a
 * `--v2` build; without the variable this file is not selected (`.vscode-test.mjs`).
 *
 * An extension-host test sees commands, views and files, not the DOM of a webview: that the sidebar lists and
 * uninstalls packages is shown by `src/test/ui/v2/sidebar.ui.test.ts`. Here: the build under test is the 2.0
 * one, it activates, its view and commands answer, and it lives with a project file that changes under it.
 * The only `dotnet` command is noun-first (`dotnet package remove --project`), which needs .NET SDK 10.
 */
suite('2.0 sidebar', () => {
    /** Every command the manifest contributes; both entries register these. */
    const CONTRIBUTED = [
        'nuiget.openManager', 'nuiget.refreshPackages', 'nuiget.sidebar.selectSource', 'nuiget.sidebar.selectProject',
        'nuiget.sidebar.togglePrerelease', 'nuiget.sidebar.togglePrereleaseOff', 'nuiget.sidebar.toggleRestore',
        'nuiget.sidebar.toggleRestoreOff', 'nuiget.sidebar.refresh', 'nuiget.sidebar.openFullView', 'nuiget.clearHttpCache',
        'nuiget.clearSdkVersionCache',
    ];
    /** Commands only the 1.x entry registers (`src/extension.ts`). */
    const LEGACY_ONLY = ['nuiget.refreshPackagesScoped', 'nuiget.viewPackageDetails'];

    let csprojPath: string;
    let originalCsproj: string | undefined;

    /** Waits until `condition` holds, looking every 250 ms; fails with `what` after `timeoutMs`. */
    async function until(condition: () => boolean, what: string, timeoutMs: number): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (!condition()) {
            if (Date.now() > deadline) {
                assert.fail(`Timed out after ${timeoutMs} ms waiting until ${what}`);
            }
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    /** Runs `dotnet` with an argument vector, never through a shell. */
    function dotnet(args: string[], cwd: string): Promise<{ code: number; output: string }> {
        return new Promise(resolve => {
            execFile('dotnet', args, { cwd, env: { ...process.env, DOTNET_CLI_UI_LANGUAGE: 'en', DOTNET_NOLOGO: '1' } }, (error, stdout, stderr) => {
                const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
                resolve({ code, output: `${stdout}${stderr}${error && typeof error.code !== 'number' ? error.message : ''}` });
            });
        });
    }

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

    suiteTeardown(() => {
        // The fixture project is shared with the other suites: leave it as it was found.
        if (csprojPath && originalCsproj !== undefined) {
            fs.writeFileSync(csprojPath, originalCsproj, 'utf-8');
        }
    });

    test('the 2.0 entry is the one under test', async () => {
        const commands = new Set(await vscode.commands.getCommands(true));
        assert.deepStrictEqual(CONTRIBUTED.filter(command => !commands.has(command)), [], 'contributed commands that are not registered');
        // A dist/ built from the 1.x entries would pass everything above; this is what tells the two apart.
        assert.deepStrictEqual(LEGACY_ONLY.filter(command => commands.has(command)), [], 'commands of the 1.x entry: dist/ was not built with --v2');
    });

    test('the sidebar view resolves and its commands answer', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.nuiget-sidebar');
        await vscode.commands.executeCommand('nuiget.sidebar.refresh');
        // Twice: the prerelease switch is back where it was.
        await vscode.commands.executeCommand('nuiget.sidebar.togglePrerelease');
        await vscode.commands.executeCommand('nuiget.sidebar.togglePrereleaseOff');
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

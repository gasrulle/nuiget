import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, closeAllEditors, mainPanelTabs, waitForMainPanel } from './v2Support';

/**
 * The commands of the 2.0 entry in the extension host (P5.12a, port of `commands.e2e.test.ts`). The two commands of
 * the 1.x entry that 2.0 does not register (`nuiget.refreshPackagesScoped`, `nuiget.viewPackageDetails`) are checked
 * as absent in `v2-extension.e2e.test.ts`; the source and project pickers open a QuickPick and are left to the UI
 * suite. Each test starts without a main panel.
 */
suite('2.0 commands', () => {
    suiteSetup(async () => {
        await activateExtension();
    });

    setup(async () => {
        await closeAllEditors();
    });

    suiteTeardown(async () => {
        await closeAllEditors();
    });

    test('nuiget.openManager opens the main panel', async () => {
        await vscode.commands.executeCommand('nuiget.openManager');
        await waitForMainPanel();
        assert.strictEqual(mainPanelTabs().length, 1);
        assert.strictEqual(mainPanelTabs()[0].label, 'nUIget');
    });

    test('nuiget.sidebar.openFullView opens the main panel', async () => {
        await vscode.commands.executeCommand('nuiget.sidebar.openFullView');
        await waitForMainPanel();
        assert.strictEqual(mainPanelTabs().length, 1);
    });

    test('nuiget.refreshPackages and nuiget.sidebar.refresh resolve with and without a panel', async () => {
        await vscode.commands.executeCommand('nuiget.refreshPackages');
        await vscode.commands.executeCommand('nuiget.sidebar.refresh');
        await vscode.commands.executeCommand('nuiget.openManager');
        await waitForMainPanel();
        await vscode.commands.executeCommand('nuiget.refreshPackages');
        await vscode.commands.executeCommand('nuiget.sidebar.refresh');
    });

    test('the prerelease and restore switches resolve; both commands of a pair flip it, so the pair ends where it began', async () => {
        for (const command of ['nuiget.sidebar.togglePrerelease', 'nuiget.sidebar.togglePrereleaseOff', 'nuiget.sidebar.toggleRestore', 'nuiget.sidebar.toggleRestoreOff']) {
            await vscode.commands.executeCommand(command);
        }
    });

    test('nuiget.clearHttpCache and nuiget.clearSdkVersionCache resolve', async function () {
        // Clearing the HTTP cache runs `dotnet nuget locals http-cache --clear`.
        this.timeout(120_000);
        await vscode.commands.executeCommand('nuiget.clearHttpCache');
        await vscode.commands.executeCommand('nuiget.clearSdkVersionCache');
    });
});

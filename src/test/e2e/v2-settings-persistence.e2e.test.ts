import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, closeAllEditors, mainPanelTabs, until, waitForMainPanel } from './v2Support';

/**
 * Close, reopen and visibility changes of the 2.0 surfaces (P5.12a, port of `settings-persistence.e2e.test.ts`).
 * What each surface remembers across them (the session in the host, the sidebar's split in its view state) is
 * proved in jsdom and by the UI suite; here: the transitions run in VS Code without an error, and the session
 * changes made through commands while the views come and go are answered.
 */
suite('2.0 surfaces across close, reopen and visibility', () => {
    suiteSetup(async () => {
        await activateExtension();
        await closeAllEditors();
    });

    suiteTeardown(async () => {
        await closeAllEditors();
    });

    test('the main panel opens again after it was closed', async () => {
        await vscode.commands.executeCommand('nuiget.openManager');
        await waitForMainPanel();
        await vscode.window.tabGroups.close(mainPanelTabs());
        await until(() => mainPanelTabs().length === 0, 'the panel is closed', 10_000);

        await vscode.commands.executeCommand('nuiget.openManager');
        await waitForMainPanel();
        assert.strictEqual(mainPanelTabs().length, 1);
    });

    test('the sidebar is hidden and shown again, and a session change while it is hidden is answered', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.nuiget-sidebar');
        await vscode.commands.executeCommand('workbench.view.explorer');
        // The session changes while the sidebar is hidden; it asks for the session again when it is shown.
        await vscode.commands.executeCommand('nuiget.sidebar.togglePrerelease');
        await vscode.commands.executeCommand('workbench.view.extension.nuiget-sidebar');
        await vscode.commands.executeCommand('nuiget.sidebar.togglePrerelease');
        await vscode.commands.executeCommand('nuiget.sidebar.refresh');
    });
});

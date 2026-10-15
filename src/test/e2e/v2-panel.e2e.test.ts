import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, closeAllEditors, mainPanelTabs, until, waitForMainPanel } from './v2Support';

/**
 * The 2.0 main panel as a tab of the workbench (P5.12a, port of `panel.e2e.test.ts`): it opens with its title, stays
 * one panel when asked again or after another editor took the focus, and opens again after it was closed. What it
 * shows is the UI suite's (`src/test/ui/v2/main-*.ui.test.ts`).
 */
suite('2.0 main panel', () => {
    suiteSetup(async () => {
        await activateExtension();
        await closeAllEditors();
    });

    suiteTeardown(async () => {
        await closeAllEditors();
    });

    test('it opens as one tab titled nUIget', async () => {
        await vscode.commands.executeCommand('nuiget.openManager');
        await waitForMainPanel();
        assert.deepStrictEqual(mainPanelTabs().map(tab => tab.label), ['nUIget']);
    });

    test('after another editor took the focus, opening it again reveals the same panel', async () => {
        const document = await vscode.workspace.openTextDocument({ content: 'another editor', language: 'plaintext' });
        await vscode.window.showTextDocument(document);
        await until(() => mainPanelTabs().every(tab => !tab.isActive), 'the text editor is active', 10_000);

        await vscode.commands.executeCommand('nuiget.openManager');
        await until(() => mainPanelTabs().some(tab => tab.isActive), 'the main panel is active again', 10_000);
        assert.strictEqual(mainPanelTabs().length, 1, 'the panel was opened a second time');
    });

    test('asking twice in a row does not open a second panel', async () => {
        await vscode.commands.executeCommand('nuiget.openManager');
        await vscode.commands.executeCommand('nuiget.openManager');
        await waitForMainPanel();
        assert.strictEqual(mainPanelTabs().length, 1);
    });

    test('closed, it opens again', async () => {
        await waitForMainPanel();
        await vscode.window.tabGroups.close(mainPanelTabs());
        await until(() => mainPanelTabs().length === 0, 'the panel is closed', 10_000);

        await vscode.commands.executeCommand('nuiget.openManager');
        await waitForMainPanel();
        assert.strictEqual(mainPanelTabs().length, 1);
    });
});

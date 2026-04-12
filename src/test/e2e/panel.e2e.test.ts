import * as assert from 'assert';
import * as vscode from 'vscode';

suite('NuGet Panel', () => {
    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension('Gasrulle.nuiget');
        assert.ok(extension);
        if (!extension.isActive) {
            await extension.activate();
        }
    });

    suiteTeardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('panel opens with correct title', async () => {
        await vscode.commands.executeCommand('nuiget.openManager');
        await new Promise(resolve => setTimeout(resolve, 3000));

        const tabGroups = vscode.window.tabGroups;
        const nuigetTab = tabGroups.all.flatMap(g => g.tabs).find(
            tab => tab.label.includes('NuGet') || tab.label.includes('nUIget')
        );
        assert.ok(nuigetTab, 'Panel tab not found');
    });

    test('panel survives tab switch and return', async () => {
        // Open a text file
        const doc = await vscode.workspace.openTextDocument({
            content: 'test file',
            language: 'plaintext',
        });
        await vscode.window.showTextDocument(doc);

        // Switch back to NuGet
        await vscode.commands.executeCommand('nuiget.openManager');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const tabGroups = vscode.window.tabGroups;
        const nuigetTab = tabGroups.all.flatMap(g => g.tabs).find(
            tab => tab.label.includes('NuGet') || tab.label.includes('nUIget')
        );
        assert.ok(nuigetTab, 'Panel tab not found after return');
    });

    test('opening panel twice reuses existing panel', async () => {
        await vscode.commands.executeCommand('nuiget.openManager');
        await new Promise(resolve => setTimeout(resolve, 500));

        const countBefore = vscode.window.tabGroups.all.flatMap(g => g.tabs)
            .filter(tab => tab.label.includes('NuGet') || tab.label.includes('nUIget'))
            .length;

        await vscode.commands.executeCommand('nuiget.openManager');
        await new Promise(resolve => setTimeout(resolve, 500));

        const countAfter = vscode.window.tabGroups.all.flatMap(g => g.tabs)
            .filter(tab => tab.label.includes('NuGet') || tab.label.includes('nUIget'))
            .length;

        assert.strictEqual(countAfter, countBefore, 'Panel should not duplicate');
    });

    test('panel closes via workbench command', async () => {
        await vscode.commands.executeCommand('nuiget.openManager');
        await new Promise(resolve => setTimeout(resolve, 1000));

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Re-open should succeed
        await vscode.commands.executeCommand('nuiget.openManager');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const tabGroups = vscode.window.tabGroups;
        const nuigetTab = tabGroups.all.flatMap(g => g.tabs).find(
            tab => tab.label.includes('NuGet') || tab.label.includes('nUIget')
        );
        assert.ok(nuigetTab, 'Panel should reopen after close');
    });
});

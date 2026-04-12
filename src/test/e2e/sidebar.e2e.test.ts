import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Sidebar', () => {
    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension('Gasrulle.nuiget');
        assert.ok(extension);
        if (!extension.isActive) {
            await extension.activate();
        }
    });

    test('sidebar view is registered', async () => {
        // nuiget-sidebar is the view container ID
        // Verify the sidebar view resolves when focused
        await assert.doesNotReject(
            Promise.resolve(vscode.commands.executeCommand('workbench.view.extension.nuiget-sidebar'))
        );
        await new Promise(resolve => setTimeout(resolve, 3000));
    });

    test('sidebar refresh command works', async () => {
        await assert.doesNotReject(
            Promise.resolve(vscode.commands.executeCommand('nuiget.sidebar.refresh'))
        );
    });

    test('sidebar toggle prerelease commands work', async () => {
        await assert.doesNotReject(
            Promise.resolve(vscode.commands.executeCommand('nuiget.sidebar.togglePrerelease'))
        );
        await new Promise(resolve => setTimeout(resolve, 500));

        await assert.doesNotReject(
            Promise.resolve(vscode.commands.executeCommand('nuiget.sidebar.togglePrereleaseOff'))
        );
    });

    test('sidebar openFullView opens main panel', async () => {
        await vscode.commands.executeCommand('nuiget.sidebar.openFullView');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const tabGroups = vscode.window.tabGroups;
        const nuigetTab = tabGroups.all.flatMap(g => g.tabs).find(
            tab => tab.label.includes('NuGet') || tab.label.includes('nUIget')
        );
        assert.ok(nuigetTab, 'Opening full view should create a panel tab');
    });
});

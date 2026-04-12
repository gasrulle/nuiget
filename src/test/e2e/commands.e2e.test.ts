import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Commands', () => {
    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension('Gasrulle.nuiget');
        assert.ok(extension);
        if (!extension.isActive) {
            await extension.activate();
        }
    });

    test('nuiget.openManager opens webview panel', async () => {
        await vscode.commands.executeCommand('nuiget.openManager');

        // Small delay for panel to appear
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify a visible editor/webview panel exists
        // The panel registers as a custom editor, check tab groups
        const tabGroups = vscode.window.tabGroups;
        const nuigetTab = tabGroups.all.flatMap(g => g.tabs).find(
            tab => tab.label.includes('NuGet') || tab.label.includes('nUIget')
        );
        assert.ok(nuigetTab, 'NuGet panel tab not found');
    });

    test('nuiget.refreshPackages does not throw', async () => {
        // Should not throw even if no panel is open
        await assert.doesNotReject(
            Promise.resolve(vscode.commands.executeCommand('nuiget.refreshPackages'))
        );
    });

    test('nuiget.refreshPackagesScoped does not throw', async () => {
        await assert.doesNotReject(
            Promise.resolve(vscode.commands.executeCommand('nuiget.refreshPackagesScoped', { type: 'install', packageId: 'TestPkg' }))
        );
    });

    test('nuiget.clearHttpCache completes without error', async () => {
        await assert.doesNotReject(
            Promise.resolve(vscode.commands.executeCommand('nuiget.clearHttpCache'))
        );
    });

    test('nuiget.sidebar.refresh does not throw', async () => {
        await assert.doesNotReject(
            Promise.resolve(vscode.commands.executeCommand('nuiget.sidebar.refresh'))
        );
    });

    test('nuiget.sidebar.togglePrerelease does not throw', async () => {
        await assert.doesNotReject(
            Promise.resolve(vscode.commands.executeCommand('nuiget.sidebar.togglePrerelease'))
        );
    });

    test('nuiget.sidebar.togglePrereleaseOff does not throw', async () => {
        await assert.doesNotReject(
            Promise.resolve(vscode.commands.executeCommand('nuiget.sidebar.togglePrereleaseOff'))
        );
    });

    test('nuiget.sidebar.openFullView opens panel', async () => {
        await vscode.commands.executeCommand('nuiget.sidebar.openFullView');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const tabGroups = vscode.window.tabGroups;
        const nuigetTab = tabGroups.all.flatMap(g => g.tabs).find(
            tab => tab.label.includes('NuGet') || tab.label.includes('nUIget')
        );
        assert.ok(nuigetTab, 'NuGet panel tab not found after openFullView');
    });

    test('nuiget.viewPackageDetails opens panel with package', async () => {
        await vscode.commands.executeCommand('nuiget.viewPackageDetails', {
            packageId: 'Newtonsoft.Json',
            version: '13.0.3',
        });
        await new Promise(resolve => setTimeout(resolve, 2000));

        const tabGroups = vscode.window.tabGroups;
        const nuigetTab = tabGroups.all.flatMap(g => g.tabs).find(
            tab => tab.label.includes('NuGet') || tab.label.includes('nUIget')
        );
        assert.ok(nuigetTab, 'NuGet panel tab not found after viewPackageDetails');
    });
});

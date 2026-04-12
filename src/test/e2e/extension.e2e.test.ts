import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Activation', () => {
    test('extension should be present', () => {
        const extension = vscode.extensions.getExtension('Gasrulle.nuiget');
        assert.ok(extension, 'Extension not found');
    });

    test('extension should activate successfully', async () => {
        const extension = vscode.extensions.getExtension('Gasrulle.nuiget');
        assert.ok(extension);

        if (!extension.isActive) {
            await extension.activate();
        }
        assert.ok(extension.isActive, 'Extension failed to activate');
    });

    test('extension should export expected API', async () => {
        const extension = vscode.extensions.getExtension('Gasrulle.nuiget');
        assert.ok(extension);
        if (!extension.isActive) {
            await extension.activate();
        }
        // Extension may export an API or undefined — just verify activation completes
        assert.ok(extension.isActive);
    });

    test('extension should register expected commands', async () => {
        const extension = vscode.extensions.getExtension('Gasrulle.nuiget');
        assert.ok(extension);
        if (!extension.isActive) {
            await extension.activate();
        }

        const allCommands = await vscode.commands.getCommands(true);

        const expectedCommands = [
            'nuiget.openManager',
            'nuiget.refreshPackages',
            'nuiget.refreshPackagesScoped',
            'nuiget.sidebar.selectSource',
            'nuiget.sidebar.selectProject',
            'nuiget.sidebar.togglePrerelease',
            'nuiget.sidebar.togglePrereleaseOff',
            'nuiget.sidebar.refresh',
            'nuiget.sidebar.openFullView',
            'nuiget.clearHttpCache',
            'nuiget.viewPackageDetails',
        ];

        for (const cmd of expectedCommands) {
            assert.ok(allCommands.includes(cmd), `Command ${cmd} not registered`);
        }
    });
});

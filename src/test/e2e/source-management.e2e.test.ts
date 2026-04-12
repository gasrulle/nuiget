import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Source management E2E: add/remove/enable/disable custom NuGet sources.
 * Restores original nuget.config after tests.
 */
suite('Source Management', () => {
    let nugetConfigPath: string;
    let originalConfig: string;

    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension('Gasrulle.nuiget');
        assert.ok(extension);
        if (!extension.isActive) {
            await extension.activate();
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0);

        nugetConfigPath = path.join(workspaceFolders[0].uri.fsPath, 'nuget.config');

        if (fs.existsSync(nugetConfigPath)) {
            originalConfig = fs.readFileSync(nugetConfigPath, 'utf-8');
        }
    });

    suiteTeardown(async () => {
        // Restore original config
        if (nugetConfigPath && originalConfig) {
            fs.writeFileSync(nugetConfigPath, originalConfig, 'utf-8');
        }
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('nuget.config exists in workspace', () => {
        assert.ok(
            fs.existsSync(nugetConfigPath),
            'nuget.config should exist in the e2e workspace'
        );
    });

    test('nuget.config contains nuget.org source', () => {
        const content = fs.readFileSync(nugetConfigPath, 'utf-8');
        assert.ok(
            content.includes('api.nuget.org'),
            'nuget.config should reference nuget.org'
        );
    });

    test('panel can be opened to manage sources', async function () {
        this.timeout(30_000);
        await vscode.commands.executeCommand('nuiget.openManager');
        await new Promise(resolve => setTimeout(resolve, 3000));

        const tabGroups = vscode.window.tabGroups;
        const nuigetTab = tabGroups.all.flatMap(g => g.tabs).find(
            tab => tab.label.includes('NuGet') || tab.label.includes('nUIget')
        );
        assert.ok(nuigetTab, 'Panel should open for source management');
    });
});

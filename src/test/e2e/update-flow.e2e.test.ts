import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';

/**
 * Update flow E2E: install old version → check updates → update → verify.
 * Requires: .NET SDK installed, internet access.
 */
suite('Update Flow', () => {
    const TEST_PACKAGE = 'NUnit';
    const OLD_VERSION = '3.13.3';
    let csprojPath: string;
    let originalCsproj: string;

    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension('Gasrulle.nuiget');
        assert.ok(extension);
        if (!extension.isActive) {
            await extension.activate();
        }

        const csprojFiles = await vscode.workspace.findFiles('**/*.csproj', '**/node_modules/**', 1);
        assert.ok(csprojFiles.length > 0, 'No .csproj found in workspace');
        csprojPath = csprojFiles[0].fsPath;

        originalCsproj = fs.readFileSync(csprojPath, 'utf-8');
    });

    suiteTeardown(async () => {
        if (csprojPath && originalCsproj) {
            fs.writeFileSync(csprojPath, originalCsproj, 'utf-8');
        }
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('install old version then update to latest', async function () {
        this.timeout(180_000);

        // Install old version
        const installTerminal = vscode.window.createTerminal({ name: 'E2E Install Old' });
        installTerminal.show();
        installTerminal.sendText(
            `dotnet add "${csprojPath}" package ${TEST_PACKAGE} --version ${OLD_VERSION} --no-restore`
        );
        await new Promise(resolve => setTimeout(resolve, 10_000));

        let csprojContent = fs.readFileSync(csprojPath, 'utf-8');
        assert.ok(
            csprojContent.includes(OLD_VERSION),
            `.csproj should contain ${OLD_VERSION}`
        );
        installTerminal.dispose();

        // Update to latest
        const updateTerminal = vscode.window.createTerminal({ name: 'E2E Update' });
        updateTerminal.show();
        updateTerminal.sendText(
            `dotnet add "${csprojPath}" package ${TEST_PACKAGE} --no-restore`
        );
        await new Promise(resolve => setTimeout(resolve, 10_000));

        csprojContent = fs.readFileSync(csprojPath, 'utf-8');
        assert.ok(
            !csprojContent.includes(`Version="${OLD_VERSION}"`),
            `.csproj should no longer contain ${OLD_VERSION} after update`
        );
        updateTerminal.dispose();

        // Cleanup
        const removeTerminal = vscode.window.createTerminal({ name: 'E2E Remove' });
        removeTerminal.show();
        removeTerminal.sendText(`dotnet remove "${csprojPath}" package ${TEST_PACKAGE}`);
        await new Promise(resolve => setTimeout(resolve, 10_000));
        removeTerminal.dispose();
    });
});

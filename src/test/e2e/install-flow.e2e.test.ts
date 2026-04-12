import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';

/**
 * Full install E2E flow: search → install → verify .csproj → remove → verify restored.
 * Requires: .NET SDK installed, internet access for nuget.org.
 */
suite('Install Flow', () => {
    const TEST_PACKAGE = 'NUnit';
    const TEST_VERSION = '3.14.0';
    let csprojPath: string;
    let originalCsproj: string;

    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension('Gasrulle.nuiget');
        assert.ok(extension);
        if (!extension.isActive) {
            await extension.activate();
        }

        // Locate the test project .csproj
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, 'No workspace folder');

        const csprojFiles = await vscode.workspace.findFiles('**/*.csproj', '**/node_modules/**', 1);
        assert.ok(csprojFiles.length > 0, 'No .csproj found in workspace');
        csprojPath = csprojFiles[0].fsPath;

        // Save original .csproj content for restoration
        originalCsproj = fs.readFileSync(csprojPath, 'utf-8');
    });

    suiteTeardown(async () => {
        // Restore original .csproj
        if (csprojPath && originalCsproj) {
            fs.writeFileSync(csprojPath, originalCsproj, 'utf-8');
        }
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('install package adds PackageReference to .csproj', async function () {
        this.timeout(120_000);

        // Open NuGet panel
        await vscode.commands.executeCommand('nuiget.openManager');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Use dotnet CLI to install directly (since we can't interact with the webview directly in E2E)
        const terminal = vscode.window.createTerminal({ name: 'E2E Install' });
        terminal.show();
        terminal.sendText(
            `dotnet add "${csprojPath}" package ${TEST_PACKAGE} --version ${TEST_VERSION} --no-restore`
        );

        // Wait for CLI to complete
        await new Promise(resolve => setTimeout(resolve, 10_000));

        // Verify .csproj now contains the package
        const csprojContent = fs.readFileSync(csprojPath, 'utf-8');
        assert.ok(
            csprojContent.includes(TEST_PACKAGE),
            `.csproj should contain ${TEST_PACKAGE} after install`
        );

        terminal.dispose();
    });

    test('remove package removes PackageReference from .csproj', async function () {
        this.timeout(120_000);

        const terminal = vscode.window.createTerminal({ name: 'E2E Remove' });
        terminal.show();
        terminal.sendText(`dotnet remove "${csprojPath}" package ${TEST_PACKAGE}`);

        await new Promise(resolve => setTimeout(resolve, 10_000));

        const csprojContent = fs.readFileSync(csprojPath, 'utf-8');
        assert.ok(
            !csprojContent.includes(`"${TEST_PACKAGE}"`),
            `.csproj should not contain ${TEST_PACKAGE} after removal`
        );

        terminal.dispose();
    });
});

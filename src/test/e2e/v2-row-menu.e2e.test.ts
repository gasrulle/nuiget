import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, closeAllEditors, dotnet, fixtureProject, FixtureProject, until } from './v2Support';

/**
 * The commands of VS Code's `webview/context` menu in the extension host, on the floor and on stable (UX-P2.9b). An
 * extension-host test cannot reach a webview's DOM: that right-click and Shift+F10 open the menu is the capture suite's
 * `[menu]` probe, on the `ui` and `ui-floor` lanes.
 */
suite('2.0 row menu', () => {
    const PACKAGE = 'NUnit';
    const VERSION = '3.14.0';
    let project: FixtureProject;

    const context = (changes: Record<string, unknown> = {}): Record<string, unknown> => ({
        webviewSection: 'installedRow', packageId: PACKAGE, projectPath: project.path, installedVersion: VERSION, preventDefaultContextMenuItems: true, webview: 'nugetManager', ...changes,
    });

    suiteSetup(async () => {
        await activateExtension();
        project = await fixtureProject();
        assert.ok(!project.original.includes(`Include="${PACKAGE}"`), `The fixture project already references ${PACKAGE}`);
    });

    suiteTeardown(async () => {
        project?.restore();
        await closeAllEditors();
    });

    test('the row menu uninstalls through webview/context', async function () {
        this.timeout(180_000);
        const added = await dotnet(['package', 'add', PACKAGE, '--version', VERSION, '--no-restore', '--project', project.path], project.directory);
        assert.strictEqual(added.code, 0, `dotnet package add failed:\n${added.output}`);
        await until(() => project.read().includes(`Include="${PACKAGE}"`), `the project file references ${PACKAGE}`, 30_000);

        await vscode.commands.executeCommand('nuiget.row.uninstall', context());
        await until(() => !project.read().includes(`Include="${PACKAGE}"`), `the project file no longer references ${PACKAGE}`, 120_000);
    });

    test('a malformed context runs nothing', async function () {
        this.timeout(60_000);
        const added = await dotnet(['package', 'add', PACKAGE, '--version', VERSION, '--no-restore', '--project', project.path], project.directory);
        assert.strictEqual(added.code, 0, `dotnet package add failed:\n${added.output}`);
        await until(() => project.read().includes(`Include="${PACKAGE}"`), `the project file references ${PACKAGE}`, 30_000);
        const before = project.read();

        await vscode.commands.executeCommand('nuiget.row.uninstall', context({ packageId: 3 }));
        await vscode.commands.executeCommand('nuiget.row.uninstall', context({ webviewSection: 'transitiveRow' }));
        assert.strictEqual(project.read(), before, 'A malformed or read-only context wrote to the project file');
    });
});

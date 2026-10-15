import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, closeAllEditors, dotnet, fixtureProject, FixtureProject, until, waitForMainPanel } from './v2Support';

/**
 * A package added and removed with the noun-first CLI while the 2.0 main panel is open (P5.12a, port of
 * `install-flow.e2e.test.ts`, which typed verb-first `dotnet add … package` into a terminal and slept). The extension
 * sees the project file change under it; the install through the panel itself is the UI suite's. `--no-restore`
 * keeps the run offline (the fixture uses no central package management, where the flag is never passed).
 */
suite('2.0 install flow (noun-first CLI)', () => {
    const PACKAGE = 'NUnit';
    const VERSION = '3.14.0';
    let project: FixtureProject;

    suiteSetup(async () => {
        await activateExtension();
        project = await fixtureProject();
        assert.ok(!project.original.includes(`Include="${PACKAGE}"`), `The fixture project already references ${PACKAGE}`);
    });

    suiteTeardown(async () => {
        project?.restore();
        await closeAllEditors();
    });

    test('dotnet package add writes the reference while the panel is open', async function () {
        this.timeout(120_000);
        await vscode.commands.executeCommand('nuiget.openManager');
        await waitForMainPanel();

        const added = await dotnet(['package', 'add', PACKAGE, '--version', VERSION, '--no-restore', '--project', project.path], project.directory);
        assert.strictEqual(added.code, 0, `dotnet package add failed:\n${added.output}`);
        await until(() => project.read().includes(`Include="${PACKAGE}" Version="${VERSION}"`), `the project file references ${PACKAGE} ${VERSION}`, 30_000);
        await vscode.commands.executeCommand('nuiget.refreshPackages');
    });

    test('dotnet package remove takes it out again and leaves the other references', async function () {
        this.timeout(120_000);
        const removed = await dotnet(['package', 'remove', PACKAGE, '--project', project.path], project.directory);
        assert.strictEqual(removed.code, 0, `dotnet package remove failed:\n${removed.output}`);
        await until(() => !project.read().includes(`Include="${PACKAGE}"`), `the project file no longer references ${PACKAGE}`, 30_000);
        assert.ok(project.read().includes('Include="Newtonsoft.Json"') && project.read().includes('Include="Serilog"'), 'another reference went with it');
        await vscode.commands.executeCommand('nuiget.refreshPackages');
    });
});

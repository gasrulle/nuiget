import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, closeAllEditors, dotnet, fixtureProject, FixtureProject, until } from './v2Support';

/**
 * An older version replaced by a newer one with the noun-first CLI while the 2.0 sidebar is shown (P5.12a, port of
 * `update-flow.e2e.test.ts`). The legacy file "updated" with `dotnet add package` and no version, which with
 * `--no-restore` writes `Version="*"`, and slept a fixed 10 s for each step (finding N44); here the newer version is
 * named and every step waits for the project file. The update through the sidebar itself is the UI suite's.
 */
suite('2.0 update flow (noun-first CLI)', () => {
    const PACKAGE = 'NUnit';
    const OLD_VERSION = '3.13.3';
    const NEW_VERSION = '3.14.0';
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

    test('the old version is replaced by the new one, and the reference removed afterwards', async function () {
        this.timeout(180_000);
        await vscode.commands.executeCommand('workbench.view.extension.nuiget-sidebar');
        const add = (version: string) => dotnet(['package', 'add', PACKAGE, '--version', version, '--no-restore', '--project', project.path], project.directory);

        const old = await add(OLD_VERSION);
        assert.strictEqual(old.code, 0, `dotnet package add ${OLD_VERSION} failed:\n${old.output}`);
        await until(() => project.read().includes(`Include="${PACKAGE}" Version="${OLD_VERSION}"`), `the project file references ${PACKAGE} ${OLD_VERSION}`, 30_000);
        await vscode.commands.executeCommand('nuiget.sidebar.refresh');

        const updated = await add(NEW_VERSION);
        assert.strictEqual(updated.code, 0, `dotnet package add ${NEW_VERSION} failed:\n${updated.output}`);
        await until(() => project.read().includes(`Include="${PACKAGE}" Version="${NEW_VERSION}"`), `the project file references ${PACKAGE} ${NEW_VERSION}`, 30_000);
        assert.ok(!project.read().includes(`Version="${OLD_VERSION}"`), `${OLD_VERSION} is still in the project file`);
        assert.strictEqual(project.read().split(`Include="${PACKAGE}"`).length, 2, `${PACKAGE} is referenced more than once`);
        await vscode.commands.executeCommand('nuiget.sidebar.refresh');

        const removed = await dotnet(['package', 'remove', PACKAGE, '--project', project.path], project.directory);
        assert.strictEqual(removed.code, 0, `dotnet package remove failed:\n${removed.output}`);
        await until(() => !project.read().includes(`Include="${PACKAGE}"`), `the project file no longer references ${PACKAGE}`, 30_000);
    });
});

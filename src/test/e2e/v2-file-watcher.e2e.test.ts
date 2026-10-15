import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, closeAllEditors, fixtureProject, FixtureProject, until, waitForMainPanel } from './v2Support';

/**
 * A project file changed outside the extension while both 2.0 surfaces are open (P5.12a, port of
 * `file-watcher.e2e.test.ts`, which slept through the 1.x watcher's 5 s debounce and asserted `true`). That the
 * watcher invalidates the installed list, and that the lists follow, is proved by the harness
 * (`src/test/harness/scenarios.test.ts`) and by `src/test/ui/v2/sidebar.ui.test.ts`; an extension-host test does not
 * see the webviews. Here: edits and the write-back reach the file while the watcher runs, and the commands that
 * read the project afterwards resolve.
 */
suite('2.0 project file watcher', () => {
    let project: FixtureProject;

    suiteSetup(async () => {
        await activateExtension();
        project = await fixtureProject();
    });

    suiteTeardown(async () => {
        project?.restore();
        await closeAllEditors();
    });

    test('an edit outside the extension and its write-back are read without an error', async function () {
        this.timeout(60_000);
        await vscode.commands.executeCommand('workbench.view.extension.nuiget-sidebar');
        await vscode.commands.executeCommand('nuiget.openManager');
        await waitForMainPanel();

        const edited = project.original.replace('</Project>', '  <!-- edited outside the extension -->\n</Project>');
        assert.notStrictEqual(edited, project.original, 'The fixture project has no closing tag');
        await vscode.workspace.fs.writeFile(vscode.Uri.file(project.path), Buffer.from(edited, 'utf-8'));
        await until(() => project.read().includes('edited outside the extension'), 'the edit is in the project file', 10_000);
        await vscode.commands.executeCommand('nuiget.refreshPackages');
        await vscode.commands.executeCommand('nuiget.sidebar.refresh');

        project.restore();
        await until(() => project.read() === project.original, 'the project file is back as it was', 10_000);
        await vscode.commands.executeCommand('nuiget.refreshPackages');
        await vscode.commands.executeCommand('nuiget.sidebar.refresh');
    });
});

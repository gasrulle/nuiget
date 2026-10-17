import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { activateExtension, closeAllEditors, dotnet, waitForMainPanel } from './v2Support';

/**
 * The package sources of the fixture workspace as the 2.0 entry sees them (P5.12a, port of
 * `source-management.e2e.test.ts`). The source dialog itself (list, enable, disable, add, remove) is the UI suite's
 * (`src/test/ui/v2/main-sources.ui.test.ts`); here: the workspace's `nuget.config` names nuget.org, the SDK reads
 * the same source from it, and the panel that manages sources opens. The config file is compared before and after,
 * so nothing here writes to it.
 */
suite('2.0 package sources of the workspace', () => {
    let configPath: string;
    let original: string;

    suiteSetup(async () => {
        await activateExtension();
        const folders = vscode.workspace.workspaceFolders;
        assert.ok(folders && folders.length > 0, 'No workspace folder');
        configPath = path.join(folders[0].uri.fsPath, 'nuget.config');
        assert.ok(fs.existsSync(configPath), 'The e2e workspace has no nuget.config');
        original = fs.readFileSync(configPath, 'utf-8');
    });

    suiteTeardown(async () => {
        await closeAllEditors();
        assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), original, 'nuget.config changed during the suite');
    });

    test('nuget.config names nuget.org', () => {
        assert.ok(original.includes('https://api.nuget.org/v3/index.json'), 'nuget.config does not reference nuget.org');
    });

    test('the SDK lists the same source for the workspace (dotnet nuget list source)', async function () {
        this.timeout(60_000);
        const listed = await dotnet(['nuget', 'list', 'source', '--format', 'short'], path.dirname(configPath));
        assert.strictEqual(listed.code, 0, `dotnet nuget list source failed:\n${listed.output}`);
        assert.ok(listed.output.includes('https://api.nuget.org/v3/index.json'), `nuget.org is not among the sources:\n${listed.output}`);
    });

    test('the panel that manages the sources opens', async () => {
        await vscode.commands.executeCommand('nuiget.openManager');
        await waitForMainPanel();
    });
});

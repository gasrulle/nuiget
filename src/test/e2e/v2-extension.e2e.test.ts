import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, CONTRIBUTED_COMMANDS, LEGACY_ONLY_COMMANDS } from './v2Support';

/**
 * Activation of the 2.0 entry in the extension host (P5.12a, port of `extension.e2e.test.ts`). Run with
 * `NUIGET_V2=1 npm run test:e2e` after a `--v2` build.
 */
suite('2.0 extension activation', () => {
    test('the extension is installed in the test host', () => {
        assert.ok(vscode.extensions.getExtension('Gasrulle.nuiget'), 'Extension not found');
    });

    test('it activates', async () => {
        const extension = await activateExtension();
        assert.strictEqual(extension.isActive, true);
    });

    test('it registers every contributed command and none of the 1.x entry', async () => {
        await activateExtension();
        const commands = new Set(await vscode.commands.getCommands(true));
        assert.deepStrictEqual(CONTRIBUTED_COMMANDS.filter(command => !commands.has(command)), [], 'contributed commands that are not registered');
        assert.deepStrictEqual(LEGACY_ONLY_COMMANDS.filter(command => commands.has(command)), [], 'commands of the 1.x entry: dist/ was not built with --v2');
    });
});

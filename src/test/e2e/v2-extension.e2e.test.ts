import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, CONTRIBUTED_COMMANDS } from './v2Support';

/**
 * Activation of the 2.0 entry in the extension host (P5.12a, port of `extension.e2e.test.ts`). Run with
 * `npm run test:e2e` after `node esbuild.mjs --production`.
 */
suite('2.0 extension activation', () => {
    test('the extension is installed in the test host', () => {
        assert.ok(vscode.extensions.getExtension('Gasrulle.nuiget'), 'Extension not found');
    });

    test('it activates', async () => {
        const extension = await activateExtension();
        assert.strictEqual(extension.isActive, true);
    });

    test('it registers every contributed command', async () => {
        await activateExtension();
        const commands = new Set(await vscode.commands.getCommands(true));
        assert.deepStrictEqual(CONTRIBUTED_COMMANDS.filter(command => !commands.has(command)), [], 'contributed commands that are not registered');
    });
});

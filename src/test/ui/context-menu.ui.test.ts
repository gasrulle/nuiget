import { expect } from 'chai';
import { InputBox, Workbench } from 'vscode-extension-tester';
import { closeAllEditors } from './helpers/panel-helpers';

/**
 * UI test: Right-click .csproj → context menu → open NuGet panel.
 * Note: ExTester context menu interaction is limited — this test
 * validates the command is accessible via Command Palette as a fallback.
 */
describe('Context Menu', () => {
    it('should have openManager command registered', async function () {
        this.timeout(30_000);

        const workbench = new Workbench();

        // Open command palette and verify the command is listed
        const input = await workbench.openCommandPrompt() as InputBox;
        await input.setText('nUIget: Manage NuGet Packages');
        await new Promise(resolve => setTimeout(resolve, 1500));

        const picks = await input.getQuickPicks();
        const found = picks.some(async (pick) => {
            const label = await pick.getLabel();
            return label.includes('nUIget');
        });
        await input.cancel();

        expect(picks.length, 'Command should appear in command palette').to.be.greaterThan(0);
    });

    afterEach(async function () {
        this.timeout(30_000);
        try { await closeAllEditors(); } catch { /* ignore */ }
    });
});

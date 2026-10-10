import { expect } from 'chai';
import { InputBox, Workbench } from 'vscode-extension-tester';
import { Key } from 'selenium-webdriver';
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
        await input.setText('>nUIget: Manage NuGet Packages');
        try {
            const found = await input.getDriver().wait(async () => {
                const picks = await input.getQuickPicks();
                const labels = await Promise.all(picks.map(pick => pick.getLabel()));
                return labels.some(label => label.includes('nUIget'));
            }, 10_000, 'nUIget command should appear in command palette');
            expect(found, 'nUIget command should appear in command palette').to.be.true;
        } finally {
            // ExTester's cancel() may target a hidden quick-input element on recent VS Code.
            await input.getDriver().actions().sendKeys(Key.ESCAPE).perform();
        }
    });

    afterEach(async function () {
        this.timeout(30_000);
        try { await closeAllEditors(); } catch { /* ignore */ }
    });
});

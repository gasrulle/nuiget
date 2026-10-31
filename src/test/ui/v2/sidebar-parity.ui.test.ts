import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, Key, Workbench } from 'vscode-extension-tester';
import { enterMainWebview } from './mainWebview';
import { driverOf, enterSidebarWebview, findByTestId, leaveWebview, openSidebarView, poll, screenshot, waitForText } from './sidebarWebview';

/**
 * Sidebar parity of the 2.0 sidebar in VS Code (plan item P5.10), on the VSIX that `npm run test:ui` packages: the sash
 * between the Installed and Updates sections moves with the keyboard; "Open Full Manager" opens the main panel beside
 * the sidebar; with the panel open, an uninstall from the sidebar is still announced in its live region (the condition
 * of finding N66). The fixture project is written back afterwards and the sidebar waits until it lists it again. All
 * Projects in the sidebar is proved in jsdom: the fixture has one project, which the host never groups.
 */
describe('2.0 sidebar parity', () => {
    const csprojPath = path.resolve('src/test/e2e/fixtures/e2e-workspace/TestProject.csproj');
    let originalCsproj = '';

    before(() => {
        originalCsproj = fs.readFileSync(csprojPath, 'utf-8');
    });

    after(async function () {
        this.timeout(180_000);
        fs.writeFileSync(csprojPath, originalCsproj, 'utf-8');
        // The next file expects Serilog in the list again: wait for the watcher's refresh.
        try {
            await openSidebarView();
            await enterSidebarWebview();
            await findByTestId('package-row-serilog', 120_000);
            // Both rows, three checks in a row: a refresh still on its way would drop one again.
            let steady = 0;
            await poll(async () => {
                const rows = await driverOf().executeScript<number>('return document.querySelectorAll(\'[data-testid="sidebar-installed-list"] [data-index]\').length;');
                steady = rows === 2 ? steady + 1 : 0;
                return steady >= 3 ? true : undefined;
            }, 'both rows to stay', 120_000);
        } finally {
            await leaveWebview();
        }
    });

    afterEach(async () => {
        await leaveWebview();
    });

    it('Update all in the Updates header opens the confirmation; Cancel leaves the project file as it was', async function () {
        this.timeout(180_000);
        await openSidebarView();
        await enterSidebarWebview();
        await poll(async () => ((await driverOf().findElements(By.css('[data-testid="sidebar-updates-list"] .nuiget-row-option'))).length > 0 ? true : undefined), 'an update row', 120_000);
        await (await findByTestId('sidebar-update-all-button', 30_000)).click();
        try {
            const dialog = await findByTestId('confirm-dialog', 10_000);
            // Which updates join depends on what earlier files left (an update of Newtonsoft.Json runs before this file):
            // every line is one package with the version it goes from and to.
            expect(await dialog.getAttribute('textContent')).to.match(/^Update \d+ packages?\?(?:[\w.]+: \S+ → \S+)+/);
            await screenshot('sidebar-update-all-dialog');
        } finally {
            // A dialog left open covers the sidebar for every later test.
            const cancel = await driverOf().findElements(By.css('[data-testid="confirm-dialog-cancel"]'));
            if (cancel.length > 0) {
                await cancel[0].click();
            }
        }
        await poll(async () => ((await driverOf().findElements(By.css('[data-testid="confirm-dialog"]'))).length === 0 ? true : undefined), 'the dialog closed', 10_000);
        expect(fs.readFileSync(csprojPath, 'utf-8')).to.equal(originalCsproj);
    });

    it('the sash between the sections moves with the keyboard', async function () {
        this.timeout(180_000);
        await openSidebarView();
        await enterSidebarWebview();
        const sash = await findByTestId('sash', 120_000);
        expect(await sash.getAttribute('role')).to.equal('separator');
        const before = Number(await sash.getAttribute('aria-valuenow'));
        // Focused without a pointer: a press on the sash would start a drag and move it to wherever the pointer is.
        await driverOf().executeScript('document.querySelector(\'[data-testid="sash"]\').focus();');
        await (await driverOf().switchTo().activeElement()).sendKeys(Key.ARROW_DOWN);
        await poll(async () => (Number(await sash.getAttribute('aria-valuenow')) !== before ? true : undefined), 'the sash to move', 10_000);
        // Enter puts it back to its default, which the view keeps for the files that run after this one.
        await (await driverOf().switchTo().activeElement()).sendKeys(Key.ENTER);
        await poll(async () => (Number(await sash.getAttribute('aria-valuenow')) === 50 ? true : undefined), 'the sash back at 50', 10_000);
    });

    it('Open Full Manager opens the main panel beside the sidebar', async function () {
        this.timeout(180_000);
        await openSidebarView();
        await leaveWebview();
        await new Workbench().executeCommand('nUIget: Open Full Manager');
        await poll(async () => ((await driverOf().findElements(By.css('iframe.webview'))).length >= 2 ? true : undefined), 'two webviews', 60_000);
        await enterMainWebview();
        await findByTestId('nuiget-app', 30_000);
    });

    it('with the main panel open, an uninstall from the sidebar is announced in its live region (N66)', async function () {
        this.timeout(300_000);
        await openSidebarView();
        await enterSidebarWebview();
        const option = await (await findByTestId('package-row-serilog', 120_000)).findElement(By.css('.nuiget-row-option'));
        await option.click();
        await option.sendKeys(Key.DELETE);
        await waitForText('status-live', 'Uninstalled Serilog', 180_000);
        // The operation ends with its restore and the refresh after it; writing the project back before then races them.
        await poll(async () => {
            const state = await driverOf().executeScript<{ serilog: boolean; busy: boolean }>(`
                const list = document.querySelector('[data-testid="sidebar-installed-list"]');
                return { serilog: !!document.querySelector('[data-testid="package-row-serilog"]'), busy: !!list?.querySelector('[aria-busy="true"]') };
            `);
            return !state.serilog && !state.busy ? true : undefined;
        }, 'the uninstall to settle', 120_000);
    });
});

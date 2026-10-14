import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, Key } from 'vscode-extension-tester';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { findByTestId, leaveWebview, poll, waitForTestIdGone } from './sidebarWebview';

/**
 * The Installed tab of the 2.0 main panel in VS Code (plan item P5.4), on a VSIX packaged with `NUIGET_V2=1`: the
 * multi-selectable list of the fixture project, a row selected for a bulk action, the bulk uninstall dialog
 * cancelled with Escape and confirmed, with the project file following. Nothing waits on the live region (N66).
 */
describe('2.0 main panel: Installed tab', () => {
    const csprojPath = path.resolve('src/test/e2e/fixtures/e2e-workspace/TestProject.csproj');
    let originalCsproj = '';

    const serilogOption = async () => (await findByTestId('package-row-serilog', 120_000)).findElement(By.css('[role="option"]'));
    const attribute = async (testId: string, name: string): Promise<string | null> => (await findByTestId(testId)).getAttribute(name);

    before(() => {
        originalCsproj = fs.readFileSync(csprojPath, 'utf-8');
    });

    after(() => {
        // The fixture project is shared with the other suites: leave it as it was found.
        fs.writeFileSync(csprojPath, originalCsproj, 'utf-8');
    });

    beforeEach(async () => {
        await openMainPanel();
        await enterMainWebview();
    });

    afterEach(async () => {
        await leaveWebview();
    });

    it('lists the installed packages of the fixture project', async function () {
        this.timeout(180_000);
        // The first list needs the SDK probe and the project's sources: generous, and still bounded.
        const list = await findByTestId('installed-list', 120_000);
        expect(await list.getAttribute('role')).to.equal('listbox');
        expect(await list.getAttribute('aria-multiselectable')).to.equal('true');
        await findByTestId('package-row-serilog', 120_000);
        await findByTestId('package-row-newtonsoft.json');
    });

    it('selects a row and marks it for a bulk action', async function () {
        this.timeout(120_000);
        const option = await serilogOption();
        await option.click();
        expect(await option.getAttribute('aria-current')).to.equal('true');
        await option.sendKeys(Key.SPACE);
        await poll(async () => ((await option.getAttribute('aria-selected')) === 'true' ? true : undefined), 'Serilog selected for a bulk action', 10_000);
        expect(await (await findByTestId('uninstall-selected-button')).isEnabled()).to.equal(true);
        // Leave nothing selected for the next test.
        await option.sendKeys(Key.SPACE);
        await poll(async () => ((await option.getAttribute('aria-selected')) === 'false' ? true : undefined), 'Serilog deselected', 10_000);
    });

    it('the bulk uninstall dialog cancels on Escape and leaves the project file as it was', async function () {
        this.timeout(120_000);
        const option = await serilogOption();
        await option.click();
        await option.sendKeys(Key.SPACE);
        await (await findByTestId('uninstall-selected-button')).click();
        const dialog = await findByTestId('confirm-dialog', 10_000);
        expect(await dialog.getAttribute('textContent')).to.contain('Serilog');
        await (await findByTestId('confirm-dialog-cancel')).sendKeys(Key.ESCAPE);
        await waitForTestIdGone('confirm-dialog', 10_000);
        expect(fs.readFileSync(csprojPath, 'utf-8')).to.equal(originalCsproj);
        expect(await attribute('uninstall-selected-button', 'disabled')).to.equal(null);
    });

    it('confirms the bulk uninstall and the project file follows', async function () {
        this.timeout(300_000);
        // Serilog is still selected from the test before; select it only if it is not.
        const option = await serilogOption();
        if ((await option.getAttribute('aria-selected')) !== 'true') {
            await option.click();
            await option.sendKeys(Key.SPACE);
        }
        await (await findByTestId('uninstall-selected-button')).click();
        await (await findByTestId('confirm-dialog-confirm', 10_000)).click();
        await waitForTestIdGone('confirm-dialog', 10_000);
        // The row leaves with the host's next list, after `dotnet package remove` and the restore.
        await waitForTestIdGone('package-row-serilog', 240_000);
        await poll(async () => (fs.readFileSync(csprojPath, 'utf-8').includes('Serilog') ? undefined : true), 'Serilog out of TestProject.csproj', 30_000);
        await findByTestId('package-row-newtonsoft.json');
    });
});

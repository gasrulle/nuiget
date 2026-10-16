import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, Key } from 'vscode-extension-tester';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { findByTestId, leaveWebview, poll, screenshot, waitForTestIdGone } from './sidebarWebview';

/**
 * The Installed tab of the 2.0 main panel in VS Code (plan item P5.4), on the VSIX that `npm run test:ui` packages: the
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

    beforeEach(async function () {
        // This file runs first, right after VS Code starts: the palette and the webview may take a while. Mocha's
        // default of 2 s is the hook's limit otherwise; the helpers' own polls are bounded within this one.
        this.timeout(150_000);
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
        await screenshot('main-installed-single');
    });

    it('the transitive section opens with what the project gets through its references (P9.0)', async function () {
        this.timeout(300_000);
        await findByTestId('package-row-serilog', 120_000);
        const header = await findByTestId('section-header-transitive');
        await header.click();
        await poll(async () => ((await header.getAttribute('aria-expanded')) === 'true' ? true : undefined), 'the transitive section open', 10_000);
        const section = await findByTestId('transitive-section');
        // The list, the empty state or, on a runner that has not restored the fixture, the banner that offers Restore.
        const shown = async (): Promise<'list' | 'empty' | 'banner' | undefined> => {
            if ((await section.findElements(By.css('[data-testid^="transitive-list"]'))).length > 0) {
                return 'list';
            }
            if (((await section.getAttribute('textContent')) ?? '').includes('No transitive dependencies')) {
                return 'empty';
            }
            return (await section.findElements(By.css('[data-testid="transitive-restore-banner"]'))).length > 0 ? 'banner' : undefined;
        };
        if ((await poll(shown, 'the transitive packages, their empty state or the restore banner', 120_000)) === 'banner') {
            await (await (await findByTestId('transitive-restore-banner')).findElement(By.css('button'))).click();
            await poll(async () => {
                const now = await shown();
                return now === 'banner' ? undefined : now;
            }, 'the transitive packages after the restore', 240_000);
        }
        await screenshot('main-transitive-expanded');
        // The files after this one measure the Installed tab with the section closed.
        await header.click();
        await poll(async () => ((await header.getAttribute('aria-expanded')) === 'false' ? true : undefined), 'the transitive section closed', 10_000);
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

    it('Select all marks every row for a bulk action, and a second press clears it (P5.12b)', async function () {
        this.timeout(120_000);
        const list = await findByTestId('installed-list', 120_000);
        await findByTestId('package-row-serilog', 120_000);
        const selection = async (): Promise<string[]> => Promise.all((await list.findElements(By.css('[role="option"]'))).map(option => option.getAttribute('aria-selected').then(value => value ?? '')));
        const button = await findByTestId('select-all-button');

        await button.click();
        await poll(async () => ((await selection()).every(value => value === 'true') ? true : undefined), 'every row selected', 10_000);
        expect(await button.getAttribute('aria-pressed')).to.equal('true');
        expect(await (await findByTestId('uninstall-selected-button')).getText()).to.contain('(2)');

        await button.click();
        await poll(async () => ((await selection()).every(value => value === 'false') ? true : undefined), 'no row selected', 10_000);
        expect(await button.getAttribute('aria-pressed')).to.equal('false');
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

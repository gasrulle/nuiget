import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, Key } from 'vscode-extension-tester';
import { enterMainWebview, measureLoadedRows, openMainPanel } from './mainWebview';
import { driverOf, findByTestId, leaveWebview, poll, screenshot, tokenPx, waitForTestIdGone } from './sidebarWebview';

/**
 * The Updates tab of the 2.0 main panel in VS Code (plan item P5.5), on the VSIX that `npm run test:ui` packages: the
 * updates of the fixture project with their versions and the count on the tab, the Update all dialog cancelled with
 * Escape, and one package updated with Enter, with the project file following. Nothing waits on the live region (N66).
 */
describe('2.0 main panel: Updates tab', () => {
    const csprojPath = path.resolve('src/test/e2e/fixtures/e2e-workspace/TestProject.csproj');
    let originalCsproj = '';

    const optionOf = async (testId: string) => (await findByTestId(testId, 120_000)).findElement(By.css('.nuiget-row-option'));

    before(() => {
        originalCsproj = fs.readFileSync(csprojPath, 'utf-8');
    });

    after(() => {
        // The fixture project is shared with the other suites: leave it as it was found.
        fs.writeFileSync(csprojPath, originalCsproj, 'utf-8');
    });

    beforeEach(async function () {
        this.timeout(150_000);
        await openMainPanel();
        await enterMainWebview();
        await (await findByTestId('updates-tab', 60_000)).click();
    });

    afterEach(async () => {
        await leaveWebview();
    });

    it('lists the updates of the fixture project with their versions and counts them on the tab', async function () {
        this.timeout(180_000);
        // The first answer needs the SDK probe, the project's sources and a feed read per package: generous, and bounded.
        const list = await findByTestId('updates-list', 120_000);
        expect(await list.getAttribute('role')).to.equal('listbox');
        expect(await list.getAttribute('aria-multiselectable')).to.equal('true');
        const row = await findByTestId('package-row-newtonsoft.json', 120_000);
        expect(await row.getAttribute('textContent')).to.contain('13.0.2 →');
        const tab = await findByTestId('updates-tab');
        await poll(async () => (/\d/.test((await tab.getAttribute('textContent')) ?? '') ? true : undefined), 'a count on the Updates tab', 30_000);
        await screenshot('main-updates');
    });

    it('update rows are comfortable rows with a loaded icon, as tall as the token (TF3, UX-P2.2), check box centred', async function () {
        this.timeout(180_000);
        await findByTestId('package-row-newtonsoft.json', 120_000);
        const token = tokenPx('--nuiget-row-height-comfortable');
        const rows = await measureLoadedRows('updates-list');
        console.warn('[P9.12] comfortable rows: ' + JSON.stringify(rows));
        expect(rows.length).to.be.at.least(2);
        for (const row of rows) {
            expect(row.blockSize, row.name).to.equal(`${token}px`);
            expect(row.height, row.name).to.be.within(token, token + 2);
            expect(row.iconSrc, row.name).to.not.equal('');
        }
        // The check box sits on the card's vertical centre (P9.fix-3): within 2 px of the row wrapper's centre.
        const centres = await driverOf().executeScript<{ name: string; check: number; card: number }[]>(`
            return Array.from(document.querySelectorAll('[data-testid="updates-list"] .nuiget-row-option')).map(option => {
                const card = (option.closest('.nuiget-row') ?? option).getBoundingClientRect();
                const check = option.querySelector('.nuiget-row-check').getBoundingClientRect();
                return { name: option.querySelector('.nuiget-row-name')?.textContent ?? '', check: check.top + check.height / 2, card: card.top + card.height / 2 };
            });`);
        console.warn('[P9.fix-3] check box centres: ' + JSON.stringify(centres));
        expect(centres.length).to.be.at.least(2);
        for (const row of centres) {
            expect(Math.abs(row.check - row.card), row.name).to.be.at.most(2);
        }
    });

    it('the Update all button ends on the list\'s inset line (P9.fix-4, MS-1, UX-P2.5)', async function () {
        this.timeout(180_000);
        await findByTestId('package-row-newtonsoft.json', 120_000);
        const edges = await driverOf().executeScript<{ button: number; list: number; inset: number }>(`
            return {
                inset: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nuiget-inset')),
                button: document.querySelector('[data-testid="update-all-button"]').getBoundingClientRect().right,
                list: document.querySelector('[data-testid="updates-list"]').getBoundingClientRect().right,
            };`);
        console.warn('[P9.fix-4] update-all-button right edge: ' + JSON.stringify(edges));
        expect(Math.abs(edges.list - edges.inset - edges.button), 'from the primary button to the list\'s inset line (MS-1)').to.be.at.most(1);
    });

    it('the Update all dialog lists the packages and cancels on Escape, leaving the project file as it was', async function () {
        this.timeout(120_000);
        await findByTestId('package-row-newtonsoft.json', 120_000);
        await (await findByTestId('update-all-button')).click();
        const dialog = await findByTestId('confirm-dialog', 10_000);
        expect(await dialog.getAttribute('textContent')).to.contain('Newtonsoft.Json: 13.0.2 →');
        await (await findByTestId('confirm-dialog-cancel')).sendKeys(Key.ESCAPE);
        await waitForTestIdGone('confirm-dialog', 10_000);
        expect(fs.readFileSync(csprojPath, 'utf-8')).to.equal(originalCsproj);
    });

    it('Enter updates one package and the project file follows', async function () {
        this.timeout(300_000);
        const option = await optionOf('package-row-newtonsoft.json');
        await option.click();
        await option.sendKeys(Key.ENTER);
        // The row leaves with the host's next list, after `dotnet package add` and the restore.
        await waitForTestIdGone('package-row-newtonsoft.json', 240_000);
        await poll(async () => (fs.readFileSync(csprojPath, 'utf-8').includes('Version="13.0.2"') ? undefined : true), 'Newtonsoft.Json updated in TestProject.csproj', 30_000);
    });
});

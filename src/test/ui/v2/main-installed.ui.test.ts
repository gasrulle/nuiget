import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, Key } from 'vscode-extension-tester';
import { enterMainWebview, measureLoadedRows, openMainPanel } from './mainWebview';
import { driverOf, findByTestId, leaveWebview, poll, screenshot, tokenPx, waitForTestIdGone } from './sidebarWebview';

/**
 * The Installed tab of the 2.0 main panel in VS Code (plan item P5.4), on the VSIX that `npm run test:ui` packages: the
 * multi-selectable list of the fixture project, a row selected for a bulk action, the bulk uninstall dialog
 * cancelled with Escape and confirmed, with the project file following. Nothing waits on the live region (N66).
 */
describe('2.0 main panel: Installed tab', () => {
    const csprojPath = path.resolve('src/test/e2e/fixtures/e2e-workspace/TestProject.csproj');
    let originalCsproj = '';

    const serilogOption = async () => (await findByTestId('package-row-serilog', 120_000)).findElement(By.css('.nuiget-row-option'));
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
        expect(await list.getAttribute('role')).to.equal('tree');
        expect(await list.getAttribute('aria-multiselectable')).to.equal('true');
        await findByTestId('package-row-serilog', 120_000);
        await findByTestId('package-row-newtonsoft.json');
        await screenshot('main-installed-single');
    });

    it('a text button and a check box ring in focusBorder at offset 2 on keyboard focus (DS-FOCUS-1, UX-P2.3)', async function () {
        this.timeout(180_000);
        await findByTestId('select-all-button', 120_000);
        const tabUntil = async (keys: string, predicate: string, what: string): Promise<{ width: string; style: string; offset: string; colour: string; focus: string }> => {
            await (await findByTestId('search-input', 30_000)).click();
            await poll(async () => {
                if (await driverOf().executeScript<boolean>(`return ${predicate};`)) {
                    return true;
                }
                await (await driverOf().switchTo().activeElement()).sendKeys(keys);
                return undefined;
            }, what, 30_000);
            return driverOf().executeScript(`
                const style = getComputedStyle(document.activeElement);
                const probe = document.createElement('span');
                probe.style.color = 'var(--vscode-focusBorder)';
                document.body.append(probe);
                const focus = getComputedStyle(probe).color;
                probe.remove();
                return { width: style.outlineWidth, style: style.outlineStyle, offset: style.outlineOffset, colour: style.outlineColor, focus };`);
        };
        const button = await tabUntil(Key.TAB, 'document.activeElement?.dataset?.testid === "select-all-button"', 'Select all reached with Tab');
        expect([button.width, button.style, button.offset, button.colour]).to.deep.equal(['1px', 'solid', '2px', button.focus]);
        const box = await tabUntil(Key.chord(Key.SHIFT, Key.TAB), 'document.activeElement?.matches?.(".nuiget-checkbox-input") === true', 'a check box reached with Shift+Tab');
        expect([box.width, box.style, box.offset, box.colour]).to.deep.equal(['1px', 'solid', '2px', box.focus]);
    });

    it('lays the rows out as comfortable rows with a loaded icon, as tall as the token, and shows the authors and the Verified mark (TF1, TF3), the authors fit and the check box is centred (P9.fix-3, UX-P2.2)', async function () {
        this.timeout(180_000);
        await findByTestId('package-row-serilog', 120_000);
        await findByTestId('package-row-newtonsoft.json');
        const token = tokenPx('--nuiget-row-height-comfortable');
        const rows = await measureLoadedRows('installed-list');
        console.warn('[P9.12] comfortable rows: ' + JSON.stringify(rows));
        expect(rows.length).to.be.at.least(2);
        for (const row of rows) {
            expect(row.blockSize, row.name).to.equal(`${token}px`);
            expect(row.height, row.name).to.be.within(token, token + 2);
            // The default icon is a `cspSource` URI: there with or without the feed.
            expect(row.iconSrc, row.name).to.not.equal('');
        }
        // The one live part: the enrichment of nuget.org reaches the row (precedent: main-transitive's 60 s poll).
        const newtonsoft = await findByTestId('package-row-newtonsoft.json');
        await poll(async () => {
            const text = (await newtonsoft.getAttribute('textContent')) ?? '';
            return text.includes('James Newton-King') && text.includes('Verified: the package id prefix is reserved by its owner') ? true : undefined;
        }, 'the authors and the Verified mark on the Newtonsoft.Json row', 120_000);
        // The authors fit on the row's second line at the default split (P9.fix-3).
        const authors = await driverOf().executeScript<{ scrollWidth: number; clientWidth: number }>(`
            const span = document.querySelector('[data-testid="package-row-newtonsoft.json"] .nuiget-row-authors');
            return { scrollWidth: span.scrollWidth, clientWidth: span.clientWidth };`);
        console.warn('[P9.fix-3] Newtonsoft.Json authors: ' + JSON.stringify(authors));
        expect(authors.scrollWidth, 'the authors span of Newtonsoft.Json is not ellipsized').to.be.at.most(authors.clientWidth);
        // The check box sits on the card's vertical centre (P9.fix-3): within 2 px of the row wrapper's centre.
        const centres = await driverOf().executeScript<{ name: string; check: number; card: number }[]>(`
            return Array.from(document.querySelectorAll('[data-testid="installed-list"] .nuiget-row-option')).map(option => {
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

    it('the Uninstall selected button sits at the list\'s right edge (P9.fix-4)', async function () {
        this.timeout(180_000);
        await findByTestId('package-row-newtonsoft.json', 120_000);
        const edges = await driverOf().executeScript<{ button: number; list: number }>(`
            return {
                button: document.querySelector('[data-testid="uninstall-selected-button"]').getBoundingClientRect().right,
                list: document.querySelector('[data-testid="installed-list"]').getBoundingClientRect().right,
            };`);
        console.warn('[P9.fix-4] uninstall-selected-button right edge: ' + JSON.stringify(edges));
        expect(Math.abs(edges.button - edges.list), 'from the primary button to the list\'s right edge').to.be.at.most(8);
    });

    it('the Transitive group row opens with what the project gets through its references, right under the last direct row (P9.0, P9.fix-2, UX-P2.1e)', async function () {
        this.timeout(300_000);
        await findByTestId('package-row-serilog', 120_000);
        await driverOf().executeScript('document.querySelector(\'[data-testid="installed-list"]\').scrollTop = 1e9;');
        const header = await findByTestId('section-header-transitive', 30_000);
        const expanded = (): Promise<string> => driverOf().executeScript<string>('return document.querySelector(\'[data-testid="group-row-transitive"] [role="treeitem"]\').getAttribute("aria-expanded");');
        await header.click();
        await poll(async () => ((await expanded()) === 'true' ? true : undefined), 'the Transitive group open', 10_000);
        // The rows, the empty state or, on a runner that has not restored the fixture, the banner that offers Restore.
        const shown = async (): Promise<'list' | 'empty' | 'banner' | undefined> => {
            if ((await driverOf().findElements(By.css('[data-testid="group-row-transitive"] ~ .nuiget-row'))).length > 0) {
                return 'list';
            }
            if (((await (await findByTestId('nuiget-app')).getAttribute('textContent')) ?? '').includes('No transitive dependencies')) {
                return 'empty';
            }
            return (await driverOf().findElements(By.css('[data-testid="transitive-restore-banner"]'))).length > 0 ? 'banner' : undefined;
        };
        if ((await poll(shown, 'the transitive packages, their empty state or the restore banner', 120_000)) === 'banner') {
            await (await (await findByTestId('transitive-restore-banner')).findElement(By.css('button'))).click();
            await poll(async () => {
                const now = await shown();
                return now === 'banner' ? undefined : now;
            }, 'the transitive packages after the restore', 240_000);
        }
        // One scroller: the transitive header follows the last direct row, with no gap of more than one row (P9.fix-2).
        const edges = await driverOf().executeScript<{ lastRowBottom: number; headerTop: number }>(`
            const group = document.querySelector('[data-testid="group-row-transitive"]');
            const rows = Array.from(document.querySelectorAll('[data-testid="installed-list"] .nuiget-row-option')).filter(row => (row.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
            const header = document.querySelector('[data-testid="section-header-transitive"]').closest('.nuiget-section-header');
            return {
                lastRowBottom: Math.max(...rows.map(option => (option.closest('.nuiget-row') ?? option).getBoundingClientRect().bottom)),
                headerTop: header.getBoundingClientRect().top,
            };`);
        console.warn('[P9.fix-2] transitive header: ' + JSON.stringify(edges));
        const gap = edges.headerTop - edges.lastRowBottom;
        expect(gap, 'from the last direct row to the transitive header (subpixel slack)').to.be.within(-1, tokenPx('--nuiget-row-height-comfortable'));
        // The files after this one measure the Installed tab with the group closed.
        await header.click();
        await poll(async () => ((await expanded()) === 'false' ? true : undefined), 'the Transitive group closed', 10_000);
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
        const selection = async (): Promise<string[]> => Promise.all((await list.findElements(By.css('.nuiget-row-option'))).map(option => option.getAttribute('aria-selected').then(value => value ?? '')));
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

import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, Key, Origin, type WebElement } from 'vscode-extension-tester';
import { driverOf, enterSidebarWebview, findByTestId, leaveWebview, openSidebarView, poll, screenshot, tokenPx, waitForTestIdGone, waitForText } from './sidebarWebview';

/**
 * The 2.0 sidebar in VS Code (plan item P3.5), on the VSIX that `npm run test:ui` packages: the first time the 2.0
 * webview is loaded by a real host under its Content Security Policy. It shows the P3 gate: the sidebar lists
 * the installed packages and uninstalls one. The main panel is never opened; its 2.0 entry is a placeholder.
 */
describe('2.0 sidebar', () => {
    const csprojPath = path.resolve('src/test/e2e/fixtures/e2e-workspace/TestProject.csproj');
    let originalCsproj: string | undefined;

    const serilogOption = async () => (await findByTestId('package-row-serilog')).findElement(By.css('.nuiget-row-option'));

    before(() => {
        originalCsproj = fs.readFileSync(csprojPath, 'utf-8');
    });

    after(() => {
        // The fixture project is shared with the 1.x suites: leave it as it was found.
        if (originalCsproj !== undefined) {
            fs.writeFileSync(csprojPath, originalCsproj, 'utf-8');
        }
    });

    afterEach(async () => {
        await leaveWebview();
    });

    it('renders the installed packages of the fixture project', async function () {
        this.timeout(180_000);
        await openSidebarView();
        await enterSidebarWebview();
        for (const testId of ['nuiget-sidebar', 'sidebar-search-input', 'section-header-installed', 'status-live']) {
            await findByTestId(testId);
        }
        // The first list needs the SDK probe and the project's sources: generous, and still bounded.
        const list = await findByTestId('sidebar-installed-list', 120_000);
        expect(await list.getAttribute('role')).to.equal('listbox');
        await findByTestId('package-row-newtonsoft.json');
        const serilog = await serilogOption();
        expect(await serilog.getText()).to.contain('Serilog').and.to.contain('3.1.1');
        // Both sections filled before the screenshot: the fixture project has one update.
        await poll(async () => ((await driverOf().findElements(By.css('[data-testid="sidebar-updates-list"] .nuiget-row-option'))).length > 0 ? true : undefined), 'the update row', 120_000);
        await screenshot('sidebar-sections');
    });

    /** The side bar part of the workbench, outside the webview. */
    const sideBarWidth = async (): Promise<number> => {
        await leaveWebview();
        return Math.round((await driverOf().findElement(By.id('workbench.parts.sidebar')).getRect()).width);
    };

    /** Drags the sash at the right edge of the side bar until the side bar is `width` px wide. */
    const dragSideBarTo = async (width: number): Promise<void> => {
        const part = await driverOf().findElement(By.id('workbench.parts.sidebar'));
        const edge = await part.getRect();
        const right = edge.x + edge.width;
        let sash: WebElement | undefined;
        for (const candidate of await driverOf().findElements(By.css('.monaco-sash.vertical'))) {
            const rect = await candidate.getRect();
            if (rect.height > edge.height / 2 && Math.abs(rect.x + rect.width / 2 - right) <= 4) {
                sash = candidate;
            }
        }
        if (sash === undefined) {
            throw new Error(`no vertical sash at x=${right}`);
        }
        await driverOf().actions().move({ origin: sash }).press().move({ origin: Origin.POINTER, x: Math.round(width - edge.width), y: 0 }).release().perform();
        await poll(async () => (Math.abs((await sideBarWidth()) - width) <= 2 ? true : undefined), `the side bar at ${width} px`, 10_000);
    };

    it('at 200 px the side bar keeps both sections (P9.0)', async function () {
        this.timeout(180_000);
        await openSidebarView();
        const original = await sideBarWidth();
        try {
            await dragSideBarTo(200);
            await enterSidebarWebview();
            // The webview follows the part: wait for its layout at the new width before the screenshot.
            await poll(async () => ((await driverOf().executeScript<number>('return document.querySelector(\'[data-testid="nuiget-sidebar"]\').getBoundingClientRect().width;')) <= 200 ? true : undefined), 'the sidebar laid out at 200 px', 10_000);
            await findByTestId('package-row-serilog', 60_000);
            await findByTestId('sidebar-updates-list', 60_000);
            await screenshot('sidebar-narrow-200px');
        } finally {
            // The theme pass measures target sizes in the sidebar at its usual width.
            await leaveWebview();
            await dragSideBarTo(original);
        }
    });

    it('narrow sidebar keeps package name visible', async function () {
        this.timeout(180_000);
        await openSidebarView();
        const original = await sideBarWidth();
        try {
            await dragSideBarTo(200);
            await enterSidebarWebview();
            await poll(async () => ((await driverOf().executeScript<number>('return document.querySelector(\'[data-testid="nuiget-sidebar"]\').getBoundingClientRect().width;')) <= 200 ? true : undefined), 'the sidebar laid out at 200 px', 10_000);
            await findByTestId('package-row-serilog', 60_000);
            await poll(async () => ((await driverOf().findElements(By.css('[data-testid="sidebar-updates-list"] .nuiget-row-option'))).length > 0 ? true : undefined), 'an update row', 60_000);
            type Measured = { list: string; name: string; nameWidth: number; nameScroll: number; versionWidth: number };
            const rows = await driverOf().executeScript<Measured[]>(`
                return [...document.querySelectorAll('[data-testid="sidebar-installed-list"] .nuiget-row-option, [data-testid="sidebar-updates-list"] .nuiget-row-option')].map(option => {
                    const name = option.querySelector('.nuiget-row-name');
                    const version = option.querySelector('.nuiget-row-version');
                    return { list: option.closest('[role="listbox"]').getAttribute('data-testid'), name: name.textContent, nameWidth: name.clientWidth, nameScroll: name.scrollWidth, versionWidth: version ? version.clientWidth : 0 };
                });
            `);
            expect(rows.filter(row => row.list === 'sidebar-installed-list').map(row => row.name)).to.deep.equal(['Newtonsoft.Json', 'Serilog']);
            for (const row of rows) {
                // The name is never the part that gives way to a long version (the owner's overflow bug, P9.2): it is
                // whole, or it is cut only by its cap and still at least as wide as the version beside it.
                expect(row.nameWidth, `${row.list} ${row.name}`).to.be.greaterThan(0);
                if (row.nameScroll > row.nameWidth) {
                    expect(row.nameWidth, `${row.list} ${row.name} is cut`).to.be.at.least(row.versionWidth);
                }
            }
            const serilog = rows.find(row => row.list === 'sidebar-installed-list' && row.name === 'Serilog');
            expect(serilog?.nameScroll, 'Serilog is not cut').to.be.at.most(serilog?.nameWidth ?? 0);
            console.warn(`[P9.10] 200 px rows: ${JSON.stringify(rows)}`);
        } finally {
            await leaveWebview();
            await dragSideBarTo(original);
        }
    });

    it('lays the rows out from the stylesheet under the CSP', async function () {
        this.timeout(120_000);
        await openSidebarView();
        await enterSidebarWebview();
        await findByTestId('package-row-serilog', 120_000);
        const layout = await driverOf().executeScript<{ rows: Array<{ index: number; y: number; height: number; offset: string }>; color: string; rootHeight: number }>(`
            const rows = [...document.querySelectorAll('[data-testid="sidebar-installed-list"] [data-index]')].map(row => {
                const box = row.getBoundingClientRect();
                return { index: Number(row.getAttribute('data-index')), y: box.y, height: box.height, offset: row.style.getPropertyValue('--nuiget-virtual-offset') };
            }).sort((a, b) => a.index - b.index);
            const root = document.querySelector('[data-testid="nuiget-sidebar"]');
            return { rows, color: getComputedStyle(root).color, rootHeight: root.getBoundingClientRect().height };
        `);
        const rowHeight = tokenPx('--nuiget-row-height-compact');
        expect(layout.rows.map(row => row.index)).to.deep.equal([0, 1]);
        // The stylesheet is loaded and the tokens resolve: a row is as high as the token says.
        expect(layout.rows.map(row => Math.round(row.height))).to.deep.equal([rowHeight, rowHeight]);
        // The offsets React sets as custom properties (CSSOM) are allowed by the policy and used by the stylesheet:
        // the second row is under the first, not on top of it.
        expect(layout.rows[1].offset).to.equal(`${rowHeight}px`);
        expect(layout.rows[1].y).to.be.at.least(layout.rows[0].y + layout.rows[0].height - 0.5);
        // The colour token resolves to a colour of the theme, and the shell fills the view.
        expect(layout.color).to.match(/^rgba?\(/).and.not.to.equal('rgba(0, 0, 0, 0)');
        expect(layout.rootHeight).to.be.greaterThan(rowHeight * 2);
    });

    it('shows the uninstall action when a row has focus', async function () {
        this.timeout(120_000);
        await openSidebarView();
        await enterSidebarWebview();
        const option = await serilogOption();
        await option.click();
        const row = await findByTestId('package-row-serilog');
        const action = await findByTestId('row-action-uninstall', 10_000, row);
        expect(await action.isDisplayed(), 'the action of the focused row').to.equal(true);
        // The other row has neither the pointer nor the focus: its action is there and not shown.
        const other = await findByTestId('row-action-uninstall', 10_000, await findByTestId('package-row-newtonsoft.json'));
        expect(await other.isDisplayed(), 'the action of the other row').to.equal(false);
    });

    /** Whether an element with this test id is in the sidebar now. */
    const present = async (testId: string): Promise<boolean> => (await driverOf().findElements(By.css(`[data-testid="${testId}"]`))).length > 0;
    const selectAllKey = process.platform === 'darwin' ? Key.COMMAND : Key.CONTROL;

    it('@installed and @updates show one section alone; other text shows the browse results (P5.12b)', async function () {
        this.timeout(180_000);
        await openSidebarView();
        await enterSidebarWebview();
        const search = await findByTestId('sidebar-search-input');
        const replaceText = async (text: string): Promise<void> => {
            await search.click();
            await search.sendKeys(Key.chord(selectAllKey, 'a'), Key.BACK_SPACE);
            if (text.length > 0) {
                await search.sendKeys(text);
            }
        };

        await replaceText('@installed');
        await poll(async () => (await present('sidebar-installed-list')) && !(await present('sidebar-updates-list')) ? true : undefined, 'the Installed section alone', 30_000);
        await replaceText('@updates');
        await poll(async () => (await present('sidebar-updates-list')) && !(await present('sidebar-installed-list')) ? true : undefined, 'the Updates section alone', 60_000);
        await replaceText('Serilog');
        await search.sendKeys(Key.ENTER);
        await findByTestId('sidebar-browse-list', 120_000);

        await replaceText('');
        await poll(async () => (await present('sidebar-installed-list')) && (await present('sidebar-updates-list')) ? true : undefined, 'both sections again', 30_000);
    });

    it('a section header collapses its list and opens it again (P5.12b)', async function () {
        this.timeout(120_000);
        await openSidebarView();
        await enterSidebarWebview();
        const header = await findByTestId('section-header-installed');
        await findByTestId('sidebar-installed-list', 60_000);
        expect(await header.getAttribute('aria-expanded')).to.equal('true');

        await header.click();
        await poll(async () => ((await header.getAttribute('aria-expanded')) === 'false' ? true : undefined), 'the Installed section collapsed', 10_000);
        await waitForTestIdGone('sidebar-installed-list', 10_000);

        await header.click();
        await poll(async () => ((await header.getAttribute('aria-expanded')) === 'true' ? true : undefined), 'the Installed section open', 10_000);
        await findByTestId('sidebar-installed-list', 10_000);
    });

    it('uninstalls through the sidebar and the project file follows', async function () {
        this.timeout(300_000);
        await openSidebarView();
        await enterSidebarWebview();
        const option = await serilogOption();
        await option.click();
        await option.sendKeys(Key.DELETE);

        // The outcome is announced, and the row leaves with the host's next list; the restore may take a while.
        await waitForText('status-live', 'Uninstalled Serilog', 180_000);
        await waitForTestIdGone('package-row-serilog', 120_000);
        await findByTestId('package-row-newtonsoft.json');

        await leaveWebview();
        const csproj = fs.readFileSync(csprojPath, 'utf-8');
        expect(csproj).not.to.contain('Include="Serilog"');
        expect(csproj).to.contain('Include="Newtonsoft.Json"');
    });
});

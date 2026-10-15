import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, Key } from 'vscode-extension-tester';
import { driverOf, enterSidebarWebview, findByTestId, leaveWebview, openSidebarView, poll, waitForTestIdGone, waitForText } from './sidebarWebview';

/**
 * The 2.0 sidebar in VS Code (plan item P3.5), on a VSIX packaged with `NUIGET_V2=1`: the first time the 2.0
 * webview is loaded by a real host under its Content Security Policy. It shows the P3 gate: the sidebar lists
 * the installed packages and uninstalls one. The main panel is never opened; its 2.0 entry is a placeholder.
 */
describe('2.0 sidebar', () => {
    const csprojPath = path.resolve('src/test/e2e/fixtures/e2e-workspace/TestProject.csproj');
    let originalCsproj: string | undefined;

    /** The px value of a token in `tokens.css`, the one place it is defined. */
    const tokenPx = (name: string): number => {
        const css = fs.readFileSync(path.resolve('src/webview/shared/tokens.css'), 'utf-8');
        const match = new RegExp(`${name}:\\s*(\\d+)px;`).exec(css);
        if (!match) {
            throw new Error(`tokens.css has no px value for ${name}`);
        }
        return Number(match[1]);
    };

    const serilogOption = async () => (await findByTestId('package-row-serilog')).findElement(By.css('[role="option"]'));

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

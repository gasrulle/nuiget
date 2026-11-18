import { expect } from 'chai';
import { By, Key } from 'vscode-extension-tester';
import { setPanelWidth, webviewRect } from './layout';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { driverOf, findByTestId, leaveWebview, poll, waitForText } from './sidebarWebview';

/**
 * The 2.0 main panel shell in VS Code (plan item P5.3), on the VSIX that `npm run test:ui` packages: the panel loads
 * its script and its stylesheet under the Content Security Policy, the shared context reaches its header, and its
 * tabs are reached by keyboard. Nothing here changes the fixture project.
 */
describe('2.0 main panel shell', () => {
    afterEach(async () => {
        await leaveWebview();
    });

    it('renders the shell under the CSP', async function () {
        this.timeout(180_000);
        await openMainPanel();
        await enterMainWebview();
        for (const testId of ['nuiget-app', 'search-input', 'project-selector', 'source-selector', 'tab-bar', 'installed-tab', 'updates-tab', 'sash', 'package-details-panel', 'status-live', 'refresh-button']) {
            await findByTestId(testId);
        }
        // The session and the projects arrive: the project selector is enabled on the fixture project.
        const project = await findByTestId('project-selector', 120_000);
        await poll(async () => ((await project.isEnabled()) && ((await project.getAttribute('value')) ?? '').endsWith('TestProject.csproj') ? true : undefined), 'the fixture project in the project selector', 120_000);

        const layout = await driverOf().executeScript<{ display: string; rootHeight: number; split: string; listWidth: number; splitWidth: number; color: string }>(`
            const root = document.querySelector('[data-testid="nuiget-app"]');
            const split = document.querySelector('.nuiget-main-split');
            const list = document.querySelector('.nuiget-main-list');
            return {
                display: getComputedStyle(root).display,
                rootHeight: root.getBoundingClientRect().height,
                split: split.style.getPropertyValue('--nuiget-split'),
                listWidth: list.getBoundingClientRect().width,
                splitWidth: split.getBoundingClientRect().width,
                color: getComputedStyle(root).color,
            };
        `);
        // dist/webview.css is loaded: the shell is the column the stylesheet makes of it and fills the panel.
        expect(layout.display).to.equal('flex');
        expect(layout.rootHeight).to.be.greaterThan(200);
        // The split React sets as a custom property (CSSOM) is allowed by the policy and sizes the list.
        expect(layout.split).to.equal('35%');
        expect(Math.abs(layout.listWidth / layout.splitWidth - 0.35)).to.be.lessThan(0.05);
        expect(layout.color).to.match(/^rgba?\(/).and.not.to.equal('rgba(0, 0, 0, 0)');
    });

    it('reaches the tabs by keyboard', async function () {
        this.timeout(120_000);
        await openMainPanel();
        await enterMainWebview();
        // Keys go to the focused element of the webview's document; the driver's action queue does not reach it.
        const search = await findByTestId('search-input');
        await search.click();
        await search.sendKeys(Key.TAB);
        const active = async () => driverOf().switchTo().activeElement();
        expect(await (await active()).getAttribute('data-testid')).to.equal('installed-tab');
        await (await active()).sendKeys(Key.ARROW_RIGHT);
        expect(await (await active()).getAttribute('data-testid')).to.equal('updates-tab');
        expect(await (await findByTestId('updates-tab')).getAttribute('aria-selected')).to.equal('true');
    });

    it('the title, search box, tabs, toolbar, section header and row content share one left inset (P9.fix-6)', async function () {
        this.timeout(180_000);
        await openMainPanel();
        await enterMainWebview();
        await (await findByTestId('installed-tab')).click();
        await findByTestId('package-row-newtonsoft.json', 120_000);
        const edges = await driverOf().executeScript<Record<string, number>>(`
            const left = selector => document.querySelector(selector).getBoundingClientRect().left;
            return {
                title: left('.nuiget-main-title'),
                search: left('[data-testid="search-input"]'),
                tab: left('[data-testid="installed-tab"] .nuiget-tab-label'),
                toolbar: left('[data-testid="select-all-button"]'),
                section: left('[data-testid="section-header-direct"] .nuiget-section-chevron'),
                row: document.querySelector('[data-testid="installed-list"] .nuiget-row-option').firstElementChild.getBoundingClientRect().left,
            };`);
        console.warn('[P9.fix-6] left edges: ' + JSON.stringify(edges));
        for (const [name, x] of Object.entries(edges)) {
            expect(Math.abs(x - edges.title), name).to.be.at.most(1);
        }
    });

    describe('the panel narrows below 391 px with the focus in the details pane (UX-P4.fix-6)', () => {
        // The panel's width before the case, restored after it whatever the case did (gotcha "A UI case that outlives its Mocha timeout").
        let restoreWidth: number | undefined;

        afterEach(async function () {
            this.timeout(120_000);
            if (restoreWidth !== undefined) {
                const width = restoreWidth;
                restoreWidth = undefined;
                await setPanelWidth(width);
            }
        });

        /** Where the focus is in the panel's document, and whether that document has the focus. */
        const focusReading = async (): Promise<{ hasFocus: boolean; active: string; text: string }> => {
            await enterMainWebview();
            return driverOf().executeScript<{ hasFocus: boolean; active: string; text: string }>(`
                const active = document.activeElement;
                const name = active === null ? 'none' : active.getAttribute('data-testid') || active.getAttribute('role') || active.tagName.toLowerCase();
                const list = active && active.closest('[data-testid$="-list"]');
                return { hasFocus: document.hasFocus(), active: name + (list ? ' of ' + list.getAttribute('data-testid') : ''), text: active && active.getAttribute('role') === 'treeitem' ? (active.querySelector('.nuiget-row-name') || active).textContent.trim() : '' };`);
        };

        it('the focus in the details pane moves to the Installed list\'s active row when the panel narrows from 400 to 220, never to <body> (UX-P4.fix-6)', async function () {
            this.timeout(300_000);
            await openMainPanel();
            await enterMainWebview();
            restoreWidth = Math.round((await webviewRect('nuiget-app')).width);
            await setPanelWidth(400);
            await enterMainWebview();
            await (await findByTestId('installed-tab')).click();
            const row = await findByTestId('package-row-newtonsoft.json', 120_000);
            await (await row.findElement(By.css('.nuiget-row-option'))).click();
            await waitForText('package-details-panel', 'Newtonsoft.Json', 30_000);
            await (await findByTestId('details-tab-readme')).click();
            const before = await focusReading();
            console.warn(`[focus] main-shell narrow: before hasFocus=${before.hasFocus} active=${before.active}`);
            expect(before.active, 'the focus starts in the details pane').to.equal('details-tab-readme');
            await setPanelWidth(220);
            // Read with a bounded poll, never once: the move follows the split's resize.
            const after = await poll(async () => {
                const reading = await focusReading();
                return reading.active === 'treeitem of installed-list' && reading.hasFocus ? reading : undefined;
            }, 'the focus on a row of the Installed list', 30_000);
            console.warn(`[focus] main-shell narrow 400→220: treeitem of installed-list "${after.text}" hasFocus=${after.hasFocus}`);
            // The row the case made current, the list's tab stop.
            expect(after.text).to.equal('Newtonsoft.Json');
        });
    });
});

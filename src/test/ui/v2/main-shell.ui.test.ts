import { expect } from 'chai';
import { Key } from 'vscode-extension-tester';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { driverOf, findByTestId, leaveWebview, poll } from './sidebarWebview';

/**
 * The 2.0 main panel shell in VS Code (plan item P5.3), on a VSIX packaged with `NUIGET_V2=1`: the panel loads
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
        for (const testId of ['nuiget-app', 'search-input', 'project-selector', 'source-selector', 'tab-bar', 'installed-tab', 'updates-tab', 'sash', 'package-details-panel', 'status-live']) {
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
        expect(layout.split).to.equal('50%');
        expect(Math.abs(layout.listWidth / layout.splitWidth - 0.5)).to.be.lessThan(0.05);
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
});

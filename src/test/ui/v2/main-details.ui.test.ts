import { expect } from 'chai';
import { By } from 'vscode-extension-tester';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { driverOf, findByTestId, leaveWebview, poll, screenshot, waitForText } from './sidebarWebview';

/**
 * The details pane of the 2.0 main panel in VS Code (plan item P5.7), on the VSIX that `npm run test:ui` packages: a row of
 * the Installed tab made current shows the package, its versions from the real feeds with the installed one marked,
 * the Details tab from the registration, and the README tab rendered under the webview's CSP. Nothing is installed
 * or uninstalled: the fixture project stays as it was found.
 */
describe('2.0 main panel: details', () => {
    beforeEach(async function () {
        this.timeout(150_000);
        await openMainPanel();
        await enterMainWebview();
    });

    afterEach(async () => {
        await leaveWebview();
    });

    it('shows the versions, the details and the README of the current row', async function () {
        this.timeout(240_000);
        const row = await findByTestId('package-row-newtonsoft.json', 120_000);
        await (await row.findElement(By.css('[role="option"]'))).click();

        await waitForText('package-details-panel', 'Newtonsoft.Json', 30_000);
        const selector = await findByTestId('version-selector', 30_000);
        // The versions come from nuget.org; the installed version is marked in the list.
        await poll(async () => ((await selector.getAttribute('textContent')) ?? '').includes('13.0.2 (installed)') ? true : undefined, 'the versions with the installed one marked', 60_000);
        expect(await (await findByTestId('install-update-button')).getText()).to.match(/Update|Downgrade/);
        // An installed package can be uninstalled from its details (P5.12b, port of remove-flow.ui.test.ts).
        expect(await (await findByTestId('uninstall-button')).isDisplayed()).to.equal(true);
        await waitForText('package-details-panel', 'Dependencies', 60_000);

        await (await findByTestId('details-tab-readme')).click();
        const shown = await poll(async () => {
            const [content] = await driverOf().findElements(By.css('[data-testid="readme-content"], [data-testid="readme-empty"]'));
            return content === undefined ? undefined : content;
        }, 'the README or its empty state', 60_000);
        if ((await shown.getAttribute('data-testid')) === 'readme-content') {
            expect(((await shown.getAttribute('textContent')) ?? '').length).to.be.greaterThan(0);
            expect(await driverOf().findElements(By.css('[data-testid="readme-content"] script'))).to.have.length(0);
        }
        await screenshot('main-details-readme');
    });
});

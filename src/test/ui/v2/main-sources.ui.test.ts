import { expect } from 'chai';
import { By, Key } from 'vscode-extension-tester';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { driverOf, findByTestId, leaveWebview, poll, waitForTestIdGone } from './sidebarWebview';

/**
 * The NuGet sources of the 2.0 main panel in VS Code (plan item P5.8), on a VSIX packaged with `NUIGET_V2=1`: the
 * header's source selector lists the enabled sources, the gear opens the dialog with the source rows, the add form
 * opens and goes back, and Escape closes the dialog. Nothing is added, removed, enabled or disabled: the fixture's
 * `nuget.config` is shared by every suite, and a source declared in the user-level `NuGet.Config` (nuget.org) would be
 * changed on the machine running the test.
 */
describe('2.0 main panel: sources', () => {
    beforeEach(async function () {
        this.timeout(150_000);
        await openMainPanel();
        await enterMainWebview();
    });

    afterEach(async () => {
        await leaveWebview();
    });

    it('lists the sources in the selector and the dialog, opens the add form and closes on Escape', async function () {
        this.timeout(180_000);
        const selector = await findByTestId('source-selector', 60_000);
        await poll(async () => ((await selector.getAttribute('disabled')) === null ? true : undefined), 'the source selector to be enabled', 60_000);
        expect(await selector.getAttribute('textContent')).to.contain('All sources');

        await (await findByTestId('source-settings')).click();
        const dialog = await findByTestId('source-settings-modal', 10_000);
        const rows = await poll(async () => {
            const found = await driverOf().findElements(By.css('[data-testid^="source-row-"]'));
            return found.length > 0 ? found : undefined;
        }, 'at least one source row', 60_000);
        expect(rows.length).to.be.greaterThan(0);

        const add = await dialog.findElement(By.xpath('.//button[normalize-space()="Add source"]'));
        await add.click();
        const panel = await findByTestId('add-source-panel', 10_000);
        await (await panel.findElement(By.xpath('.//button[normalize-space()="Back"]'))).click();
        await waitForTestIdGone('add-source-panel', 10_000);

        // Focus is inside the dialog; keys go to the focused element of the webview's document.
        await (await driverOf().switchTo().activeElement()).sendKeys(Key.ESCAPE);
        await waitForTestIdGone('source-settings-modal', 10_000);
    });
});

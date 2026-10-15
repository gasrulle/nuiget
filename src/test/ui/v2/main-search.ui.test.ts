import { expect } from 'chai';
import { Key } from 'vscode-extension-tester';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { findByTestId, leaveWebview, waitForTestIdGone } from './sidebarWebview';

/**
 * Browse in the 2.0 main panel in VS Code (plan item P5.6), on a VSIX packaged with `NUIGET_V2=1`: a search submitted
 * with Enter replaces the tabs with its results from the real feeds, and Escape brings the tabs back. The time from
 * Enter to the first row is printed (`[P5.6] cold search`): the host answers after it has enriched the rows, so this
 * is the latency of a cold search as the user sees it.
 */
describe('2.0 main panel: browse', () => {
    beforeEach(async function () {
        this.timeout(150_000);
        await openMainPanel();
        await enterMainWebview();
    });

    afterEach(async () => {
        await leaveWebview();
    });

    it('Enter searches the feeds, the results take the place of the tabs, and Escape brings the tabs back', async function () {
        this.timeout(180_000);
        const search = await findByTestId('search-input', 60_000);
        await search.click();
        await search.sendKeys('Newtonsoft.Json');
        await waitForTestIdGone('tab-bar', 10_000);
        const started = Date.now();
        await search.sendKeys(Key.ENTER);

        const row = await findByTestId('package-row-newtonsoft.json', 120_000);
        console.warn(`[P5.6] cold search: ${Date.now() - started} ms from Enter to the first row`);
        const list = await findByTestId('browse-list');
        expect(await list.getAttribute('role')).to.equal('listbox');
        expect(await row.getAttribute('textContent')).to.contain('Newtonsoft.Json');

        await search.click();
        await search.sendKeys(Key.ESCAPE);
        await findByTestId('tab-bar', 10_000);
        expect(await search.getAttribute('value')).to.equal('');
    });
});

import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, Key } from 'vscode-extension-tester';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { findByTestId, leaveWebview, poll, screenshot, waitForTestIdGone, waitForText } from './sidebarWebview';

/**
 * Browse in the 2.0 main panel in VS Code (plan item P5.6), on the VSIX that `npm run test:ui` packages: a search submitted
 * with Enter replaces the tabs with its results from the real feeds, and Escape brings the tabs back. The time from
 * Enter to the first row is printed (`[P5.6] cold search`): the host answers after it has enriched the rows, so this
 * is the latency of a cold search as the user sees it; a second search of the same text is printed as `[P7.2] warm
 * search` (plan item P7.2a). Since P5.12b (port of `search-flow` and `install-flow`): a browse row opens its details,
 * clearing the box brings the tabs back, and a package installs from its details; the fixture project is written back
 * afterwards and the panel waits until the installed list has let the package go.
 */
describe('2.0 main panel: browse', () => {
    const csprojPath = path.resolve('src/test/e2e/fixtures/e2e-workspace/TestProject.csproj');
    let originalCsproj = '';
    const selectAllKey = process.platform === 'darwin' ? Key.COMMAND : Key.CONTROL;

    /** Types `query` into the cleared search box and submits it with Enter; answers the row of `rowId`. */
    async function browse(query: string, rowId: string) {
        const search = await findByTestId('search-input', 60_000);
        await search.click();
        await search.sendKeys(Key.chord(selectAllKey, 'a'), Key.BACK_SPACE, query, Key.ENTER);
        return { search, row: await findByTestId(rowId, 120_000) };
    }

    before(() => {
        originalCsproj = fs.readFileSync(csprojPath, 'utf-8');
    });

    after(async function () {
        this.timeout(300_000);
        fs.writeFileSync(csprojPath, originalCsproj, 'utf-8');
        // The next file expects the fixture's two packages alone: wait until the list has let NUnit go.
        try {
            await openMainPanel();
            await enterMainWebview();
            // Out of browse mode first: a failed test above must not leave the files after this one without tabs (N85).
            const search = await findByTestId('search-input', 30_000);
            await search.click();
            await search.sendKeys(Key.ESCAPE);
            await findByTestId('tab-bar', 10_000);
            await (await findByTestId('installed-tab', 30_000)).click();
            await findByTestId('installed-list', 60_000);
            await waitForTestIdGone('package-row-nunit', 240_000);
        } finally {
            await leaveWebview();
        }
    });

    beforeEach(async function () {
        this.timeout(150_000);
        await openMainPanel();
        await enterMainWebview();
    });

    afterEach(async () => {
        await leaveWebview();
    });

    it('Enter searches the feeds, the results take the place of the tabs, Escape brings the tabs back, and a second search is timed warm', async function () {
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
        await screenshot('main-browse-results');

        await search.click();
        await search.sendKeys(Key.ESCAPE);
        await findByTestId('tab-bar', 10_000);
        expect(await search.getAttribute('value')).to.equal('');

        // The same search again (plan item P7.2a): the feeds are connected and the metadata is cached.
        await search.sendKeys('Newtonsoft.Json');
        await waitForTestIdGone('tab-bar', 10_000);
        const warmStarted = Date.now();
        await search.sendKeys(Key.ENTER);
        await findByTestId('package-row-newtonsoft.json', 120_000);
        console.warn(`[P7.2] warm search: ${Date.now() - warmStarted} ms from Enter to the first row (feeds connected, metadata cached)`);

        await search.click();
        await search.sendKeys(Key.ESCAPE);
        await findByTestId('tab-bar', 10_000);
    });

    it('typing opens the quick-search suggestions, and Escape closes them (P9.0)', async function () {
        this.timeout(180_000);
        const search = await findByTestId('search-input', 60_000);
        await search.click();
        await search.sendKeys(Key.chord(selectAllKey, 'a'), Key.BACK_SPACE, 'Serilog');
        // Asked 150 ms after the last key while the box has focus; the list closes when the box loses it.
        const suggestions = await findByTestId('search-suggestions', 60_000);
        // The loading row is an option too, a disabled one.
        await poll(async () => ((await suggestions.findElements(By.css('[role="option"]:not([aria-disabled="true"])'))).length > 0 ? true : undefined), 'a suggestion', 60_000);
        await screenshot('main-quicksearch-open');

        // The versions level of the first suggestion, asked of its source.
        await search.sendKeys(Key.ARROW_DOWN, Key.ARROW_RIGHT);
        await poll(async () => ((await (await findByTestId('search-suggestions', 10_000)).findElements(By.css('.nuiget-search-option--version'))).length > 0 ? true : undefined), 'a version', 60_000);
        await screenshot('main-quicksearch-versions');
        await search.sendKeys(Key.ARROW_LEFT);

        await search.sendKeys(Key.chord(selectAllKey, 'a'), Key.BACK_SPACE);
        await waitForTestIdGone('search-suggestions', 10_000);
        await findByTestId('tab-bar', 10_000);
    });

    it('a browse row opens its details, and clearing the box brings the tabs back (P5.12b)', async function () {
        this.timeout(180_000);
        const { search, row } = await browse('Newtonsoft.Json', 'package-row-newtonsoft.json');
        await (await row.findElement(By.css('[role="option"]'))).click();
        await waitForText('package-details-panel', 'Newtonsoft.Json', 30_000);
        await waitForText('package-details-panel', 'Dependencies', 60_000);
        await screenshot('main-browse-details');

        await search.click();
        await search.sendKeys(Key.chord(selectAllKey, 'a'), Key.BACK_SPACE);
        await findByTestId('tab-bar', 10_000);
        await waitForTestIdGone('browse-list', 10_000);
    });

    it('installs a package from the details of its browse row, and the project file follows (P5.12b)', async function () {
        this.timeout(420_000);
        expect(originalCsproj).not.to.contain('Include="NUnit"');
        const { search, row } = await browse('NUnit', 'package-row-nunit');
        await (await row.findElement(By.css('[role="option"]'))).click();
        await waitForText('package-details-panel', 'NUnit', 30_000);
        // The version selector is as wide as its one option until the versions arrive, and the Install button beside it
        // moves when it narrows: a click aimed before that lands next to the button (N85).
        const selector = await findByTestId('version-selector', 60_000);
        await poll(async () => (((await selector.getAttribute('textContent')) ?? '').includes('loading versions') ? undefined : true), 'the versions of NUnit', 60_000);
        const install = await findByTestId('install-update-button', 60_000);
        await poll(async () => (/Install/.test(await install.getText()) && (await install.isEnabled()) ? true : undefined), 'the Install button', 60_000);
        await install.click();
        // The operation is busy from the click on; the first check runs long before `dotnet package add` and the restore
        // after it could end and enable the button again.
        await poll(async () => (!(await install.isEnabled()) || /Working/.test(await install.getText()) ? true : undefined), 'the Install click to start an operation (N85)', 10_000);

        // `dotnet package add` writes the reference; the outcome is announced after the restore that follows it.
        await poll(async () => (fs.readFileSync(csprojPath, 'utf-8').includes('Include="NUnit"') ? true : undefined), 'NUnit in TestProject.csproj', 240_000);
        await waitForText('status-live', 'Installed NUnit', 240_000);

        await search.click();
        await search.sendKeys(Key.ESCAPE);
        await (await findByTestId('installed-tab', 10_000)).click();
        await findByTestId('package-row-nunit', 120_000);
    });
});

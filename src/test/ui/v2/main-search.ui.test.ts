import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, Key } from 'vscode-extension-tester';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { findByTestId, leaveWebview, poll, waitForTestIdGone, waitForText } from './sidebarWebview';

/**
 * Browse in the 2.0 main panel in VS Code (plan item P5.6), on a VSIX packaged with `NUIGET_V2=1`: a search submitted
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

    it('a browse row opens its details, and clearing the box brings the tabs back (P5.12b)', async function () {
        this.timeout(180_000);
        const { search, row } = await browse('Newtonsoft.Json', 'package-row-newtonsoft.json');
        await (await row.findElement(By.css('[role="option"]'))).click();
        await waitForText('package-details-panel', 'Newtonsoft.Json', 30_000);

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
        const install = await findByTestId('install-update-button', 60_000);
        await poll(async () => (/Install/.test(await install.getText()) && (await install.isEnabled()) ? true : undefined), 'the Install button', 60_000);
        await install.click();

        // `dotnet package add` writes the reference; the outcome is announced after the restore that follows it.
        await poll(async () => (fs.readFileSync(csprojPath, 'utf-8').includes('Include="NUnit"') ? true : undefined), 'NUnit in TestProject.csproj', 240_000);
        await waitForText('status-live', 'Installed NUnit', 240_000);

        await search.click();
        await search.sendKeys(Key.ESCAPE);
        await (await findByTestId('installed-tab', 10_000)).click();
        await findByTestId('package-row-nunit', 120_000);
    });
});

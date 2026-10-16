import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, Key } from 'vscode-extension-tester';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { findByTestId, leaveWebview, poll, waitForTestIdGone } from './sidebarWebview';

/**
 * The Updates tab of the 2.0 main panel in VS Code (plan item P5.5), on the VSIX that `npm run test:ui` packages: the
 * updates of the fixture project with their versions and the count on the tab, the Update all dialog cancelled with
 * Escape, and one package updated with Enter, with the project file following. Nothing waits on the live region (N66).
 */
describe('2.0 main panel: Updates tab', () => {
    const csprojPath = path.resolve('src/test/e2e/fixtures/e2e-workspace/TestProject.csproj');
    let originalCsproj = '';

    const optionOf = async (testId: string) => (await findByTestId(testId, 120_000)).findElement(By.css('[role="option"]'));

    before(() => {
        originalCsproj = fs.readFileSync(csprojPath, 'utf-8');
    });

    after(() => {
        // The fixture project is shared with the other suites: leave it as it was found.
        fs.writeFileSync(csprojPath, originalCsproj, 'utf-8');
    });

    beforeEach(async function () {
        this.timeout(150_000);
        await openMainPanel();
        await enterMainWebview();
        await (await findByTestId('updates-tab', 60_000)).click();
    });

    afterEach(async () => {
        await leaveWebview();
    });

    it('lists the updates of the fixture project with their versions and counts them on the tab', async function () {
        this.timeout(180_000);
        // The first answer needs the SDK probe, the project's sources and a feed read per package: generous, and bounded.
        const list = await findByTestId('updates-list', 120_000);
        expect(await list.getAttribute('role')).to.equal('listbox');
        expect(await list.getAttribute('aria-multiselectable')).to.equal('true');
        const row = await findByTestId('package-row-newtonsoft.json', 120_000);
        expect(await row.getAttribute('textContent')).to.contain('13.0.2 →');
        const tab = await findByTestId('updates-tab');
        await poll(async () => (/\d/.test((await tab.getAttribute('textContent')) ?? '') ? true : undefined), 'a count on the Updates tab', 30_000);
    });

    it('the Update all dialog lists the packages and cancels on Escape, leaving the project file as it was', async function () {
        this.timeout(120_000);
        await findByTestId('package-row-newtonsoft.json', 120_000);
        await (await findByTestId('update-all-button')).click();
        const dialog = await findByTestId('confirm-dialog', 10_000);
        expect(await dialog.getAttribute('textContent')).to.contain('Newtonsoft.Json: 13.0.2 →');
        await (await findByTestId('confirm-dialog-cancel')).sendKeys(Key.ESCAPE);
        await waitForTestIdGone('confirm-dialog', 10_000);
        expect(fs.readFileSync(csprojPath, 'utf-8')).to.equal(originalCsproj);
    });

    it('Enter updates one package and the project file follows', async function () {
        this.timeout(300_000);
        const option = await optionOf('package-row-newtonsoft.json');
        await option.click();
        await option.sendKeys(Key.ENTER);
        // The row leaves with the host's next list, after `dotnet package add` and the restore.
        await waitForTestIdGone('package-row-newtonsoft.json', 240_000);
        await poll(async () => (fs.readFileSync(csprojPath, 'utf-8').includes('Version="13.0.2"') ? undefined : true), 'Newtonsoft.Json updated in TestProject.csproj', 30_000);
    });
});

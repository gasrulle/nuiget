import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, Workbench } from 'vscode-extension-tester';
import { chooseProjectCommitted, enterMainWebview, openMainPanel, optionFor, untilProjects } from './mainWebview';
import { driverOf, findByTestId, leaveWebview, poll, screenshot, waitForText } from './sidebarWebview';

/** Clears the notification centre after an operation settles, the form of `main-search.ui.test.ts` (UX-P4.7). */
async function clearNotificationCentre(): Promise<void> {
    await leaveWebview();
    const center = await new Workbench().openNotificationsCenter();
    await center.clearAllNotifications();
    await center.close().catch(() => undefined);
}

/**
 * Transitive packages in the 2.0 main panel in VS Code (plan item P9.5), on the VSIX that `npm run test:ui` packages. The
 * fixture project has no transitive package on net8.0, so the test creates a second project in the workspace,
 * `Transitive/Transitive.csproj` with Serilog.Sinks.Console 6.1.1, which brings Serilog 4.0.0 on net8.0 (read from the
 * assets file of a restore of that reference). It selects that project, restores it through the transitive banner,
 * screenshots the section and the details of the Serilog row, then (UX-P5.6) installs Serilog as a direct reference from the
 * transitive details at the version they show, and removes the project afterwards; the host then goes back to
 * `TestProject.csproj`, which the files after this one expect.
 */
describe('2.0 main panel: transitive packages', () => {
    const workspace = path.resolve('src/test/e2e/fixtures/e2e-workspace');
    const projectDir = path.join(workspace, 'Transitive');
    const projectPath = path.join(projectDir, 'Transitive.csproj');

    before(function () {
        this.timeout(30_000);
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(projectPath, `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Serilog.Sinks.Console" Version="6.1.1" />
  </ItemGroup>
</Project>
`, 'utf-8');
    });

    after(async function () {
        this.timeout(360_000);
        // The host keeps a selected project whose folder goes away: select TestProject first, then delete the project file
        // (the file watcher's event; a folder removed at once may not report it) and wait until the host no longer lists
        // it, so the next file starts as before.
        try {
            await openMainPanel();
            await enterMainWebview();
            const testProject = await optionFor('TestProject.csproj');
            await chooseProjectCommitted(testProject, 30_000);
            fs.rmSync(projectPath, { force: true });
            await untilProjects(values => (values.some(value => value.endsWith('Transitive.csproj')) ? undefined : true), 'Transitive.csproj gone from the selector');
            await (await findByTestId('installed-tab', 30_000)).click();
            await findByTestId('installed-list', 120_000);
        } finally {
            fs.rmSync(projectDir, { recursive: true, force: true });
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

    it('a restored project lists its transitive packages under a counted header, and a row opens its details', async function () {
        this.timeout(600_000);
        // The host discovers the new project; its option carries the path as the host sent it.
        const option = await optionFor('Transitive.csproj');
        await chooseProjectCommitted(option, 60_000);
        // An earlier file may have left the Updates tab shown.
        await (await findByTestId('installed-tab', 30_000)).click();
        await findByTestId('package-row-serilog.sinks.console', 120_000);

        const header = await findByTestId('section-header-transitive', 60_000);
        await header.click();
        await poll(async () => ((await driverOf().executeScript<string>('return document.querySelector(\'[data-testid="group-row-transitive"] [role="treeitem"]\').getAttribute("aria-expanded");')) === 'true' ? true : undefined), 'the Transitive group open', 10_000);
        // A new project has no assets file: the banner offers Restore, which lists the packages afterwards.
        const listed = async (): Promise<'rows' | 'banner' | undefined> => {
            if ((await driverOf().findElements(By.css('[data-testid="group-row-transitive"] ~ [data-testid="package-row-serilog"]'))).length > 0) {
                return 'rows';
            }
            return (await driverOf().findElements(By.css('[data-testid="transitive-restore-banner"]'))).length > 0 ? 'banner' : undefined;
        };
        if ((await poll(listed, 'the transitive rows or the restore banner', 120_000)) === 'banner') {
            await (await (await findByTestId('transitive-restore-banner')).findElement(By.css('button'))).click();
            await poll(async () => ((await listed()) === 'rows' ? true : undefined), 'the transitive rows after the restore', 240_000);
        }
        await poll(async () => ((await driverOf().executeScript<string | null>('return document.querySelector(\'[data-testid="section-box-transitive"] .nuiget-badge--count\')?.textContent ?? null;')) === '1' && ((await header.getAttribute('textContent')) ?? '').includes('Transitive Packages') ? true : undefined), 'the counted header', 30_000);
        const headerRow = await driverOf().executeScript<string>('return document.querySelector(\'[data-testid="section-header-transitive"]\').closest(".nuiget-section-header").textContent;');
        expect(headerRow).to.contain('net8.0');
        // The row's lite metadata (icon, authors, Verified) follows the list: the screenshot waits for it.
        const row = await findByTestId('package-row-serilog', 10_000);
        await poll(async () => (((await row.getAttribute('textContent')) ?? '').includes('Serilog Contributors') ? true : undefined), 'the authors of the transitive row', 60_000);
        await screenshot('main-transitive-expanded');

        await (await row.findElement(By.css('.nuiget-row-option'))).click();
        await waitForText('transitive-details', 'Required by', 30_000);
        await waitForText('transitive-details', 'Serilog.Sinks.Console', 30_000);
        await screenshot('main-transitive-details');
    });

    // UX-P5.6 (G6; architecture-advisor ruling of 2026-11-28): Install on the transitive details makes the package a direct
    // reference at the version the details show; the row leaves Transitive only when the host's list says so, and the pane
    // stays with its button disabled and the reason. Never pressed by the capture suite.
    it('Install on a transitive package makes it a direct reference at its shown version', async function () {
        this.timeout(600_000);
        await chooseProjectCommitted(await optionFor('Transitive.csproj'), 60_000);
        await (await findByTestId('installed-tab', 30_000)).click();
        await findByTestId('package-row-serilog.sinks.console', 120_000);
        const group = 'return document.querySelector(\'[data-testid="group-row-transitive"] [role="treeitem"]\')?.getAttribute("aria-expanded") ?? null;';
        if ((await driverOf().executeScript<string | null>(group)) !== 'true') {
            await (await findByTestId('section-header-transitive', 60_000)).click();
            await poll(async () => ((await driverOf().executeScript<string | null>(group)) === 'true' ? true : undefined), 'the Transitive group open', 10_000);
        }
        const transitiveRow = '[data-testid="group-row-transitive"] ~ [data-testid="package-row-serilog"]';
        const listed = async (): Promise<'rows' | 'banner' | undefined> => {
            if ((await driverOf().findElements(By.css(transitiveRow))).length > 0) {
                return 'rows';
            }
            return (await driverOf().findElements(By.css('[data-testid="transitive-restore-banner"]'))).length > 0 ? 'banner' : undefined;
        };
        if ((await poll(listed, 'the transitive rows or the restore banner', 120_000)) === 'banner') {
            await (await (await findByTestId('transitive-restore-banner')).findElement(By.css('button'))).click();
            await poll(async () => ((await listed()) === 'rows' ? true : undefined), 'the transitive rows after the restore', 240_000);
        }
        await (await driverOf().findElement(By.css(`${transitiveRow} .nuiget-row-option`))).click();
        await waitForText('transitive-details', 'Required by', 30_000);
        // The version the details show, read from the page: the install names it.
        const version = await driverOf().executeScript<string>('const list = document.querySelector(\'[data-testid="transitive-details"] dl\'); const term = [...list.querySelectorAll("dt")].find(dt => dt.textContent.trim() === "Version"); return term.nextElementSibling.textContent.trim();');
        expect(version).to.match(/^\d+\.\d+/);
        const install = await findByTestId('install-update-button', 30_000);
        await poll(async () => ((await install.getText()) === 'Install' && (await install.isEnabled()) ? true : undefined), 'the Install button of the transitive details', 60_000);
        await install.click();
        // The operation is busy from the click on (N85).
        await poll(async () => (!(await install.isEnabled()) || /Installing/.test(await install.getText()) ? true : undefined), 'the Install click to start an operation (N85)', 10_000);

        await poll(async () => (fs.readFileSync(projectPath, 'utf-8').includes(`Include="Serilog" Version="${version}"`) ? true : undefined), `Serilog ${version} in Transitive.csproj`, 240_000);
        await waitForText('status-live', 'Installed Serilog', 240_000);
        await poll(async () => ((await driverOf().findElements(By.css(transitiveRow))).length === 0 && (await driverOf().findElements(By.css('[data-testid="package-row-serilog"]'))).length > 0 ? true : undefined), 'Serilog direct and no longer under Transitive', 240_000);
        await poll(async () => {
            const pane = await driverOf().findElements(By.css('[data-testid="transitive-details"]'));
            if (pane.length === 0) {
                return undefined;
            }
            const button = await pane[0].findElement(By.css('[data-testid="install-update-button"]'));
            return !(await button.isEnabled()) && ((await pane[0].getAttribute('textContent')) ?? '').includes('Already a direct reference of this project.') ? true : undefined;
        }, 'the transitive details kept, Install disabled with its reason', 240_000);
        await clearNotificationCentre();
    });
});

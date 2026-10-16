import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By } from 'vscode-extension-tester';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { driverOf, findByTestId, leaveWebview, poll } from './sidebarWebview';

/** `ALL_PROJECTS` of `src/protocol/domain.ts`; the test reads the DOM, it imports nothing of the webview. */
const ALL_PROJECTS = '__all_projects__';

const UTILITY_CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.2" />
  </ItemGroup>
</Project>
`;

/**
 * All Projects in the 2.0 main panel in VS Code (plan item P5.9), on the VSIX that `npm run test:ui` packages. The fixture
 * workspace has one project, so the test creates a second SDK-style project in it (`Utility/Utility.csproj`, which sorts
 * after `TestProject` so suites that take the first project keep theirs), waits for the host to discover it and offer
 * All Projects, selects it and checks one section per project and the closed transitive aggregate; it removes the
 * project afterwards and waits until the host is back on `TestProject.csproj`. One workspace folder never shows folder
 * headings, and a project whose SDK is below 10 cannot be reproduced on the runners (SDK 10 only): both are proved in
 * jsdom (`AllProjectsView.test.tsx`). The late-chunk rule is proved by the harness scenario.
 */
describe('2.0 main panel: All Projects', () => {
    const workspace = path.resolve('src/test/e2e/fixtures/e2e-workspace');
    const csprojPath = path.join(workspace, 'TestProject.csproj');
    const utilityDir = path.join(workspace, 'Utility');
    let originalCsproj = '';

    /** Selects an option of the project selector the way a user's choice reaches React: value set, `change` dispatched. */
    const chooseProject = async (value: string): Promise<void> => {
        await driverOf().executeScript(
            'const select = document.querySelector(\'[data-testid="project-selector"]\'); select.value = arguments[0]; select.dispatchEvent(new Event("change", { bubbles: true }));',
            value,
        );
    };
    const selectorValue = async (): Promise<string> => (await (await findByTestId('project-selector')).getAttribute('value')) ?? '';

    before(function () {
        this.timeout(30_000);
        originalCsproj = fs.readFileSync(csprojPath, 'utf-8');
        fs.mkdirSync(utilityDir, { recursive: true });
        fs.writeFileSync(path.join(utilityDir, 'Utility.csproj'), UTILITY_CSPROJ, 'utf-8');
    });

    after(async function () {
        this.timeout(180_000);
        fs.rmSync(utilityDir, { recursive: true, force: true });
        fs.writeFileSync(csprojPath, originalCsproj, 'utf-8');
        // With one project left the host leaves All Projects: the next file starts on TestProject as before.
        try {
            await openMainPanel();
            await enterMainWebview();
            await poll(async () => ((await selectorValue()).endsWith('TestProject.csproj') ? true : undefined), 'the selection back on TestProject.csproj', 120_000);
            await findByTestId('installed-list', 120_000);
        } finally {
            await leaveWebview();
        }
    });

    beforeEach(async function () {
        // This file runs first, right after VS Code starts: the palette and the webview may take a while.
        this.timeout(150_000);
        await openMainPanel();
        await enterMainWebview();
    });

    afterEach(async () => {
        await leaveWebview();
    });

    it('the host offers All Projects once a second project appears', async function () {
        this.timeout(180_000);
        const selector = await findByTestId('project-selector', 60_000);
        const option = await poll(async () => {
            const [found] = await selector.findElements(By.css(`option[value="${ALL_PROJECTS}"]`));
            return found;
        }, 'the All Projects option', 120_000);
        expect(await option.getAttribute('textContent')).to.equal('All Projects (2)');
    });

    it('All Projects lists one section per project and the collapsed transitive aggregate', async function () {
        this.timeout(180_000);
        await poll(async () => ((await driverOf().findElements(By.css(`[data-testid="project-selector"] option[value="${ALL_PROJECTS}"]`))).length > 0 ? true : undefined), 'the All Projects option', 120_000);
        await chooseProject(ALL_PROJECTS);
        await poll(async () => ((await selectorValue()) === ALL_PROJECTS ? true : undefined), 'All Projects committed', 30_000);

        // The project names come from discovery; read the list ids from the DOM rather than assume them.
        const lists = await poll(async () => {
            const found = await driverOf().findElements(By.css('[role="listbox"][data-testid^="installed-list-"]'));
            return found.length >= 2 ? found : undefined;
        }, 'two project sections in the Installed tab', 120_000);
        const ids = (await Promise.all(lists.map(list => list.getAttribute('data-testid')))).map(id => id ?? '');
        expect(ids).to.have.length(2);
        expect(ids.some(id => id.toLowerCase().includes('utility'))).to.equal(true);
        expect(ids.some(id => id.toLowerCase().includes('testproject'))).to.equal(true);
        expect(await (await findByTestId('section-header-transitive')).getAttribute('aria-expanded')).to.equal('false');
    });
});

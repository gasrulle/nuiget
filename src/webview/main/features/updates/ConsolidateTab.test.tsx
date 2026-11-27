import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, type InstalledPackage, type InstalledResult, type ProjectInstalledChunk, type SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { LOADING_INSTALLED } from '../../../shared/firstLoad';
import { axeRuleOutcome, installFakeLayout } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import type { ViewStateStore } from '../../../shared/viewState';
import { MainShell } from '../../MainShell';
import { DetailsPane } from '../details/DetailsPane';
import { InstalledTab } from '../installed/InstalledTab';
import { ConsolidateTab } from './ConsolidateTab';

const A = '/w/App/App.csproj';
const B = '/w/Lib/Lib.csproj';
const C = '/w/Tool/Tool.csproj';
const PROJECTS = [{ name: 'App', path: A }, { name: 'Lib', path: B }, { name: 'Tool', path: C }];
const snapshot = (rev: number, selectedProject = ALL_PROJECTS): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (id: string, version: string, more: Partial<InstalledPackage> = {}): InstalledPackage => ({ id, version, versionType: 'standard', declaration: 'project', ...more });
const installed = (projectPath: string, packages: InstalledPackage[], more: Partial<InstalledResult> = {}): InstalledResult => ({ projectPath, fidelity: 'authoritative', isCpm: false, packages, ...more });
const listed = (project: { name: string; path: string }, packages: InstalledPackage[], more: Partial<InstalledResult> = {}): ProjectInstalledChunk => ({ projectPath: project.path, projectName: project.name, result: installed(project.path, packages, more) });

// Newtonsoft.Json in three versions over three projects, Serilog in two over two, Polly the same everywhere.
const DRIFTING: ProjectInstalledChunk[] = [
    listed(PROJECTS[0], [pkg('Newtonsoft.Json', '12.0.1'), pkg('Serilog', '3.1.1'), pkg('Polly', '8.4.2')]),
    listed(PROJECTS[1], [pkg('Newtonsoft.Json', '13.0.2'), pkg('Serilog', '4.0.2'), pkg('Polly', '8.4.2')]),
    listed(PROJECTS[2], [pkg('Newtonsoft.Json', '13.0.3')]),
];
const SAME: ProjectInstalledChunk[] = PROJECTS.map(project => listed(project, [pkg('Polly', '8.4.2')]));

const DEFAULT_ICON = 'https://file+.vscode-resource.vscode-cdn.net/ext/resources/package-icon.png';
document.body.setAttribute('data-package-icon', DEFAULT_ICON);

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

const store = (tab?: string): ViewStateStore & { state: unknown } => {
    const kept = { state: tab === undefined ? undefined : { tab } as unknown, getState: () => kept.state, setState: (state: unknown) => { kept.state = state; } };
    return kept;
};

async function mount(selected = ALL_PROJECTS, viewState?: ViewStateStore): Promise<FakeHost> {
    const host = createFakeHost();
    render(
        <StoreProvider bus={host.bus}>
            <MainShell viewState={viewState} installed={view => <InstalledTab {...view} />} consolidate={view => <ConsolidateTab {...view} />} details={view => <DetailsPane {...view} />} />
        </StoreProvider>,
    );
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, selected)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: PROJECTS }, 1));
    return host;
}

/** Streams the fan-out's lists; `answer` false leaves the request open. */
async function stream(host: FakeHost, chunks: ProjectInstalledChunk[], answer = true, index = 0): Promise<void> {
    const request = host.requests('allProjects/installed')[index];
    await hostSays(() => host.chunk(request, { kind: 'start', projects: PROJECTS }));
    for (const chunk of chunks) {
        await hostSays(() => host.chunk(request, { kind: 'project', chunk }));
    }
    if (answer) {
        await hostSays(() => host.respond(request, { projectPaths: PROJECTS.map(project => project.path), errored: [] }));
    }
}

// The list carries its test id once it has rows; an empty list is a group named as the list.
const options = (): HTMLElement[] => screen.queryByTestId('consolidate-list') === null ? [] : within(screen.getByTestId('consolidate-list')).queryAllByRole('option');
const optionOf = (id: string): HTMLElement => within(screen.getByTestId(`package-row-${id}`)).getByRole('option');

describe('main panel: the Consolidate tab (UX-P5.3b, F3)', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 600, row: 72 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('is a third tab under All Projects only, counting the drifting packages once the fan-out is ready', async () => {
        const host = await mount();
        expect(screen.getByTestId('consolidate-tab')).toHaveTextContent(/^Consolidate$/);
        await stream(host, DRIFTING, false);
        // No number while the fan-out runs.
        expect(screen.getByTestId('consolidate-tab')).toHaveTextContent(/^Consolidate$/);
        await hostSays(() => host.respond(host.requests('allProjects/installed')[0], { projectPaths: PROJECTS.map(project => project.path), errored: [] }));
        expect(screen.getByTestId('consolidate-tab')).toHaveTextContent(/2/);
        expect(screen.getAllByRole('tab').map(tab => tab.dataset.testid)).toEqual(['installed-tab', 'updates-tab', 'consolidate-tab']);
    });

    it('is not shown for a single project, and a kept Consolidate tab shows Installed there without being forgotten', async () => {
        const kept = store('consolidate');
        await mount(A, kept);
        expect(screen.queryByTestId('consolidate-tab')).toBeNull();
        expect(screen.getByTestId('installed-tab')).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByTestId('consolidate-list')).toBeNull();
        expect(kept.state).toEqual({ tab: 'consolidate' });
    });

    it('counts the drift whatever was not compared, and shows no number at 0', async () => {
        const host = await mount();
        await stream(host, [DRIFTING[0], DRIFTING[1], { projectPath: C, projectName: 'Tool', error: 'The project could not be read.' }]);
        expect(screen.getByTestId('consolidate-tab')).toHaveTextContent(/2/);
        await hostSays(() => host.invalidate([['projects', 2]]));
        await stream(host, SAME, true, 1);
        expect(screen.getByTestId('consolidate-tab')).toHaveTextContent(/^Consolidate$/);
    });

    it('a first load shows the bar and three skeleton rows, says the load once and lists no row', async () => {
        const user = userEvent.setup();
        await mount();
        await user.click(screen.getByTestId('consolidate-tab'));
        expect(screen.getByTestId('consolidate-progress')).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Packages at different versions' }).querySelectorAll('.nuiget-skeleton-row')).toHaveLength(3);
        expect(options()).toHaveLength(0);
        // The live region fills a frame later (LiveStatus).
        await waitFor(() => expect(screen.getByTestId('status-live')).toHaveTextContent(LOADING_INSTALLED));
    });

    it('rows arrive under the bar while the fan-out streams, the list busy, each reading its versions and projects', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await user.click(screen.getByTestId('consolidate-tab'));
        await stream(host, DRIFTING.slice(0, 2), false);
        expect(screen.getByTestId('consolidate-progress')).toBeInTheDocument();
        expect(screen.getByRole('listbox', { name: 'Packages at different versions' })).toHaveAttribute('aria-busy', 'true');
        expect(options().map(option => option.textContent)).toEqual([expect.stringContaining('Newtonsoft.Json'), expect.stringContaining('Serilog')]);
        await stream(host, [DRIFTING[2]], true);
        expect(screen.queryByTestId('consolidate-progress')).toBeNull();
        expect(screen.getByRole('listbox', { name: 'Packages at different versions' })).not.toHaveAttribute('aria-busy');
        expect(within(screen.getByTestId('package-row-newtonsoft.json')).getByText('3 versions in 3 projects')).toBeInTheDocument();
        expect(within(screen.getByTestId('package-row-serilog')).getByText('2 versions in 2 projects')).toBeInTheDocument();
        expect(screen.getByTestId('package-row-newtonsoft.json').querySelector('.nuiget-row-icon img')).toHaveAttribute('src', DEFAULT_ICON);
        expect(screen.queryByTestId('consolidate-incomplete-banner')).toBeNull();
        expect(screen.queryByTestId('consolidate-empty')).toBeNull();
    });

    it('a failed fan-out is one error with Retry, which asks again; a failed refresh keeps the list under the same error', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await user.click(screen.getByTestId('consolidate-tab'));
        await hostSays(() => host.fail(host.requests('allProjects/installed')[0], 'failed', 'The workspace could not be read'));
        expect(screen.getByTestId('consolidate-error')).toHaveTextContent('The installed packages could not be loaded: The workspace could not be read.');
        expect(screen.queryByTestId('consolidate-list')).toBeNull();
        await user.click(within(screen.getByTestId('consolidate-error')).getByRole('button', { name: 'Retry' }));
        expect(host.requests('allProjects/installed')).toHaveLength(2);
        await stream(host, DRIFTING, true, 1);
        expect(screen.queryByTestId('consolidate-error')).toBeNull();
        await hostSays(() => host.invalidate([['projects', 2]]));
        await hostSays(() => host.fail(host.requests('allProjects/installed')[2], 'failed', 'The workspace could not be read'));
        expect(screen.getByTestId('consolidate-error')).toBeInTheDocument();
        expect(options()).toHaveLength(2);
    });

    it('a first load that fails after some lists keeps them under the error with Retry, never as a whole comparison', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await user.click(screen.getByTestId('consolidate-tab'));
        await stream(host, DRIFTING.slice(0, 2), false);
        await hostSays(() => host.fail(host.requests('allProjects/installed')[0], 'failed', 'The workspace could not be read'));
        expect(screen.getByTestId('consolidate-error')).toHaveTextContent('The installed packages could not be loaded: The workspace could not be read.');
        expect(within(screen.getByTestId('consolidate-error')).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        expect(options()).toHaveLength(2);
        expect(screen.queryByTestId('consolidate-empty')).toBeNull();
    });

    it('a project not compared is one warning banner above the list, with no action: one by name, several by count', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await user.click(screen.getByTestId('consolidate-tab'));
        await stream(host, [DRIFTING[0], DRIFTING[1], listed(PROJECTS[2], [], { unsupported: { reason: 'sdk-too-old', message: 'The project needs .NET SDK 10.' } })]);
        expect(screen.getByTestId('consolidate-incomplete-banner')).toHaveTextContent('Tool was not compared.');
        expect(within(screen.getByTestId('consolidate-incomplete-banner')).queryByRole('button')).toBeNull();
        expect(options()).toHaveLength(2);
        await hostSays(() => host.invalidate([['projects', 2]]));
        await stream(host, [DRIFTING[0], { projectPath: B, projectName: 'Lib', error: 'The project could not be read.' }, { projectPath: C, projectName: 'Tool', error: 'The project could not be read.' }], true, 1);
        expect(screen.getByTestId('consolidate-incomplete-banner')).toHaveTextContent('2 projects were not compared.');
    });

    it('every project compared and nothing drifting says so; an incomplete comparison with no drift says only the banner', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await user.click(screen.getByTestId('consolidate-tab'));
        await stream(host, SAME);
        expect(screen.getByTestId('consolidate-empty')).toHaveTextContent('All projects use the same package versions.');
        expect(screen.queryByTestId('consolidate-incomplete-banner')).toBeNull();
        await hostSays(() => host.invalidate([['projects', 2]]));
        await stream(host, [SAME[0], SAME[1], { projectPath: C, projectName: 'Tool', error: 'The project could not be read.' }], true, 1);
        expect(screen.getByTestId('consolidate-incomplete-banner')).toHaveTextContent('Tool was not compared.');
        expect(screen.queryByTestId('consolidate-empty')).toBeNull();
        expect(options()).toHaveLength(0);
    });

    it('a row is busy while an operation on its package runs in any of its projects', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await user.click(screen.getByTestId('consolidate-tab'));
        await stream(host, DRIFTING);
        await hostSays(() => host.event('ops/progress', { opId: 'op-1', status: 'running', kind: 'update', projectPaths: [C], packageIds: ['Newtonsoft.Json'] }));
        expect(optionOf('newtonsoft.json')).toHaveAttribute('aria-busy', 'true');
        expect(optionOf('serilog')).not.toHaveAttribute('aria-busy');
    });

    it('a press selects the row and shows its pane, with no aria-current (UX-P5.3c)', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await user.click(screen.getByTestId('consolidate-tab'));
        await stream(host, DRIFTING);
        await user.click(optionOf('serilog'));
        expect(optionOf('serilog')).toHaveFocus();
        expect(options().map(option => option.getAttribute('aria-selected'))).toEqual(['false', 'true']);
        expect(options().every(option => !option.hasAttribute('aria-current'))).toBe(true);
        expect(screen.queryByTestId('details-empty')).toBeNull();
        expect(screen.getByRole('heading', { name: 'Serilog' })).toBeInTheDocument();
        expect(screen.getByTestId('consolidate-button')).toHaveTextContent('Consolidate...');
        expect(host.requests('package/versions').map(request => request.payload.packageId)).toEqual(['Serilog']);
    });

    it('Enter selects the row and shows its pane; Ctrl+Enter, Delete and Space change nothing and send no request (ADR-013 Decision 1)', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await user.click(screen.getByTestId('consolidate-tab'));
        await stream(host, DRIFTING);
        optionOf('newtonsoft.json').focus();
        const sent = host.sent.length;
        await user.keyboard('{Control>}{Enter}{/Control}');
        await user.keyboard('{Delete}');
        await user.keyboard(' ');
        expect(host.sent.slice(sent)).toEqual([]);
        expect(screen.queryByTestId('confirm-dialog')).toBeNull();
        expect(options().every(option => option.getAttribute('aria-selected') === 'false')).toBe(true);
        await user.keyboard('{Enter}');
        expect(optionOf('newtonsoft.json')).toHaveAttribute('aria-selected', 'true');
        expect(host.requests('package/versions').map(request => request.payload.packageId)).toEqual(['Newtonsoft.Json']);
        expect(host.requests('ops/bulkUpdateAllProjects')).toHaveLength(0);
    });

    it('a row carries the transitive row\'s menu context: Copy Package ID and View Package Details, nothing that writes (UX-P5.3c)', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await user.click(screen.getByTestId('consolidate-tab'));
        await stream(host, DRIFTING);
        expect(JSON.parse(screen.getByTestId('package-row-serilog').getAttribute('data-vscode-context') ?? '{}')).toMatchObject({ webviewSection: 'transitiveRow', packageId: 'Serilog', projectPath: ALL_PROJECTS, 'nuiget.readOnly': true });
    });

    it('a package current on Installed is not shown beside Consolidate and comes back with Installed', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await stream(host, DRIFTING);
        await user.click(within(screen.getByTestId('installed-list')).getAllByRole('treeitem', { name: /^Polly/ })[0]);
        expect(screen.queryByTestId('details-empty')).toBeNull();
        await user.click(screen.getByTestId('consolidate-tab'));
        expect(screen.getByTestId('details-empty')).toBeInTheDocument();
        await user.click(screen.getByTestId('installed-tab'));
        expect(screen.queryByTestId('details-empty')).toBeNull();
    });

    it('the list names its keys in its hint, and Ctrl+Up returns to the search box', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await user.click(screen.getByTestId('consolidate-tab'));
        await stream(host, DRIFTING);
        const list = screen.getByRole('listbox', { name: 'Packages at different versions' });
        expect(list).toHaveAccessibleDescription('Enter shows the package and its versions in the projects. Shift+F10 opens the actions menu. Ctrl+Up (Cmd+Up) returns to the search box.');
        optionOf('serilog').focus();
        await user.keyboard('{Control>}{ArrowUp}{/Control}');
        expect(screen.getByTestId('search-input')).toHaveFocus();
    });

    it('has no axe violations with rows and the banner', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await user.click(screen.getByTestId('consolidate-tab'));
        await stream(host, [DRIFTING[0], DRIFTING[1], { projectPath: C, projectName: 'Tool', error: 'The project could not be read.' }]);
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-required-children')).toBe('passes');
    });
});

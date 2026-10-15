import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type InstalledPackage, type InstalledResult, type OperationOutcome, type OperationProgress, type SessionSnapshot } from '../../protocol';
import { createFakeHost, type FakeHost } from '../shared/bus/testSupport';
import { axeRuleOutcome, installFakeLayout } from '../shared/primitives/testSupport';
import { StoreProvider } from '../shared/store/StoreProvider';
import { UNRESOLVED_HINT, whyNotUpdatable } from '../shared/installed/rules';
import { shownVersion, whyNotRemovable } from './InstalledSection';
import { SidebarView } from './SidebarView';

const A = '/w/App/App.csproj';
const B = '/w/Lib/Lib.csproj';
const snapshot = (rev: number, selectedProject: string): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (id: string, changes: Partial<InstalledPackage> = {}): InstalledPackage => ({ id, version: '1.0.0', versionType: 'standard', declaration: 'project', ...changes });
const installed = (projectPath: string, packages: InstalledPackage[], changes: Partial<InstalledResult> = {}): InstalledResult => ({ projectPath, fidelity: 'authoritative', isCpm: false, packages, ...changes });
const removed = (opId: string, packageId: string, changes: Partial<OperationOutcome> = {}): OperationOutcome => ({ opId, kind: 'remove', status: 'completed', projectPath: A, packageId, ...changes });
const running = (opId: string, packageId: string, changes: Partial<OperationProgress> = {}): OperationProgress => ({ opId, status: 'running', kind: 'remove', projectPaths: [A], packageIds: [packageId], ...changes });

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

function mount(): FakeHost {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><SidebarView /></StoreProvider>);
    return host;
}

/** A sidebar that shows the packages of project A. */
async function mountWith(packages: InstalledPackage[], changes: Partial<InstalledResult> = {}): Promise<FakeHost> {
    const host = mount();
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }, 1));
    await hostSays(() => host.respond(host.requests('installed/get')[0], installed(A, packages, changes), 1));
    return host;
}

const list = (): HTMLElement => screen.getByTestId('sidebar-installed-list');
/** The content of the Installed section, found through its toggle; the Updates section has skeleton rows of its own. */
const installedContent = (): HTMLElement => document.getElementById(screen.getByTestId('section-header-installed').getAttribute('aria-controls')!)!;
const skeletonRows = (): NodeListOf<Element> => installedContent().querySelectorAll('.nuiget-skeleton-row');
const row = (id: string): HTMLElement => screen.getByTestId(`package-row-${id.toLowerCase()}`);
const option = (id: string): HTMLElement => within(row(id)).getByRole('option');
const names = (): string[] => screen.queryAllByRole('option').map(element => element.querySelector('.nuiget-row-name')?.textContent ?? '');
const said = (): string => screen.getByTestId('status-live').textContent ?? '';
const removals = (host: FakeHost) => host.requests('ops/remove');
const sectionSpinner = (): Element | null => screen.getByTestId('section-header-installed').querySelector('.nuiget-spinner');

describe('sidebar: Installed section', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 240, row: 24 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('shows skeleton rows while the first list is loading, then the packages of the selected project', async () => {
        const host = mount();
        expect(screen.getByRole('main')).toBe(screen.getByTestId('nuiget-sidebar'));
        expect(skeletonRows()).toHaveLength(3);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        expect(host.requests('installed/get').map(request => request.payload)).toEqual([{ projectPath: A }]);
        expect(skeletonRows()).toHaveLength(3);
        await waitFor(() => expect(said()).toBe('Loading installed packages'));
        // The section says that it is busy, to the eye; the words are the live region's.
        expect(sectionSpinner()).not.toBeNull();

        await hostSays(() => host.respond(host.requests('installed/get')[0], installed(A, [pkg('Serilog', { version: '3.0.0' }), pkg('Moq', { version: '4.20.0' })]), 1));
        expect(skeletonRows()).toHaveLength(0);
        expect(screen.getByRole('listbox', { name: 'Installed' })).toBe(list());
        expect(names()).toEqual(['Serilog', 'Moq']);
        expect(option('Serilog')).toHaveAccessibleName('Serilog 3.0.0');
        // The section says how many, and the list says which keys act on a row.
        expect(screen.getByTestId('section-header-installed')).toHaveAccessibleName('Installed 2');
        expect(list()).toHaveAccessibleDescription('Enter or Delete uninstalls; Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.');
        expect(screen.queryByTestId('sidebar-installed-provisional')).toBeNull();
        expect(sectionSpinner()).toBeNull();
    });

    it('provisional: the section carries a badge that says the evaluation is pending', async () => {
        await mountWith([pkg('Serilog')], { fidelity: 'provisional' });
        const badge = screen.getByTestId('sidebar-installed-provisional');
        expect(badge).toHaveTextContent('provisional');
        expect(badge).toHaveAttribute('title', expect.stringContaining('evaluation is pending'));
        // Actions stay available on provisional data.
        expect(within(row('Serilog')).getByTestId('row-action-uninstall')).toBeInTheDocument();
    });

    it('provisional: the badge leaves when the authoritative list replaces the chunk', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
        const request = host.requests('installed/get')[0];
        await hostSays(() => host.chunk(request, { kind: 'provisional', result: installed(A, [pkg('Serilog')], { fidelity: 'provisional' }) }));
        expect(screen.getByTestId('sidebar-installed-provisional')).toBeInTheDocument();
        expect(names()).toEqual(['Serilog']);
        await hostSays(() => host.respond(request, installed(A, [pkg('Serilog'), pkg('Moq')]), 1));
        expect(screen.queryByTestId('sidebar-installed-provisional')).toBeNull();
        expect(names()).toEqual(['Serilog', 'Moq']);
    });

    it('unresolved: the row says so, is disabled and has no action', async () => {
        const host = await mountWith([pkg('Broken', { version: '', versionType: 'unresolved', declaration: 'unresolved' }), pkg('Serilog')]);
        expect(option('Broken')).toHaveAccessibleName('Broken unresolved');
        expect(option('Broken')).toHaveAccessibleDescription('Unresolved');
        expect(option('Broken')).toHaveAttribute('aria-disabled', 'true');
        expect(within(row('Broken')).queryByTestId('row-action-uninstall')).toBeNull();
        // The version cell's tooltip says why (interaction model §4).
        expect(within(row('Broken')).getByText('unresolved')).toHaveAttribute('title', UNRESOLVED_HINT);
        expect(within(row('Serilog')).getByText('1.0.0')).not.toHaveAttribute('title');
        // The keys that act on a row do nothing on it.
        await userEvent.click(option('Broken'));
        await userEvent.keyboard('{Enter}{Delete}');
        expect(removals(host)).toHaveLength(0);
    });

    it('CPM: a centrally managed package has the badge, its central version, and uninstalls from this project', async () => {
        const host = await mountWith([
            pkg('Serilog', { declaration: 'central', version: '3.1.0', definedIn: '/w/Directory.Packages.props' }),
            pkg('Moq', { declaration: 'central-override', version: '4.18.0' }),
            pkg('xunit'),
        ], { isCpm: true });
        expect(option('Serilog')).toHaveAccessibleName('Serilog 3.1.0');
        expect(option('Serilog')).toHaveAccessibleDescription('Centrally managed');
        expect(within(row('Serilog')).getByText('CPM')).toBeInTheDocument();
        expect(option('Moq')).toHaveAccessibleDescription('Centrally managed');
        expect(option('xunit')).not.toHaveAccessibleDescription();
        // An uninstall removes the project's reference only; the central entry stays (ADR-004), so no preview is needed.
        expect(within(row('Serilog')).getByTestId('row-action-uninstall')).toBeInTheDocument();
        expect(within(row('xunit')).getByTestId('row-action-uninstall')).toBeInTheDocument();
        await userEvent.click(option('Serilog'));
        await userEvent.keyboard('{Delete}');
        expect(removals(host).map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Serilog' }]);
        expect(option('Serilog')).not.toHaveAttribute('aria-disabled');
    });

    it('unsupported SDK: a banner says why, the packages are listed, and nothing can be uninstalled', async () => {
        const host = await mountWith([pkg('Serilog'), pkg('Moq')], { unsupported: { reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' } });
        const banner = screen.getByTestId('sidebar-unsupported');
        expect(banner).toHaveAttribute('role', 'status');
        expect(banner).toHaveTextContent('Warning: Unsupported project: requires .NET SDK 10 or newer');
        expect(names()).toEqual(['Serilog', 'Moq']);
        expect(screen.queryAllByTestId('row-action-uninstall')).toHaveLength(0);
        expect(list()).toHaveAccessibleDescription('Read-only. Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.');
        await userEvent.click(option('Serilog'));
        await userEvent.keyboard('{Enter}');
        expect(removals(host)).toHaveLength(0);
        await waitFor(() => expect(said()).toBe('Serilog cannot be uninstalled: requires .NET SDK 10 or newer'));
    });

    it('a floating or ranged reference shows the version it resolves to; an implicit or props reference has no action', async () => {
        await mountWith([
            pkg('Floating', { version: '10.*', versionType: 'floating', resolvedVersion: '10.2.0' }),
            pkg('Ranged', { version: '[1.0,2.0)', versionType: 'range' }),
            pkg('Microsoft.NET.Sdk.Thing', { isImplicit: true }),
            pkg('FromProps', { declaration: 'props', definedIn: '/w/Directory.Build.props' }),
        ]);
        expect(option('Floating')).toHaveAccessibleName('Floating 10.2.0');
        // Not restored yet: what the project says.
        expect(option('Ranged')).toHaveAccessibleName('Ranged [1.0,2.0)');
        expect(within(row('Floating')).getByTestId('row-action-uninstall')).toBeInTheDocument();
        expect(within(row('Microsoft.NET.Sdk.Thing')).queryByTestId('row-action-uninstall')).toBeNull();
        expect(within(row('FromProps')).queryByTestId('row-action-uninstall')).toBeNull();
    });

    it('uninstall: the button asks ops/remove, the row shows a spinner until the operation has ended, and the outcome is announced', async () => {
        const host = await mountWith([pkg('Serilog'), pkg('Moq')]);
        await userEvent.click(within(row('Serilog')).getByTestId('row-action-uninstall'));
        expect(removals(host).map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Serilog' }]);
        // At once, before the host has said anything: the operation may wait in the queue.
        expect(option('Serilog')).toHaveAttribute('aria-busy', 'true');
        expect(option('Serilog')).toHaveAccessibleDescription('Uninstalling');
        expect(within(row('Serilog')).queryByTestId('row-action-uninstall')).toBeNull();
        expect(row('Serilog').querySelector('.nuiget-spinner')).not.toBeNull();
        expect(option('Moq')).not.toHaveAttribute('aria-busy');
        // A second press while it is busy asks for nothing more.
        await userEvent.click(option('Serilog'));
        await userEvent.keyboard('{Delete}{Enter}');
        expect(removals(host)).toHaveLength(1);

        await hostSays(() => host.event('ops/progress', running('op1', 'Serilog')));
        expect(option('Serilog')).toHaveAttribute('aria-busy', 'true');
        await hostSays(() => host.event('ops/completed', removed('op1', 'Serilog')));
        await hostSays(() => host.respond(removals(host)[0], removed('op1', 'Serilog')));
        expect(option('Serilog')).not.toHaveAttribute('aria-busy');
        await waitFor(() => expect(said()).toBe('Uninstalled Serilog'));
        // Nothing was taken out of the list by guessing: the row goes when the host's new list says so.
        expect(names()).toEqual(['Serilog', 'Moq']);
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        await hostSays(() => host.respond(host.requests('installed/get').at(-1)!, installed(A, [pkg('Moq')]), 2));
        expect(names()).toEqual(['Moq']);
        expect(screen.getByTestId('section-header-installed')).toHaveAccessibleName('Installed 1');
    });

    it('Shift+F10, the ContextMenu key and a right-click ask ui/contextMenu with the row\'s project and versions', async () => {
        const user = userEvent.setup();
        const host = await mountWith([pkg('Serilog', { version: '3.*', resolvedVersion: '3.1.1', versionType: 'floating' }), pkg('Moq')]);
        const expected = { packageId: 'Serilog', installedVersion: '3.1.1', context: 'installed', projectPath: A, versionType: 'floating' };

        await user.click(option('Serilog'));
        await user.keyboard('{Shift>}{F10}{/Shift}');
        await user.keyboard('{ContextMenu}');
        await user.pointer({ keys: '[MouseRight]', target: option('Serilog') });

        expect(host.requests('ui/contextMenu').map(request => request.payload)).toEqual([expected, expected, expected]);
        expect(host.requests('ops/remove')).toHaveLength(0);
    });

    it('Ctrl+Enter asks ui/viewPackage with the installed version; Enter still uninstalls', async () => {
        const user = userEvent.setup();
        const host = await mountWith([pkg('Serilog', { version: '3.1.1' })]);
        await user.click(option('Serilog'));
        await user.keyboard('{Control>}{Enter}{/Control}');
        expect(host.requests('ui/viewPackage').map(request => request.payload)).toEqual([{ packageId: 'Serilog', version: '3.1.1' }]);
        expect(host.requests('ops/remove')).toHaveLength(0);

        await user.keyboard('{Enter}');
        expect(host.requests('ops/remove').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Serilog' }]);
    });

    it('uninstall: Enter and Delete on the active row do the same as the button, and focus stays in the list when the row goes', async () => {
        const host = await mountWith([pkg('Serilog'), pkg('Moq'), pkg('xunit')]);
        await userEvent.click(option('Moq'));
        await userEvent.keyboard('{Delete}');
        await userEvent.keyboard('{ArrowDown}{Enter}');
        expect(removals(host).map(request => request.payload.packageId)).toEqual(['Moq', 'xunit']);
        await hostSays(() => host.respond(removals(host)[0], removed('op1', 'Moq')));
        await hostSays(() => host.respond(removals(host)[1], removed('op2', 'xunit')));
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        await hostSays(() => host.respond(host.requests('installed/get').at(-1)!, installed(A, [pkg('Serilog')]), 2));
        expect(option('Serilog')).toHaveFocus();
    });

    it('a failed or refused uninstall leaves the row as it was and says why', async () => {
        const host = await mountWith([pkg('Serilog')]);
        await userEvent.click(within(row('Serilog')).getByTestId('row-action-uninstall'));
        await hostSays(() => host.respond(removals(host)[0], removed('op1', 'Serilog', { status: 'failed', message: 'dotnet exited with 1' })));
        expect(option('Serilog')).not.toHaveAttribute('aria-busy');
        expect(within(row('Serilog')).getByTestId('row-action-uninstall')).toBeInTheDocument();
        await waitFor(() => expect(said()).toBe('Uninstall of Serilog failed: dotnet exited with 1'));

        await userEvent.click(within(row('Serilog')).getByTestId('row-action-uninstall'));
        await hostSays(() => host.respond(removals(host)[1], removed('op2', 'Serilog', { status: 'rejected', message: 'Five operations are waiting' })));
        await waitFor(() => expect(said()).toBe('Uninstall of Serilog was not started: Five operations are waiting'));
        expect(option('Serilog')).not.toHaveAttribute('aria-busy');

        // The request itself gets no outcome: the spinner goes all the same, and the reason is said.
        await userEvent.click(within(row('Serilog')).getByTestId('row-action-uninstall'));
        await hostSays(() => host.fail(removals(host)[2], 'not-found', 'The project is gone'));
        expect(option('Serilog')).not.toHaveAttribute('aria-busy');
        await waitFor(() => expect(said()).toBe('Uninstall of Serilog failed: The project is gone'));
    });

    it('an operation started on the other surface shows on the row and is announced here', async () => {
        const host = await mountWith([pkg('Serilog'), pkg('Moq')]);
        await hostSays(() => host.event('ops/progress', running('op-main', 'serilog')));
        expect(option('Serilog')).toHaveAttribute('aria-busy', 'true');
        expect(within(row('Serilog')).queryByTestId('row-action-uninstall')).toBeNull();
        expect(removals(host)).toHaveLength(0);
        // The row says what is being done to the package: here an uninstall the other surface asked for.
        expect(option('Serilog')).toHaveAccessibleDescription('Uninstalling');
        await hostSays(() => host.event('ops/completed', removed('op-main', 'Serilog')));
        expect(option('Serilog')).not.toHaveAttribute('aria-busy');
        await waitFor(() => expect(said()).toBe('Uninstalled Serilog'));

        // Not every operation on a row is an uninstall.
        await hostSays(() => host.event('ops/progress', running('op-update', 'Moq', { kind: 'update' })));
        expect(option('Moq')).toHaveAccessibleDescription('Updating');
        await hostSays(() => host.event('ops/progress', running('op-install', 'Serilog', { kind: 'install', projectPaths: [B, A] })));
        expect(option('Serilog')).toHaveAccessibleDescription('Installing');
        await hostSays(() => host.event('ops/completed', removed('op-update', 'Moq', { kind: 'update' })));
        await hostSays(() => host.event('ops/completed', removed('op-install', 'Serilog', { kind: 'install' })));
        // An operation that does not say what it is still shows as one; what happens to the package in another
        // project is not this row's business.
        await hostSays(() => host.event('ops/progress', running('op-other-project', 'Moq', { kind: 'install', projectPaths: [B] })));
        expect(option('Moq')).not.toHaveAttribute('aria-busy');
        await hostSays(() => host.event('ops/progress', { opId: 'op-unnamed', status: 'running', projectPaths: [A], packageIds: ['Moq'] }));
        expect(option('Moq')).toHaveAccessibleDescription('In progress');
        await hostSays(() => host.event('ops/completed', removed('op-unnamed', 'Moq')));
        // The same words for another operation are said again.
        await hostSays(() => host.event('ops/completed', removed('op-main-2', 'Serilog')));
        expect(said()).toBe('');
        await waitFor(() => expect(said()).toBe('Uninstalled Serilog'));
    });

    it('revalidate without blanking: the rows stay, the list is busy and a progress bar shows until the new list is there', async () => {
        const host = await mountWith([pkg('Serilog'), pkg('Moq')]);
        expect(screen.queryByRole('progressbar')).toBeNull();
        // Something else was said since the first load, so that a second "Loading" would show.
        await hostSays(() => host.event('ops/completed', removed('op-main', 'xunit')));
        await waitFor(() => expect(said()).toBe('Uninstalled xunit'));

        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        expect(host.requests('installed/get')).toHaveLength(2);
        expect(names()).toEqual(['Serilog', 'Moq']);
        expect(list()).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('progressbar', { name: 'Refreshing installed packages' })).not.toHaveAttribute('aria-valuenow');
        expect(sectionSpinner()).not.toBeNull();
        expect(skeletonRows()).toHaveLength(0);
        // Not a first load: nothing new is said, also two frames later, when an announcement would be there.
        await act(async () => {
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
        expect(said()).toBe('Uninstalled xunit');

        await hostSays(() => host.respond(host.requests('installed/get')[1], installed(A, [pkg('Serilog'), pkg('Moq'), pkg('xunit')]), 2));
        expect(names()).toEqual(['Serilog', 'Moq', 'xunit']);
        expect(list()).not.toHaveAttribute('aria-busy');
        expect(screen.queryByRole('progressbar')).toBeNull();
    });

    it('another project: its packages replace the list after skeleton rows, never mixed', async () => {
        const host = await mountWith([pkg('Serilog')]);
        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        expect(screen.queryByTestId('sidebar-installed-list')).toBeNull();
        expect(skeletonRows()).toHaveLength(3);
        await hostSays(() => host.respond(host.requests('installed/get').at(-1)!, installed(B, [pkg('xunit')]), 1));
        expect(names()).toEqual(['xunit']);
    });

    it('an error is a banner with Retry; a list that is shown stays under it', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        await hostSays(() => host.fail(host.requests('installed/get')[0], 'failed', 'dotnet is not installed'));
        const banner = screen.getByTestId('sidebar-installed-error');
        expect(banner).toHaveAttribute('role', 'alert');
        expect(banner).toHaveTextContent('Error: Installed packages could not be loaded: dotnet is not installed');
        // Loading has ended.
        expect(skeletonRows()).toHaveLength(0);

        await userEvent.click(within(banner).getByRole('button', { name: 'Retry' }));
        expect(host.requests('installed/get')).toHaveLength(2);
        expect(screen.queryByTestId('sidebar-installed-error')).toBeNull();
        await hostSays(() => host.respond(host.requests('installed/get')[1], installed(A, [pkg('Serilog')]), 1));
        expect(names()).toEqual(['Serilog']);

        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        await hostSays(() => host.fail(host.requests('installed/get')[2], 'failed', 'timed out'));
        expect(screen.getByTestId('sidebar-installed-error')).toHaveTextContent('timed out');
        expect(names()).toEqual(['Serilog']);
    });

    it('empty states: no packages, no project, all projects, and a filter that matches nothing', async () => {
        const host = await mountWith([]);
        expect(screen.getByTestId('sidebar-installed-empty')).toHaveTextContent('No packages installed.');
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(screen.getByTestId('section-header-installed')).toHaveAccessibleName('Installed 0');

        await hostSays(() => host.event('session/changed', snapshot(2, '')));
        expect(screen.getByTestId('sidebar-installed-empty')).toHaveTextContent('No .NET projects found in this workspace.');
        // All Projects: the grouped sections over allProjects/installed (P5.10), skeleton rows until the first chunk.
        await hostSays(() => host.event('session/changed', snapshot(3, ALL_PROJECTS)));
        expect(host.requests('allProjects/installed')).toHaveLength(1);
        expect(screen.queryByTestId('sidebar-installed-empty')).toBeNull();
        expect(host.requests('installed/get')).toHaveLength(1);
    });

    it('All Projects: one section per project over allProjects/installed, in folder order, and uninstall sends the row\'s project', async () => {
        const user = userEvent.setup();
        const host = await mountWith([pkg('Serilog')]);
        const B = '/w2/Lib/Lib.csproj';
        await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
        const stream = host.requests('allProjects/installed')[0];
        const projects = [{ name: 'App', path: A, workspaceFolder: 'w1' }, { name: 'Lib', path: B, workspaceFolder: 'w2' }];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', workspaceFolder: 'w1', result: { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [pkg('Serilog')] } } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', workspaceFolder: 'w2', result: { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq'), pkg('xunit')] } } }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B], errored: [] }));

        expect(screen.getByTestId('section-header-installed')).toHaveAccessibleName('Installed 3');
        expect(screen.getAllByText(/^w[12]$/).map(element => element.textContent)).toEqual(['w1', 'w2']);
        expect(screen.getByTestId('section-header-project-app').closest('h3')).not.toBeNull();
        const lib = screen.getByTestId('sidebar-installed-list-lib');
        expect(lib).toHaveAccessibleName('Lib');
        await user.click(within(within(lib).getByTestId('package-row-moq')).getByRole('option'));
        await user.keyboard('{Delete}');
        expect(host.requests('ops/remove').map(request => request.payload)).toEqual([{ projectPath: B, packageId: 'Moq' }]);
        await user.keyboard('{Shift>}{F10}{/Shift}');
        expect(host.requests('ui/contextMenu')[0].payload).toMatchObject({ packageId: 'Moq', context: 'installed', projectPath: B });
        expect(await axe(document.body)).toHaveNoViolations();
    });

    it('the search box filters the installed packages by id, and the host can ask for the focus to be there', async () => {
        const host = await mountWith([pkg('Serilog'), pkg('Serilog.Sinks.Console'), pkg('Moq')]);
        const search = screen.getByTestId('sidebar-search-input');
        expect(search).toHaveAccessibleName('Search packages, or filter with @installed or @updates');
        expect(screen.getByRole('search')).toContainElement(search);
        await userEvent.type(search, '@installed SERI');
        expect(names()).toEqual(['Serilog', 'Serilog.Sinks.Console']);
        // The count is of the project, not of the filter.
        expect(screen.getByTestId('section-header-installed')).toHaveAccessibleName('Installed 3');
        await userEvent.type(search, 'x');
        expect(screen.getByTestId('sidebar-installed-empty')).toHaveTextContent('No installed packages match "SERIx".');
        await userEvent.clear(search);
        expect(names()).toEqual(['Serilog', 'Serilog.Sinks.Console', 'Moq']);

        await userEvent.click(option('Moq'));
        expect(search).not.toHaveFocus();
        await hostSays(() => host.event('ui/focusSearch', {}));
        expect(search).toHaveFocus();
    });

    it('the section collapses and expands; a click selects a row', async () => {
        await mountWith([pkg('Serilog'), pkg('Moq')]);
        const toggle = screen.getByTestId('section-header-installed');
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await userEvent.click(option('Moq'));
        expect(option('Moq')).toHaveAttribute('aria-selected', 'true');
        expect(option('Serilog')).toHaveAttribute('aria-selected', 'false');
        await userEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('listbox')).toBeNull();
        await userEvent.click(toggle);
        expect(names()).toEqual(['Serilog', 'Moq']);
        expect(option('Moq')).toHaveAttribute('aria-selected', 'true');
    });

    it('has no axe violations: loading, a list with every kind of row, a banner, and empty', async () => {
        const host = mount();
        expect(await axe(document.body)).toHaveNoViolations();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        await hostSays(() => host.respond(host.requests('installed/get')[0], installed(A, [
            pkg('Serilog'),
            pkg('Central', { declaration: 'central' }),
            pkg('Broken', { version: '', versionType: 'unresolved', declaration: 'unresolved' }),
            pkg('Busy'),
        ], { fidelity: 'provisional', isCpm: true }), 1));
        await hostSays(() => host.event('ops/progress', running('op1', 'Busy')));
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(['nested-interactive', 'aria-required-children', 'aria-hidden-focus'].map(rule => axeRuleOutcome(results, rule))).toEqual(['passes', 'passes', 'passes']);

        await hostSays(() => host.respond(host.requests('installed/get')[1], installed(A, [], { unsupported: { reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' } }), 2));
        expect(screen.getByTestId('sidebar-installed-empty')).toHaveTextContent('No packages to show.');
        expect(await axe(document.body)).toHaveNoViolations();
    });
});

describe('sidebar: what a row shows and allows', () => {
    it('shownVersion', () => {
        expect(shownVersion(pkg('A', { version: '1.2.3' }))).toBe('1.2.3');
        expect(shownVersion(pkg('A', { version: '1.2.3', resolvedVersion: '1.2.4' }))).toBe('1.2.3');
        expect(shownVersion(pkg('A', { version: '1.*', versionType: 'floating', resolvedVersion: '1.9.0' }))).toBe('1.9.0');
        expect(shownVersion(pkg('A', { version: '1.*', versionType: 'floating' }))).toBe('1.*');
        expect(shownVersion(pkg('A', { version: '[1,2)', versionType: 'range', resolvedVersion: '1.5.0' }))).toBe('1.5.0');
        expect(shownVersion(pkg('A', { version: '', versionType: 'unresolved', declaration: 'unresolved' }))).toBe('unresolved');
        expect(shownVersion(pkg('A', { version: '$(V)', declaration: 'unresolved' }))).toBe('unresolved');
    });

    it('whyNotUpdatable', () => {
        const result = installed(A, []);
        expect(whyNotUpdatable(pkg('A'), result)).toBeUndefined();
        expect(whyNotUpdatable(pkg('A', { declaration: 'central' }), result)).toBeUndefined();
        expect(whyNotUpdatable(pkg('A', { declaration: 'central-override' }), result)).toBe('A has a VersionOverride in the project and is not updated from here until that edit is probed');
        expect(whyNotUpdatable(pkg('A', { declaration: 'unresolved' }), result)).toBe('A cannot be updated: its reference could not be resolved');
        expect(whyNotUpdatable(pkg('A', { declaration: 'central' }), { ...result, unsupported: { reason: 'packages-config', message: 'uses packages.config' } })).toBe('A cannot be updated: uses packages.config');
    });

    it('whyNotRemovable', () => {
        const result = installed(A, []);
        expect(whyNotRemovable(pkg('A'), result)).toBeUndefined();
        expect(whyNotRemovable(pkg('A'), { ...result, fidelity: 'provisional' })).toBeUndefined();
        expect(whyNotRemovable(pkg('A', { declaration: 'unresolved' }), result)).toBe('A cannot be uninstalled: its reference could not be resolved');
        expect(whyNotRemovable(pkg('A', { isImplicit: true }), result)).toBe('A is added by the .NET SDK and cannot be uninstalled');
        expect(whyNotRemovable(pkg('A', { declaration: 'props' }), result)).toBe('A is declared in an imported props file and cannot be uninstalled from the project');
        // A centrally managed package uninstalls from its project; its central entry stays (ADR-004).
        expect(whyNotRemovable(pkg('A', { declaration: 'central' }), result)).toBeUndefined();
        expect(whyNotRemovable(pkg('A', { declaration: 'central-override' }), result)).toBeUndefined();
        // An unsupported project comes first: nothing in it can be changed.
        expect(whyNotRemovable(pkg('A', { declaration: 'central' }), { ...result, unsupported: { reason: 'packages-config', message: 'uses packages.config' } })).toBe('A cannot be uninstalled: uses packages.config');
    });
});

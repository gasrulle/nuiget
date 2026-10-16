import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { ALL_PROJECTS, type SessionSnapshot } from '../../protocol';
import { createFakeHost, type FakeHost } from '../shared/bus/testSupport';
import { StoreProvider } from '../shared/store/StoreProvider';
import { MainShell, type ListView } from './MainShell';

const A = '/w/App/App.csproj';
const B = '/w/Lib/Lib.csproj';
const snapshot = (rev: number, changes: Partial<SessionSnapshot> = {}): SessionSnapshot => ({ rev, selectedProject: A, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host', ...changes });

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

/** The lists record what the shell hands them, so a test can read the filter of the shown tab. */
function mount(): { host: FakeHost; shown: () => { tab: string; view: ListView } | undefined } {
    const host = createFakeHost();
    let last: { tab: string; view: ListView } | undefined;
    render(
        <StoreProvider bus={host.bus}>
            <MainShell
                installed={view => { last = { tab: 'installed', view }; return <p>Installed list</p>; }}
                updates={view => { last = { tab: 'updates', view }; return <p>Updates list</p>; }}
            />
        </StoreProvider>,
    );
    return { host, shown: () => last };
}

async function mountReady(changes: Partial<SessionSnapshot> = {}) {
    const mounted = mount();
    await hostSays(() => mounted.host.respond(mounted.host.requests('session/get')[0], snapshot(1, changes)));
    await hostSays(() => mounted.host.respond(mounted.host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }, 1));
    return mounted;
}

const search = (): HTMLInputElement => screen.getByTestId('search-input');

describe('main panel shell', () => {
    it('sends perf/mark webviewReady once at mount and firstUsefulRender once when the first installed list is shown', async () => {
        const host = createFakeHost();
        const { rerender } = render(<StrictMode><StoreProvider bus={host.bus}><MainShell installed={() => <p>Installed list</p>} /></StoreProvider></StrictMode>);
        expect(host.requests('perf/mark').map(request => request.payload.name)).toEqual(['webviewReady']);
        await hostSays(() => host.respond(host.requests('session/get').at(-1)!, snapshot(1)));
        await hostSays(() => host.respond(host.requests('projects/list').at(-1)!, { projects: [{ name: 'App', path: A }] }, 1));
        await waitFor(() => expect(host.requests('installed/get').length).toBeGreaterThan(0));
        await hostSays(() => host.respond(host.requests('installed/get').at(-1)!, { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [] }, 1));
        expect(host.requests('perf/mark').map(request => request.payload.name)).toEqual(['webviewReady', 'firstUsefulRender']);
        rerender(<StrictMode><StoreProvider bus={host.bus}><MainShell installed={() => <p>Installed list again</p>} /></StoreProvider></StrictMode>);
        expect(host.requests('perf/mark').map(request => request.payload.name)).toEqual(['webviewReady', 'firstUsefulRender']);
    });

    it('renders the header, the search box, the tabs, the split and one live region', async () => {
        await mountReady();
        expect(screen.getByRole('main')).toHaveAttribute('data-testid', 'nuiget-app');
        expect(screen.getByRole('search')).toContainElement(search());
        expect(screen.getByRole('tablist', { name: 'Package lists' })).toHaveAttribute('data-testid', 'tab-bar');
        expect(screen.getByTestId('installed-tab')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel', { name: 'Installed' })).toHaveTextContent('Installed list');
        expect(screen.getByTestId('sash')).toHaveAttribute('role', 'separator');
        expect(screen.getByRole('region', { name: 'Package details' })).toHaveAttribute('data-testid', 'package-details-panel');
        expect(screen.getByTestId('package-details-panel')).toHaveTextContent('Select a package to see its details.');
        expect(screen.getAllByTestId('status-live')).toHaveLength(1);
    });

    it('the selectors wait for the session; the project selector lists the projects and All Projects', async () => {
        const { host } = mount();
        expect(screen.getByTestId('project-selector')).toBeDisabled();
        expect(screen.getByRole('checkbox', { name: 'Include prerelease' })).toBeDisabled();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        expect(screen.getByTestId('project-selector')).toHaveDisplayValue('Loading projects…');
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }, 1));
        const selector = screen.getByRole('combobox', { name: 'Project' });
        expect(selector).toBeEnabled();
        expect(selector).toHaveValue(A);
        expect([...selector.querySelectorAll('option')].map(option => [option.value, option.textContent])).toEqual([[ALL_PROJECTS, 'All Projects (2)'], [A, 'App'], [B, 'Lib']]);
    });

    it('choosing a project or prerelease asks the host and shows the choice at once', async () => {
        const user = userEvent.setup();
        const { host } = await mountReady();
        await user.selectOptions(screen.getByTestId('project-selector'), B);
        expect(host.requests('session/set').map(request => request.payload)).toEqual([{ selectedProject: B }]);
        expect(screen.getByTestId('project-selector')).toHaveValue(B);
        await user.click(screen.getByRole('checkbox', { name: 'Include prerelease' }));
        expect(host.requests('session/set').map(request => request.payload)).toEqual([{ selectedProject: B }, { includePrerelease: true }]);
        expect(screen.getByRole('checkbox', { name: 'Include prerelease' })).toBeChecked();
    });

    it('the source selector shows the session source and offers no other yet', async () => {
        await mountReady({ selectedSource: 'https://api.nuget.org/v3/index.json' });
        const selector = screen.getByRole('combobox', { name: 'Package source' });
        expect(selector).toHaveAttribute('data-testid', 'source-selector');
        expect(selector).toBeDisabled();
        expect(selector).toHaveDisplayValue('https://api.nuget.org/v3/index.json');
    });

    it('a project list with one project offers no All Projects; none says so', async () => {
        const { host } = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
        expect([...screen.getByTestId('project-selector').querySelectorAll('option')].map(option => option.textContent)).toEqual(['App']);
        await hostSays(() => host.event('projects/changed', { projects: [] }));
        expect(screen.getByTestId('project-selector')).toHaveDisplayValue('No projects');
        expect(screen.getByTestId('project-selector')).toBeDisabled();
    });

    it('refresh asks the host once and says how it ended', async () => {
        const user = userEvent.setup();
        const { host } = await mountReady();
        await user.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(host.requests('refresh/all')).toHaveLength(1);
        await hostSays(() => host.respond(host.requests('refresh/all')[0], {}));
        await waitFor(() => expect(screen.getByTestId('status-live')).toHaveTextContent('Refreshed'));
        await user.click(screen.getByRole('button', { name: 'Refresh' }));
        await hostSays(() => host.fail(host.requests('refresh/all')[1], 'failed', 'dotnet missing'));
        await waitFor(() => expect(screen.getByTestId('status-live')).toHaveTextContent('Refresh failed'));
    });

    it('a filter mode selects its tab and hands its text to the list; plain text leaves the tabs alone', async () => {
        const user = userEvent.setup();
        const { shown } = await mountReady();
        await user.type(search(), '@updates serilog');
        expect(screen.getByTestId('updates-tab')).toHaveAttribute('aria-selected', 'true');
        expect(shown()).toMatchObject({ tab: 'updates', view: { filter: 'serilog', vulnerableOnly: false } });
        await user.clear(search());
        await user.type(search(), '@vulnerable');
        expect(shown()).toMatchObject({ tab: 'installed', view: { filter: '', vulnerableOnly: true } });
        await user.clear(search());
        await user.click(screen.getByTestId('updates-tab'));
        await user.type(search(), 'Newtonsoft');
        // Browse: the search feature runs it; the shell keeps the tab and filters nothing.
        expect(shown()).toMatchObject({ tab: 'updates', view: { filter: '', vulnerableOnly: false } });
    });

    it('choosing another tab ends a filter mode; the same tab keeps it', async () => {
        const user = userEvent.setup();
        await mountReady();
        await user.type(search(), '@installed moq');
        await user.click(screen.getByTestId('installed-tab'));
        expect(search()).toHaveValue('@installed moq');
        await user.click(screen.getByTestId('updates-tab'));
        expect(search()).toHaveValue('');
        expect(screen.getByTestId('updates-tab')).toHaveAttribute('aria-selected', 'true');
    });

    it('Escape clears a box with text and leaves an empty box', async () => {
        const user = userEvent.setup();
        await mountReady();
        await user.type(search(), '@updates x');
        await user.keyboard('{Escape}');
        expect(search()).toHaveValue('');
        expect(search()).toHaveFocus();
        expect(screen.getByTestId('updates-tab')).toHaveAttribute('aria-selected', 'false');
        await user.keyboard('{Escape}');
        expect(search()).not.toHaveFocus();
    });

    it('the host can focus the search box and open a project on a tab', async () => {
        const user = userEvent.setup();
        const { host } = await mountReady();
        await user.type(search(), '@installed x');
        await hostSays(() => host.event('ui/selectProject', { projectPath: B, initialTab: 'updates' }));
        expect(search()).toHaveValue('');
        expect(screen.getByTestId('updates-tab')).toHaveAttribute('aria-selected', 'true');
        // Without a tab the event changes nothing here: the host has applied the project already.
        await hostSays(() => host.event('ui/selectProject', { projectPath: A }));
        expect(screen.getByTestId('updates-tab')).toHaveAttribute('aria-selected', 'true');
        await user.click(screen.getByTestId('installed-tab'));
        await hostSays(() => host.event('ui/focusSearch', {}));
        expect(search()).toHaveFocus();
    });

    it('the sash resizes the list through one custom property', async () => {
        const user = userEvent.setup();
        await mountReady();
        const split = screen.getByTestId('sash').parentElement as HTMLElement;
        expect(split.getAttribute('style')).toBe('--nuiget-split: 50%;');
        expect(screen.getByTestId('sash')).toHaveAttribute('aria-controls', screen.getByRole('tablist').parentElement?.parentElement?.id);
        screen.getByTestId('sash').focus();
        await user.keyboard('{ArrowRight}{ArrowRight}');
        expect(split.getAttribute('style')).toBe('--nuiget-split: 52%;');
        await user.keyboard('{End}');
        expect(split.getAttribute('style')).toBe('--nuiget-split: 75%;');
    });

    it('the tabs are reached by keyboard', async () => {
        const user = userEvent.setup();
        await mountReady();
        await user.click(search());
        await user.tab();
        expect(screen.getByTestId('installed-tab')).toHaveFocus();
        await user.keyboard('{ArrowRight}');
        expect(screen.getByTestId('updates-tab')).toHaveFocus();
        expect(screen.getByRole('tabpanel', { name: 'Updates' })).toHaveTextContent('Updates list');
    });

    it('a failed project listing is said in a banner', async () => {
        const { host } = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await hostSays(() => host.fail(host.requests('projects/list')[0], 'failed', 'no workspace'));
        expect(screen.getByRole('alert')).toHaveTextContent('Projects could not be listed: no workspace');
    });

    it('announces the outcome of an operation of either surface once', async () => {
        const { host } = await mountReady();
        const outcome = { opId: 'op1', kind: 'remove' as const, status: 'completed' as const, projectPath: A, packageId: 'Serilog' };
        // Started on the sidebar: the main panel hears of it as an event and says it.
        await hostSays(() => host.event('ops/completed', outcome));
        await waitFor(() => expect(screen.getByTestId('status-live')).toHaveTextContent('Uninstalled Serilog'));
        // The same outcome again (event repeated) is not a second announcement; another operation is.
        await hostSays(() => host.event('ops/completed', outcome));
        await hostSays(() => host.event('ops/completed', { ...outcome, opId: 'op2', packageId: 'Moq' }));
        await waitFor(() => expect(screen.getByTestId('status-live')).toHaveTextContent('Uninstalled Moq'));
    });

    it('has no axe violations', async () => {
        // React reports invalid markup (an option outside a select, a controlled input without onChange) here.
        const consoleError = vi.spyOn(console, 'error');
        await mountReady();
        // Over the whole document: the region rule wants every part of the panel inside a landmark.
        expect(await axe(document.body)).toHaveNoViolations();
        expect(consoleError).not.toHaveBeenCalled();
        consoleError.mockRestore();
    });
});

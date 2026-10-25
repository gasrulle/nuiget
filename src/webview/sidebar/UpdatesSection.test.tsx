import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, type InstalledPackage, type PackageUpdate, type SessionSnapshot } from '../../protocol';
import { createFakeHost, type FakeHost } from '../shared/bus/testSupport';
import { axeRuleOutcome, expectFocusAfterClose, installFakeLayout } from '../shared/primitives/testSupport';
import { StoreProvider } from '../shared/store/StoreProvider';
import { SidebarView } from './SidebarView';

const A = '/w/App/App.csproj';
const FEED = 'https://feed.example/v3/index.json';
const snapshot = (rev: number): SessionSnapshot => ({ rev, selectedProject: A, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (id: string, version: string, changes: Partial<InstalledPackage> = {}): InstalledPackage => ({ id, version, versionType: 'standard', declaration: 'project', ...changes });
const update = (id: string, installedVersion: string, latestVersion: string): PackageUpdate => ({ id, installedVersion, latestVersion, sourceUrl: FEED });
const PACKAGES = [pkg('Serilog', '3.0.0'), pkg('Newtonsoft.Json', '13.0.1', { declaration: 'central' })];
const UPDATES = [update('Serilog', '3.0.0', '3.1.0'), update('Newtonsoft.Json', '13.0.1', '13.0.3')];

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

/** A sidebar on project A with its packages listed; the updates are answered when `answer` is given. */
async function mountWith(answer?: { updates: PackageUpdate[]; sourcesUnavailable?: boolean }, packages: InstalledPackage[] = PACKAGES): Promise<FakeHost> {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><SidebarView /></StoreProvider>);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
    await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm: true, packages }, 1));
    if (answer !== undefined) {
        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, ...answer }, 1));
    }
    return host;
}

const updatesList = (): HTMLElement => screen.getByTestId('sidebar-updates-list');
const updateOption = (id: string): HTMLElement => within(within(updatesList()).getByTestId(`package-row-${id.toLowerCase()}`)).getByRole('option');
const header = (): HTMLElement => screen.getByTestId('section-header-updates');
/** The content of the Updates section, found through its toggle. */
const skeletonRows = (): NodeListOf<Element> => document.getElementById(header().getAttribute('aria-controls')!)!.querySelectorAll('.nuiget-skeleton-row');

describe('sidebar: Updates section', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 240, row: 24 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('shows its own skeleton rows before the session and while the first answer is pending, none once answered', async () => {
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><SidebarView /></StoreProvider>);
        expect(skeletonRows()).toHaveLength(3);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        expect(skeletonRows()).toHaveLength(3);
        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, updates: UPDATES }, 1));
        expect(skeletonRows()).toHaveLength(0);
        expect(within(updatesList()).getAllByRole('option')).toHaveLength(2);
    });

    it('asks the updates of the selected project and lists them with their versions, counted on the header', async () => {
        const host = await mountWith();
        expect(host.requests('updates/get').map(request => request.payload)).toEqual([{ projectPath: A, includePrerelease: false }]);
        // Unknown until answered: no count.
        expect(header()).toHaveAccessibleName('Updates');
        // A pane box of the measurements (UX-P0.10).
        expect(screen.getByTestId('section-box-updates')).toHaveAttribute('data-variant', 'pane');

        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, updates: UPDATES }, 1));
        expect(screen.getByRole('listbox', { name: 'Updates' })).toBe(updatesList());
        expect(within(updatesList()).getAllByRole('option').map(element => element.querySelector('.nuiget-row-name')?.textContent)).toEqual(['Newtonsoft.Json', 'Serilog']);
        expect(within(updatesList()).getByTestId('package-row-serilog')).toHaveTextContent('3.0.0 → 3.1.0');
        // The `id version` tooltip of P9.2 on the row's body (SB15).
        expect(within(updatesList()).getByTestId('package-row-serilog').querySelector('.nuiget-row-body')).toHaveAttribute('title', 'Serilog 3.0.0 → 3.1.0');
        expect(updateOption('Newtonsoft.Json')).toHaveAccessibleDescription(/Centrally managed/);
        expect(header()).toHaveAccessibleName('Updates 2');
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-required-children')).toBe('passes');
    });

    it('Enter or the row button updates the package to its latest version; a centrally managed one opens the actions menu', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: UPDATES });
        await user.click(updateOption('Serilog'));
        await user.keyboard('{Enter}');
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Serilog', version: '3.1.0', sourceUrl: FEED }]);
        expect(updateOption('Serilog')).toHaveAttribute('aria-busy', 'true');

        // A central change goes through the host's actions menu, where the host previews and confirms it (P6.4a).
        await user.click(updateOption('Newtonsoft.Json'));
        await user.keyboard('{Enter}');
        expect(host.requests('ui/contextMenu').map(request => request.payload)).toEqual([expect.objectContaining({ packageId: 'Newtonsoft.Json', context: 'updates', projectPath: A })]);
        await user.click(within(within(updatesList()).getByTestId('package-row-newtonsoft.json')).getByTestId('row-action-update'));
        expect(host.requests('ui/contextMenu')).toHaveLength(2);
        expect(host.requests('ops/update')).toHaveLength(1);
    });

    it('an override row updates in its project alone: one ops/update, no actions menu', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: [update('Moq', '4.18.0', '4.20.72')] }, [pkg('Moq', '4.18.0', { declaration: 'central-override' })]);
        await user.click(updateOption('Moq'));
        await user.keyboard('{Enter}');
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Moq', version: '4.20.72', sourceUrl: FEED }]);
        expect(host.requests('ui/contextMenu')).toHaveLength(0);
        expect(updateOption('Moq')).toHaveAttribute('aria-busy', 'true');
        expect(updateOption('Moq')).toHaveAccessibleDescription(/Centrally managed/);
    });

    it('an unreachable source is a banner with Retry, never "No updates available", and the header shows no count', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: [], sourcesUnavailable: true });
        expect(screen.getByTestId('sidebar-updates-unavailable')).toHaveTextContent('could not be checked');
        expect(screen.getByTestId('sidebar-updates-empty')).toHaveTextContent('Updates could not be checked.');
        expect(screen.queryByText('No updates available.')).toBeNull();
        expect(header()).toHaveAccessibleName('Updates');
        await user.click(within(screen.getByTestId('sidebar-updates-unavailable')).getByRole('button', { name: 'Retry' }));
        expect(host.requests('updates/get')).toHaveLength(2);
    });

    it('All Projects: sections over allProjects/updates; Enter sends ops/update with the row\'s project', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        const B = '/w/Lib/Lib.csproj';
        await hostSays(() => host.event('session/changed', { ...snapshot(2), selectedProject: ALL_PROJECTS }));
        const installedStream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq', '4.20.0')] } } }));
        const stream = host.requests('allProjects/updates')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', updates: [update('Serilog', '3.0.0', '3.1.0')] } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', updates: [update('Moq', '4.20.0', '4.20.72')] } }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B] }));

        expect(header()).toHaveAccessibleName('Updates 2');
        const lib = screen.getByTestId('sidebar-updates-list-lib');
        expect(lib).toHaveAccessibleName('Lib');
        await user.click(within(within(lib).getByTestId('package-row-moq')).getByRole('option'));
        await user.keyboard('{Enter}');
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: B, packageId: 'Moq', version: '4.20.72', sourceUrl: FEED }]);
        expect(await axe(document.body)).toHaveNoViolations();
    });

    it('the actions menu and Ctrl+Enter carry the update\'s versions and source', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: UPDATES });
        await user.click(updateOption('Serilog'));
        await user.keyboard('{Shift>}{F10}{/Shift}');
        await user.keyboard('{Control>}{Enter}{/Control}');

        expect(host.requests('ui/contextMenu').map(request => request.payload)).toEqual([{ packageId: 'Serilog', installedVersion: '3.0.0', latestVersion: '3.1.0', context: 'updates', projectPath: A, versionType: 'standard', sourceUrl: FEED }]);
        expect(host.requests('ui/viewPackage').map(request => request.payload)).toEqual([{ packageId: 'Serilog', version: '3.1.0' }]);
        expect(host.requests('ops/update')).toHaveLength(0);
    });

    it('a complete empty answer says "No updates available" and counts 0; the header collapses the section', async () => {
        const user = userEvent.setup();
        await mountWith({ updates: [] });
        expect(screen.getByTestId('sidebar-updates-empty')).toHaveTextContent('No updates available.');
        expect(header()).toHaveAccessibleName('Updates 0');
        expect(header()).toHaveAttribute('aria-expanded', 'true');
        await user.click(header());
        expect(header()).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('sidebar-updates-empty')).toBeNull();
    });

    it('update all button runs bulk update', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: UPDATES });
        // Newtonsoft.Json is set centrally: it goes through its own preview, not Update all (N76).
        const button = screen.getByTestId('sidebar-update-all-button');
        expect(button).toHaveAccessibleName('Update all (1)');
        await user.click(button);
        const dialog = screen.getByTestId('confirm-dialog');
        expect(dialog).toHaveTextContent('Serilog: 3.0.0 → 3.1.0');
        expect(dialog).not.toHaveTextContent('Newtonsoft.Json');
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-dialog-name')).toBe('passes');
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expect(host.requests('ops/bulkUpdate').map(request => request.payload)).toEqual([{ projectPath: A, packages: [{ id: 'Serilog', version: '3.1.0', sourceUrl: FEED }] }]);
        expect(screen.queryByTestId('confirm-dialog')).toBeNull();
        expectFocusAfterClose('sidebar-update-all-confirm');
    });

    it('update all under All Projects sends one ops/bulkUpdateAllProjects grouped by project', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        const B = '/w/Lib/Lib.csproj';
        await hostSays(() => host.event('session/changed', { ...snapshot(2), selectedProject: ALL_PROJECTS }));
        const installedStream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [pkg('Serilog', '3.0.0')] } } }));
        await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq', '4.20.0')] } } }));
        const stream = host.requests('allProjects/updates')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', updates: [update('Serilog', '3.0.0', '3.1.0')] } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', updates: [update('Moq', '4.20.0', '4.20.72')] } }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B] }));

        await user.click(screen.getByTestId('sidebar-update-all-button'));
        const dialog = screen.getByTestId('confirm-dialog');
        expect(dialog).toHaveTextContent('In App:Serilog: 3.0.0 → 3.1.0In Lib:Moq: 4.20.0 → 4.20.72');
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expectFocusAfterClose('sidebar-all-projects-update-all-confirm');
        expect(host.requests('ops/bulkUpdateAllProjects').map(request => request.payload)).toEqual([{ projectUpdates: [
            { projectPath: A, projectName: 'App', packages: [{ id: 'Serilog', version: '3.1.0', sourceUrl: FEED }] },
            { projectPath: B, projectName: 'Lib', packages: [{ id: 'Moq', version: '4.20.72', sourceUrl: FEED }] },
        ] }]);
    });

    it('update all cancels without a request, and there is no button without an update', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: UPDATES });
        await user.click(screen.getByTestId('sidebar-update-all-button'));
        await user.click(screen.getByTestId('confirm-dialog-cancel'));
        expect(screen.queryByTestId('confirm-dialog')).toBeNull();
        expectFocusAfterClose('sidebar-update-all-cancel');
        expect(host.requests('ops/bulkUpdate')).toHaveLength(0);

        // A complete empty answer: no button.
        cleanup();
        await mountWith({ updates: [] });
        expect(screen.queryByTestId('sidebar-update-all-button')).toBeNull();
    });

    it('an unsupported project has no Update all', async () => {
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><SidebarView /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
        await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [pkg('Serilog', '3.0.0')], unsupported: { reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' } }, 1));
        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, updates: [update('Serilog', '3.0.0', '3.1.0')] }, 1));
        expect(within(updatesList()).getAllByRole('option')).toHaveLength(1);
        expect(screen.queryByTestId('sidebar-update-all-button')).toBeNull();
    });
});

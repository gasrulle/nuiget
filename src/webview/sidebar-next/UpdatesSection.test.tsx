import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type InstalledPackage, type PackageUpdate, type SessionSnapshot } from '../../protocol';
import { createFakeHost, type FakeHost } from '../shared/bus/testSupport';
import { axeRuleOutcome, installFakeLayout } from '../shared/primitives/testSupport';
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
async function mountWith(answer?: { updates: PackageUpdate[]; sourcesUnavailable?: boolean }): Promise<FakeHost> {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><SidebarView /></StoreProvider>);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
    await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm: true, packages: PACKAGES }, 1));
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

        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, updates: UPDATES }, 1));
        expect(screen.getByRole('listbox', { name: 'Updates' })).toBe(updatesList());
        expect(within(updatesList()).getAllByRole('option').map(element => element.querySelector('.nuiget-row-name')?.textContent)).toEqual(['Serilog', 'Newtonsoft.Json']);
        expect(within(updatesList()).getByTestId('package-row-serilog')).toHaveTextContent('3.0.0 → 3.1.0');
        expect(updateOption('Newtonsoft.Json')).toHaveAccessibleDescription(/Centrally managed/);
        expect(header()).toHaveAccessibleName('Updates 2');
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-required-children')).toBe('passes');
    });

    it('Enter or the row button updates the package to its latest version; a centrally managed one is announced, not updated', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: UPDATES });
        await user.click(updateOption('Serilog'));
        await user.keyboard('{Enter}');
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Serilog', version: '3.1.0', sourceUrl: FEED }]);
        expect(updateOption('Serilog')).toHaveAttribute('aria-busy', 'true');

        await user.click(updateOption('Newtonsoft.Json'));
        await user.keyboard('{Enter}');
        await waitFor(() => expect(screen.getByTestId('status-live')).toHaveTextContent('Newtonsoft.Json is centrally managed'));
        expect(within(within(updatesList()).getByTestId('package-row-newtonsoft.json')).queryByTestId('row-action-update')).toBeNull();
        expect(host.requests('ops/update')).toHaveLength(1);
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
});

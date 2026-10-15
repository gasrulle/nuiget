import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, type InstalledPackage, type PackageSearchResult, type PackageUpdate, type SessionSnapshot } from '../../protocol';
import { createFakeHost, type FakeHost } from '../shared/bus/testSupport';
import { installFakeLayout } from '../shared/primitives/testSupport';
import { StoreProvider } from '../shared/store/StoreProvider';
import { BROWSE_DEBOUNCE_MS, SidebarView } from './SidebarView';

const A = '/w/App/App.csproj';
const FEED = 'https://feed.example/v3/index.json';
const snapshot = (rev: number, selectedProject = A): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (id: string, version: string): InstalledPackage => ({ id, version, versionType: 'standard', declaration: 'project' });
const update = (id: string, latestVersion: string): PackageUpdate => ({ id, installedVersion: '1.0.0', latestVersion, sourceUrl: FEED });
const result = (id: string, version = '1.0.0'): PackageSearchResult => ({ id, version, description: '', authors: '', versions: [version], sourceUrl: FEED });

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const pause = (ms: number): Promise<void> => act(() => new Promise<void>(resolve => setTimeout(resolve, ms)));

async function mountReady(): Promise<FakeHost> {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><SidebarView /></StoreProvider>);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
    await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [pkg('Serilog', '3.0.0'), pkg('Moq', '4.20.0')] }, 1));
    await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, updates: [update('Serilog', '3.1.0'), update('Moq', '4.20.72')] }, 1));
    return host;
}

const box = (): HTMLInputElement => screen.getByTestId('sidebar-search-input');
const list = (): HTMLElement => screen.getByTestId('sidebar-browse-list');
const row = (id: string): HTMLElement => within(list()).getByTestId(`package-row-${id.toLowerCase()}`);
const said = (): string => screen.getByTestId('status-live').textContent ?? '';
const queries = (host: FakeHost) => host.requests('search/query');

async function searchFor(host: FakeHost, text: string, results: PackageSearchResult[]): Promise<void> {
    const user = userEvent.setup();
    await user.type(box(), `${text}{Enter}`);
    const requests = queries(host);
    await hostSays(() => host.respond(requests[requests.length - 1], { query: text, results }));
}

describe('sidebar: search modes and browse', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 240, row: 24 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('@installed and @updates show that section alone, filtered; the box offers those two filters only', async () => {
        const user = userEvent.setup();
        await mountReady();
        await user.type(box(), '@');
        expect(within(screen.getByRole('listbox', { name: 'Filters' })).getAllByRole('option').map(element => element.textContent)).toEqual(['@installed', '@updates']);

        await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
        await user.type(box(), 'mo');
        expect(screen.queryByTestId('section-header-installed')).toBeNull();
        expect(within(screen.getByTestId('sidebar-updates-list')).getAllByRole('option').map(element => element.querySelector('.nuiget-row-name')?.textContent)).toEqual(['Moq']);
        await user.type(box(), 'x');
        expect(screen.getByTestId('sidebar-updates-empty')).toHaveTextContent('No updates match "mox".');

        await user.clear(box());
        await user.type(box(), '@installed seri');
        expect(screen.queryByTestId('section-header-updates')).toBeNull();
        expect(within(screen.getByTestId('sidebar-installed-list')).getAllByRole('option')).toHaveLength(1);
    });

    it('plain text searches 300 ms after the last key from two characters on, and replaces the sections', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 's');
        await pause(BROWSE_DEBOUNCE_MS + 100);
        expect(queries(host)).toHaveLength(0);
        expect(screen.queryByTestId('section-header-installed')).toBeNull();

        await user.type(box(), 'e');
        expect(queries(host)).toHaveLength(0);
        await waitFor(() => expect(queries(host)).toHaveLength(1), { timeout: 1000 });
        expect(queries(host)[0].payload).toEqual({ query: 'se', sourceUrls: undefined, includePrerelease: false, exactMatch: undefined });
    });

    it('Enter searches at once and the pending debounce sends nothing more', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 'polly{Enter}');
        expect(queries(host).map(request => request.payload.query)).toEqual(['polly']);
        await pause(BROWSE_DEBOUNCE_MS + 100);
        expect(queries(host)).toHaveLength(1);
    });

    it('Enter or the row button installs the version found into the selected project, with the source it came from', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await searchFor(host, 'polly', [result('Polly', '8.4.2'), result('Polly.Core', '8.4.2')]);
        await waitFor(() => expect(said()).toBe('2 packages found for "polly"'));

        await user.click(within(row('Polly')).getByRole('option'));
        await user.keyboard('{Enter}');
        expect(host.requests('ops/install').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Polly', version: '8.4.2', sourceUrl: FEED }]);
        expect(within(row('Polly')).getByRole('option')).toHaveAttribute('aria-busy', 'true');
        // Busy: a second Enter starts nothing.
        await user.keyboard('{Enter}');
        expect(host.requests('ops/install')).toHaveLength(1);

        await user.click(within(row('Polly.Core')).getByTestId('row-action-install'));
        expect(host.requests('ops/install').map(request => request.payload.packageId)).toEqual(['Polly', 'Polly.Core']);
    });

    it('an installed package says so and installs nothing; without a single project nothing is installed', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await searchFor(host, 'serilog', [result('Serilog', '4.0.0')]);
        expect(within(row('Serilog')).getByRole('option')).toHaveAccessibleDescription(/Installed: 3\.0\.0/);
        expect(within(row('Serilog')).queryByTestId('row-action-install')).toBeNull();
        await user.click(within(row('Serilog')).getByRole('option'));
        await user.keyboard('{Enter}');
        await waitFor(() => expect(said()).toBe('Serilog is already installed (3.0.0).'));

        await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
        await user.click(within(row('Serilog')).getByRole('option'));
        await user.keyboard('{Enter}');
        await waitFor(() => expect(said()).toBe('Select a single project to install packages from this view.'));
        expect(host.requests('ops/install')).toHaveLength(0);
    });

    it('an unreachable source is a banner with Retry; clearing the box brings the sections back', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 'contoso{Enter}');
        await hostSays(() => host.respond(queries(host)[0], { query: 'contoso', results: [], sourcesUnavailable: true }));
        expect(screen.getByTestId('sidebar-browse-unavailable')).toBeInTheDocument();
        expect(screen.getByText('No package source could be searched for "contoso".')).toBeInTheDocument();

        await user.click(within(screen.getByTestId('sidebar-browse-unavailable')).getByRole('button', { name: 'Retry' }));
        expect(queries(host)).toHaveLength(2);
        await user.click(box());
        await user.keyboard('{Escape}');
        expect(host.cancelled()).toEqual([queries(host)[1].id]);
        expect(screen.getByTestId('section-header-installed')).toBeInTheDocument();
        expect(screen.getByTestId('section-header-updates')).toBeInTheDocument();
    });

    it('has no axe violations with results', async () => {
        const host = await mountReady();
        await searchFor(host, 'polly', [result('Polly', '8.4.2'), result('Serilog', '4.0.0')]);
        expect(await axe(document.body)).toHaveNoViolations();
    });
});

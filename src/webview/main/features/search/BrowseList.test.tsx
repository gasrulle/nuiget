import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PackageSearchResult, SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { installFakeLayout } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { BrowseList } from './BrowseList';

const A = '/w/App/App.csproj';
const FEED = 'https://feed.example/v3/index.json';
const ICON = 'data:image/png;base64,AAAA';
const snapshot = (rev: number, changes: Partial<SessionSnapshot> = {}): SessionSnapshot => ({ rev, selectedProject: A, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host', ...changes });
const result = (id: string, version = '1.0.0', extra: Partial<PackageSearchResult> = {}): PackageSearchResult => ({ id, version, description: `About ${id}`, authors: '', versions: [version], sourceUrl: FEED, ...extra });

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

async function mountReady(): Promise<FakeHost> {
    const host = createFakeHost();
    render(
        <StoreProvider bus={host.bus}>
            <MainShell installed={() => <p>Installed list</p>} updates={() => <p>Updates list</p>} browse={view => <BrowseList {...view} />} />
        </StoreProvider>,
    );
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
    await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [{ id: 'Serilog', version: '3.0.0', versionType: 'standard', declaration: 'project' }] }, 1));
    return host;
}

const box = (): HTMLInputElement => screen.getByTestId('search-input');
const list = (): HTMLElement => screen.getByTestId('browse-list');
const option = (id: string): HTMLElement => within(within(list()).getByTestId(`package-row-${id.toLowerCase()}`)).getByRole('option');
const said = (): string => screen.getByTestId('status-live').textContent ?? '';
const queries = (host: FakeHost) => host.requests('search/query');

describe('main panel: browse', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 440, row: 44 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('plain text takes the place of the tabs and asks nothing before Enter; Enter searches', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 'json');

        expect(screen.queryByTestId('tab-bar')).toBeNull();
        expect(screen.getByText('Press Enter to search for "json".')).toBeInTheDocument();
        expect(queries(host)).toHaveLength(0);

        await user.keyboard('{Enter}');
        expect(queries(host).map(request => request.payload)).toEqual([{ query: 'json', sourceUrls: undefined, includePrerelease: false, exactMatch: undefined }]);
        expect(document.querySelectorAll('.nuiget-skeleton-row')).toHaveLength(3);
    });

    it('lists the results with the metadata that came first: icon, authors, downloads, Verified and Installed', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 'seri{Enter}');
        const [request] = queries(host);
        await hostSays(() => host.chunk(request, { kind: 'metadata', packages: [{ id: 'Serilog.Sinks.Console', version: '6.0.0', iconUrl: ICON, verified: true, authors: 'Serilog Contributors' }] }));
        await hostSays(() => host.respond(request, { query: 'seri', results: [result('Serilog.Sinks.Console', '6.0.0', { totalDownloads: 2_500_000 }), result('Serilog', '4.0.0', { iconUrl: 'https://example/icon.png' })] }));

        expect(list()).toHaveAttribute('role', 'listbox');
        expect(list()).toHaveAccessibleName('Search results for seri');
        expect(option('Serilog.Sinks.Console')).toHaveAccessibleDescription(/by Serilog Contributors · 2\.5M downloads · About Serilog\.Sinks\.Console/);
        expect(option('Serilog.Sinks.Console')).toHaveAccessibleDescription(/Prefix reserved by the owner/);
        expect(within(list()).getByTestId('package-row-serilog.sinks.console').querySelector('img')).toHaveAttribute('src', ICON);
        // Only a data: URI is an icon here; the policy of the webview loads no other image.
        expect(within(list()).getByTestId('package-row-serilog').querySelector('img')).toBeNull();
        expect(option('Serilog')).toHaveAccessibleDescription(/Installed: 3\.0\.0/);
        await waitFor(() => expect(said()).toBe('2 packages found for "seri"'));
    });

    it('a click or Enter makes a row current; a new text starts without one', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 'moq{Enter}');
        await hostSays(() => host.respond(queries(host)[0], { query: 'moq', results: [result('Moq'), result('Moq.AutoMock')] }));

        await user.click(option('Moq.AutoMock'));
        expect(option('Moq.AutoMock')).toHaveAttribute('aria-selected', 'true');
        await user.keyboard('{ArrowUp}{Enter}');
        expect(option('Moq')).toHaveAttribute('aria-selected', 'true');

        await user.type(box(), '.automock{Enter}');
        await hostSays(() => host.respond(queries(host)[1], { query: 'moq.automock', results: [result('Moq'), result('Moq.AutoMock')] }));
        expect(within(list()).queryAllByRole('option', { selected: true })).toHaveLength(0);
    });

    it('a committed prerelease change asks the text again and keeps the current row while the package is found', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 'moq{Enter}');
        await hostSays(() => host.respond(queries(host)[0], { query: 'moq', results: [result('Moq'), result('Moq.AutoMock')] }));
        await user.click(option('Moq.AutoMock'));

        await hostSays(() => host.event('session/changed', snapshot(2, { includePrerelease: true })));
        expect(queries(host).map(request => request.payload.includePrerelease)).toEqual([false, true]);
        await hostSays(() => host.respond(queries(host)[1], { query: 'moq', results: [result('Moq', '5.0.0-beta'), result('Moq.AutoMock', '4.0.0-rc')] }));
        expect(option('Moq.AutoMock')).toHaveAttribute('aria-selected', 'true');

        await hostSays(() => host.event('session/changed', snapshot(3)));
        await hostSays(() => host.respond(queries(host)[2], { query: 'moq', results: [result('Moq')] }));
        expect(within(list()).queryAllByRole('option', { selected: true })).toHaveLength(0);
    });

    it('ui/navigateToPackage fills the box, searches for the id exactly and makes the package current', async () => {
        const host = await mountReady();
        await hostSays(() => host.event('ui/navigateToPackage', { packageId: 'Newtonsoft.Json', version: '13.0.3' }));

        expect(box()).toHaveValue('Newtonsoft.Json');
        expect(queries(host).map(request => request.payload)).toEqual([{ query: 'Newtonsoft.Json', sourceUrls: undefined, includePrerelease: false, exactMatch: true }]);
        await hostSays(() => host.respond(queries(host)[0], { query: 'Newtonsoft.Json', results: [result('newtonsoft.json', '13.0.3')] }));
        expect(option('newtonsoft.json')).toHaveAttribute('aria-selected', 'true');
    });

    it('an exact-match search asked with a version selects that version in the details', async () => {
        const host = await mountReady();
        await hostSays(() => host.event('ui/navigateToPackage', { packageId: 'Newtonsoft.Json', version: '12.0.1' }));
        await hostSays(() => host.respond(queries(host)[0], { query: 'Newtonsoft.Json', results: [result('Newtonsoft.Json', '13.0.3')] }));

        expect(option('newtonsoft.json')).toHaveAttribute('aria-selected', 'true');
        // The details ask for the version the navigation named, not the latest the search found.
        expect(host.requests('package/metadata').map(request => request.payload)).toEqual([{ packageId: 'Newtonsoft.Json', version: '12.0.1', sourceUrl: FEED }]);

        // A navigation without a version shows the version the search found.
        await hostSays(() => host.event('ui/navigateToPackage', { packageId: 'Serilog' }));
        await hostSays(() => host.respond(queries(host)[1], { query: 'Serilog', results: [result('Serilog', '4.1.0')] }));
        expect(host.requests('package/metadata').at(-1)?.payload).toEqual({ packageId: 'Serilog', version: '4.1.0', sourceUrl: FEED });
    });

    it('an unreachable source is a banner over the results with Retry, never "no results"', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 'contoso{Enter}');
        await hostSays(() => host.respond(queries(host)[0], { query: 'contoso', results: [], sourcesUnavailable: true }));

        expect(screen.getByTestId('browse-unavailable-banner')).toHaveTextContent('Some package sources could not be searched');
        expect(screen.getByText('No package source could be searched for "contoso".')).toBeInTheDocument();
        expect(screen.queryByText('No results for "contoso".')).toBeNull();
        await user.click(within(screen.getByTestId('browse-unavailable-banner')).getByRole('button', { name: 'Retry' }));
        expect(queries(host)).toHaveLength(2);
    });

    it('an empty answer says so; a failure is a banner with Retry', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 'zzzz{Enter}');
        await hostSays(() => host.respond(queries(host)[0], { query: 'zzzz', results: [] }));
        expect(screen.getByText('No results for "zzzz".')).toBeInTheDocument();
        await waitFor(() => expect(said()).toBe('No results for "zzzz"'));

        await user.click(box());
        await user.keyboard('{Enter}');
        await hostSays(() => host.fail(queries(host)[1], 'failed', 'dotnet failed'));
        expect(screen.getByRole('alert')).toHaveTextContent('The search failed: dotnet failed');
    });

    it('clearing the box cancels the search and brings the tabs back', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 'json{Enter}');
        await user.keyboard('{Escape}');

        expect(box()).toHaveValue('');
        expect(host.cancelled()).toEqual([queries(host)[0].id]);
        expect(screen.getByTestId('tab-bar')).toBeInTheDocument();
        expect(screen.getByRole('tabpanel', { name: 'Installed' })).toHaveTextContent('Installed list');
    });

    it('typing @ offers the main panel\'s three filters', async () => {
        const user = userEvent.setup();
        await mountReady();
        await user.type(box(), '@');
        expect(within(screen.getByRole('listbox', { name: 'Filters' })).getAllByRole('option').map(element => element.textContent)).toEqual(['@installed', '@updates', '@vulnerable']);
        await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
        expect(box()).toHaveValue('@updates ');
        expect(screen.getByTestId('updates-tab')).toHaveAttribute('aria-selected', 'true');
    });

    it('has no axe violations with results and a banner', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 'seri{Enter}');
        await hostSays(() => host.respond(queries(host)[0], { query: 'seri', results: [result('Serilog', '4.0.0', { verified: true })], sourcesUnavailable: true }));
        expect(await axe(document.body)).toHaveNoViolations();
    });
});

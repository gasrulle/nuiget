import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, type PackageSearchResult, type SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { expectFocusAfterClose, installFakeLayout } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { DetailsPane } from '../details/DetailsPane';
import { BrowseList } from './BrowseList';

const A = '/w/App/App.csproj';
const FEED = 'https://feed.example/v3/index.json';
const ICON = 'data:image/png;base64,AAAA';
// The bundled default icon the host puts on the root; `defaultPackageIcon()` keeps the first value it finds.
const DEFAULT_ICON = 'https://file+.vscode-resource.vscode-cdn.net/ext/resources/package-icon.png';
document.body.setAttribute('data-package-icon', DEFAULT_ICON);
const snapshot = (rev: number, changes: Partial<SessionSnapshot> = {}): SessionSnapshot => ({ rev, selectedProject: A, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host', ...changes });
const result = (id: string, version = '1.0.0', extra: Partial<PackageSearchResult> = {}): PackageSearchResult => ({ id, version, description: `About ${id}`, authors: '', versions: [version], sourceUrl: FEED, ...extra });

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

interface MountOptions {
    /** The installed list is answered (default), or left unanswered. */
    listed?: boolean;
    isCpm?: boolean;
    selectedProject?: string;
    /** With the details pane beside the list. */
    details?: boolean;
}

async function mountReady({ listed = true, isCpm = false, selectedProject = A, details = false }: MountOptions = {}): Promise<FakeHost> {
    const host = createFakeHost();
    render(
        <StoreProvider bus={host.bus}>
            <MainShell
                installed={() => <p>Installed list</p>}
                updates={() => <p>Updates list</p>}
                browse={view => <BrowseList {...view} />}
                {...(details ? { details: view => <DetailsPane {...view} /> } : {})}
            />
        </StoreProvider>,
    );
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, { selectedProject })));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }, ...(selectedProject === ALL_PROJECTS ? [{ name: 'Lib', path: '/w/Lib/Lib.csproj' }] : [])] }, 1));
    if (listed && selectedProject === A) {
        await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm, packages: [{ id: 'Serilog', version: '3.0.0', versionType: 'standard', declaration: 'project' }] }, 1));
    }
    return host;
}

/** Searches `text` and answers with `results`. */
async function searchFor(host: FakeHost, text: string, results: PackageSearchResult[]): Promise<void> {
    const user = userEvent.setup();
    await user.clear(box());
    await user.type(box(), `${text}{Enter}`);
    await hostSays(() => host.respond(queries(host)[queries(host).length - 1], { query: text, results }));
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
        expect(option('Serilog.Sinks.Console')).toHaveAccessibleDescription(/2\.5M downloads Verified: the package id prefix is reserved by its owner Serilog Contributors About Serilog\.Sinks\.Console/);
        expect(option('Serilog.Sinks.Console')).toHaveAccessibleDescription(/Verified: the package id prefix/);
        expect(within(list()).getByTestId('package-row-serilog.sinks.console').querySelector('img')).toHaveAttribute('src', ICON);
        // Only a data: URI is a package's own icon; anything else shows the bundled default (ADR-006, MB2).
        expect(within(list()).getByTestId('package-row-serilog').querySelector('img')).toHaveAttribute('src', DEFAULT_ICON);
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
        expect(screen.getByRole('tabpanel', { name: 'Installed 1' })).toHaveTextContent('Installed list'); // The Installed tab counts the one listed package (P9.3, MH3) and names its panel.
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

    it('Ctrl+Enter on a browse row installs the version found into the selected project and the row is busy', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await searchFor(host, 'polly', [result('Polly', '8.4.2')]);
        option('Polly').focus();
        await user.keyboard('{Control>}{Enter}{/Control}');
        expect(host.requests('ops/install').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Polly', version: '8.4.2', sourceUrl: FEED }]);
        expect(option('Polly')).toHaveAttribute('aria-selected', 'true');
        expect(option('Polly')).toHaveAttribute('aria-busy', 'true');
    });

    it('Ctrl+Enter on an installed package installs nothing and says why', async () => {
        const user = userEvent.setup();
        const installedHost = await mountReady();
        await searchFor(installedHost, 'serilog', [result('Serilog', '4.0.0')]);
        option('Serilog').focus();
        await user.keyboard('{Control>}{Enter}{/Control}');
        await waitFor(() => expect(said()).toBe('Serilog is already installed (3.0.0).'));
        expect(installedHost.requests('ops/install')).toHaveLength(0);
    });

    it('Ctrl+Enter installs nothing while the project is not listed yet', async () => {
        const user = userEvent.setup();
        const host = await mountReady({ listed: false });
        await searchFor(host, 'polly', [result('Polly', '8.4.2')]);
        option('Polly').focus();
        await user.keyboard('{Control>}{Enter}{/Control}');
        await waitFor(() => expect(said()).toBe('The packages of the selected project are not listed yet.'));
        expect(host.requests('ops/install')).toHaveLength(0);
    });

    it('Ctrl+Enter under All Projects makes the row current and leaves the install to the picker', async () => {
        const user = userEvent.setup();
        const host = await mountReady({ selectedProject: ALL_PROJECTS });
        await searchFor(host, 'polly', [result('Polly', '8.4.2')]);
        option('Polly').focus();
        await user.keyboard('{Control>}{Enter}{/Control}');
        await waitFor(() => expect(said()).toBe('Under All Projects, Install… in the details picks the projects.'));
        expect(option('Polly')).toHaveAttribute('aria-selected', 'true');
        expect(host.requests('ops/install')).toHaveLength(0);
    });

    it('Ctrl+Enter into a CPM project asks the preview first and opens the dialog for a central entry', async () => {
        const user = userEvent.setup();
        const host = await mountReady({ isCpm: true });
        await searchFor(host, 'polly', [result('Polly', '8.4.2'), result('Moq', '4.20.72')]);
        option('Polly').focus();
        await user.keyboard('{Control>}{Enter}{/Control}');
        expect(host.requests('cpm/preview').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Polly', version: '8.4.2' }]);
        expect(host.requests('ops/install')).toHaveLength(0);
        // No central entry: it installs into this project.
        await hostSays(() => host.respond(host.requests('cpm/preview')[0], { preview: null }));
        expect(host.requests('ops/install').map(request => request.payload.packageId)).toEqual(['Polly']);

        // A central entry: the preview dialog first, the install on confirm.
        option('Moq').focus();
        await user.keyboard('{Control>}{Enter}{/Control}');
        await hostSays(() => host.respond(host.requests('cpm/preview')[1], { preview: { centralPropsPath: '/w/Directory.Packages.props', packageId: 'Moq', fromVersion: '4.20.0', toVersion: '4.20.72', affectedProjects: [A] } }));
        const dialog = screen.getByTestId('cpm-preview-dialog');
        expect(host.requests('ops/install')).toHaveLength(1);
        // The dialog asks for its own preview before it can be confirmed.
        await hostSays(() => host.respond(host.requests('cpm/preview')[2], { preview: { centralPropsPath: '/w/Directory.Packages.props', packageId: 'Moq', fromVersion: '4.20.0', toVersion: '4.20.72', affectedProjects: [A] } }));
        await user.click(within(dialog).getByTestId('cpm-preview-confirm'));
        expectFocusAfterClose('browse-cpm-install-confirm');
        expect(host.requests('ops/install').map(request => request.payload)).toEqual([
            { projectPath: A, packageId: 'Polly', version: '8.4.2', sourceUrl: FEED },
            { projectPath: A, packageId: 'Moq', version: '4.20.72', sourceUrl: FEED },
        ]);
    });

    it('a new text without the current row clears the details', async () => {
        const user = userEvent.setup();
        const host = await mountReady({ details: true });
        await searchFor(host, 'polly', [result('Polly', '8.4.2')]);
        await user.click(option('Polly'));
        expect(screen.getByTestId('package-details-panel')).toHaveTextContent('Polly');
        await searchFor(host, 'moq', [result('Moq', '4.20.72')]);
        expect(screen.getByTestId('package-details-panel')).toHaveTextContent('Select a package to see its details.');
    });
});

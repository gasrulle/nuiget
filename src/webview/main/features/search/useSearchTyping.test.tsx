import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, type ExtensionConfig, type NuGetSource, type SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { expectFocusAfterClose, installFakeLayout } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { BrowseList } from './BrowseList';
import { FULL_SEARCH_DELAY_MS, QUICK_SEARCH_DELAY_MS } from './useSearchTyping';

const A = '/w/App/App.csproj';
const FEED = 'https://api.nuget.org/v3/index.json';
const CONTOSO = 'https://pkgs.contoso.test/v3/index.json';
const snapshot = (rev: number, selectedProject = A): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const config = (searchDebounceMode: ExtensionConfig['searchDebounceMode']): ExtensionConfig => ({ searchDebounceMode, quickSearchResultsPerSource: 5, searchResultLimit: 50, enablePerformanceLogging: false, treeIndent: 16, isWindows: false });
const SOURCES: NuGetSource[] = [{ name: 'nuget.org', url: FEED, enabled: true }];

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const pause = (ms: number): Promise<void> => act(() => new Promise<void>(resolve => setTimeout(resolve, ms)));

interface MountOptions {
    /** The selected project's installed list is answered. */
    listed?: boolean;
    isCpm?: boolean;
    selectedProject?: string;
}

/** `null`: the settings stay unknown (`config/get` is not answered). */
async function mountReady(mode: ExtensionConfig['searchDebounceMode'] | null = 'quicksearch', { listed = false, isCpm = false, selectedProject = A }: MountOptions = {}): Promise<FakeHost> {
    const host = createFakeHost();
    render(
        <StoreProvider bus={host.bus}>
            <MainShell installed={() => <p>Installed list</p>} updates={() => <p>Updates list</p>} browse={view => <BrowseList {...view} />} />
        </StoreProvider>,
    );
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, selectedProject)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
    if (listed) {
        await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm, packages: [{ id: 'Moq', version: '4.20.72', versionType: 'standard', declaration: 'project' }] }, 1));
    }
    await hostSays(() => host.respond(host.requests('sources/list')[0], { sources: SOURCES, failed: [] }, 1));
    if (mode !== null) {
        await hostSays(() => host.respond(host.requests('config/get')[0], config(mode)));
    }
    return host;
}

const box = (): HTMLInputElement => screen.getByTestId('search-input');
const autocompletes = (host: FakeHost) => host.requests('search/autocomplete');
const queries = (host: FakeHost) => host.requests('search/query');
const versionAsks = (host: FakeHost) => host.requests('package/versions');
const installs = (host: FakeHost) => host.requests('ops/install');
const said = (): string => screen.getByTestId('status-live').textContent ?? '';
const SEVEN = ['4.2.0', '4.1.0', '4.0.2', '4.0.1', '4.0.0', '3.1.1', '3.1.0'];

/** Types `text` and answers the quick-search with `groups`. */
async function suggestFor(host: FakeHost, text: string, groups: { sourceName: string; sourceUrl: string; packageIds: string[] }[]): Promise<void> {
    const user = userEvent.setup();
    const before = autocompletes(host).length;
    await user.type(box(), text);
    await waitFor(() => expect(autocompletes(host)).toHaveLength(before + 1));
    await hostSays(() => host.respond(autocompletes(host)[before], { query: box().value, groups }));
}

describe('main panel: typing in the search box', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 440, row: 44 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('enables the settings and the source list when the panel opens, before any key', async () => {
        const host = await mountReady();
        expect(host.requests('config/get')).toHaveLength(1);
        expect(host.requests('sources/list')).toHaveLength(1);
    });

    it('quicksearch: suggestions 150 ms after the last key from two characters on; picking one searches for it exactly', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 's');
        await pause(QUICK_SEARCH_DELAY_MS + 50);
        expect(autocompletes(host)).toHaveLength(0);

        await user.type(box(), 'er');
        expect(autocompletes(host)).toHaveLength(0);
        await waitFor(() => expect(autocompletes(host)).toHaveLength(1));
        expect(autocompletes(host)[0].payload).toEqual({ query: 'ser', sources: [{ name: 'nuget.org', url: FEED }], includePrerelease: false });
        expect(queries(host)).toHaveLength(0);
        await hostSays(() => host.respond(autocompletes(host)[0], { query: 'ser', groups: [{ sourceName: 'nuget.org', sourceUrl: FEED, packageIds: ['Serilog', 'Serilog.Sinks.Console'] }] }));

        const suggestions = screen.getByRole('listbox', { name: 'Suggestions' });
        await user.click(within(suggestions).getByRole('option', { name: 'Serilog.Sinks.Console' }));
        expect(box()).toHaveValue('Serilog.Sinks.Console');
        expect(queries(host).map(request => request.payload)).toEqual([{ query: 'Serilog.Sinks.Console', sourceUrls: undefined, includePrerelease: false, exactMatch: true }]);
        // The id in the box asks for no suggestions of its own.
        await pause(QUICK_SEARCH_DELAY_MS + 50);
        expect(autocompletes(host)).toHaveLength(1);
        expect(screen.queryByRole('listbox', { name: 'Suggestions' })).toBeNull();
    });

    it('ui/navigateToPackage with a version carries it to the exact-match search', async () => {
        const host = await mountReady();
        await hostSays(() => host.event('ui/navigateToPackage', { packageId: 'Serilog', version: '3.1.1' }));

        expect(box()).toHaveValue('Serilog');
        expect(queries(host).map(request => request.payload)).toEqual([{ query: 'Serilog', sourceUrls: undefined, includePrerelease: false, exactMatch: true }]);
        expect(autocompletes(host)).toHaveLength(0);
        await hostSays(() => host.respond(queries(host)[0], { query: 'Serilog', results: [{ id: 'Serilog', version: '4.1.0', description: '', authors: '', versions: ['4.1.0', '3.1.1'], sourceUrl: FEED }] }));
        await waitFor(() => expect(host.requests('package/metadata').map(request => request.payload.version)).toEqual(['3.1.1']));
    });

    it('Enter cancels the pending debounce and the suggestions', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 'polly{Enter}');
        expect(queries(host).map(request => request.payload.query)).toEqual(['polly']);
        await pause(QUICK_SEARCH_DELAY_MS + 50);
        expect(autocompletes(host)).toHaveLength(0);
    });

    it('a filter prefix asks for no suggestions', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), '@installed ser');
        await pause(QUICK_SEARCH_DELAY_MS + 50);
        expect(autocompletes(host)).toHaveLength(0);
        expect(queries(host)).toHaveLength(0);
    });

    it('full: the search runs 300 ms after the last key and no suggestion is asked; config/changed switches back', async () => {
        const user = userEvent.setup();
        const host = await mountReady('full');
        await user.type(box(), 'moq');
        expect(queries(host)).toHaveLength(0);
        await waitFor(() => expect(queries(host)).toHaveLength(1), { timeout: FULL_SEARCH_DELAY_MS * 4 });
        expect(queries(host)[0].payload.query).toBe('moq');
        expect(autocompletes(host)).toHaveLength(0);

        await hostSays(() => host.event('config/changed', config('quicksearch')));
        await user.type(box(), 'x');
        await waitFor(() => expect(autocompletes(host)).toHaveLength(1));
        await pause(FULL_SEARCH_DELAY_MS);
        expect(queries(host)).toHaveLength(1);
    });

    it('off: nothing runs while typing; Enter still searches', async () => {
        const user = userEvent.setup();
        const host = await mountReady('off');
        await user.type(box(), 'serilog');
        await pause(FULL_SEARCH_DELAY_MS + 50);
        expect(autocompletes(host)).toHaveLength(0);
        expect(queries(host)).toHaveLength(0);

        await user.type(box(), '{Enter}');
        await waitFor(() => expect(queries(host)).toHaveLength(1));
        expect(queries(host)[0].payload.query).toBe('serilog');
        expect(autocompletes(host)).toHaveLength(0);
    });

    it('arrow right expands versions', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await suggestFor(host, 'ser', [
            { sourceName: 'nuget.org', sourceUrl: FEED, packageIds: ['Serilog', 'Serilog.Sinks.Console'] },
            { sourceName: 'Contoso', sourceUrl: CONTOSO, packageIds: ['Serilog'] },
        ]);
        await user.keyboard('{ArrowDown}{ArrowRight}');
        expect(versionAsks(host).map(request => request.payload)).toEqual([{ packageId: 'Serilog', sourceUrl: FEED, includePrerelease: false }]);
        await hostSays(() => host.respond(versionAsks(host)[0], { packageId: 'Serilog', versions: SEVEN }));
        const versions = screen.getByRole('listbox', { name: 'Versions of Serilog' });
        expect(within(versions).getAllByRole('option').map(option => option.textContent)).toEqual(SEVEN.slice(0, 5));

        await user.keyboard('{ArrowLeft}');
        const suggestions = screen.getByRole('listbox', { name: 'Suggestions' });
        expect(within(suggestions).getAllByRole('option', { name: 'Serilog' })[0]).toHaveAttribute('aria-selected', 'true');

        await user.keyboard('{ArrowRight}');
        await hostSays(() => host.respond(versionAsks(host)[1], { packageId: 'Serilog', versions: SEVEN }));
        await user.keyboard('{ArrowDown}{Enter}');
        expect(box()).toHaveValue('Serilog');
        expect(queries(host).map(request => request.payload)).toEqual([{ query: 'Serilog', sourceUrls: undefined, includePrerelease: false, exactMatch: true }]);
        expect(screen.queryByRole('listbox')).toBeNull();
        await hostSays(() => host.respond(queries(host)[0], { query: 'Serilog', results: [{ id: 'Serilog', version: '4.2.0', description: '', authors: '', versions: SEVEN, sourceUrl: FEED }] }));
        await waitFor(() => expect(host.requests('package/metadata').map(request => request.payload.version)).toEqual(['4.1.0']));
    });

    it('ctrl+enter installs highlighted', async () => {
        const user = userEvent.setup();
        const host = await mountReady('quicksearch', { listed: true });
        await suggestFor(host, 'ser', [{ sourceName: 'nuget.org', sourceUrl: FEED, packageIds: ['Serilog', 'Serilog.Sinks.Console'] }]);
        // A suggestion: its newest version, asked of its source.
        await user.keyboard('{ArrowDown}{Control>}{Enter}{/Control}');
        expect(versionAsks(host).map(request => request.payload)).toEqual([{ packageId: 'Serilog', sourceUrl: FEED, includePrerelease: false }]);
        expect(installs(host)).toHaveLength(0);
        await hostSays(() => host.respond(versionAsks(host)[0], { packageId: 'Serilog', versions: SEVEN }));
        expect(installs(host).map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Serilog', version: '4.2.0', sourceUrl: FEED }]);
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(queries(host)).toHaveLength(0);

        // A version of the versions level: that version, with no second ask.
        await suggestFor(host, 'i', [{ sourceName: 'nuget.org', sourceUrl: FEED, packageIds: ['Serilog', 'Serilog.Sinks.Console'] }]);
        await user.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}');
        await hostSays(() => host.respond(versionAsks(host)[1], { packageId: 'Serilog.Sinks.Console', versions: ['6.1.1', '6.0.0'] }));
        await user.keyboard('{ArrowDown}{Control>}{Enter}{/Control}');
        expect(versionAsks(host)).toHaveLength(2);
        expect(installs(host).map(request => request.payload)[1]).toEqual({ projectPath: A, packageId: 'Serilog.Sinks.Console', version: '6.0.0', sourceUrl: FEED });
        expect(screen.queryByRole('listbox')).toBeNull();

        // Installed already: the live region says so and nothing is asked.
        await suggestFor(host, 'x', [{ sourceName: 'nuget.org', sourceUrl: FEED, packageIds: ['Moq'] }]);
        await user.keyboard('{ArrowDown}{Control>}{Enter}{/Control}');
        await waitFor(() => expect(said()).toBe('Moq is already installed (4.20.72).'));
        expect(versionAsks(host)).toHaveLength(2);
        expect(installs(host)).toHaveLength(2);
    });

    it('ctrl+enter into a CPM project with a central entry opens the preview and installs on confirm', async () => {
        const user = userEvent.setup();
        const host = await mountReady('quicksearch', { listed: true, isCpm: true });
        await suggestFor(host, 'ser', [{ sourceName: 'nuget.org', sourceUrl: FEED, packageIds: ['Serilog'] }]);
        await user.keyboard('{ArrowDown}{Control>}{Enter}{/Control}');
        await hostSays(() => host.respond(versionAsks(host)[0], { packageId: 'Serilog', versions: SEVEN }));
        expect(host.requests('cpm/preview').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Serilog', version: '4.2.0' }]);
        const preview = { centralPropsPath: '/w/Directory.Packages.props', packageId: 'Serilog', fromVersion: '4.0.0', toVersion: '4.2.0', affectedProjects: [A] };
        await hostSays(() => host.respond(host.requests('cpm/preview')[0], { preview }));
        const dialog = screen.getByTestId('cpm-preview-dialog');
        expect(installs(host)).toHaveLength(0);
        // The dialog asks for its own preview before it can be confirmed.
        await hostSays(() => host.respond(host.requests('cpm/preview')[1], { preview }));
        await user.click(within(dialog).getByTestId('cpm-preview-confirm'));
        expectFocusAfterClose('quicksearch-cpm-install-confirm');
        expect(installs(host).map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Serilog', version: '4.2.0', sourceUrl: FEED }]);
    });

    it('ctrl+enter under All Projects asks nothing and says why', async () => {
        const user = userEvent.setup();
        const host = await mountReady('quicksearch', { selectedProject: ALL_PROJECTS });
        await suggestFor(host, 'ser', [{ sourceName: 'nuget.org', sourceUrl: FEED, packageIds: ['Serilog'] }]);
        await user.keyboard('{ArrowDown}{Control>}{Enter}{/Control}');
        await waitFor(() => expect(said()).toBe('Select a single project to install into.'));
        expect(versionAsks(host)).toHaveLength(0);
        expect(installs(host)).toHaveLength(0);
        expect(host.requests('cpm/preview')).toHaveLength(0);
    });

    it('the loading row shows during the first fetch and the suggestions stay while the next one runs', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(box(), 'ser');
        await waitFor(() => expect(autocompletes(host)).toHaveLength(1));
        const loading = within(screen.getByRole('listbox', { name: 'Suggestions' })).getByRole('option');
        expect(loading).toHaveTextContent('Searching…');
        expect(loading).toHaveAttribute('aria-disabled', 'true');
        await hostSays(() => host.respond(autocompletes(host)[0], { query: 'ser', groups: [{ sourceName: 'nuget.org', sourceUrl: FEED, packageIds: ['Serilog'] }] }));

        await user.type(box(), 'i');
        await waitFor(() => expect(autocompletes(host)).toHaveLength(2));
        const shown = screen.getByRole('listbox', { name: 'Suggestions' });
        expect(shown).toHaveAttribute('aria-busy', 'true');
        expect(within(shown).getAllByRole('option')).toEqual([within(shown).getByRole('option', { name: 'Serilog' })]);
        await hostSays(() => host.respond(autocompletes(host)[1], { query: 'seri', groups: [{ sourceName: 'nuget.org', sourceUrl: FEED, packageIds: ['Serilog', 'Serilog.Sinks.File'] }] }));
        const answered = screen.getByRole('listbox', { name: 'Suggestions' });
        expect(within(answered).getAllByRole('option')).toEqual([within(answered).getByRole('option', { name: 'Serilog' }), within(answered).getByRole('option', { name: 'Serilog.Sinks.File' })]);
        expect(screen.getByRole('listbox', { name: 'Suggestions' })).not.toHaveAttribute('aria-busy', 'true');
    });

    it('while the settings are unknown typing asks nothing', async () => {
        const user = userEvent.setup();
        const host = await mountReady(null);
        await user.type(box(), 'serilog');
        await pause(FULL_SEARCH_DELAY_MS + 50);
        expect(autocompletes(host)).toHaveLength(0);
        expect(queries(host)).toHaveLength(0);
    });
});

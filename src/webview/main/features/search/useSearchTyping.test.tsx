import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExtensionConfig, NuGetSource, SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { installFakeLayout } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { BrowseList } from './BrowseList';
import { FULL_SEARCH_DELAY_MS, QUICK_SEARCH_DELAY_MS } from './useSearchTyping';

const A = '/w/App/App.csproj';
const FEED = 'https://api.nuget.org/v3/index.json';
const snapshot = (rev: number): SessionSnapshot => ({ rev, selectedProject: A, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const config = (searchDebounceMode: ExtensionConfig['searchDebounceMode']): ExtensionConfig => ({ searchDebounceMode, quickSearchResultsPerSource: 5, searchResultLimit: 50, enablePerformanceLogging: false, treeIndent: 16, isWindows: false });
const SOURCES: NuGetSource[] = [{ name: 'nuget.org', url: FEED, enabled: true }];

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const pause = (ms: number): Promise<void> => act(() => new Promise<void>(resolve => setTimeout(resolve, ms)));

/** `null`: the settings stay unknown (`config/get` is not answered). */
async function mountReady(mode: ExtensionConfig['searchDebounceMode'] | null = 'quicksearch'): Promise<FakeHost> {
    const host = createFakeHost();
    render(
        <StoreProvider bus={host.bus}>
            <MainShell installed={() => <p>Installed list</p>} updates={() => <p>Updates list</p>} browse={view => <BrowseList {...view} />} />
        </StoreProvider>,
    );
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
    await hostSays(() => host.respond(host.requests('sources/list')[0], { sources: SOURCES, failed: [] }, 1));
    if (mode !== null) {
        await hostSays(() => host.respond(host.requests('config/get')[0], config(mode)));
    }
    return host;
}

const box = (): HTMLInputElement => screen.getByTestId('search-input');
const autocompletes = (host: FakeHost) => host.requests('search/autocomplete');
const queries = (host: FakeHost) => host.requests('search/query');

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

    it('fullsearch: the search runs 300 ms after the last key and no suggestion is asked; config/changed switches back', async () => {
        const user = userEvent.setup();
        const host = await mountReady('fullsearch');
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

    it('while the settings are unknown typing asks nothing', async () => {
        const user = userEvent.setup();
        const host = await mountReady(null);
        await user.type(box(), 'serilog');
        await pause(FULL_SEARCH_DELAY_MS + 50);
        expect(autocompletes(host)).toHaveLength(0);
        expect(queries(host)).toHaveLength(0);
    });
});

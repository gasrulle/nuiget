import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NuGetSource, PackageSearchResult, SessionSnapshot } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { ConfigProvider } from './config';
import { quickSearchSources, SearchProvider, useSearch, withMetadata, type SearchState } from './search';
import { SessionProvider } from './session';
import { SourcesProvider, useSources } from './sources';

const FEED = 'https://feed.example/v3/index.json';
const snapshot = (rev: number, extra: Partial<SessionSnapshot> = {}): SessionSnapshot => ({ rev, selectedProject: '/w/A/A.csproj', selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host', ...extra });
const result = (id: string, extra: Partial<PackageSearchResult> = {}): PackageSearchResult => ({ id, version: '1.0.0', description: '', authors: '', versions: ['1.0.0'], sourceUrl: FEED, ...extra });

let slice: SearchState;
let enableSources: () => void;
function Search() {
    slice = useSearch();
    enableSources = useSources().enable;
    return (
        <div>
            <output data-testid="status">{slice.status}{slice.revalidating ? ' revalidating' : ''}</output>
            <output data-testid="results">{slice.results.map(entry => `${entry.id}${entry.authors ? `:${entry.authors}` : ''}${entry.verified ? ':verified' : ''}`).join(',') || 'none'}</output>
            <output data-testid="unavailable">{String(slice.sourcesUnavailable)}</output>
            <output data-testid="error">{slice.error?.message ?? 'none'}</output>
            <output data-testid="suggestions">{slice.suggestions.map(group => `${group.sourceName}:${group.packageIds.join('+')}`).join(',') || 'none'}</output>
        </div>
    );
}

function mount(): FakeHost {
    const host = createFakeHost();
    render(<MessageBusProvider bus={host.bus}><SessionProvider><ConfigProvider><SourcesProvider><SearchProvider><Search /></SearchProvider></SourcesProvider></ConfigProvider></SessionProvider></MessageBusProvider>);
    return host;
}

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const text = (testId: string): string => screen.getByTestId(testId).textContent ?? '';
const queries = (host: FakeHost) => host.requests('search/query');

async function withSession(host: FakeHost, extra: Partial<SessionSnapshot> = {}): Promise<void> {
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, extra)));
}

describe('search slice', () => {
    it('asks nothing before a search, and search/query with the committed source and prerelease flag after one', async () => {
        const host = mount();
        await withSession(host);
        expect(text('status')).toBe('idle');
        expect(queries(host)).toHaveLength(0);

        await act(async () => slice.search('  json  '));

        expect(queries(host).map(request => request.payload)).toEqual([{ query: 'json', sourceUrls: undefined, includePrerelease: false, exactMatch: undefined }]);
        expect(text('status')).toBe('loading');
    });

    it('waits for the session before it asks, and names the one selected source', async () => {
        const host = mount();
        await act(async () => slice.search('json'));
        expect(queries(host)).toHaveLength(0);

        await withSession(host, { selectedSource: FEED, includePrerelease: true });

        expect(queries(host).map(request => request.payload)).toEqual([{ query: 'json', sourceUrls: [FEED], includePrerelease: true, exactMatch: undefined }]);
    });

    it('merges the metadata chunk that precedes the answer onto its results', async () => {
        const host = mount();
        await withSession(host);
        await act(async () => slice.search('json'));
        const [request] = queries(host);

        await hostSays(() => host.chunk(request, { kind: 'metadata', packages: [{ id: 'newtonsoft.json', version: '1.0.0', authors: 'James Newton-King', verified: true }] }));
        expect(text('results')).toBe('none');
        await hostSays(() => host.respond(request, { query: 'json', results: [result('Newtonsoft.Json'), result('System.Text.Json', { authors: 'Microsoft' })] }));

        expect(text('status')).toBe('ready');
        expect(text('results')).toBe('Newtonsoft.Json:James Newton-King:verified,System.Text.Json:Microsoft');
        expect(text('unavailable')).toBe('false');
    });

    it('the latest text wins: the earlier request is cancelled and its answer never shows', async () => {
        const host = mount();
        await withSession(host);
        await act(async () => slice.search('json'));
        await act(async () => slice.search('serilog'));
        const [first, second] = queries(host);

        expect(host.cancelled()).toEqual([first.id]);
        await hostSays(() => host.respond(first, { query: 'json', results: [result('Newtonsoft.Json')] }));
        expect(text('results')).toBe('none');
        await hostSays(() => host.respond(second, { query: 'serilog', results: [result('Serilog')] }));
        expect(text('results')).toBe('Serilog');
    });

    it('a committed prerelease change asks the shown text again and keeps the results while it does', async () => {
        const host = mount();
        await withSession(host);
        await act(async () => slice.search('json'));
        await hostSays(() => host.respond(queries(host)[0], { query: 'json', results: [result('Newtonsoft.Json')] }));

        await hostSays(() => host.event('session/changed', snapshot(2, { includePrerelease: true })));

        expect(queries(host).map(request => request.payload.includePrerelease)).toEqual([false, true]);
        expect(text('status')).toBe('ready revalidating');
        expect(text('results')).toBe('Newtonsoft.Json');
        await hostSays(() => host.respond(queries(host)[1], { query: 'json', results: [result('Newtonsoft.Json', { version: '14.0.0-beta1' })] }));
        expect(text('status')).toBe('ready');
    });

    it('an unreachable source is a flag over the results, never an empty answer', async () => {
        const host = mount();
        await withSession(host);
        await act(async () => slice.search('json'));
        await hostSays(() => host.respond(queries(host)[0], { query: 'json', results: [], sourcesUnavailable: true }));

        expect(text('status')).toBe('ready');
        expect(text('unavailable')).toBe('true');
    });

    it('an error ends loading, and retry asks the same text again', async () => {
        const host = mount();
        await withSession(host);
        await act(async () => slice.search('json'));
        await hostSays(() => host.fail(queries(host)[0], 'failed', 'No source answered'));

        expect(text('status')).toBe('error');
        expect(text('error')).toBe('No source answered');

        await act(async () => slice.retry());
        expect(queries(host).map(request => request.payload.query)).toEqual(['json', 'json']);
        expect(text('status')).toBe('loading');
        expect(text('error')).toBe('none');
    });

    it('asks for an exact match when told to, and clear forgets the search', async () => {
        const host = mount();
        await withSession(host);
        await act(async () => slice.search('Serilog', { exactMatch: true }));
        expect(queries(host)[0].payload.exactMatch).toBe(true);
        await hostSays(() => host.respond(queries(host)[0], { query: 'Serilog', results: [result('Serilog')] }));

        await act(async () => slice.clear());

        expect(text('status')).toBe('idle');
        expect(text('results')).toBe('none');
        // A blank text is no search either.
        await act(async () => slice.search('   '));
        expect(queries(host)).toHaveLength(1);
    });
});

const OTHER = 'https://contoso.example/v3/index.json';
const SOURCES: NuGetSource[] = [
    { name: 'nuget.org', url: FEED, enabled: true },
    { name: 'Contoso', url: OTHER, enabled: true },
    { name: 'Off', url: 'https://off.example/v3/index.json', enabled: false },
];

async function withSources(host: FakeHost, sources: NuGetSource[] = SOURCES): Promise<void> {
    await act(async () => enableSources());
    await hostSays(() => host.respond(host.requests('sources/list')[0], { sources, failed: [] }, 1));
}

describe('search slice: quick-search', () => {
    it('suggest asks search/autocomplete with every enabled source under all and the one selected source otherwise', async () => {
        const host = mount();
        await withSession(host);
        await withSources(host);
        await act(async () => slice.suggest(' ser '));
        expect(host.requests('search/autocomplete').map(request => request.payload)).toEqual([{ query: 'ser', sources: [{ name: 'nuget.org', url: FEED }, { name: 'Contoso', url: OTHER }], includePrerelease: false }]);
        await hostSays(() => host.respond(host.requests('search/autocomplete')[0], { query: 'ser', groups: [{ sourceName: 'nuget.org', sourceUrl: FEED, packageIds: ['Serilog', 'Serilog.Sinks.File'] }] }));
        expect(text('suggestions')).toBe('nuget.org:Serilog+Serilog.Sinks.File');

        await hostSays(() => host.event('session/changed', snapshot(2, { selectedSource: OTHER, includePrerelease: true })));
        await act(async () => slice.suggest('ser'));
        expect(host.requests('search/autocomplete')[1].payload).toEqual({ query: 'ser', sources: [{ name: 'Contoso', url: OTHER }], includePrerelease: true });
        // A new suggest starts empty; clearSuggestions empties it too.
        expect(text('suggestions')).toBe('none');
        expect(slice.suggesting).toBe(true);
        await act(async () => slice.clearSuggestions());
        expect(slice.suggesting).toBe(false);
    });

    it('suggest sends nothing while the sources are unknown or none matches', async () => {
        const host = mount();
        await withSession(host, { selectedSource: 'https://gone.example/v3/index.json' });
        await act(async () => slice.suggest('ser'));
        expect(host.requests('search/autocomplete')).toHaveLength(0);

        await withSources(host);
        await act(async () => slice.suggest('ser'));
        expect(host.requests('search/autocomplete')).toHaveLength(0);
        expect(text('suggestions')).toBe('none');
    });

    it('a newer suggest cancels the earlier request and its answer never shows', async () => {
        const host = mount();
        await withSession(host);
        await withSources(host);
        await act(async () => slice.suggest('se'));
        await act(async () => slice.suggest('ser'));
        const [first, second] = host.requests('search/autocomplete');

        expect(host.cancelled()).toContain(first.id);
        await hostSays(() => host.respond(first, { query: 'se', groups: [{ sourceName: 'nuget.org', sourceUrl: FEED, packageIds: ['Selenium'] }] }));
        expect(text('suggestions')).toBe('none');
        await hostSays(() => host.respond(second, { query: 'ser', groups: [{ sourceName: 'nuget.org', sourceUrl: FEED, packageIds: ['Serilog'] }] }));
        expect(text('suggestions')).toBe('nuget.org:Serilog');
    });

    it('sends nothing when the setting asks for full searches or none while typing', async () => {
        const host = mount();
        await withSession(host);
        await withSources(host);
        await hostSays(() => host.event('config/changed', { searchDebounceMode: 'full', quickSearchResultsPerSource: 5, searchResultLimit: 50, enablePerformanceLogging: false, treeIndent: 16, isWindows: false }));
        await act(async () => slice.suggest('ser'));
        expect(host.requests('search/autocomplete')).toHaveLength(0);
        await hostSays(() => host.event('config/changed', { searchDebounceMode: 'off', quickSearchResultsPerSource: 5, searchResultLimit: 50, enablePerformanceLogging: false, treeIndent: 16, isWindows: false }));
        await act(async () => slice.suggest('ser'));
        expect(host.requests('search/autocomplete')).toHaveLength(0);
    });

    it('quickSearchSources leaves disabled sources out', () => {
        expect(quickSearchSources(SOURCES, 'all').map(source => source.name)).toEqual(['nuget.org', 'Contoso']);
        expect(quickSearchSources(SOURCES, 'https://off.example/v3/index.json')).toEqual([]);
    });
});

describe('withMetadata', () => {
    it('fills what a result lacks by id and version without regard to case, and overrides nothing it has', () => {
        const merged = withMetadata(
            [result('A', { iconUrl: 'data:own', description: 'own' }), result('B'), result('C', { version: '2.0.0' })],
            [{ id: 'a', version: '1.0.0', iconUrl: 'data:lite', description: 'lite', verified: false }, { id: 'B', version: '1.0.0', iconUrl: 'data:b', description: 'about B' }, { id: 'C', version: '1.0.0', authors: 'wrong version' }],
        );

        expect(merged[0]).toMatchObject({ iconUrl: 'data:own', description: 'own', verified: false });
        expect(merged[1]).toMatchObject({ iconUrl: 'data:b', description: 'about B' });
        expect(merged[2].authors).toBe('');
    });
});

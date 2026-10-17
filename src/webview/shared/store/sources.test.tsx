import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resourceKeys, type NuGetSource, type SessionSnapshot } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { SessionProvider } from './session';
import { SourcesProvider, useSources, type SourcesState } from './sources';

const A = '/w/A/A.csproj';
const B = '/w/B/B.csproj';
const FEED = 'https://feed.example/v3/index.json';
const snapshot = (rev: number, selectedProject = A): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const source = (name: string, url = `https://${name}.example/v3/index.json`): NuGetSource => ({ name, url, enabled: true });

let slice: SourcesState;
function Sources() {
    slice = useSources();
    return (
        <div>
            <output data-testid="status">{slice.status}{slice.revalidating ? ' revalidating' : ''}</output>
            <output data-testid="sources">{slice.sources?.map(entry => entry.name).join(',') ?? 'unknown'}</output>
            <output data-testid="failed">{slice.failed.map(entry => entry.url).join(',') || 'none'}</output>
            <output data-testid="error">{slice.error?.message ?? 'none'}</output>
        </div>
    );
}

function mount(): FakeHost {
    const host = createFakeHost();
    render(<MessageBusProvider bus={host.bus}><SessionProvider><SourcesProvider><Sources /></SourcesProvider></SessionProvider></MessageBusProvider>);
    return host;
}

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const text = (testId: string): string => screen.getByTestId(testId).textContent ?? '';
const listed = (host: FakeHost) => host.requests('sources/list');

async function enabledWithSession(host: FakeHost): Promise<void> {
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await act(async () => slice.enable());
}

describe('sources slice (read part)', () => {
    it('asks nothing until it is enabled, then sources/list once', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        expect(listed(host)).toHaveLength(0);
        expect(text('status')).toBe('idle');

        await act(async () => slice.enable());
        await act(async () => slice.enable());
        expect(listed(host)).toHaveLength(1);
        expect(text('status')).toBe('loading');
        await hostSays(() => host.respond(listed(host)[0], { sources: [source('nuget'), source('contoso')], failed: [] }, 1));
        expect(text('status')).toBe('ready');
        expect(text('sources')).toBe('nuget,contoso');
    });

    it('a committed project change asks again and keeps the list while it does', async () => {
        const host = mount();
        await enabledWithSession(host);
        await hostSays(() => host.respond(listed(host)[0], { sources: [source('nuget')], failed: [] }, 1));

        await hostSays(() => host.event('session/changed', snapshot(2, B)));

        expect(listed(host)).toHaveLength(2);
        expect(text('status')).toBe('ready revalidating');
        expect(text('sources')).toBe('nuget');
        await hostSays(() => host.respond(listed(host)[1], { sources: [source('nuget'), source('local')], failed: [] }, 1));
        expect(text('sources')).toBe('nuget,local');
        expect(text('status')).toBe('ready');
    });

    it('an invalidation of scope sources or a sources: key asks again, and the latest answer wins', async () => {
        const host = mount();
        await enabledWithSession(host);
        await hostSays(() => host.respond(listed(host)[0], { sources: [source('nuget')], failed: [] }, 1));

        await hostSays(() => host.event('resources/invalidated', { scope: { kind: 'sources' }, reason: 'manual-refresh', generation: 5, keys: [] }));
        await hostSays(() => host.invalidate([[resourceKeys.sources('/w/A'), 3]]));
        // An invalidation that names no source asks nothing.
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 3]]));
        expect(listed(host)).toHaveLength(3);
        expect(host.cancelled()).toEqual([listed(host)[1].id]);

        await hostSays(() => host.respond(listed(host)[1], { sources: [source('stale')], failed: [] }, 2));
        expect(text('sources')).toBe('nuget');
        await hostSays(() => host.respond(listed(host)[2], { sources: [source('fresh')], failed: [] }, 3));
        expect(text('sources')).toBe('fresh');
    });

    it('failed follows the answer, the health chunk and sources/health', async () => {
        const host = mount();
        await enabledWithSession(host);
        await hostSays(() => host.chunk(listed(host)[0], { kind: 'health', failed: [{ url: FEED, error: 'timeout' }] }));
        expect(text('failed')).toBe(FEED);
        await hostSays(() => host.respond(listed(host)[0], { sources: [source('feed', FEED)], failed: [] }, 1));
        expect(text('failed')).toBe('none');
        await hostSays(() => host.event('sources/health', { failed: [{ url: FEED, error: '503' }] }));
        expect(text('failed')).toBe(FEED);
    });

    it('an error ends loading and refresh asks again', async () => {
        const host = mount();
        await enabledWithSession(host);
        await hostSays(() => host.fail(listed(host)[0], 'failed', 'nuget config unreadable'));
        expect(text('status')).toBe('error');
        expect(text('error')).toBe('nuget config unreadable');

        await act(async () => slice.refresh());
        expect(listed(host)).toHaveLength(2);
        expect(text('status')).toBe('loading');
        expect(text('error')).toBe('none');
    });

    it('add, remove, enable and disable send their request, mark the source pending and show the answer at once', async () => {
        const host = mount();
        await enabledWithSession(host);
        await hostSays(() => host.respond(listed(host)[0], { sources: [source('nuget')], failed: [] }, 1));

        let added!: Promise<void>;
        await act(async () => { added = slice.add({ url: 'https://contoso.example/v3/index.json', name: 'contoso', configFile: '/w/nuget.config' }); });
        expect(host.requests('sources/add')[0].payload).toEqual({ url: 'https://contoso.example/v3/index.json', name: 'contoso', configFile: '/w/nuget.config' });
        expect([...slice.pending]).toEqual(['contoso']);
        await hostSays(() => host.respond(host.requests('sources/add')[0], { sources: [source('nuget'), source('contoso')] }, 2));
        await act(async () => added);
        expect(text('sources')).toBe('nuget,contoso');
        expect(slice.pending.size).toBe(0);

        await act(async () => { void slice.setEnabled('contoso', false); });
        await hostSays(() => host.respond(host.requests('sources/disable')[0], { sources: [source('nuget'), { ...source('contoso'), enabled: false }] }, 3));
        await act(async () => { void slice.setEnabled('contoso', true); });
        expect(host.requests('sources/enable')[0].payload).toEqual({ sourceName: 'contoso' });
        await act(async () => { void slice.remove('contoso', '/w/nuget.config'); });
        await act(async () => { void slice.remove('nuget'); });
        expect(host.requests('sources/remove').map(request => request.payload)).toEqual([{ sourceName: 'contoso', configFile: '/w/nuget.config' }, { sourceName: 'nuget' }]);
    });

    it('a refused mutation rejects with the host\'s message and leaves the list as it was', async () => {
        const host = mount();
        await enabledWithSession(host);
        await hostSays(() => host.respond(listed(host)[0], { sources: [source('nuget')], failed: [] }, 1));
        let outcome!: Promise<string>;
        // The rejection is handled from the start, so it is never an unhandled one.
        await act(async () => { outcome = slice.add({ url: 'not a url' }).then(() => 'added', (error: Error) => error.message); });
        await hostSays(() => host.fail(host.requests('sources/add')[0], 'failed', 'The source URL is not valid'));
        expect(await outcome).toBe('The source URL is not valid');
        expect(text('sources')).toBe('nuget');
        expect(slice.pending.size).toBe(0);
    });

    it('loadConfigFiles asks sources/configFiles; a failure is an empty list', async () => {
        const host = mount();
        await act(async () => slice.loadConfigFiles());
        await hostSays(() => host.respond(host.requests('sources/configFiles')[0], { configFiles: [{ path: '/w/nuget.config', label: 'Workspace (nuget.config)' }] }));
        expect(slice.configFiles).toEqual([{ path: '/w/nuget.config', label: 'Workspace (nuget.config)' }]);
        await act(async () => slice.loadConfigFiles());
        await hostSays(() => host.fail(host.requests('sources/configFiles')[1], 'failed'));
        expect(slice.configFiles).toEqual([]);
    });
});

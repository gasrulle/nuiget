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
});

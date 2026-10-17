import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type PackageUpdate, type SessionSnapshot } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { SessionProvider } from './session';
import { RECOVERY_DELAY_MS, UpdatesProvider, useUpdates } from './updates';

const A = '/w/A/A.csproj';
const FEED = 'https://feed.example/v3/index.json';
const snapshot = (rev: number, selectedProject: string, includePrerelease = false): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease, restoreEnabled: true, origin: 'host' });
const update = (id: string, latestVersion = '2.0.0', extra: Partial<PackageUpdate> = {}): PackageUpdate => ({ id, installedVersion: '1.0.0', latestVersion, sourceUrl: FEED, ...extra });

function Updates() {
    const state = useUpdates();
    return (
        <div>
            <output data-testid="project">{state.projectPath ?? 'none'}</output>
            <output data-testid="status">{state.status}{state.revalidating ? ' revalidating' : ''}</output>
            <output data-testid="rows">{state.rows.map(row => `${row.id}@${row.latestVersion}${row.authors ? `:${row.authors}` : ''}`).join(',') || 'none'}</output>
            <output data-testid="unavailable">{String(state.sourcesUnavailable)}</output>
            <output data-testid="prerelease">{String(state.includePrerelease)}</output>
        </div>
    );
}

function mount(): FakeHost {
    const host = createFakeHost();
    render(<MessageBusProvider bus={host.bus}><SessionProvider><UpdatesProvider><Updates /></UpdatesProvider></SessionProvider></MessageBusProvider>);
    return host;
}

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const text = (testId: string): string => screen.getByTestId(testId).textContent ?? '';
const asked = (host: FakeHost) => host.requests('updates/get');

async function selectA(host: FakeHost, includePrerelease = false): Promise<void> {
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A, includePrerelease)));
}

afterEach(() => {
    vi.useRealTimers();
});

describe('updates slice', () => {
    it('asks updates/get for the committed project under the committed prerelease flag, and nothing without a single project', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, ALL_PROJECTS)));
        expect(asked(host)).toHaveLength(0);
        expect(text('status')).toBe('idle');

        await hostSays(() => host.event('session/changed', snapshot(2, A)));
        expect(asked(host).map(request => request.payload)).toEqual([{ projectPath: A, includePrerelease: false }]);

        // Another flag is another resource: the toggle asks again, with the flag.
        await hostSays(() => host.event('session/changed', snapshot(3, A, true)));
        expect(asked(host).map(request => request.payload)).toEqual([{ projectPath: A, includePrerelease: false }, { projectPath: A, includePrerelease: true }]);
        expect(text('prerelease')).toBe('true');
    });

    it('shows the found rows as they stream and the enriched answer once it is there', async () => {
        const host = mount();
        await selectA(host);
        const [request] = asked(host);
        expect(text('rows')).toBe('none');

        await hostSays(() => host.chunk(request, { kind: 'found', update: update('Serilog', '3.1.0') }));
        await hostSays(() => host.chunk(request, { kind: 'found', update: update('Polly', '8.4.2') }));
        expect(text('rows')).toBe('Serilog@3.1.0,Polly@8.4.2');
        expect(text('status')).toBe('loading');

        await hostSays(() => host.respond(request, { projectPath: A, updates: [update('Serilog', '3.1.0', { authors: 'Serilog Contributors' }), update('Polly', '8.4.2', { authors: 'App vNext' })] }, 4));
        expect(text('rows')).toBe('Serilog@3.1.0:Serilog Contributors,Polly@8.4.2:App vNext');
        expect(text('unavailable')).toBe('false');
    });

    it('keeps the rows while it asks again after an invalidation of its key, and an unavailable answer is not empty', async () => {
        const host = mount();
        await selectA(host);
        await hostSays(() => host.respond(asked(host)[0], { projectPath: A, updates: [update('Serilog')] }, 1));

        await hostSays(() => host.invalidate([[resourceKeys.updates(A, false), 2]]));
        expect(asked(host)).toHaveLength(2);
        expect(text('rows')).toBe('Serilog@2.0.0');
        expect(text('status')).toBe('ready revalidating');

        await hostSays(() => host.respond(asked(host)[1], { projectPath: A, updates: [], sourcesUnavailable: true }, 2));
        expect(text('rows')).toBe('none');
        expect(text('unavailable')).toBe('true');
    });

    it('asks again once when a source that was down is reported up while the answer was unavailable', async () => {
        vi.useFakeTimers();
        const host = mount();
        await selectA(host);
        await hostSays(() => host.respond(asked(host)[0], { projectPath: A, updates: [], sourcesUnavailable: true }, 1));
        await hostSays(() => host.event('sources/health', { failed: [{ url: FEED, error: 'timeout' }] }));
        expect(asked(host)).toHaveLength(1);

        await hostSays(() => host.event('sources/health', { failed: [] }));
        expect(asked(host)).toHaveLength(1);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(RECOVERY_DELAY_MS);
        });
        expect(asked(host)).toHaveLength(2);
    });

    it('a recovery followed by the invalidation of a manual refresh asks exactly once', async () => {
        vi.useFakeTimers();
        const host = mount();
        await selectA(host);
        await hostSays(() => host.respond(asked(host)[0], { projectPath: A, updates: [], sourcesUnavailable: true }, 1));
        await hostSays(() => host.event('sources/health', { failed: [{ url: FEED, error: 'timeout' }] }));

        await hostSays(() => host.event('sources/health', { failed: [] }));
        await hostSays(() => host.invalidate([[resourceKeys.updates(A, false), 2]]));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(RECOVERY_DELAY_MS * 2);
        });
        expect(asked(host)).toHaveLength(2);
    });

    it('a health event while the answer was available asks for nothing', async () => {
        vi.useFakeTimers();
        const host = mount();
        await selectA(host);
        await hostSays(() => host.respond(asked(host)[0], { projectPath: A, updates: [update('Serilog')] }, 1));
        await hostSays(() => host.event('sources/health', { failed: [{ url: FEED, error: 'timeout' }] }));
        await hostSays(() => host.event('sources/health', { failed: [] }));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(RECOVERY_DELAY_MS * 2);
        });
        expect(asked(host)).toHaveLength(1);
    });
});

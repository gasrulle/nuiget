import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type InstalledResult, type ProjectInstalledChunk, type SessionSnapshot } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { AllProjectsProvider, useAllProjects, type AllProjectsState } from './allProjects';
import { RECOVERY_DELAY_MS } from './updates';
import { SessionProvider } from './session';

const A = '/w/A/A.csproj';
const B = '/w/B/B.csproj';
const snapshot = (rev: number, selectedProject: string, includePrerelease = false): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease, restoreEnabled: true, origin: 'host' });
const installed = (projectPath: string, ids: string[]): InstalledResult => ({
    projectPath, fidelity: 'authoritative', isCpm: false, packages: ids.map(id => ({ id, version: '1.0.0', versionType: 'standard', declaration: 'project' })),
});
const chunkOf = (projectPath: string, ids: string[]): ProjectInstalledChunk => ({ projectPath, projectName: projectPath.split('/')[2], result: installed(projectPath, ids) });

let current: AllProjectsState;
function Probe() {
    current = useAllProjects();
    const lists = [...current.chunks.values()].map(chunk => `${chunk.projectName}:${chunk.error ?? chunk.result?.packages.map(entry => entry.id).join(',')}`).join(' ');
    return <output data-testid="all">{`${current.active} ${current.status} ${current.revalidating} [${lists}]`}</output>;
}

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const text = (): string => screen.getByTestId('all').textContent ?? '';

async function mount(selected: string): Promise<FakeHost> {
    const host = createFakeHost();
    render(<MessageBusProvider bus={host.bus}><SessionProvider><AllProjectsProvider><Probe /></AllProjectsProvider></SessionProvider></MessageBusProvider>);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, selected)));
    return host;
}

/** Streams a listing of A and B for `request` and answers it. */
async function list(host: FakeHost, index: number, a: string[], b: string[]): Promise<void> {
    const request = host.requests('allProjects/installed')[index];
    await hostSays(() => host.chunk(request, { kind: 'start', projects: [{ name: 'A', path: A }, { name: 'B', path: B }] }));
    await hostSays(() => host.chunk(request, { kind: 'project', chunk: chunkOf(A, a) }));
    await hostSays(() => host.chunk(request, { kind: 'project', chunk: chunkOf(B, b) }));
    await hostSays(() => host.respond(request, { projectPaths: [A, B], errored: [] }));
}

describe('allProjects slice', () => {
    it('asks allProjects/installed in all-projects mode only and collects the project chunks by path', async () => {
        const single = await mount(A);
        expect(single.requests('allProjects/installed')).toHaveLength(0);
        expect(text()).toBe('false idle false []');
        await hostSays(() => single.event('session/changed', snapshot(2, ALL_PROJECTS)));
        expect(single.requests('allProjects/installed')).toHaveLength(1);
        expect(text()).toBe('true loading false []');
        await list(single, 0, ['Serilog'], ['Moq', 'xunit']);
        expect(text()).toBe('true ready false [A:Serilog B:Moq,xunit]');
        expect(current.projects?.map(project => project.path)).toEqual([A, B]);
        // Metadata streams after the lists, before the answer, by project and lower-cased id.
        await hostSays(() => current.refresh());
        const second = single.requests('allProjects/installed')[1];
        await hostSays(() => single.chunk(second, { kind: 'metadata', projectPath: B, packages: [{ id: 'Moq', version: '1.0.0', description: 'Mocking' }] }));
        expect(current.metadata.get(B)?.get('moq')?.description).toBe('Mocking');
    });

    it('asks again when an invalidation names projects or any installed key, and keeps the chunks meanwhile', async () => {
        const host = await mount(ALL_PROJECTS);
        await list(host, 0, ['Serilog'], ['Moq']);
        await hostSays(() => host.invalidate([[resourceKeys.transitive(A), 2]]));
        expect(host.requests('allProjects/installed')).toHaveLength(1);
        await hostSays(() => host.invalidate([[resourceKeys.installed(B), 3]]));
        expect(host.requests('allProjects/installed')).toHaveLength(2);
        expect(text()).toBe('true ready true [A:Serilog B:Moq]');
        await list(host, 1, ['Serilog'], []);
        expect(text()).toBe('true ready false [A:Serilog B:]');
        await hostSays(() => host.invalidate([[resourceKeys.projects(), 4]]));
        expect(host.requests('allProjects/installed')).toHaveLength(3);
    });

    it('chunks and the response of an earlier request are recorded and not applied', async () => {
        const host = await mount(ALL_PROJECTS);
        await list(host, 0, ['Serilog'], ['Moq']);
        await hostSays(() => current.refresh());
        await hostSays(() => current.refresh());
        const [, older, latest] = host.requests('allProjects/installed');
        expect(host.cancelled()).toContain(older.id);
        await hostSays(() => host.chunk(latest, { kind: 'project', chunk: chunkOf(A, ['New']) }));
        // R4: the cancelled request's late chunk and answer change nothing.
        await hostSays(() => host.chunk(older, { kind: 'project', chunk: chunkOf(A, ['Old']) }));
        await hostSays(() => host.respond(older, { projectPaths: [A], errored: [] }));
        expect(text()).toBe('true ready true [A:New B:Moq]');
        await hostSays(() => host.respond(latest, { projectPaths: [A, B], errored: [] }));
        expect(text()).toBe('true ready false [A:New B:Moq]');
    });

    it('an errored project is kept as its error, a later chunk for the same project replaces it', async () => {
        const host = await mount(ALL_PROJECTS);
        const request = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: A, projectName: 'A', error: 'assets file unreadable' } }));
        await hostSays(() => host.respond(request, { projectPaths: [], errored: [{ projectPath: A, error: 'assets file unreadable' }] }));
        expect(text()).toBe('true ready false [A:assets file unreadable]');
        expect(current.errored).toEqual([{ projectPath: A, error: 'assets file unreadable' }]);
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        await hostSays(() => host.chunk(host.requests('allProjects/installed')[1], { kind: 'project', chunk: chunkOf(A, ['Serilog']) }));
        expect(text()).toBe('true ready true [A:Serilog]');
        // A failure of the whole request keeps what is shown and says so.
        await hostSays(() => host.fail(host.requests('allProjects/installed')[1], 'failed', 'no workspace'));
        expect(text()).toBe('true ready false [A:Serilog]');
        expect(current.error?.message).toBe('no workspace');
    });

    it('leaving all-projects mode drops the state', async () => {
        const host = await mount(ALL_PROJECTS);
        await list(host, 0, ['Serilog'], ['Moq']);
        await hostSays(() => host.event('session/changed', snapshot(2, A)));
        expect(text()).toBe('false idle false []');
        expect(current.projects).toBeUndefined();
        // An invalidation outside the mode asks nothing.
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        expect(host.requests('allProjects/installed')).toHaveLength(1);
        // A first listing that fails is an error state.
        await hostSays(() => host.event('session/changed', snapshot(3, ALL_PROJECTS)));
        await hostSays(() => host.fail(host.requests('allProjects/installed')[1], 'failed', 'no workspace'));
        expect(text()).toBe('true error false []');
    });

    it('the transitive stream is asked only after enableTransitive, collects chunks by project and applies its latest request only', async () => {
        const host = await mount(ALL_PROJECTS);
        await list(host, 0, ['Serilog'], ['Moq']);
        expect(host.requests('allProjects/transitive')).toHaveLength(0);
        expect(current.transitive).toMatchObject({ enabled: false, status: 'idle' });

        await act(async () => current.enableTransitive());
        const [first] = host.requests('allProjects/transitive');
        expect(current.transitive.status).toBe('loading');
        await hostSays(() => host.chunk(first, { kind: 'project', chunk: { projectPath: A, projectName: 'A', frameworks: [{ targetFramework: 'net8.0', packages: [{ id: 'Serilog.Core', version: '1.0.0', requiredByChain: ['Serilog'] }] }], dataSourceAvailable: true } }));
        // A restore of a project asks again; the earlier request is cancelled and its late chunk not applied.
        await hostSays(() => host.invalidate([[resourceKeys.transitive(B), 2]]));
        const second = host.requests('allProjects/transitive')[1];
        expect(host.cancelled()).toContain(first.id);
        await hostSays(() => host.chunk(first, { kind: 'project', chunk: { projectPath: B, projectName: 'B', frameworks: [], dataSourceAvailable: false } }));
        expect([...current.transitive.chunks.keys()]).toEqual([A]);
        await hostSays(() => host.chunk(second, { kind: 'project', chunk: { projectPath: B, projectName: 'B', frameworks: [], dataSourceAvailable: true } }));
        await hostSays(() => host.respond(second, { projectPaths: [B], errored: [{ projectPath: A, errorKind: 'parse-failed' }] }));
        expect(current.transitive.status).toBe('ready');
        expect([...current.transitive.chunks.keys()].sort()).toEqual([A, B]);
        expect(current.transitive.errored).toEqual([{ projectPath: A, errorKind: 'parse-failed' }]);
    });

    it('the aggregated transitive stream asks transitive/metadata once for the unique pairs after its answer, and a newer stream asks again', async () => {
        const host = await mount(ALL_PROJECTS);
        await list(host, 0, ['Serilog'], ['Moq']);
        await act(async () => current.enableTransitive());
        const frameworks = (ids: string[]) => [{ targetFramework: 'net8.0', packages: ids.map(id => ({ id, version: '1.0.0', requiredByChain: ['Serilog'] })) }];
        const [first] = host.requests('allProjects/transitive');
        await hostSays(() => host.chunk(first, { kind: 'project', chunk: { projectPath: A, projectName: 'A', frameworks: frameworks(['Serilog.Core', 'Shared']), dataSourceAvailable: true } }));
        await hostSays(() => host.chunk(first, { kind: 'project', chunk: { projectPath: B, projectName: 'B', frameworks: frameworks(['shared']), dataSourceAvailable: true } }));
        // Nothing is asked while the stream runs.
        expect(host.requests('transitive/metadata')).toHaveLength(0);
        await hostSays(() => host.respond(first, { projectPaths: [A, B], errored: [] }));
        const asks = host.requests('transitive/metadata');
        expect(asks.map(request => request.payload)).toEqual([{ packages: [{ id: 'Serilog.Core', version: '1.0.0' }, { id: 'Shared', version: '1.0.0' }] }]);
        await hostSays(() => host.respond(asks[0], { metadata: [{ id: 'Serilog.Core', version: '1.0.0', authors: 'Serilog Contributors', verified: true }] }));
        expect(current.transitive.metadata.get('serilog.core@1.0.0')?.authors).toBe('Serilog Contributors');

        // A newer stream keeps the metadata while it runs and asks again after its answer.
        await hostSays(() => host.invalidate([[resourceKeys.transitive(B), 2]]));
        const second = host.requests('allProjects/transitive')[1];
        await hostSays(() => host.chunk(second, { kind: 'project', chunk: { projectPath: B, projectName: 'B', frameworks: frameworks(['Other']), dataSourceAvailable: true } }));
        expect(current.transitive.metadata.size).toBe(1);
        await hostSays(() => host.respond(second, { projectPaths: [A, B], errored: [] }));
        expect(host.requests('transitive/metadata')).toHaveLength(2);
        expect(host.requests('transitive/metadata')[1].payload.packages.map(entry => entry.id)).toEqual(['Serilog.Core', 'Shared', 'Other']);
    });

    it('leaving All Projects closes the transitive stream; coming back starts closed', async () => {
        const host = await mount(ALL_PROJECTS);
        await act(async () => current.enableTransitive());
        await hostSays(() => host.event('session/changed', snapshot(2, A)));
        expect(host.cancelled()).toContain(host.requests('allProjects/transitive')[0].id);
        await hostSays(() => host.event('session/changed', snapshot(3, ALL_PROJECTS)));
        expect(current.transitive.enabled).toBe(false);
        expect(host.requests('allProjects/transitive')).toHaveLength(1);
        await act(async () => current.transitive.refresh());
        expect(host.requests('allProjects/transitive')).toHaveLength(1);
    });

    describe('updates stream', () => {
        const FEED = 'https://feed.example/v3/index.json';
        const upd = (id: string, latestVersion: string) => ({ id, installedVersion: '1.0.0', latestVersion, sourceUrl: FEED });
        const updatesOf = (): string => [...current.updates.chunks.values()].map(chunk => `${chunk.projectName}:${chunk.error ?? chunk.updates.map(entry => entry.id).join(',')}`).join(' ');

        afterEach(() => {
            vi.useRealTimers();
        });

        it('asks allProjects/updates with the committed prerelease flag in all-projects mode only and collects the project chunks and icons', async () => {
            const host = await mount(A);
            expect(host.requests('allProjects/updates')).toHaveLength(0);
            await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS, true)));
            const [request] = host.requests('allProjects/updates');
            expect(request.payload).toEqual({ includePrerelease: true });
            expect(current.updates.status).toBe('loading');

            await hostSays(() => host.chunk(request, { kind: 'start', projects: [{ name: 'A', path: A }, { name: 'B', path: B }] }));
            await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: A, projectName: 'A', updates: [upd('Serilog', '3.1.0')] } }));
            await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: B, projectName: 'B', updates: [], error: 'timed out' } }));
            await hostSays(() => host.chunk(request, { kind: 'icons', icons: { Serilog: 'data:image/png;base64,AAAA' } }));
            await hostSays(() => host.respond(request, { projectPaths: [A, B] }));

            expect(current.updates.status).toBe('ready');
            expect(current.updates.projects?.map(project => project.name)).toEqual(['A', 'B']);
            expect(updatesOf()).toBe('A:Serilog B:timed out');
            expect(current.updates.icons.get('serilog')).toBe('data:image/png;base64,AAAA');
            expect(current.updates.sourcesUnavailable).toBe(false);
        });

        it('asks again when an invalidation names projects or any updates key, or the flag changes, and keeps the chunks meanwhile', async () => {
            const host = await mount(ALL_PROJECTS);
            const [first] = host.requests('allProjects/updates');
            await hostSays(() => host.chunk(first, { kind: 'project', chunk: { projectPath: A, projectName: 'A', updates: [upd('Serilog', '3.1.0')] } }));
            await hostSays(() => host.respond(first, { projectPaths: [A] }));

            await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
            expect(host.requests('allProjects/updates')).toHaveLength(1);
            await hostSays(() => host.invalidate([[resourceKeys.updates(A, false), 2]]));
            expect(host.requests('allProjects/updates')).toHaveLength(2);
            expect(current.updates.revalidating).toBe(true);
            expect(updatesOf()).toBe('A:Serilog');
            await hostSays(() => host.invalidate([[resourceKeys.projects(), 3]]));
            await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS, true)));
            expect(host.requests('allProjects/updates').map(request => request.payload.includePrerelease)).toEqual([false, false, false, true]);
        });

        it('chunks and the response of an earlier updates request are recorded and not applied', async () => {
            const host = await mount(ALL_PROJECTS);
            const [first] = host.requests('allProjects/updates');
            await hostSays(() => host.invalidate([[resourceKeys.updates(A, false), 2]]));
            const second = host.requests('allProjects/updates')[1];

            await hostSays(() => host.chunk(first, { kind: 'project', chunk: { projectPath: A, projectName: 'A', updates: [upd('Stale', '9.0.0')] } }));
            await hostSays(() => host.respond(first, { projectPaths: [A], sourcesUnavailable: true }));
            expect(updatesOf()).toBe('');
            expect(current.updates.sourcesUnavailable).toBe(false);
            await hostSays(() => host.chunk(second, { kind: 'project', chunk: { projectPath: A, projectName: 'A', updates: [upd('Serilog', '3.1.0')] } }));
            await hostSays(() => host.respond(second, { projectPaths: [A] }));
            expect(updatesOf()).toBe('A:Serilog');
        });

        it('a recovered source asks the all-projects updates once when they were unavailable', async () => {
            vi.useFakeTimers();
            const host = await mount(ALL_PROJECTS);
            await hostSays(() => host.event('sources/health', { failed: [{ url: FEED, error: 'down' }] }));
            await hostSays(() => host.respond(host.requests('allProjects/updates')[0], { projectPaths: [A], sourcesUnavailable: true }));
            expect(current.updates.sourcesUnavailable).toBe(true);

            await hostSays(() => host.event('sources/health', { failed: [] }));
            await act(async () => { vi.advanceTimersByTime(RECOVERY_DELAY_MS); });
            expect(host.requests('allProjects/updates')).toHaveLength(2);
            // Once: another health event without a recovery asks nothing.
            await hostSays(() => host.event('sources/health', { failed: [] }));
            await act(async () => { vi.advanceTimersByTime(RECOVERY_DELAY_MS); });
            expect(host.requests('allProjects/updates')).toHaveLength(2);
        });
    });
});

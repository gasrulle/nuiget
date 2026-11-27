import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type InstalledPackage, type InstalledResult, type ProjectInstalledChunk, type SessionSnapshot } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { AllProjectsProvider, consolidationUpdates, useAllProjects, sameVersion, versionDrift, type AllProjectsState, type VersionDrift } from './allProjects';
import { useOps, useOpsActions } from './ops';
import { StoreProvider } from './StoreProvider';
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

async function mount(selected: string, prefetchTransitive?: boolean): Promise<FakeHost> {
    const host = createFakeHost();
    render(<MessageBusProvider bus={host.bus}><SessionProvider><AllProjectsProvider prefetchTransitive={prefetchTransitive}><Probe /></AllProjectsProvider></SessionProvider></MessageBusProvider>);
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

    it('two metadata chunks of one project merge: the provisional rows\' first, the rows the evaluation added after it (X43, UX-P4.9)', async () => {
        const host = await mount(ALL_PROJECTS);
        const request = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(request, { kind: 'start', projects: [{ name: 'A', path: A }] }));
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: chunkOf(A, ['Serilog']) }));
        await hostSays(() => host.chunk(request, { kind: 'metadata', projectPath: A, packages: [{ id: 'Serilog', version: '3.0.0', authors: 'Serilog Contributors' }] }));
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: chunkOf(A, ['Serilog', 'Implicit.Sdk']) }));
        await hostSays(() => host.chunk(request, { kind: 'metadata', projectPath: A, packages: [{ id: 'Implicit.Sdk', version: '8.0.0', authors: 'Microsoft' }] }));
        await hostSays(() => host.respond(request, { projectPaths: [A], errored: [] }));
        expect(current.metadata.get(A)?.get('serilog')?.authors).toBe('Serilog Contributors');
        expect(current.metadata.get(A)?.get('implicit.sdk')?.authors).toBe('Microsoft');
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

    describe('settle signals and the eager stream (UX-P5.1a)', () => {
        const frameworks = (ids: string[]) => [{ targetFramework: 'net8.0', packages: ids.map(id => ({ id, version: '1.0.0', requiredByChain: ['Serilog'] })) }];
        const streamChunk = (projectPath: string, ids: string[]) => ({ kind: 'project' as const, chunk: { projectPath, projectName: projectPath.split('/')[2], frameworks: frameworks(ids), dataSourceAvailable: true } });

        it('prefetchTransitive: the stream is asked once after the fan-out answered, without a click, and never without the prop', async () => {
            const eager = await mount(ALL_PROJECTS, true);
            expect(eager.requests('allProjects/transitive')).toHaveLength(0);
            await list(eager, 0, ['Serilog'], ['Moq']);
            expect(eager.requests('allProjects/transitive')).toHaveLength(1);
            expect(current.transitive.enabled).toBe(true);
            // A re-ask of the fan-out asks the stream no second time.
            await hostSays(() => current.refresh());
            await list(eager, 1, ['Serilog'], ['Moq']);
            expect(eager.requests('allProjects/transitive')).toHaveLength(1);
        });

        it('metadataSettled: false until the fan-out answers, false while a re-ask runs, true again on its answer or failure', async () => {
            const host = await mount(ALL_PROJECTS);
            expect(current.metadataSettled).toBe(false);
            await list(host, 0, ['Serilog'], ['Moq']);
            expect(current.metadataSettled).toBe(true);
            await hostSays(() => current.refresh());
            expect(current.metadataSettled).toBe(false);
            await list(host, 1, ['Serilog'], ['Moq']);
            expect(current.metadataSettled).toBe(true);
            await hostSays(() => current.refresh());
            await hostSays(() => host.fail(host.requests('allProjects/installed')[2], 'failed', 'boom'));
            expect(current.metadataSettled).toBe(true);
            // A first request that fails is not settled.
            await hostSays(() => host.event('session/changed', snapshot(2, A)));
            await hostSays(() => host.event('session/changed', snapshot(3, ALL_PROJECTS)));
            await hostSays(() => host.fail(host.requests('allProjects/installed')[3], 'failed', 'boom'));
            expect(current.metadataSettled).toBe(false);
        });

        it('transitive.settled: a failed stream or an empty aggregate settles without a metadata ask', async () => {
            const host = await mount(ALL_PROJECTS);
            await list(host, 0, ['Serilog'], ['Moq']);
            expect(current.transitive.settled).toBe(false);
            await act(async () => current.enableTransitive());
            expect(current.transitive.settled).toBe(false);
            await hostSays(() => host.fail(host.requests('allProjects/transitive')[0], 'failed', 'boom'));
            expect(current.transitive.settled).toBe(true);
            await act(async () => current.transitive.refresh());
            await hostSays(() => host.chunk(host.requests('allProjects/transitive')[1], streamChunk(A, [])));
            await hostSays(() => host.respond(host.requests('allProjects/transitive')[1], { projectPaths: [A], errored: [] }));
            expect(current.transitive.settled).toBe(true);
            expect(host.requests('transitive/metadata')).toHaveLength(0);
        });

        it('transitive.settled: the aggregate settles when its metadata answers or rejects, never by a cancelled ask', async () => {
            const host = await mount(ALL_PROJECTS);
            await list(host, 0, ['Serilog'], ['Moq']);
            await act(async () => current.enableTransitive());
            await hostSays(() => host.chunk(host.requests('allProjects/transitive')[0], streamChunk(A, ['X'])));
            await hostSays(() => host.respond(host.requests('allProjects/transitive')[0], { projectPaths: [A], errored: [] }));
            expect(current.transitive.settled).toBe(false);
            await hostSays(() => host.respond(host.requests('transitive/metadata')[0], { metadata: [{ id: 'X', version: '1.0.0' }] }));
            expect(current.transitive.settled).toBe(true);
            // A newer answer cancels the ask of the one before it; that late answer settles nothing.
            await act(async () => current.transitive.refresh());
            expect(current.transitive.settled).toBe(true);
            await hostSays(() => host.chunk(host.requests('allProjects/transitive')[1], streamChunk(A, ['X', 'Y'])));
            await hostSays(() => host.respond(host.requests('allProjects/transitive')[1], { projectPaths: [A], errored: [] }));
            expect(current.transitive.settled).toBe(false);
            const cancelled = host.requests('transitive/metadata')[1];
            await act(async () => current.transitive.refresh());
            await hostSays(() => host.chunk(host.requests('allProjects/transitive')[2], streamChunk(A, ['X', 'Y', 'Z'])));
            await hostSays(() => host.respond(host.requests('allProjects/transitive')[2], { projectPaths: [A], errored: [] }));
            expect(host.cancelled()).toContain(cancelled.id);
            await hostSays(() => host.respond(cancelled, { metadata: [] }));
            expect(current.transitive.settled).toBe(false);
            await hostSays(() => host.fail(host.requests('transitive/metadata')[2], 'unsupported'));
            expect(current.transitive.settled).toBe(true);
        });

        it('a newer stream answer keeps the answered metadata until its own answer; leaving All Projects drops it', async () => {
            const host = await mount(ALL_PROJECTS);
            await list(host, 0, ['Serilog'], ['Moq']);
            await act(async () => current.enableTransitive());
            await hostSays(() => host.chunk(host.requests('allProjects/transitive')[0], streamChunk(A, ['X'])));
            await hostSays(() => host.respond(host.requests('allProjects/transitive')[0], { projectPaths: [A], errored: [] }));
            await hostSays(() => host.respond(host.requests('transitive/metadata')[0], { metadata: [{ id: 'X', version: '1.0.0', authors: 'Ada' }] }));
            await act(async () => current.transitive.refresh());
            await hostSays(() => host.chunk(host.requests('allProjects/transitive')[1], streamChunk(A, ['X', 'Y'])));
            await hostSays(() => host.respond(host.requests('allProjects/transitive')[1], { projectPaths: [A], errored: [] }));
            expect(current.transitive.metadata.get('x@1.0.0')?.authors).toBe('Ada');
            await hostSays(() => host.respond(host.requests('transitive/metadata')[1], { metadata: [{ id: 'Y', version: '1.0.0', authors: 'Bo' }] }));
            expect([...current.transitive.metadata.keys()].sort()).toEqual(['x@1.0.0', 'y@1.0.0']);
            await hostSays(() => host.event('session/changed', snapshot(2, A)));
            expect(current.transitive.metadata.size).toBe(0);
        });
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

describe('the Consolidate model (UX-P5.3a, F3)', () => {
    const C = '/w/C/C.csproj';
    const projects = [{ name: 'A', path: A }, { name: 'B', path: B }, { name: 'C', path: C }];
    const pkg = (id: string, version: string, more: Partial<InstalledPackage> = {}): InstalledPackage => ({ id, version, versionType: 'standard', declaration: 'project', ...more });
    const listed = (projectPath: string, packages: InstalledPackage[], more: Partial<InstalledResult> = {}): ProjectInstalledChunk => ({
        projectPath, projectName: projectPath.split('/')[2], result: { projectPath, fidelity: 'authoritative', isCpm: false, packages, ...more },
    });
    const ready = (chunks: ProjectInstalledChunk[], status: AllProjectsState['status'] = 'ready') => ({ status, projects, chunks: new Map(chunks.map(chunk => [chunk.projectPath, chunk])) });

    it('lists a package that two projects reference at two versions, by id, with each version\'s projects in project order', () => {
        const drift = versionDrift(ready([
            listed(A, [pkg('Serilog', '3.1.0'), pkg('Moq', '4.20.0')]),
            listed(B, [pkg('serilog', '4.0.0'), pkg('Moq', '4.20.0')]),
            listed(C, [pkg('Serilog', '3.1.0'), pkg('xunit', '2.9.0')]),
        ]));
        expect(drift.complete).toBe(true);
        expect(drift.unread).toEqual([]);
        // Moq agrees, xunit is in one project: neither drifts.
        expect(drift.entries).toEqual([{
            id: 'Serilog',
            versions: [
                { version: '3.1.0', projects: [{ projectPath: A, projectName: 'A' }, { projectPath: C, projectName: 'C' }] },
                { version: '4.0.0', projects: [{ projectPath: B, projectName: 'B' }] },
            ],
            held: [],
            versionCount: 2,
            projectCount: 3,
            inUse: ['3.1.0', '4.0.0'],
        }]);
    });

    it('compares the resolved version, without case or build metadata, and counts a project once per version', () => {
        const drift = versionDrift(ready([
            listed(A, [pkg('Moq', '4.20', { resolvedVersion: '4.20.0' })]),
            listed(B, [pkg('Moq', '4.20.0+build.7')]),
            listed(C, [pkg('Moq', '1.0.0-Beta'), pkg('NUnit', '4.0.0'), pkg('NUnit', '3.14.0', { targetFrameworks: ['net48'] })]),
        ]));
        // 4.20 resolving to 4.20.0 and 4.20.0+build.7 are one version; 1.0.0-Beta is another. NUnit is in C alone: two versions of
        // one project (per target framework) are no drift between projects.
        expect(drift.entries.map(entry => `${entry.id} ${entry.versions.map(at => `${at.version}:${at.projects.map(project => project.projectName).join('+')}`).join(' ')}`)).toEqual(['Moq 4.20.0:A+B 1.0.0-Beta:C']);
    });

    it('holds a central row, an SDK reference and an unresolved one with their reasons; a central-override row joins (N74)', () => {
        const drift = versionDrift(ready([
            listed(A, [pkg('Serilog', '3.1.0', { declaration: 'central', definedIn: '/w/Directory.Packages.props' }), pkg('NETStandard.Library', '2.0.3', { isImplicit: true, declaration: 'props' })], { isCpm: true }),
            listed(B, [pkg('Serilog', '4.0.0', { declaration: 'central-override' }), pkg('NETStandard.Library', '2.0.0', { isImplicit: true, declaration: 'props' })], { isCpm: true }),
            listed(C, [pkg('Serilog', '', { versionType: 'unresolved', declaration: 'unresolved' })]),
        ]));
        expect(drift.entries.map(entry => entry.id)).toEqual(['NETStandard.Library', 'Serilog']);
        const [sdk, serilog] = drift.entries;
        expect(sdk.versions).toEqual([]);
        expect(sdk.held.map(held => held.reason)).toEqual(['NETStandard.Library is added by the .NET SDK', 'NETStandard.Library is added by the .NET SDK']);
        expect(serilog.versions).toEqual([{ version: '4.0.0', projects: [{ projectPath: B, projectName: 'B' }] }]);
        expect(serilog.held).toEqual([
            { projectPath: A, projectName: 'A', version: '3.1.0', reason: 'Serilog is set in the central package file of A' },
            { projectPath: C, projectName: 'C', version: '', reason: 'Serilog cannot be updated: its reference could not be resolved' },
        ]);
        // The central 3.1.0 counts, the unresolved reference adds no version (UX-P5.3b).
        expect(serilog.versionCount).toBe(2);
        expect(serilog.projectCount).toBe(3);
    });

    it('holds a floating, a ranged and a conditioned reference with their reasons; a resolved one counts towards the drift', () => {
        const drift = versionDrift(ready([
            listed(A, [pkg('Serilog', '3.*', { versionType: 'floating', resolvedVersion: '3.1.1' }), pkg('Polly', '8.4.2')]),
            listed(B, [pkg('Serilog', '[4.0.0,5.0.0)', { versionType: 'range', resolvedVersion: '4.0.0' }), pkg('Polly', '8.4.0', { targetFrameworks: ['net48'] })]),
            listed(C, [pkg('Serilog', '3.1.0'), pkg('Polly', '8.4.2')]),
        ]));
        expect(drift.entries.map(entry => entry.id)).toEqual(['Polly', 'Serilog']);
        const [polly, serilog] = drift.entries;
        expect(serilog.versions).toEqual([{ version: '3.1.0', projects: [{ projectPath: C, projectName: 'C' }] }]);
        expect(serilog.held).toEqual([
            { projectPath: A, projectName: 'A', version: '3.1.1', reason: 'Serilog uses a floating version or range in A' },
            { projectPath: B, projectName: 'B', version: '4.0.0', reason: 'Serilog uses a floating version or range in B' },
        ]);
        expect([serilog.versionCount, serilog.projectCount]).toEqual([3, 3]);
        expect(polly.versions).toEqual([{ version: '8.4.2', projects: [{ projectPath: A, projectName: 'A' }, { projectPath: C, projectName: 'C' }] }]);
        expect(polly.held).toEqual([{ projectPath: B, projectName: 'B', version: '8.4.0', reason: 'Polly is referenced for some target frameworks only in B' }]);
        expect([polly.versionCount, polly.projectCount]).toEqual([2, 3]);
        // A held reference is never written: the payload leaves it out.
        expect(consolidationUpdates(serilog, '3.1.1')).toEqual([{ projectPath: C, projectName: 'C', packages: [{ id: 'Serilog', version: '3.1.1' }] }]);
    });

    it('lists each known version in use once, held ones included, and no unknown one', () => {
        const [serilog] = versionDrift(ready([
            listed(A, [pkg('Serilog', '3.1.0', { declaration: 'central', definedIn: '/w/Directory.Packages.props' })], { isCpm: true }),
            listed(B, [pkg('Serilog', '4.0.0+build.1'), pkg('Serilog', '', { versionType: 'unresolved', declaration: 'unresolved' })]),
            listed(C, [pkg('Serilog', '4.0.0'), pkg('Serilog', '3.*', { versionType: 'floating' })]),
        ])).entries;
        // The central 3.1.0 is held and in use; 4.0.0 is one version however written; the unresolved and the unrestored pattern are none.
        expect(serilog.inUse).toEqual(['3.1.0', '4.0.0+build.1']);
        expect(serilog.versionCount).toBe(serilog.inUse.length);
    });

    it('compares versions by the model\'s key: no case, no build metadata (UX-P5.3c)', () => {
        expect(sameVersion('1.0.0-Beta', '1.0.0-beta')).toBe(true);
        expect(sameVersion('4.0.0+build.7', '4.0.0')).toBe(true);
        expect(sameVersion('4.0.0', '4.0.1')).toBe(false);
    });

    it('a reference without a known version is held and adds no version', () => {
        const drift = versionDrift(ready([
            listed(A, [pkg('Serilog', '3.1.1'), pkg('Moq', '4.20.0')]),
            listed(B, [pkg('Serilog', '', { versionType: 'unresolved', declaration: 'unresolved' }), pkg('Moq', '4.*', { versionType: 'floating' })]),
            listed(C, [pkg('xunit', '2.9.0')]),
        ]));
        // One pinned version plus one unknown is no drift: the unresolved Serilog and the unrestored floating Moq add no version.
        expect(drift.entries).toEqual([]);
        const [moq] = versionDrift(ready([
            listed(A, [pkg('Moq', '4.20.0')]),
            listed(B, [pkg('Moq', '4.*', { versionType: 'floating' })]),
            listed(C, [pkg('Moq', '4.18.0')]),
        ])).entries;
        expect(moq.held).toEqual([{ projectPath: B, projectName: 'B', version: '4.*', reason: 'Moq uses a floating version or range in B' }]);
        expect([moq.versionCount, moq.projectCount]).toEqual([2, 3]);
    });

    it('is incomplete, never "no drift", while the lists load, or when a project failed, is unsupported or was not read', () => {
        expect(versionDrift(ready([listed(A, [pkg('Moq', '4.20.0')])], 'loading'))).toEqual({
            complete: false,
            unread: [{ projectPath: B, projectName: 'B', reason: 'Its packages were not read yet.' }, { projectPath: C, projectName: 'C', reason: 'Its packages were not read yet.' }],
            entries: [],
        });
        const drift = versionDrift(ready([
            listed(A, [pkg('Moq', '4.20.0')]),
            { projectPath: B, projectName: 'B', error: 'The project could not be read.' },
            listed(C, [], { unsupported: { reason: 'packages-config', message: 'packages.config projects are not supported.' } }),
        ]));
        expect(drift.complete).toBe(false);
        expect(drift.unread.map(project => `${project.projectName}: ${project.reason}`)).toEqual(['B: The project could not be read.', 'C: packages.config projects are not supported.']);
        expect(versionDrift({ status: 'idle', projects: undefined, chunks: new Map() })).toEqual({ complete: false, unread: [], entries: [] });
    });

    it('builds the bulk payload for the projects at another version, a lower target included, with the source when given', () => {
        const [serilog] = versionDrift(ready([
            listed(A, [pkg('Serilog', '3.1.0')]),
            listed(B, [pkg('Serilog', '4.0.0')]),
            listed(C, [pkg('Serilog', '3.1.0'), pkg('Moq', '4.20.0', { declaration: 'central' })]),
        ])).entries;
        expect(consolidationUpdates(serilog, '4.0.0')).toEqual([
            { projectPath: A, projectName: 'A', packages: [{ id: 'Serilog', version: '4.0.0' }] },
            { projectPath: C, projectName: 'C', packages: [{ id: 'Serilog', version: '4.0.0' }] },
        ]);
        expect(consolidationUpdates(serilog, '3.1.0', 'https://api.nuget.org/v3/index.json')).toEqual([
            { projectPath: B, projectName: 'B', packages: [{ id: 'Serilog', version: '3.1.0', sourceUrl: 'https://api.nuget.org/v3/index.json' }] },
        ]);
    });

    it('a consolidation goes through ops/bulkUpdateAllProjects with the chosen version, marking each project\'s package busy', async () => {
        const host = createFakeHost();
        let seen: { drift: VersionDrift; busy: boolean } | undefined;
        function Consolidate() {
            const all = useAllProjects();
            const ops = useOps();
            const { run } = useOpsActions();
            const drift = versionDrift(all);
            seen = { drift, busy: ops.isPackageBusy(A, 'Serilog') && !ops.isPackageBusy(B, 'Serilog') };
            const entry = drift.entries[0];
            return <button type="button" disabled={entry === undefined} onClick={() => { void run('ops/bulkUpdateAllProjects', { projectUpdates: consolidationUpdates(entry, '4.0.0') }).catch(() => undefined); }}>Consolidate</button>;
        }
        render(<StoreProvider bus={host.bus} prefetch={false}><Consolidate /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, ALL_PROJECTS)));
        const request = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(request, { kind: 'start', projects: [{ name: 'A', path: A }, { name: 'B', path: B }] }));
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: listed(A, [pkg('Serilog', '3.1.0')]) }));
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: listed(B, [pkg('Serilog', '4.0.0')]) }));
        await hostSays(() => host.respond(request, { projectPaths: [A, B], errored: [] }));
        expect(seen?.drift.complete).toBe(true);
        await hostSays(() => screen.getByRole('button', { name: 'Consolidate' }).click());
        expect(host.requests('ops/bulkUpdateAllProjects').map(sent => sent.payload)).toEqual([{ projectUpdates: [{ projectPath: A, projectName: 'A', packages: [{ id: 'Serilog', version: '4.0.0' }] }] }]);
        expect(seen?.busy).toBe(true);
    });
});

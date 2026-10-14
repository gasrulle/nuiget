import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type InstalledResult, type ProjectInstalledChunk, type SessionSnapshot } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { AllProjectsProvider, useAllProjects, type AllProjectsState } from './allProjects';
import { SessionProvider } from './session';

const A = '/w/A/A.csproj';
const B = '/w/B/B.csproj';
const snapshot = (rev: number, selectedProject: string): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
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
});

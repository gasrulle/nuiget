import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProtocolRequestError, resourceKeys, type Project } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { INITIAL_PROJECTS, ProjectsProvider, projectsReducer, useProjects } from './projects';

const project = (name: string): Project => ({ name, path: `/w/${name}/${name}.csproj` });

function Names() {
    const { projects, error } = useProjects();
    return (
        <div>
            <output data-testid="projects">{projects === undefined ? 'unknown' : projects.map(entry => entry.name).join(',') || 'empty'}</output>
            <output data-testid="error">{error?.code ?? 'none'}</output>
        </div>
    );
}

function mount(): { host: FakeHost; unmount: () => void } {
    const host = createFakeHost();
    const view = render(<MessageBusProvider bus={host.bus}><ProjectsProvider><Names /></ProjectsProvider></MessageBusProvider>);
    return { host, unmount: view.unmount };
}

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const text = (testId: string): string => screen.getByTestId(testId).textContent ?? '';

describe('projects slice', () => {
    it('R1: asks projects/list on start; the list is unknown until the host has answered', async () => {
        const { host } = mount();
        expect(host.requests('projects/list')).toHaveLength(1);
        expect(text('projects')).toBe('unknown');
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [project('A'), project('B')] }, 1));
        expect(text('projects')).toBe('A,B');
        // No projects is an answer, not "unknown".
        await hostSays(() => host.event('projects/changed', { projects: [] }));
        expect(text('projects')).toBe('empty');
    });

    it('R2: projects/changed replaces the list as it is, and an invalidation asks for nothing', async () => {
        const { host } = mount();
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [project('A')] }, 1));
        await hostSays(() => host.invalidate([[resourceKeys.projects(), 2]]));
        // The host follows an invalidation of the projects with the new list; the surface does not ask.
        expect(host.requests('projects/list')).toHaveLength(1);
        expect(text('projects')).toBe('A');
        await hostSays(() => host.event('projects/changed', { projects: [project('B'), project('C')] }));
        expect(text('projects')).toBe('B,C');
    });

    it('R7: the answer to the first request is dropped when an invalidation has listed a higher generation', async () => {
        const { host } = mount();
        await hostSays(() => host.invalidate([[resourceKeys.projects(), 2]]));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [project('Old')] }, 1));
        expect(text('projects')).toBe('unknown');
        await hostSays(() => host.event('projects/changed', { projects: [project('A')] }));
        expect(text('projects')).toBe('A');
    });

    it('R7: an answer of the listed generation, without one, or when only other keys were listed is applied', async () => {
        const equal = mount();
        await hostSays(() => equal.host.invalidate([[resourceKeys.projects(), 2]], 77));
        await hostSays(() => equal.host.respond(equal.host.requests('projects/list')[0], { projects: [project('Equal')] }, 2));
        expect(text('projects')).toBe('Equal');
        equal.unmount();

        const unnumbered = mount();
        await hostSays(() => unnumbered.host.invalidate([[resourceKeys.projects(), 2]]));
        await hostSays(() => unnumbered.host.respond(unnumbered.host.requests('projects/list')[0], { projects: [project('Unnumbered')] }));
        expect(text('projects')).toBe('Unnumbered');
        unnumbered.unmount();

        const absent = mount();
        await hostSays(() => absent.host.invalidate([[resourceKeys.installed('/w/A/A.csproj'), 9]]));
        await hostSays(() => absent.host.respond(absent.host.requests('projects/list')[0], { projects: [project('Absent')] }, 1));
        expect(text('projects')).toBe('Absent');
    });

    it('a failed listing is an error until an event brings a list; a list that is shown is not taken away', async () => {
        const { host } = mount();
        await hostSays(() => host.fail(host.requests('projects/list')[0], 'failed'));
        expect(text('projects')).toBe('unknown');
        expect(text('error')).toBe('failed');
        await hostSays(() => host.event('projects/changed', { projects: [project('A')] }));
        expect(text('projects')).toBe('A');
        expect(text('error')).toBe('none');

        const failure = new ProtocolRequestError('failed', 'later');
        const shown = projectsReducer(INITIAL_PROJECTS, { type: 'listed', projects: [project('A')] });
        expect(projectsReducer(shown, { type: 'failed', error: failure })).toBe(shown);
    });

    it('after unmount nothing is listened to', async () => {
        const { host, unmount } = mount();
        const [first] = host.requests('projects/list');
        unmount();
        host.respond(first, { projects: [project('A')] }, 1);
        host.event('projects/changed', { projects: [project('B')] });
        await Promise.resolve();
        expect(() => render(<Names />)).toThrow('useProjects needs a ProjectsProvider above it');
    });
});

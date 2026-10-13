import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type InstalledResult, type SessionSnapshot } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { InstalledProvider, useInstalled } from './installed';
import { SessionProvider, useSessionActions } from './session';

const A = '/w/A/A.csproj';
const B = '/w/B/B.csproj';
const snapshot = (rev: number, selectedProject: string): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const installed = (projectPath: string, ...ids: string[]): InstalledResult => ({
    projectPath, fidelity: 'provisional', isCpm: false,
    packages: ids.map(id => ({ id, version: '1.0.0', versionType: 'standard', declaration: 'project' })),
});

function Packages() {
    const state = useInstalled();
    const { set } = useSessionActions();
    return (
        <div>
            <output data-testid="project">{state.projectPath ?? 'none'}</output>
            <output data-testid="status">{state.status}{state.revalidating ? ' revalidating' : ''}</output>
            <output data-testid="packages">{state.result?.packages.map(entry => entry.id).join(',') ?? 'none'}</output>
            <output data-testid="described">{[...state.metadata].map(([id, entry]) => `${id}=${entry.description}`).join(';') || 'none'}</output>
            <output data-testid="error">{state.error?.code ?? 'none'}</output>
            <button type="button" onClick={() => set({ selectedProject: B })}>Select B</button>
            <button type="button" onClick={state.refresh}>Retry</button>
        </div>
    );
}

function mount(): FakeHost {
    const host = createFakeHost();
    render(<MessageBusProvider bus={host.bus}><SessionProvider><InstalledProvider><Packages /></InstalledProvider></SessionProvider></MessageBusProvider>);
    return host;
}

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const text = (testId: string): string => screen.getByTestId(testId).textContent ?? '';
const asked = (host: FakeHost) => host.requests('installed/get');

describe('installed slice', () => {
    it('R3: asks installed/get when the applied snapshot selects a real project, and for another when it selects another', async () => {
        const host = mount();
        expect(asked(host)).toHaveLength(0);
        expect(text('status')).toBe('idle');
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        expect(asked(host).map(request => request.payload)).toEqual([{ projectPath: A }]);
        await hostSays(() => host.respond(asked(host)[0], installed(A, 'Serilog'), 1));
        expect(text('project')).toBe(A);
        expect(text('packages')).toBe('Serilog');

        // A snapshot that keeps the project asks for nothing.
        await hostSays(() => host.event('session/changed', { ...snapshot(2, A), includePrerelease: true }));
        expect(asked(host)).toHaveLength(1);

        await hostSays(() => host.event('session/changed', snapshot(3, B)));
        expect(asked(host).map(request => request.payload)).toEqual([{ projectPath: A }, { projectPath: B }]);
        // Never A's packages under B.
        expect(text('project')).toBe(B);
        expect(text('packages')).toBe('none');
        await hostSays(() => host.respond(asked(host)[1], installed(B, 'xunit'), 1));
        expect(text('packages')).toBe('xunit');
    });

    it('R3: asks for nothing without a project and in all-projects mode', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, '')));
        expect(text('status')).toBe('idle');
        await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
        expect(text('project')).toBe('none');
        expect(text('status')).toBe('idle');
        expect(asked(host)).toHaveLength(0);
        // And an invalidation of some project's list is none of its business then.
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2], [resourceKeys.projects(), 2]]));
        expect(asked(host)).toHaveLength(0);
    });

    it('R3: follows the committed selection, not a pending one of this surface', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        await hostSays(() => host.respond(asked(host)[0], installed(A, 'Serilog'), 1));
        await hostSays(() => screen.getByRole('button', { name: 'Select B' }).click());
        // The intent is on its way; the host may still answer with another project.
        expect(host.requests('session/set')).toHaveLength(1);
        expect(asked(host)).toHaveLength(1);
        expect(text('packages')).toBe('Serilog');
        await hostSays(() => host.respond(host.requests('session/set')[0], snapshot(2, B)));
        expect(asked(host).at(-1)?.payload).toEqual({ projectPath: B });
    });

    it('R3: asks again when resources/invalidated names the key of the selected project, and only then', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        await hostSays(() => host.respond(asked(host)[0], installed(A, 'Serilog'), 1));
        await hostSays(() => host.invalidate([[resourceKeys.installed(B), 2], [resourceKeys.transitive(A), 2], [resourceKeys.projects(), 2]]));
        expect(asked(host)).toHaveLength(1);
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        expect(asked(host)).toHaveLength(2);
        // Revalidating: the rows stay.
        expect(text('status')).toBe('ready revalidating');
        expect(text('packages')).toBe('Serilog');
        await hostSays(() => host.respond(asked(host)[1], installed(A, 'Serilog', 'Moq'), 2));
        expect(text('packages')).toBe('Serilog,Moq');
        expect(text('status')).toBe('ready');
    });

    it('R4: the answer for the project that was left is dropped', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        const [forA, forB] = asked(host);
        expect(host.cancelled()).toEqual([forA.id]);
        await hostSays(() => host.respond(forB, installed(B, 'xunit'), 1));
        await hostSays(() => host.respond(forA, installed(A, 'Serilog'), 1));
        expect(text('project')).toBe(B);
        expect(text('packages')).toBe('xunit');
    });

    it('R7: a result below the generation listed for the project is not applied', async () => {
        const host = mount();
        // Listed before this surface looked at A.
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 3]]));
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        await hostSays(() => host.respond(asked(host)[0], installed(A, 'Old'), 2));
        expect(text('packages')).toBe('none');
        await hostSays(() => host.respond(asked(host).at(-1)!, installed(A, 'Serilog'), 3));
        expect(text('packages')).toBe('Serilog');
    });

    it('R5: metadata chunks are kept by package id for the project they were asked for', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        const [forA] = asked(host);
        await hostSays(() => host.respond(forA, installed(A, 'Serilog', 'Moq'), 1));
        expect(text('described')).toBe('none');
        // Chunks may come in several parts, before the terminal response of their request.
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        const again = asked(host)[1];
        await hostSays(() => host.chunk(again, { kind: 'metadata', packages: [{ id: 'Serilog', version: '1.0.0', description: 'Logging' }] }));
        await hostSays(() => host.chunk(again, { kind: 'metadata', packages: [{ id: 'MOQ', version: '1.0.0', description: 'Mocks' }] }));
        expect(text('described')).toBe('serilog=Logging;moq=Mocks');
        // A later chunk for the same package replaces the earlier one.
        await hostSays(() => host.chunk(again, { kind: 'metadata', packages: [{ id: 'serilog', version: '1.0.0', description: 'Structured logging' }] }));
        expect(text('described')).toBe('serilog=Structured logging;moq=Mocks');

        // Another project starts with none, and a chunk of the request that was left is not its metadata.
        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        expect(text('described')).toBe('none');
        await hostSays(() => host.chunk(again, { kind: 'metadata', packages: [{ id: 'Late', version: '1.0.0', description: 'Late' }] }));
        expect(text('described')).toBe('none');
        await hostSays(() => host.chunk(asked(host)[2], { kind: 'metadata', packages: [{ id: 'xunit', version: '2.9.0', description: 'Tests' }] }));
        expect(text('described')).toBe('xunit=Tests');
    });

    it('an error ends loading, and Retry asks again', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        await hostSays(() => host.fail(asked(host)[0], 'failed'));
        expect(text('status')).toBe('error');
        expect(text('error')).toBe('failed');
        await hostSays(() => screen.getByRole('button', { name: 'Retry' }).click());
        expect(asked(host)).toHaveLength(2);
        await hostSays(() => host.respond(asked(host)[1], installed(A, 'Serilog'), 1));
        expect(text('status')).toBe('ready');
        expect(text('error')).toBe('none');
    });

    it('the hook fails with a clear message without a provider', () => {
        const host = createFakeHost();
        expect(() => render(<MessageBusProvider bus={host.bus}><SessionProvider><Packages /></SessionProvider></MessageBusProvider>)).toThrow('useInstalled needs an InstalledProvider above it');
    });
});

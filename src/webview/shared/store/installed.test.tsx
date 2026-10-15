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

    it('R5: the provisional chunk of the latest request is shown until its response replaces it, and a chunk of an earlier request or another project is not', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        const [first] = asked(host);
        await hostSays(() => host.chunk(first, { kind: 'provisional', result: installed(A, 'Serilog') }));
        expect(text('packages')).toBe('Serilog');
        expect(text('status')).toBe('loading');
        await hostSays(() => host.respond(first, { ...installed(A, 'Serilog', 'Moq'), fidelity: 'authoritative' }, 1));
        expect(text('packages')).toBe('Serilog,Moq');
        expect(text('status')).toBe('ready');

        // A revalidation streams its own provisional list, shown while the request is unanswered.
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        const second = asked(host)[1];
        expect(text('packages')).toBe('Serilog,Moq');
        await hostSays(() => host.chunk(second, { kind: 'provisional', result: installed(A, 'Moq') }));
        expect(text('packages')).toBe('Moq');
        expect(text('status')).toBe('ready revalidating');

        // Another project: the request that was left is cancelled and its chunk is never shown.
        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        expect(host.cancelled()).toContain(second.id);
        expect(text('packages')).toBe('none');
        await hostSays(() => host.chunk(second, { kind: 'provisional', result: installed(A, 'Late') }));
        expect(text('packages')).toBe('none');
        const forB = asked(host)[2];
        expect(forB.payload).toEqual({ projectPath: B });
        await hostSays(() => host.chunk(forB, { kind: 'provisional', result: installed(B, 'xunit') }));
        expect(text('packages')).toBe('xunit');
        await hostSays(() => host.respond(forB, installed(B, 'xunit', 'Moq'), 1));
        expect(text('packages')).toBe('xunit,Moq');
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

    it('asks transitive/metadata for the concrete versions of the answered list and keeps the answer by id for that project', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        expect(host.requests('transitive/metadata')).toHaveLength(0);
        const list: InstalledResult = {
            projectPath: A, fidelity: 'provisional', isCpm: false,
            packages: [
                { id: 'Serilog', version: '3.*', resolvedVersion: '3.1.1', versionType: 'floating', declaration: 'project' },
                { id: 'Range', version: '[1.0,2.0)', versionType: 'range', declaration: 'project' },
                { id: 'Broken', version: '', versionType: 'standard', declaration: 'unresolved' },
                { id: 'Moq', version: '4.20.0', versionType: 'standard', declaration: 'project' },
            ],
        };
        await hostSays(() => host.respond(host.requests('installed/get')[0], list, 1));

        expect(host.requests('transitive/metadata').map(request => request.payload)).toEqual([{ packages: [{ id: 'Serilog', version: '3.1.1' }, { id: 'Moq', version: '4.20.0' }] }]);
        await hostSays(() => host.respond(host.requests('transitive/metadata')[0], { metadata: [{ id: 'serilog', version: '3.1.1', description: 'Logging' }, { id: 'Moq', version: '4.20.0', description: 'Mocks' }] }));
        expect(text('described')).toBe('serilog=Logging;moq=Mocks');
    });

    it('a newer list or another project cancels the ask; an error answer is no metadata', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        await hostSays(() => host.respond(host.requests('installed/get')[0], installed(A, 'Serilog'), 1));
        const first = host.requests('transitive/metadata')[0];
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        await hostSays(() => host.respond(host.requests('installed/get')[1], installed(A, 'Serilog', 'Moq'), 2));
        expect(host.cancelled()).toContain(first.id);
        await hostSays(() => host.fail(host.requests('transitive/metadata')[1], 'unsupported'));
        expect(text('described')).toBe('none');

        // Another project while an ask is on its way: that ask is cancelled and its answer never lands.
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 3]]));
        await hostSays(() => host.respond(host.requests('installed/get')[2], installed(A, 'Serilog'), 3));
        const pending = host.requests('transitive/metadata')[2];
        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        expect(host.cancelled()).toContain(pending.id);
        await hostSays(() => host.respond(pending, { metadata: [{ id: 'Serilog', version: '1.0.0', description: 'late' }] }));
        expect(text('described')).toBe('none');
    });

    it('asks for the provisional rows at once and again on the response only when the rows differ', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        const [first] = asked(host);
        await hostSays(() => host.chunk(first, { kind: 'provisional', result: installed(A, 'Serilog', 'Moq') }));
        expect(host.requests('transitive/metadata').map(request => request.payload)).toEqual([{ packages: [{ id: 'Serilog', version: '1.0.0' }, { id: 'Moq', version: '1.0.0' }] }]);
        await hostSays(() => host.respond(host.requests('transitive/metadata')[0], { metadata: [{ id: 'Serilog', version: '1.0.0', description: 'Logging' }] }));
        expect(text('described')).toBe('serilog=Logging');

        // The evaluated answer lists the same rows: nothing is asked again and the metadata stays.
        await hostSays(() => host.respond(first, { ...installed(A, 'Serilog', 'Moq'), fidelity: 'authoritative' }, 1));
        expect(host.requests('transitive/metadata')).toHaveLength(1);
        expect(text('described')).toBe('serilog=Logging');

        // The next answer has another row: its rows are asked for.
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        await hostSays(() => host.respond(asked(host)[1], { ...installed(A, 'Serilog', 'Moq', 'xunit'), fidelity: 'authoritative' }, 2));
        expect(host.requests('transitive/metadata')).toHaveLength(2);
        expect(host.requests('transitive/metadata')[1].payload).toEqual({ packages: [{ id: 'Serilog', version: '1.0.0' }, { id: 'Moq', version: '1.0.0' }, { id: 'xunit', version: '1.0.0' }] });
    });
});

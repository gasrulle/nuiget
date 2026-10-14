import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resourceKeys, type SessionSnapshot, type TransitiveResult } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { SessionProvider, useSession } from './session';
import { TransitiveProvider, useTransitive, type TransitiveState } from './transitive';

const A = '/w/A/A.csproj';
const B = '/w/B/B.csproj';
const snapshot = (rev: number, selectedProject = A): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const transitive = (projectPath: string, ids: string[], changes: Partial<TransitiveResult> = {}): TransitiveResult => ({
    projectPath,
    dataSourceAvailable: true,
    frameworks: [{ targetFramework: 'net10.0', packages: ids.map(id => ({ id, version: '1.0.0', requiredByChain: ['Serilog'] })) }],
    ...changes,
});

let current: TransitiveState;
let project: string | undefined;
function Probe() {
    current = useTransitive();
    project = useSession().committed?.selectedProject;
    const ids = current.result?.frameworks.flatMap(framework => framework.packages.map(entry => entry.id)).join(',') || '-';
    return <output data-testid="transitive">{`${current.enabled} ${current.status} ${ids} ${current.revalidating} meta:${current.metadata.size}`}</output>;
}

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const text = (): string => screen.getByTestId('transitive').textContent ?? '';

async function mount(): Promise<FakeHost> {
    const host = createFakeHost();
    render(<MessageBusProvider bus={host.bus}><SessionProvider><TransitiveProvider><Probe /></TransitiveProvider></SessionProvider></MessageBusProvider>);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    return host;
}

describe('transitive slice', () => {
    it('asks nothing until it is enabled, then transitive/get for the committed project', async () => {
        const host = await mount();
        expect(host.requests('transitive/get')).toHaveLength(0);
        expect(text()).toBe('false idle - false meta:0');
        await hostSays(() => current.enable());
        expect(host.requests('transitive/get').map(request => request.payload)).toEqual([{ projectPath: A }]);
        await hostSays(() => host.respond(host.requests('transitive/get')[0], transitive(A, ['Microsoft.Extensions.Logging']), 1));
        expect(text()).toBe('true ready Microsoft.Extensions.Logging false meta:0');
    });

    it('an invalidation of the transitive key asks again and keeps the sections meanwhile', async () => {
        const host = await mount();
        await hostSays(() => current.enable());
        await hostSays(() => host.respond(host.requests('transitive/get')[0], transitive(A, ['X']), 1));
        await hostSays(() => host.invalidate([[resourceKeys.transitive(A), 2]]));
        expect(host.requests('transitive/get')).toHaveLength(2);
        // R3: the rows stay while the new list is on its way.
        expect(text()).toBe('true ready X true meta:0');
        await hostSays(() => host.respond(host.requests('transitive/get')[1], transitive(A, ['X', 'Y']), 2));
        expect(text()).toBe('true ready X,Y false meta:0');
    });

    it('late response is discarded', async () => {
        const host = await mount();
        await hostSays(() => current.enable());
        await hostSays(() => host.invalidate([[resourceKeys.transitive(A), 2]]));
        const [first, second] = host.requests('transitive/get');
        await hostSays(() => host.respond(second, transitive(A, ['New']), 2));
        // R4: the earlier request was cancelled; its answer is not applied.
        await hostSays(() => host.respond(first, transitive(A, ['Old']), 1));
        expect(text()).toBe('true ready New false meta:0');
        expect(host.cancelled()).toContain(first.id);
    });

    it('restore asks transitive/get with forceRestore once and the rows stay until the answer', async () => {
        const host = await mount();
        await hostSays(() => current.enable());
        await hostSays(() => host.respond(host.requests('transitive/get')[0], transitive(A, [], { dataSourceAvailable: false, frameworks: [] }), 1));
        await hostSays(() => current.restore());
        expect(host.requests('transitive/get').map(request => request.payload)).toEqual([{ projectPath: A }, { projectPath: A, forceRestore: true }]);
        expect(text()).toBe('true ready - true meta:0');
        await hostSays(() => host.respond(host.requests('transitive/get')[1], transitive(A, ['X']), 2));
        await hostSays(() => current.refresh());
        // Once: the next request is a plain listing again.
        expect(host.requests('transitive/get')[2].payload).toEqual({ projectPath: A });
        // Restore on a closed section opens it and asks with forceRestore.
        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        await hostSays(() => current.restore());
        expect(host.requests('transitive/get').at(-1)?.payload).toEqual({ projectPath: B, forceRestore: true });
    });

    it('transitive/metadata answering unsupported is no metadata, and the rows come from transitive/get alone', async () => {
        const host = await mount();
        await hostSays(() => current.enable());
        await hostSays(() => host.respond(host.requests('transitive/get')[0], transitive(A, ['X', 'Y']), 1));
        expect(host.requests('transitive/metadata').map(request => request.payload)).toEqual([{ packages: [{ id: 'X', version: '1.0.0' }, { id: 'Y', version: '1.0.0' }] }]);
        await hostSays(() => host.fail(host.requests('transitive/metadata')[0], 'unsupported', 'not yet available'));
        expect(text()).toBe('true ready X,Y false meta:0');
        expect(current.error).toBeUndefined();
        // When the host can answer, the metadata is kept by id and version.
        await hostSays(() => host.invalidate([[resourceKeys.transitive(A), 2]]));
        await hostSays(() => host.respond(host.requests('transitive/get')[1], transitive(A, ['X']), 2));
        await hostSays(() => host.respond(host.requests('transitive/metadata')[1], { metadata: [{ id: 'X', version: '1.0.0', iconUrl: 'https://api.nuget.org/x.png' }] }));
        expect(current.metadata.get('x@1.0.0')?.iconUrl).toBe('https://api.nuget.org/x.png');
    });

    it('another project resets the section to collapsed and asks nothing', async () => {
        const host = await mount();
        await hostSays(() => current.enable());
        await hostSays(() => host.respond(host.requests('transitive/get')[0], transitive(A, ['X']), 1));
        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        expect(project).toBe(B);
        expect([current.projectPath, current.enabled, current.status]).toEqual([B, false, 'idle']);
        expect(text()).toBe('false idle - false meta:0');
        expect(host.requests('transitive/get')).toHaveLength(1);
        // Back to A: closed again until it is opened.
        await hostSays(() => host.event('session/changed', snapshot(3, A)));
        expect(text()).toBe('false idle - false meta:0');
    });
});

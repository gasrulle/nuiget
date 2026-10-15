import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import type { SessionSnapshot } from '../../../protocol';
import { createFakeHost } from '../bus/testSupport';
import { useMessageBus } from '../bus/useMessageBus';
import { useInstalled } from './installed';
import { useOps } from './ops';
import { useProjects } from './projects';
import { useSession } from './session';
import { StoreProvider } from './StoreProvider';

const A = '/w/A/A.csproj';
const snapshot = (rev: number): SessionSnapshot => ({ rev, selectedProject: A, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });

function Everything() {
    useMessageBus();
    const { session } = useSession();
    const { projects } = useProjects();
    const installed = useInstalled();
    const ops = useOps();
    return <output data-testid="all">{`${session?.selectedProject ?? '-'} | ${projects?.map(entry => entry.name).join(',') ?? '-'} | ${installed.result?.packages.map(entry => entry.id).join(',') ?? '-'} | ${ops.isBusy}`}</output>;
}

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

describe('StoreProvider', () => {
    it('R1: on start it asks session/get and projects/list, and nothing else', async () => {
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><Everything /></StoreProvider>);
        // In no particular order: effects of inner providers run first.
        expect(host.sent.map(message => message.kind === 'request' ? message.type : message.kind).sort()).toEqual(['projects/list', 'session/get']);
        expect(screen.getByTestId('all')).toHaveTextContent('- | - | - | false');

        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'A', path: A }] }, 1));
        await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'provisional', isCpm: false, packages: [{ id: 'Serilog', version: '3.0.0', versionType: 'standard', declaration: 'project' }] }, 1));
        expect(screen.getByTestId('all')).toHaveTextContent(`${A} | A | Serilog | false`);
    });

    it('in StrictMode every slice still ends up with the answer to its latest request', async () => {
        // React mounts, unmounts and mounts every effect again in development: each start request is sent twice.
        const host = createFakeHost();
        render(<StrictMode><StoreProvider bus={host.bus}><Everything /></StoreProvider></StrictMode>);
        expect(host.requests('session/get')).toHaveLength(2);
        expect(host.requests('projects/list')).toHaveLength(2);
        await hostSays(() => {
            for (const request of host.requests('session/get')) {
                host.respond(request, snapshot(1));
            }
            for (const request of host.requests('projects/list')) {
                host.respond(request, { projects: [{ name: 'A', path: A }] }, 1);
            }
        });
        const installed = host.requests('installed/get');
        const open = installed.filter(request => !host.cancelled().includes(request.id));
        expect(open).toHaveLength(1);
        await hostSays(() => host.respond(open[0], { projectPath: A, fidelity: 'provisional', isCpm: false, packages: [] }, 1));
        expect(screen.getByTestId('all')).toHaveTextContent(`${A} | A | | false`);
    });
});

describe('StoreProvider slices of P5.4', () => {
    it('mounts the transitive and allProjects slices', async () => {
        const { useTransitive } = await import('./transitive');
        const { useAllProjects } = await import('./allProjects');
        function Slices() {
            const transitive = useTransitive();
            const all = useAllProjects();
            return <output data-testid="slices">{`${transitive.enabled} ${transitive.status} | ${all.active} ${all.status}`}</output>;
        }
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><Slices /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        // Both are there and lazy: nothing asked for a single project with the transitive section closed.
        expect(screen.getByTestId('slices')).toHaveTextContent('false idle | false idle');
        expect(host.requests('transitive/get')).toHaveLength(0);
        expect(host.requests('allProjects/installed')).toHaveLength(0);
    });
});

describe('StoreProvider: every slice (P5.2)', () => {
    it('mounts every slice of ADR-008 and the config slice; reading all of them still asks only session/get and projects/list (R1)', async () => {
        const [{ useAllProjects }, { useConfig }, { useDetails, useDetailsActions }, { useSearch }, { useSessionActions }, { useSources }, { useTransitive }, { useUpdates }, { useOpsActions }] = await Promise.all([
            import('./allProjects'), import('./config'), import('./details'), import('./search'), import('./session'), import('./sources'), import('./transitive'), import('./updates'), import('./ops'),
        ]);
        function AllSlices() {
            const slices = {
                session: useSession(), sessionActions: useSessionActions(), projects: useProjects(), installed: useInstalled(), updates: useUpdates(),
                transitive: useTransitive(), search: useSearch(), details: useDetails(), detailsActions: useDetailsActions(), allProjects: useAllProjects(),
                sources: useSources(), config: useConfig(), ops: useOps(), opsActions: useOpsActions(),
            };
            return <output data-testid="every">{Object.entries(slices).filter(([, value]) => value !== undefined && value !== null).map(([name]) => name).join(',')}</output>;
        }
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><AllSlices /></StoreProvider>);

        expect(screen.getByTestId('every')).toHaveTextContent('session,sessionActions,projects,installed,updates,transitive,search,details,detailsActions,allProjects,sources,config,ops,opsActions');
        expect(host.sent.map(message => message.kind === 'request' ? message.type : message.kind).sort()).toEqual(['projects/list', 'session/get']);
    });
});

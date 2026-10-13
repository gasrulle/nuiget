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

import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resourceKeys, type InstalledResult, type ResourceKey } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider, useMessageBus } from '../bus/useMessageBus';
import { useResource } from './useResource';

const A = '/w/A/A.csproj';
const B = '/w/B/B.csproj';
const keyOf = (projectPath: string): ResourceKey => resourceKeys.installed(projectPath);
const installed = (projectPath: string, ...ids: string[]): InstalledResult => ({
    projectPath, fidelity: 'provisional', isCpm: false,
    packages: ids.map(id => ({ id, version: '1.0.0', versionType: 'standard', declaration: 'project' })),
});

/** Shows everything the hook returns, as a surface would. */
function Installed({ projectPath }: { projectPath: string | null }) {
    const bus = useMessageBus();
    const resource = useResource<InstalledResult>(
        projectPath === null ? null : keyOf(projectPath),
        signal => bus.request('installed/get', { projectPath: projectPath as string }, { signal }),
    );
    return (
        <div>
            <output data-testid="status">{resource.status}{resource.revalidating ? ' revalidating' : ''}</output>
            <output data-testid="packages">{resource.data?.packages.map(entry => entry.id).join(',') ?? 'none'}</output>
            <output data-testid="project">{resource.data?.projectPath ?? 'none'}</output>
            <output data-testid="error">{resource.error?.code ?? 'none'}</output>
            <button type="button" onClick={resource.refresh}>Retry</button>
        </div>
    );
}

function mount(projectPath: string | null) {
    const host = createFakeHost();
    const view = render(<MessageBusProvider bus={host.bus}><Installed projectPath={projectPath} /></MessageBusProvider>);
    const select = (next: string | null): void => view.rerender(<MessageBusProvider bus={host.bus}><Installed projectPath={next} /></MessageBusProvider>);
    return { host, select, unmount: view.unmount };
}

/** The host says something; React and the promises it resolves settle before the test goes on. */
const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const text = (testId: string): string => screen.getByTestId(testId).textContent ?? '';
const asked = (host: FakeHost) => host.requests('installed/get');

describe('useResource', () => {
    it('asks for the resource of its key and shows the answer', async () => {
        const { host } = mount(A);
        expect(asked(host).map(request => request.payload)).toEqual([{ projectPath: A }]);
        expect(text('status')).toBe('loading');
        expect(text('packages')).toBe('none');
        await hostSays(() => host.respond(asked(host)[0], installed(A, 'Serilog'), 1));
        expect(text('status')).toBe('ready');
        expect(text('packages')).toBe('Serilog');
    });

    it('late response is discarded', async () => {
        // R4, same key: an invalidation makes the surface ask again; the answer to the first request arrives after.
        const { host, select } = mount(A);
        await hostSays(() => host.invalidate([[keyOf(A), 2]]));
        const [first, second] = asked(host);
        await hostSays(() => host.respond(second, installed(A, 'Serilog', 'Moq'), 2));
        // Also when it claims a generation that is not behind: it is the answer to an earlier request.
        await hostSays(() => host.respond(first, installed(A, 'Serilog'), 2));
        expect(text('packages')).toBe('Serilog,Moq');
        expect(text('status')).toBe('ready');

        // R4, another key: the selection moved from A to B; A's answer arrives while B is still on its way, and after.
        select(B);
        await hostSays(() => host.invalidate([[keyOf(A), 3]]));
        const forB = asked(host).at(-1);
        expect(forB?.payload).toEqual({ projectPath: B });
        await hostSays(() => host.respond(second, installed(A, 'Late'), 3));
        expect(text('packages')).toBe('none');
        expect(text('status')).toBe('loading');
        await hostSays(() => host.respond(forB!, installed(B, 'xunit'), 1));
        await hostSays(() => host.respond(first, installed(A, 'Later'), 9));
        expect(text('project')).toBe(B);
        expect(text('packages')).toBe('xunit');
    });

    it('R4: an earlier answer is dropped by the hook itself, also when the requester does not pass the signal on', async () => {
        const host = createFakeHost();
        function Unsignalled() {
            const bus = useMessageBus();
            const resource = useResource<InstalledResult>(keyOf(A), () => bus.request('installed/get', { projectPath: A }));
            return <output data-testid="packages">{resource.data?.packages.map(entry => entry.id).join(',') ?? 'none'}</output>;
        }
        render(<MessageBusProvider bus={host.bus}><Unsignalled /></MessageBusProvider>);
        await hostSays(() => host.invalidate([[keyOf(A), 2]]));
        const [first, second] = asked(host);
        // Nothing was cancelled, so the bus delivers both answers; the earlier one in either order is not shown.
        expect(host.cancelled()).toEqual([]);
        await hostSays(() => host.respond(first, installed(A, 'Early'), 2));
        expect(text('packages')).toBe('none');
        await hostSays(() => host.respond(second, installed(A, 'Serilog'), 2));
        expect(text('packages')).toBe('Serilog');
    });

    it('R4: the answer for a key that was left does not replace what the new key shows, also without the signal', async () => {
        const host = createFakeHost();
        function Unsignalled({ projectPath }: { projectPath: string }) {
            const bus = useMessageBus();
            const resource = useResource<InstalledResult>(keyOf(projectPath), () => bus.request('installed/get', { projectPath }));
            return <output data-testid="packages">{`${resource.status}:${resource.data?.packages.map(entry => entry.id).join(',') ?? 'none'}`}</output>;
        }
        const view = render(<MessageBusProvider bus={host.bus}><Unsignalled projectPath={A} /></MessageBusProvider>);
        view.rerender(<MessageBusProvider bus={host.bus}><Unsignalled projectPath={B} /></MessageBusProvider>);
        const [forA, forB] = asked(host);
        await hostSays(() => host.respond(forB, installed(B, 'xunit'), 1));
        // A's answer arrives last: B's packages stay, they are not replaced and not lost.
        await hostSays(() => host.respond(forA, installed(A, 'Serilog'), 1));
        expect(text('packages')).toBe('ready:xunit');
    });

    it('invalidated key re-requests', async () => {
        // R3: again when `resources/invalidated` names the key, and what is shown stays until the answer.
        const { host } = mount(A);
        await hostSays(() => host.respond(asked(host)[0], installed(A, 'Serilog'), 1));
        await hostSays(() => host.invalidate([[keyOf(B), 5], [keyOf(A), 2]]));
        expect(asked(host)).toHaveLength(2);
        expect(asked(host)[1].payload).toEqual({ projectPath: A });
        // The first request was answered: there is nothing to cancel.
        expect(host.cancelled()).toEqual([]);
        expect(text('status')).toBe('ready revalidating');
        expect(text('packages')).toBe('Serilog');
        await hostSays(() => host.respond(asked(host)[1], installed(A, 'Serilog', 'Moq'), 2));
        expect(text('status')).toBe('ready');
        expect(text('packages')).toBe('Serilog,Moq');
    });

    it('R3: an event that does not name the key asks for nothing', async () => {
        const { host } = mount(A);
        await hostSays(() => host.respond(asked(host)[0], installed(A, 'Serilog'), 1));
        await hostSays(() => host.invalidate([[keyOf(B), 2], [resourceKeys.projects(), 2], [resourceKeys.transitive(A), 2]]));
        await hostSays(() => host.invalidate([]));
        expect(asked(host)).toHaveLength(1);
        expect(text('status')).toBe('ready');
    });

    it('R3: an invalidation while the first request is on its way cancels it and asks again', async () => {
        const { host } = mount(A);
        await hostSays(() => host.invalidate([[keyOf(A), 2]]));
        const [first, second] = asked(host);
        expect(host.cancelled()).toEqual([first.id]);
        expect(text('status')).toBe('loading');
        await hostSays(() => host.respond(second, installed(A, 'Serilog'), 2));
        expect(text('packages')).toBe('Serilog');
    });

    it('R7: an answer below the generation listed for its key is not applied', async () => {
        // The event listed generation 3 for A before this surface looked at A; the answer it then gets is of 2.
        const { host, select } = mount(null);
        await hostSays(() => host.invalidate([[keyOf(A), 3]]));
        select(A);
        await hostSays(() => host.respond(asked(host)[0], installed(A, 'Old'), 2));
        expect(text('packages')).toBe('none');
        // Nothing newer was on its way, so the surface asks once more instead of waiting for ever.
        expect(asked(host)).toHaveLength(2);
        expect(text('status')).toBe('loading');
        await hostSays(() => host.respond(asked(host)[1], installed(A, 'Serilog'), 3));
        expect(text('packages')).toBe('Serilog');
        expect(text('status')).toBe('ready');
    });

    it('R7: a second out-of-date answer for the same listing ends the wait as an error', async () => {
        const { host, select } = mount(null);
        await hostSays(() => host.invalidate([[keyOf(A), 3]]));
        select(A);
        await hostSays(() => host.respond(asked(host)[0], installed(A, 'Old'), 2));
        await hostSays(() => host.respond(asked(host)[1], installed(A, 'Old'), 2));
        expect(asked(host)).toHaveLength(2);
        expect(text('status')).toBe('error');
        expect(text('error')).toBe('failed');
        expect(text('packages')).toBe('none');
    });

    it('R7: an answer of the listed generation, of a higher one, without one, or for a key no event has named is applied', async () => {
        const { host, select } = mount(null);
        // The number of the event (99) is a sequence number: an answer of generation 4 is not behind it.
        await hostSays(() => host.invalidate([[keyOf(A), 4]], 99));
        select(A);
        await hostSays(() => host.respond(asked(host).at(-1)!, installed(A, 'Equal'), 4));
        expect(text('packages')).toBe('Equal');

        await hostSays(() => host.invalidate([[keyOf(A), 5]], 100));
        await hostSays(() => host.respond(asked(host).at(-1)!, installed(A, 'Higher'), 6));
        expect(text('packages')).toBe('Higher');

        await hostSays(() => host.invalidate([[keyOf(A), 7]], 101));
        await hostSays(() => host.respond(asked(host).at(-1)!, installed(A, 'Unnumbered')));
        expect(text('packages')).toBe('Unnumbered');

        // B was never named by an event: nothing to be behind.
        select(B);
        await hostSays(() => host.respond(asked(host).at(-1)!, installed(B, 'Absent'), 1));
        expect(text('packages')).toBe('Absent');
        expect(text('error')).toBe('none');
    });

    it('a key change cancels the request on its way and shows nothing of the previous key', async () => {
        const { host, select } = mount(A);
        await hostSays(() => host.respond(asked(host)[0], installed(A, 'Serilog'), 1));
        await hostSays(() => host.invalidate([[keyOf(A), 2]]));
        select(B);
        // In the very render of the change, before any answer: not A's packages under B's name.
        expect(text('packages')).toBe('none');
        expect(text('status')).toBe('loading');
        expect(host.cancelled()).toEqual([asked(host)[1].id]);
        expect(asked(host).at(-1)?.payload).toEqual({ projectPath: B });
        // Back to A: asked anew, not shown from before.
        select(A);
        expect(text('packages')).toBe('none');
        expect(asked(host).at(-1)?.payload).toEqual({ projectPath: A });
        expect(asked(host)).toHaveLength(4);
    });

    it('no render ever pairs a key with the data of another key', async () => {
        const host = createFakeHost();
        const seen: string[] = [];
        function Logged({ projectPath }: { projectPath: string }) {
            const bus = useMessageBus();
            const resource = useResource<InstalledResult>(keyOf(projectPath), signal => bus.request('installed/get', { projectPath }, { signal }));
            // Every render, also the one between the change of the key and the start of its request.
            seen.push(`${projectPath} shows ${resource.data?.projectPath ?? 'nothing'} (${resource.status})`);
            return null;
        }
        const view = render(<MessageBusProvider bus={host.bus}><Logged projectPath={A} /></MessageBusProvider>);
        await hostSays(() => host.respond(asked(host)[0], installed(A, 'Serilog'), 1));
        view.rerender(<MessageBusProvider bus={host.bus}><Logged projectPath={B} /></MessageBusProvider>);
        await hostSays(() => host.respond(asked(host)[1], installed(B, 'xunit'), 1));
        expect(seen).toContain(`${A} shows ${A} (ready)`);
        expect(seen).toContain(`${B} shows ${B} (ready)`);
        expect(seen.filter(line => line.startsWith(`${B} shows ${A}`))).toEqual([]);
        expect(seen.filter(line => line.startsWith(B) && line.includes('nothing') && !line.endsWith('(loading)'))).toEqual([]);
    });

    it('without a key it is idle, asks for nothing and forgets what it showed', async () => {
        const { host, select } = mount(null);
        expect(text('status')).toBe('idle');
        expect(host.sent).toEqual([]);
        await hostSays(() => host.invalidate([[keyOf(A), 2]]));
        expect(host.sent).toEqual([]);
        select(A);
        await hostSays(() => host.respond(asked(host)[0], installed(A, 'Serilog'), 2));
        select(null);
        expect(text('status')).toBe('idle');
        expect(text('packages')).toBe('none');
    });

    it('an error ends loading; a list that is shown stays, and Retry asks again', async () => {
        const { host } = mount(A);
        await hostSays(() => host.fail(asked(host)[0], 'failed', 'dotnet exited with 1'));
        expect(text('status')).toBe('error');
        expect(text('error')).toBe('failed');

        await hostSays(() => screen.getByRole('button', { name: 'Retry' }).click());
        expect(asked(host)).toHaveLength(2);
        expect(text('status')).toBe('loading');
        expect(text('error')).toBe('none');
        await hostSays(() => host.respond(asked(host)[1], installed(A, 'Serilog'), 1));
        expect(text('status')).toBe('ready');

        // A failed revalidation leaves the list and says what went wrong.
        await hostSays(() => host.invalidate([[keyOf(A), 2]]));
        await hostSays(() => host.fail(asked(host)[2], 'not-found', 'The project is gone'));
        expect(text('status')).toBe('ready');
        expect(text('packages')).toBe('Serilog');
        expect(text('error')).toBe('not-found');
    });

    it('unmounting cancels the request on its way and stops listening', async () => {
        const { host, unmount } = mount(A);
        const [first] = asked(host);
        unmount();
        expect(host.cancelled()).toEqual([first.id]);
        host.invalidate([[keyOf(A), 2]]);
        host.respond(first, installed(A, 'Serilog'), 1);
        await Promise.resolve();
        expect(asked(host)).toHaveLength(1);
    });
});

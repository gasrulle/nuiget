import { describe, expect, it, vi } from 'vitest';
import { makeOk, ProtocolRequestError, resourceKeys, type SessionSnapshot } from '../../../protocol';
import { createMessageBus } from './MessageBus';
import { createFakeHost } from './testSupport';

const snapshot = (rev: number): SessionSnapshot => ({ rev, selectedProject: '/w/A/A.csproj', selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const outcome = (promise: Promise<unknown>): Promise<unknown> => promise.then(value => ({ resolved: value }), (error: unknown) => ({ rejected: error }));

describe('message bus', () => {
    it('a request is posted as a request envelope and resolves with the result and the generation of its response', async () => {
        const host = createFakeHost();
        const listing = host.bus.request('projects/list', {});
        const session = host.bus.request('session/get', {});
        const [first, second] = host.sent;
        expect(first).toEqual({ kind: 'request', id: expect.any(String), type: 'projects/list', payload: {} });
        expect(second.id).not.toBe(first.id);

        // Answered in the other order: each response finds its own request.
        host.respond(host.requests('session/get')[0], snapshot(3));
        host.respond(host.requests('projects/list')[0], { projects: [] }, 7);
        expect(await session).toEqual({ result: snapshot(3), generation: undefined });
        expect(await listing).toEqual({ result: { projects: [] }, generation: 7 });
    });

    it('R5: an error response rejects with its code, message and details', async () => {
        const host = createFakeHost();
        const request = host.bus.request('ops/remove', { projectPath: '/w/A/A.csproj', packageId: 'Serilog' });
        host.deliver({ kind: 'response', id: host.sent[0].id, type: 'ops/remove', ok: false, error: { code: 'queue-full', message: 'Five operations are waiting', details: { waiting: 5 } } });
        const error = await request.then(() => undefined, (reason: unknown) => reason);
        expect(error).toBeInstanceOf(ProtocolRequestError);
        expect(error).toMatchObject({ code: 'queue-full', message: 'Five operations are waiting', details: { waiting: 5 } });
    });

    it('R5: chunks reach onChunk until the terminal response, and only those of their own request', async () => {
        const host = createFakeHost();
        const chunks: unknown[] = [];
        const other: unknown[] = [];
        const request = host.bus.request('installed/get', { projectPath: '/w/A/A.csproj' }, { onChunk: chunk => chunks.push(chunk) });
        void host.bus.request('installed/get', { projectPath: '/w/B/B.csproj' }, { onChunk: chunk => other.push(chunk) });
        const [forA] = host.requests('installed/get');
        host.chunk(forA, { kind: 'provisional', result: { projectPath: '/w/A/A.csproj', fidelity: 'provisional', isCpm: false, packages: [{ id: 'Serilog', version: '3.0.0', versionType: 'standard', declaration: 'project' }] } });
        host.respond(forA, { projectPath: '/w/A/A.csproj', fidelity: 'provisional', isCpm: false, packages: [] }, 1);
        // After the terminal response nothing of this request is delivered any more.
        host.chunk(forA, { kind: 'provisional', result: { projectPath: '/w/A/A.csproj', fidelity: 'provisional', isCpm: false, packages: [{ id: 'Late', version: '1.0.0', versionType: 'standard', declaration: 'project' }] } });
        await request;
        expect(chunks).toEqual([{ kind: 'provisional', result: { projectPath: '/w/A/A.csproj', fidelity: 'provisional', isCpm: false, packages: [{ id: 'Serilog', version: '3.0.0', versionType: 'standard', declaration: 'project' }] } }]);
        expect(other).toEqual([]);
    });

    it('a second response for an answered request and a response nobody asked for are dropped', async () => {
        const host = createFakeHost();
        const request = host.bus.request('session/get', {});
        const [sent] = host.requests('session/get');
        host.respond(sent, snapshot(1));
        host.respond(sent, snapshot(2));
        host.deliver(makeOk('r-not-ours', 'session/get', snapshot(9)));
        expect((await request).result.rev).toBe(1);
    });

    it('a cancelled request tells the host, rejects once, and the late response of the host is dropped', async () => {
        const host = createFakeHost();
        const controller = new AbortController();
        const chunks: unknown[] = [];
        const settled = vi.fn();
        const request = host.bus.request('installed/get', { projectPath: '/w/A/A.csproj' }, { signal: controller.signal, onChunk: chunk => chunks.push(chunk) });
        void request.then(settled, settled);
        const [sent] = host.requests('installed/get');

        controller.abort();
        expect(host.cancelled()).toEqual([sent.id]);
        expect(await outcome(request)).toEqual({ rejected: expect.objectContaining({ code: 'cancelled' }) });

        // The host answers every request, a cancelled one with `cancelled` (ADR-007), or with the result it had ready.
        host.chunk(sent, { kind: 'provisional', result: { projectPath: '/w/A/A.csproj', fidelity: 'provisional', isCpm: false, packages: [] } });
        host.fail(sent, 'cancelled');
        host.respond(sent, { projectPath: '/w/A/A.csproj', fidelity: 'provisional', isCpm: false, packages: [] }, 1);
        await Promise.resolve();
        expect(settled).toHaveBeenCalledTimes(1);
        expect(chunks).toEqual([]);
        // Aborting again says nothing more to the host.
        controller.abort();
        expect(host.cancelled()).toEqual([sent.id]);
    });

    it('a signal that is aborted already sends nothing, and an abort after the answer sends no cancel', async () => {
        const host = createFakeHost();
        const aborted = new AbortController();
        aborted.abort();
        expect(await outcome(host.bus.request('session/get', {}, { signal: aborted.signal }))).toEqual({ rejected: expect.objectContaining({ code: 'cancelled' }) });
        expect(host.sent).toEqual([]);

        const controller = new AbortController();
        const request = host.bus.request('session/get', {}, { signal: controller.signal });
        host.respond(host.requests('session/get')[0], snapshot(1));
        await request;
        controller.abort();
        expect(host.cancelled()).toEqual([]);
    });

    it('what is no envelope of the protocol is ignored', async () => {
        const host = createFakeHost();
        const handler = vi.fn();
        host.bus.onEvent('session/changed', handler);
        const request = host.bus.request('session/get', {});
        const [sent] = host.requests('session/get');
        for (const junk of [undefined, null, 'text', 42, {}, { kind: 'event', type: 'not/an-event', payload: {} }, { kind: 'response', id: sent.id, type: 'session/get', ok: true }, { kind: 'response', id: sent.id, type: 'nope', ok: true, result: snapshot(5) }]) {
            host.deliver(junk);
        }
        expect(handler).not.toHaveBeenCalled();
        host.respond(sent, snapshot(1));
        expect((await request).result.rev).toBe(1);
    });

    it('an event reaches every handler of its type until the handler is removed', () => {
        const host = createFakeHost();
        const first = vi.fn();
        const second = vi.fn();
        const other = vi.fn();
        const removeFirst = host.bus.onEvent('session/changed', first);
        host.bus.onEvent('session/changed', second);
        host.bus.onEvent('projects/changed', other);
        host.event('session/changed', snapshot(2));
        removeFirst();
        host.event('session/changed', snapshot(3));
        expect(first.mock.calls).toEqual([[snapshot(2)]]);
        expect(second.mock.calls).toEqual([[snapshot(2)], [snapshot(3)]]);
        expect(other).not.toHaveBeenCalled();
    });

    it('a handler that removes itself or another while an event is delivered does not disturb the delivery', () => {
        const host = createFakeHost();
        const calls: string[] = [];
        const removeFirst = host.bus.onEvent('ui/focusSearch', () => {
            calls.push('first');
            removeFirst();
        });
        host.bus.onEvent('ui/focusSearch', () => calls.push('second'));
        host.event('ui/focusSearch', {});
        host.event('ui/focusSearch', {});
        expect(calls).toEqual(['first', 'second', 'second']);
    });

    it('R7: the listed generation of a key is the one of the latest event that names it, never the number of the event', () => {
        const host = createFakeHost();
        const [A, B] = [resourceKeys.installed('/w/A/A.csproj'), resourceKeys.installed('/w/B/B.csproj')];
        expect(host.bus.listedGeneration(A)).toBeUndefined();
        host.invalidate([[A, 2], [resourceKeys.projects(), 5]], 41);
        expect(host.bus.listedGeneration(A)).toBe(2);
        expect(host.bus.listedGeneration(resourceKeys.projects())).toBe(5);
        // An event that does not name a key says nothing about it.
        host.invalidate([[B, 9]], 42);
        expect(host.bus.listedGeneration(A)).toBe(2);
        expect(host.bus.listedGeneration(B)).toBe(9);
        host.invalidate([[A, 3]], 43);
        expect(host.bus.listedGeneration(A)).toBe(3);
    });

    it('R7: the listing is updated before the handlers of the event run', () => {
        const host = createFakeHost();
        const key = resourceKeys.installed('/w/A/A.csproj');
        const seen: Array<number | undefined> = [];
        host.bus.onEvent('resources/invalidated', () => seen.push(host.bus.listedGeneration(key)));
        host.invalidate([[key, 4]]);
        expect(seen).toEqual([4]);
    });

    it('dispose stops listening and rejects what is waiting with disposed', async () => {
        const host = createFakeHost();
        const handler = vi.fn();
        host.bus.onEvent('session/changed', handler);
        const waiting = host.bus.request('session/get', {});
        const [sent] = host.requests('session/get');
        host.bus.dispose();
        host.bus.dispose();
        expect(await outcome(waiting)).toEqual({ rejected: expect.objectContaining({ code: 'disposed' }) });
        host.respond(sent, snapshot(1));
        host.event('session/changed', snapshot(2));
        expect(handler).not.toHaveBeenCalled();
        expect(await outcome(host.bus.request('session/get', {}))).toEqual({ rejected: expect.objectContaining({ code: 'disposed' }) });
        expect(host.sent).toHaveLength(1);
    });

    it('dispose removes the very listener it added', () => {
        const added: unknown[] = [];
        const removed: unknown[] = [];
        const bus = createMessageBus({ postMessage: () => undefined }, {
            addEventListener: (type, listener) => added.push([type, listener]),
            removeEventListener: (type, listener) => removed.push([type, listener]),
        });
        expect(added).toHaveLength(1);
        expect(removed).toEqual([]);
        bus.dispose();
        expect(removed).toEqual(added);
    });

    it('listens on the window when no other source is given', async () => {
        const posted: unknown[] = [];
        const bus = createMessageBus({ postMessage: message => posted.push(message) });
        const request = bus.request('session/get', {});
        window.dispatchEvent(new MessageEvent('message', { data: makeOk((posted[0] as { id: string }).id, 'session/get', snapshot(4)) }));
        expect((await request).result.rev).toBe(4);
        bus.dispose();
    });
});

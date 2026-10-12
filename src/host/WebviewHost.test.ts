import { describe, expect, it, vi } from 'vitest';
import { makeCancel, makeRequest, type OutboundEnvelope, type RequestResult } from '../protocol';
import { ABORT_CANCELLED, ABORT_DISPOSED, HostRequestError, WebviewHost, type WebviewLike } from './WebviewHost';

class TestHost extends WebviewHost {
    public readonly sent: OutboundEnvelope[] = [];
    // Not named `webview`: the base class has a private member of that name, and the type checker refuses the clash.
    public readonly page: WebviewLike = { postMessage: (m: unknown) => { this.sent.push(m as OutboundEnvelope); return true; } };

    constructor() {
        super('main');
        this.attach(this.page);
        this.on('projects/list', async () => ({ projects: [{ name: 'A', path: '/a.csproj' }] }));
        this.on('package/readme', async () => { throw new Error('boom'); });
        this.on('sources/configFiles', async () => { throw new HostRequestError('not-found', 'no config'); });
        this.on('updates/get', async (payload, ctx) => {
            ctx.emit({ kind: 'found', update: { id: 'X', installedVersion: '1.0.0', latestVersion: '2.0.0' } });
            await new Promise<void>((resolve, reject) => {
                ctx.signal.addEventListener('abort', () => reject(new Error('aborted')));
                setTimeout(resolve, 20);
            });
            return { projectPath: payload.projectPath, updates: [] } satisfies RequestResult<'updates/get'>;
        });
    }

    receiveRaw(raw: unknown): Promise<void> { return this.receive(raw); }
    detachNow(): void { this.detach(); }
}

const responses = (host: TestHost) => host.sent.filter(m => m.kind === 'response');

describe('WebviewHost', () => {
    it('answers a request with exactly one ok response', async () => {
        const host = new TestHost();
        await host.receiveRaw(makeRequest('projects/list', {}, 'r1'));
        expect(responses(host)).toEqual([{ kind: 'response', id: 'r1', type: 'projects/list', ok: true, result: { projects: [{ name: 'A', path: '/a.csproj' }] } }]);
        expect(host.inFlightCount).toBe(0);
    });

    it('turns a thrown error into a failed response and a HostRequestError into its code', async () => {
        const host = new TestHost();
        await host.receiveRaw(makeRequest('package/readme', { packageId: 'x', version: '1' }, 'r2'));
        await host.receiveRaw(makeRequest('sources/configFiles', {}, 'r3'));
        expect(responses(host)).toEqual([
            { kind: 'response', id: 'r2', type: 'package/readme', ok: false, error: { code: 'failed', message: 'boom' } },
            { kind: 'response', id: 'r3', type: 'sources/configFiles', ok: false, error: { code: 'not-found', message: 'no config', details: undefined } },
        ]);
    });

    it('rejects unsupported request types and ignores malformed messages', async () => {
        const host = new TestHost();
        await host.receiveRaw(makeRequest('ui/contextMenu', { packageId: 'x', context: 'browse', projectPath: '' }, 'r4'));
        await host.receiveRaw({ type: 'getProjects' });
        await host.receiveRaw(null);
        expect(responses(host)).toHaveLength(1);
        expect(responses(host)[0]).toMatchObject({ id: 'r4', ok: false, error: { code: 'unsupported' } });
    });

    it('streams chunks before the terminal response', async () => {
        const host = new TestHost();
        await host.receiveRaw(makeRequest('updates/get', { projectPath: '/a.csproj', includePrerelease: false }, 'r5'));
        expect(host.sent.map(m => m.kind)).toEqual(['stream', 'response']);
        expect(host.sent[0]).toMatchObject({ kind: 'stream', id: 'r5', chunk: { kind: 'found' } });
        expect(host.sent[1]).toMatchObject({ kind: 'response', id: 'r5', ok: true });
    });

    it('cancel yields a cancelled response and suppresses late chunks', async () => {
        const host = new TestHost();
        const pending = host.receiveRaw(makeRequest('updates/get', { projectPath: '/a.csproj', includePrerelease: false }, 'r6'));
        await host.receiveRaw(makeCancel('r6'));
        await pending;
        const terminal = responses(host);
        expect(terminal).toHaveLength(1);
        expect(terminal[0]).toMatchObject({ id: 'r6', ok: false, error: { code: 'cancelled' } });
        expect(host.inFlightCount).toBe(0);
    });

    it('detach aborts in-flight requests and stops posting', async () => {
        const host = new TestHost();
        const pending = host.receiveRaw(makeRequest('updates/get', { projectPath: '/a.csproj', includePrerelease: false }, 'r7'));
        host.detachNow();
        await pending;
        expect(host.isAttached).toBe(false);
        expect(responses(host)).toHaveLength(0);
        host.sendEvent('ui/focusSearch', {});
        expect(host.sent.filter(m => m.kind === 'event')).toHaveLength(0);
    });

    it('sendEvent posts an event envelope and tolerates postMessage failures', () => {
        const host = new TestHost();
        host.sendEvent('ui/focusSearch', {});
        expect(host.sent.at(-1)).toEqual({ kind: 'event', type: 'ui/focusSearch', payload: {} });
        const failing = new TestHost();
        vi.spyOn(failing.page, 'postMessage').mockImplementation(() => { throw new Error('gone'); });
        expect(() => failing.sendEvent('ui/focusSearch', {})).not.toThrow();
    });

    it('detach aborts with reason disposed and cancel with reason cancelled', async () => {
        const host = new TestHost();
        const reasons: unknown[] = [];
        host.on('installed/get', (payload, ctx) => new Promise((_resolve, reject) => {
            ctx.signal.addEventListener('abort', () => { reasons.push(ctx.signal.reason); reject(new Error('aborted')); });
        }));
        const cancelled = host.receiveRaw(makeRequest('installed/get', { projectPath: '/a.csproj' }, 'c1'));
        await host.receiveRaw(makeCancel('c1'));
        await cancelled;
        expect(reasons).toEqual([ABORT_CANCELLED]);
        expect(responses(host)).toEqual([{ kind: 'response', id: 'c1', type: 'installed/get', ok: false, error: { code: 'cancelled', message: 'Request was cancelled' } }]);

        const disposed = host.receiveRaw(makeRequest('installed/get', { projectPath: '/a.csproj' }, 'd1'));
        host.detachNow();
        await disposed;
        expect(reasons).toEqual([ABORT_CANCELLED, ABORT_DISPOSED]);
        expect([ABORT_CANCELLED, ABORT_DISPOSED]).toEqual(['cancelled', 'disposed']);
        // A cancel for a request that already ended is ignored.
        await host.receiveRaw(makeCancel('d1'));
        expect(responses(host)).toHaveLength(1);
        expect(host.inFlightCount).toBe(0);
    });

    it('an error whose code is not-yet-available answers unsupported', async () => {
        const host = new TestHost();
        host.on('package/versions', async () => { throw Object.assign(new Error('not-yet-available: Catalog.versions'), { code: 'not-yet-available' }); });
        host.on('package/metadata', async () => { throw Object.assign(new Error('some other failure'), { code: 'ENOENT' }); });
        await host.receiveRaw(makeRequest('package/versions', { packageId: 'x', includePrerelease: false }, 'u1'));
        await host.receiveRaw(makeRequest('package/metadata', { packageId: 'x', version: '1' }, 'u2'));
        expect(responses(host)).toEqual([
            { kind: 'response', id: 'u1', type: 'package/versions', ok: false, error: { code: 'unsupported', message: 'not-yet-available: Catalog.versions' } },
            { kind: 'response', id: 'u2', type: 'package/metadata', ok: false, error: { code: 'failed', message: 'some other failure' } },
        ]);
    });
});

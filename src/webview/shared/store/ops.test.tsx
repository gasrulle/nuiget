import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BulkOutcome, OperationOutcome, OperationProgress } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { busyPackages, INITIAL_OPS, isBulkOutcome, OpsProvider, opsReducer, touchedBy, useOps, useOpsActions, type OpsState } from './ops';

const A = '/w/A/A.csproj';
const B = '/w/B/B.csproj';
const progress = (opId: string, status: OperationProgress['status'], more: Partial<OperationProgress> = {}): OperationProgress => ({ opId, status, ...more });
const removed = (opId: string, status: OperationOutcome['status'] = 'completed'): OperationOutcome => ({ opId, kind: 'remove', status, projectPath: A, packageId: 'Serilog' });
const bulk = (opId: string): BulkOutcome => ({ opId, status: 'partial', results: [removed(`${opId}-1`), removed(`${opId}-2`, 'failed')], restores: [] });

let renders = 0;
let lastRun: Promise<unknown> | undefined;

function Surface() {
    const ops = useOps();
    const outcome = ops.last?.outcome;
    return (
        <div>
            <output data-testid="busy">{String(ops.isBusy)}</output>
            <output data-testid="serilog-a">{String(ops.isPackageBusy(A, 'Serilog'))}</output>
            <output data-testid="serilog-b">{String(ops.isPackageBusy(B, 'Serilog'))}</output>
            <output data-testid="moq-a">{String(ops.isPackageBusy(A, 'Moq'))}</output>
            <output data-testid="last">{outcome === undefined ? 'none' : `${ops.last?.sequence} ${outcome.opId} ${outcome.status}${isBulkOutcome(outcome) ? ` bulk:${outcome.results.length}` : ''}`}</output>
        </div>
    );
}

function Uninstall() {
    const { run } = useOpsActions();
    renders++;
    return <button type="button" onClick={() => { lastRun = run('ops/remove', { projectPath: A, packageId: 'Serilog' }).then(outcome => outcome, (error: unknown) => error); }}>Uninstall</button>;
}

function mount(): FakeHost {
    const host = createFakeHost();
    renders = 0;
    lastRun = undefined;
    render(<MessageBusProvider bus={host.bus}><OpsProvider><Surface /><Uninstall /></OpsProvider></MessageBusProvider>);
    return host;
}

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const text = (testId: string): string => screen.getByTestId(testId).textContent ?? '';

describe('ops slice', () => {
    it('R5: a package is busy from ops/progress while its operation is queued, running or restoring, on whichever surface it started', async () => {
        const host = mount();
        expect(text('busy')).toBe('false');
        await hostSays(() => host.event('ops/progress', progress('op1', 'queued', { kind: 'remove', projectPaths: [A], packageIds: ['serilog'] })));
        expect(text('busy')).toBe('true');
        // The id is compared without case; the other project and the other package are not busy.
        expect(text('serilog-a')).toBe('true');
        expect(text('serilog-b')).toBe('false');
        expect(text('moq-a')).toBe('false');
        // A later report that does not repeat projects and packages leaves the row busy.
        await hostSays(() => host.event('ops/progress', progress('op1', 'running', { detail: 'dotnet package remove' })));
        expect(text('serilog-a')).toBe('true');
        await hostSays(() => host.event('ops/progress', progress('op1', 'restoring')));
        expect(text('serilog-a')).toBe('true');
        await hostSays(() => host.event('ops/completed', removed('op1')));
        expect(text('serilog-a')).toBe('false');
        expect(text('busy')).toBe('false');
        expect(text('last')).toBe('1 op1 completed');
    });

    it('R5: a terminal progress report ends the operation; a restore marks no package', async () => {
        const host = mount();
        for (const [index, status] of (['completed', 'partial', 'failed', 'cancelled', 'rejected'] as const).entries()) {
            const opId = `op${index}`;
            await hostSays(() => host.event('ops/progress', progress(opId, 'running', { projectPaths: [A], packageIds: ['Serilog'] })));
            expect(text('serilog-a'), status).toBe('true');
            await hostSays(() => host.event('ops/progress', progress(opId, status)));
            expect(text('serilog-a'), status).toBe('false');
            expect(text('busy'), status).toBe('false');
        }
        // No outcome was announced: that is `ops/completed`.
        expect(text('last')).toBe('none');

        await hostSays(() => host.event('ops/progress', progress('restore', 'running', { kind: 'restore', projectPaths: [A] })));
        expect(text('busy')).toBe('true');
        expect(text('serilog-a')).toBe('false');
    });

    it('two operations on the same package: the row is busy until both have ended', async () => {
        const host = mount();
        await hostSays(() => host.event('ops/progress', progress('op1', 'running', { projectPaths: [A], packageIds: ['Serilog'] })));
        await hostSays(() => host.event('ops/progress', progress('op2', 'queued', { projectPaths: [A, B], packageIds: ['Serilog', 'Moq'] })));
        expect(text('serilog-b')).toBe('true');
        expect(text('moq-a')).toBe('true');
        await hostSays(() => host.event('ops/completed', removed('op1')));
        expect(text('serilog-a')).toBe('true');
        await hostSays(() => host.event('ops/completed', bulk('op2')));
        expect(text('serilog-a')).toBe('false');
        expect(text('last')).toBe('2 op2 partial bulk:2');
    });

    it('the surface that asked gets the outcome as its response and as an event: it counts once, in either order', async () => {
        const host = mount();
        await hostSays(() => screen.getByRole('button', { name: 'Uninstall' }).click());
        const [first] = host.requests('ops/remove');
        expect(first.payload).toEqual({ projectPath: A, packageId: 'Serilog' });
        await hostSays(() => host.event('ops/progress', progress('op1', 'running', { projectPaths: [A], packageIds: ['Serilog'] })));
        await hostSays(() => host.event('ops/completed', removed('op1')));
        await hostSays(() => host.respond(first, removed('op1')));
        expect(text('last')).toBe('1 op1 completed');
        expect(await lastRun).toEqual(removed('op1'));

        await hostSays(() => screen.getByRole('button', { name: 'Uninstall' }).click());
        const second = host.requests('ops/remove')[1];
        await hostSays(() => host.respond(second, removed('op2', 'failed')));
        await hostSays(() => host.event('ops/completed', removed('op2', 'failed')));
        // Progress that trails the outcome does not make the row busy again.
        await hostSays(() => host.event('ops/progress', progress('op2', 'running', { projectPaths: [A], packageIds: ['Serilog'] })));
        expect(text('last')).toBe('2 op2 failed');
        expect(text('serilog-a')).toBe('false');
    });

    it('the outcome is recorded from the response alone as well: the row is not left busy for want of an event', async () => {
        const host = mount();
        await hostSays(() => screen.getByRole('button', { name: 'Uninstall' }).click());
        await hostSays(() => host.event('ops/progress', progress('op-refused', 'queued', { projectPaths: [A], packageIds: ['Serilog'] })));
        expect(text('serilog-a')).toBe('true');
        // A refusal is an outcome too, and `run` resolves with it.
        const refused: OperationOutcome = { ...removed('op-refused', 'rejected'), message: 'Five operations are waiting' };
        await hostSays(() => host.respond(host.requests('ops/remove')[0], refused));
        expect(text('last')).toBe('1 op-refused rejected');
        expect(text('serilog-a')).toBe('false');
        expect(await lastRun).toEqual(refused);
    });

    it('run rejects when the request itself fails, and nothing is announced', async () => {
        const host = mount();
        await hostSays(() => screen.getByRole('button', { name: 'Uninstall' }).click());
        await hostSays(() => host.fail(host.requests('ops/remove')[0], 'invalid-request', 'No such project'));
        expect(await lastRun).toMatchObject({ code: 'invalid-request' });
        expect(text('last')).toBe('none');
    });

    it('a row is busy from the call to run until the request settles', async () => {
        const host = mount();
        await hostSays(() => screen.getByRole('button', { name: 'Uninstall' }).click());
        // Asked, and not reported by the host at all yet: busy on this surface from the call (N61).
        expect(text('serilog-a')).toBe('true');
        expect(text('moq-a')).toBe('false');
        expect(text('busy')).toBe('true');
        // The queued chunk names the operation; the entry moves under its id and stays busy.
        const [request] = host.requests('ops/remove');
        await hostSays(() => host.chunk(request, progress('op7', 'queued')));
        expect(text('serilog-a')).toBe('true');
        await hostSays(() => host.event('ops/progress', progress('op7', 'running', { kind: 'remove', projectPaths: [A], packageIds: ['Serilog'] })));
        expect(text('serilog-a')).toBe('true');
        await hostSays(() => host.respond(request, removed('op7')));
        expect(text('serilog-a')).toBe('false');
        expect(text('busy')).toBe('false');
        // A report that trails the response does not bring it back.
        await hostSays(() => host.event('ops/progress', progress('op7', 'running', { kind: 'remove', projectPaths: [A], packageIds: ['Serilog'] })));
        expect(text('serilog-a')).toBe('false');
    });

    it('a request without an answer leaves nothing busy', async () => {
        const host = mount();
        await hostSays(() => screen.getByRole('button', { name: 'Uninstall' }).click());
        const [request] = host.requests('ops/remove');
        await hostSays(() => host.chunk(request, progress('op8', 'queued')));
        expect(text('serilog-a')).toBe('true');
        // The request fails before any outcome: neither the call's entry nor the named operation stays.
        await hostSays(() => host.fail(request, 'failed', 'host went away'));
        expect(await lastRun).toMatchObject({ code: 'failed' });
        expect(text('serilog-a')).toBe('false');
        expect(text('busy')).toBe('false');
        expect(text('last')).toBe('none');
    });

    it('reads the projects and packages an operation touches from what was asked', () => {
        expect(touchedBy('ops/remove', { projectPath: A, packageId: 'Serilog' })).toEqual({ kind: 'remove', projectPaths: [A], packageIds: ['Serilog'] });
        expect(touchedBy('ops/bulkRemove', { projectPath: A, packages: ['Serilog', 'Moq'] })).toEqual({ kind: 'remove', projectPaths: [A], packageIds: ['Serilog', 'Moq'] });
        expect(touchedBy('ops/bulkUpdate', { projectPath: A, packages: [{ id: 'Moq', version: '4.20.0' }] })).toEqual({ kind: 'update', projectPaths: [A], packageIds: ['Moq'] });
        expect(touchedBy('ops/bulkInstall', { projectPaths: [A, B], packageId: 'Serilog' })).toEqual({ kind: 'install', projectPaths: [A, B], packageIds: ['Serilog'] });
        expect(touchedBy('ops/restore', { projectPaths: [A] })).toEqual({ kind: 'restore', projectPaths: [A], packageIds: [] });
        expect(touchedBy('ops/bulkRemoveAllProjects', {
            projectRemovals: [{ projectPath: A, projectName: 'A', packages: ['Moq'] }, { projectPath: B, projectName: 'B', packages: ['Moq', 'Serilog'] }],
        })).toEqual({ kind: 'remove', projectPaths: [A, B], packageIds: ['Moq', 'Serilog'] });
        expect(touchedBy('ops/bulkUpdateAllProjects', {
            projectUpdates: [{ projectPath: B, projectName: 'B', packages: [{ id: 'Moq', version: '4.20.0' }] }],
        })).toEqual({ kind: 'update', projectPaths: [B], packageIds: ['Moq'] });
    });

    it('a per-step report keeps every package of the operation busy', () => {
        const asked = opsReducer(INITIAL_OPS, { type: 'asked', localId: 'local:1', progress: progress('local:1', 'queued', { kind: 'update', projectPaths: [A], packageIds: ['Serilog', 'Moq', 'Newtonsoft.Json'] }) });
        const named = opsReducer(asked, { type: 'named', localId: 'local:1', opId: 'op1' });
        // Each step of a bulk update reports the one package it works on.
        const step = opsReducer(named, { type: 'progress', progress: progress('op1', 'running', { kind: 'update', projectPaths: [A], packageIds: ['moq'], current: 1, total: 3 }) });
        const restoring = opsReducer(step, { type: 'progress', progress: progress('op1', 'restoring', { projectPaths: [A], packageIds: ['Moq'] }) });
        for (const state of [step, restoring]) {
            expect(busyPackages(state).size).toBe(3);
            expect(state.active.get('op1')?.packageIds).toEqual(['Serilog', 'Moq', 'Newtonsoft.Json']);
        }
        expect(restoring.active.get('op1')).toMatchObject({ status: 'restoring', current: 1, total: 3 });
        const done = opsReducer(restoring, { type: 'completed', outcome: { opId: 'op1', kind: 'update', status: 'completed', projectPath: A, packageId: 'Moq' } });
        expect(busyPackages(done).size).toBe(0);
    });

    it('naming moves the entry under the operation id and keeps what the host reported first', () => {
        const asked = opsReducer(INITIAL_OPS, { type: 'asked', localId: 'local:1', progress: progress('local:1', 'queued', { kind: 'remove', projectPaths: [A], packageIds: ['Serilog'] }) });
        const reported = opsReducer(asked, { type: 'progress', progress: progress('op9', 'running', { current: 1, total: 2 }) });
        const named = opsReducer(reported, { type: 'named', localId: 'local:1', opId: 'op9' });
        expect([...named.active.keys()]).toEqual(['op9']);
        expect(named.active.get('op9')).toEqual({ opId: 'op9', status: 'running', kind: 'remove', projectPaths: [A], packageIds: ['Serilog'], current: 1, total: 2 });
        // An operation that ended before its name arrived is not brought back; an unknown local id changes nothing.
        const ended = opsReducer(asked, { type: 'completed', outcome: removed('op9') });
        expect([...opsReducer(ended, { type: 'named', localId: 'local:1', opId: 'op9' }).active.keys()]).toEqual([]);
        expect(opsReducer(named, { type: 'named', localId: 'local:2', opId: 'op9' })).toBe(named);
        expect(opsReducer(named, { type: 'settled', localId: 'local:2', opId: undefined })).toBe(named);
    });

    it('the same outcome twice in a row is two announcements when the operations differ', async () => {
        const host = mount();
        await hostSays(() => host.event('ops/completed', removed('op1')));
        await hostSays(() => host.event('ops/completed', removed('op2')));
        expect(text('last')).toBe('2 op2 completed');
    });

    it('a component that only starts operations does not render when their state changes', async () => {
        const host = mount();
        const before = renders;
        await hostSays(() => host.event('ops/progress', progress('op1', 'running', { projectPaths: [A], packageIds: ['Serilog'] })));
        await hostSays(() => host.event('ops/completed', removed('op1')));
        expect(renders).toBe(before);
    });

    it('the hooks fail with a clear message without a provider', () => {
        expect(() => render(<Surface />)).toThrow('useOps needs an OpsProvider above it');
        expect(() => render(<Uninstall />)).toThrow('useOpsActions needs an OpsProvider above it');
    });
});

describe('ops reducer', () => {
    it('returns the same state for a report that changes nothing', () => {
        let state: OpsState = INITIAL_OPS;
        // The end of an operation that was never seen in progress.
        expect(opsReducer(state, { type: 'progress', progress: progress('unknown', 'completed') })).toBe(state);
        state = opsReducer(state, { type: 'completed', outcome: removed('op1') });
        expect(opsReducer(state, { type: 'completed', outcome: removed('op1') })).toBe(state);
        expect(opsReducer(state, { type: 'progress', progress: progress('op1', 'running') })).toBe(state);
    });

    it('remembers a bounded number of ended operations', () => {
        let state: OpsState = INITIAL_OPS;
        for (let index = 0; index < 40; index++) {
            state = opsReducer(state, { type: 'completed', outcome: removed(`op${index}`) });
        }
        expect(state.ended).toHaveLength(32);
        expect(state.ended[0]).toBe('op8');
        expect(state.last).toEqual({ outcome: removed('op39'), sequence: 40 });
    });

    it('lists the busy packages of every active operation', () => {
        let state: OpsState = INITIAL_OPS;
        state = opsReducer(state, { type: 'progress', progress: progress('op1', 'queued', { projectPaths: [A, B], packageIds: ['Serilog'] }) });
        state = opsReducer(state, { type: 'progress', progress: progress('op2', 'running', { projectPaths: [A] }) });
        state = opsReducer(state, { type: 'progress', progress: progress('op3', 'running', { packageIds: ['Moq'] }) });
        expect([...busyPackages(state)].sort()).toEqual([`${A}|serilog`, `${B}|serilog`]);
    });
});

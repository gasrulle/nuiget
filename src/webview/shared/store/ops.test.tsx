import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BulkOutcome, OperationOutcome, OperationProgress } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { busyPackages, INITIAL_OPS, isBulkOutcome, OpsProvider, opsReducer, useOps, useOpsActions, type OpsState } from './ops';

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

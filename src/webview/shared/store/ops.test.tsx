import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type BulkOutcome, type InstalledResult, type OperationOutcome, type OperationProgress, type SessionSnapshot } from '../../../protocol';
import { busyText } from '../installed/rules';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { busyPackages, INITIAL_OPS, isBulkOutcome, opsReducer, restoringProjects, touchedBy, useOps, useOpsActions, type OpsState } from './ops';
import { StoreProvider } from './StoreProvider';

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
    render(<StoreProvider bus={host.bus} prefetch={false}><Surface /><Uninstall /></StoreProvider>);
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

    it('a queued report of an operation the host submitted marks the row on a surface that ran nothing; running merges into it, the outcome ends it', () => {
        const facts = { kind: 'remove' as const, projectPaths: [A], packageIds: ['Moq'] };
        let state = opsReducer(INITIAL_OPS, { type: 'progress', progress: progress('menu', 'queued', facts) });
        expect(busyPackages(state).size).toBe(1);
        state = opsReducer(state, { type: 'progress', progress: progress('menu', 'running') });
        expect(state.active.size).toBe(1);
        expect(busyPackages(state).size).toBe(1);
        state = opsReducer(state, { type: 'completed', outcome: removed('menu') });
        expect(busyPackages(state).size).toBe(0);
        // A report that arrives after the outcome is an ended operation's.
        state = opsReducer(state, { type: 'progress', progress: progress('menu', 'queued', facts) });
        expect(busyPackages(state).size).toBe(0);
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

    it('restoringProjects: a restore is in the set from the call, through queued and restoring, until it settles; an edit\'s restoring step is not (UX-P4.fix-10)', async () => {
        const host = createFakeHost();
        function Restoring() {
            const ops = useOps();
            const { run } = useOpsActions();
            return (
                <div>
                    <output data-testid="restoring">{[...restoringProjects(ops)].join(',')}</output>
                    <button type="button" onClick={() => { run('ops/restore', { projectPaths: [A] }).catch(() => undefined); }}>Restore</button>
                </div>
            );
        }
        render(<StoreProvider bus={host.bus} prefetch={false}><Restoring /></StoreProvider>);
        expect(text('restoring')).toBe('');
        await hostSays(() => screen.getByRole('button', { name: 'Restore' }).click());
        // From the call, before the host said anything (N61).
        expect(text('restoring')).toBe(A);
        const [request] = host.requests('ops/restore');
        await hostSays(() => host.chunk(request, progress('op9', 'queued')));
        expect(text('restoring')).toBe(A);
        await hostSays(() => host.event('ops/progress', progress('op9', 'restoring', { kind: 'restore', projectPaths: [A], packageIds: [] })));
        expect(text('restoring')).toBe(A);
        await hostSays(() => host.respond(request, { opId: 'op9', status: 'completed', results: [{ opId: 'op9', kind: 'restore', status: 'completed', projectPath: A, restore: { ok: true } }], restores: [{ projectPath: A, ok: true }] }));
        expect(text('restoring')).toBe('');
        // An install's own restore step reports `restoring` too: no restore of the project.
        const edit = opsReducer(INITIAL_OPS, { type: 'progress', progress: progress('op10', 'restoring', { kind: 'install', projectPaths: [B], packageIds: ['Serilog'] }) });
        expect(restoringProjects(edit).size).toBe(0);
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

    it('the own outcome is the response, or an event whose origin is this surface; an event without an origin or of the other surface sets none, and one outcome counts once (UX-P4.fix-11)', () => {
        const answered = opsReducer(INITIAL_OPS, { type: 'answered', outcome: removed('op1') });
        expect(answered.own).toEqual({ outcome: removed('op1'), sequence: 1 });
        // The event after the response is counted in `last` and keeps `own` as it was.
        const after = opsReducer(answered, { type: 'completed', outcome: removed('op1') });
        expect(after.own).toBe(answered.own);
        expect(after.last?.sequence).toBe(1);
        // The event first: `ended` swallows the response's `completed`, never its `answered`.
        const eventFirst = opsReducer(opsReducer(INITIAL_OPS, { type: 'completed', outcome: removed('op2') }), { type: 'completed', outcome: removed('op2') });
        expect(eventFirst.own).toBeUndefined();
        expect(opsReducer(eventFirst, { type: 'answered', outcome: removed('op2') }).own).toEqual({ outcome: removed('op2'), sequence: 1 });
        // The same outcome answered twice is two.
        expect(opsReducer(answered, { type: 'answered', outcome: removed('op1') }).own?.sequence).toBe(2);
        // A row-menu outcome: the event whose origin is this surface (`mine`) sets `own`, once though it comes twice; an event
        // of the other surface or without an origin (`mine` false or absent) sets none (UX-P4.fix-11).
        const menu = { ...removed('op3'), origin: 'main' as const };
        const mine = opsReducer(INITIAL_OPS, { type: 'completed', outcome: menu, mine: true });
        expect(mine.own).toEqual({ outcome: menu, sequence: 1 });
        expect(opsReducer(mine, { type: 'completed', outcome: menu, mine: true }).own).toBe(mine.own);
        const theirs = { ...removed('op4'), origin: 'sidebar' as const };
        expect(opsReducer(INITIAL_OPS, { type: 'completed', outcome: theirs, mine: false }).own).toBeUndefined();
    });

    it('a completed event whose origin is this surface sets own once; a repeat of the same opId does not (UX-P4.fix-11)', async () => {
        const host = createFakeHost();
        function Own() {
            const { own } = useOps();
            return <output data-testid="own">{own === undefined ? 'none' : `${own.sequence} ${own.outcome.opId}`}</output>;
        }
        render(<StoreProvider bus={host.bus} prefetch={false} surface="sidebar"><Own /></StoreProvider>);
        await hostSays(() => host.event('ops/completed', { ...removed('menu1'), origin: 'main' }));
        await hostSays(() => host.event('ops/completed', removed('menu2')));
        expect(text('own')).toBe('none');
        await hostSays(() => host.event('ops/completed', { ...removed('menu3'), origin: 'sidebar' }));
        await hostSays(() => host.event('ops/completed', { ...removed('menu3'), origin: 'sidebar' }));
        expect(text('own')).toBe('1 menu3');
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

describe('settling (X31, UX-P4.8c)', () => {
    const snap = (selectedProject: string, includePrerelease = false): SessionSnapshot => ({ rev: 1, selectedProject, selectedSource: 'all', includePrerelease, restoreEnabled: true, origin: 'host' });
    const listOf = (projectPath: string): InstalledResult => ({ projectPath, fidelity: 'authoritative', isCpm: false, packages: [] });
    const updated = (opId: string, projectPath = A, packageId = 'Serilog', more: Partial<OperationOutcome> = {}): OperationOutcome => ({ opId, kind: 'update', status: 'completed', projectPath, packageId, edit: { ok: true }, ...more });

    function Settle() {
        const ops = useOps();
        const { run } = useOpsActions();
        return (
            <div>
                <output data-testid="installed-a">{String(ops.isPackageBusy(A, 'Serilog'))}</output>
                <output data-testid="updates-a">{String(ops.isPackageBusy(A, 'Serilog', true))}</output>
                <output data-testid="installed-b">{String(ops.isPackageBusy(B, 'Serilog'))}</output>
                <output data-testid="moq-a">{String(ops.isPackageBusy(A, 'Moq'))}</output>
                <output data-testid="word-a">{busyText(ops, A, 'Serilog')}</output>
                <output data-testid="word-moq">{busyText(ops, A, 'Moq')}</output>
                <output data-testid="is-busy">{String(ops.isBusy)}</output>
                <output data-testid="restoring">{[...restoringProjects(ops)].join(',')}</output>
                <output data-testid="settling">{ops.settling.size}</output>
                <button type="button" onClick={() => { lastRun = run('ops/update', { projectPath: A, packageId: 'Serilog', version: '4.0.0' }).then(outcome => outcome, (error: unknown) => error); }}>Update</button>
            </div>
        );
    }

    /** The store with `path` selected and its first lists answered: the installed list and the update check, or the two fan-outs. */
    async function selected(path = A): Promise<FakeHost> {
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus} prefetch={false}><Settle /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snap(path)));
        if (path === ALL_PROJECTS) {
            await hostSays(() => host.respond(host.requests('allProjects/installed')[0], { projectPaths: [A, B], errored: [] }));
            await hostSays(() => host.respond(host.requests('allProjects/updates')[0], { projectPaths: [A, B] }));
        } else {
            await hostSays(() => host.respond(host.requests('installed/get')[0], listOf(path), 1));
            await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: path, updates: [] }, 1));
        }
        expect(text('settling')).toBe('0');
        return host;
    }
    const listedA = (host: FakeHost): Promise<void> => hostSays(() => host.invalidate([[resourceKeys.installed(A), 2], [resourceKeys.updates(A, false), 2]]));

    it('a completed edit keeps its package busy until its list settles (X31)', async () => {
        const host = await selected();
        await hostSays(() => host.event('ops/completed', updated('op1')));
        expect([text('installed-a'), text('updates-a'), text('word-a')]).toEqual(['true', 'true', 'Finishing']);
        await listedA(host);
        expect([text('installed-a'), text('updates-a'), text('word-a')]).toEqual(['true', 'true', 'Finishing']);
        await hostSays(() => host.respond(host.requests('installed/get')[1], listOf(A), 2));
        await hostSays(() => host.respond(host.requests('updates/get')[1], { projectPath: A, updates: [] }, 2));
        expect([text('installed-a'), text('updates-a'), text('settling')]).toEqual(['false', 'false', '0']);
    });

    it('an Installed row ends at the installed answer while the update row of the same package still waits', async () => {
        const host = await selected();
        await hostSays(() => host.event('ops/completed', updated('op1')));
        await listedA(host);
        await hostSays(() => host.respond(host.requests('installed/get')[1], listOf(A), 2));
        expect([text('installed-a'), text('updates-a'), text('word-a')]).toEqual(['false', 'true', 'Finishing']);
        await hostSays(() => host.respond(host.requests('updates/get')[1], { projectPath: A, updates: [] }, 2));
        expect([text('updates-a'), text('settling')]).toEqual(['false', '0']);
    });

    it('a failed, cancelled or rejected outcome arms nothing', async () => {
        const host = await selected();
        await hostSays(() => host.event('ops/completed', updated('op1', A, 'Serilog', { status: 'failed', edit: { ok: false, error: 'boom' } })));
        await hostSays(() => host.event('ops/completed', updated('op2', A, 'Serilog', { status: 'cancelled', edit: undefined })));
        await hostSays(() => host.event('ops/completed', updated('op3', A, 'Serilog', { status: 'rejected', edit: undefined, message: 'Queue full' })));
        expect([text('installed-a'), text('updates-a'), text('settling')]).toEqual(['false', 'false', '0']);
    });

    it('a terminal ops/progress arms nothing', async () => {
        const host = await selected();
        await hostSays(() => host.event('ops/progress', progress('op1', 'running', { kind: 'update', projectPaths: [A], packageIds: ['Serilog'] })));
        expect(text('word-a')).toBe('Updating');
        await hostSays(() => host.event('ops/progress', progress('op1', 'completed', { kind: 'update', projectPaths: [A], packageIds: ['Serilog'] })));
        expect([text('installed-a'), text('settling')]).toEqual(['false', '0']);
    });

    it('a bulk outcome arms its ok edits only', async () => {
        const host = await selected();
        const outcome: BulkOutcome = { opId: 'bulk1', status: 'partial', results: [updated('bulk1-1'), updated('bulk1-2', A, 'Moq', { status: 'failed', edit: { ok: false } })], restores: [] };
        await hostSays(() => host.event('ops/completed', outcome));
        expect([text('installed-a'), text('moq-a'), text('settling')]).toEqual(['true', 'false', '1']);
    });

    it('an outcome first recorded from the response arms nothing', async () => {
        const host = await selected();
        await hostSays(() => screen.getByRole('button', { name: 'Update' }).click());
        expect(text('installed-a')).toBe('true');
        const [request] = host.requests('ops/update');
        await hostSays(() => host.respond(request, updated('op1')));
        await lastRun;
        // The event that follows the response is the same operation's: the ended guard keeps it from arming.
        await hostSays(() => host.event('ops/completed', updated('op1')));
        expect([text('installed-a'), text('updates-a'), text('settling')]).toEqual(['false', 'false', '0']);
    });

    it('a listing that does not name the key drops it', async () => {
        const host = await selected();
        await hostSays(() => host.event('ops/completed', updated('op1')));
        await hostSays(() => host.invalidate([[resourceKeys.installed(B), 2]]));
        expect([text('installed-a'), text('updates-a'), text('settling')]).toEqual(['false', 'false', '0']);
    });

    it('the listing keeps an entry only for the selected project\'s own keys; another project\'s or the other prerelease flag\'s key drops it', async () => {
        const host = await selected();
        await hostSays(() => host.event('ops/completed', updated('op1')));
        await hostSays(() => host.event('ops/completed', updated('op2', B)));
        expect(text('installed-b')).toBe('true');
        await hostSays(() => host.invalidate([[resourceKeys.installed(B), 2], [resourceKeys.updates(A, true), 2]]));
        expect([text('installed-a'), text('updates-a'), text('installed-b'), text('settling')]).toEqual(['false', 'false', 'false', '0']);
    });

    it('a project change drops it', async () => {
        const host = await selected();
        await hostSays(() => host.event('ops/completed', updated('op1')));
        await listedA(host);
        await hostSays(() => host.event('session/changed', { ...snap(B), rev: 2 }));
        expect([text('installed-a'), text('updates-a'), text('settling')]).toEqual(['false', 'false', '0']);
    });

    it('a list error ends it', async () => {
        const host = await selected();
        await hostSays(() => host.event('ops/completed', updated('op1')));
        await listedA(host);
        await hostSays(() => host.fail(host.requests('installed/get')[1], 'failed'));
        expect([text('installed-a'), text('updates-a')]).toEqual(['false', 'true']);
        await hostSays(() => host.fail(host.requests('updates/get')[1], 'failed'));
        expect([text('updates-a'), text('settling')]).toEqual(['false', '0']);
    });

    it('a settling package makes no other row Queued and leaves isBusy false', async () => {
        const host = await selected();
        await hostSays(() => host.event('ops/completed', updated('op1')));
        expect([text('is-busy'), text('restoring')]).toEqual(['false', '']);
        await hostSays(() => host.event('ops/progress', progress('op2', 'queued', { kind: 'remove', projectPaths: [A], packageIds: ['Moq'] })));
        expect([text('word-moq'), text('word-a')]).toEqual(['Uninstalling', 'Finishing']);
    });

    it('under All Projects a row settles at the fan-out\'s next answer, not in the commit that follows the listing', async () => {
        const host = await selected(ALL_PROJECTS);
        await hostSays(() => host.event('ops/completed', updated('op1')));
        await hostSays(() => host.invalidate([[resourceKeys.projects(), 2]]));
        await hostSays(() => undefined);
        expect([text('installed-a'), text('updates-a')]).toEqual(['true', 'true']);
        await hostSays(() => host.respond(host.requests('allProjects/installed')[1], { projectPaths: [A, B], errored: [] }));
        expect([text('installed-a'), text('updates-a')]).toEqual(['false', 'true']);
        await hostSays(() => host.respond(host.requests('allProjects/updates')[1], { projectPaths: [A, B] }));
        expect([text('updates-a'), text('settling')]).toEqual(['false', '0']);
    });

    it('a listing that names projects keeps every project\'s entry under All Projects', async () => {
        const host = await selected(ALL_PROJECTS);
        await hostSays(() => host.event('ops/completed', updated('op1')));
        await hostSays(() => host.event('ops/completed', updated('op2', B)));
        await hostSays(() => host.invalidate([[resourceKeys.projects(), 2]]));
        expect([text('installed-a'), text('installed-b'), text('settling')]).toEqual(['true', 'true', '2']);
    });
});

describe('settling reducer (X31, UX-P4.8c)', () => {
    const armed = opsReducer(INITIAL_OPS, { type: 'completed', event: true, outcome: { opId: 'op1', kind: 'update', status: 'completed', projectPath: A, packageId: 'Serilog', edit: { ok: true } } });

    it('a list that settles before the listing ends nothing', () => {
        expect(armed.settling.size).toBe(1);
        expect(opsReducer(armed, { type: 'listSettled', list: 'installed' })).toBe(armed);
        expect(opsReducer(armed, { type: 'listSettled', list: 'updates' })).toBe(armed);
    });

    it('listed, listSettled and unselected return the same state when nothing changes', () => {
        expect(opsReducer(INITIAL_OPS, { type: 'listed', projectPath: A, installed: true, updates: true })).toBe(INITIAL_OPS);
        expect(opsReducer(INITIAL_OPS, { type: 'listSettled', list: 'installed' })).toBe(INITIAL_OPS);
        expect(opsReducer(INITIAL_OPS, { type: 'unselected' })).toBe(INITIAL_OPS);
        const listed = opsReducer(armed, { type: 'listed', projectPath: A, installed: true, updates: false });
        expect(listed.settling.get(`${A}|serilog`)?.lists).toEqual({ installed: true, updates: false });
        // An entry already listed is not touched by a later listing.
        expect(opsReducer(listed, { type: 'listed', projectPath: A, installed: false, updates: true })).toBe(listed);
    });
});

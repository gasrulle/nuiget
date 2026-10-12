import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger, OperationRunContext } from '../contracts';
import type { BulkOutcome, OperationOutcome, OperationProgress } from '../../protocol/domain';
import { DEFAULT_MAX_WAITING, DefaultOperationQueue } from './OperationQueue';

const project = '/w/App/App.csproj';

const rejectedBulk = (reason: string, opId: string): BulkOutcome => ({ opId, status: 'rejected', results: [], restores: [], message: reason });
const rejectedSingle = (reason: string, opId: string): OperationOutcome => ({ opId, kind: 'install', status: 'rejected', projectPath: project, packageId: 'X', message: reason });
const completed = (ctx: OperationRunContext): BulkOutcome => ({ opId: ctx.opId, status: 'completed', results: [], restores: [] });

/** A workflow that finishes when the test says so. */
function gate() {
    let release!: () => void;
    const opened = new Promise<void>(resolve => { release = resolve; });
    const run = vi.fn(async (ctx: OperationRunContext): Promise<BulkOutcome> => {
        await opened;
        return ctx.signal.aborted ? { ...completed(ctx), status: 'cancelled' } : completed(ctx);
    });
    return { run, release };
}

function fakeLogger() {
    return {
        trace: vi.fn<Logger['trace']>(),
        debug: vi.fn<Logger['debug']>(),
        info: vi.fn<Logger['info']>(),
        warn: vi.fn<Logger['warn']>(),
        error: vi.fn<Logger['error']>(),
    } satisfies Logger;
}

/** Lets the microtask that starts a freshly submitted workflow run. */
const tick = () => Promise.resolve();

describe('DefaultOperationQueue', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('runs a submitted workflow and resolves the ticket with its outcome', async () => {
        const queue = new DefaultOperationQueue();
        let seen: OperationRunContext | undefined;
        const ticket = queue.submit('install X', async ctx => { seen = ctx; return completed(ctx); }, rejectedBulk);
        expect(ticket.admitted).toBe(true);
        expect(ticket.opId).toMatch(/^[0-9a-f-]{36}$/);
        const outcome = await ticket.completion;
        expect(outcome).toEqual({ opId: ticket.opId, status: 'completed', results: [], restores: [] });
        expect(seen?.opId).toBe(ticket.opId);
        expect(seen?.signal.aborted).toBe(false);
        expect(queue.isBusy).toBe(false);
    });

    it('gives every ticket its own opId', () => {
        const queue = new DefaultOperationQueue();
        const ids = [1, 2, 3].map(() => queue.submit('op', async ctx => completed(ctx), rejectedBulk).opId);
        expect(new Set(ids).size).toBe(3);
    });

    it('runs workflows one at a time in submission order', async () => {
        const queue = new DefaultOperationQueue();
        const log: string[] = [];
        let concurrent = 0;
        let maxConcurrent = 0;
        const workflow = (name: string) => async (ctx: OperationRunContext): Promise<BulkOutcome> => {
            concurrent++;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            log.push(`start ${name}`);
            await tick();
            await tick();
            log.push(`end ${name}`);
            concurrent--;
            return completed(ctx);
        };
        const tickets = ['a', 'b', 'c'].map(name => queue.submit(name, workflow(name), rejectedBulk));
        await Promise.all(tickets.map(t => t.completion));
        expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
        expect(maxConcurrent).toBe(1);
    });

    it('admits one running and five waiting workflows and refuses the next with its opId stamped', async () => {
        const logger = fakeLogger();
        const queue = new DefaultOperationQueue({ logger });
        const first = gate();
        const admitted = [queue.submit('running', first.run, rejectedBulk)];
        for (let index = 0; index < DEFAULT_MAX_WAITING; index++) {
            admitted.push(queue.submit(`waiting ${index}`, async ctx => completed(ctx), rejectedBulk));
        }
        expect(admitted.map(t => t.admitted)).toEqual([true, true, true, true, true, true]);
        expect([queue.activeCount, queue.pendingCount]).toEqual([1, 5]);

        const refusedRun = vi.fn(async (ctx: OperationRunContext) => rejectedSingle('never', ctx.opId));
        const refused = queue.submit('one too many, --password hunter2', refusedRun, rejectedSingle);
        expect(refused.admitted).toBe(false);
        const outcome = await refused.completion;
        expect(outcome).toEqual({ opId: refused.opId, kind: 'install', status: 'rejected', projectPath: project, packageId: 'X', message: 'the operation queue is full (1 running, 5 waiting)' });
        expect(refusedRun).not.toHaveBeenCalled();
        expect([queue.activeCount, queue.pendingCount]).toEqual([1, 5]);
        expect(logger.warn).toHaveBeenCalledWith('Operation "one too many, --password [REDACTED]" was not admitted: the operation queue is full (1 running, 5 waiting)');
        refused.cancel();

        first.release();
        const outcomes = await Promise.all(admitted.map(t => t.completion));
        expect(outcomes.map(o => o.status)).toEqual(['completed', 'completed', 'completed', 'completed', 'completed', 'completed']);
        // A slot is free again.
        expect(queue.submit('later', async ctx => completed(ctx), rejectedBulk).admitted).toBe(true);
    });

    it('honours a smaller maxWaiting', async () => {
        const queue = new DefaultOperationQueue({ maxWaiting: 1 });
        const first = gate();
        const tickets = [queue.submit('a', first.run, rejectedBulk), queue.submit('b', first.run, rejectedBulk), queue.submit('c', first.run, rejectedBulk)];
        expect(tickets.map(t => t.admitted)).toEqual([true, true, false]);
        first.release();
        expect((await tickets[2].completion).status).toBe('rejected');
        await queue.waitIdle();
    });

    it('stamps the opId on progress, and a listener attached after submit sees the first chunk', async () => {
        const queue = new DefaultOperationQueue();
        const ticket = queue.submit('install X', async ctx => {
            ctx.report({ status: 'running', kind: 'install', projectPaths: [project], packageIds: ['X'] });
            await tick();
            ctx.report({ status: 'restoring', kind: 'install', projectPaths: [project], packageIds: ['X'] });
            return completed(ctx);
        }, rejectedBulk);
        const seen: OperationProgress[] = [];
        queue.onProgress(progress => { seen.push(progress); });
        await ticket.completion;
        expect(seen).toEqual([
            { opId: ticket.opId, status: 'running', kind: 'install', projectPaths: [project], packageIds: ['X'] },
            { opId: ticket.opId, status: 'restoring', kind: 'install', projectPaths: [project], packageIds: ['X'] },
        ]);
    });

    it('drops a report that arrives after the terminal outcome', async () => {
        const queue = new DefaultOperationQueue();
        const seen: OperationProgress[] = [];
        queue.onProgress(progress => { seen.push(progress); });
        let late: OperationRunContext | undefined;
        const ticket = queue.submit('op', async ctx => { late = ctx; ctx.report({ status: 'running' }); return completed(ctx); }, rejectedBulk);
        await ticket.completion;
        late?.report({ status: 'restoring' });
        expect(seen.map(p => p.status)).toEqual(['running']);
    });

    it('a throwing progress listener does not disturb the workflow or the other listeners', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const queue = new DefaultOperationQueue();
        const seen: OperationProgress[] = [];
        queue.onProgress(() => { throw new Error('listener broke'); });
        queue.onProgress(progress => { seen.push(progress); });
        const ticket = queue.submit('op', async ctx => { ctx.report({ status: 'running' }); return completed(ctx); }, rejectedBulk);
        expect((await ticket.completion).status).toBe('completed');
        expect(seen).toHaveLength(1);
    });

    it('a throw in run resolves as failed with the redacted message, and the queue goes on', async () => {
        const logger = fakeLogger();
        const queue = new DefaultOperationQueue({ logger });
        const rejecting = queue.submit('update X', async () => { throw new Error('feed said no, apikey=abc123'); }, rejectedSingle);
        const throwing = queue.submit('remove Y', () => { throw new TypeError('not a function'); }, rejectedBulk);
        const after = queue.submit('install Z', async ctx => completed(ctx), rejectedBulk);

        expect(await rejecting.completion).toEqual({ opId: rejecting.opId, kind: 'install', status: 'failed', projectPath: project, packageId: 'X', message: 'feed said no, apikey=[REDACTED]' });
        expect(await throwing.completion).toEqual({ opId: throwing.opId, status: 'failed', results: [], restores: [], message: 'not a function' });
        expect((await after.completion).status).toBe('completed');
        expect(logger.error).toHaveBeenCalledWith('Operation "update X" threw: feed said no, apikey=[REDACTED]');
        expect(queue.isBusy).toBe(false);
    });

    it('settles the ticket even when the rejected-outcome builder throws', async () => {
        const logger = fakeLogger();
        const queue = new DefaultOperationQueue({ logger });
        const ticket = queue.submit<BulkOutcome>('op', async () => { throw new Error('boom'); }, () => { throw new Error('builder broke'); });
        expect(await ticket.completion).toEqual({ opId: ticket.opId, status: 'failed', message: 'boom' });
        expect(logger.error).toHaveBeenCalledTimes(2);
        await queue.waitIdle();
    });

    it('cancels a waiting workflow without running it', async () => {
        const queue = new DefaultOperationQueue();
        const first = gate();
        const running = queue.submit('running', first.run, rejectedBulk);
        const waitingRun = vi.fn(async (ctx: OperationRunContext) => rejectedSingle('never', ctx.opId));
        const waiting = queue.submit('waiting', waitingRun, rejectedSingle);
        const last = queue.submit('last', async ctx => completed(ctx), rejectedBulk);
        await tick();

        waiting.cancel();
        expect(await waiting.completion).toEqual({ opId: waiting.opId, kind: 'install', status: 'cancelled', projectPath: project, packageId: 'X', message: 'cancelled' });
        expect(queue.pendingCount).toBe(1);
        waiting.cancel();

        first.release();
        expect((await running.completion).status).toBe('completed');
        expect((await last.completion).status).toBe('completed');
        expect(waitingRun).not.toHaveBeenCalled();
    });

    it('cancelling the running workflow aborts its signal and the workflow reports its own outcome', async () => {
        const queue = new DefaultOperationQueue();
        const first = gate();
        const ticket = queue.submit('running', first.run, rejectedBulk);
        await tick();
        expect(first.run).toHaveBeenCalledTimes(1);
        ticket.cancel();
        expect(first.run.mock.calls[0][0].signal.aborted).toBe(true);
        expect(queue.activeCount).toBe(1);
        first.release();
        expect((await ticket.completion).status).toBe('cancelled');
    });

    it('a cancel before the workflow started resolves as cancelled without running it', async () => {
        const queue = new DefaultOperationQueue();
        const run = vi.fn(async (ctx: OperationRunContext) => completed(ctx));
        const ticket = queue.submit('op', run, rejectedBulk);
        ticket.cancel();
        expect(await ticket.completion).toEqual({ opId: ticket.opId, status: 'cancelled', results: [], restores: [], message: 'cancelled' });
        expect(run).not.toHaveBeenCalled();
        expect(queue.isBusy).toBe(false);
    });

    it('reports every change of the counts', async () => {
        const queue = new DefaultOperationQueue();
        const changes: Array<[number, number]> = [];
        queue.onDidChange(({ active, pending }) => { changes.push([active, pending]); });
        const first = gate();
        const a = queue.submit('a', first.run, rejectedBulk);
        const b = queue.submit('b', async ctx => completed(ctx), rejectedBulk);
        expect([queue.isBusy, queue.activeCount, queue.pendingCount]).toEqual([true, 1, 1]);
        first.release();
        await Promise.all([a.completion, b.completion]);
        await queue.waitIdle();
        expect(changes).toEqual([[1, 0], [1, 1], [1, 0], [0, 0]]);
    });

    it('waitIdle resolves at once when idle and after the last workflow otherwise', async () => {
        const queue = new DefaultOperationQueue();
        await queue.waitIdle();

        const first = gate();
        const a = queue.submit('a', first.run, rejectedBulk);
        const b = queue.submit('b', async ctx => completed(ctx), rejectedBulk);
        const order: string[] = [];
        const idle = [queue.waitIdle().then(() => order.push('idle 1')), queue.waitIdle().then(() => order.push('idle 2'))];
        void a.completion.then(() => order.push('a'));
        void b.completion.then(() => order.push('b'));
        await tick();
        expect(order).toEqual([]);
        first.release();
        await Promise.all(idle);
        expect(order).toEqual(['a', 'b', 'idle 1', 'idle 2']);
        expect(queue.isBusy).toBe(false);
    });

    it('dispose cancels what waits, aborts what runs and refuses what comes later', async () => {
        const queue = new DefaultOperationQueue();
        const first = gate();
        const running = queue.submit('running', first.run, rejectedBulk);
        const waitingRun = vi.fn(async (ctx: OperationRunContext) => completed(ctx));
        const waiting = queue.submit('waiting', waitingRun, rejectedBulk);
        await tick();

        queue.dispose();
        queue.dispose();
        expect((await waiting.completion).status).toBe('cancelled');
        expect(waitingRun).not.toHaveBeenCalled();
        expect(first.run.mock.calls[0][0].signal.aborted).toBe(true);

        const late = queue.submit('late', waitingRun, rejectedBulk);
        expect(late.admitted).toBe(false);
        expect(await late.completion).toEqual({ opId: late.opId, status: 'rejected', results: [], restores: [], message: 'the operation queue is disposed' });

        const idle = queue.waitIdle();
        first.release();
        expect((await running.completion).status).toBe('cancelled');
        await idle;
        expect(queue.isBusy).toBe(false);
    });
});

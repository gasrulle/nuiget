/**
 * Benchmarks for the 2.0 operation queue (`src/core/ops/OperationQueue.ts`): the cost the queue adds
 * to a workflow, for one ticket and for a full queue of one running and five waiting.
 */
import { test, describe } from 'vitest';
import { runBenchmark } from './benchmark';
import * as opsModule from '../../core/ops';
import type { OperationRunContext } from '../../core/contracts';
import type { BulkOutcome } from '../../protocol/domain';

// Bound once on purpose. Under Vitest's module runner an imported binding is a getter on the module object;
// calling it inside a benchmark would add that overhead to every sample (Vitest warns about it).
const { DefaultOperationQueue } = opsModule;

const rejected = (reason: string, opId: string): BulkOutcome => ({ opId, status: 'rejected', results: [], restores: [], message: reason });
const workflow = async (ctx: OperationRunContext): Promise<BulkOutcome> => {
    ctx.report({ status: 'running', kind: 'update', projectPaths: ['/w/App/App.csproj'], packageIds: ['X'] });
    return { opId: ctx.opId, status: 'completed', results: [], restores: [] };
};

describe('core ops — operation queue', () => {
    const queue = new DefaultOperationQueue();
    queue.onProgress(() => undefined);
    queue.onDidChange(() => undefined);

    test('submit one workflow and await its outcome', async (context) => {
        await runBenchmark(context, 'submit one workflow and await its outcome', async () => {
            await queue.submit('update X', workflow, rejected).completion;
        });
    });

    test('fill the queue (1 running, 5 waiting) and drain it', async (context) => {
        await runBenchmark(context, 'fill the queue (1 running, 5 waiting) and drain it', async () => {
            const tickets = [];
            for (let index = 0; index < 6; index++) {
                tickets.push(queue.submit('update X', workflow, rejected));
            }
            await Promise.all(tickets.map(ticket => ticket.completion));
        });
    });

    test('refuse a submission on a full queue', async (context) => {
        const full = new DefaultOperationQueue();
        const never = (): Promise<BulkOutcome> => new Promise<BulkOutcome>(() => undefined);
        for (let index = 0; index < 6; index++) {
            full.submit('blocked', never, rejected);
        }
        await runBenchmark(context, 'refuse a submission on a full queue', async () => {
            await full.submit('refused', workflow, rejected).completion;
        });
    });
});

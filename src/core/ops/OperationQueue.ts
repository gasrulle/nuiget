/**
 * Operation queue — admission and typed completion for top-level workflows (ADR-003).
 *
 * One workflow runs at a time, in submission order; a bounded number wait behind it. Every
 * `submit()` returns a ticket whose `completion` resolves exactly once and never rejects: with the
 * workflow's own outcome, or with an outcome the queue derives when the work was refused, cancelled
 * before it started, or threw.
 *
 * The queue cannot construct the caller's outcome type, so it derives those outcomes from the
 * caller's `rejected(reason, opId)` builder and replaces `status` and `message`.
 */

import { randomUUID } from 'crypto';
import type { Event, Logger, OperationQueue, OperationRunContext, OperationTicket } from '../contracts';
import type { BulkOutcome, OperationOutcome, OperationProgress } from '../../protocol/domain';
import { redact } from '../logging';
import { Emitter } from '../util/events';

/** Workflows that may wait behind the running one (ADR-003). */
export const DEFAULT_MAX_WAITING = 5;

export interface OperationQueueOptions {
    maxWaiting?: number;
    logger?: Logger;
}

interface Job {
    readonly controller: AbortController;
    /**
     * Runs the workflow, settles the ticket and calls `done` in the same turn, so whoever awaits the
     * ticket already sees the queue without this job. Never rejects.
     */
    run(done: () => void): Promise<void>;
    /** Settles the ticket as `cancelled` without running the workflow. */
    settleCancelled(): void;
}

const CANCELLED = 'cancelled';
const DISPOSED = 'the operation queue is disposed';

export class DefaultOperationQueue implements OperationQueue {
    private readonly maxWaiting: number;
    private readonly logger: Logger | undefined;
    private readonly changeEmitter = new Emitter<{ active: number; pending: number }>();
    private readonly progressEmitter = new Emitter<OperationProgress>();
    private readonly waiting: Job[] = [];
    private running: Job | undefined;
    private idleWaiters: Array<() => void> = [];
    private disposed = false;

    readonly onDidChange: Event<{ active: number; pending: number }> = this.changeEmitter.event;
    readonly onProgress: Event<OperationProgress> = this.progressEmitter.event;

    constructor(options: OperationQueueOptions = {}) {
        this.maxWaiting = options.maxWaiting ?? DEFAULT_MAX_WAITING;
        this.logger = options.logger;
    }

    get isBusy(): boolean {
        return this.running !== undefined || this.waiting.length > 0;
    }

    get activeCount(): number {
        return this.running === undefined ? 0 : 1;
    }

    get pendingCount(): number {
        return this.waiting.length;
    }

    submit<T extends OperationOutcome | BulkOutcome>(
        label: string,
        run: (ctx: OperationRunContext) => Promise<T>,
        rejected: (reason: string, opId: string) => T,
    ): OperationTicket<T> {
        const opId = randomUUID();
        const refusal = this.refusalReason();
        if (refusal !== undefined) {
            this.logger?.warn(redact(`Operation "${label}" was not admitted: ${refusal}`));
            return { opId, admitted: false, completion: Promise.resolve(rejected(refusal, opId)), cancel: () => undefined };
        }

        let settle!: (outcome: T) => void;
        const completion = new Promise<T>(resolve => { settle = resolve; });
        const controller = new AbortController();
        /** The caller's outcome shape with the queue's verdict; see the module comment. */
        const derive = (status: 'failed' | 'cancelled', message: string): T => {
            try {
                return { ...rejected(message, opId), status, message };
            } catch (error) {
                // Only a throwing builder gets here. A ticket that never settles would be worse than a bare outcome.
                this.logger?.error(redact(`Operation "${label}": the rejected-outcome builder threw: ${describe(error)}`));
                return { opId, status, message } as unknown as T;
            }
        };
        const job: Job = {
            controller,
            settleCancelled: () => settle(derive('cancelled', CANCELLED)),
            run: async done => {
                let settled = false;
                const ctx: OperationRunContext = {
                    opId,
                    signal: controller.signal,
                    report: progress => {
                        // A report after the terminal outcome would contradict it.
                        if (!settled) {
                            this.progressEmitter.fire({ ...progress, opId });
                        }
                    },
                };
                let outcome: T;
                try {
                    outcome = await run(ctx);
                } catch (error) {
                    const message = redact(describe(error));
                    this.logger?.error(redact(`Operation "${label}" threw: ${message}`));
                    outcome = derive('failed', message);
                }
                settled = true;
                settle(outcome);
                done();
            },
        };

        if (this.running === undefined) {
            this.start(job, true);
        } else {
            this.waiting.push(job);
        }
        this.fireChange();

        return {
            opId,
            admitted: true,
            completion,
            cancel: () => this.cancel(job),
        };
    }

    waitIdle(): Promise<void> {
        if (!this.isBusy) {
            return Promise.resolve();
        }
        return new Promise<void>(resolve => { this.idleWaiters.push(resolve); });
    }

    /** Cancels what waits, aborts what runs and refuses what comes later. Tickets still settle. */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const job of this.waiting.splice(0)) {
            job.controller.abort();
            job.settleCancelled();
        }
        this.running?.controller.abort();
        this.changeEmitter.dispose();
        this.progressEmitter.dispose();
        this.resolveIdleWaiters();
    }

    private refusalReason(): string | undefined {
        if (this.disposed) {
            return DISPOSED;
        }
        if (this.running !== undefined && this.waiting.length >= this.maxWaiting) {
            return `the operation queue is full (1 running, ${this.waiting.length} waiting)`;
        }
        return undefined;
    }

    /**
     * Makes `job` the running one. A job submitted to an idle queue starts on a microtask, so a
     * listener that the caller attaches right after `submit()` returns still sees its first report.
     */
    private start(job: Job, deferred: boolean): void {
        this.running = job;
        const execute = (): void => {
            if (job.controller.signal.aborted) {
                job.settleCancelled();
                this.finish(job);
                return;
            }
            void job.run(() => this.finish(job));
        };
        if (deferred) {
            queueMicrotask(execute);
        } else {
            execute();
        }
    }

    private finish(job: Job): void {
        if (this.running !== job) {
            return;
        }
        this.running = undefined;
        const next = this.waiting.shift();
        if (next !== undefined) {
            this.start(next, false);
        }
        this.fireChange();
        this.resolveIdleWaiters();
    }

    private cancel(job: Job): void {
        job.controller.abort();
        const index = this.waiting.indexOf(job);
        if (index >= 0) {
            this.waiting.splice(index, 1);
            job.settleCancelled();
            this.fireChange();
        }
        // The running workflow observes its signal and reports its own outcome.
    }

    private fireChange(): void {
        this.changeEmitter.fire({ active: this.activeCount, pending: this.pendingCount });
    }

    private resolveIdleWaiters(): void {
        if (this.isBusy || this.idleWaiters.length === 0) {
            return;
        }
        const waiters = this.idleWaiters;
        this.idleWaiters = [];
        for (const resolve of waiters) {
            resolve();
        }
    }
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

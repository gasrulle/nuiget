import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { operationQueue } from './OperationQueue';

function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

describe('OperationQueue', () => {
    beforeEach(() => {
        operationQueue.resetForTests();
        vi.clearAllMocks();
    });

    it('runs ops in FIFO order', async () => {
        const events: string[] = [];
        const a = deferred();
        const b = deferred();

        operationQueue.enqueue('a', async () => {
            events.push('a-start');
            await a.promise;
            events.push('a-end');
        });
        operationQueue.enqueue('b', async () => {
            events.push('b-start');
            await b.promise;
            events.push('b-end');
        });

        // Wait for chain to start running 'a'.
        for (let i = 0; i < 5; i++) { await Promise.resolve(); }
        expect(events).toEqual(['a-start']);

        a.resolve();
        // Allow the next op in the chain to start.
        for (let i = 0; i < 10; i++) { await Promise.resolve(); }
        expect(events).toEqual(['a-start', 'a-end', 'b-start']);

        b.resolve();
        await operationQueue.waitIdle();
        expect(events).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
    });

    it('isolates errors — a thrown op does not block subsequent ops', async () => {
        const events: string[] = [];
        operationQueue.enqueue('throws', async () => {
            events.push('a');
            throw new Error('boom');
        });
        operationQueue.enqueue('after-throw', async () => {
            events.push('b');
        });
        await operationQueue.waitIdle();
        expect(events).toEqual(['a', 'b']);
        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });

    it('rejects when waiting cap is exceeded', async () => {
        // Block the chain with one running op so the rest stay in waiting.
        const blocker = deferred();
        operationQueue.enqueue('blocker', async () => { await blocker.promise; });
        // Let 'blocker' move from waiting → active.
        await Promise.resolve();
        await Promise.resolve();

        const accepted: boolean[] = [];
        for (let i = 0; i < 5; i++) {
            accepted.push(operationQueue.enqueue(`op${i}`, async () => { /* noop */ }));
        }
        // The 6th waiting op exceeds MAX_WAITING (5).
        const overflow = operationQueue.enqueue('overflow', async () => { /* noop */ });

        expect(accepted.every(Boolean)).toBe(true);
        expect(overflow).toBe(false);
        expect(vscode.window.showWarningMessage).toHaveBeenCalled();

        blocker.resolve();
        await operationQueue.waitIdle();
    });

    it('honors abortIf — run() is skipped, counters still decrement', async () => {
        const ran = vi.fn();
        const accepted = operationQueue.enqueue('abortable', async () => { ran(); }, () => true);
        expect(accepted).toBe(true);
        await operationQueue.waitIdle();
        expect(ran).not.toHaveBeenCalled();
        expect(operationQueue.isBusy).toBe(false);
        expect(operationQueue.activeCount).toBe(0);
        expect(operationQueue.pendingCount).toBe(0);
    });

    it('isBusy reflects active and waiting state', async () => {
        expect(operationQueue.isBusy).toBe(false);

        const a = deferred();
        operationQueue.enqueue('a', async () => { await a.promise; });
        // Synchronously after enqueue, before microtasks: waiting=1, active=0 → busy
        expect(operationQueue.isBusy).toBe(true);

        // Microtask: now active=1, waiting=0 → still busy
        await Promise.resolve();
        await Promise.resolve();
        expect(operationQueue.isBusy).toBe(true);

        a.resolve();
        await operationQueue.waitIdle();
        expect(operationQueue.isBusy).toBe(false);
    });

    it('waitIdle resolves only after all ops complete', async () => {
        const a = deferred();
        const b = deferred();
        operationQueue.enqueue('a', async () => { await a.promise; });
        operationQueue.enqueue('b', async () => { await b.promise; });

        let idle = false;
        const idlePromise = operationQueue.waitIdle().then(() => { idle = true; });
        await Promise.resolve();
        expect(idle).toBe(false);

        a.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(idle).toBe(false);

        b.resolve();
        await idlePromise;
        expect(idle).toBe(true);
    });

    it('counter integrity — synchronous burst respects the cap', async () => {
        // Block first op so all subsequent ops queue.
        const blocker = deferred();
        operationQueue.enqueue('blocker', async () => { await blocker.promise; });
        await Promise.resolve();
        await Promise.resolve();

        const results: boolean[] = [];
        for (let i = 0; i < 10; i++) {
            results.push(operationQueue.enqueue(`burst${i}`, async () => { /* noop */ }));
        }
        const acceptedCount = results.filter(Boolean).length;
        // MAX_WAITING is 5, so exactly 5 should be accepted.
        expect(acceptedCount).toBe(5);

        blocker.resolve();
        await operationQueue.waitIdle();
    });
});

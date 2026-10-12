import { describe, expect, it, vi } from 'vitest';
import { resourceKeys } from '../../protocol/domain';
import type { InvalidationScope } from '../../protocol/domain';
import { StaleQueryError } from '../contracts';
import type { InvalidationEvent, Logger, QueryContext, QueryHandle } from '../contracts';
import { DefaultQueryCoordinator } from './QueryCoordinator';

// Every test drives the coordinator with promises it settles itself and with explicit microtask flushes.
// Nothing here waits for a timer: the coordinator schedules on microtasks only.

const P1 = '/ws/app/App.csproj';
const P2 = '/ws/lib/Lib.csproj';
const KEY = resourceKeys.installed(P1);
const OTHER = resourceKeys.installed(P2);
const VERSIONS = resourceKeys.versions('Serilog', undefined, false);
const PROJECT_P1: InvalidationScope = { kind: 'project', projectPaths: [P1] };

interface Deferred<T> {
    promise: Promise<T>;
    resolve(value: T): void;
    reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = () => undefined;
    let reject: (error: unknown) => void = () => undefined;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function flushMicrotasks(rounds = 8): Promise<void> {
    for (let round = 0; round < rounds; round++) {
        await Promise.resolve();
    }
}

interface Call<T, C> {
    ctx: QueryContext;
    emit: (chunk: C) => void;
    result: Deferred<T>;
}

/** A compute function that records every call and leaves its result to the test. */
function recorder<T = string, C = never>() {
    const calls: Array<Call<T, C>> = [];
    const compute = (ctx: QueryContext, emit: (chunk: C) => void): Promise<T> => {
        const result = deferred<T>();
        calls.push({ ctx, emit, result });
        return result.promise;
    };
    return { calls, compute };
}

/** The rejection of a handle, or `undefined` when it resolved. */
function failureOf(handle: QueryHandle<unknown>): Promise<unknown> {
    return handle.value.then(() => undefined, error => error);
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

describe('DefaultQueryCoordinator', () => {
    it('one computation per key/generation', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const { calls, compute } = recorder();

        expect(coordinator.generationOf(KEY)).toBe(0);
        const first = coordinator.query(KEY, compute);
        const second = coordinator.query(KEY, compute);
        const other = coordinator.query(OTHER, compute);

        // Two subscribers of one key share a computation; another key has its own.
        expect(calls).toHaveLength(2);
        expect(calls[0].ctx.generation).toBe(1);
        expect([first.generation, second.generation, other.generation]).toEqual([1, 1, 1]);
        expect(coordinator.generationOf(KEY)).toBe(1);

        calls[0].result.resolve('installed');
        calls[1].result.resolve('other');
        await expect(Promise.all([first.value, second.value, other.value])).resolves.toEqual(['installed', 'installed', 'other']);

        // A fresh value is served from the cache: no third computation.
        const cached = coordinator.query(KEY, compute);
        await expect(cached.value).resolves.toBe('installed');
        expect(cached.generation).toBe(1);
        expect(calls).toHaveLength(2);
        expect(coordinator.peek(KEY)).toEqual({ value: 'installed', generation: 1 });

        // The next generation is computed once, however many subscribers ask.
        coordinator.invalidate(PROJECT_P1, 'file-watcher');
        const third = coordinator.query(KEY, compute);
        const fourth = coordinator.query(KEY, compute);
        expect(calls).toHaveLength(3);
        expect(calls[2].ctx.generation).toBe(2);
        expect([third.generation, fourth.generation]).toEqual([2, 2]);
    });

    it('stale mid-computation is never cached and rejects StaleQueryError', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const { calls, compute } = recorder();
        const handle = coordinator.query(KEY, compute);

        coordinator.invalidate(PROJECT_P1, 'file-watcher');

        const error = await failureOf(handle);
        expect(error).toBeInstanceOf(StaleQueryError);
        expect(error).toMatchObject({ name: 'StaleQueryError', key: KEY, generation: 1 });
        expect(calls[0].ctx.signal.aborted).toBe(true);
        expect(coordinator.generationOf(KEY)).toBe(2);
        expect(coordinator.peek(KEY)).toBeUndefined();

        // The superseded computation finishes late: its value is dropped.
        calls[0].result.resolve('stale');
        await flushMicrotasks();
        expect(coordinator.peek(KEY)).toBeUndefined();

        // The subscriber is still there, so the coordinator recomputes for the new generation.
        expect(calls).toHaveLength(2);
        expect(calls[1].ctx.generation).toBe(2);
        expect(calls[1].ctx.signal.aborted).toBe(false);
    });

    it('old completion cannot repopulate', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const { calls, compute } = recorder();
        const stale = coordinator.query(KEY, compute);
        coordinator.invalidate(PROJECT_P1, 'operation');
        await failureOf(stale);

        const fresh = coordinator.query(KEY, compute);
        await flushMicrotasks();
        expect(calls).toHaveLength(2);

        // New first, old afterwards.
        calls[1].result.resolve('new');
        await expect(fresh.value).resolves.toBe('new');
        calls[0].result.resolve('old');
        await flushMicrotasks();
        expect(coordinator.peek(KEY)).toEqual({ value: 'new', generation: 2 });
        await expect(coordinator.query(KEY, compute).value).resolves.toBe('new');
        expect(calls).toHaveLength(2);

        // Old first, new afterwards, on another key.
        const second = recorder();
        const staleOther = coordinator.query(OTHER, second.compute);
        coordinator.invalidate({ kind: 'project', projectPaths: [P2] }, 'operation');
        await failureOf(staleOther);
        const freshOther = coordinator.query(OTHER, second.compute);
        await flushMicrotasks();
        second.calls[0].result.resolve('old');
        await flushMicrotasks();
        expect(coordinator.peek(OTHER)).toBeUndefined();
        second.calls[1].result.resolve('new');
        await expect(freshOther.value).resolves.toBe('new');
        expect(coordinator.peek(OTHER)).toEqual({ value: 'new', generation: 2 });
    });

    it('release does not cancel other subscriber', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const { calls, compute } = recorder();
        const leaving = coordinator.query(KEY, compute);
        const staying = coordinator.query(KEY, compute);

        leaving.release();
        leaving.release();
        await flushMicrotasks();
        expect(calls[0].ctx.signal.aborted).toBe(false);

        calls[0].result.resolve('installed');
        await expect(staying.value).resolves.toBe('installed');
        expect(coordinator.peek(KEY)).toEqual({ value: 'installed', generation: 1 });

        // The last subscriber leaving does cancel, and the next query starts over.
        const alone = coordinator.query(OTHER, compute);
        alone.release();
        expect(calls[1].ctx.signal.aborted).toBe(false);
        await flushMicrotasks();
        expect(calls[1].ctx.signal.aborted).toBe(true);
        coordinator.query(OTHER, compute);
        expect(calls).toHaveLength(3);
        expect(calls[2].ctx.generation).toBe(1);
    });

    it('subscribers converge', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const { calls, compute } = recorder();
        // A consumer as both surfaces behave: ask again whenever the answer went stale.
        const follow = async (): Promise<{ value: string; generation: number }> => {
            for (;;) {
                const handle = coordinator.query(KEY, compute);
                try {
                    return { value: await handle.value, generation: handle.generation };
                } catch (error) {
                    if (!(error instanceof StaleQueryError)) {
                        throw error;
                    }
                }
            }
        };

        const main = follow();
        const sidebar = follow();
        await flushMicrotasks();
        coordinator.invalidate(PROJECT_P1, 'file-watcher');
        await flushMicrotasks();
        coordinator.invalidate(PROJECT_P1, 'operation');
        await flushMicrotasks();

        // The inputs have settled. Every computation ever started now finishes, in the order it started.
        for (const call of calls) {
            call.result.resolve(`value of generation ${call.ctx.generation}`);
        }
        const [mainResult, sidebarResult] = await Promise.all([main, sidebar]);

        expect(mainResult).toEqual({ value: 'value of generation 3', generation: 3 });
        expect(sidebarResult).toEqual(mainResult);
        expect(coordinator.generationOf(KEY)).toBe(3);
        expect(coordinator.peek(KEY)).toEqual({ value: 'value of generation 3', generation: 3 });
        // Both surfaces shared one computation per generation.
        expect(calls.map(call => call.ctx.generation)).toEqual([1, 2, 3]);
    });

    it('invalidate coalesces into one event', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const events: InvalidationEvent[] = [];
        coordinator.onDidInvalidate(event => events.push(event));
        const { calls, compute } = recorder();
        coordinator.query(KEY, compute);
        coordinator.query(OTHER, compute);
        coordinator.query(VERSIONS, compute);
        for (const call of calls) {
            call.result.resolve('value');
        }
        await flushMicrotasks();

        coordinator.invalidate(PROJECT_P1, 'file-watcher');
        coordinator.invalidate({ kind: 'project', projectPaths: [P1, P2] }, 'operation');
        expect(events).toEqual([]);
        await flushMicrotasks();

        expect(events).toHaveLength(1);
        const [event] = events;
        expect(event.scope).toEqual({ kind: 'project', projectPaths: [P1, P2] });
        expect(event.reason).toBe('file-watcher');
        // The event's own number counts invalidations; each key reports its own generation.
        expect(event.generation).toBe(2);
        expect(new Set(event.keys.map(entry => `${entry.key} @ ${entry.generation}`)))
            .toEqual(new Set([`${KEY} @ 3`, `${OTHER} @ 2`]));
        expect(event.keys).toHaveLength(2);
        for (const { key, generation } of event.keys) {
            expect(coordinator.generationOf(key)).toBe(generation);
        }
        expect(coordinator.generationOf(VERSIONS)).toBe(1);

        // The next tick gets its own event, and the sequence continues.
        coordinator.invalidate({ kind: 'metadata', packageIds: ['serilog'] }, 'manual-refresh');
        await flushMicrotasks();
        expect(events).toHaveLength(2);
        expect(events[1]).toEqual({
            scope: { kind: 'metadata', packageIds: ['serilog'] },
            reason: 'manual-refresh',
            generation: 3,
            keys: [{ key: VERSIONS, generation: 2 }],
        });
    });

    it('dispose rejects pending', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const events: InvalidationEvent[] = [];
        coordinator.onDidInvalidate(event => events.push(event));
        const { calls, compute } = recorder();
        const pending = coordinator.query(KEY, compute);
        coordinator.invalidate({ kind: 'sources' }, 'source-changed');

        coordinator.dispose();
        coordinator.dispose();

        const error = await failureOf(pending);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(StaleQueryError);
        expect((error as Error).message).toBe('QueryCoordinator is disposed');
        expect(calls[0].ctx.signal.aborted).toBe(true);

        // Nothing happens afterwards: no event for the invalidation that was pending, none for a new one.
        coordinator.invalidate(PROJECT_P1, 'file-watcher');
        calls[0].result.resolve('late');
        await flushMicrotasks();
        expect(events).toEqual([]);
        expect(coordinator.generationOf(KEY)).toBe(0);
        expect(coordinator.peek(KEY)).toBeUndefined();

        const after = coordinator.query(KEY, compute);
        expect(after.generation).toBe(0);
        after.release();
        await expect(after.value).rejects.toThrow('QueryCoordinator is disposed');
        expect(calls).toHaveLength(1);
    });

    it('carry-over: a joining subscriber replaces the carried keep-alives', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const { calls, compute } = recorder();
        const first = coordinator.query(KEY, compute);
        // The consumer asks again as soon as its handle fails, and never releases the failed one.
        let rejoined: QueryHandle<string> | undefined;
        const failure = first.value.catch((error: unknown) => {
            rejoined = coordinator.query(KEY, compute);
            return error;
        });

        coordinator.invalidate(PROJECT_P1, 'file-watcher');
        expect(await failure).toBeInstanceOf(StaleQueryError);
        await flushMicrotasks();

        // It joined the recompute that was already scheduled: two computations in all, not three.
        expect(calls).toHaveLength(2);
        expect(rejoined?.generation).toBe(2);
        expect(calls[1].ctx.signal.aborted).toBe(false);

        // Its new handle is now the only thing that keeps the recompute alive.
        rejoined?.release();
        await flushMicrotasks();
        expect(calls[1].ctx.signal.aborted).toBe(true);

        // The failed handle is spent; releasing it late changes nothing.
        first.release();
        await flushMicrotasks();
        expect(calls).toHaveLength(2);
    });

    it('carry-over: a recompute kept alive only by carried handles is not carried again', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const { calls, compute } = recorder();
        const abandoned = coordinator.query(KEY, compute);

        // Two invalidations in one tick, and the consumer never asks again.
        coordinator.invalidate(PROJECT_P1, 'file-watcher');
        coordinator.invalidate(PROJECT_P1, 'operation');
        await failureOf(abandoned);
        await flushMicrotasks();

        // No recompute ran for the generation in between, and none for the current one: nobody is waiting.
        expect(calls).toHaveLength(1);
        expect(coordinator.generationOf(KEY)).toBe(3);

        const fresh = coordinator.query(KEY, compute);
        expect(calls).toHaveLength(2);
        expect(calls[1].ctx.generation).toBe(3);
        calls[1].result.resolve('current');
        await expect(fresh.value).resolves.toBe('current');
    });

    it('carry-over: the recompute runs for a subscriber that has not asked again yet, until it settles', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const { calls, compute } = recorder();
        const first = coordinator.query(KEY, compute);

        coordinator.invalidate(PROJECT_P1, 'file-watcher');
        await failureOf(first);
        await flushMicrotasks();

        // The old handle is still held, so the work for the new generation is already in flight.
        expect(calls).toHaveLength(2);
        expect(calls[1].ctx.signal.aborted).toBe(false);

        calls[1].result.resolve('recomputed');
        await flushMicrotasks();
        expect(coordinator.peek(KEY)).toEqual({ value: 'recomputed', generation: 2 });
        // The consumer that comes back late is served from the cache.
        await expect(coordinator.query(KEY, compute).value).resolves.toBe('recomputed');
        expect(calls).toHaveLength(2);
    });

    it('carry-over: releasing the stale handle without asking again aborts the recompute', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const { calls, compute } = recorder();
        const first = coordinator.query(KEY, compute);

        coordinator.invalidate(PROJECT_P1, 'file-watcher');
        await failureOf(first);
        first.release();
        await flushMicrotasks();

        // Whether the recompute had started is a matter of microtask order; that it is cancelled is not.
        for (const call of calls) {
            expect(call.ctx.signal.aborted).toBe(true);
        }
        coordinator.query(KEY, compute);
        expect(calls[calls.length - 1].ctx.generation).toBe(2);
        expect(calls[calls.length - 1].ctx.signal.aborted).toBe(false);
    });

    it('streams chunks to every unreleased subscriber, also after the value resolved', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const { calls, compute } = recorder<string, string>();
        const seenByFirst: string[] = [];
        const seenBySecond: string[] = [];
        const first = coordinator.query(KEY, compute, chunk => seenByFirst.push(chunk));
        const second = coordinator.query(KEY, compute, chunk => seenBySecond.push(chunk));
        coordinator.query(KEY, compute);

        calls[0].emit('a');
        second.release();
        calls[0].emit('b');
        calls[0].result.resolve('done');
        await expect(first.value).resolves.toBe('done');
        calls[0].emit('late enrichment');

        expect(seenByFirst).toEqual(['a', 'b', 'late enrichment']);
        expect(seenBySecond).toEqual(['a']);

        // After an invalidation the old computation has nothing more to say.
        coordinator.invalidate(PROJECT_P1, 'file-watcher');
        calls[0].emit('stale');
        expect(seenByFirst).toEqual(['a', 'b', 'late enrichment']);
    });

    it('reports a chunk listener that throws and still serves the others', () => {
        const logger = fakeLogger();
        const coordinator = new DefaultQueryCoordinator({ logger });
        const { calls, compute } = recorder<string, string>();
        const seen: string[] = [];
        coordinator.query(KEY, compute, () => {
            throw new Error('listener failed');
        });
        coordinator.query(KEY, compute, chunk => seen.push(chunk));

        calls[0].emit('a');

        expect(seen).toEqual(['a']);
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(KEY), expect.any(Error));
    });

    it('rejects every subscriber when the computation fails, caches nothing and computes again on the next query', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const { calls, compute } = recorder();
        const first = coordinator.query(KEY, compute);
        const second = coordinator.query(KEY, compute);

        calls[0].result.reject(new Error('feed unreachable'));

        await expect(first.value).rejects.toThrow('feed unreachable');
        await expect(second.value).rejects.toThrow('feed unreachable');
        expect(coordinator.peek(KEY)).toBeUndefined();
        expect(coordinator.generationOf(KEY)).toBe(1);

        const retry = coordinator.query(KEY, compute);
        expect(calls).toHaveLength(2);
        expect(retry.generation).toBe(1);
        calls[1].result.resolve('recovered');
        await expect(retry.value).resolves.toBe('recovered');
    });

    it('treats a compute function that throws synchronously as a failed computation', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const handle = coordinator.query<string>(KEY, () => {
            throw new Error('bad arguments');
        });

        await expect(handle.value).rejects.toThrow('bad arguments');
        expect(coordinator.peek(KEY)).toBeUndefined();
    });

    it('keeps at most maxCachedValues values, dropping the least recently used, and keeps their generations', async () => {
        const coordinator = new DefaultQueryCoordinator({ maxCachedValues: 2 });
        const { calls, compute } = recorder();
        const keys = [KEY, OTHER, VERSIONS];
        for (const [index, key] of keys.entries()) {
            const handle = coordinator.query(key, compute);
            calls[index].result.resolve(`value ${index}`);
            await handle.value;
            if (index === 1) {
                // Reading the first key again makes the second one the least recently used.
                await coordinator.query(KEY, compute).value;
            }
        }

        expect(coordinator.peek(KEY)).toEqual({ value: 'value 0', generation: 1 });
        expect(coordinator.peek(OTHER)).toBeUndefined();
        expect(coordinator.peek(VERSIONS)).toEqual({ value: 'value 2', generation: 1 });
        expect(coordinator.generationOf(OTHER)).toBe(1);

        // An evicted value is computed again, in the same generation.
        const again = coordinator.query(OTHER, compute);
        expect(calls).toHaveLength(4);
        expect(again.generation).toBe(1);
    });

    it('bumps only the keys a scope reaches and reports none when it reaches nothing', async () => {
        const coordinator = new DefaultQueryCoordinator();
        const events: InvalidationEvent[] = [];
        coordinator.onDidInvalidate(event => events.push(event));
        const { calls, compute } = recorder();
        const handle = coordinator.query(KEY, compute);
        calls[0].result.resolve('installed');
        await handle.value;

        coordinator.invalidate({ kind: 'metadata', packageIds: ['Serilog'] }, 'manual-refresh');
        await flushMicrotasks();

        expect(coordinator.generationOf(KEY)).toBe(1);
        expect(coordinator.peek(KEY)).toEqual({ value: 'installed', generation: 1 });
        expect(events).toEqual([{ scope: { kind: 'metadata', packageIds: ['Serilog'] }, reason: 'manual-refresh', generation: 1, keys: [] }]);

        // A key that was invalidated while its value was cached is stale until it is asked for again.
        coordinator.invalidate({ kind: 'workspace' }, 'workspace-folders');
        expect(coordinator.generationOf(KEY)).toBe(2);
        expect(coordinator.peek(KEY)).toEqual({ value: 'installed', generation: 1 });
        coordinator.query(KEY, compute);
        expect(calls).toHaveLength(2);
        expect(calls[1].ctx.generation).toBe(2);
    });
});

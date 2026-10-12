import { describe, expect, it, vi } from 'vitest';
import { batchedPromiseAll, raceFirst } from './concurrency';

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function flush(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}

describe('batchedPromiseAll', () => {
    it('preserves input order even when items complete out of order', async () => {
        const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
        const run = batchedPromiseAll([0, 1, 2], index => gates[index].promise, 3);

        gates[2].resolve('c');
        gates[0].resolve('a');
        gates[1].resolve('b');

        await expect(run).resolves.toEqual(['a', 'b', 'c']);
    });

    it('never exceeds the concurrency bound and refills slots as items finish', async () => {
        const gates = Array.from({ length: 6 }, () => deferred<number>());
        let inFlight = 0;
        let peak = 0;
        const started: number[] = [];

        const run = batchedPromiseAll(
            gates.map((_, index) => index),
            async index => {
                inFlight++;
                peak = Math.max(peak, inFlight);
                started.push(index);
                const value = await gates[index].promise;
                inFlight--;
                return value;
            },
            2,
        );

        await flush();
        expect(started).toEqual([0, 1]);

        gates[1].resolve(1);
        await flush();
        expect(started).toEqual([0, 1, 2]);

        gates[0].resolve(0);
        await flush();
        expect(started).toEqual([0, 1, 2, 3]);

        gates[2].resolve(2);
        gates[3].resolve(3);
        await flush();
        gates[4].resolve(4);
        gates[5].resolve(5);

        await expect(run).resolves.toEqual([0, 1, 2, 3, 4, 5]);
        expect(peak).toBe(2);
    });

    it('reports progress in completion order with the item index', async () => {
        const gates = [deferred<string>(), deferred<string>()];
        const progress = vi.fn();
        const run = batchedPromiseAll([0, 1], index => gates[index].promise, 2, progress);

        gates[1].resolve('second');
        await flush();
        gates[0].resolve('first');
        await run;

        expect(progress.mock.calls).toEqual([
            ['second', 1],
            ['first', 0],
        ]);
    });

    it('returns an empty array for no items without invoking the worker', async () => {
        const worker = vi.fn();
        await expect(batchedPromiseAll([], worker, 4)).resolves.toEqual([]);
        expect(worker).not.toHaveBeenCalled();
    });

    it('clamps a non-positive or non-finite concurrency to one worker', async () => {
        let inFlight = 0;
        let peak = 0;
        const worker = async (value: number): Promise<number> => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            await Promise.resolve();
            inFlight--;
            return value * 2;
        };

        await expect(batchedPromiseAll([1, 2, 3], worker, 0)).resolves.toEqual([2, 4, 6]);
        await expect(batchedPromiseAll([1, 2], worker, Number.NaN)).resolves.toEqual([2, 4]);
        expect(peak).toBe(1);
    });

    it('rejects with the first error and stops scheduling further items', async () => {
        const boom = new Error('boom');
        const started: number[] = [];
        const gates = [deferred<number>(), deferred<number>(), deferred<number>()];

        const run = batchedPromiseAll(
            [0, 1, 2],
            index => {
                started.push(index);
                return gates[index].promise;
            },
            1,
        );

        gates[0].reject(boom);
        await expect(run).rejects.toBe(boom);
        expect(started).toEqual([0]);
    });
});

describe('raceFirst', () => {
    it('resolves with the first matching value in completion order, not input order', async () => {
        const gates = [deferred<number>(), deferred<number>(), deferred<number>()];
        const race = raceFirst(gates.map(g => g.promise), value => value > 0, -1);

        gates[2].resolve(0);
        gates[1].resolve(5);
        gates[0].resolve(7);

        await expect(race).resolves.toEqual({ value: 5, index: 1 });
    });

    it('treats rejected promises as non-matching and still finds a later match', async () => {
        const gates = [deferred<string[]>(), deferred<string[]>()];
        const race = raceFirst(gates.map(g => g.promise), value => value.length > 0, []);

        gates[0].reject(new Error('network'));
        await flush();
        gates[1].resolve(['1.0.0']);

        await expect(race).resolves.toEqual({ value: ['1.0.0'], index: 1 });
    });

    it('falls back with index -1 only after every promise has settled without a match', async () => {
        const gates = [deferred<number>(), deferred<number>()];
        const race = raceFirst(gates.map(g => g.promise), value => value > 10, 0);
        let settledValue: { value: number; index: number } | undefined;
        void race.then(result => {
            settledValue = result;
        });

        gates[0].resolve(1);
        await flush();
        expect(settledValue).toBeUndefined();

        gates[1].reject(new Error('fail'));
        await expect(race).resolves.toEqual({ value: 0, index: -1 });
    });

    it('resolves with the fallback immediately for an empty list', async () => {
        await expect(raceFirst([], () => true, 'none')).resolves.toEqual({ value: 'none', index: -1 });
    });

    it('treats a throwing predicate as non-matching instead of rejecting', async () => {
        const race = raceFirst(
            [Promise.resolve('bad'), Promise.resolve('good')],
            value => {
                if (value === 'bad') {
                    throw new Error('predicate failure');
                }
                return true;
            },
            'fallback',
        );

        await expect(race).resolves.toEqual({ value: 'good', index: 1 });
    });

    it('ignores values that arrive after a match has been chosen', async () => {
        const gates = [deferred<number>(), deferred<number>()];
        const predicate = vi.fn((value: number) => value === 1);
        const race = raceFirst(gates.map(g => g.promise), predicate, 0);

        gates[0].resolve(1);
        await expect(race).resolves.toEqual({ value: 1, index: 0 });

        gates[1].resolve(1);
        await flush();
        expect(predicate).toHaveBeenCalledTimes(1);
    });
});

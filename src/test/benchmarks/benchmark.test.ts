import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { BenchFn, TestContext } from 'vitest';

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));

const filepath = 'src/test/benchmarks/cache.bench.ts';
const key = JSON.stringify([filepath, ['LRUMap operations'], 'get (hit)', 'get (hit)']);
const previous = { latency: { mean: 1 }, throughput: { mean: 1000 }, period: 1, totalTime: 500 };

function createContext() {
    const run = vi.fn(async (_options: unknown, fn: BenchFn) => { await fn(); });
    const compare = vi.fn(async (current: { fn: BenchFn }, stored: { source: () => unknown }, _options: unknown) => {
        await current.fn();
        return stored.source();
    });
    const from = vi.fn((name: string, source: () => unknown) => ({ name, source }));
    const bench = Object.assign((name: string, fn: BenchFn) => ({
        name,
        fn,
        run: (options: unknown) => run(options, fn),
    }), { compare, from });
    return {
        run, compare, from,
        context: {
            bench,
            task: {
                name: 'get (hit)',
                suite: { name: 'LRUMap operations' },
                file: { filepath: resolve(filepath) },
            },
        } as unknown as TestContext,
    };
}

beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv('NUIGET_BENCHMARK_BASELINE', '');
});

afterEach(() => {
    vi.unstubAllEnvs();
});

function mockBaseline(value: unknown) {
    vi.stubEnv('NUIGET_BENCHMARK_BASELINE', resolve('benchmarks/baseline.json'));
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(value));
}

test('runs the benchmark with the previous timing defaults without a baseline', async () => {
    const { runBenchmark } = await import('./benchmark');
    const { context, run, compare } = createContext();
    const fn = vi.fn();
    await runBenchmark(context, 'get (hit)', fn);
    expect(run).toHaveBeenCalledWith({ time: 500, iterations: 10, warmupTime: 100, warmupIterations: 5 }, fn);
    expect(fn).toHaveBeenCalledOnce();
    expect(compare).not.toHaveBeenCalled();
});

test('replays the file/suite-scoped baseline without a performance threshold', async () => {
    const differentSuite = JSON.stringify([filepath, ['WorkspaceCache operations'], 'get (hit)', 'get (hit)']);
    mockBaseline({ version: 1, benchmarks: { [key]: previous, [differentSuite]: { ...previous, period: 2 } } });
    const { runBenchmark } = await import('./benchmark');
    const { context, compare, from, run } = createContext();
    await runBenchmark(context, 'get (hit)', () => {});
    expect(compare).toHaveBeenCalledOnce();
    expect(await compare.mock.results[0].value).toEqual(previous);
    expect(from).toHaveBeenCalledWith('get (hit) (baseline)', expect.any(Function));
    expect(run).not.toHaveBeenCalled();
});

test('rejects a missing baseline file', async () => {
    vi.stubEnv('NUIGET_BENCHMARK_BASELINE', resolve('benchmarks/missing.json'));
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT: baseline missing'); });
    const { runBenchmark } = await import('./benchmark');
    await expect(runBenchmark(createContext().context, 'get (hit)', () => {})).rejects.toThrow('ENOENT');
});

test.each([{ files: [] }, null, { version: 1, benchmarks: [] }])('rejects an invalid baseline instead of silently skipping comparison: %j', async (baseline) => {
    mockBaseline(baseline);
    const { runBenchmark } = await import('./benchmark');
    await expect(runBenchmark(createContext().context, 'get (hit)', () => {})).rejects.toThrow('Invalid benchmark baseline');
});

test('rejects a missing benchmark identity', async () => {
    mockBaseline({ version: 1, benchmarks: {} });
    const { runBenchmark } = await import('./benchmark');
    await expect(runBenchmark(createContext().context, 'get (hit)', () => {})).rejects.toThrow('Missing or invalid benchmark baseline');
});

test('rejects a baseline that has no measured statistics', async () => {
    mockBaseline({ version: 1, benchmarks: { [key]: { name: 'get (hit)' } } });
    const { runBenchmark } = await import('./benchmark');
    await expect(runBenchmark(createContext().context, 'get (hit)', () => {})).rejects.toThrow('Missing or invalid benchmark baseline');
});

test('propagates benchmark errors during comparison', async () => {
    mockBaseline({ version: 1, benchmarks: { [key]: previous } });
    const { runBenchmark } = await import('./benchmark');
    await expect(runBenchmark(createContext().context, 'get (hit)', () => {
        throw new Error('benchmark failure');
    })).rejects.toThrow('benchmark failure');
});

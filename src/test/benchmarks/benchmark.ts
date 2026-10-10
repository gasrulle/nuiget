import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { BaselineData, BenchFn, TestContext } from 'vitest';

interface BenchmarkBaseline {
    version: 1;
    benchmarks: Record<string, BaselineData>;
}

let baseline: BenchmarkBaseline | undefined;

export async function runBenchmark(context: TestContext, name: string, fn: BenchFn): Promise<void> {
    const { bench, task } = context;
    // Keep the Tinybench 2 timing defaults used by the Vitest 4 suite.
    const options = { time: 500, iterations: 10, warmupTime: 100, warmupIterations: 5 };
    const current = bench(name, fn);
    const baselinePath = process.env.NUIGET_BENCHMARK_BASELINE;
    if (!baselinePath) {
        await current.run(options);
        return;
    }

    baseline ??= JSON.parse(readFileSync(baselinePath, 'utf8')) as BenchmarkBaseline;
    if (baseline?.version !== 1 || !baseline.benchmarks || typeof baseline.benchmarks !== 'object' || Array.isArray(baseline.benchmarks)) {
        throw new Error('Invalid benchmark baseline; regenerate it with npm run bench:save.');
    }
    const ancestors: string[] = [];
    for (let suite = task.suite; suite; suite = suite.suite) {
        ancestors.unshift(suite.name);
    }
    const file = relative(process.cwd(), task.file.filepath).replaceAll('\\', '/');
    const key = JSON.stringify([file, ancestors, task.name, name]);
    const previous = baseline.benchmarks[key];
    if (!previous || !Number.isFinite(previous.throughput?.mean) || !Number.isFinite(previous.latency?.mean)
        || !Number.isFinite(previous.period) || !Number.isFinite(previous.totalTime)) {
        throw new Error(`Missing or invalid benchmark baseline for ${file} > ${ancestors.join(' > ')} > ${name}; run npm run bench:save.`);
    }
    await bench.compare(current, bench.from(`${name} (baseline)`, () => previous), options);
}

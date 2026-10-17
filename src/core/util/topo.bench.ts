/**
 * Benchmarks for the dependency ordering of multi-project operations (`src/core/util/topo.ts`): a chain, a wide fan-in
 * and a graph with a cycle, in both directions. Replaces the topological-sort cases of the 1.x `utils` benchmark
 * (P8.2a, D8).
 */
import { describe, test } from 'vitest';
import { runBenchmark } from '../../test/benchmarks/benchmark';
import * as topo from './topo';

// Bound once on purpose (see src/core/cache/cache.bench.ts): an imported binding is a getter under Vitest's module runner.
const { topologicalSortByDependency } = topo;

const PROJECTS = 50;
const keys = Array.from({ length: PROJECTS }, (_, index) => `/ws/p${index}/p${index}.csproj`);
const selected = new Set(keys);
const identity = (key: string): string => key;

/** Each project depends on the one before it. */
const chain = new Map(keys.map((key, index) => [key, index === 0 ? [] : [keys[index - 1]]]));
/** Every project depends on the first ten. */
const fanIn = new Map(keys.map((key, index) => [key, index < 10 ? [] : keys.slice(0, 10)]));
/** The chain with its last project closing a cycle to the first. */
const cyclic = new Map(chain);
cyclic.set(keys[0], [keys[PROJECTS - 1]]);

describe('core util — topological sort (50 projects)', () => {
    test('chain, dependencies first', async (context) => {
        await runBenchmark(context, 'chain, dependencies first', () => {
            topologicalSortByDependency([...keys].reverse(), identity, chain, selected, true);
        });
    });

    test('fan-in, dependents first', async (context) => {
        await runBenchmark(context, 'fan-in, dependents first', () => {
            topologicalSortByDependency(keys, identity, fanIn, selected, false);
        });
    });

    test('cycle', async (context) => {
        await runBenchmark(context, 'cycle', () => {
            topologicalSortByDependency(keys, identity, cyclic, selected, true);
        });
    });
});

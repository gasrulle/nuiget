/**
 * Benchmarks for the source health tracker (`src/core/feeds/health.ts`), which every feed read consults before it
 * contacts a source: the healthy path, a failed source inside and past its retry window, and a failure that is
 * recorded and settled. Replaces the 1.x `source-health` benchmark (P8.2a, D8).
 */
import { describe, test } from 'vitest';
import { runBenchmark } from '../../test/benchmarks/benchmark';
import * as health from './health';

// Bound once on purpose (see src/core/cache/cache.bench.ts): an imported binding is a getter under Vitest's module runner.
const { DEFAULT_FAILURE_TTL_MS, SourceHealthTracker } = health;

const SOURCES = Array.from({ length: 10 }, (_, index) => `https://feed${index}.example/v3/index.json`);
let clock = 0;
const tracker = new SourceHealthTracker({ now: () => clock });
for (const url of SOURCES.slice(0, 3)) {
    tracker.markFailed(url, 'ECONNREFUSED');
}

describe('core feeds — source health', () => {
    test('isHealthy over 10 sources, 3 failed (inside the retry window)', async (context) => {
        await runBenchmark(context, 'isHealthy over 10 sources, 3 failed (inside the retry window)', () => {
            clock = 1_000;
            for (const url of SOURCES) {
                tracker.isHealthy(url);
            }
        });
    });

    test('isHealthy over 10 sources, 3 failed (retry due)', async (context) => {
        await runBenchmark(context, 'isHealthy over 10 sources, 3 failed (retry due)', () => {
            clock = DEFAULT_FAILURE_TTL_MS + 1;
            for (const url of SOURCES) {
                tracker.isHealthy(url);
            }
        });
    });

    test('markFailed then markHealthy', async (context) => {
        const settling = new SourceHealthTracker();
        await runBenchmark(context, 'markFailed then markHealthy', () => {
            settling.markFailed(SOURCES[9], 'timeout');
            settling.markHealthy(SOURCES[9]);
        });
    });
});

/**
 * Benchmarks for the parser of the unified search box (`parseSearchQuery`), which runs on every keystroke of both
 * surfaces. Replaces the 1.x `search-query` benchmark (P8.2a, D8).
 */
import { describe, test } from 'vitest';
import { runBenchmark } from '../../../test/benchmarks/benchmark';
import * as parser from './parseSearchQuery';

// Bound once on purpose (see src/core/cache/cache.bench.ts): an imported binding is a getter under Vitest's module runner.
const { parseSearchQuery } = parser;

describe('webview search — parseSearchQuery', () => {
    test('browse text', async (context) => {
        await runBenchmark(context, 'browse text', () => {
            parseSearchQuery('Newtonsoft.Json');
        });
    });

    test('filter prefix with text', async (context) => {
        await runBenchmark(context, 'filter prefix with text', () => {
            parseSearchQuery('  @Updates  Microsoft.Extensions ');
        });
    });

    test('empty box', async (context) => {
        await runBenchmark(context, 'empty box', () => {
            parseSearchQuery('   ');
        });
    });
});

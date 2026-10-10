/**
 * Benchmarks for parseSearchQuery utility.
 * Tests all search mode detection paths.
 */
import { test, describe } from 'vitest';
import { runBenchmark } from './benchmark';
import { parseSearchQuery } from '../../webview/app/utils/parseSearchQuery';

describe('parseSearchQuery', () => {
    test('default mode (empty)', async (context) => {
        await runBenchmark(context, 'default mode (empty)', () => {
            parseSearchQuery('');
        });
    });

    test('browse mode (plain text)', async (context) => {
        await runBenchmark(context, 'browse mode (plain text)', () => {
            parseSearchQuery('Newtonsoft.Json');
        });
    });

    test('@installed prefix', async (context) => {
        await runBenchmark(context, '@installed prefix', () => {
            parseSearchQuery('@installed Newtonsoft');
        });
    });

    test('@updates prefix', async (context) => {
        await runBenchmark(context, '@updates prefix', () => {
            parseSearchQuery('@updates');
        });
    });

    test('@vulnerable prefix', async (context) => {
        await runBenchmark(context, '@vulnerable prefix', () => {
            parseSearchQuery('@vulnerable');
        });
    });

    test('partial @ prefix (dropdown trigger)', async (context) => {
        await runBenchmark(context, 'partial @ prefix (dropdown trigger)', () => {
            parseSearchQuery('@up');
        });
    });

    test('long query with spaces', async (context) => {
        await runBenchmark(context, 'long query with spaces', () => {
            parseSearchQuery('Microsoft.Extensions.DependencyInjection.Abstractions');
        });
    });
});

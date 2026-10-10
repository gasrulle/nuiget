// @vitest-environment jsdom
/**
 * Benchmarks for React component mount times.
 * Requires jsdom environment — skip in node env.
 */
import { test, describe } from 'vitest';
import { runBenchmark } from './benchmark';

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

if (hasDom) {
    describe('React component rendering', () => {
        test('parseSearchQuery (browse mode)', async (context) => {
            await runBenchmark(context, 'parseSearchQuery (browse mode)', async () => {
                const { parseSearchQuery } = await import('../../webview/app/utils/parseSearchQuery');
                parseSearchQuery('Newtonsoft.Json');
            });
        });

        test('parseSearchQuery (@installed)', async (context) => {
            await runBenchmark(context, 'parseSearchQuery (@installed)', async () => {
                const { parseSearchQuery } = await import('../../webview/app/utils/parseSearchQuery');
                parseSearchQuery('@installed Newtonsoft');
            });
        });

        test.skip('App mount (requires full webview mock)', async (context) => {
            await runBenchmark(context, 'App mount (requires full webview mock)', () => {
                // Full React mount benchmarks require extensive mocking
                // of vscode API, postMessage, etc. — deferred to UI tests.
            });
        });
    });
} else {
    describe('React component rendering', () => {
        test.skip('requires jsdom environment', async (context) => {
            await runBenchmark(context, 'requires jsdom environment', () => { });
        });
    });
}

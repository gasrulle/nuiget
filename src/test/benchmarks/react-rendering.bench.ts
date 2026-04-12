/**
 * Benchmarks for React component mount times.
 * Requires jsdom environment — skip in node env.
 */
import { bench, describe } from 'vitest';

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

if (hasDom) {
    describe('React component rendering', () => {
        bench('parseSearchQuery (browse mode)', async () => {
            const { parseSearchQuery } = await import('../../webview/app/utils/parseSearchQuery');
            parseSearchQuery('Newtonsoft.Json');
        });

        bench('parseSearchQuery (@installed)', async () => {
            const { parseSearchQuery } = await import('../../webview/app/utils/parseSearchQuery');
            parseSearchQuery('@installed Newtonsoft');
        });

        bench.skip('App mount (requires full webview mock)', () => {
            // Full React mount benchmarks require extensive mocking
            // of vscode API, postMessage, etc. — deferred to UI tests.
        });
    });
} else {
    describe('React component rendering', () => {
        bench.skip('requires jsdom environment', () => { });
    });
}

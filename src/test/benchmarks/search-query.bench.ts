/**
 * Benchmarks for parseSearchQuery utility.
 * Tests all search mode detection paths.
 */
import { bench, describe } from 'vitest';
import { parseSearchQuery } from '../../webview/app/utils/parseSearchQuery';

describe('parseSearchQuery', () => {
    bench('default mode (empty)', () => {
        parseSearchQuery('');
    });

    bench('browse mode (plain text)', () => {
        parseSearchQuery('Newtonsoft.Json');
    });

    bench('@installed prefix', () => {
        parseSearchQuery('@installed Newtonsoft');
    });

    bench('@updates prefix', () => {
        parseSearchQuery('@updates');
    });

    bench('@vulnerable prefix', () => {
        parseSearchQuery('@vulnerable');
    });

    bench('partial @ prefix (dropdown trigger)', () => {
        parseSearchQuery('@up');
    });

    bench('long query with spaces', () => {
        parseSearchQuery('Microsoft.Extensions.DependencyInjection.Abstractions');
    });
});

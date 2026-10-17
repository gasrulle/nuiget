import { describe, expect, it } from 'vitest';
import { relevanceTier, sortByRelevance, tokenizeQuery } from './relevance';

describe('search relevance', () => {
    it('tiers an id against a query: exact, prefix, substring, every token in a segment, the rest', () => {
        expect(relevanceTier('Serilog', 'serilog')).toBe(0);
        expect(relevanceTier('Serilog.Sinks.Console', 'Serilog')).toBe(1);
        expect(relevanceTier('Contoso.Serilog.Extras', 'serilog')).toBe(2);
        expect(relevanceTier('Microsoft.Extensions.Logging', 'extensions logging')).toBe(3);
        expect(relevanceTier('Newtonsoft.Json', 'serilog')).toBe(4);
        expect(relevanceTier('Serilog', '   ')).toBe(4);
        expect(tokenizeQuery('Microsoft.Extensions  Logging')).toEqual(['microsoft', 'extensions', 'logging']);
    });

    it('sorts by tier, then by downloads, keeps ties in order and leaves the input alone', () => {
        const results = [
            { id: 'Serilog.Sinks.File', totalDownloads: 100 },
            { id: 'Contoso.Serilog', totalDownloads: 5_000 },
            { id: 'Serilog.Sinks.Console', totalDownloads: 500 },
            { id: 'Serilog' },
            { id: 'Serilog.Extras.A', totalDownloads: 500 },
        ];
        const before = results.map(entry => entry.id);
        expect(sortByRelevance(results, 'serilog').map(entry => entry.id))
            .toEqual(['Serilog', 'Serilog.Sinks.Console', 'Serilog.Extras.A', 'Serilog.Sinks.File', 'Contoso.Serilog']);
        expect(results.map(entry => entry.id)).toEqual(before);
    });
});

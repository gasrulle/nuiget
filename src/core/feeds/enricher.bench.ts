/**
 * Benchmarks for the lite enricher (`src/core/feeds/enricher.ts`) that every installed list's icons and authors go through:
 * fifty packages enriched over a `FakeTransport` that answers at once, with the vulnerability data set already loaded, so
 * the numbers are the cost of the enricher and its one deadline per call (UX-P4.9, X33), not of a network.
 */
import { describe, test } from 'vitest';
import { runBenchmark } from '../../test/benchmarks/benchmark';
import * as enricherModule from './enricher';
import * as vulnerabilityModule from './vulnerability';
import { FakeTransport, json } from './testSupport';
import type { IconResolver, ResolvedSource } from './types';

// Bound once on purpose (see src/core/cache/cache.bench.ts): an imported binding is a getter under Vitest's module runner.
const { DefaultMetadataEnricher } = enricherModule;
const { DefaultVulnerabilityClient } = vulnerabilityModule;

const PACKAGES = 50;
const ids = Array.from({ length: PACKAGES }, (_, index) => `Bench.Package${index}`);
const source: ResolvedSource = {
    source: { name: 'bench', url: 'https://bench.example/v3/index.json', enabled: true },
    endpoints: { searchQueryService: 'https://bench.example/query', vulnerabilityInfoUrl: 'https://bench.example/vulnerability/index.json' },
};

/** The vulnerability index of two pages, every tenth package with one advisory, and a `packageid:` lookup per id. */
function handler(request: { url: string }) {
    const url = new URL(request.url);
    if (url.pathname === '/vulnerability/index.json') {
        return json([{ '@name': 'base', '@id': `${url.origin}/vulnerability/base.json` }, { '@name': 'update', '@id': `${url.origin}/vulnerability/update.json` }]);
    }
    if (url.pathname === '/vulnerability/base.json') {
        return json(Object.fromEntries(ids.filter((_, index) => index % 10 === 0).map(id => [id.toLowerCase(), [{ severity: 2, url: `https://advisories.example/${id}`, versions: '[1.0.0, 2.0.0)' }]])));
    }
    if (url.pathname === '/vulnerability/update.json') {
        return json({});
    }
    if (url.pathname === '/query') {
        const id = (url.searchParams.get('q') ?? '').replace('packageid:', '');
        return json({ data: [{ id, version: '1.0.0', authors: ['Bench'], verified: true }] });
    }
    return json({});
}

const transport = new FakeTransport(handler);
const vulnerabilities = new DefaultVulnerabilityClient({ transport });
const lookup = {
    lookup: async (_source: ResolvedSource, id: string) => ({ id, version: '1.0.0', authors: 'Bench', verified: true }),
};
const icons: IconResolver = { icon: async () => 'data:image/png;base64,AAAA' };
const enricher = new DefaultMetadataEnricher({ policy: { allowedSourcesFor: (_id, candidates) => candidates } }, lookup, icons, vulnerabilities);
const packages = ids.map(id => ({ id, version: '1.0.0' }));

describe('core feeds — lite enricher', () => {
    test(`DefaultMetadataEnricher.enrich (${PACKAGES} packages, vulnerability data loaded)`, async (context) => {
        // Loaded once before the timed loop: the bench measures the enrichment, not the first download.
        await vulnerabilities.forPackage([source], ids[0], '1.0.0');
        await runBenchmark(context, `DefaultMetadataEnricher.enrich (${PACKAGES} packages, vulnerability data loaded)`, async () => {
            await enricher.enrich([source], packages);
        });
    });
});

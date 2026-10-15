/**
 * Benchmarks for the 2.0 feed reads (`src/core/catalog` over `src/core/feeds`): `Catalog.updates`, `Catalog.versions`
 * and `Catalog.search`, each through the real feed clients, the real service index and a `FakeTransport` that answers
 * at once, so the numbers are the cost of the core itself, not of a network. Each iteration recomputes: the resource is
 * invalidated first. Plus two pure paths the reads take for every row: nuspec parsing and relevance ranking.
 */
import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, test, vi } from 'vitest';
import * as cacheModule from '../../core/cache';
import * as catalogModule from '../../core/catalog';
import type { DotnetRunner, SourceProvider } from '../../core/contracts';
import * as feedsModule from '../../core/feeds';
import { FakeTransport, json } from '../../core/feeds/testSupport';
import * as queriesModule from '../../core/queries';
import type { InstalledResult, NuGetSource, Project } from '../../protocol/domain';
import { runBenchmark } from './benchmark';

// Bound once on purpose (see core-cache.bench.ts): an imported binding is a getter under Vitest's module runner.
const { TieredCache } = cacheModule;
const { Catalog, FeedContexts, createFeedClients } = catalogModule;
const { DefaultServiceIndexClient, parseNuspec, sortByRelevance } = feedsModule;
const { DefaultQueryCoordinator } = queriesModule;

const PACKAGES = 50;
const projectPath = path.resolve('/bench/App/App.csproj');
const project: Project = { name: 'App.csproj', path: projectPath };
const feeds: NuGetSource[] = ['one', 'two', 'three'].map(name => ({ name, url: `https://${name}.example/v3/index.json`, enabled: true }));
const ids = Array.from({ length: PACKAGES }, (_, index) => `Bench.Package${index}`);
const installed: InstalledResult = {
    projectPath,
    fidelity: 'provisional',
    isCpm: false,
    packages: ids.map(id => ({ id, version: '1.0.0', versionType: 'standard', declaration: 'project' })),
};

/** One answer per URL shape: a service index, a `packageid:` lookup, free-text search and a flat version index. */
function handler(request: { url: string }) {
    const url = new URL(request.url);
    if (url.pathname === '/v3/index.json') {
        return json({ version: '3.0.0', resources: [
            { '@id': `${url.origin}/query`, '@type': 'SearchQueryService' },
            { '@id': `${url.origin}/flat/`, '@type': 'PackageBaseAddress/3.0.0' },
        ] });
    }
    if (url.pathname === '/query') {
        const q = url.searchParams.get('q') ?? '';
        const id = q.startsWith('packageid:') ? q.slice('packageid:'.length) : undefined;
        const rows = id
            ? [{ id, version: '2.0.0', versions: ['1.0.0', '1.5.0', '2.0.0'].map(version => ({ version })), authors: ['Bench'] }]
            : ids.slice(0, 20).map((rowId, index) => ({ id: `${url.hostname}.${rowId}`, version: '1.0.0', totalDownloads: index * 100, authors: ['Bench'] }));
        return json({ data: rows });
    }
    if (url.pathname.endsWith('/index.json')) {
        return json({ versions: Array.from({ length: 40 }, (_, index) => `1.${index}.0`) });
    }
    return json({});
}

function benchCatalog() {
    const transport = new FakeTransport(handler);
    const runner = { run: vi.fn(), sdkVersion: vi.fn(), clearSdkCache: vi.fn() } as unknown as DotnetRunner;
    const credentials = { getAuthHeader: async () => undefined, prewarm: () => undefined, clear: () => undefined };
    const serviceIndex = new DefaultServiceIndexClient({ transport, getAuthHeader: async () => undefined });
    const feedClients = createFeedClients({ transport, runner, serviceIndex, credentials, cache: new TieredCache(), globalPackagesFolder: async () => undefined });
    const unused = async () => ({ ok: true });
    const sources: SourceProvider = { listSources: async () => feeds, configFiles: () => [], add: unused, remove: unused, enable: unused, disable: unused, invalidate: () => undefined };
    const contexts = {
        get: async () => ({ context: { projectPath, projectDir: path.dirname(projectPath), configFiles: [], sourceUrls: feeds.map(feed => feed.url), revision: 'bench' } }),
        configFilesFor: async () => [],
    };
    const feedContexts = new FeedContexts({ contexts, sources, configs: { readChain: async () => [] }, feeds: feedClients });
    const catalog = new Catalog({
        coordinator: new DefaultQueryCoordinator(),
        inspector: { inspect: async () => installed },
        contexts,
        sources,
        assets: { getPackageDependencies: async () => new Map(), getTransitivePackages: async () => ({ projectPath, frameworks: [], dataSourceAvailable: true }) },
        discoverProjects: async () => [project],
        feeds: feedClients,
        feedContexts,
    });
    return catalog;
}

describe('core feeds — Catalog reads over a fake transport', () => {
    const catalog = benchCatalog();
    const directory = path.dirname(projectPath);
    const signal = new AbortController().signal;

    test(`Catalog.updates (${PACKAGES} packages, 3 sources, enriched)`, async (context) => {
        await runBenchmark(context, `Catalog.updates (${PACKAGES} packages, 3 sources, enriched)`, async () => {
            catalog.invalidate({ kind: 'project', projectPaths: [projectPath] }, 'manual-refresh');
            await catalog.updates(projectPath, false);
        });
    });

    test('Catalog.versions (3 sources, one resource each)', async (context) => {
        await runBenchmark(context, 'Catalog.versions (3 sources, one resource each)', async () => {
            catalog.invalidate({ kind: 'metadata', packageIds: ['Bench.Package0'] }, 'manual-refresh');
            await catalog.versions(directory, 'Bench.Package0', undefined, false, signal);
        });
    });

    test('Catalog.search (3 sources, 60 rows merged and enriched)', async (context) => {
        await runBenchmark(context, 'Catalog.search (3 sources, 60 rows merged and enriched)', async () => {
            await catalog.search(directory, { query: 'bench', includePrerelease: false, take: 50 }, () => undefined, signal);
        });
    });
});

describe('core feeds — pure paths', () => {
    const nuspec = readFileSync(path.join(__dirname, '../../core/feeds/__fixtures__/newtonsoft.json.13.0.3.nuspec'), 'utf8');
    const rows = Array.from({ length: 200 }, (_, index) => ({ id: index % 3 === 0 ? `Contoso.Logging.Part${index}` : `Other.Package${index}`, totalDownloads: index * 37 }));

    test('parseNuspec (Newtonsoft.Json 13.0.3)', async (context) => {
        await runBenchmark(context, 'parseNuspec (Newtonsoft.Json 13.0.3)', async () => {
            parseNuspec(nuspec);
        });
    });

    test('sortByRelevance (200 rows)', async (context) => {
        await runBenchmark(context, 'sortByRelevance (200 rows)', async () => {
            sortByRelevance(rows, 'contoso logging');
        });
    });
});

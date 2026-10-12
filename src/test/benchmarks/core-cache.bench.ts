/**
 * Benchmarks for the 2.0 cache module (`src/core/cache`): the memory tier, writes through to a
 * persistent store with the byte budget, and the invalidation helpers.
 */
import { test, describe } from 'vitest';
import { runBenchmark } from './benchmark';
import * as cacheModule from '../../core/cache';
import type { KeyValueStore } from '../../core/contracts';

// Bound once on purpose. Under Vitest's module runner an imported binding is a getter on the module object;
// calling it inside a benchmark would add that overhead to every sample (Vitest warns about it).
const { TieredCache, cacheKeys, invalidationToCacheScopes } = cacheModule;

const FEED = 'https://api.nuget.org/v3/index.json';
const VERSIONS = Array.from({ length: 40 }, (_, index) => `${1 + Math.floor(index / 10)}.${index % 10}.0`);

/** In-memory stand-in for the workspace `Memento`; resolves at once so only the cache is measured. */
class MemoryStore implements KeyValueStore {
    private readonly data = new Map<string, unknown>();

    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue?: T): T | undefined {
        return this.data.has(key) ? (this.data.get(key) as T) : defaultValue;
    }

    update(key: string, value: unknown): PromiseLike<void> {
        if (value === undefined) {
            this.data.delete(key);
        } else {
            this.data.set(key, value);
        }
        return Promise.resolve();
    }
}

function filledCache(packages: number, store?: KeyValueStore): InstanceType<typeof TieredCache> {
    const cache = new TieredCache({ store, maxMemoryEntries: packages * 4 });
    for (let index = 0; index < packages; index++) {
        const packageId = `Package.${index}`;
        cache.set(cacheKeys.versions(packageId, FEED, false, true), VERSIONS, 'versions');
        cache.set(cacheKeys.metadata(packageId, '1.0.0', FEED), { id: packageId, description: 'x'.repeat(200) }, 'metadata');
    }
    return cache;
}

describe('core cache — memory tier', () => {
    const cache = filledCache(200);
    const hitKey = cacheKeys.versions('Package.100', FEED, false, true);
    const missKey = cacheKeys.versions('Package.Missing', FEED, false, true);

    test('get hit', async (context) => {
        await runBenchmark(context, 'get hit', () => {
            cache.get(hitKey);
        });
    });

    test('get miss', async (context) => {
        await runBenchmark(context, 'get miss', () => {
            cache.get(missKey);
        });
    });

    test('set versions (memory only)', async (context) => {
        await runBenchmark(context, 'set versions (memory only)', () => {
            cache.set(hitKey, VERSIONS, 'versions');
        });
    });
});

describe('core cache — persistent tier', () => {
    const cache = filledCache(200, new MemoryStore());
    const key = cacheKeys.versions('Package.100', FEED, false, true);
    const icon = `data:image/png;base64,${'A'.repeat(32 * 1024)}`;
    const iconKey = cacheKeys.icon('Package.100', '1.0.0', FEED);

    test('set versions (written through, 200 persisted entries)', async (context) => {
        await runBenchmark(context, 'set versions (written through, 200 persisted entries)', () => {
            cache.set(key, VERSIONS, 'versions');
        });
    });

    test('set 32 KB icon (written through)', async (context) => {
        await runBenchmark(context, 'set 32 KB icon (written through)', () => {
            cache.set(iconKey, icon, 'iconFound');
        });
    });
});

describe('core cache — invalidation', () => {
    test('clearPackages for 5 of 200 packages', async (context) => {
        const cache = filledCache(200);
        const packageIds = ['Package.1', 'Package.50', 'Package.100', 'Package.150', 'Package.199'];
        await runBenchmark(context, 'clearPackages for 5 of 200 packages', () => {
            cache.clearPackages(packageIds);
        });
    });

    test('deleteByPrefix without a match over 400 entries', async (context) => {
        const cache = filledCache(200);
        await runBenchmark(context, 'deleteByPrefix without a match over 400 entries', () => {
            cache.deleteByPrefix('search:');
        });
    });

    test('invalidationToCacheScopes package scope', async (context) => {
        await runBenchmark(context, 'invalidationToCacheScopes package scope', () => {
            invalidationToCacheScopes({ kind: 'package', projectPaths: ['/w/App/App.csproj'], packageIds: ['Serilog', 'Polly'] });
        });
    });
});

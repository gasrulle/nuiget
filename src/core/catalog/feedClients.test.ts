import { describe, expect, it, vi } from 'vitest';
import { cacheKeys, ttlFor } from '../cache/CachePolicy';
import { TieredCache } from '../cache/TieredCache';
import type { PackageMetadataLite, PackageSearchResult } from '../../protocol/domain';
import type { DotnetRunner } from '../contracts';
import type { DeprecationFetch, ResolvedSource, SearchByIdFetch, ServiceIndexClient } from '../feeds';
import { FakeTransport, fail, json } from '../feeds/testSupport';
import { createFeedClients, deprecationLookup, liteLookup } from './feedClients';

const source = (name: string): ResolvedSource => ({ source: { name, url: `https://${name}.example/v3/index.json`, enabled: true }, endpoints: {} });

/** The search row whose lite metadata is `lite` (fields `lite` leaves out stay out). */
const rowOf = (lite: PackageMetadataLite): PackageSearchResult => ({ ...lite, versions: [lite.version] }) as PackageSearchResult;

describe('liteLookup', () => {
    it('liteLookup caches a lookup answer and a miss per source under the lite kind and asks again after the lifetime', async () => {
        let now = 1_000;
        const cache = new TieredCache({ now: () => now });
        const set = vi.spyOn(cache, 'set');
        const known: PackageMetadataLite = { id: 'Lib', version: '1.0.0', authors: 'Ada' };
        const lookup = vi.fn(async (src: ResolvedSource): Promise<SearchByIdFetch> => (src.source.name === 'a' ? { kind: 'found', result: rowOf(known) } : { kind: 'missing' }));
        const cached = liteLookup({ searchById: lookup }, cache);

        await expect(cached.lookup(source('a'), 'Lib')).resolves.toEqual(known);
        await expect(cached.lookup(source('b'), 'Lib')).resolves.toBeUndefined();
        await expect(cached.lookup(source('a'), 'lib')).resolves.toEqual(known);
        await expect(cached.lookup(source('b'), 'Lib')).resolves.toBeUndefined();
        expect(lookup).toHaveBeenCalledTimes(2);
        expect(set.mock.calls.map(call => [call[1], call[2]])).toEqual([[known, 'lite'], [null, 'lite']]);

        now += ttlFor('lite') + 1;
        await cached.lookup(source('a'), 'Lib');
        await cached.lookup(source('b'), 'Lib');
        expect(lookup).toHaveBeenCalledTimes(4);

        const aborted = new AbortController();
        aborted.abort();
        cache.clear();
        await cached.lookup(source('a'), 'Other', aborted.signal);
        expect(set).toHaveBeenCalledTimes(4);
    });

    it('transient lookup failure is not cached: a source that could not answer is asked again, and nothing is persisted (P9.1)', async () => {
        const cache = new TieredCache({ now: () => 1_000 });
        const set = vi.spyOn(cache, 'set');
        const known: PackageMetadataLite = { id: 'Lib', version: '1.0.0', authors: 'Ada', description: 'A library' };
        const answers: SearchByIdFetch[] = [
            { kind: 'failed', reason: 'timeout' },
            { kind: 'failed', reason: 'http-error 429' },
            { kind: 'found', result: rowOf(known) },
        ];
        const searchById = vi.fn(async (): Promise<SearchByIdFetch> => answers.shift() ?? { kind: 'missing' });
        const cached = liteLookup({ searchById }, cache);

        await expect(cached.lookup(source('a'), 'Lib')).resolves.toBeUndefined();
        await expect(cached.lookup(source('a'), 'Lib')).resolves.toBeUndefined();
        expect(set).not.toHaveBeenCalled();
        await expect(cached.lookup(source('a'), 'Lib')).resolves.toEqual(known);
        await expect(cached.lookup(source('a'), 'Lib')).resolves.toEqual(known);
        expect(searchById).toHaveBeenCalledTimes(3);
        expect(set.mock.calls.map(call => [call[1], call[2]])).toEqual([[known, 'lite']]);
    });
});

describe('deprecationLookup (UX-P5.2a)', () => {
    const LEGACY = { reasons: ['Legacy'] };

    it('the deprecation lookup keeps found and missing answers and never a failure', async () => {
        let now = 1_000;
        const cache = new TieredCache({ now: () => now });
        const set = vi.spyOn(cache, 'set');
        const answers: Record<string, DeprecationFetch[]> = {
            'a/Lib@1.0.0': [{ kind: 'found', deprecation: LEGACY }],
            'a/Lib@2.0.0': [{ kind: 'found' }],
            'b/Lib@1.0.0': [{ kind: 'missing' }],
            'c/Lib@1.0.0': [{ kind: 'failed' }, { kind: 'failed' }, { kind: 'found' }],
        };
        const deprecation = vi.fn(async (src: ResolvedSource, id: string, version: string): Promise<DeprecationFetch> => (answers[`${src.source.name}/${id}@${version}`] ?? []).shift() ?? { kind: 'missing' });
        const cached = deprecationLookup({ deprecation }, cache);

        for (let round = 0; round < 2; round += 1) {
            await expect(cached.deprecation(source('a'), 'Lib', '1.0.0')).resolves.toEqual({ kind: 'found', deprecation: LEGACY });
            // The second round asks with another casing of the id: the same entry answers it.
            await expect(cached.deprecation(source('a'), round === 0 ? 'Lib' : 'lib', '2.0.0')).resolves.toEqual({ kind: 'found' });
            await expect(cached.deprecation(source('b'), 'Lib', '1.0.0')).resolves.toEqual({ kind: 'missing' });
        }
        expect(deprecation).toHaveBeenCalledTimes(3);
        await expect(cached.deprecation(source('c'), 'Lib', '1.0.0')).resolves.toEqual({ kind: 'failed' });
        await expect(cached.deprecation(source('c'), 'Lib', '1.0.0')).resolves.toEqual({ kind: 'failed' });
        await expect(cached.deprecation(source('c'), 'Lib', '1.0.0')).resolves.toEqual({ kind: 'found' });
        expect(deprecation).toHaveBeenCalledTimes(6);
        expect(set.mock.calls.map(call => [call[1], call[2]])).toEqual([
            [{ kind: 'found', deprecation: LEGACY }, 'metadata'],
            [{ kind: 'found' }, 'metadata'],
            [{ kind: 'missing' }, 'metadata'],
            [{ kind: 'found' }, 'metadata'],
        ]);
        expect(set.mock.calls.map(call => call[0])).toEqual([
            cacheKeys.metadata('Lib', '1.0.0', source('a').source.url),
            cacheKeys.metadata('Lib', '2.0.0', source('a').source.url),
            cacheKeys.metadata('Lib', '1.0.0', source('b').source.url),
            cacheKeys.metadata('Lib', '1.0.0', source('c').source.url),
        ]);

        // After the kind's lifetime the source is asked again; an answer read after the caller cancelled is not kept.
        now += ttlFor('metadata') + 1;
        await cached.deprecation(source('a'), 'Lib', '1.0.0');
        expect(deprecation).toHaveBeenCalledTimes(7);
        expect(set).toHaveBeenCalledTimes(5);
        const aborted = new AbortController();
        aborted.abort();
        await cached.deprecation(source('b'), 'Other', '1.0.0', aborted.signal);
        expect(deprecation).toHaveBeenCalledTimes(8);
        expect(set).toHaveBeenCalledTimes(5);
    });

    it('the search enricher reads no registration', async () => {
        const transport = new FakeTransport(request => request.url.includes('/registration/')
            ? json({ catalogEntry: { id: 'Lib', version: '1.0.0', deprecation: { reasons: ['Legacy'] } } })
            : fail('http-error', 404));
        const store = new Map<string, unknown>();
        const feeds = createFeedClients({
            transport,
            runner: { run: vi.fn(), sdkVersion: vi.fn(), clearSdkCache: vi.fn() } as unknown as DotnetRunner,
            serviceIndex: { clearCaches: vi.fn() } as unknown as ServiceIndexClient,
            credentials: { getAuthHeader: vi.fn(async () => undefined), prewarm: vi.fn(), clear: vi.fn() },
            cache: { get: <T>(key: string) => store.get(key) as T | undefined, set: (key: string, value: unknown) => void store.set(key, value) },
            globalPackagesFolder: async () => undefined,
        });
        const clients = feeds.forPolicy({ allowedSourcesFor: (_id, candidates) => candidates });
        const resolved: ResolvedSource[] = [{ source: { name: 'feed', url: 'https://feed.example/v3/index.json', enabled: true }, endpoints: { registrationsBaseUrl: 'https://feed.example/registration/' } }];

        const [browse] = await clients.searchEnricher.enrich(resolved, [{ id: 'Lib', version: '1.0.0' }]);
        expect(transport.urls().filter(url => url.includes('/registration/'))).toEqual([]);
        expect(browse).not.toHaveProperty('deprecation');
        const [installed] = await clients.enricher.enrich(resolved, [{ id: 'Lib', version: '1.0.0' }]);
        expect(transport.urls().filter(url => url.includes('/registration/'))).toEqual(['https://feed.example/registration/lib/1.0.0.json']);
        expect(installed.deprecation).toEqual({ reasons: ['Legacy'] });
    });
});

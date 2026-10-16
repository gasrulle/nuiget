import { describe, expect, it, vi } from 'vitest';
import { ttlFor } from '../cache/CachePolicy';
import { TieredCache } from '../cache/TieredCache';
import type { PackageMetadataLite, PackageSearchResult } from '../../protocol/domain';
import type { ResolvedSource, SearchByIdFetch } from '../feeds';
import { liteLookup } from './feedClients';

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

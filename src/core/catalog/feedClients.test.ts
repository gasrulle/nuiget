import { describe, expect, it, vi } from 'vitest';
import { ttlFor } from '../cache/CachePolicy';
import { TieredCache } from '../cache/TieredCache';
import type { PackageMetadataLite } from '../../protocol/domain';
import type { ResolvedSource } from '../feeds';
import { liteLookup } from './feedClients';

const source = (name: string): ResolvedSource => ({ source: { name, url: `https://${name}.example/v3/index.json`, enabled: true }, endpoints: {} });

describe('liteLookup', () => {
    it('liteLookup caches a lookup answer and a miss per source under the lite kind and asks again after the lifetime', async () => {
        let now = 1_000;
        const cache = new TieredCache({ now: () => now });
        const set = vi.spyOn(cache, 'set');
        const known: PackageMetadataLite = { id: 'Lib', version: '1.0.0', authors: 'Ada' };
        const lookup = vi.fn(async (src: ResolvedSource) => (src.source.name === 'a' ? known : undefined));
        const cached = liteLookup({ lookup }, cache);

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
});

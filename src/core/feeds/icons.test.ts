import { describe, expect, it, vi } from 'vitest';
import type { OutboundPolicy } from '../contracts';
import {
    DefaultIconResolver,
    ICON_FOUND_TTL_MS,
    ICON_MISS_TTL_MS,
    ICON_SOURCE_MISS_THRESHOLD,
    MAX_ICON_BYTES,
    MemoryIconCache,
    TieredCacheIconCache,
    iconCacheKey,
} from './icons';
import { TieredCache } from '../cache/TieredCache';
import type { FlatContainerClient, IconFetch, ResolvedSource } from './types';

type IconResponse = { contentType: string; body: Buffer } | undefined;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(8, 2)]);
const GIF = Buffer.from('GIF89a\u0001\u0000', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4, 0), Buffer.from('WEBP', 'latin1'), Buffer.alloc(4, 3)]);
const ICO = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
const BMP = Buffer.from('BM\u0000\u0000\u0000\u0000', 'latin1');
const SVG = Buffer.from('\uFEFF<?xml version="1.0"?>\n<!-- hi -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');

function source(url: string): ResolvedSource {
    return { source: { name: url, url, enabled: true }, endpoints: { packageBaseAddress: `${url}/flat/` } };
}

const allowAll: OutboundPolicy = { allowedSourcesFor: (_id, candidates) => candidates };

function fakeFlat(icon: FlatContainerClient['icon']): FlatContainerClient & { icon: ReturnType<typeof vi.fn> } {
    return {
        icon: vi.fn(icon) as FlatContainerClient['icon'] & ReturnType<typeof vi.fn>,
        versionIndex: vi.fn(async () => undefined),
        nuspec: vi.fn(async () => undefined),
        packageSize: vi.fn(async () => undefined),
        downloadPackage: vi.fn(async () => undefined),
    };
}

/** The flat container's answer for an icon response of the quarry's tests (P4.3 made `icon()` return `IconFetch`). */
const asFetch = (response: IconResponse): IconFetch => (response === undefined ? { kind: 'missing' } : { kind: 'found', ...response });

function flatAnswering(answers: Record<string, IconResponse | Error | IconFetch>): ReturnType<typeof fakeFlat> {
    return fakeFlat(async src => {
        const answer = answers[src.source.url];
        if (answer instanceof Error) {
            throw answer;
        }
        return answer !== undefined && 'kind' in answer ? answer : asFetch(answer);
    });
}

const A = source('https://a.example/v3/index.json');
const B = source('https://b.example/v3/index.json');

describe('TieredCacheIconCache', () => {
    it('stores a found icon as iconFound and a miss as iconMissing, so the cache policy decides lifetimes and persistence', () => {
        let now = 0;
        const tiered = new TieredCache({ now: () => now });
        const cache = new TieredCacheIconCache(tiered);
        const set = vi.spyOn(tiered, 'set');
        cache.set('icon:a', 'data:image/png;base64,AA==', ICON_FOUND_TTL_MS);
        cache.set('icon:b', null, ICON_MISS_TTL_MS);
        expect(set.mock.calls.map(call => [call[0], call[2]])).toEqual([['icon:a', 'iconFound'], ['icon:b', 'iconMissing']]);
        expect(cache.get('icon:a')).toBe('data:image/png;base64,AA==');
        expect(cache.get('icon:b')).toBeNull();
        expect(cache.get('icon:c')).toBeUndefined();
        // A miss is retried after a day; a found icon stays.
        now = 24 * 60 * 60 * 1000 + 1;
        expect(cache.get('icon:b')).toBeUndefined();
        expect(cache.get('icon:a')).toBe('data:image/png;base64,AA==');
    });
});

describe('MemoryIconCache', () => {
    it('returns undefined for unknown keys and distinguishes a cached miss (null) from a hit', () => {
        const cache = new MemoryIconCache(10, () => 1000);
        expect(cache.get('k')).toBeUndefined();
        cache.set('k', null, 500);
        expect(cache.get('k')).toBeNull();
        cache.set('k', 'data:image/png;base64,AA==', 500);
        expect(cache.get('k')).toBe('data:image/png;base64,AA==');
    });

    it('expires entries after their TTL and keeps infinite-TTL entries forever', () => {
        let now = 1000;
        const cache = new MemoryIconCache(10, () => now);
        cache.set('miss', null, 500);
        cache.set('hit', 'data:x', Number.POSITIVE_INFINITY);
        now = 1499;
        expect(cache.get('miss')).toBeNull();
        now = 1500;
        expect(cache.get('miss')).toBeUndefined();
        expect(cache.size).toBe(1);
        now = Number.MAX_SAFE_INTEGER;
        expect(cache.get('hit')).toBe('data:x');
    });

    it('treats a non-positive TTL as a delete', () => {
        const cache = new MemoryIconCache(10, () => 0);
        cache.set('k', 'data:x', 100);
        cache.set('k', 'data:y', 0);
        expect(cache.get('k')).toBeUndefined();
        expect(cache.size).toBe(0);
    });

    it('evicts the oldest entry when the capacity is reached', () => {
        const cache = new MemoryIconCache(2, () => 0);
        cache.set('a', 'data:a', 100);
        cache.set('b', 'data:b', 100);
        cache.set('c', 'data:c', 100);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe('data:b');
        expect(cache.get('c')).toBe('data:c');
        cache.clear();
        expect(cache.size).toBe(0);
    });
});

describe('iconCacheKey', () => {
    it('lower-cases id and version and canonicalizes the source URL', () => {
        expect(iconCacheKey('Newtonsoft.Json', '13.0.3', 'https://A.example/v3/index.json/')).toBe('icon:newtonsoft.json@13.0.3|https://a.example/v3/index.json');
    });
});

describe('DefaultIconResolver', () => {
    it('does not query any source for floating or range versions', async () => {
        const flat = flatAnswering({});
        const resolver = new DefaultIconResolver(flat, new MemoryIconCache(), allowAll);
        await expect(resolver.icon([A], 'Pkg', '1.*')).resolves.toBeUndefined();
        await expect(resolver.icon([A], 'Pkg', '[1.0,2.0)')).resolves.toBeUndefined();
        await expect(resolver.icon([A], 'Pkg', '')).resolves.toBeUndefined();
        expect(flat.icon).not.toHaveBeenCalled();
    });

    it('returns undefined without network when the signal is already aborted', async () => {
        const flat = flatAnswering({ [A.source.url]: { contentType: 'image/png', body: PNG } });
        const resolver = new DefaultIconResolver(flat, new MemoryIconCache(), allowAll);
        const controller = new AbortController();
        controller.abort();
        await expect(resolver.icon([A], 'Pkg', '1.0.0', controller.signal)).resolves.toBeUndefined();
        expect(flat.icon).not.toHaveBeenCalled();
    });

    it('asks allowed sources in order and stops at the first icon', async () => {
        const flat = flatAnswering({
            [A.source.url]: { contentType: 'image/png', body: PNG },
            [B.source.url]: { contentType: 'image/png', body: PNG },
        });
        const resolver = new DefaultIconResolver(flat, new MemoryIconCache(), allowAll);
        const icon = await resolver.icon([A, B], 'Pkg', '1.0.0');
        expect(icon).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
        expect(flat.icon).toHaveBeenCalledTimes(1);
        expect(flat.icon).toHaveBeenCalledWith(A, 'Pkg', '1.0.0', expect.any(AbortSignal));
    });

    it('falls through to the next source on a miss and caches each outcome with its TTL', async () => {
        const flat = flatAnswering({
            [A.source.url]: undefined,
            [B.source.url]: { contentType: 'image/jpeg', body: JPEG },
        });
        const cache = new MemoryIconCache();
        const set = vi.spyOn(cache, 'set');
        const resolver = new DefaultIconResolver(flat, cache, allowAll);

        const icon = await resolver.icon([A, B], 'Pkg', '1.0.0');

        expect(icon).toBe(`data:image/jpeg;base64,${JPEG.toString('base64')}`);
        expect(flat.icon.mock.calls.map(call => (call[0] as ResolvedSource).source.url)).toEqual([A.source.url, B.source.url]);
        expect(set).toHaveBeenCalledWith(iconCacheKey('Pkg', '1.0.0', A.source.url), null, ICON_MISS_TTL_MS);
        expect(set).toHaveBeenCalledWith(iconCacheKey('Pkg', '1.0.0', B.source.url), icon, ICON_FOUND_TTL_MS);
        expect(ICON_FOUND_TTL_MS).toBe(Number.POSITIVE_INFINITY);
    });

    it('serves a cached hit without touching the network', async () => {
        const flat = flatAnswering({});
        const cache = new MemoryIconCache();
        cache.set(iconCacheKey('pkg', '1.0.0', B.source.url), 'data:image/png;base64,QQ==', ICON_FOUND_TTL_MS);
        const resolver = new DefaultIconResolver(flat, cache, allowAll);

        await expect(resolver.icon([A, B], 'Pkg', '1.0.0')).resolves.toBe('data:image/png;base64,QQ==');
        expect(flat.icon).not.toHaveBeenCalled();
    });

    it('skips sources with a cached miss and resolves undefined when every source is a known miss', async () => {
        const flat = flatAnswering({ [B.source.url]: undefined });
        const cache = new MemoryIconCache();
        cache.set(iconCacheKey('Pkg', '1.0.0', A.source.url), null, ICON_MISS_TTL_MS);
        const resolver = new DefaultIconResolver(flat, cache, allowAll);

        await expect(resolver.icon([A, B], 'Pkg', '1.0.0')).resolves.toBeUndefined();
        expect(flat.icon).toHaveBeenCalledTimes(1);
        expect(flat.icon).toHaveBeenCalledWith(B, 'Pkg', '1.0.0', expect.any(AbortSignal));

        flat.icon.mockClear();
        await expect(resolver.icon([A, B], 'Pkg', '1.0.0')).resolves.toBeUndefined();
        expect(flat.icon).not.toHaveBeenCalled();
    });

    it('never contacts a source the outbound policy disallows for the package', async () => {
        const flat = flatAnswering({
            [A.source.url]: { contentType: 'image/png', body: PNG },
            [B.source.url]: { contentType: 'image/png', body: PNG },
        });
        const privateOnly: OutboundPolicy = {
            allowedSourcesFor: (_id, candidates) => candidates.filter(c => c.url === B.source.url),
        };
        const resolver = new DefaultIconResolver(flat, new MemoryIconCache(), privateOnly);

        await resolver.icon([A, B], 'Private.Pkg', '1.0.0');

        expect(flat.icon).toHaveBeenCalledTimes(1);
        expect(flat.icon).toHaveBeenCalledWith(B, 'Private.Pkg', '1.0.0', expect.any(AbortSignal));

        const nothingAllowed: OutboundPolicy = { allowedSourcesFor: () => [] };
        const strict = new DefaultIconResolver(flat, new MemoryIconCache(), nothingAllowed);
        flat.icon.mockClear();
        await expect(strict.icon([A, B], 'Private.Pkg', '1.0.0')).resolves.toBeUndefined();
        expect(flat.icon).not.toHaveBeenCalled();
    });

    it('suppresses a source after consecutive misses until reset(), and a hit clears the counter', async () => {
        const flat = flatAnswering({ [A.source.url]: undefined });
        const resolver = new DefaultIconResolver(flat, new MemoryIconCache(), allowAll);

        for (let i = 0; i < ICON_SOURCE_MISS_THRESHOLD; i++) {
            await resolver.icon([A], 'Pkg', `1.0.${i}`);
            expect(resolver.isSourceSuppressed(A.source.url)).toBe(i === ICON_SOURCE_MISS_THRESHOLD - 1);
        }
        expect(flat.icon).toHaveBeenCalledTimes(ICON_SOURCE_MISS_THRESHOLD);

        await expect(resolver.icon([A], 'Pkg', '2.0.0')).resolves.toBeUndefined();
        expect(flat.icon).toHaveBeenCalledTimes(ICON_SOURCE_MISS_THRESHOLD);

        resolver.reset();
        expect(resolver.isSourceSuppressed(A.source.url)).toBe(false);
        flat.icon.mockImplementation(async () => asFetch({ contentType: 'image/png', body: PNG }));
        await expect(resolver.icon([A], 'Pkg', '2.0.0')).resolves.toContain('data:image/png;base64,');
        expect(flat.icon).toHaveBeenCalledTimes(ICON_SOURCE_MISS_THRESHOLD + 1);

        flat.icon.mockImplementation(async () => asFetch(undefined));
        for (let i = 0; i < ICON_SOURCE_MISS_THRESHOLD - 1; i++) {
            await resolver.icon([A], 'Pkg', `3.0.${i}`);
        }
        expect(resolver.isSourceSuppressed(A.source.url)).toBe(false);
        flat.icon.mockImplementation(async () => asFetch({ contentType: 'image/png', body: PNG }));
        await resolver.icon([A], 'Pkg', '4.0.0');
        flat.icon.mockImplementation(async () => asFetch(undefined));
        for (let i = 0; i < ICON_SOURCE_MISS_THRESHOLD - 1; i++) {
            await resolver.icon([A], 'Pkg', `5.0.${i}`);
        }
        expect(resolver.isSourceSuppressed(A.source.url)).toBe(false);
    });

    it('deduplicates concurrent requests for the same package version and sources', async () => {
        let release: (value: IconResponse) => void = () => undefined;
        const flat = fakeFlat(() => new Promise<IconResponse>(resolve => { release = resolve; }).then(asFetch));
        const resolver = new DefaultIconResolver(flat, new MemoryIconCache(), allowAll);

        const first = resolver.icon([A], 'Pkg', '1.0.0');
        const second = resolver.icon([A], 'pkg', '1.0.0');
        expect(flat.icon).toHaveBeenCalledTimes(1);

        release({ contentType: 'image/png', body: PNG });
        const [one, two] = await Promise.all([first, second]);
        expect(one).toBe(two);
        expect(one).toContain('data:image/png;base64,');

        await resolver.icon([A], 'Pkg', '1.0.0');
        expect(flat.icon).toHaveBeenCalledTimes(1);
    });

    it('treats a thrown transport error as transient: no cache entry, no breaker count, next source still asked', async () => {
        const flat = flatAnswering({
            [A.source.url]: new Error('ECONNRESET'),
            [B.source.url]: { contentType: 'image/gif', body: GIF },
        });
        const cache = new MemoryIconCache();
        const resolver = new DefaultIconResolver(flat, cache, allowAll);

        await expect(resolver.icon([A, B], 'Pkg', '1.0.0')).resolves.toBe(`data:image/gif;base64,${GIF.toString('base64')}`);
        expect(cache.get(iconCacheKey('Pkg', '1.0.0', A.source.url))).toBeUndefined();
        expect(resolver.isSourceSuppressed(A.source.url)).toBe(false);
    });

    it('stops iterating sources once the signal aborts', async () => {
        const controller = new AbortController();
        const flat = fakeFlat(async () => {
            controller.abort();
            return asFetch(undefined);
        });
        const resolver = new DefaultIconResolver(flat, new MemoryIconCache(), allowAll);

        await expect(resolver.icon([A, B], 'Pkg', '1.0.0', controller.signal)).resolves.toBeUndefined();
        expect(flat.icon).toHaveBeenCalledTimes(1);
    });

    it('a feed that could not answer is no miss: nothing cached, no breaker count, the next source asked (C-feeds-2)', async () => {
        const cache = new MemoryIconCache();
        const flat = flatAnswering({
            [A.source.url]: { kind: 'failed', reason: 'timeout' },
            [B.source.url]: { kind: 'missing' },
        });
        const resolver = new DefaultIconResolver(flat, cache, allowAll);
        await expect(resolver.icon([A, B], 'Pkg', '1.0.0')).resolves.toBeUndefined();
        // A transient outage leaves no 24 h miss behind; the feed that answered "no icon" does.
        expect(cache.get(iconCacheKey('Pkg', '1.0.0', A.source.url))).toBeUndefined();
        expect(cache.get(iconCacheKey('Pkg', '1.0.0', B.source.url))).toBeNull();
        for (let i = 0; i < ICON_SOURCE_MISS_THRESHOLD; i++) {
            await resolver.icon([A], `Pkg${i}`, '1.0.0');
        }
        expect(resolver.isSourceSuppressed(A.source.url)).toBe(false);
        expect(flat.icon).toHaveBeenCalledTimes(2 + ICON_SOURCE_MISS_THRESHOLD);
    });

    it('breaker ignores transport failures and answers that are no usable icon: only "not found" counts (P9.1)', async () => {
        const cache = new MemoryIconCache();
        const answers: IconFetch[] = [
            { kind: 'failed', reason: 'timeout' },
            { kind: 'failed', reason: 'http-error 429: http-error' },
            { kind: 'missing', unusable: true },
        ];
        let next = 0;
        const flat = fakeFlat(async () => answers[next++ % answers.length]);
        const resolver = new DefaultIconResolver(flat, cache, allowAll);
        for (let i = 0; i < ICON_SOURCE_MISS_THRESHOLD * answers.length; i++) {
            await resolver.icon([A], `Pkg${i}`, '1.0.0');
        }
        expect(flat.icon).toHaveBeenCalledTimes(ICON_SOURCE_MISS_THRESHOLD * answers.length);
        expect(resolver.isSourceSuppressed(A.source.url)).toBe(false);
        // A thrown transport error does not count either.
        flat.icon.mockImplementation(async () => {
            throw new Error('ECONNRESET');
        });
        for (let i = 0; i < ICON_SOURCE_MISS_THRESHOLD; i++) {
            await resolver.icon([A], `Thrown${i}`, '1.0.0');
        }
        expect(resolver.isSourceSuppressed(A.source.url)).toBe(false);
        // A body that is no image (a login page served with 200) is no icon and is not asked again for a day, but it
        // proves nothing about the feed's icons.
        expect(cache.get(iconCacheKey('Pkg2', '1.0.0', A.source.url))).toBeNull();
        expect(cache.get(iconCacheKey('Pkg0', '1.0.0', A.source.url))).toBeUndefined();
    });

    it('breaker resets on success: an icon or any answer other than "not found" clears the count (P9.1)', async () => {
        const flat = flatAnswering({ [A.source.url]: { kind: 'missing' } });
        const resolver = new DefaultIconResolver(flat, new MemoryIconCache(), allowAll);
        const misses = async (prefix: string, count: number): Promise<void> => {
            flat.icon.mockImplementation(async () => ({ kind: 'missing' }));
            for (let i = 0; i < count; i++) {
                await resolver.icon([A], `${prefix}${i}`, '1.0.0');
            }
        };

        await misses('a', ICON_SOURCE_MISS_THRESHOLD - 1);
        flat.icon.mockImplementation(async () => asFetch({ contentType: 'image/png', body: PNG }));
        await expect(resolver.icon([A], 'Found', '1.0.0')).resolves.toContain('data:image/png;base64,');
        await misses('b', ICON_SOURCE_MISS_THRESHOLD - 1);
        expect(resolver.isSourceSuppressed(A.source.url)).toBe(false);

        flat.icon.mockImplementation(async () => ({ kind: 'missing', unusable: true }));
        await resolver.icon([A], 'Unusable', '1.0.0');
        await misses('c', ICON_SOURCE_MISS_THRESHOLD - 1);
        expect(resolver.isSourceSuppressed(A.source.url)).toBe(false);

        flat.icon.mockImplementation(async () => asFetch({ contentType: 'application/octet-stream', body: Buffer.from('<html></html>') }));
        await resolver.icon([A], 'NotAnImage', '1.0.0');
        await misses('d', ICON_SOURCE_MISS_THRESHOLD - 1);
        expect(resolver.isSourceSuppressed(A.source.url)).toBe(false);

        // Without an answer in between, the threshold still skips the source until reset().
        await misses('e', 1);
        expect(resolver.isSourceSuppressed(A.source.url)).toBe(true);
        resolver.reset();
        expect(resolver.isSourceSuppressed(A.source.url)).toBe(false);
    });

    it('a caller that gives up does not leave a caller of the same resolution without the icon', async () => {
        let release: (value: IconFetch) => void = () => undefined;
        const flat = fakeFlat(() => new Promise<IconFetch>(resolve => { release = resolve; }));
        const resolver = new DefaultIconResolver(flat, new MemoryIconCache(), allowAll);
        const controller = new AbortController();
        const first = resolver.icon([A], 'Pkg', '1.0.0', controller.signal);
        const second = resolver.icon([A], 'Pkg', '1.0.0', new AbortController().signal);
        controller.abort();
        await expect(first).resolves.toBeUndefined();
        release({ kind: 'found', contentType: 'image/png', body: PNG });
        await expect(second).resolves.toContain('data:image/png;base64,');
        expect(flat.icon).toHaveBeenCalledTimes(1);
        const shared = flat.icon.mock.calls[0][3] as AbortSignal;
        expect(shared.aborted).toBe(false);
    });

    it('the resolution stops when every caller has given up', async () => {
        const flat = fakeFlat(async (_source, _id, _version, signal) => {
            await new Promise(resolve => setTimeout(resolve, 5));
            return signal?.aborted ? { kind: 'failed', reason: 'cancelled' } : { kind: 'missing' };
        });
        const resolver = new DefaultIconResolver(flat, new MemoryIconCache(), allowAll);
        const one = new AbortController();
        const two = new AbortController();
        const first = resolver.icon([A, B], 'Pkg', '1.0.0', one.signal);
        const second = resolver.icon([A, B], 'Pkg', '1.0.0', two.signal);
        one.abort();
        two.abort();
        await Promise.all([first, second]);
        await new Promise(resolve => setTimeout(resolve, 20));
        // The shared signal aborted with the last caller: B was never asked.
        expect(flat.icon).toHaveBeenCalledTimes(1);
        expect((flat.icon.mock.calls[0][3] as AbortSignal).aborted).toBe(true);
    });

    describe('response guards', () => {
        async function resolve(response: IconResponse): Promise<string | undefined> {
            const flat = flatAnswering({ [A.source.url]: response });
            return new DefaultIconResolver(flat, new MemoryIconCache(), allowAll).icon([A], 'Pkg', '1.0.0');
        }

        it('rejects non-image content types such as HTML login pages', async () => {
            await expect(resolve({ contentType: 'text/html; charset=utf-8', body: Buffer.from('<html>login</html>') })).resolves.toBeUndefined();
            await expect(resolve({ contentType: 'application/json', body: Buffer.from('{}') })).resolves.toBeUndefined();
        });

        it('rejects empty and oversized bodies', async () => {
            await expect(resolve({ contentType: 'image/png', body: Buffer.alloc(0) })).resolves.toBeUndefined();
            await expect(resolve({ contentType: 'image/png', body: Buffer.alloc(MAX_ICON_BYTES + 1, 1) })).resolves.toBeUndefined();
            await expect(resolve({ contentType: 'image/png', body: Buffer.alloc(MAX_ICON_BYTES, 1) })).resolves.toContain('data:image/png;base64,');
        });

        it('normalizes declared image types and drops charset parameters', async () => {
            await expect(resolve({ contentType: 'Image/SVG+XML; charset=utf-8', body: SVG })).resolves.toMatch(/^data:image\/svg\+xml;base64,/);
        });

        it('sniffs the image type when the feed declares an octet stream or nothing at all', async () => {
            await expect(resolve({ contentType: 'application/octet-stream', body: PNG })).resolves.toMatch(/^data:image\/png;base64,/);
            await expect(resolve({ contentType: 'binary/octet-stream', body: JPEG })).resolves.toMatch(/^data:image\/jpeg;base64,/);
            await expect(resolve({ contentType: '', body: GIF })).resolves.toMatch(/^data:image\/gif;base64,/);
            await expect(resolve({ contentType: '', body: WEBP })).resolves.toMatch(/^data:image\/webp;base64,/);
            await expect(resolve({ contentType: '', body: ICO })).resolves.toMatch(/^data:image\/x-icon;base64,/);
            await expect(resolve({ contentType: '', body: BMP })).resolves.toMatch(/^data:image\/bmp;base64,/);
            await expect(resolve({ contentType: '', body: SVG })).resolves.toMatch(/^data:image\/svg\+xml;base64,/);
            await expect(resolve({ contentType: 'application/octet-stream', body: Buffer.from('<html></html>') })).resolves.toBeUndefined();
        });
    });
});

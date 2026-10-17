import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyValueStore } from '../contracts';
import {
    CACHE_POLICY,
    cacheKeys,
    invalidationToCacheScopes,
    normalizeSourceUrl,
    packageKeyPrefixes,
    prefixesForScope,
    ttlFor,
} from './CachePolicy';
import { LruMap } from './LruMap';
import { TieredCache, orphanedStoreKeys } from './TieredCache';

class FakeStore implements KeyValueStore {
    readonly data = new Map<string, unknown>();
    readonly updates: Array<[string, unknown]> = [];
    failNext = false;

    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue?: T): T | undefined {
        return this.data.has(key) ? (this.data.get(key) as T) : defaultValue;
    }

    update(key: string, value: unknown): PromiseLike<void> {
        this.updates.push([key, value]);
        if (this.failNext) {
            this.failNext = false;
            return Promise.reject(new Error('disk full'));
        }
        if (value === undefined) {
            this.data.delete(key);
        } else {
            this.data.set(key, value);
        }
        return Promise.resolve();
    }

    keysWithPrefix(prefix: string): string[] {
        return [...this.data.keys()].filter(k => k.startsWith(prefix));
    }
}

const flushMicrotasks = () => new Promise<void>(resolve => queueMicrotask(resolve));

describe('LruMap', () => {
    it('rejects a non-positive capacity', () => {
        expect(() => new LruMap(0)).toThrow(RangeError);
    });

    it('evicts the least recently used entry when capacity is exceeded', () => {
        const map = new LruMap<string, number>(2);
        map.set('a', 1);
        map.set('b', 2);
        expect(map.get('a')).toBe(1);
        map.set('c', 3);
        expect(map.has('b')).toBe(false);
        expect(map.keys()).toEqual(['a', 'c']);
    });

    it('peek does not change recency while get does', () => {
        const map = new LruMap<string, number>(2);
        map.set('a', 1);
        map.set('b', 2);
        expect(map.peek('a')).toBe(1);
        map.set('c', 3);
        expect(map.has('a')).toBe(false);
    });

    it('replacing an existing key keeps the size and moves it to most recent', () => {
        const map = new LruMap<string, number>(2);
        map.set('a', 1);
        map.set('b', 2);
        map.set('a', 10);
        expect(map.size).toBe(2);
        map.set('c', 3);
        expect(map.get('a')).toBe(10);
        expect(map.has('b')).toBe(false);
    });

    it('deleteByKeyPrefix removes only matching string keys and reports the count', () => {
        const map = new LruMap<string, number>(10);
        map.set('versions:a', 1);
        map.set('versions:b', 2);
        map.set('metadata:a', 3);
        expect(map.deleteByKeyPrefix('versions:')).toBe(2);
        expect(map.keys()).toEqual(['metadata:a']);
        map.clear();
        expect(map.size).toBe(0);
        expect(map.delete('missing')).toBe(false);
    });

    it('stores falsy values and distinguishes them from misses', () => {
        const map = new LruMap<string, number | undefined>(2);
        map.set('zero', 0);
        expect(map.get('zero')).toBe(0);
        expect(map.get('missing')).toBeUndefined();
    });
});

describe('CachePolicy', () => {
    it('defines the agreed lifetimes', () => {
        expect(ttlFor('versions')).toBe(3 * 60_000);
        expect(ttlFor('lite')).toBe(5 * 60_000);
        expect(ttlFor('metadata')).toBe(10 * 60_000);
        expect(ttlFor('iconFound')).toBe(0);
        expect(ttlFor('iconMissing')).toBe(24 * 3_600_000);
        expect(ttlFor('search')).toBe(2 * 60_000);
        expect(ttlFor('readme')).toBe(0);
        expect(ttlFor('serviceIndex')).toBe(10 * 60_000);
        expect(ttlFor('failedEndpoint')).toBe(2 * 60_000);
        expect(ttlFor('vulnerability')).toBe(3_600_000);
        expect(ttlFor('sources')).toBe(30_000);
        expect(Object.isFrozen(CACHE_POLICY)).toBe(true);
    });

    it('maps scopes to key prefixes and clears everything for "all"', () => {
        expect(prefixesForScope('all')).toBeUndefined();
        expect(prefixesForScope('versions')).toEqual(['versions:']);
        expect(prefixesForScope('icons')).toEqual(['icon:']);
        expect(prefixesForScope('metadata')).toEqual(['metadata:', 'lite:']);
        expect(prefixesForScope('vulnerabilities')).toEqual(['vulnerability:']);
        expect(prefixesForScope('sources')).toEqual(['sources:', 'serviceIndex:', 'failedEndpoint:']);
        expect(prefixesForScope('network')).toEqual(expect.arrayContaining(['serviceIndex:', 'search:', 'versions:', 'metadata:', 'lite:', 'vulnerability:', 'failedEndpoint:']));
        expect(prefixesForScope('network')).not.toContain('icon:');
        expect(prefixesForScope('network')).not.toContain('readme:');
    });

    it('normalizes source URLs for keys', () => {
        expect(normalizeSourceUrl(' HTTPS://Feed.Example/v3/index.json/ ')).toBe('https://feed.example/v3/index.json');
        expect(normalizeSourceUrl('C:\\Feeds\\Local\\')).toBe('c:\\feeds\\local');
    });

    it('keys always carry id, version, source and prerelease dimensions', () => {
        expect(cacheKeys.versions('Newtonsoft.Json', 'https://A.example/', true, true)).toBe('versions:newtonsoft.json|https://a.example|pre|listed');
        expect(cacheKeys.versions('Newtonsoft.Json', 'https://a.example', false, false)).toBe('versions:newtonsoft.json|https://a.example|stable|full');
        expect(cacheKeys.metadata('Pkg', '1.0.0-Beta', 'https://a.example')).toBe('metadata:pkg@1.0.0-beta|https://a.example');
        expect(cacheKeys.lite('Pkg', 'https://a.example')).toBe('lite:pkg@latest|https://a.example');
        expect(cacheKeys.lite('Pkg', 'https://a.example', '2.0')).toBe('lite:pkg@2.0|https://a.example');
        expect(cacheKeys.icon('Pkg', '1.0', 'https://a.example')).toBe('icon:pkg@1.0|https://a.example');
        expect(cacheKeys.readme('Pkg', '1.0', 'https://a.example')).toBe('readme:pkg@1.0|https://a.example');
        expect(cacheKeys.serviceIndex('https://a.example/v3/index.json')).toBe('serviceIndex:https://a.example/v3/index.json');
        expect(cacheKeys.failedEndpoint('https://a.example/')).toBe('failedEndpoint:https://a.example');
        expect(cacheKeys.vulnerability('https://a.example')).toBe('vulnerability:https://a.example');
        expect(cacheKeys.sources('/work/proj')).toBe('sources:/work/proj');
    });

    it('metadata keys differ per source so feeds never share entries', () => {
        const a = cacheKeys.metadata('Pkg', '1.0.0', 'https://a.example');
        const b = cacheKeys.metadata('Pkg', '1.0.0', 'https://b.example');
        expect(a).not.toBe(b);
    });

    it('search keys sort and dedupe sources and include take/exact flags', () => {
        const key = cacheKeys.search('Json ', ['https://B.example/', 'https://a.example', 'https://b.example'], true, 20, true);
        expect(key).toBe('search:json|https://a.example,https://b.example|pre|20|exact');
        expect(cacheKeys.search('json', ['https://a.example'], false, 20)).toBe('search:json|https://a.example|stable|20|fuzzy');
    });
});

describe('TieredCache (memory only)', () => {
    let now = 1_000_000;
    const clock = () => now;

    beforeEach(() => {
        now = 1_000_000;
    });

    it('stores and returns values until the kind TTL elapses', () => {
        const cache = new TieredCache({ now: clock });
        cache.set('versions:x', ['1.0'], 'versions');
        expect(cache.get<string[]>('versions:x')).toEqual(['1.0']);
        now += CACHE_POLICY.versions.ttlMs - 1;
        expect(cache.has('versions:x')).toBe(true);
        now += 2;
        expect(cache.get('versions:x')).toBeUndefined();
        expect(cache.stats().memoryEntries).toBe(0);
    });

    it('keeps never-expiring kinds forever and honours custom lifetimes', () => {
        const cache = new TieredCache({ now: clock });
        cache.set('icon:a', 'data:image/png;base64,AAA', 'iconFound');
        cache.set('custom:a', 1, { ttlMs: 10 });
        now += 365 * 24 * 3_600_000;
        expect(cache.get('icon:a')).toBe('data:image/png;base64,AAA');
        expect(cache.get('custom:a')).toBeUndefined();
    });

    it('evicts least recently used entries beyond the memory capacity', () => {
        const cache = new TieredCache({ now: clock, maxMemoryEntries: 2 });
        cache.set('a', 1, 'readme');
        cache.set('b', 2, 'readme');
        cache.get('a');
        cache.set('c', 3, 'readme');
        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('a')).toBe(1);
        expect(cache.get('c')).toBe(3);
    });

    it('clear(scope) removes only matching prefixes; clear() removes everything', () => {
        const cache = new TieredCache({ now: clock });
        cache.set(cacheKeys.versions('p', 'https://s', false, true), ['1'], 'versions');
        cache.set(cacheKeys.metadata('p', '1', 'https://s'), { id: 'p' }, 'metadata');
        cache.set(cacheKeys.lite('p', 'https://s'), { id: 'p' }, 'lite');
        cache.set(cacheKeys.icon('p', '1', 'https://s'), 'data:', 'iconFound');
        cache.set(cacheKeys.serviceIndex('https://s'), {}, 'serviceIndex');
        cache.set(cacheKeys.sources('/dir'), [], 'sources');

        cache.clear('metadata');
        expect(cache.has(cacheKeys.metadata('p', '1', 'https://s'))).toBe(false);
        expect(cache.has(cacheKeys.lite('p', 'https://s'))).toBe(false);
        expect(cache.has(cacheKeys.versions('p', 'https://s', false, true))).toBe(true);

        cache.clear('sources');
        expect(cache.has(cacheKeys.sources('/dir'))).toBe(false);
        expect(cache.has(cacheKeys.serviceIndex('https://s'))).toBe(false);
        expect(cache.has(cacheKeys.icon('p', '1', 'https://s'))).toBe(true);

        cache.clear();
        expect(cache.stats().memoryEntries).toBe(0);
    });

    it('sweepExpired removes only expired entries', () => {
        const cache = new TieredCache({ now: clock });
        cache.set('search:a', 1, 'search');
        cache.set('readme:a', 2, 'readme');
        now += CACHE_POLICY.search.ttlMs + 1;
        expect(cache.sweepExpired()).toBe(1);
        expect(cache.stats().memoryEntries).toBe(1);
        expect(cache.get('readme:a')).toBe(2);
    });

    it('delete removes an entry', () => {
        const cache = new TieredCache({ now: clock });
        cache.set('a', 1, 'readme');
        cache.delete('a');
        expect(cache.get('a')).toBeUndefined();
    });
});

describe('TieredCache (with persistent tier)', () => {
    let now = 5_000_000;
    const clock = () => now;
    let store: FakeStore;

    beforeEach(() => {
        now = 5_000_000;
        store = new FakeStore();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('orphanedStoreKeys lists the prefixed keys the index does not name, never the index itself, and nothing under another prefix', async () => {
        const cache = new TieredCache({ store, now: clock });
        cache.set('icon:p@1|s', 'data:', 'iconFound');
        cache.set('readme:p@1|s', '# Readme', 'readme');
        await flushMicrotasks();
        // A 1.x WorkspaceCache entry under the same prefix, an arbitrary one, and a key of someone else.
        store.data.set('nuiget.cache.versions:legacy', { value: ['1.0.0'], expiresAt: now + 1000, storedAt: now });
        store.data.set('nuiget.cache.something', 42);
        store.data.set('other.key', 'kept');
        const view = { get: <T>(key: string) => store.get<T>(key), keys: () => [...store.data.keys()] };
        expect(orphanedStoreKeys(view).sort()).toEqual(['nuiget.cache.something', 'nuiget.cache.versions:legacy']);

        // Without an index every prefixed key is unreachable.
        store.data.delete('nuiget.cache.__index__');
        expect(orphanedStoreKeys(view).sort()).toEqual(['nuiget.cache.icon:p@1|s', 'nuiget.cache.readme:p@1|s', 'nuiget.cache.something', 'nuiget.cache.versions:legacy']);
    });

    it('writes persistable kinds through and keeps the index current', async () => {
        const cache = new TieredCache({ store, now: clock });
        cache.set('icon:p@1|s', 'data:', 'iconFound');
        cache.set('metadata:p@1|s', { id: 'p' }, 'metadata');
        await flushMicrotasks();
        expect(store.data.get('nuiget.cache.icon:p@1|s')).toEqual({ value: 'data:', expiresAt: 0, storedAt: now });
        expect(store.data.has('nuiget.cache.metadata:p@1|s')).toBe(false);
        expect(store.data.get('nuiget.cache.__index__')).toEqual(['icon:p@1|s']);
    });

    it('promotes a persisted entry into memory after a cold start', async () => {
        const warm = new TieredCache({ store, now: clock });
        warm.set('readme:p@1|s', '# Readme', 'readme');
        warm.set('versions:p|s|stable|listed', ['1.0'], 'versions');
        await flushMicrotasks();

        const cold = new TieredCache({ store, now: clock });
        expect(cold.stats()).toEqual({ memoryEntries: 0, persistedEntries: 2 });
        expect(cold.get('readme:p@1|s')).toBe('# Readme');
        expect(cold.stats().memoryEntries).toBe(1);
        expect(cold.get('versions:p|s|stable|listed')).toEqual(['1.0']);
    });

    it('drops expired and malformed persisted entries on load', async () => {
        store.data.set('nuiget.cache.__index__', ['search:old', 'readme:ok', 'bad:shape', 42]);
        store.data.set('nuiget.cache.search:old', { value: 1, expiresAt: now - 1, storedAt: now - 100 });
        store.data.set('nuiget.cache.readme:ok', { value: 'x', expiresAt: 0, storedAt: now - 100 });
        store.data.set('nuiget.cache.bad:shape', { nope: true });

        const cache = new TieredCache({ store, now: clock });
        await flushMicrotasks();
        expect(cache.stats().persistedEntries).toBe(1);
        expect(store.data.has('nuiget.cache.search:old')).toBe(false);
        expect(store.data.has('nuiget.cache.bad:shape')).toBe(false);
        expect(store.data.get('nuiget.cache.__index__')).toEqual(['readme:ok']);
        expect(cache.get('readme:ok')).toBe('x');
    });

    it('treats a persisted entry that expired since load as a miss', async () => {
        const cache = new TieredCache({ store, now: clock });
        cache.set('search:q', [1], 'search');
        await flushMicrotasks();
        const cold = new TieredCache({ store, now: clock });
        now += CACHE_POLICY.search.ttlMs + 1;
        expect(cold.get('search:q')).toBeUndefined();
        await flushMicrotasks();
        expect(store.data.has('nuiget.cache.search:q')).toBe(false);
        expect(cold.stats().persistedEntries).toBe(0);
    });

    it('ignores a store entry that was tampered after load', () => {
        const cache = new TieredCache({ store, now: clock });
        cache.set('readme:p', 'x', 'readme');
        store.data.set('nuiget.cache.readme:p', 'garbage');
        const cold = new TieredCache({ store, now: clock });
        expect(cold.get('readme:p')).toBeUndefined();
        expect(cache.get('readme:p')).toBe('x');
    });

    it('caps the persistent tier, evicting expired then soonest-expiring entries first', async () => {
        const cache = new TieredCache({ store, now: clock, maxStoreEntries: 3 });
        cache.set('readme:permanent', 'r', 'readme');
        cache.set('search:soon', 's', 'search');
        now += 1;
        cache.set('versions:later', 'v', 'versions');
        now += 1;
        cache.set('icon:another', 'i', 'iconFound');
        await flushMicrotasks();

        expect(cache.stats().persistedEntries).toBe(3);
        expect(store.data.has('nuiget.cache.search:soon')).toBe(false);
        expect(store.data.has('nuiget.cache.readme:permanent')).toBe(true);
        expect(store.data.get('nuiget.cache.__index__')).toEqual(expect.arrayContaining(['readme:permanent', 'versions:later', 'icon:another']));
    });

    it('evicts the oldest permanent entry when only permanent entries remain', async () => {
        const cache = new TieredCache({ store, now: clock, maxStoreEntries: 2 });
        cache.set('readme:first', 1, 'readme');
        now += 10;
        cache.set('readme:second', 2, 'readme');
        now += 10;
        cache.set('readme:third', 3, 'readme');
        await flushMicrotasks();
        expect(store.data.has('nuiget.cache.readme:first')).toBe(false);
        expect(store.data.has('nuiget.cache.readme:second')).toBe(true);
        expect(store.data.has('nuiget.cache.readme:third')).toBe(true);
    });

    it('evicts expired persisted entries before live ones when over capacity', async () => {
        const cache = new TieredCache({ store, now: clock, maxStoreEntries: 2 });
        cache.set('search:expired', 1, 'search');
        cache.set('readme:keep', 2, 'readme');
        now += CACHE_POLICY.search.ttlMs + 1;
        cache.set('readme:new', 3, 'readme');
        await flushMicrotasks();
        expect(store.data.has('nuiget.cache.search:expired')).toBe(false);
        expect(store.data.has('nuiget.cache.readme:keep')).toBe(true);
        expect(store.data.has('nuiget.cache.readme:new')).toBe(true);
    });

    it('clear(scope) and delete remove persisted entries too', async () => {
        const cache = new TieredCache({ store, now: clock });
        cache.set('icon:a', 'x', 'iconFound');
        cache.set('icon:b', 'y', 'iconMissing');
        cache.set('readme:a', 'z', 'readme');
        await flushMicrotasks();
        cache.clear('icons');
        cache.delete('readme:a');
        await flushMicrotasks();
        expect(store.keysWithPrefix('nuiget.cache.icon:')).toEqual([]);
        expect(store.data.has('nuiget.cache.readme:a')).toBe(false);
        expect(store.data.get('nuiget.cache.__index__')).toEqual([]);
    });

    it('clear() empties the persistent tier', async () => {
        const cache = new TieredCache({ store, now: clock });
        cache.set('icon:a', 'x', 'iconFound');
        cache.set('readme:a', 'z', 'readme');
        await flushMicrotasks();
        cache.clear('all');
        await flushMicrotasks();
        expect(store.keysWithPrefix('nuiget.cache.')).toEqual(['nuiget.cache.__index__']);
        expect(store.data.get('nuiget.cache.__index__')).toEqual([]);
    });

    it('overwriting a persisted key with a non-persisted kind removes the stored copy', async () => {
        const cache = new TieredCache({ store, now: clock });
        cache.set('k', 1, 'readme');
        await flushMicrotasks();
        cache.set('k', 2, 'metadata');
        await flushMicrotasks();
        expect(store.data.has('nuiget.cache.k')).toBe(false);
        expect(cache.get('k')).toBe(2);
    });

    it('sweepExpired removes expired persisted metadata', async () => {
        const cache = new TieredCache({ store, now: clock });
        cache.set('search:a', 1, 'search');
        await flushMicrotasks();
        const cold = new TieredCache({ store, now: clock });
        now += CACHE_POLICY.search.ttlMs + 1;
        expect(cold.sweepExpired()).toBe(1);
        expect(cold.stats().persistedEntries).toBe(0);
    });

    it('logs and keeps the memory value when persistence rejects or throws', async () => {
        const warn = vi.fn();
        const logger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() };
        const cache = new TieredCache({ store, now: clock, logger });
        store.failNext = true;
        cache.set('readme:a', 'x', 'readme');
        await flushMicrotasks();
        await flushMicrotasks();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('disk full'));
        expect(cache.get('readme:a')).toBe('x');

        vi.spyOn(store, 'update').mockImplementationOnce(() => {
            throw new Error('sync failure');
        });
        cache.set('readme:b', 'y', 'readme');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('sync failure'));
        expect(cache.get('readme:b')).toBe('y');
    });

    it('uses a custom store prefix', async () => {
        const cache = new TieredCache({ store, now: clock, storePrefix: 'test.' });
        cache.set('readme:a', 'x', 'readme');
        await flushMicrotasks();
        expect(store.data.has('test.readme:a')).toBe(true);
        expect(store.data.get('test.__index__')).toEqual(['readme:a']);
    });
});

describe('CachePolicy (invalidation)', () => {
    const FEED = 'https://feed.example.test/v3/index.json';

    it('packageKeyPrefixes covers versions, lite and metadata of one id and stops at its delimiter', () => {
        expect(packageKeyPrefixes(' Serilog ')).toEqual(['versions:serilog|', 'lite:serilog@', 'metadata:serilog@']);

        const matches = (key: string): boolean => packageKeyPrefixes('Serilog').some(prefix => key.startsWith(prefix));
        expect(matches(cacheKeys.versions('Serilog', FEED, false, true))).toBe(true);
        expect(matches(cacheKeys.lite('Serilog', FEED))).toBe(true);
        expect(matches(cacheKeys.metadata('Serilog', '4.0.0', FEED))).toBe(true);
        expect(matches(cacheKeys.versions('Serilog.Sinks.Console', FEED, false, true))).toBe(false);
        expect(matches(cacheKeys.icon('Serilog', '4.0.0', FEED))).toBe(false);
        expect(matches(cacheKeys.readme('Serilog', '4.0.0', FEED))).toBe(false);
    });

    it('invalidationToCacheScopes maps every invalidation scope', () => {
        expect(invalidationToCacheScopes({ kind: 'workspace' })).toEqual({ scopes: ['network', 'sources'], packageIds: [] });
        expect(invalidationToCacheScopes({ kind: 'sources' })).toEqual({ scopes: ['network', 'sources'], packageIds: [] });
        expect(invalidationToCacheScopes({ kind: 'project', projectPaths: ['/w/App/App.csproj'] }))
            .toEqual({ scopes: [], packageIds: [] });
        expect(invalidationToCacheScopes({ kind: 'package', projectPaths: ['/w/App/App.csproj'], packageIds: ['Serilog'] }))
            .toEqual({ scopes: [], packageIds: ['Serilog'] });
        expect(invalidationToCacheScopes({ kind: 'metadata', packageIds: ['A', 'B'] })).toEqual({ scopes: [], packageIds: ['A', 'B'] });
    });

    it('invalidationToCacheScopes never selects icons or readmes', () => {
        for (const scope of [{ kind: 'workspace' }, { kind: 'sources' }] as const) {
            const prefixes = invalidationToCacheScopes(scope).scopes.flatMap(cacheScope => prefixesForScope(cacheScope) ?? ['<everything>']);
            expect(prefixes).not.toContain('<everything>');
            expect(prefixes).not.toContain('icon:');
            expect(prefixes).not.toContain('readme:');
            expect(prefixes).toContain('versions:');
            expect(prefixes).toContain('sources:');
        }
    });
});

describe('TieredCache (deleteByPrefix, clearPackages and the byte budget)', () => {
    const FEED_A = 'https://a.example.test/v3/index.json';
    const FEED_B = 'https://b.example.test/v3/index.json';
    let now = 5_000_000;
    const clock = () => now;
    let store: FakeStore;

    /** Size of an entry as the cache accounts for it. */
    const bytesOf = (value: unknown, expiresAt: number, storedAt: number): number =>
        Buffer.byteLength(JSON.stringify({ value, expiresAt, storedAt }), 'utf8');

    beforeEach(() => {
        now = 5_000_000;
        store = new FakeStore();
    });

    it('deleteByPrefix removes matching keys from both tiers and reports the count', async () => {
        const cache = new TieredCache({ store, now: clock });
        cache.set('versions:a|s|stable|listed', ['1.0.0'], 'versions');
        cache.set('versions:b|s|stable|listed', ['2.0.0'], 'versions');
        cache.set('metadata:a@1|s', { id: 'a' }, 'metadata');
        await flushMicrotasks();

        expect(cache.deleteByPrefix('versions:')).toBe(2);
        await flushMicrotasks();

        expect(cache.get('versions:a|s|stable|listed')).toBeUndefined();
        expect(cache.get('versions:b|s|stable|listed')).toBeUndefined();
        expect(cache.get('metadata:a@1|s')).toEqual({ id: 'a' });
        expect(store.keysWithPrefix('nuiget.cache.versions:')).toEqual([]);
        expect(store.data.get('nuiget.cache.__index__')).toEqual([]);
    });

    it('deleteByPrefix counts a key once, finds entries that are only persisted, and ignores an empty prefix', async () => {
        const warm = new TieredCache({ store, now: clock });
        warm.set('readme:a@1|s', '# A', 'readme');
        warm.set('readme:b@1|s', '# B', 'readme');
        await flushMicrotasks();

        // After a cold start `a` is in both tiers again (read), `b` only in the store.
        const cold = new TieredCache({ store, now: clock });
        expect(cold.get('readme:a@1|s')).toBe('# A');

        expect(cold.deleteByPrefix('')).toBe(0);
        expect(cold.stats()).toEqual({ memoryEntries: 1, persistedEntries: 2 });
        expect(cold.deleteByPrefix('readme:')).toBe(2);
        expect(cold.stats()).toEqual({ memoryEntries: 0, persistedEntries: 0 });
        expect(cold.persistedBytes).toBe(0);
    });

    it('clearPackages drops versions, lite and metadata of the given ids for every source', async () => {
        const cache = new TieredCache({ store, now: clock });
        const stale = [
            cacheKeys.versions('Serilog', FEED_A, false, true),
            cacheKeys.versions('Serilog', FEED_B, true, false),
            cacheKeys.lite('Serilog', FEED_A),
            cacheKeys.metadata('Serilog', '4.0.0', FEED_A),
            cacheKeys.versions('Polly', FEED_A, false, true),
        ];
        const kept = [
            cacheKeys.versions('Serilog.Sinks.Console', FEED_A, false, true),
            cacheKeys.metadata('Newtonsoft.Json', '13.0.3', FEED_A),
        ];
        for (const key of [...stale, ...kept]) {
            cache.set(key, key, key.startsWith('metadata:') ? 'metadata' : key.startsWith('lite:') ? 'lite' : 'versions');
        }
        await flushMicrotasks();

        expect(cache.clearPackages(['SERILOG', 'polly'])).toBe(stale.length);
        await flushMicrotasks();

        for (const key of stale) {
            expect(cache.get(key)).toBeUndefined();
            expect(store.data.has(`nuiget.cache.${key}`)).toBe(false);
        }
        for (const key of kept) {
            expect(cache.get(key)).toBe(key);
        }
    });

    it('clearPackages keeps icons and readmes of the package and ignores blank ids', () => {
        const cache = new TieredCache({ store, now: clock });
        const icon = cacheKeys.icon('Serilog', '4.0.0', FEED_A);
        const readme = cacheKeys.readme('Serilog', '4.0.0', FEED_A);
        cache.set(icon, 'data:image/png;base64,AAAA', 'iconFound');
        cache.set(readme, '# Serilog', 'readme');
        cache.set(cacheKeys.versions('Serilog', FEED_A, false, true), ['4.0.0'], 'versions');

        expect(cache.clearPackages(['', '   '])).toBe(0);
        expect(cache.clearPackages(['Serilog'])).toBe(1);
        expect(cache.get(icon)).toBe('data:image/png;base64,AAAA');
        expect(cache.get(readme)).toBe('# Serilog');
    });

    it('accounts for the persistent tier in UTF-8 bytes of the stored JSON', () => {
        const cache = new TieredCache({ store, now: clock });
        cache.set('readme:p@1|s', 'åäö', 'readme');
        cache.set('metadata:p@1|s', { id: 'p' }, 'metadata');

        const expected = bytesOf('åäö', 0, now);
        expect(expected).toBe(JSON.stringify({ value: 'åäö', expiresAt: 0, storedAt: now }).length + 3);
        expect(cache.persistedBytes).toBe(expected);

        cache.set('readme:p@1|s', 'a', 'readme');
        expect(cache.persistedBytes).toBe(bytesOf('a', 0, now));

        cache.delete('readme:p@1|s');
        expect(cache.persistedBytes).toBe(0);
    });

    it('keeps the persistent tier within the byte budget, evicting the soonest-expiring entries first', async () => {
        const payload = 'x'.repeat(200);
        const entryBytes = bytesOf(payload, now + CACHE_POLICY.versions.ttlMs, now);
        const cache = new TieredCache({ store, now: clock, maxStoreBytes: entryBytes * 2 });

        cache.set('versions:a|s|stable|listed', payload, 'versions');
        now += 1000;
        cache.set('versions:b|s|stable|listed', payload, 'versions');
        now += 1000;
        cache.set('versions:c|s|stable|listed', payload, 'versions');
        await flushMicrotasks();

        expect(cache.stats().persistedEntries).toBe(2);
        expect(cache.persistedBytes).toBe(entryBytes * 2);
        expect(store.data.has('nuiget.cache.versions:a|s|stable|listed')).toBe(false);
        expect(store.data.get('nuiget.cache.__index__')).toEqual(['versions:b|s|stable|listed', 'versions:c|s|stable|listed']);
        // Only the stored copy went; the memory tier still answers.
        expect(cache.get('versions:a|s|stable|listed')).toBe(payload);
    });

    it('evicts the oldest permanent entry when permanent entries exceed the byte budget', async () => {
        const icon = `data:image/png;base64,${'A'.repeat(300)}`;
        const entryBytes = bytesOf(icon, 0, now);
        const cache = new TieredCache({ store, now: clock, maxStoreBytes: entryBytes * 2 });

        cache.set('icon:a@1|s', icon, 'iconFound');
        now += 1000;
        cache.set('icon:b@1|s', icon, 'iconFound');
        now += 1000;
        cache.set('icon:c@1|s', icon, 'iconFound');
        await flushMicrotasks();

        expect(store.data.has('nuiget.cache.icon:a@1|s')).toBe(false);
        expect(store.data.has('nuiget.cache.icon:b@1|s')).toBe(true);
        expect(store.data.has('nuiget.cache.icon:c@1|s')).toBe(true);
        expect(cache.persistedBytes).toBeLessThanOrEqual(entryBytes * 2);
    });

    it('does not persist an entry that is larger than the whole budget and evicts nothing for it', async () => {
        const debug = vi.fn();
        const logger = { trace: vi.fn(), debug, info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        const cache = new TieredCache({ store, now: clock, maxStoreBytes: 100, logger });
        const big = 'x'.repeat(500);

        cache.set('icon:small@1|s', 'ok', 'iconFound');
        cache.set('icon:big@1|https://user:secret@feed.example.test', big, 'iconFound');
        await flushMicrotasks();

        expect(cache.get('icon:big@1|https://user:secret@feed.example.test')).toBe(big);
        expect(store.keysWithPrefix('nuiget.cache.icon:big')).toEqual([]);
        expect(store.data.has('nuiget.cache.icon:small@1|s')).toBe(true);
        expect(cache.stats().persistedEntries).toBe(1);
        expect(debug).toHaveBeenCalledTimes(1);
        expect(debug).toHaveBeenCalledWith(expect.stringContaining('kind icon:'));
        expect(debug).toHaveBeenCalledWith(expect.not.stringContaining('secret'));
    });

    it('removes the stored copy when a persisted key is overwritten by an entry over the budget', async () => {
        const cache = new TieredCache({ store, now: clock, maxStoreBytes: 100 });
        cache.set('readme:p@1|s', 'short', 'readme');
        await flushMicrotasks();
        expect(store.data.has('nuiget.cache.readme:p@1|s')).toBe(true);

        cache.set('readme:p@1|s', 'y'.repeat(500), 'readme');
        await flushMicrotasks();

        expect(store.data.has('nuiget.cache.readme:p@1|s')).toBe(false);
        expect(cache.persistedBytes).toBe(0);
        expect(cache.get('readme:p@1|s')).toBe('y'.repeat(500));
    });

    it('keeps a value without a JSON form in memory only', async () => {
        const cache = new TieredCache({ store, now: clock });
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;

        cache.set('readme:c@1|s', cyclic, 'readme');
        await flushMicrotasks();

        expect(cache.get('readme:c@1|s')).toBe(cyclic);
        expect(cache.stats().persistedEntries).toBe(0);
        expect(store.keysWithPrefix('nuiget.cache.readme:')).toEqual([]);
    });

    it('counts the entries it finds in the store on load and trims a store that exceeds the budget', async () => {
        const icon = `data:image/png;base64,${'A'.repeat(300)}`;
        const entryBytes = bytesOf(icon, 0, now);
        const unbounded = new TieredCache({ store, now: clock });
        unbounded.set('icon:a@1|s', icon, 'iconFound');
        now += 1000;
        unbounded.set('icon:b@1|s', icon, 'iconFound');
        now += 1000;
        unbounded.set('icon:c@1|s', icon, 'iconFound');
        await flushMicrotasks();
        expect(unbounded.persistedBytes).toBe(entryBytes * 3);

        const bounded = new TieredCache({ store, now: clock, maxStoreBytes: entryBytes * 2 });
        await flushMicrotasks();

        expect(bounded.stats().persistedEntries).toBe(2);
        expect(bounded.persistedBytes).toBe(entryBytes * 2);
        expect(store.data.has('nuiget.cache.icon:a@1|s')).toBe(false);
        expect(store.data.get('nuiget.cache.__index__')).toEqual(['icon:b@1|s', 'icon:c@1|s']);
        expect(bounded.get('icon:c@1|s')).toBe(icon);
    });

    it('defaults to a budget of 8 MiB, so 256 KB icons cannot fill the store entry by entry', async () => {
        const budget = 8 * 1024 * 1024;
        const icon = `data:image/png;base64,${'A'.repeat(256 * 1024)}`;
        const cache = new TieredCache({ store, now: clock });

        for (let index = 0; index < 40; index++) {
            now += 1;
            cache.set(`icon:p${index}@1|s`, icon, 'iconFound');
        }
        await flushMicrotasks();

        expect(bytesOf(icon, 0, now) * 40).toBeGreaterThan(budget);
        expect(cache.persistedBytes).toBeLessThanOrEqual(budget);
        expect(cache.stats().persistedEntries).toBe(Math.floor(budget / bytesOf(icon, 0, now)));
        // The newest icons are the ones that stay.
        expect(store.data.has('nuiget.cache.icon:p39@1|s')).toBe(true);
        expect(store.data.has('nuiget.cache.icon:p0@1|s')).toBe(false);
    });
});

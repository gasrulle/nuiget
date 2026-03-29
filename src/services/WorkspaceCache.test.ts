import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_TTL, cacheKeys, WorkspaceCache } from '../services/WorkspaceCache';

// ──────────────────────────────────────────────
// Mock ExtensionContext.workspaceState
// ──────────────────────────────────────────────
function createMockContext() {
    const store = new Map<string, unknown>();
    return {
        workspaceState: {
            get: vi.fn((key: string) => store.get(key)),
            update: vi.fn((key: string, value: unknown) => {
                if (value === undefined) {
                    store.delete(key);
                } else {
                    store.set(key, value);
                }
                return Promise.resolve();
            }),
            keys: vi.fn(() => Array.from(store.keys())),
        },
        _store: store, // Exposed for test assertions
    } as unknown as import('vscode').ExtensionContext & { _store: Map<string, unknown> };
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────
describe('WorkspaceCache', () => {
    let cache: WorkspaceCache;
    let ctx: ReturnType<typeof createMockContext>;

    beforeEach(() => {
        cache = new WorkspaceCache();
        ctx = createMockContext();
        cache.initialize(ctx);
    });

    // ──────────────────────────────────────────────
    // Basic get/set/delete
    // ──────────────────────────────────────────────
    describe('basic operations', () => {
        it('set and get a value', () => {
            cache.set('key1', { name: 'test' });
            expect(cache.get('key1')).toEqual({ name: 'test' });
        });

        it('returns undefined for missing key', () => {
            expect(cache.get('nonexistent')).toBeUndefined();
        });

        it('delete removes a value', () => {
            cache.set('toDelete', 'value');
            cache.delete('toDelete');
            expect(cache.get('toDelete')).toBeUndefined();
        });

        it('has returns true for existing key', () => {
            cache.set('exists', 42);
            expect(cache.has('exists')).toBe(true);
        });

        it('has returns false for missing key', () => {
            expect(cache.has('missing')).toBe(false);
        });

        it('overwrites existing value', () => {
            cache.set('key', 'v1');
            cache.set('key', 'v2');
            expect(cache.get('key')).toBe('v2');
        });
    });

    // ──────────────────────────────────────────────
    // TTL expiration
    // ──────────────────────────────────────────────
    describe('TTL expiration', () => {
        it('returns value before TTL expires', () => {
            cache.set('ttlKey', 'value', 60000); // 1 min TTL
            expect(cache.get('ttlKey')).toBe('value');
        });

        it('returns undefined after TTL expires', () => {
            vi.useFakeTimers();
            try {
                cache.set('expiring', 'temp', 1000); // 1s TTL
                expect(cache.get('expiring')).toBe('temp');
                vi.advanceTimersByTime(1500);
                expect(cache.get('expiring')).toBeUndefined();
            } finally {
                vi.useRealTimers();
            }
        });

        it('never-expires entries persist', () => {
            vi.useFakeTimers();
            try {
                cache.set('permanent', 'forever', 0);
                vi.advanceTimersByTime(999_999_999);
                expect(cache.get('permanent')).toBe('forever');
            } finally {
                vi.useRealTimers();
            }
        });
    });

    // ──────────────────────────────────────────────
    // clear and clearByPrefix
    // ──────────────────────────────────────────────
    describe('clear operations', () => {
        it('clear removes all entries', () => {
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);
            cache.clear();
            expect(cache.get('a')).toBeUndefined();
            expect(cache.get('b')).toBeUndefined();
            expect(cache.get('c')).toBeUndefined();
        });

        it('clearByPrefix removes only matching entries', () => {
            cache.set('versions:pkg1', [1, 2, 3]);
            cache.set('versions:pkg2', [4, 5, 6]);
            cache.set('readme:pkg1', 'content');
            cache.clearByPrefix('versions:');
            expect(cache.get('versions:pkg1')).toBeUndefined();
            expect(cache.get('versions:pkg2')).toBeUndefined();
            expect(cache.get('readme:pkg1')).toBe('content');
        });

        it('clearByPrefix with no matches does nothing', () => {
            cache.set('key', 'value');
            cache.clearByPrefix('nonexistent:');
            expect(cache.get('key')).toBe('value');
        });
    });

    // ──────────────────────────────────────────────
    // getStats
    // ──────────────────────────────────────────────
    describe('getStats', () => {
        it('returns correct count and keys', () => {
            cache.set('alpha', 1);
            cache.set('beta', 2);
            const stats = cache.getStats();
            expect(stats.entries).toBe(2);
            expect(stats.keys).toContain('alpha');
            expect(stats.keys).toContain('beta');
        });

        it('returns 0 entries when empty', () => {
            const stats = cache.getStats();
            expect(stats.entries).toBe(0);
            expect(stats.keys).toEqual([]);
        });
    });

    // ──────────────────────────────────────────────
    // Eviction
    // ──────────────────────────────────────────────
    describe('eviction', () => {
        it('evicts oldest entries when exceeding MAX_ENTRIES', () => {
            // MAX_ENTRIES is 500. Fill to 501 and verify oldest is evicted
            for (let i = 0; i < 501; i++) {
                cache.set(`entry-${i}`, i, 60000);
            }
            // Entry 0 should have been evicted (oldest TTL entry)
            expect(cache.get('entry-0')).toBeUndefined();
            // Later entries should still exist
            expect(cache.get('entry-500')).toBe(500);
        });

        it('evicts expired entries before non-expired', () => {
            vi.useFakeTimers();
            try {
                // Fill cache with 499 permanent entries
                for (let i = 0; i < 499; i++) {
                    cache.set(`perm-${i}`, i, 0);
                }
                // Add one expired entry
                cache.set('expired', 'old', 100);
                vi.advanceTimersByTime(200);
                // Add one more to trigger eviction (501 total)
                cache.set('trigger', 'new', 60000);
                // The expired entry should be evicted during cleanup
                expect(cache.get('expired')).toBeUndefined();
                expect(cache.get('trigger')).toBe('new');
            } finally {
                vi.useRealTimers();
            }
        });
    });

    // ──────────────────────────────────────────────
    // Initialization from workspaceState
    // ──────────────────────────────────────────────
    describe('initialization', () => {
        it('loads existing entries from workspaceState', () => {
            // Pre-populate the mock store before initialization
            const cache2 = new WorkspaceCache();
            const ctx2 = createMockContext();
            ctx2._store.set('nuiget.cache.preloaded', {
                value: 'loaded-value',
                expiresAt: 0,
                storedAt: Date.now(),
            });
            cache2.initialize(ctx2);
            expect(cache2.get('preloaded')).toBe('loaded-value');
        });

        it('skips expired entries during load', () => {
            const cache2 = new WorkspaceCache();
            const ctx2 = createMockContext();
            ctx2._store.set('nuiget.cache.old', {
                value: 'expired-value',
                expiresAt: Date.now() - 1000, // Already expired
                storedAt: Date.now() - 5000,
            });
            cache2.initialize(ctx2);
            expect(cache2.get('old')).toBeUndefined();
        });

        it('ignores non-cache keys in workspaceState', () => {
            const cache2 = new WorkspaceCache();
            const ctx2 = createMockContext();
            ctx2._store.set('other.setting', 'value');
            cache2.initialize(ctx2);
            expect(cache2.getStats().entries).toBe(0);
        });
    });

    // ──────────────────────────────────────────────
    // Edge cases
    // ──────────────────────────────────────────────
    describe('edge cases', () => {
        it('set without initialization logs warning and does not crash', () => {
            const uninitCache = new WorkspaceCache();
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            uninitCache.set('key', 'value');
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('get on uninitialized cache returns undefined', () => {
            const uninitCache = new WorkspaceCache();
            expect(uninitCache.get('anything')).toBeUndefined();
        });

        it('handles null and boolean values', () => {
            cache.set('nullVal', null);
            cache.set('boolVal', false);
            expect(cache.get('nullVal')).toBeNull();
            expect(cache.get('boolVal')).toBe(false);
        });

        it('handles complex objects', () => {
            const complex = { nested: { array: [1, 2, 3], flag: true }, str: 'test' };
            cache.set('complex', complex);
            expect(cache.get('complex')).toEqual(complex);
        });
    });
});

// ──────────────────────────────────────────────
// CACHE_TTL constants
// ──────────────────────────────────────────────
describe('CACHE_TTL', () => {
    it('has expected TTL values', () => {
        expect(CACHE_TTL.VERSIONS).toBe(3 * 60 * 1000);
        expect(CACHE_TTL.VERIFIED_STATUS).toBe(5 * 60 * 1000);
        expect(CACHE_TTL.ICON_EXISTS).toBe(0);
        expect(CACHE_TTL.SEARCH_RESULTS).toBe(2 * 60 * 1000);
        expect(CACHE_TTL.README).toBe(0);
    });
});

// ──────────────────────────────────────────────
// cacheKeys builders
// ──────────────────────────────────────────────
describe('cacheKeys', () => {
    it('versions key is lowercase and includes all params', () => {
        const key = cacheKeys.versions('Newtonsoft.Json', 'https://api.nuget.org', true, 50);
        expect(key).toBe('versions:newtonsoft.json:https://api.nuget.org:true:50');
    });

    it('verifiedStatus key is lowercase', () => {
        expect(cacheKeys.verifiedStatus('Microsoft.Extensions.DependencyInjection'))
            .toBe('verified:microsoft.extensions.dependencyinjection');
    });

    it('iconExists key format', () => {
        expect(cacheKeys.iconExists('Serilog', '3.0.0')).toBe('iconurl:serilog@3.0.0');
    });

    it('searchResults key sorts sources', () => {
        const key1 = cacheKeys.searchResults('json', ['b-source', 'a-source'], false);
        const key2 = cacheKeys.searchResults('json', ['a-source', 'b-source'], false);
        expect(key1).toBe(key2); // Same regardless of input order
    });

    it('readme key format', () => {
        expect(cacheKeys.readme('xunit', '2.6.0')).toBe('readme:xunit@2.6.0');
    });
});

import { describe, expect, it } from 'vitest';
import type { InstalledPackage, PackageSearchResult } from './types';
import { LRUMap, compareVersions, decodeHtmlEntities, getPackageId, isSearchResult } from './types';

// ─── LRUMap ──────────────────────────────────────────────────────────────────

describe('LRUMap', () => {
    it('stores and retrieves values', () => {
        const map = new LRUMap<string, number>(5);
        map.set('a', 1);
        expect(map.get('a')).toBe(1);
    });

    it('returns undefined for missing keys', () => {
        const map = new LRUMap<string, number>(5);
        expect(map.get('missing')).toBeUndefined();
    });

    it('reports correct size', () => {
        const map = new LRUMap<string, number>(5);
        map.set('a', 1);
        map.set('b', 2);
        expect(map.size).toBe(2);
    });

    it('has() returns true for existing keys', () => {
        const map = new LRUMap<string, number>(5);
        map.set('a', 1);
        expect(map.has('a')).toBe(true);
        expect(map.has('b')).toBe(false);
    });

    it('evicts oldest entry when at capacity', () => {
        const map = new LRUMap<string, number>(3);
        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);
        map.set('d', 4); // evicts 'a'
        expect(map.has('a')).toBe(false);
        expect(map.get('d')).toBe(4);
        expect(map.size).toBe(3);
    });

    it('promotes accessed entries (LRU order)', () => {
        const map = new LRUMap<string, number>(3);
        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);
        map.get('a'); // promotes 'a', now 'b' is oldest
        map.set('d', 4); // evicts 'b'
        expect(map.has('a')).toBe(true);
        expect(map.has('b')).toBe(false);
    });

    it('updates existing key without increasing size', () => {
        const map = new LRUMap<string, number>(3);
        map.set('a', 1);
        map.set('b', 2);
        map.set('a', 10); // update
        expect(map.get('a')).toBe(10);
        expect(map.size).toBe(2);
    });

    it('clear() removes all entries', () => {
        const map = new LRUMap<string, number>(5);
        map.set('a', 1);
        map.set('b', 2);
        map.clear();
        expect(map.size).toBe(0);
        expect(map.get('a')).toBeUndefined();
    });

    it('uses default maxSize of 100', () => {
        const map = new LRUMap<number, number>();
        for (let i = 0; i < 101; i++) {
            map.set(i, i);
        }
        expect(map.size).toBe(100);
        expect(map.has(0)).toBe(false); // first entry evicted
        expect(map.has(100)).toBe(true);
    });
});

// ─── isSearchResult ──────────────────────────────────────────────────────────

describe('isSearchResult', () => {
    it('returns true for PackageSearchResult (has description)', () => {
        const pkg: PackageSearchResult = {
            id: 'Pkg', version: '1.0', description: 'desc',
            authors: 'auth', versions: []
        };
        expect(isSearchResult(pkg)).toBe(true);
    });

    it('returns false for InstalledPackage (no description)', () => {
        const pkg: InstalledPackage = { id: 'Pkg', version: '1.0' };
        expect(isSearchResult(pkg)).toBe(false);
    });

    it('returns false for null', () => {
        expect(isSearchResult(null)).toBe(false);
    });
});

// ─── compareVersions ─────────────────────────────────────────────────────────

describe('compareVersions', () => {
    it('returns 0 for equal versions', () => {
        expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('returns positive when a > b', () => {
        expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
    });

    it('returns negative when a < b', () => {
        expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
    });

    it('compares minor versions', () => {
        expect(compareVersions('1.2.0', '1.1.0')).toBeGreaterThan(0);
        expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0);
    });

    it('compares patch versions', () => {
        expect(compareVersions('1.0.2', '1.0.1')).toBeGreaterThan(0);
    });

    it('ignores prerelease suffixes', () => {
        expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBe(0);
    });

    it('handles different-length version strings', () => {
        expect(compareVersions('1.0', '1.0.0')).toBe(0);
        expect(compareVersions('1.0.0.1', '1.0.0')).toBeGreaterThan(0);
    });

    it('handles non-numeric parts gracefully', () => {
        expect(compareVersions('1.abc.0', '1.0.0')).toBe(0); // parseInt('abc') => NaN => 0
    });
});

// ─── getPackageId ────────────────────────────────────────────────────────────

describe('getPackageId', () => {
    it('returns id from package', () => {
        expect(getPackageId({ id: 'MyPkg', version: '1.0' })).toBe('MyPkg');
    });

    it('returns empty string for null', () => {
        expect(getPackageId(null)).toBe('');
    });
});

// ─── decodeHtmlEntities ──────────────────────────────────────────────────────

describe('decodeHtmlEntities', () => {
    it('decodes &lt; and &gt;', () => {
        expect(decodeHtmlEntities('&lt;div&gt;')).toBe('<div>');
    });

    it('decodes &amp;', () => {
        expect(decodeHtmlEntities('A &amp; B')).toBe('A & B');
    });

    it('returns plain text unchanged', () => {
        expect(decodeHtmlEntities('hello world')).toBe('hello world');
    });

    it('decodes numeric entities', () => {
        expect(decodeHtmlEntities('&#39;test&#39;')).toBe("'test'");
    });
});

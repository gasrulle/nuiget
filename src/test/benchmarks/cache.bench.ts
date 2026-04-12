/**
 * Benchmarks for LRUMap and WorkspaceCache operations.
 */
import { beforeEach, bench, describe, vi } from 'vitest';
import { LRUMap } from '../../services/NuGetUtils';
import { WorkspaceCache } from '../../services/WorkspaceCache';

describe('LRUMap operations', () => {
    let cache: LRUMap<string, string>;

    beforeEach(() => {
        cache = new LRUMap<string, string>(200);
        for (let i = 0; i < 200; i++) {
            cache.set(`key-${i}`, `value-${i}`);
        }
    });

    bench('get (hit)', () => {
        cache.get('key-100');
    });

    bench('get (miss)', () => {
        cache.get('nonexistent-key');
    });

    bench('set (new entry, triggers eviction)', () => {
        cache.set(`new-${Math.random()}`, 'value');
    });

    bench('set (update existing)', () => {
        cache.set('key-100', 'updated');
    });

    bench('has', () => {
        cache.has('key-50');
    });

    bench('delete', () => {
        cache.delete('key-150');
        cache.set('key-150', 'restored'); // Restore for next iteration
    });
});

describe('WorkspaceCache operations', () => {
    let wsCache: WorkspaceCache;

    beforeEach(() => {
        wsCache = new WorkspaceCache();
        wsCache.initialize({
            workspaceState: {
                get: vi.fn(() => undefined),
                update: vi.fn(async () => undefined),
                keys: vi.fn(() => []),
            },
            globalState: {
                get: vi.fn(() => undefined),
                update: vi.fn(async () => undefined),
                keys: vi.fn(() => []),
                setKeysForSync: vi.fn(),
            },
        } as unknown as import('vscode').ExtensionContext);

        // Pre-populate
        for (let i = 0; i < 100; i++) {
            wsCache.set(`bench-key-${i}`, { data: `value-${i}` });
        }
    });

    bench('get (hit)', () => {
        wsCache.get('bench-key-50');
    });

    bench('get (miss)', () => {
        wsCache.get('nonexistent');
    });

    bench('set', () => {
        wsCache.set(`bench-key-${Math.floor(Math.random() * 100)}`, { updated: true });
    });

    bench('has', () => {
        wsCache.has('bench-key-75');
    });

    bench('delete', () => {
        wsCache.delete('bench-key-99');
        wsCache.set('bench-key-99', { data: 'restored' });
    });
});

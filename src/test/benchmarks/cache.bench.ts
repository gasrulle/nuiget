/**
 * Benchmarks for LRUMap and WorkspaceCache operations.
 */
import { beforeEach, test, describe, vi } from 'vitest';
import { runBenchmark } from './benchmark';
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

    test('get (hit)', async (context) => {
        await runBenchmark(context, 'get (hit)', () => {
            cache.get('key-100');
        });
    });

    test('get (miss)', async (context) => {
        await runBenchmark(context, 'get (miss)', () => {
            cache.get('nonexistent-key');
        });
    });

    test('set (new entry, triggers eviction)', async (context) => {
        await runBenchmark(context, 'set (new entry, triggers eviction)', () => {
            cache.set(`new-${Math.random()}`, 'value');
        });
    });

    test('set (update existing)', async (context) => {
        await runBenchmark(context, 'set (update existing)', () => {
            cache.set('key-100', 'updated');
        });
    });

    test('has', async (context) => {
        await runBenchmark(context, 'has', () => {
            cache.has('key-50');
        });
    });

    test('delete', async (context) => {
        await runBenchmark(context, 'delete', () => {
            cache.delete('key-150');
            cache.set('key-150', 'restored'); // Restore for next iteration
        });
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

    test('get (hit)', async (context) => {
        await runBenchmark(context, 'get (hit)', () => {
            wsCache.get('bench-key-50');
        });
    });

    test('get (miss)', async (context) => {
        await runBenchmark(context, 'get (miss)', () => {
            wsCache.get('nonexistent');
        });
    });

    test('set', async (context) => {
        await runBenchmark(context, 'set', () => {
            wsCache.set(`bench-key-${Math.floor(Math.random() * 100)}`, { updated: true });
        });
    });

    test('has', async (context) => {
        await runBenchmark(context, 'has', () => {
            wsCache.has('bench-key-75');
        });
    });

    test('delete', async (context) => {
        await runBenchmark(context, 'delete', () => {
            wsCache.delete('bench-key-99');
            wsCache.set('bench-key-99', { data: 'restored' });
        });
    });
});

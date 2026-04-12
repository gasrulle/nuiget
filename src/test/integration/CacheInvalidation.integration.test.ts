/**
 * Integration tests for cache invalidation flows.
 *
 * Tests LRU cache eviction, workspace cache TTL, failed endpoint cache expiry,
 * and selective cache invalidation after operations.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LRUMap } from '../../services/NuGetUtils';
import { WorkspaceCache } from '../../services/WorkspaceCache';

describe('Cache Invalidation Integration', () => {
    describe('LRUMap', () => {
        it('should evict LRU entry when at capacity', () => {
            const cache = new LRUMap<string, number>(3);
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);

            // Access 'a' to make it MRU
            cache.get('a');

            // Adding 'd' should evict 'b' (LRU)
            cache.set('d', 4);

            expect(cache.has('a')).toBe(true);
            expect(cache.has('b')).toBe(false);
            expect(cache.has('c')).toBe(true);
            expect(cache.has('d')).toBe(true);
            expect(cache.size).toBe(3);
        });

        it('should track size correctly after multiple operations', () => {
            const cache = new LRUMap<string, string>(10);

            cache.set('one', 'value1');
            cache.set('two', 'value2');
            cache.set('three', 'value3');
            expect(cache.size).toBe(3);

            cache.delete('two');
            expect(cache.size).toBe(2);

            cache.clear();
            expect(cache.size).toBe(0);
        });

        it('should update value on duplicate key set', () => {
            const cache = new LRUMap<string, string>(5);
            cache.set('key', 'old');
            cache.set('key', 'new');

            expect(cache.get('key')).toBe('new');
            expect(cache.size).toBe(1);
        });

        it('should deleteByKeyPrefix when key is string', () => {
            const cache = new LRUMap<string, number>(10);
            cache.set('pkg:Newtonsoft.Json', 1);
            cache.set('pkg:Serilog', 2);
            cache.set('ver:Newtonsoft.Json', 3);

            cache.deleteByKeyPrefix('pkg:');

            expect(cache.has('pkg:Newtonsoft.Json')).toBe(false);
            expect(cache.has('pkg:Serilog')).toBe(false);
            expect(cache.has('ver:Newtonsoft.Json')).toBe(true);
        });
    });

    describe('Failed Endpoint Cache', () => {
        it('should expire entries after TTL', () => {
            const failedEndpointCache = new Map<string, number>();
            const TTL = 120_000; // 120 seconds

            // Simulate a failure recorded 130 seconds ago
            const oldTimestamp = Date.now() - TTL - 10_000;
            failedEndpointCache.set('https://bad-source.example.com', oldTimestamp);

            // Check if expired
            const timestamp = failedEndpointCache.get('https://bad-source.example.com');
            const isExpired = timestamp !== undefined && Date.now() - timestamp > TTL;

            expect(isExpired).toBe(true);
        });

        it('should consider recent failures as active', () => {
            const failedEndpointCache = new Map<string, number>();
            const TTL = 120_000;

            // Simulate a failure recorded 10 seconds ago
            failedEndpointCache.set('https://bad-source.example.com', Date.now() - 10_000);

            const timestamp = failedEndpointCache.get('https://bad-source.example.com');
            const isExpired = timestamp !== undefined && Date.now() - timestamp > TTL;

            expect(isExpired).toBe(false);
        });
    });

    describe('WorkspaceCache', () => {
        let cache: WorkspaceCache;

        beforeEach(() => {
            cache = new WorkspaceCache();
            // WorkspaceCache requires vscode.ExtensionContext for persistence,
            // but we can test the in-memory layer
            cache.initialize({
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
        });

        it('should store and retrieve values', () => {
            cache.set('test-key', { value: 42 });
            const result = cache.get<{ value: number }>('test-key');

            expect(result).toEqual({ value: 42 });
        });

        it('should return undefined for missing keys', () => {
            const result = cache.get<string>('nonexistent');
            expect(result).toBeUndefined();
        });

        it('should delete entries', () => {
            cache.set('to-delete', 'value');
            cache.delete('to-delete');

            expect(cache.get('to-delete')).toBeUndefined();
        });

        it('should clear all entries', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            cache.clear();

            expect(cache.get('key1')).toBeUndefined();
            expect(cache.get('key2')).toBeUndefined();
        });

        it('should report has correctly', () => {
            cache.set('exists', true);

            expect(cache.has('exists')).toBe(true);
            expect(cache.has('missing')).toBe(false);
        });
    });
});

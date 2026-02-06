import * as vscode from 'vscode';

/**
 * Cache entry with value and expiration timestamp
 */
interface CacheEntry<T> {
    value: T;
    expiresAt: number; // Unix timestamp, 0 = never expires
}

/**
 * Persistent cache using VS Code workspaceState.
 * Data persists as long as the workspace folder is open.
 * Implements size limiting to prevent unbounded growth.
 */
export class WorkspaceCache {
    private static readonly CACHE_PREFIX = 'nuiget.cache.';
    /**
     * Maximum number of cache entries to prevent unbounded memory growth.
     * This limit applies to the total number of unique cache keys.
     * When exceeded, expired entries are cleaned up first, then oldest entries.
     */
    private static readonly MAX_ENTRIES = 500;
    private context: vscode.ExtensionContext | null = null;

    // In-memory cache mirrors workspaceState for fast access
    private memoryCache: Map<string, CacheEntry<unknown>> = new Map();

    /**
     * Initialize the cache with extension context.
     * Must be called once during extension activation.
     */
    initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        // Load existing cache entries from workspaceState into memory
        this.loadFromWorkspaceState();
        // Clean up expired entries on initialization
        this.cleanupExpired();
    }

    /**
     * Remove all expired entries from the cache.
     * Called on initialization and periodically during set operations.
     */
    private cleanupExpired(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];

        this.memoryCache.forEach((entry, fullKey) => {
            if (entry.expiresAt !== 0 && now > entry.expiresAt) {
                keysToDelete.push(fullKey);
            }
        });

        for (const fullKey of keysToDelete) {
            this.memoryCache.delete(fullKey);
            this.context?.workspaceState.update(fullKey, undefined);
        }
    }

    /**
     * Evict oldest entries when cache exceeds maximum size.
     * Entries without expiration (TTL=0) are evicted last.
     */
    private evictIfNeeded(): void {
        if (this.memoryCache.size <= WorkspaceCache.MAX_ENTRIES) {
            return;
        }

        // First, try to clean up expired entries
        this.cleanupExpired();

        // If still over limit, evict oldest entries by TTL (entries with TTL first)
        if (this.memoryCache.size > WorkspaceCache.MAX_ENTRIES) {
            const entriesToEvict = this.memoryCache.size - WorkspaceCache.MAX_ENTRIES;
            const entries = Array.from(this.memoryCache.entries());

            // Sort by expiration: entries with TTL first (ascending), then never-expires
            entries.sort((a, b) => {
                const aExpires = a[1].expiresAt;
                const bExpires = b[1].expiresAt;
                // Never-expires (0) should be last
                if (aExpires === 0 && bExpires === 0) {
                    return 0;
                }
                if (aExpires === 0) {
                    return 1;
                }
                if (bExpires === 0) {
                    return -1;
                }
                return aExpires - bExpires;
            });

            for (let i = 0; i < entriesToEvict && i < entries.length; i++) {
                const [fullKey] = entries[i];
                this.memoryCache.delete(fullKey);
                this.context?.workspaceState.update(fullKey, undefined);
            }
        }
    }

    /**
     * Get a cached value. Returns undefined if not found or expired.
     */
    get<T>(key: string): T | undefined {
        const fullKey = WorkspaceCache.CACHE_PREFIX + key;
        const entry = this.memoryCache.get(fullKey) as CacheEntry<T> | undefined;

        if (!entry) {
            return undefined;
        }

        // Check expiration (0 = never expires)
        if (entry.expiresAt !== 0 && Date.now() > entry.expiresAt) {
            this.delete(key);
            return undefined;
        }

        return entry.value;
    }

    /**
     * Set a cached value with optional TTL in milliseconds.
     * @param key Cache key
     * @param value Value to cache
     * @param ttlMs Time-to-live in milliseconds (0 = never expires)
     */
    set<T>(key: string, value: T, ttlMs: number = 0): void {
        if (!this.context) {
            console.warn('[WorkspaceCache] Cache not initialized - call initialize() first');
            return;
        }

        const fullKey = WorkspaceCache.CACHE_PREFIX + key;
        const entry: CacheEntry<T> = {
            value,
            expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0
        };

        this.memoryCache.set(fullKey, entry);
        this.persistToWorkspaceState(fullKey, entry);

        // Evict oldest entries if we've exceeded the maximum size
        this.evictIfNeeded();
    }

    /**
     * Check if a key exists and is not expired.
     */
    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    /**
     * Delete a cached value.
     */
    delete(key: string): void {
        const fullKey = WorkspaceCache.CACHE_PREFIX + key;
        this.memoryCache.delete(fullKey);
        this.context?.workspaceState.update(fullKey, undefined);
    }

    /**
     * Clear all cache entries.
     */
    clear(): void {
        const keysToDelete: string[] = [];
        this.memoryCache.forEach((_, key) => {
            if (key.startsWith(WorkspaceCache.CACHE_PREFIX)) {
                keysToDelete.push(key);
            }
        });

        for (const key of keysToDelete) {
            this.memoryCache.delete(key);
            this.context?.workspaceState.update(key, undefined);
        }
    }

    /**
     * Get cache statistics for debugging.
     */
    getStats(): { entries: number; keys: string[] } {
        const keys: string[] = [];
        this.memoryCache.forEach((_, key) => {
            if (key.startsWith(WorkspaceCache.CACHE_PREFIX)) {
                keys.push(key.substring(WorkspaceCache.CACHE_PREFIX.length));
            }
        });
        return { entries: keys.length, keys };
    }

    private loadFromWorkspaceState(): void {
        if (!this.context) {
            return;
        }

        const allKeys = this.context.workspaceState.keys();
        for (const key of allKeys) {
            if (key.startsWith(WorkspaceCache.CACHE_PREFIX)) {
                const entry = this.context.workspaceState.get<CacheEntry<unknown>>(key);
                if (entry) {
                    // Check if expired during load
                    if (entry.expiresAt !== 0 && Date.now() > entry.expiresAt) {
                        this.context.workspaceState.update(key, undefined);
                    } else {
                        this.memoryCache.set(key, entry);
                    }
                }
            }
        }
    }

    private persistToWorkspaceState<T>(fullKey: string, entry: CacheEntry<T>): void {
        try {
            this.context?.workspaceState.update(fullKey, entry);
        } catch (error) {
            // Catch serialization errors (e.g., circular references, stack overflow)
            console.error('[WorkspaceCache] Failed to persist cache entry:', error);
            // Remove from memory cache to avoid inconsistency
            this.memoryCache.delete(fullKey);
        }
    }
}

// Singleton instance
export const workspaceCache = new WorkspaceCache();

// TTL constants (in milliseconds)
export const CACHE_TTL = {
    VERSIONS: 3 * 60 * 1000,        // 3 minutes
    VERIFIED_STATUS: 5 * 60 * 1000, // 5 minutes
    ICON_EXISTS: 0,                 // Never expires (workspace-scoped)
    SEARCH_RESULTS: 2 * 60 * 1000,  // 2 minutes
    README: 0,                      // Never expires (immutable per version)
} as const;

// Cache key builders for consistency
export const cacheKeys = {
    versions: (packageId: string, source: string, prerelease: boolean, take: number) =>
        `versions:${packageId.toLowerCase()}:${source}:${prerelease}:${take}`,

    verifiedStatus: (packageId: string) =>
        `verified:${packageId.toLowerCase()}`,

    iconExists: (packageId: string, version: string) =>
        `icon:${packageId.toLowerCase()}@${version}`,

    searchResults: (query: string, sources: string[], prerelease: boolean) =>
        `search:${query.toLowerCase()}:${[...sources].sort().join(',')}:${prerelease}`,

    readme: (packageId: string, version: string) =>
        `readme:${packageId.toLowerCase()}@${version}`,
};

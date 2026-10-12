import type { KeyValueStore, Logger } from '../contracts';
import { CACHE_POLICY, packageKeyPrefixes, prefixesForScope, type CacheKind, type CacheScope } from './CachePolicy';
import { LruMap } from './LruMap';

interface CacheEntry<T = unknown> {
    value: T;
    /** Absolute expiry timestamp; `0` means never. */
    expiresAt: number;
    storedAt: number;
}

interface PersistedMeta {
    expiresAt: number;
    storedAt: number;
    /** Size of the stored entry, see `serializedBytes`. */
    bytes: number;
}

/** Explicit lifetime for values that do not belong to a predefined kind. */
export interface CustomCachePolicy {
    ttlMs: number;
    persist?: boolean;
}

export interface TieredCacheOptions {
    /** Capacity of the in-memory LRU tier. Default 1000. */
    maxMemoryEntries?: number;
    /** Optional persistent tier (e.g. a `Memento` adapter). Without it the cache is memory-only. */
    store?: KeyValueStore;
    /** Maximum number of entries kept in the persistent tier. Default 500. */
    maxStoreEntries?: number;
    /**
     * Maximum total size of the persistent tier, in bytes of serialized entries. Default 8 MiB. The entry
     * count alone does not bound it: one entry can be a 256 KB icon, another a 100-byte version list.
     */
    maxStoreBytes?: number;
    /** Namespace for persistent keys. Default `nuiget.cache.`. */
    storePrefix?: string;
    logger?: Logger;
    now?: () => number;
}

const DEFAULT_MEMORY_ENTRIES = 1000;
const DEFAULT_STORE_ENTRIES = 500;
const DEFAULT_STORE_BYTES = 8 * 1024 * 1024;
const DEFAULT_STORE_PREFIX = 'nuiget.cache.';
const INDEX_KEY = '__index__';

function isCacheEntry(value: unknown): value is CacheEntry {
    return typeof value === 'object' && value !== null
        && 'value' in value
        && typeof (value as CacheEntry).expiresAt === 'number'
        && typeof (value as CacheEntry).storedAt === 'number';
}

/**
 * Size of an entry as a JSON-backed store keeps it: the UTF-8 length of its JSON text. `undefined` when the
 * value has no JSON form (a cycle, a `bigint`), which also means the store could not hold it.
 */
function serializedBytes(entry: CacheEntry): number | undefined {
    try {
        return Buffer.byteLength(JSON.stringify(entry), 'utf8');
    } catch {
        return undefined;
    }
}

/** The part of a key that names its kind (`versions:`), for log lines that must not carry a source URL. */
function kindOf(key: string): string {
    const end = key.indexOf(':');
    return end < 0 ? key : key.slice(0, end + 1);
}

/**
 * Two-tier cache: an in-memory LRU in front of an optional persistent key/value store.
 * Lifetimes come from `CACHE_POLICY`; persistent entries are capped by count and by total size, swept
 * on load and promoted into memory on first read.
 */
export class TieredCache {
    private readonly memory: LruMap<string, CacheEntry>;
    private readonly store: KeyValueStore | undefined;
    private readonly maxStoreEntries: number;
    private readonly maxStoreBytes: number;
    private readonly storePrefix: string;
    private readonly logger: Logger | undefined;
    private readonly now: () => number;
    /** Metadata of every persisted entry, so capacity/scope decisions never need store reads. */
    private readonly persisted = new Map<string, PersistedMeta>();
    /** Sum of `bytes` over `persisted`. */
    private totalPersistedBytes = 0;
    private indexFlushScheduled = false;

    constructor(options: TieredCacheOptions = {}) {
        this.memory = new LruMap(options.maxMemoryEntries ?? DEFAULT_MEMORY_ENTRIES);
        this.store = options.store;
        this.maxStoreEntries = options.maxStoreEntries ?? DEFAULT_STORE_ENTRIES;
        this.maxStoreBytes = options.maxStoreBytes ?? DEFAULT_STORE_BYTES;
        this.storePrefix = options.storePrefix ?? DEFAULT_STORE_PREFIX;
        this.logger = options.logger;
        this.now = options.now ?? Date.now;
        this.loadPersistedIndex();
    }

    /** Returns the cached value, consulting the persistent tier on a memory miss. */
    get<T>(key: string): T | undefined {
        const entry = this.memory.get(key);
        if (entry) {
            if (this.isExpired(entry)) {
                this.delete(key);
                return undefined;
            }
            return entry.value as T;
        }
        return this.readPersisted<T>(key);
    }

    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    /** Stores a value using the lifetime (and persistence) defined for `kind`. */
    set<T>(key: string, value: T, kind: CacheKind | CustomCachePolicy): void {
        const policy = typeof kind === 'string' ? CACHE_POLICY[kind] : kind;
        const storedAt = this.now();
        const entry: CacheEntry<T> = {
            value,
            expiresAt: policy.ttlMs > 0 ? storedAt + policy.ttlMs : 0,
            storedAt,
        };
        this.memory.set(key, entry);
        if (this.store && policy.persist) {
            this.writePersisted(key, entry);
        } else if (this.persisted.has(key)) {
            this.removePersisted(key);
        }
    }

    delete(key: string): void {
        this.memory.delete(key);
        if (this.persisted.has(key)) {
            this.removePersisted(key);
        }
    }

    /** Removes every entry in `scope` (by key prefix) from both tiers. */
    clear(scope: CacheScope = 'all'): void {
        const prefixes = prefixesForScope(scope);
        if (!prefixes) {
            this.memory.clear();
            for (const key of [...this.persisted.keys()]) {
                this.removePersisted(key);
            }
            return;
        }
        for (const prefix of prefixes) {
            this.deleteByPrefix(prefix);
        }
    }

    /**
     * Removes every entry whose key starts with `prefix` from both tiers and returns how many keys that
     * were. An empty prefix removes nothing; `clear()` is the way to empty the cache.
     */
    deleteByPrefix(prefix: string): number {
        if (prefix.length === 0) {
            return 0;
        }
        const removed = new Set<string>();
        for (const key of this.memory.keys()) {
            if (key.startsWith(prefix)) {
                this.memory.delete(key);
                removed.add(key);
            }
        }
        for (const key of [...this.persisted.keys()]) {
            if (key.startsWith(prefix)) {
                this.removePersisted(key);
                removed.add(key);
            }
        }
        return removed.size;
    }

    /**
     * Removes the version lists and metadata of the given packages, for every source, and returns how many
     * keys that were. Used after an operation or an invalidation that names packages, so that the next
     * update check does not answer from data older than the change.
     */
    clearPackages(packageIds: readonly string[]): number {
        let removed = 0;
        for (const packageId of packageIds) {
            if (packageId.trim().length === 0) {
                continue;
            }
            for (const prefix of packageKeyPrefixes(packageId)) {
                removed += this.deleteByPrefix(prefix);
            }
        }
        return removed;
    }

    /** Drops expired entries from both tiers; returns the number removed. */
    sweepExpired(): number {
        let removed = 0;
        for (const key of this.memory.keys()) {
            const entry = this.memory.peek(key);
            if (entry && this.isExpired(entry)) {
                this.memory.delete(key);
                removed++;
            }
        }
        for (const [key, meta] of [...this.persisted]) {
            if (this.isExpired(meta)) {
                this.removePersisted(key);
                removed++;
            }
        }
        return removed;
    }

    /** Diagnostic counters. */
    stats(): { memoryEntries: number; persistedEntries: number } {
        return { memoryEntries: this.memory.size, persistedEntries: this.persisted.size };
    }

    /** Total size of the persistent tier in bytes of serialized entries; never above `maxStoreBytes`. */
    get persistedBytes(): number {
        return this.totalPersistedBytes;
    }

    private isExpired(entry: { expiresAt: number }): boolean {
        return entry.expiresAt !== 0 && this.now() > entry.expiresAt;
    }

    private storeKey(key: string): string {
        return this.storePrefix + key;
    }

    private loadPersistedIndex(): void {
        if (!this.store) {
            return;
        }
        const index = this.store.get<unknown>(this.storeKey(INDEX_KEY));
        if (!Array.isArray(index)) {
            return;
        }
        let dirty = false;
        for (const key of index) {
            if (typeof key !== 'string') {
                dirty = true;
                continue;
            }
            const entry = this.store.get<unknown>(this.storeKey(key));
            const bytes = isCacheEntry(entry) && !this.isExpired(entry) ? serializedBytes(entry) : undefined;
            if (!isCacheEntry(entry) || bytes === undefined) {
                this.updateStore(this.storeKey(key), undefined);
                dirty = true;
                continue;
            }
            this.trackPersisted(key, { expiresAt: entry.expiresAt, storedAt: entry.storedAt, bytes });
        }
        if (dirty) {
            this.scheduleIndexFlush();
        }
        // A store written before the byte budget existed, or with a larger one, is trimmed here.
        this.evictPersistedIfNeeded();
    }

    private readPersisted<T>(key: string): T | undefined {
        if (!this.store || !this.persisted.has(key)) {
            return undefined;
        }
        const entry = this.store.get<unknown>(this.storeKey(key));
        if (!isCacheEntry(entry)) {
            this.removePersisted(key);
            return undefined;
        }
        if (this.isExpired(entry)) {
            this.removePersisted(key);
            return undefined;
        }
        this.memory.set(key, entry);
        return entry.value as T;
    }

    private writePersisted(key: string, entry: CacheEntry): void {
        const bytes = serializedBytes(entry);
        if (bytes === undefined || bytes > this.maxStoreBytes) {
            // Evicting everything else would still not make room, so the entry stays in memory only.
            if (this.persisted.has(key)) {
                this.removePersisted(key);
            }
            this.logger?.debug(`Cache entry of kind ${kindOf(key)} is not persisted: ${bytes === undefined ? 'no JSON form' : `${bytes} bytes exceed the budget`}`);
            return;
        }
        this.trackPersisted(key, { expiresAt: entry.expiresAt, storedAt: entry.storedAt, bytes });
        this.updateStore(this.storeKey(key), entry);
        this.evictPersistedIfNeeded();
        this.scheduleIndexFlush();
    }

    private trackPersisted(key: string, meta: PersistedMeta): void {
        this.totalPersistedBytes += meta.bytes - (this.persisted.get(key)?.bytes ?? 0);
        this.persisted.set(key, meta);
    }

    private removePersisted(key: string): void {
        this.totalPersistedBytes -= this.persisted.get(key)?.bytes ?? 0;
        this.persisted.delete(key);
        this.updateStore(this.storeKey(key), undefined);
        this.scheduleIndexFlush();
    }

    private isOverCapacity(): boolean {
        return this.persisted.size > this.maxStoreEntries || this.totalPersistedBytes > this.maxStoreBytes;
    }

    /** Evicts expired entries first, then the entries that expire soonest; permanent entries go last (oldest first). */
    private evictPersistedIfNeeded(): void {
        if (!this.isOverCapacity()) {
            return;
        }
        for (const [key, meta] of [...this.persisted]) {
            if (this.isExpired(meta)) {
                this.removePersisted(key);
            }
        }
        if (!this.isOverCapacity()) {
            return;
        }
        const ordered = [...this.persisted].sort(([, a], [, b]) => {
            if (a.expiresAt === 0 && b.expiresAt === 0) {
                return a.storedAt - b.storedAt;
            }
            if (a.expiresAt === 0) {
                return 1;
            }
            if (b.expiresAt === 0) {
                return -1;
            }
            return a.expiresAt - b.expiresAt;
        });
        for (const [key] of ordered) {
            if (!this.isOverCapacity()) {
                break;
            }
            this.removePersisted(key);
        }
    }

    /** Index writes are coalesced per tick because a single `set` can trigger several removals. */
    private scheduleIndexFlush(): void {
        if (!this.store || this.indexFlushScheduled) {
            return;
        }
        this.indexFlushScheduled = true;
        queueMicrotask(() => {
            this.indexFlushScheduled = false;
            this.updateStore(this.storeKey(INDEX_KEY), [...this.persisted.keys()]);
        });
    }

    private updateStore(fullKey: string, value: unknown): void {
        if (!this.store) {
            return;
        }
        try {
            this.store.update(fullKey, value).then(undefined, (error: unknown) => {
                this.logger?.warn(`Cache persistence failed for ${fullKey}: ${error instanceof Error ? error.message : String(error)}`);
            });
        } catch (error) {
            this.logger?.warn(`Cache persistence failed for ${fullKey}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

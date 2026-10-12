/**
 * Least-recently-used map with a fixed capacity. Reading an entry marks it as most recently
 * used; inserting beyond capacity evicts the least recently used entry.
 */
export class LruMap<K, V> {
    private readonly entries = new Map<K, V>();

    constructor(private readonly capacity: number) {
        if (!Number.isInteger(capacity) || capacity < 1) {
            throw new RangeError(`LruMap capacity must be a positive integer, got ${capacity}`);
        }
    }

    /** Returns the value and marks the key as most recently used. */
    get(key: K): V | undefined {
        if (!this.entries.has(key)) {
            return undefined;
        }
        const value = this.entries.get(key) as V;
        this.entries.delete(key);
        this.entries.set(key, value);
        return value;
    }

    /** Returns the value without changing its recency. */
    peek(key: K): V | undefined {
        return this.entries.get(key);
    }

    /** Inserts or replaces a value, evicting the least recently used entry when over capacity. */
    set(key: K, value: V): void {
        if (this.entries.has(key)) {
            this.entries.delete(key);
        } else if (this.entries.size >= this.capacity) {
            const oldest = this.entries.keys().next();
            if (!oldest.done) {
                this.entries.delete(oldest.value);
            }
        }
        this.entries.set(key, value);
    }

    has(key: K): boolean {
        return this.entries.has(key);
    }

    delete(key: K): boolean {
        return this.entries.delete(key);
    }

    /** Deletes every entry whose string key starts with `prefix`; returns the number removed. */
    deleteByKeyPrefix(prefix: string): number {
        let removed = 0;
        for (const key of [...this.entries.keys()]) {
            if (typeof key === 'string' && key.startsWith(prefix)) {
                this.entries.delete(key);
                removed++;
            }
        }
        return removed;
    }

    clear(): void {
        this.entries.clear();
    }

    /** Keys from least to most recently used. */
    keys(): K[] {
        return [...this.entries.keys()];
    }

    get size(): number {
        return this.entries.size;
    }
}

import type { InvalidationReason, InvalidationScope, ResourceKey } from '../../protocol/domain';
import { StaleQueryError } from '../contracts';
import type { InvalidationEvent, Logger, QueryContext, QueryCoordinator, QueryHandle } from '../contracts';
import { Emitter } from '../util/events';
import { mergeScopes, scopeMatchesKey } from './scopes';

type ComputeFn = (ctx: QueryContext, emit: (chunk: unknown) => void) => Promise<unknown>;
type ChunkListener = (chunk: unknown) => void;

interface Deferred {
    promise: Promise<unknown>;
    settled: boolean;
    resolve(value: unknown): void;
    reject(error: unknown): void;
}

function createDeferred(): Deferred {
    let resolveFn: (value: unknown) => void = () => undefined;
    let rejectFn: (error: unknown) => void = () => undefined;
    const promise = new Promise<unknown>((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
    });
    // Handles that were released (or whose owner never awaits) must not surface as unhandled
    // rejections; consumers awaiting `handle.value` still observe the rejection.
    promise.catch(() => undefined);
    const deferred: Deferred = {
        promise,
        settled: false,
        resolve(value) {
            if (!deferred.settled) {
                deferred.settled = true;
                resolveFn(value);
            }
        },
        reject(error) {
            if (!deferred.settled) {
                deferred.settled = true;
                rejectFn(error);
            }
        },
    };
    return deferred;
}

interface Subscription {
    released: boolean;
    deferred: Deferred;
    onChunk?: ChunkListener;
    /** Computation this subscription currently keeps alive (re-pointed when carried over). */
    owner: Computation;
}

interface Computation {
    key: ResourceKey;
    generation: number;
    controller: AbortController;
    compute: ComputeFn;
    /** Handles created for this computation; they receive its value and chunks. */
    attached: Set<Subscription>;
    /** Unreleased handles among `attached`. */
    active: Set<Subscription>;
    /**
     * Unreleased handles of the stale predecessor, already rejected with `StaleQueryError`. They keep this
     * recompute alive only until a consumer joins it, it settles or the next invalidation, and are never
     * carried a second time; they do not receive its value.
     */
    carried: Set<Subscription>;
    settled: boolean;
}

function isAlive(computation: Computation): boolean {
    return computation.active.size > 0 || computation.carried.size > 0;
}

/** End the provisional keep-alive of carried-over handles; a later `release()` of such a handle is a no-op. */
function dropCarried(computation: Computation): void {
    for (const subscription of computation.carried) {
        subscription.released = true;
    }
    computation.carried.clear();
}

interface Entry {
    generation: number;
    value?: unknown;
    valueGeneration?: number;
    /**
     * Computation for the current generation: running, or finished and still allowed to stream
     * chunks (background enrichment) until the entry is invalidated or evicted.
     */
    current?: Computation;
}

interface PendingInvalidation {
    scope: InvalidationScope;
    reason: InvalidationReason;
    /** Keys bumped since the last flush with their generation after the latest bump. */
    keys: Map<ResourceKey, number>;
}

export interface QueryCoordinatorOptions {
    /** Upper bound on cached values; the least recently used values are dropped first (generations are kept). */
    maxCachedValues?: number;
    logger?: Logger;
}

const DEFAULT_MAX_CACHED_VALUES = 200;

/**
 * Deduplicates resource computations per `(key, generation)`, caches fresh results and turns
 * invalidation scopes into generation bumps plus one coalesced `onDidInvalidate` event per tick.
 *
 * Staleness: invalidating a key while its computation runs aborts that computation's signal,
 * rejects its handles with `StaleQueryError` and — if any of those handles is still subscribed —
 * starts the recompute for the new generation right away, so a consumer that re-`query()`s on
 * `StaleQueryError` joins work already in flight instead of starting over; the old handles keep that
 * recompute alive only until a consumer joins it, it settles or the next invalidation, and are never
 * carried twice. The recompute's `compute` call is deferred by one microtask so a synchronous burst of
 * invalidations starts it once.
 *
 * Chunks reach every unreleased handle that joined the computation, including after its value
 * resolved (streaming enrichment); a cache hit resolves with the final value only. Releasing the
 * last subscriber aborts the computation's signal one microtask later, so "release the stale
 * handle, then re-query" joins instead of restarting.
 */
export class DefaultQueryCoordinator implements QueryCoordinator {
    private readonly entries = new Map<ResourceKey, Entry>();
    /** Keys with a cached value in least-recently-used-first order. */
    private readonly cacheOrder = new Set<ResourceKey>();
    private readonly invalidateEmitter = new Emitter<InvalidationEvent>();
    readonly onDidInvalidate = this.invalidateEmitter.event;

    private pending: PendingInvalidation | undefined;
    private invalidationCount = 0;
    private disposed = false;
    private readonly maxCachedValues: number;
    private readonly logger: Logger | undefined;

    constructor(options: QueryCoordinatorOptions = {}) {
        this.maxCachedValues = Math.max(1, options.maxCachedValues ?? DEFAULT_MAX_CACHED_VALUES);
        this.logger = options.logger;
    }

    query<T, C = never>(
        key: ResourceKey,
        compute: (ctx: QueryContext, emit: (chunk: C) => void) => Promise<T>,
        onChunk?: (chunk: C) => void,
    ): QueryHandle<T> {
        if (this.disposed) {
            const rejected = createDeferred();
            rejected.reject(new Error('QueryCoordinator is disposed'));
            return { key, generation: 0, value: rejected.promise as Promise<T>, release: () => undefined };
        }

        const entry = this.entryFor(key);
        const running = entry.current !== undefined && !entry.current.settled ? entry.current : undefined;
        if (!running && entry.valueGeneration !== undefined && entry.valueGeneration === entry.generation) {
            this.touch(key);
            return { key, generation: entry.generation, value: Promise.resolve(entry.value as T), release: () => undefined };
        }

        const computation = running ?? this.create(entry, key, compute as ComputeFn);
        const subscription: Subscription = {
            released: false,
            deferred: createDeferred(),
            onChunk: onChunk as ChunkListener | undefined,
            owner: computation,
        };
        computation.attached.add(subscription);
        computation.active.add(subscription);
        // A real subscriber replaces the provisional keep-alives of a recompute (none on a new computation).
        dropCarried(computation);
        if (!running) {
            this.run(entry, computation);
        }

        return {
            key,
            generation: computation.generation,
            value: subscription.deferred.promise as Promise<T>,
            release: () => this.release(entry, subscription),
        };
    }

    invalidate(scope: InvalidationScope, reason: InvalidationReason): void {
        if (this.disposed) {
            return;
        }
        this.invalidationCount++;
        const affected = new Map<ResourceKey, number>();
        for (const [key, entry] of this.entries) {
            if (!scopeMatchesKey(scope, key)) {
                continue;
            }
            entry.generation++;
            affected.set(key, entry.generation);
            const current = entry.current;
            if (!current) {
                continue;
            }
            entry.current = undefined;
            current.controller.abort();
            const stale = new StaleQueryError(key, current.generation);
            for (const subscription of current.attached) {
                subscription.deferred.reject(stale);
            }
            // Only real subscribers count: a recompute kept alive solely by carried handles is not carried again.
            if (!current.settled && current.active.size > 0) {
                this.carryOver(entry, current);
            }
            dropCarried(current);
        }

        if (this.pending) {
            this.pending.scope = mergeScopes(this.pending.scope, scope);
            for (const [key, generation] of affected) {
                this.pending.keys.set(key, generation);
            }
            return;
        }
        this.pending = { scope, reason, keys: affected };
        queueMicrotask(() => this.flushInvalidation());
    }

    generationOf(key: ResourceKey): number {
        return this.entries.get(key)?.generation ?? 0;
    }

    peek<T>(key: ResourceKey): { value: T; generation: number } | undefined {
        const entry = this.entries.get(key);
        if (!entry || entry.valueGeneration === undefined) {
            return undefined;
        }
        return { value: entry.value as T, generation: entry.valueGeneration };
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.pending = undefined;
        const error = new Error('QueryCoordinator is disposed');
        for (const entry of this.entries.values()) {
            const current = entry.current;
            entry.current = undefined;
            if (!current) {
                continue;
            }
            current.controller.abort();
            for (const subscription of current.attached) {
                subscription.deferred.reject(error);
            }
        }
        this.entries.clear();
        this.cacheOrder.clear();
        this.invalidateEmitter.dispose();
    }

    private entryFor(key: ResourceKey): Entry {
        let entry = this.entries.get(key);
        if (!entry) {
            entry = { generation: 0 };
            this.entries.set(key, entry);
        }
        return entry;
    }

    private create(entry: Entry, key: ResourceKey, compute: ComputeFn): Computation {
        if (entry.generation === 0) {
            entry.generation = 1;
        }
        // A finished computation may still be streaming for an evicted value; nobody can join it any more.
        entry.current?.controller.abort();
        const computation: Computation = {
            key,
            generation: entry.generation,
            controller: new AbortController(),
            compute,
            attached: new Set(),
            active: new Set(),
            carried: new Set(),
            settled: false,
        };
        entry.current = computation;
        return computation;
    }

    private run(entry: Entry, computation: Computation): void {
        if (this.disposed || entry.current !== computation || computation.settled) {
            return;
        }
        const emit = (chunk: unknown): void => {
            if (entry.current !== computation) {
                return;
            }
            for (const subscription of computation.attached) {
                if (!subscription.released && subscription.onChunk) {
                    try {
                        subscription.onChunk(chunk);
                    } catch (error) {
                        this.logger?.error(`[QueryCoordinator] chunk listener for ${computation.key} threw`, error);
                    }
                }
            }
        };

        let result: Promise<unknown>;
        try {
            result = Promise.resolve(computation.compute({ signal: computation.controller.signal, generation: computation.generation }, emit));
        } catch (error) {
            result = Promise.reject(error);
        }
        result.then(
            value => this.settle(entry, computation, { ok: true, value }),
            error => this.settle(entry, computation, { ok: false, error }),
        );
    }

    private settle(entry: Entry, computation: Computation, outcome: { ok: true; value: unknown } | { ok: false; error: unknown }): void {
        dropCarried(computation);
        computation.settled = true;
        if (this.disposed) {
            return;
        }
        if (entry.current !== computation) {
            // Superseded (invalidated, abandoned or evicted) while running: never cache; any handle
            // still waiting learns that the generation moved on.
            const stale = new StaleQueryError(computation.key, computation.generation);
            for (const subscription of computation.attached) {
                subscription.deferred.reject(stale);
            }
            return;
        }

        if (outcome.ok) {
            this.store(entry, computation.key, outcome.value);
            for (const subscription of computation.attached) {
                subscription.deferred.resolve(outcome.value);
            }
            return;
        }
        entry.current = undefined;
        for (const subscription of computation.attached) {
            subscription.deferred.reject(outcome.error);
        }
    }

    /**
     * Start the recompute for the new generation right away and let the stale computation's unreleased handles
     * keep it alive provisionally, so a consumer that re-`query()`s on `StaleQueryError` joins work already in
     * flight. Only `active` handles are carried; a recompute kept alive solely by carried handles is not carried
     * again (see `invalidate`). The `compute` call is deferred by one microtask so a synchronous burst of
     * invalidations starts at most one recompute.
     */
    private carryOver(entry: Entry, stale: Computation): void {
        const next = this.create(entry, stale.key, stale.compute);
        for (const subscription of stale.active) {
            subscription.owner = next;
            next.carried.add(subscription);
        }
        stale.active.clear();
        queueMicrotask(() => this.run(entry, next));
    }

    private release(entry: Entry, subscription: Subscription): void {
        if (subscription.released) {
            return;
        }
        subscription.released = true;
        const owner = subscription.owner;
        owner.active.delete(subscription);
        owner.carried.delete(subscription);
        if (isAlive(owner)) {
            return;
        }
        queueMicrotask(() => {
            if (isAlive(owner) || this.disposed) {
                return;
            }
            owner.controller.abort();
            if (!owner.settled && entry.current === owner) {
                entry.current = undefined;
            }
        });
    }

    private store(entry: Entry, key: ResourceKey, value: unknown): void {
        entry.value = value;
        entry.valueGeneration = entry.generation;
        this.touch(key);
        while (this.cacheOrder.size > this.maxCachedValues) {
            const oldest = this.cacheOrder.values().next().value;
            if (oldest === undefined) {
                break;
            }
            this.cacheOrder.delete(oldest);
            const evicted = this.entries.get(oldest);
            if (evicted) {
                evicted.value = undefined;
                evicted.valueGeneration = undefined;
                if (evicted.current?.settled) {
                    evicted.current.controller.abort();
                    evicted.current = undefined;
                }
            }
        }
    }

    private touch(key: ResourceKey): void {
        this.cacheOrder.delete(key);
        this.cacheOrder.add(key);
    }

    private flushInvalidation(): void {
        const pending = this.pending;
        this.pending = undefined;
        if (!pending || this.disposed) {
            return;
        }
        this.invalidateEmitter.fire({
            scope: pending.scope,
            reason: pending.reason,
            generation: this.invalidationCount,
            keys: [...pending.keys].map(([key, generation]) => ({ key, generation })),
        });
    }
}

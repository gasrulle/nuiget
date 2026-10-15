/**
 * Source health: which feeds are currently treated as unreachable, and a background monitor that
 * re-probes them so a feed that comes back is picked up without a manual refresh.
 */

import type { Disposable, Event, Logger } from '../contracts';
import { Emitter } from '../util/events';
import type { FailedSource, NuGetSource } from '../../protocol/domain';
import type { ServiceIndexClient, SourceHealth } from './types';
import { consoleFallbackLogger, isRemoteSourceUrl, redactUrl } from './wire';

/** How long a failed source stays "unhealthy" before the next access retries it. */
export const DEFAULT_FAILURE_TTL_MS = 120_000;

export interface SourceHealthTrackerOptions {
    failureTtlMs?: number;
    now?: () => number;
}

/**
 * In-memory `SourceHealth` with a failure TTL. A failure stays listed until a check settles it (`markHealthy`) or the
 * tracker is reset; once the TTL has passed, `isHealthy` allows the retry without forgetting it (N71).
 */
export class SourceHealthTracker implements SourceHealth {
    private readonly failures = new Map<string, { error: string; failedAt: number }>();
    private readonly changed = new Emitter<FailedSource[]>();
    /**
     * Fires with `failed()` when the set of failed sources changes: a source fails or its error changes, a failed source
     * recovers, or a non-empty set is reset. A failure recorded by an ordinary read is reported as well as a monitor's.
     */
    readonly onDidChange: Event<FailedSource[]> = this.changed.event;
    private readonly failureTtlMs: number;
    private readonly now: () => number;

    constructor(options: SourceHealthTrackerOptions = {}) {
        this.failureTtlMs = options.failureTtlMs ?? DEFAULT_FAILURE_TTL_MS;
        this.now = options.now ?? Date.now;
    }

    /** Sources whose last check failed; a retry is due once the failure TTL has passed (`isHealthy`), and the entry leaves when a check succeeds or the tracker is reset. */
    failed(): FailedSource[] {
        return [...this.failures.entries()].map(([url, entry]) => ({ url, error: entry.error }));
    }

    isHealthy(sourceUrl: string): boolean {
        const entry = this.failures.get(sourceUrl);
        return entry === undefined || this.isExpired(entry.failedAt);
    }

    markFailed(sourceUrl: string, error: string): void {
        const known = this.failures.get(sourceUrl);
        const isNew = known === undefined || known.error !== error;
        this.failures.set(sourceUrl, { error, failedAt: this.now() });
        if (isNew) {
            this.changed.fire(this.failed());
        }
    }

    markHealthy(sourceUrl: string): void {
        if (this.failures.delete(sourceUrl)) {
            this.changed.fire(this.failed());
        }
    }

    reset(): void {
        if (this.failures.size > 0) {
            this.failures.clear();
            this.changed.fire([]);
        }
    }

    private isExpired(failedAt: number): boolean {
        return this.now() - failedAt >= this.failureTtlMs;
    }
}

export interface HealthMonitorOptions {
    /** Delay before the next pass when at least one source failed the last pass. */
    failedIntervalMs: number;
    /** Delay before the next pass when every source was reachable. */
    healthyIntervalMs: number;
    logger?: Logger;
}

export interface HealthMonitor extends Disposable {
    /** Cancel the pending pass (and any pass in flight) and probe again now. */
    restart(): void;
}

/**
 * Probe every enabled remote source now, then keep re-probing: quickly while something is down,
 * slowly once everything answers. A single generation token guards every continuation, so
 * `restart()` (after a source mutation or manual refresh) can never leave two schedules running.
 */
export function startHealthMonitor(
    client: ServiceIndexClient,
    getSources: () => Promise<NuGetSource[]>,
    options: HealthMonitorOptions,
): HealthMonitor {
    const logger = options.logger ?? consoleFallbackLogger;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let disposed = false;

    const cancelPending = (): void => {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
        controller?.abort();
        controller = undefined;
    };

    const schedule = (gen: number, delayMs: number): void => {
        timer = setTimeout(() => {
            timer = undefined;
            void pass(gen);
        }, delayMs);
    };

    const pass = async (gen: number): Promise<void> => {
        if (gen !== generation) {
            return;
        }
        const signal = new AbortController();
        controller = signal;
        let hasFailures = true;
        try {
            const sources = await getSources();
            const remote = sources.filter(source => source.enabled && !source.isLocal && isRemoteSourceUrl(source.url));
            if (gen !== generation) {
                return;
            }
            if (remote.length > 0) {
                await client.probe(remote, signal.signal);
            }
            if (gen !== generation) {
                return;
            }
            const failedUrls = new Set(client.health.failed().map(failure => failure.url));
            const unreachable = remote.filter(source => failedUrls.has(source.url));
            hasFailures = unreachable.length > 0;
            if (hasFailures) {
                logger.info(`[SourceHealth] ${unreachable.length}/${remote.length} source(s) unreachable: ${unreachable.map(s => redactUrl(s.url)).join(', ')}`);
            } else {
                logger.debug(`[SourceHealth] ${remote.length} source(s) healthy`);
            }
        } catch (error) {
            if (gen !== generation) {
                return;
            }
            logger.warn(`[SourceHealth] Probe pass failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (gen !== generation) {
            return;
        }
        controller = undefined;
        schedule(gen, hasFailures ? options.failedIntervalMs : options.healthyIntervalMs);
    };

    const restart = (): void => {
        if (disposed) {
            return;
        }
        generation++;
        cancelPending();
        void pass(generation);
    };

    restart();

    return {
        restart,
        dispose: () => {
            disposed = true;
            generation++;
            cancelPending();
        },
    };
}

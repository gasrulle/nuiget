/**
 * Source health: which feeds are currently treated as unreachable, and a background monitor that
 * re-probes them so a feed that comes back is picked up without a manual refresh.
 */

import type { Disposable, Logger } from '../contracts';
import type { FailedSource, NuGetSource } from '../../protocol/domain';
import type { ServiceIndexClient, SourceHealth } from './types';
import { consoleFallbackLogger, isRemoteSourceUrl, redactUrl } from './wire';

/** How long a failed source stays "unhealthy" before the next access retries it. */
export const DEFAULT_FAILURE_TTL_MS = 120_000;

export interface SourceHealthTrackerOptions {
    failureTtlMs?: number;
    now?: () => number;
}

/** In-memory `SourceHealth` with a failure TTL; expired failures are forgotten on access. */
export class SourceHealthTracker implements SourceHealth {
    private readonly failures = new Map<string, { error: string; failedAt: number }>();
    private readonly failureTtlMs: number;
    private readonly now: () => number;

    constructor(options: SourceHealthTrackerOptions = {}) {
        this.failureTtlMs = options.failureTtlMs ?? DEFAULT_FAILURE_TTL_MS;
        this.now = options.now ?? Date.now;
    }

    failed(): FailedSource[] {
        this.sweep();
        return [...this.failures.entries()].map(([url, entry]) => ({ url, error: entry.error }));
    }

    isHealthy(sourceUrl: string): boolean {
        const entry = this.failures.get(sourceUrl);
        if (!entry) {
            return true;
        }
        if (this.isExpired(entry.failedAt)) {
            this.failures.delete(sourceUrl);
            return true;
        }
        return false;
    }

    markFailed(sourceUrl: string, error: string): void {
        this.failures.set(sourceUrl, { error, failedAt: this.now() });
    }

    markHealthy(sourceUrl: string): void {
        this.failures.delete(sourceUrl);
    }

    reset(): void {
        this.failures.clear();
    }

    private isExpired(failedAt: number): boolean {
        return this.now() - failedAt >= this.failureTtlMs;
    }

    private sweep(): void {
        for (const [url, entry] of [...this.failures.entries()]) {
            if (this.isExpired(entry.failedAt)) {
                this.failures.delete(url);
            }
        }
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NuGetSource } from '../../protocol/domain';
import { SourceHealthTracker, startHealthMonitor, type HealthMonitor } from './health';
import type { ServiceIndexClient } from './types';

const source = (url: string, changes: Partial<NuGetSource> = {}): NuGetSource => ({ name: url, url, enabled: true, isLocal: false, ...changes } as NuGetSource);
const logger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('source health tracker', () => {
    it('onDidChange fires when the failed set changes and not otherwise', () => {
        let now = 0;
        const tracker = new SourceHealthTracker({ failureTtlMs: 1000, now: () => now });
        const seen: Array<Array<{ url: string; error: string }>> = [];
        tracker.onDidChange(failed => seen.push(failed));

        tracker.markHealthy('https://a.example');
        tracker.reset();
        expect(seen).toEqual([]);

        tracker.markFailed('https://a.example', 'timeout');
        tracker.markFailed('https://a.example', 'timeout');
        tracker.markFailed('https://a.example', 'HTTP 503');
        tracker.markFailed('https://b.example', 'timeout');
        now = 1500;
        tracker.markFailed('https://b.example', 'timeout');
        tracker.markHealthy('https://a.example');
        tracker.markHealthy('https://a.example');
        tracker.reset();

        expect(seen).toEqual([
            [{ url: 'https://a.example', error: 'timeout' }],
            [{ url: 'https://a.example', error: 'HTTP 503' }],
            [{ url: 'https://a.example', error: 'HTTP 503' }, { url: 'https://b.example', error: 'timeout' }],
            [{ url: 'https://b.example', error: 'timeout' }],
            [],
        ]);
    });

    it('a failed source is unhealthy for the failure TTL, then healthy again on access', () => {
        let now = 1_000;
        const health = new SourceHealthTracker({ failureTtlMs: 120_000, now: () => now });
        health.markFailed('https://a/', 'timeout');
        expect(health.isHealthy('https://a/')).toBe(false);
        expect(health.isHealthy('https://b/')).toBe(true);
        expect(health.failed()).toEqual([{ url: 'https://a/', error: 'timeout' }]);
        now += 119_999;
        expect(health.isHealthy('https://a/')).toBe(false);
        now += 1;
        expect(health.isHealthy('https://a/')).toBe(true);
        expect(health.failed()).toEqual([]);
    });

    it('markHealthy and reset forget failures; failed() drops expired ones', () => {
        let now = 0;
        const health = new SourceHealthTracker({ failureTtlMs: 10, now: () => now });
        health.markFailed('https://a/', 'x');
        health.markFailed('https://b/', 'y');
        health.markHealthy('https://a/');
        expect(health.failed().map(entry => entry.url)).toEqual(['https://b/']);
        now = 10;
        expect(health.failed()).toEqual([]);
        health.markFailed('https://c/', 'z');
        health.reset();
        expect(health.isHealthy('https://c/')).toBe(true);
    });
});

describe('source health monitor', () => {
    let monitor: HealthMonitor | undefined;

    beforeEach(() => {
        vi.useFakeTimers();
        logger.info.mockClear();
        logger.warn.mockClear();
    });

    afterEach(() => {
        monitor?.dispose();
        monitor = undefined;
        vi.useRealTimers();
    });

    function fakeClient(down: Set<string>) {
        const health = new SourceHealthTracker();
        const probe = vi.fn(async (sources: NuGetSource[], _signal?: AbortSignal) => {
            for (const entry of sources) {
                if (down.has(entry.url)) {
                    health.markFailed(entry.url, 'timeout');
                } else {
                    health.markHealthy(entry.url);
                }
            }
        });
        return { probe, client: { health, probe } as unknown as ServiceIndexClient };
    }

    it('probes the enabled remote sources at once, then quickly while one is down and slowly once all answer', async () => {
        const down = new Set(['https://private/v3/index.json']);
        const { probe, client } = fakeClient(down);
        const sources = [source('https://api.nuget.org/v3/index.json'), source('https://private/v3/index.json'), source('/local', { isLocal: true }), source('https://off/', { enabled: false })];
        monitor = startHealthMonitor(client, async () => sources, { failedIntervalMs: 1_000, healthyIntervalMs: 60_000, logger: logger as never });
        await vi.advanceTimersByTimeAsync(0);
        expect(probe).toHaveBeenCalledTimes(1);
        expect(probe.mock.calls[0][0].map(entry => entry.url)).toEqual(['https://api.nuget.org/v3/index.json', 'https://private/v3/index.json']);
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('1/2 source(s) unreachable'));
        await vi.advanceTimersByTimeAsync(1_000);
        expect(probe).toHaveBeenCalledTimes(2);
        down.clear();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(probe).toHaveBeenCalledTimes(3);
        // Everything answers: the next pass waits the healthy interval.
        await vi.advanceTimersByTimeAsync(59_000);
        expect(probe).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(1_000);
        expect(probe).toHaveBeenCalledTimes(4);
    });

    it('restart aborts the pass in flight and leaves one schedule; dispose stops it', async () => {
        const { client } = fakeClient(new Set());
        const signals: AbortSignal[] = [];
        let release: () => void = () => undefined;
        (client.probe as unknown as ReturnType<typeof vi.fn>).mockImplementation((_sources: NuGetSource[], signal: AbortSignal) => {
            signals.push(signal);
            return new Promise<void>(resolve => {
                release = resolve;
            });
        });
        monitor = startHealthMonitor(client, async () => [source('https://a/')], { failedIntervalMs: 1_000, healthyIntervalMs: 5_000, logger: logger as never });
        await vi.advanceTimersByTimeAsync(0);
        monitor.restart();
        await vi.advanceTimersByTimeAsync(0);
        expect(signals).toHaveLength(2);
        expect(signals[0].aborted).toBe(true);
        expect(signals[1].aborted).toBe(false);
        release();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(signals).toHaveLength(3);
        monitor.dispose();
        release();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(signals).toHaveLength(3);
        // Restart after dispose does nothing.
        monitor.restart();
        await vi.advanceTimersByTimeAsync(0);
        expect(signals).toHaveLength(3);
    });

    it('a pass whose source list cannot be read is logged and retried at the failed interval', async () => {
        const { probe, client } = fakeClient(new Set());
        let fails = true;
        monitor = startHealthMonitor(client, async () => {
            if (fails) {
                throw new Error('dotnet missing');
            }
            return [source('https://a/')];
        }, { failedIntervalMs: 1_000, healthyIntervalMs: 60_000, logger: logger as never });
        await vi.advanceTimersByTimeAsync(0);
        expect(logger.warn).toHaveBeenCalledWith('[SourceHealth] Probe pass failed: dotnet missing');
        fails = false;
        await vi.advanceTimersByTimeAsync(1_000);
        expect(probe).toHaveBeenCalledTimes(1);
    });
});

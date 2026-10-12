import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { DotnetResult, DotnetRunOptions, DotnetRunner, KeyValueStore, Logger, SdkInfo } from '../contracts';
import { redact, redactArgv } from '../logging/redact';
import { listSourceArgs, restoreArgs } from './commands';
import { sdkInfoFromVersion } from './sdk';

export const DEFAULT_TIMEOUT_MS = 60_000;
export const RESTORE_TIMEOUT_MS = 120_000;
/** Per-stream capture cap; output beyond it is dropped and marked, never buffered. */
export const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
export const OUTPUT_TRUNCATED_MARKER = '\n[output truncated]';
/** Upper bound on cached SDK probes (and on the persisted snapshot). */
export const SDK_CACHE_MAX_ENTRIES = 256;

const SDK_PROBE_TIMEOUT_MS = 10_000;
const LOCALS_TIMEOUT_MS = 15_000;
const DEFAULT_KILL_GRACE_MS = 2_000;
// After `exit`, stdio normally closes within milliseconds; a longer wait means a grandchild
// (build server, reused MSBuild node) inherited the pipes and must not hold the result hostage.
const DEFAULT_STDIO_GRACE_MS = 1_000;

const FIXED_ENV: Record<string, string> = {
    DOTNET_CLI_UI_LANGUAGE: 'en',
    DOTNET_NOLOGO: '1',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    NO_COLOR: '1',
    TERM: 'dumb',
};

export type SpawnFunction = (file: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export interface DotnetRunnerOptions {
    /** Locate the `dotnet` executable; defaults to `resolveDotnetExecutable()`. */
    resolveExecutable?: () => string;
    /** Process launcher with `child_process.spawn` semantics (tests inject a wrapper). */
    spawn?: SpawnFunction;
    logger?: Logger;
    /** Delay between SIGTERM and SIGKILL when a run times out or is cancelled. */
    killGraceMs?: number;
    /** Delay after `exit` before stdio is force-closed. */
    stdioGraceMs?: number;
    /** Per-stream capture cap in bytes. */
    maxOutputBytes?: number;
}

/** The process could not be started at all (bad working directory, permissions, ...). */
export class DotnetSpawnError extends Error {
    readonly code: string | undefined;

    constructor(message: string, public readonly executable: string, cause: NodeJS.ErrnoException) {
        super(message, { cause });
        this.name = 'DotnetSpawnError';
        this.code = cause.code;
    }
}

/** The `dotnet` executable was not found. */
export class DotnetNotFoundError extends DotnetSpawnError {
    constructor(executable: string, cause: NodeJS.ErrnoException) {
        super(
            `Could not start "${executable}" (${cause.code ?? 'unknown error'}). Install the .NET SDK and make `
            + '"dotnet" available on PATH, or point DOTNET_ROOT at the installation directory.',
            executable,
            cause,
        );
        this.name = 'DotnetNotFoundError';
    }
}

/** A convenience command exited non-zero; `result` carries the full output. */
export class DotnetCommandError extends Error {
    constructor(public readonly result: DotnetResult) {
        super(`${redactArgv(result.argv).join(' ')} exited with code ${result.exitCode}: ${redact(firstLine(result.stderr || result.stdout))}`);
        this.name = 'DotnetCommandError';
    }
}

/**
 * Locate `dotnet`: `$DOTNET_ROOT/dotnet[.exe]` when that file exists, otherwise the PATH lookup
 * performed by the OS.
 */
export function resolveDotnetExecutable(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
    const root = env.DOTNET_ROOT;
    if (root) {
        const candidate = path.join(root, platform === 'win32' ? 'dotnet.exe' : 'dotnet');
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return 'dotnet';
}

interface PersistedSdkCache {
    v: string;
    entries: Record<string, string>;
}

function isPersistedSdkCache(value: unknown): value is PersistedSdkCache {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value as Partial<PersistedSdkCache>;
    return typeof candidate.v === 'string' && typeof candidate.entries === 'object' && candidate.entries !== null;
}

function firstLine(text: string): string {
    const line = text.split(/\r?\n/).find(candidate => candidate.trim().length > 0) ?? '';
    return line.length > 400 ? `${line.slice(0, 400)}…` : line;
}

class OutputCollector {
    private readonly chunks: Buffer[] = [];
    private bytes = 0;
    private truncated = false;

    constructor(private readonly limit: number) { }

    push(chunk: Buffer | string): void {
        if (this.truncated) {
            return;
        }
        const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
        const remaining = this.limit - this.bytes;
        if (buffer.length <= remaining) {
            this.chunks.push(buffer);
            this.bytes += buffer.length;
            return;
        }
        if (remaining > 0) {
            this.chunks.push(buffer.subarray(0, remaining));
            this.bytes = this.limit;
        }
        this.truncated = true;
    }

    text(): string {
        const text = Buffer.concat(this.chunks).toString('utf8');
        return this.truncated ? text + OUTPUT_TRUNCATED_MARKER : text;
    }
}

/** Shell-free `dotnet` runner: argv in, `{ exitCode, stdout, stderr }` out, SDK probing with a persisted cache. */
export class DefaultDotnetRunner implements DotnetRunner {
    private readonly resolveExecutable: () => string;
    private readonly spawn: SpawnFunction;
    private readonly logger: Logger | undefined;
    private readonly killGraceMs: number;
    private readonly stdioGraceMs: number;
    private readonly maxOutputBytes: number;

    private readonly sdkCache = new Map<string, SdkInfo | undefined>();
    private readonly sdkInFlight = new Map<string, Promise<SdkInfo | undefined>>();
    // Bumped by clearSdkCache() so a probe that started before the clear cannot resurrect stale data.
    private cacheEpoch = 0;
    private persistStore: KeyValueStore | undefined;
    private persistKey: string | undefined;
    private persistVersion: string | undefined;
    // All store writes are chained so a clear can never race with an older snapshot write.
    private persistChain: Promise<void> = Promise.resolve();

    private globalPackagesFolderPromise: Promise<string> | undefined;

    constructor(options: DotnetRunnerOptions = {}) {
        this.resolveExecutable = options.resolveExecutable ?? (() => resolveDotnetExecutable());
        this.spawn = options.spawn ?? nodeSpawn;
        this.logger = options.logger;
        this.killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
        this.stdioGraceMs = options.stdioGraceMs ?? DEFAULT_STDIO_GRACE_MS;
        this.maxOutputBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;
    }

    /**
     * Run `dotnet <args>`. Resolves for every exit (non-zero included); a non-positive or
     * non-finite `timeoutMs` disables the timeout. Rejects with `DotnetNotFoundError` /
     * `DotnetSpawnError` only when no process could be started.
     */
    run(args: string[], options: DotnetRunOptions): Promise<DotnetResult> {
        const argv = ['dotnet', ...args];
        if (options.signal?.aborted) {
            return Promise.resolve({ exitCode: -1, stdout: '', stderr: '', durationMs: 0, argv, cancelled: true });
        }
        const executable = this.resolveExecutable();
        // The fixed variables come last: a caller can add variables but never override them (ADR-003).
        const env: NodeJS.ProcessEnv = { ...process.env, ...options.env, ...FIXED_ENV };
        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const startedAt = performance.now();

        return new Promise<DotnetResult>((resolve, reject) => {
            let child: ChildProcess;
            try {
                child = this.spawn(executable, args, {
                    cwd: options.cwd,
                    env,
                    windowsHide: true,
                    shell: false,
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
            } catch (error) {
                reject(this.toSpawnError(executable, options.cwd, error));
                return;
            }

            const stdout = new OutputCollector(this.maxOutputBytes);
            const stderr = new OutputCollector(this.maxOutputBytes);
            child.stdout?.on('data', (chunk: Buffer | string) => stdout.push(chunk));
            child.stderr?.on('data', (chunk: Buffer | string) => stderr.push(chunk));

            let settled = false;
            let spawned = false;
            let timedOut = false;
            let cancelled = false;
            let killTimer: NodeJS.Timeout | undefined;
            let stdioTimer: NodeJS.Timeout | undefined;

            const terminate = (): void => {
                if (settled || child.exitCode !== null || child.signalCode !== null) {
                    return;
                }
                child.kill('SIGTERM');
                killTimer = setTimeout(() => child.kill('SIGKILL'), this.killGraceMs);
            };
            const onAbort = (): void => {
                cancelled = true;
                terminate();
            };
            const timeoutTimer = Number.isFinite(timeoutMs) && timeoutMs > 0
                ? setTimeout(() => {
                    timedOut = true;
                    terminate();
                }, timeoutMs)
                : undefined;
            options.signal?.addEventListener('abort', onAbort, { once: true });

            const cleanup = (): void => {
                if (timeoutTimer) {
                    clearTimeout(timeoutTimer);
                }
                if (killTimer) {
                    clearTimeout(killTimer);
                }
                if (stdioTimer) {
                    clearTimeout(stdioTimer);
                }
                options.signal?.removeEventListener('abort', onAbort);
            };

            child.once('spawn', () => {
                spawned = true;
            });
            child.on('error', (error: NodeJS.ErrnoException) => {
                if (settled) {
                    return;
                }
                if (!spawned) {
                    settled = true;
                    cleanup();
                    reject(this.toSpawnError(executable, options.cwd, error));
                    return;
                }
                this.logger?.warn(`dotnet ${redactArgv(args).join(' ')}: ${error.message}`);
            });
            child.once('exit', () => {
                stdioTimer = setTimeout(() => {
                    child.stdout?.destroy();
                    child.stderr?.destroy();
                }, this.stdioGraceMs);
            });
            child.once('close', (code, signal) => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                const forced = timedOut || cancelled;
                const result: DotnetResult = {
                    exitCode: forced ? -1 : (code ?? -1),
                    stdout: stdout.text(),
                    stderr: stderr.text(),
                    durationMs: Math.round(performance.now() - startedAt),
                    argv,
                };
                if (timedOut) {
                    result.timedOut = true;
                }
                if (cancelled) {
                    result.cancelled = true;
                }
                this.logResult(result, options.cwd, signal);
                resolve(result);
            });
        });
    }

    /**
     * Probe the SDK that applies in `cwd` (so `global.json` is honoured). A definitive answer is cached per
     * directory for the runner's lifetime: a parsed version, or a non-zero exit of `dotnet --version` (for
     * example a `global.json` that pins an SDK that is not installed). A transient failure is not cached and
     * the next call probes again: `dotnet` could not be started, the probe timed out or was cancelled, or
     * its output was not a version. Only successes are persisted.
     */
    sdkVersion(cwd: string): Promise<SdkInfo | undefined> {
        const key = path.resolve(cwd);
        if (this.sdkCache.has(key)) {
            return Promise.resolve(this.sdkCache.get(key));
        }
        const inFlight = this.sdkInFlight.get(key);
        if (inFlight) {
            return inFlight;
        }
        const epoch = this.cacheEpoch;
        const probe = this.probeSdk(key).then(({ info, definitive }) => {
            if (definitive && this.cacheEpoch === epoch) {
                this.sdkCache.set(key, info);
                this.trimSdkCache();
                if (info) {
                    this.persistSdkCache();
                }
            }
            return info;
        });
        this.sdkInFlight.set(key, probe);
        void probe.finally(() => {
            if (this.sdkInFlight.get(key) === probe) {
                this.sdkInFlight.delete(key);
            }
        });
        return probe;
    }

    /** Forget every probed SDK (e.g. after a `global.json` change) and drop the persisted snapshot. */
    clearSdkCache(): void {
        this.sdkCache.clear();
        this.sdkInFlight.clear();
        this.cacheEpoch++;
        if (this.persistStore && this.persistKey) {
            const store = this.persistStore;
            const key = this.persistKey;
            this.chainPersist(() => store.update(key, undefined));
        }
    }

    /**
     * Load the SDK cache persisted by a previous session and attach `store` for future writes.
     * Snapshots are stamped with the extension version so an upgrade starts from a clean cache.
     */
    hydrate(store: KeyValueStore, key: string, extensionVersion: string): void {
        this.persistStore = store;
        this.persistKey = key;
        try {
            const raw = store.get<unknown>(key);
            if (isPersistedSdkCache(raw) && raw.v === extensionVersion) {
                let count = 0;
                for (const [dir, version] of Object.entries(raw.entries)) {
                    if (count >= SDK_CACHE_MAX_ENTRIES) {
                        break;
                    }
                    if (typeof version !== 'string' || this.sdkCache.has(dir)) {
                        continue;
                    }
                    const info = sdkInfoFromVersion(version);
                    if (info) {
                        this.sdkCache.set(dir, info);
                        count++;
                    }
                }
            } else if (raw !== undefined) {
                this.chainPersist(() => store.update(key, undefined));
            }
        } catch {
            // Corrupt persisted state is not worth failing activation over; start empty.
        }
        this.persistVersion = extensionVersion;
    }

    /** Resolves once every pending persistence write has settled. */
    flush(): Promise<void> {
        return this.persistChain;
    }

    /** `dotnet nuget locals http-cache --clear`; true on exit 0. */
    async clearHttpCache(cwd: string = os.homedir()): Promise<boolean> {
        try {
            const result = await this.run(['nuget', 'locals', 'http-cache', '--clear'], { cwd, timeoutMs: LOCALS_TIMEOUT_MS });
            return result.exitCode === 0;
        } catch (error) {
            this.logger?.warn(`Could not clear the NuGet HTTP cache: ${describe(error)}`);
            return false;
        }
    }

    /** The NuGet global-packages folder as reported by the CLI, falling back to `~/.nuget/packages`. Cached. */
    globalPackagesFolder(cwd: string = os.homedir()): Promise<string> {
        if (!this.globalPackagesFolderPromise) {
            this.globalPackagesFolderPromise = this.resolveGlobalPackagesFolder(cwd);
        }
        return this.globalPackagesFolderPromise;
    }

    /** Stdout of `dotnet nuget list source --format detailed` run from `cwd`; throws `DotnetCommandError` on non-zero exit. */
    async listSourcesRaw(cwd: string): Promise<string> {
        const result = await this.run(listSourceArgs(), { cwd });
        if (result.exitCode !== 0) {
            throw new DotnetCommandError(result);
        }
        return result.stdout;
    }

    /** `dotnet restore <project>` run from the project directory. */
    restore(projectPath: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<DotnetResult> {
        return this.run(restoreArgs(projectPath), {
            cwd: path.dirname(projectPath),
            timeoutMs: options.timeoutMs ?? RESTORE_TIMEOUT_MS,
            signal: options.signal,
        });
    }

    /** `definitive` says whether the answer may be cached, see `sdkVersion`. */
    private async probeSdk(cwd: string): Promise<{ info: SdkInfo | undefined; definitive: boolean }> {
        try {
            const result = await this.run(['--version'], { cwd, timeoutMs: SDK_PROBE_TIMEOUT_MS });
            if (result.timedOut || result.cancelled) {
                this.logger?.warn(`dotnet --version ${result.timedOut ? 'timed out' : 'was cancelled'} in ${cwd}`);
                return { info: undefined, definitive: false };
            }
            if (result.exitCode !== 0) {
                this.logger?.warn(`dotnet --version failed in ${cwd} (exit ${result.exitCode}): ${redact(firstLine(result.stderr || result.stdout))}`);
                return { info: undefined, definitive: true };
            }
            const info = sdkInfoFromVersion(result.stdout);
            if (!info) {
                this.logger?.warn(`Unrecognized dotnet --version output in ${cwd}: ${redact(firstLine(result.stdout))}`);
            }
            return { info, definitive: info !== undefined };
        } catch (error) {
            this.logger?.warn(`dotnet is not available for ${cwd}: ${describe(error)}`);
            return { info: undefined, definitive: false };
        }
    }

    private async resolveGlobalPackagesFolder(cwd: string): Promise<string> {
        const fallback = path.join(os.homedir(), '.nuget', 'packages');
        try {
            const result = await this.run(['nuget', 'locals', 'global-packages', '--list'], { cwd, timeoutMs: LOCALS_TIMEOUT_MS });
            const match = /global-packages:\s*(.+)/i.exec(result.stdout);
            if (result.exitCode === 0 && match) {
                const folder = match[1].trim().replace(/[\\/]+$/, '');
                if (folder.length > 0) {
                    return folder;
                }
            }
        } catch (error) {
            this.logger?.warn(`Could not resolve the global-packages folder: ${describe(error)}`);
        }
        return fallback;
    }

    private trimSdkCache(): void {
        while (this.sdkCache.size > SDK_CACHE_MAX_ENTRIES) {
            const oldest = this.sdkCache.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            this.sdkCache.delete(oldest);
        }
    }

    private persistSdkCache(): void {
        if (!this.persistStore || !this.persistKey || !this.persistVersion) {
            return;
        }
        const entries: Record<string, string> = {};
        for (const [dir, info] of this.sdkCache) {
            if (info) {
                entries[dir] = info.version;
            }
        }
        const snapshot: PersistedSdkCache = { v: this.persistVersion, entries };
        const store = this.persistStore;
        const key = this.persistKey;
        this.chainPersist(() => store.update(key, snapshot));
    }

    private chainPersist(write: () => PromiseLike<void>): void {
        this.persistChain = this.persistChain
            .then(() => write())
            .then(() => undefined, () => undefined);
    }

    private toSpawnError(executable: string, cwd: string, error: unknown): DotnetSpawnError {
        const cause: NodeJS.ErrnoException = error instanceof Error ? error : new Error(String(error));
        if (cause.code === 'ENOENT' && !fs.existsSync(cwd)) {
            return new DotnetSpawnError(`Working directory "${cwd}" does not exist`, executable, cause);
        }
        if (cause.code === 'ENOENT' || cause.code === 'EACCES' || cause.code === 'EPERM') {
            return new DotnetNotFoundError(executable, cause);
        }
        return new DotnetSpawnError(`Could not start "${executable}": ${cause.message}`, executable, cause);
    }

    private logResult(result: DotnetResult, cwd: string, signal: NodeJS.Signals | null): void {
        if (!this.logger) {
            return;
        }
        const flags = [
            result.timedOut ? 'timed out' : undefined,
            result.cancelled ? 'cancelled' : undefined,
            signal ? `signal ${signal}` : undefined,
        ].filter((flag): flag is string => flag !== undefined);
        const suffix = flags.length > 0 ? `, ${flags.join(', ')}` : '';
        this.logger.debug(redact(`${redactArgv(result.argv).join(' ')} → exit ${result.exitCode} in ${result.durationMs} ms${suffix} (cwd ${cwd})`));
        const stderr = result.stderr.trim();
        if (stderr.length > 0) {
            const text = redact(stderr.length > 2000 ? `${stderr.slice(0, 2000)}…` : stderr);
            if (result.exitCode === 0) {
                this.logger.trace(text);
            } else {
                this.logger.debug(text);
            }
        }
    }
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

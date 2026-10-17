import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { DotnetResult, KeyValueStore, Logger, SdkInfo } from '../contracts';
import {
    DefaultDotnetRunner,
    DotnetCommandError,
    DotnetNotFoundError,
    DotnetSpawnError,
    OUTPUT_TRUNCATED_MARKER,
    resolveDotnetExecutable,
    SDK_CACHE_MAX_ENTRIES,
    type SpawnFunction,
} from './DotnetRunner';
import { FakeChild, type DotnetAnswer } from '../../test/harness/fakeDotnet';
import { sdkInfoFromVersion } from './sdk';

const FAKE_DOTNET = path.join(__dirname, '__fixtures__', 'fake-dotnet.cjs');
const CWD = fs.realpathSync(__dirname);
const MAX_WALL_CLOCK_MS = 1000;

interface FakeReport {
    argv: string[];
    cwd: string;
    env: Record<string, string>;
}

function parseReport(stdout: string): FakeReport {
    return JSON.parse(stdout.split('\n')[0]) as FakeReport;
}

interface RecordedSpawn {
    file: string;
    args: string[];
    options: SpawnOptions;
}

type RecordingSpawn = SpawnFunction & { calls: RecordedSpawn[]; children: ChildProcess[] };

/** Launch the fixture through node, forwarding the runner's argv, cwd and env. */
function fixtureSpawn(extraEnv: Record<string, string> = {}): RecordingSpawn {
    const calls: RecordedSpawn[] = [];
    const children: ChildProcess[] = [];
    const spawn: SpawnFunction = (file, args, options) => {
        calls.push({ file, args: [...args], options });
        const child = nodeSpawn(process.execPath, [FAKE_DOTNET, ...args], { ...options, env: { ...options.env, ...extraEnv } });
        children.push(child);
        return child;
    };
    return Object.assign(spawn, { calls, children });
}

/** The harness's answer of a fake `dotnet` call (`spawnError`, `lateError`, output, exit code). */
type ScriptedResponse = DotnetAnswer;

/** In-process stand-in for `spawn` that replays scripted output without starting a process. */
function scriptedSpawn(script: (args: string[]) => ScriptedResponse | Promise<ScriptedResponse>): RecordingSpawn {
    const calls: RecordedSpawn[] = [];
    const children: ChildProcess[] = [];
    const spawn: SpawnFunction = (file, args, options) => {
        calls.push({ file, args: [...args], options });
        const child = new FakeChild();
        children.push(child as unknown as ChildProcess);
        void (async () => child.answer(await script([...args])))();
        return child as unknown as ChildProcess;
    };
    return Object.assign(spawn, { calls, children });
}

function versionSpawn(version: string): RecordingSpawn {
    return scriptedSpawn(() => ({ stdout: `${version}\n` }));
}

function errno(code: string, message = `spawn dotnet ${code}`): NodeJS.ErrnoException {
    return Object.assign(new Error(message), { code });
}

function memoryStore(initial: Record<string, unknown> = {}) {
    const data = new Map<string, unknown>(Object.entries(initial));
    const update = vi.fn(async (key: string, value: unknown): Promise<void> => {
        if (value === undefined) {
            data.delete(key);
        } else {
            data.set(key, value);
        }
    });
    const get = (key: string, defaultValue?: unknown): unknown => (data.has(key) ? data.get(key) : defaultValue);
    const store: KeyValueStore = { get: get as KeyValueStore['get'], update };
    return { store, data, update };
}

function fakeLogger() {
    return {
        trace: vi.fn<Logger['trace']>(),
        debug: vi.fn<Logger['debug']>(),
        info: vi.fn<Logger['info']>(),
        warn: vi.fn<Logger['warn']>(),
        error: vi.fn<Logger['error']>(),
    } satisfies Logger;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => {
        resolve = res;
    });
    return { promise, resolve };
}

/** Keeps a test independent of `DOTNET_ROOT`: without it the runner resolves the machine's own SDK path. */
const plainDotnet = (): string => 'dotnet';

function dir(name: string): string {
    return path.resolve(path.sep, 'repo', name);
}

const SDK10: SdkInfo = { version: '10.0.401', major: 10, supported: true, cpmAwareAdd: true, cpmAwareAddProvenance: 'verified' };

describe('DefaultDotnetRunner.run with a fake dotnet process', () => {
    it('passes every argument through as one argv entry without a shell', async () => {
        const spawn = fixtureSpawn();
        const runner = new DefaultDotnetRunner({ spawn, resolveExecutable: () => '/opt/dotnet/dotnet' });
        const args = [
            'add', '/path with spaces/My Project.csproj', 'package', 'Foo',
            '--version', '1.0.0', 'has "double" quotes', "it's quoted",
            '$(id)', '`whoami`', '%PATH%', '$HOME', '&& rm -rf /', '| cat', '; echo hi', '--', '-',
        ];

        const result = await runner.run(args, { cwd: CWD });

        expect(result.exitCode).toBe(0);
        expect(result.cancelled).toBeUndefined();
        expect(result.timedOut).toBeUndefined();
        expect(result.argv).toEqual(['dotnet', ...args]);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        const report = parseReport(result.stdout);
        expect(report.argv).toEqual(args);
        expect(report.cwd).toBe(CWD);
        expect(spawn.calls).toHaveLength(1);
        expect(spawn.calls[0].file).toBe('/opt/dotnet/dotnet');
        expect(spawn.calls[0].args).toEqual(args);
        expect(spawn.calls[0].options).toMatchObject({ cwd: CWD, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    });

    it('forces the fixed CLI environment over caller variables', async () => {
        const runner = new DefaultDotnetRunner({ spawn: fixtureSpawn() });

        const result = await runner.run(['--info'], { cwd: CWD, env: { FAKE_EXTRA: 'from-caller', TERM: 'xterm-256color' } });

        expect(parseReport(result.stdout).env).toEqual({
            DOTNET_CLI_UI_LANGUAGE: 'en',
            DOTNET_NOLOGO: '1',
            DOTNET_CLI_TELEMETRY_OPTOUT: '1',
            DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
            NO_COLOR: '1',
            TERM: 'dumb',
            FAKE_EXTRA: 'from-caller',
        });
    });

    it('resolves with the exit code and stderr instead of rejecting on failure', async () => {
        const runner = new DefaultDotnetRunner({ spawn: fixtureSpawn() });

        const result = await runner.run(['restore'], { cwd: CWD, env: { FAKE_EXIT: '1', FAKE_STDERR: 'error NU1101: Unable to find package' } });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('error NU1101: Unable to find package');
        expect(parseReport(result.stdout).argv).toEqual(['restore']);
    });

    it('kills a hung process on timeout and reports timedOut', async () => {
        const spawn = fixtureSpawn();
        const logger = fakeLogger();
        const runner = new DefaultDotnetRunner({ spawn, logger });
        const started = performance.now();

        const result = await runner.run(['build'], { cwd: CWD, timeoutMs: 50, env: { FAKE_SLEEP_MS: '10000' } });

        expect(performance.now() - started).toBeLessThan(MAX_WALL_CLOCK_MS);
        expect(result.timedOut).toBe(true);
        expect(result.cancelled).toBeUndefined();
        expect(result.exitCode).toBe(-1);
        expect(spawn.children[0].signalCode).toBe('SIGTERM');
        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('timed out, signal SIGTERM'));
    });

    it.skipIf(process.platform === 'win32')('escalates to SIGKILL when the process ignores SIGTERM', async () => {
        const spawn = fixtureSpawn();
        const runner = new DefaultDotnetRunner({ spawn, killGraceMs: 50 });
        const controller = new AbortController();
        const started = performance.now();

        const pending = runner.run(['build'], { cwd: CWD, signal: controller.signal, env: { FAKE_SLEEP_MS: '10000', FAKE_IGNORE_SIGTERM: '1' } });
        // The report line proves the fixture has installed its SIGTERM handler.
        spawn.children[0].stdout?.once('data', () => controller.abort());
        const result = await pending;

        expect(performance.now() - started).toBeLessThan(MAX_WALL_CLOCK_MS);
        expect(result.cancelled).toBe(true);
        expect(result.exitCode).toBe(-1);
        expect(spawn.children[0].signalCode).toBe('SIGKILL');
    });

    it('terminates the process and reports cancelled when the signal aborts', async () => {
        const runner = new DefaultDotnetRunner({ spawn: fixtureSpawn() });
        const controller = new AbortController();
        const started = performance.now();

        const pending = runner.run(['build'], { cwd: CWD, signal: controller.signal, env: { FAKE_SLEEP_MS: '10000' } });
        setTimeout(() => controller.abort(), 20);
        const result = await pending;

        expect(performance.now() - started).toBeLessThan(MAX_WALL_CLOCK_MS);
        expect(result.cancelled).toBe(true);
        expect(result.timedOut).toBeUndefined();
        expect(result.exitCode).toBe(-1);
    });

    it('does not spawn when the signal is already aborted', async () => {
        const spawn = fixtureSpawn();
        const runner = new DefaultDotnetRunner({ spawn });
        const controller = new AbortController();
        controller.abort();

        const result = await runner.run(['build'], { cwd: CWD, signal: controller.signal });

        expect(result).toEqual({ exitCode: -1, stdout: '', stderr: '', durationMs: 0, argv: ['dotnet', 'build'], cancelled: true });
        expect(spawn.calls).toHaveLength(0);
    });

    it('treats a non-positive timeout as no timeout', async () => {
        const runner = new DefaultDotnetRunner({ spawn: fixtureSpawn() });

        const result = await runner.run(['build'], { cwd: CWD, timeoutMs: 0, env: { FAKE_SLEEP_MS: '150' } });

        expect(result.exitCode).toBe(0);
        expect(result.timedOut).toBeUndefined();
    });

    it('caps captured stdout at maxOutputBytes and appends the truncation marker', async () => {
        const runner = new DefaultDotnetRunner({ spawn: fixtureSpawn(), maxOutputBytes: 1024 });

        const result = await runner.run(['list'], { cwd: CWD, env: { FAKE_STDOUT_BYTES: String(256 * 1024), FAKE_STDERR: 'small' } });

        expect(result.exitCode).toBe(0);
        expect(result.stdout.endsWith(OUTPUT_TRUNCATED_MARKER)).toBe(true);
        expect(Buffer.byteLength(result.stdout.slice(0, -OUTPUT_TRUNCATED_MARKER.length))).toBe(1024);
        expect(result.stderr).toBe('small');
    });

    it('does not wait for a grandchild that inherited the stdio pipes', async () => {
        const runner = new DefaultDotnetRunner({ spawn: fixtureSpawn(), stdioGraceMs: 50 });
        const started = performance.now();

        const result = await runner.run(['build'], { cwd: CWD, env: { FAKE_ORPHAN_MS: '1500' } });

        expect(performance.now() - started).toBeLessThan(MAX_WALL_CLOCK_MS);
        expect(result.exitCode).toBe(0);
        expect(parseReport(result.stdout).argv).toEqual(['build']);
    });
});

describe('DefaultDotnetRunner.run spawn failures', () => {
    it('rejects with DotnetNotFoundError when the executable does not exist', async () => {
        const runner = new DefaultDotnetRunner({ resolveExecutable: () => '/nonexistent/dotnet-xyz' });

        const error: unknown = await runner.run(['--version'], { cwd: CWD }).catch(e => e);

        expect(error).toBeInstanceOf(DotnetNotFoundError);
        expect(error).toBeInstanceOf(DotnetSpawnError);
        const notFound = error as DotnetNotFoundError;
        expect(notFound.code).toBe('ENOENT');
        expect(notFound.executable).toBe('/nonexistent/dotnet-xyz');
        expect(notFound.message).toContain('DOTNET_ROOT');
        expect(notFound.cause).toMatchObject({ code: 'ENOENT' });
    });

    it('rejects with DotnetSpawnError naming the working directory when cwd does not exist', async () => {
        const runner = new DefaultDotnetRunner({ resolveExecutable: () => process.execPath });
        const missing = path.join(CWD, 'does-not-exist');

        const error: unknown = await runner.run(['--version'], { cwd: missing }).catch(e => e);

        expect(error).toBeInstanceOf(DotnetSpawnError);
        expect(error).not.toBeInstanceOf(DotnetNotFoundError);
        expect((error as DotnetSpawnError).message).toBe(`Working directory "${missing}" does not exist`);
    });

    it.each(['EACCES', 'EPERM'])('maps %s to DotnetNotFoundError', async code => {
        const runner = new DefaultDotnetRunner({ spawn: scriptedSpawn(() => ({ spawnError: errno(code) })), resolveExecutable: () => '/usr/bin/dotnet' });

        const error: unknown = await runner.run(['--version'], { cwd: CWD }).catch(e => e);

        expect(error).toBeInstanceOf(DotnetNotFoundError);
        expect((error as DotnetNotFoundError).code).toBe(code);
        expect((error as DotnetNotFoundError).message).toContain(`Could not start "/usr/bin/dotnet" (${code})`);
    });

    it('wraps other asynchronous spawn errors in DotnetSpawnError', async () => {
        const runner = new DefaultDotnetRunner({ spawn: scriptedSpawn(() => ({ spawnError: errno('EMFILE', 'spawn EMFILE') })), resolveExecutable: plainDotnet });

        const error: unknown = await runner.run(['--version'], { cwd: CWD }).catch(e => e);

        expect(error).toBeInstanceOf(DotnetSpawnError);
        expect(error).not.toBeInstanceOf(DotnetNotFoundError);
        expect((error as DotnetSpawnError).message).toBe('Could not start "dotnet": spawn EMFILE');
        expect((error as DotnetSpawnError).code).toBe('EMFILE');
    });

    it('wraps a synchronous spawn failure, including non-Error throwables', async () => {
        const throwing = new DefaultDotnetRunner({ spawn: () => { throw errno('EINVAL', 'spawn EINVAL'); }, resolveExecutable: plainDotnet });
        await expect(throwing.run(['--version'], { cwd: CWD })).rejects.toMatchObject({ name: 'DotnetSpawnError', code: 'EINVAL', message: 'Could not start "dotnet": spawn EINVAL' });

        // eslint-disable-next-line no-throw-literal -- exercises the non-Error path
        const throwingString = new DefaultDotnetRunner({ spawn: () => { throw 'boom'; }, resolveExecutable: plainDotnet });
        await expect(throwingString.run(['--version'], { cwd: CWD })).rejects.toMatchObject({ name: 'DotnetSpawnError', message: 'Could not start "dotnet": boom' });
    });

    it('logs instead of rejecting when an error is raised after the process started', async () => {
        const logger = fakeLogger();
        const spawn = scriptedSpawn(() => ({ lateError: new Error('kill EPERM'), stdout: 'ok\n' }));
        const runner = new DefaultDotnetRunner({ spawn, logger });

        const result = await runner.run(['build', '--password', 'hunter2'], { cwd: CWD });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('ok\n');
        expect(logger.warn).toHaveBeenCalledWith('dotnet build --password [REDACTED]: kill EPERM');
    });
});

describe('DefaultDotnetRunner logging', () => {
    it('logs a redacted summary and routes stderr to trace on success', async () => {
        const logger = fakeLogger();
        const spawn = scriptedSpawn(() => ({ stderr: 'warning: token=abc123\n' }));
        const runner = new DefaultDotnetRunner({ spawn, logger });

        await runner.run(['nuget', 'add', 'source', 'https://u:pw@feed.example/v3/index.json', '--password', 'hunter2'], { cwd: CWD });

        const summary = logger.debug.mock.calls[0][0] as string;
        expect(summary).toContain('dotnet nuget add source https://[REDACTED]@feed.example/v3/index.json --password [REDACTED] → exit 0');
        expect(summary).toContain(`(cwd ${CWD})`);
        expect(summary).not.toContain('hunter2');
        expect(logger.trace).toHaveBeenCalledWith('warning: token=[REDACTED]');
    });

    it('routes stderr to debug on failure and truncates very long output', async () => {
        const logger = fakeLogger();
        const spawn = scriptedSpawn(() => ({ code: 1, stderr: 'x'.repeat(5000) }));
        const runner = new DefaultDotnetRunner({ spawn, logger });

        await runner.run(['restore'], { cwd: CWD });

        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('dotnet restore → exit 1'));
        const stderrLine = logger.debug.mock.calls[1][0] as string;
        expect(stderrLine).toHaveLength(2001);
        expect(stderrLine.endsWith('…')).toBe(true);
        expect(logger.trace).not.toHaveBeenCalled();
    });

    it('stays silent without a logger', async () => {
        const runner = new DefaultDotnetRunner({ spawn: scriptedSpawn(() => ({ code: 1, stderr: 'boom' })) });

        const result = await runner.run(['restore'], { cwd: CWD });

        expect(result).toMatchObject({ exitCode: 1, stderr: 'boom' });
    });
});

describe('DefaultDotnetRunner.sdkVersion', () => {
    it.each<[string, SdkInfo]>([
        ['10.0.401\n', SDK10],
        ['10.0.100\r\n', { version: '10.0.100', major: 10, supported: true, cpmAwareAdd: true, cpmAwareAddProvenance: 'verified' }],
    ])('parses %j into SdkInfo', async (stdout, expected) => {
        const spawn = scriptedSpawn(() => ({ stdout }));
        const runner = new DefaultDotnetRunner({ spawn });

        await expect(runner.sdkVersion(dir('a'))).resolves.toEqual(expected);
        expect(spawn.calls[0]).toMatchObject({ args: ['--version'], options: { cwd: dir('a') } });
    });

    it('returns undefined and warns when the probe exits non-zero', async () => {
        const logger = fakeLogger();
        const spawn = scriptedSpawn(() => ({ code: 145, stderr: 'A compatible .NET SDK was not found.\nRequested SDK version: 7.0.100\n' }));
        const runner = new DefaultDotnetRunner({ spawn, logger });

        await expect(runner.sdkVersion(dir('pinned'))).resolves.toBeUndefined();

        expect(logger.warn).toHaveBeenCalledWith(`dotnet --version failed in ${dir('pinned')} (exit 145): A compatible .NET SDK was not found.`);
    });

    it('returns undefined and warns when the output is not a version', async () => {
        const logger = fakeLogger();
        const runner = new DefaultDotnetRunner({ spawn: scriptedSpawn(() => ({ stdout: 'Welcome to .NET!\n' })), logger });

        await expect(runner.sdkVersion(dir('a'))).resolves.toBeUndefined();

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unrecognized dotnet --version output'));
    });

    it('returns undefined and warns when dotnet cannot be started', async () => {
        const logger = fakeLogger();
        const runner = new DefaultDotnetRunner({ spawn: scriptedSpawn(() => ({ spawnError: errno('ENOENT') })), logger, resolveExecutable: plainDotnet });

        await expect(runner.sdkVersion(CWD)).resolves.toBeUndefined();

        expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/^dotnet is not available for .*: Could not start "dotnet" \(ENOENT\)/));
    });

    it('caches per directory, normalizes the key and deduplicates in-flight probes', async () => {
        const gate = deferred<ScriptedResponse>();
        const spawn = scriptedSpawn(() => gate.promise);
        const runner = new DefaultDotnetRunner({ spawn });

        const first = runner.sdkVersion(dir('a'));
        const second = runner.sdkVersion(`${dir('a')}${path.sep}`);
        const third = runner.sdkVersion(path.join(dir('a'), '..', 'a'));
        expect(spawn.calls).toHaveLength(1);

        gate.resolve({ stdout: '10.0.401\n' });
        await expect(Promise.all([first, second, third])).resolves.toEqual([SDK10, SDK10, SDK10]);

        await expect(runner.sdkVersion(dir('a'))).resolves.toEqual(SDK10);
        expect(spawn.calls).toHaveLength(1);

        await runner.sdkVersion(dir('b'));
        expect(spawn.calls).toHaveLength(2);
        expect(spawn.calls[1].options.cwd).toBe(dir('b'));
    });

    it('caches a non-zero probe', async () => {
        const spawn = scriptedSpawn(() => ({ code: 145, stderr: 'A compatible .NET SDK was not found.\n' }));
        const runner = new DefaultDotnetRunner({ spawn });

        await expect(runner.sdkVersion(dir('a'))).resolves.toBeUndefined();
        await expect(runner.sdkVersion(dir('a'))).resolves.toBeUndefined();

        expect(spawn.calls).toHaveLength(1);
    });

    it('retries after a spawn failure or timeout', async () => {
        let attempt = 0;
        const spawn = scriptedSpawn(() => (++attempt === 1 ? { spawnError: errno('ENOENT') } : { stdout: '10.0.401\n' }));
        const runner = new DefaultDotnetRunner({ spawn });

        await expect(runner.sdkVersion(CWD)).resolves.toBeUndefined();
        await expect(runner.sdkVersion(CWD)).resolves.toEqual(SDK10);
        expect(spawn.calls).toHaveLength(2);

        const timedOut: DotnetResult = { exitCode: -1, stdout: '', stderr: '', durationMs: 10_000, argv: ['dotnet', '--version'], timedOut: true };
        const cancelled: DotnetResult = { exitCode: -1, stdout: '', stderr: '', durationMs: 5, argv: ['dotnet', '--version'], cancelled: true };
        const flaky = new DefaultDotnetRunner({ spawn: versionSpawn('10.0.401') });
        const run = vi.spyOn(flaky, 'run').mockResolvedValueOnce(timedOut).mockResolvedValueOnce(cancelled);

        await expect(flaky.sdkVersion(dir('slow'))).resolves.toBeUndefined();
        await expect(flaky.sdkVersion(dir('slow'))).resolves.toBeUndefined();
        await expect(flaky.sdkVersion(dir('slow'))).resolves.toEqual(SDK10);
        await expect(flaky.sdkVersion(dir('slow'))).resolves.toEqual(SDK10);
        expect(run).toHaveBeenCalledTimes(3);
    });

    it('probes again when the output was not a version', async () => {
        let attempt = 0;
        const spawn = scriptedSpawn(() => ({ stdout: ++attempt === 1 ? 'Welcome to .NET!\n' : '10.0.401\n' }));
        const runner = new DefaultDotnetRunner({ spawn });

        await expect(runner.sdkVersion(dir('a'))).resolves.toBeUndefined();
        await expect(runner.sdkVersion(dir('a'))).resolves.toEqual(SDK10);
        expect(spawn.calls).toHaveLength(2);
    });

    it('reports an SDK below 10 as unsupported instead of undefined, and caches it', async () => {
        const spawn = versionSpawn('8.0.425');
        const runner = new DefaultDotnetRunner({ spawn });

        const expected: SdkInfo = { version: '8.0.425', major: 8, supported: false, cpmAwareAdd: false, cpmAwareAddProvenance: 'unverified' };
        await expect(runner.sdkVersion(dir('old'))).resolves.toEqual(expected);
        await expect(runner.sdkVersion(dir('old'))).resolves.toEqual(expected);
        expect(spawn.calls).toHaveLength(1);
    });

    it('clearSdkCache forgets probes and ignores a probe that started before the clear', async () => {
        const gate = deferred<ScriptedResponse>();
        let calls = 0;
        const spawn = scriptedSpawn(() => (++calls === 1 ? gate.promise : { stdout: '9.0.100\n' }));
        const runner = new DefaultDotnetRunner({ spawn });

        const stale = runner.sdkVersion(dir('a'));
        runner.clearSdkCache();
        gate.resolve({ stdout: '10.0.401\n' });
        await expect(stale).resolves.toEqual(SDK10);

        await expect(runner.sdkVersion(dir('a'))).resolves.toMatchObject({ version: '9.0.100' });
        expect(spawn.calls).toHaveLength(2);

        runner.clearSdkCache();
        await runner.sdkVersion(dir('a'));
        expect(spawn.calls).toHaveLength(3);
    });
});

describe('DefaultDotnetRunner.hydrate and flush', () => {
    const VERSION = '2.0.0';
    const KEY = 'nuiget.sdkCache';

    it('serves entries persisted by the same extension version without probing', async () => {
        const { store, update } = memoryStore({ [KEY]: { v: VERSION, entries: { [dir('a')]: '10.0.401', [dir('ten')]: '10.0.100' } } });
        const spawn = versionSpawn('9.0.100');
        const runner = new DefaultDotnetRunner({ spawn });

        runner.hydrate(store, KEY, VERSION);

        await expect(runner.sdkVersion(dir('a'))).resolves.toEqual(SDK10);
        await expect(runner.sdkVersion(dir('ten'))).resolves.toMatchObject({ version: '10.0.100', supported: true });
        expect(spawn.calls).toHaveLength(0);
        expect(update).not.toHaveBeenCalled();
    });

    it('discards a snapshot written by another extension version and removes it from the store', async () => {
        const { store, update, data } = memoryStore({ [KEY]: { v: '1.19.0', entries: { [dir('a')]: '10.0.401' } } });
        const spawn = versionSpawn('9.0.100');
        const runner = new DefaultDotnetRunner({ spawn });

        runner.hydrate(store, KEY, VERSION);
        await runner.flush();

        expect(update).toHaveBeenCalledWith(KEY, undefined);
        expect(data.has(KEY)).toBe(false);
        await expect(runner.sdkVersion(dir('a'))).resolves.toMatchObject({ version: '9.0.100' });
        expect(spawn.calls).toHaveLength(1);
    });

    it.each<unknown>(['garbage', 42, { v: 1, entries: {} }, { v: VERSION }, { v: VERSION, entries: null }, []])(
        'discards the malformed snapshot %j',
        async snapshot => {
            const { store, update } = memoryStore({ [KEY]: snapshot });
            const spawn = versionSpawn('10.0.401');
            const runner = new DefaultDotnetRunner({ spawn });

            runner.hydrate(store, KEY, VERSION);
            await runner.flush();

            expect(update).toHaveBeenCalledWith(KEY, undefined);
            await runner.sdkVersion(dir('a'));
            expect(spawn.calls).toHaveLength(1);
        },
    );

    it('skips entries that are not version strings', async () => {
        const { store } = memoryStore({ [KEY]: { v: VERSION, entries: { [dir('bad')]: 7, [dir('text')]: 'Welcome to .NET', [dir('ok')]: '10.0.401' } } });
        const spawn = versionSpawn('9.0.100');
        const runner = new DefaultDotnetRunner({ spawn });

        runner.hydrate(store, KEY, VERSION);

        await expect(runner.sdkVersion(dir('ok'))).resolves.toEqual(SDK10);
        await expect(runner.sdkVersion(dir('bad'))).resolves.toMatchObject({ version: '9.0.100' });
        await expect(runner.sdkVersion(dir('text'))).resolves.toMatchObject({ version: '9.0.100' });
        expect(spawn.calls).toHaveLength(2);
    });

    it('does nothing when the store has no snapshot and starts empty when it throws', async () => {
        const empty = memoryStore();
        const emptyRunner = new DefaultDotnetRunner({ spawn: versionSpawn('10.0.401') });
        emptyRunner.hydrate(empty.store, KEY, VERSION);
        await emptyRunner.flush();
        expect(empty.update).not.toHaveBeenCalled();

        const throwing: KeyValueStore = {
            get: (() => { throw new Error('storage unavailable'); }) as KeyValueStore['get'],
            update: vi.fn(async () => undefined),
        };
        const spawn = versionSpawn('10.0.401');
        const runner = new DefaultDotnetRunner({ spawn });
        runner.hydrate(throwing, KEY, VERSION);

        await expect(runner.sdkVersion(dir('a'))).resolves.toEqual(SDK10);
        expect(spawn.calls).toHaveLength(1);
    });

    it('persists successful probes stamped with the extension version, never failed ones', async () => {
        const { store, update, data } = memoryStore();
        const spawn = scriptedSpawn(args => (args[0] === '--version' ? { stdout: '10.0.401\n' } : { code: 1 }));
        const runner = new DefaultDotnetRunner({ spawn });
        runner.hydrate(store, KEY, VERSION);

        await runner.sdkVersion(dir('ok'));
        await runner.flush();
        expect(data.get(KEY)).toEqual({ v: VERSION, entries: { [dir('ok')]: '10.0.401' } });

        const failing = new DefaultDotnetRunner({ spawn: scriptedSpawn(() => ({ code: 1 })) });
        failing.hydrate(store, KEY, VERSION);
        await failing.sdkVersion(dir('broken'));
        await failing.flush();

        expect(data.get(KEY)).toEqual({ v: VERSION, entries: { [dir('ok')]: '10.0.401' } });
        expect(update).toHaveBeenCalledTimes(1);
    });

    it('does not persist without hydrate', async () => {
        const runner = new DefaultDotnetRunner({ spawn: versionSpawn('10.0.401') });

        await expect(runner.sdkVersion(dir('a'))).resolves.toEqual(SDK10);
        await expect(runner.flush()).resolves.toBeUndefined();
        expect(() => runner.clearSdkCache()).not.toThrow();
        await expect(runner.sdkVersion(dir('a'))).resolves.toEqual(SDK10);
    });

    it('keeps the persisted snapshot and the in-memory cache at SDK_CACHE_MAX_ENTRIES', async () => {
        const entries: Record<string, string> = {};
        for (let index = 0; index < SDK_CACHE_MAX_ENTRIES + 40; index++) {
            entries[dir(`p${index}`)] = '10.0.401';
        }
        const { store, data } = memoryStore({ [KEY]: { v: VERSION, entries } });
        const spawn = versionSpawn('9.0.100');
        const runner = new DefaultDotnetRunner({ spawn });
        runner.hydrate(store, KEY, VERSION);

        await expect(runner.sdkVersion(dir(`p${SDK_CACHE_MAX_ENTRIES - 1}`))).resolves.toEqual(SDK10);
        await expect(runner.sdkVersion(dir(`p${SDK_CACHE_MAX_ENTRIES}`))).resolves.toMatchObject({ version: '9.0.100' });
        expect(spawn.calls).toHaveLength(1);

        await runner.flush();
        const persisted = data.get(KEY) as { entries: Record<string, string> };
        expect(Object.keys(persisted.entries)).toHaveLength(SDK_CACHE_MAX_ENTRIES);
        expect(persisted.entries[dir('p0')]).toBeUndefined();
        expect(persisted.entries[dir(`p${SDK_CACHE_MAX_ENTRIES}`)]).toBe('9.0.100');

        // Eviction is first in, first out: probing p0 again evicted p1, and probing p1 again evicts p2.
        await runner.sdkVersion(dir('p0'));
        expect(spawn.calls).toHaveLength(2);
        await runner.sdkVersion(dir('p1'));
        expect(spawn.calls).toHaveLength(3);
        await runner.sdkVersion(dir('p2'));
        expect(spawn.calls).toHaveLength(4);
    });

    it('clearSdkCache drops the snapshot and flush survives store failures', async () => {
        const { store, update, data } = memoryStore();
        update.mockRejectedValueOnce(new Error('disk full'));
        const runner = new DefaultDotnetRunner({ spawn: versionSpawn('10.0.401') });
        runner.hydrate(store, KEY, VERSION);

        await runner.sdkVersion(dir('a'));
        await expect(runner.flush()).resolves.toBeUndefined();
        expect(data.has(KEY)).toBe(false);

        await runner.sdkVersion(dir('b'));
        await runner.flush();
        expect(data.get(KEY)).toEqual({ v: VERSION, entries: { [dir('a')]: '10.0.401', [dir('b')]: '10.0.401' } });

        runner.clearSdkCache();
        await runner.flush();
        expect(data.has(KEY)).toBe(false);
        expect(update).toHaveBeenLastCalledWith(KEY, undefined);
    });
});

describe('DefaultDotnetRunner convenience commands', () => {
    it('clearHttpCache runs nuget locals http-cache --clear and reports success by exit code', async () => {
        const ok = scriptedSpawn(() => ({ stdout: 'Clearing NuGet HTTP cache\nLocal resources cleared.\n' }));
        await expect(new DefaultDotnetRunner({ spawn: ok }).clearHttpCache(dir('a'))).resolves.toBe(true);
        expect(ok.calls[0]).toMatchObject({ args: ['nuget', 'locals', 'http-cache', '--clear'], options: { cwd: dir('a') } });

        const failing = scriptedSpawn(() => ({ code: 1 }));
        await expect(new DefaultDotnetRunner({ spawn: failing }).clearHttpCache()).resolves.toBe(false);
        expect(failing.calls[0].options.cwd).toBe(os.homedir());

        const logger = fakeLogger();
        const missing = scriptedSpawn(() => ({ spawnError: errno('ENOENT') }));
        await expect(new DefaultDotnetRunner({ spawn: missing, logger }).clearHttpCache()).resolves.toBe(false);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not clear the NuGet HTTP cache'));
    });

    it('globalPackagesFolder parses the CLI answer once and caches it', async () => {
        const spawn = scriptedSpawn(() => ({ stdout: 'global-packages: /Users/me/.nuget/packages/\n' }));
        const runner = new DefaultDotnetRunner({ spawn });

        await expect(runner.globalPackagesFolder(dir('a'))).resolves.toBe('/Users/me/.nuget/packages');
        await expect(runner.globalPackagesFolder()).resolves.toBe('/Users/me/.nuget/packages');

        expect(spawn.calls).toHaveLength(1);
        expect(spawn.calls[0]).toMatchObject({ args: ['nuget', 'locals', 'global-packages', '--list'], options: { cwd: dir('a') } });
    });

    it('globalPackagesFolder falls back to ~/.nuget/packages', async () => {
        const fallback = path.join(os.homedir(), '.nuget', 'packages');

        await expect(new DefaultDotnetRunner({ spawn: scriptedSpawn(() => ({ code: 1 })) }).globalPackagesFolder()).resolves.toBe(fallback);
        await expect(new DefaultDotnetRunner({ spawn: scriptedSpawn(() => ({ stdout: 'http-cache: /x\n' })) }).globalPackagesFolder()).resolves.toBe(fallback);
        await expect(new DefaultDotnetRunner({ spawn: scriptedSpawn(() => ({ stdout: 'global-packages:   \n' })) }).globalPackagesFolder()).resolves.toBe(fallback);

        const logger = fakeLogger();
        await expect(new DefaultDotnetRunner({ spawn: scriptedSpawn(() => ({ spawnError: errno('ENOENT') })), logger }).globalPackagesFolder()).resolves.toBe(fallback);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not resolve the global-packages folder'));
    });

    it('listSourcesRaw returns stdout and throws DotnetCommandError with a redacted first line on failure', async () => {
        const detailed = 'Registered Sources:\n  1.  nuget.org [Enabled]\n      https://api.nuget.org/v3/index.json\n';
        const ok = scriptedSpawn(() => ({ stdout: detailed }));
        await expect(new DefaultDotnetRunner({ spawn: ok }).listSourcesRaw(dir('a'))).resolves.toBe(detailed);
        expect(ok.calls[0]).toMatchObject({ args: ['nuget', 'list', 'source', '--format', 'detailed'], options: { cwd: dir('a') } });

        const failing = scriptedSpawn(() => ({ code: 1, stderr: '\n\nerror: Unable to load https://user:secret@feed/index.json\nmore\n' }));
        const error: unknown = await new DefaultDotnetRunner({ spawn: failing }).listSourcesRaw(dir('a')).catch(e => e);
        expect(error).toBeInstanceOf(DotnetCommandError);
        const commandError = error as DotnetCommandError;
        expect(commandError.message).toBe('dotnet nuget list source --format detailed exited with code 1: error: Unable to load https://[REDACTED]@feed/index.json');
        expect(commandError.result).toMatchObject({ exitCode: 1, argv: ['dotnet', 'nuget', 'list', 'source', '--format', 'detailed'] });
    });

    it('DotnetCommandError falls back to stdout and shortens very long lines', () => {
        const fromStdout = new DotnetCommandError({ exitCode: 2, stdout: 'only stdout here', stderr: '', durationMs: 1, argv: ['dotnet', 'x'] });
        expect(fromStdout.message).toBe('dotnet x exited with code 2: only stdout here');

        const long = new DotnetCommandError({ exitCode: 2, stdout: '', stderr: 'y'.repeat(450), durationMs: 1, argv: ['dotnet', 'x'] });
        expect(long.message).toBe(`dotnet x exited with code 2: ${'y'.repeat(400)}…`);

        const silent = new DotnetCommandError({ exitCode: 2, stdout: '', stderr: '', durationMs: 1, argv: ['dotnet', 'x'] });
        expect(silent.message).toBe('dotnet x exited with code 2: ');
    });

    it('restore runs dotnet restore from the project directory and honours the signal', async () => {
        const spawn = scriptedSpawn(() => ({ stdout: 'Restored.\n' }));
        const runner = new DefaultDotnetRunner({ spawn });
        const projectPath = path.join(dir('solution'), 'App', 'App.csproj');

        const result = await runner.restore(projectPath);
        expect(result.exitCode).toBe(0);
        expect(spawn.calls[0]).toMatchObject({ args: ['restore', projectPath], options: { cwd: path.dirname(projectPath) } });

        const controller = new AbortController();
        controller.abort();
        await expect(runner.restore(projectPath, { signal: controller.signal, timeoutMs: 5 })).resolves.toMatchObject({ cancelled: true, argv: ['dotnet', 'restore', projectPath] });
        expect(spawn.calls).toHaveLength(1);
    });
});

describe('resolveDotnetExecutable', () => {
    const root = path.join(__dirname, '__fixtures__', 'dotnet-root');

    it('prefers DOTNET_ROOT when it contains the host executable', () => {
        expect(resolveDotnetExecutable({ DOTNET_ROOT: root }, 'linux')).toBe(path.join(root, 'dotnet'));
        expect(resolveDotnetExecutable({ DOTNET_ROOT: root }, 'darwin')).toBe(path.join(root, 'dotnet'));
        expect(resolveDotnetExecutable({ DOTNET_ROOT: root }, 'win32')).toBe(path.join(root, 'dotnet.exe'));
    });

    it('falls back to PATH lookup when DOTNET_ROOT is unset or has no host', () => {
        expect(resolveDotnetExecutable({}, 'linux')).toBe('dotnet');
        expect(resolveDotnetExecutable({ DOTNET_ROOT: '' }, 'linux')).toBe('dotnet');
        expect(resolveDotnetExecutable({ DOTNET_ROOT: path.join(root, 'missing') }, 'linux')).toBe('dotnet');
    });
});

describe('DefaultDotnetRunner with the installed .NET SDK', () => {
    it.skipIf(process.env.NUIGET_SDK_TESTS !== '1')('runs dotnet --version and probes the matching SdkInfo', async () => {
        const runner = new DefaultDotnetRunner();

        const result = await runner.run(['--version'], { cwd: CWD, timeoutMs: 30_000 });

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
        await expect(runner.sdkVersion(CWD)).resolves.toEqual(sdkInfoFromVersion(result.stdout));
    }, 60_000);
});

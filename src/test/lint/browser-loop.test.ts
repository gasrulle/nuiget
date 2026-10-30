import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DATA, DEFAULT_FIXTURE, MACHINE_SETTINGS, machineSettingsFile, parseArgs, prepare, restoreTargets, stop, theme, THEME_IDS, UsageError, wait } from '../../../scripts/browser-loop.mjs';

/**
 * UX-P0.28: `scripts/browser-loop.mjs`, the steps of the browser exploration loop (`docs/plans/browser-loop.md`) that would
 * otherwise need `curl`, `lsof`, `rm` and `cp`. This test holds the command line, the projects `prepare` restores, its
 * order and refusals (with an injected runner, so no dotnet or code-server runs), the Machine settings, `theme`, `wait`
 * against a local server and `stop` with an injected `lsof`. The probe itself is the tracker's P0.28 row.
 */
const root = path.resolve(__dirname, '../../..');
const scratch: string[] = [];
const tempDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuiget-loop-'));
    scratch.push(dir);
    return dir;
};
const servers: Server[] = [];
afterEach(async () => {
    for (const dir of scratch.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
});

describe('browser-loop: the command line (UX-P0.28)', () => {
    it('defaults the fixture, the data directory, the URL, the timeout and the port', () => {
        expect(parseArgs(['prepare', '--vsix', 'x.vsix'])).toEqual({ step: 'prepare', vsix: path.resolve('x.vsix'), fixture: path.resolve(DEFAULT_FIXTURE), data: DEFAULT_DATA });
        expect(DEFAULT_DATA).toBe(path.join(os.homedir(), 'github', 'Tools', 'vscode-server', 'data'));
        expect(parseArgs(['theme', 'Light Modern'])).toEqual({ step: 'theme', theme: 'Light Modern', data: DEFAULT_DATA });
        expect(parseArgs(['wait'])).toEqual({ step: 'wait', url: 'http://127.0.0.1:8000/', timeoutMs: 60_000 });
        expect(parseArgs(['wait', '--url', 'http://127.0.0.1:9000/', '--timeout', '5'])).toEqual({ step: 'wait', url: 'http://127.0.0.1:9000/', timeoutMs: 5000 });
        expect(parseArgs(['stop'])).toEqual({ step: 'stop', port: 8000 });
        expect(parseArgs(['stop', '--port', '8001'])).toEqual({ step: 'stop', port: 8001 });
    });

    it('refuses a bad command line', () => {
        expect(() => parseArgs([])).toThrow(UsageError);
        expect(() => parseArgs(['start'])).toThrow('unknown step start');
        expect(() => parseArgs(['prepare'])).toThrow('prepare needs --vsix <file>');
        expect(() => parseArgs(['prepare', '--vsix', 'a', '--vsix', 'b'])).toThrow('--vsix is given twice');
        expect(() => parseArgs(['wait', '--port', '1'])).toThrow('wait takes no --port');
        expect(() => parseArgs(['wait', '--url', 'http://localhost:8000/'])).toThrow('--url is an http://127.0.0.1:<port>/ address');
        expect(() => parseArgs(['wait', '--timeout', '0'])).toThrow('--timeout takes seconds');
        expect(() => parseArgs(['stop', '--port', 'eighty'])).toThrow('--port takes a port number');
        expect(() => parseArgs(['theme'])).toThrow('theme takes one theme id');
        expect(() => parseArgs(['theme', 'Monokai'])).toThrow('no theme id Monokai');
        expect(() => parseArgs(['stop', 'now'])).toThrow('stop takes no argument now');
        expect(() => parseArgs(['constructor'])).toThrow('unknown step constructor');
        expect(() => parseArgs(['toString', '--port', '1'])).toThrow('unknown step toString');
    });

    it('exits 2 with the usage on a bad command line and 1 when wait gets no answer', () => {
        const script = path.join(root, 'scripts/browser-loop.mjs');
        const exit = (args: string[]): { status: number; stderr: string; stdout: string } => {
            try {
                return { status: 0, stderr: '', stdout: execFileSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' }) };
            } catch (error) {
                const failed = error as { status: number; stderr: string; stdout: string };
                return { status: failed.status, stderr: failed.stderr, stdout: failed.stdout };
            }
        };
        const usage = exit([]);
        expect(usage.status).toBe(2);
        expect(usage.stderr).toContain('browser-loop: name a step: prepare, theme, wait or stop\nusage: node scripts/browser-loop.mjs prepare');
        const unanswered = exit(['wait', '--url', 'http://127.0.0.1:9/', '--timeout', '1']);
        expect(unanswered.status).toBe(1);
        expect(unanswered.stdout).toContain('[browser-loop] http://127.0.0.1:9/ did not answer 200 in 1 s');
    });

    it('offers the six themes of the harness and the high-contrast pair\'s other labels', () => {
        expect(THEME_IDS).toEqual(['Dark Modern', 'Light Modern', 'Dark High Contrast', 'Light High Contrast', 'Dark 2026', 'Light 2026', 'Default High Contrast', 'Default High Contrast Light']);
    });
});

describe('browser-loop: prepare and theme (UX-P0.28)', () => {
    it('restores every project of the dense workspace but the unsupported one', () => {
        const fixture = path.join(root, DEFAULT_FIXTURE);
        expect(restoreTargets(fixture).map(file => path.relative(fixture, file).split(path.sep).join('/'))).toEqual([
            'app/Catalog/Catalog.csproj', 'app/Gateway/Gateway.csproj', 'tools/Utility/Utility.csproj',
        ]);
    });

    /** A runner that records each call and answers from `answers` (by command), success by default. */
    const runner = (answers: Record<string, { status: number; stdout?: string }> = {}) => {
        const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
        const run = (command: string, args: string[], cwd: string) => {
            calls.push({ command, args, cwd });
            const key = `${command} ${args.find(arg => arg.startsWith('--install') || arg.startsWith('--list')) ?? args[0]}`;
            return answers[key] ?? { status: 0, stdout: '' };
        };
        return { calls, run };
    };
    const vsixIn = (dir: string): string => {
        const file = path.join(dir, 'nuiget.vsix');
        fs.writeFileSync(file, 'vsix');
        return file;
    };
    const listed = { 'code-server --list-extensions': { status: 0, stdout: 'Gasrulle.nuiget@2.0.0\n' } };

    it('copies the fixture afresh without bin and obj, restores, installs, checks the listing and writes the Machine settings', () => {
        const data = tempDir();
        const fixture = tempDir();
        fs.mkdirSync(path.join(fixture, 'app', 'One', 'obj'), { recursive: true });
        fs.writeFileSync(path.join(fixture, 'app', 'One', 'One.csproj'), '<Project/>');
        fs.writeFileSync(path.join(fixture, 'app', 'One', 'obj', 'project.assets.json'), '{}');
        fs.mkdirSync(path.join(fixture, 'tools', 'Unsupported'), { recursive: true });
        fs.writeFileSync(path.join(fixture, 'tools', 'Unsupported', 'Unsupported.csproj'), '<Project/>');
        fs.mkdirSync(path.join(data, 'fixture'), { recursive: true });
        fs.writeFileSync(path.join(data, 'fixture', 'stale.txt'), 'from an earlier run');
        const { calls, run } = runner(listed);
        const lines: string[] = [];
        expect(prepare({ vsix: vsixIn(data), fixture, data }, { run, log: line => lines.push(line), version: '2.0.0' })).toBe(0);
        const copy = path.join(data, 'fixture');
        expect(fs.existsSync(path.join(copy, 'stale.txt'))).toBe(false);
        expect(fs.existsSync(path.join(copy, 'app', 'One', 'One.csproj'))).toBe(true);
        expect(fs.existsSync(path.join(copy, 'app', 'One', 'obj'))).toBe(false);
        expect(calls.map(call => [call.command, ...call.args.slice(0, 2)].join(' '))).toEqual([
            `dotnet restore ${path.join(copy, 'app', 'One', 'One.csproj')}`,
            `code-server --server-data-dir ${path.join(data, 'server-data')}`,
            `code-server --server-data-dir ${path.join(data, 'server-data')}`,
        ]);
        expect(calls[1].args).toEqual(['--server-data-dir', path.join(data, 'server-data'), '--install-extension', path.join(data, 'nuiget.vsix'), '--force']);
        expect(calls[2].args).toEqual(['--server-data-dir', path.join(data, 'server-data'), '--list-extensions', '--show-versions']);
        expect(JSON.parse(fs.readFileSync(machineSettingsFile(data), 'utf8'))).toEqual(MACHINE_SETTINGS);
        expect(MACHINE_SETTINGS).toMatchObject({ 'workbench.colorTheme': 'Dark Modern', 'workbench.experimental.modernUI': true, 'workbench.reduceMotion': 'on' });
        expect(lines).toContain('[browser-loop] installed Gasrulle.nuiget@2.0.0');
    });

    it('stops at a missing VSIX, a failed restore, a failed install and a failed listing', () => {
        const fixture = path.join(root, DEFAULT_FIXTURE);
        const attempt = (answers: Record<string, { status: number; stdout?: string }>, withVsix = true): { code: number; lines: string[] } => {
            const data = tempDir();
            const lines: string[] = [];
            const vsix = withVsix ? vsixIn(data) : path.join(data, 'missing.vsix');
            return { code: prepare({ vsix, fixture, data }, { run: runner(answers).run, log: line => lines.push(line), version: '2.0.0' }), lines };
        };
        expect(attempt(listed, false)).toMatchObject({ code: 1, lines: [expect.stringContaining('no VSIX at')] });
        const restore = attempt({ ...listed, 'dotnet restore': { status: 1, stdout: 'NU1101' } });
        expect(restore.code).toBe(1);
        expect(restore.lines.at(-1)).toContain('failed (exit 1)\nNU1101');
        const install = attempt({ ...listed, 'code-server --install-extension': { status: 1 } });
        expect(install.code).toBe(1);
        expect(install.lines.at(-1)).toContain('--install-extension failed (exit 1)');
        const listing = attempt({ 'code-server --list-extensions': { status: 1, stdout: '' } });
        expect(listing.code).toBe(1);
        expect(listing.lines.at(-1)).toContain('is not installed in');
    });

    it('names what the extensions directory holds when nUIget is missing or not alone', () => {
        const fixture = tempDir();
        const lines: string[] = [];
        const data = tempDir();
        const vsix = vsixIn(data);
        const old = runner({ 'code-server --list-extensions': { status: 0, stdout: 'Gasrulle.nuiget@1.18.9\n' } });
        expect(prepare({ vsix, fixture, data }, { run: old.run, log: line => lines.push(line), version: '2.0.0' })).toBe(1);
        expect(lines.at(-1)).toBe(`[browser-loop] nUIget 2.0.0 is not installed in ${path.join(data, 'server-data')}: Gasrulle.nuiget@1.18.9`);
        const crowded = runner({ 'code-server --list-extensions': { status: 0, stdout: 'Gasrulle.nuiget@2.0.0\nms-dotnettools.csharp@2.1.0\n' } });
        expect(prepare({ vsix, fixture, data }, { run: crowded.run, log: line => lines.push(line), version: '2.0.0' })).toBe(1);
        expect(lines.at(-1)).toBe('[browser-loop] the extensions directory holds more than nUIget (upstream #341226): Gasrulle.nuiget@2.0.0, ms-dotnettools.csharp@2.1.0');
    });

    it('sets the theme in the Machine settings and keeps the other keys', () => {
        const data = tempDir();
        expect(theme({ theme: 'Light 2026', data }, { log: () => undefined })).toBe(0);
        expect(JSON.parse(fs.readFileSync(machineSettingsFile(data), 'utf8'))).toEqual({ ...MACHINE_SETTINGS, 'workbench.colorTheme': 'Light 2026' });
        fs.writeFileSync(machineSettingsFile(data), JSON.stringify({ 'workbench.colorTheme': 'Dark Modern', 'editor.fontSize': 14 }));
        theme({ theme: 'Dark High Contrast', data }, { log: () => undefined });
        expect(JSON.parse(fs.readFileSync(machineSettingsFile(data), 'utf8'))).toEqual({ 'workbench.colorTheme': 'Dark High Contrast', 'editor.fontSize': 14 });
    });
});

describe('browser-loop: wait and stop (UX-P0.28)', () => {
    /** A server on 127.0.0.1 that answers `codes` in turn, then the last one. */
    const serve = async (codes: number[]): Promise<string> => {
        let served = 0;
        const server = createServer((_request, response) => {
            response.writeHead(codes[Math.min(served++, codes.length - 1)]).end();
        });
        servers.push(server);
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    };

    it('returns once the server answers 200, after earlier answers that were not', async () => {
        const url = await serve([503, 503, 200]);
        const lines: string[] = [];
        expect(await wait({ url, timeoutMs: 10_000 }, { log: line => lines.push(line) })).toBe(0);
        expect(lines).toEqual([`[browser-loop] ${url} answers 200`]);
    });

    it('fails when nothing answers 200 in time', async () => {
        const url = await serve([404]);
        const lines: string[] = [];
        expect(await wait({ url, timeoutMs: 300 }, { log: line => lines.push(line) })).toBe(1);
        expect(lines.at(-1)).toBe(`[browser-loop] ${url} did not answer 200 in 0 s (last: 404)`);
        let clock = 0;
        expect(await wait({ url: 'http://127.0.0.1:9/', timeoutMs: 1000 }, { status: async () => undefined, now: () => (clock += 600), log: line => lines.push(line) })).toBe(1);
        expect(lines.at(-1)).toBe('[browser-loop] http://127.0.0.1:9/ did not answer 200 in 1 s (last: no answer)');
    });

    it('stops each process lsof lists as listening on the port, once', () => {
        const killed: number[] = [];
        const calls: string[][] = [];
        const lines: string[] = [];
        const run = (command: string, args: string[]) => {
            calls.push([command, ...args]);
            return { status: 0, stdout: '4242\n4243\n4242\n' };
        };
        expect(stop({ port: 8000 }, { run, kill: pid => killed.push(pid), log: line => lines.push(line) })).toBe(0);
        expect(calls).toEqual([['lsof', '-nP', '-iTCP:8000', '-sTCP:LISTEN', '-t']]);
        expect(killed).toEqual([4242, 4243]);
        expect(lines).toEqual(['[browser-loop] stopped pid 4242, 4243 on port 8000']);
        expect(stop({ port: 8000 }, { run: () => ({ status: 1, stdout: '' }), kill: () => undefined, log: line => lines.push(line) })).toBe(0);
        expect(lines.at(-1)).toBe('[browser-loop] nothing listens on port 8000');
        expect(stop({ port: 8000 }, { run, kill: () => { throw new Error('EPERM'); }, log: line => lines.push(line) })).toBe(1);
        expect(lines.at(-1)).toBe('[browser-loop] could not stop pid 4242: EPERM');
    });

    it('fails, never reports "nothing listens", when lsof itself fails', () => {
        const lines: string[] = [];
        const killed: number[] = [];
        expect(stop({ port: 8000 }, { run: () => ({ status: null, error: new Error('spawnSync lsof ENOENT') }), kill: pid => killed.push(pid), log: line => lines.push(line) })).toBe(1);
        expect(lines).toEqual(['[browser-loop] lsof failed (spawnSync lsof ENOENT)']);
        expect(stop({ port: 8000 }, { run: () => ({ status: 2, stdout: '' }), kill: pid => killed.push(pid), log: line => lines.push(line) })).toBe(1);
        expect(lines.at(-1)).toBe('[browser-loop] lsof failed (exit 2)');
        expect(killed).toEqual([]);
    });
});

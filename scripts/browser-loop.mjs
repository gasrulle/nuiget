// The browser exploration loop's steps (docs/plans/browser-loop.md), so a session needs no curl, lsof, rm or cp rule:
//   node scripts/browser-loop.mjs prepare --vsix <file> [--fixture <dir>] [--data <dir>]
//   node scripts/browser-loop.mjs theme "<theme id>" [--data <dir>]
//   node scripts/browser-loop.mjs wait [--url <url>] [--timeout <seconds>]
//   node scripts/browser-loop.mjs stop [--port <port>]
//
// UX-P0.28. `prepare` copies the fixture (default the dense workspace) to `<data>/fixture` afresh, without its `bin/` and
// `obj/` folders, restores every project in it except `Unsupported/` (its SDK 8 pin keeps it unsupported), installs the
// VSIX into `<data>/server-data` with `code-server --install-extension --force`, checks that the extensions directory holds
// nUIget alone at the version of `package.json` (upstream #341226: another extension can break activation) and writes the
// Machine settings file, the one server-side settings file the web client reads. `theme` rewrites that file's
// `workbench.colorTheme`. `wait` polls the server until it answers HTTP 200 (never page text), with `node:http` where the
// row named `curl`. `stop` stops whatever
// listens on the port (`lsof`). The server itself is started from the Bash tool with `run_in_background` (§4 step 3).
// `<data>` defaults to `~/github/Tools/vscode-server/data`, never inside the repository. The exit code is 0 on success,
// 1 on a failed step, 2 on a wrong command line.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_DATA = path.join(os.homedir(), 'github', 'Tools', 'vscode-server', 'data');
export const DEFAULT_FIXTURE = 'src/test/ui/fixtures/dense-workspace';
export const DEFAULT_PORT = 8000;
export const DEFAULT_URL = `http://127.0.0.1:${DEFAULT_PORT}/`;

/** The theme ids the web build of VS Code 1.142.0 offers; the high-contrast pair may carry the `Default …` labels (§4 step 7). */
export const THEME_IDS = [
    'Dark Modern', 'Light Modern', 'Dark High Contrast', 'Light High Contrast', 'Dark 2026', 'Light 2026',
    'Default High Contrast', 'Default High Contrast Light',
];

/** The Machine settings of §4 step 2: the looks of the harness (Modern UI, reduced motion) and a quiet workbench. */
export const MACHINE_SETTINGS = {
    'workbench.colorTheme': 'Dark Modern',
    'workbench.startupEditor': 'none',
    'workbench.sideBar.location': 'left',
    'extensions.ignoreRecommendations': true,
    'git.openRepositoryInParentFolders': 'never',
    'workbench.experimental.modernUI': true,
    'workbench.reduceMotion': 'on',
};

export const USAGE = [
    'usage: node scripts/browser-loop.mjs prepare --vsix <file> [--fixture <dir>] [--data <dir>]',
    '       node scripts/browser-loop.mjs theme "<theme id>" [--data <dir>]',
    '       node scripts/browser-loop.mjs wait [--url <url>] [--timeout <seconds>]',
    '       node scripts/browser-loop.mjs stop [--port <port>]',
].join('\n');

/** A wrong command line: the CLI prints it with the usage and exits 2. */
export class UsageError extends Error {}

const OPTIONS = {
    prepare: ['--vsix', '--fixture', '--data'],
    theme: ['--data'],
    wait: ['--url', '--timeout'],
    stop: ['--port'],
};

/** The options of a command line: `{ step, … }` with paths resolved and defaults filled in. */
export function parseArgs(argv) {
    const [step, ...rest] = argv;
    if (step === undefined || !Object.hasOwn(OPTIONS, step)) {
        throw new UsageError(step === undefined ? 'name a step: prepare, theme, wait or stop' : `unknown step ${step}`);
    }
    const values = {};
    const positional = [];
    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i];
        if (!arg.startsWith('--')) {
            positional.push(arg);
            continue;
        }
        if (!OPTIONS[step].includes(arg)) {
            throw new UsageError(`${step} takes no ${arg}`);
        }
        const value = rest[i + 1];
        if (value === undefined || value.startsWith('--')) {
            throw new UsageError(`${arg} needs a value`);
        }
        if (arg in values) {
            throw new UsageError(`${arg} is given twice`);
        }
        values[arg] = value;
        i++;
    }
    const data = path.resolve(values['--data'] ?? DEFAULT_DATA);
    if (step === 'theme') {
        if (positional.length !== 1) {
            throw new UsageError('theme takes one theme id, in quotes');
        }
        if (!THEME_IDS.includes(positional[0])) {
            throw new UsageError(`no theme id ${positional[0]} (${THEME_IDS.join(', ')})`);
        }
        return { step, theme: positional[0], data };
    }
    if (positional.length > 0) {
        throw new UsageError(`${step} takes no argument ${positional[0]}`);
    }
    if (step === 'prepare') {
        if (values['--vsix'] === undefined) {
            throw new UsageError('prepare needs --vsix <file>');
        }
        return { step, vsix: path.resolve(values['--vsix']), fixture: path.resolve(values['--fixture'] ?? DEFAULT_FIXTURE), data };
    }
    if (step === 'wait') {
        const timeout = Number(values['--timeout'] ?? 60);
        if (!Number.isFinite(timeout) || timeout <= 0) {
            throw new UsageError(`--timeout takes seconds, not ${values['--timeout']}`);
        }
        const url = values['--url'] ?? DEFAULT_URL;
        if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(url)) {
            throw new UsageError(`--url is an http://127.0.0.1:<port>/ address, not ${url}`);
        }
        return { step, url, timeoutMs: timeout * 1000 };
    }
    const port = Number(values['--port'] ?? DEFAULT_PORT);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new UsageError(`--port takes a port number, not ${values['--port']}`);
    }
    return { step, port };
}

/** The Machine settings file under a data directory. */
export const machineSettingsFile = data => path.join(data, 'server-data', 'data', 'Machine', 'settings.json');

/** Every project file under `dir` that `prepare` restores: all but those under an `Unsupported` folder, in path order. */
export function restoreTargets(dir) {
    const found = [];
    const walk = folder => {
        for (const name of readdirSync(folder).sort()) {
            const full = path.join(folder, name);
            if (statSync(full).isDirectory()) {
                if (name !== 'bin' && name !== 'obj' && name !== 'Unsupported') {
                    walk(full);
                }
            } else if (name.endsWith('.csproj')) {
                found.push(full);
            }
        }
    };
    walk(dir);
    return found;
}

/** The version `package.json` declares: the one the VSIX must carry. */
const packageVersion = (root = ROOT) => JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;

/**
 * Prepares the data directory (§4 step 2); returns the exit code. `run` spawns a process and returns
 * `{ status, stdout }`; `log` prints a line.
 * @param {{ vsix: string, fixture: string, data: string }} options
 * @param {{ run?: (command: string, args: string[], cwd: string) => { status: number | null, stdout?: string }, log?: (line: string) => void, version?: string }} [io]
 * @returns {number}
 */
export function prepare(options, { run = (command, args, cwd) => spawnSync(command, args, { cwd, encoding: 'utf8' }), log = console.log, version = packageVersion() } = {}) {
    if (!existsSync(options.vsix)) {
        log(`[browser-loop] no VSIX at ${options.vsix}`);
        return 1;
    }
    const fixture = path.join(options.data, 'fixture');
    rmSync(fixture, { recursive: true, force: true });
    cpSync(options.fixture, fixture, { recursive: true, filter: source => !['bin', 'obj'].includes(path.basename(source)) });
    log(`[browser-loop] fixture ${options.fixture} copied to ${fixture}`);
    for (const project of restoreTargets(fixture)) {
        const restore = run('dotnet', ['restore', project], fixture);
        if (restore.status !== 0) {
            log(`[browser-loop] dotnet restore ${project} failed (exit ${restore.status})\n${restore.stdout ?? ''}`);
            return 1;
        }
        log(`[browser-loop] restored ${path.relative(fixture, project)}`);
    }
    const serverData = path.join(options.data, 'server-data');
    const install = run('code-server', ['--server-data-dir', serverData, '--install-extension', options.vsix, '--force'], fixture);
    if (install.status !== 0) {
        log(`[browser-loop] code-server --install-extension failed (exit ${install.status})\n${install.stdout ?? ''}`);
        return 1;
    }
    const listed = run('code-server', ['--server-data-dir', serverData, '--list-extensions', '--show-versions'], fixture);
    const extensions = (listed.stdout ?? '').split(/\r?\n/).map(line => line.trim()).filter(line => line !== '');
    if (listed.status !== 0 || !extensions.some(line => line.toLowerCase().endsWith(`.nuiget@${version}`))) {
        log(`[browser-loop] nUIget ${version} is not installed in ${serverData}: ${extensions.join(', ') || 'no extension listed'}`);
        return 1;
    }
    if (extensions.length > 1) {
        log(`[browser-loop] the extensions directory holds more than nUIget (upstream #341226): ${extensions.join(', ')}`);
        return 1;
    }
    log(`[browser-loop] installed ${extensions[0]}`);
    const settings = machineSettingsFile(options.data);
    mkdirSync(path.dirname(settings), { recursive: true });
    writeFileSync(settings, JSON.stringify(MACHINE_SETTINGS, null, 2) + '\n');
    log(`[browser-loop] Machine settings written: ${settings}`);
    return 0;
}

/**
 * Sets the theme in the Machine settings file (written with the defaults when absent); returns the exit code.
 * @param {{ theme: string, data: string }} options
 * @param {{ log?: (line: string) => void }} [io]
 * @returns {number}
 */
export function theme(options, { log = console.log } = {}) {
    const file = machineSettingsFile(options.data);
    const settings = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { ...MACHINE_SETTINGS };
    settings['workbench.colorTheme'] = options.theme;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
    log(`[browser-loop] workbench.colorTheme "${options.theme}" in ${file}; restart the server if the pane does not follow`);
    return 0;
}

/** The status code of one GET of `url`, or `undefined` when nothing answers. */
const statusOf = url => new Promise(resolve => {
    const request = get(url, response => {
        response.resume();
        resolve(response.statusCode);
    });
    request.setTimeout(5000, () => request.destroy());
    request.on('error', () => resolve(undefined));
});

/**
 * Polls `url` every 250 ms until it answers 200 (§4 step 4); resolves with the exit code.
 * @param {{ url: string, timeoutMs: number }} options
 * @param {{ status?: (url: string) => Promise<number | undefined>, log?: (line: string) => void, now?: () => number }} [io]
 * @returns {Promise<number>}
 */
export async function wait(options, { status = statusOf, log = console.log, now = Date.now } = {}) {
    const deadline = now() + options.timeoutMs;
    let last;
    for (;;) {
        last = await status(options.url);
        if (last === 200) {
            log(`[browser-loop] ${options.url} answers 200`);
            return 0;
        }
        if (now() > deadline) {
            log(`[browser-loop] ${options.url} did not answer 200 in ${Math.round(options.timeoutMs / 1000)} s (last: ${last ?? 'no answer'})`);
            return 1;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
}

/**
 * Stops whatever listens on the port (§4 step 9); returns the exit code. `run` spawns `lsof`, `kill` signals a pid.
 * @param {{ port: number }} options
 * @param {{ run?: (command: string, args: string[]) => { status: number | null, stdout?: string, error?: Error }, kill?: (pid: number) => unknown, log?: (line: string) => void }} [io]
 * @returns {number}
 */
export function stop(options, { run = (command, args) => spawnSync(command, args, { encoding: 'utf8' }), kill = pid => process.kill(pid, 'SIGTERM'), log = console.log } = {}) {
    const listed = run('lsof', ['-nP', `-iTCP:${options.port}`, '-sTCP:LISTEN', '-t']);
    // lsof exits 1 when nothing matches; anything else (or no process at all) is a failure, never "nothing listens".
    if (listed.error !== undefined || (listed.status !== 0 && listed.status !== 1)) {
        log(`[browser-loop] lsof failed (${listed.error instanceof Error ? listed.error.message : `exit ${listed.status}`})`);
        return 1;
    }
    const pids = [...new Set((listed.stdout ?? '').split(/\s+/).filter(line => /^\d+$/.test(line)).map(Number))];
    if (pids.length === 0) {
        log(`[browser-loop] nothing listens on port ${options.port}`);
        return 0;
    }
    for (const pid of pids) {
        try {
            kill(pid);
        } catch (error) {
            log(`[browser-loop] could not stop pid ${pid}: ${error instanceof Error ? error.message : String(error)}`);
            return 1;
        }
    }
    log(`[browser-loop] stopped pid ${pids.join(', ')} on port ${options.port}`);
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        if (!(error instanceof UsageError)) {
            throw error;
        }
        console.error(`browser-loop: ${error.message}\n${USAGE}`);
        process.exit(2);
    }
    const steps = { prepare, theme, wait, stop };
    process.exit(await steps[options.step](options));
}

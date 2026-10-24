// The UI harness: installs a VSIX into the UI tests' VS Code and runs HEAD's capture suites on it:
//   node scripts/ui-harness.mjs [--vsix <path> | --build-sha <sha> | --installed] [--tier A|B | --states <a,b,…>]
//       [--look modern|classic] [--storage <dir>] [--extensions_dir <dir>] [--code_version <version>]
//       [--code_settings <file>] [--open_resource <workspace>] [--dry-run]
//
// UX-P0.16 (H11; plan D36). Without `--vsix` it packages the working tree once (`npx vsce package`, which runs
// `vscode:prepublish`) into `<storage>/nuiget-working-tree.vsix`; with `--vsix` it installs that file as it is; with
// `--installed` it runs on the extension a previous step installed (`npm run test:ui` installs it before
// `test:ui:capture`). `--build-sha <sha>` makes `/tmp/nuiget-<sha>` with `git worktree add`, runs `npm ci` and
// `npx vsce package` there and prints the VSIX path: the negative control's tree is built beside the checkout and never
// checked out in it. Alone, `--build-sha` stops after the build; with `--tier` or `--states` the run measures that VSIX.
// The run uses ExTester's split commands (`get-vscode`, `get-chromedriver`, `install-vsix -f`, `run-tests`), which never
// package the working tree as `setup-and-run` does, and compiles HEAD's suites first (`tsconfig.test.json`), so the
// harness of HEAD measures whatever VSIX it installed. `--tier A` keeps the lane of the environment (the `ui` job leaves
// `NUIGET_UI_LANE` unset); `--tier B` is the matrix lane (`NUIGET_UI_THEME` names the shard). `--states` runs the captures
// of the named states only (`MOCHA_GREP` on the capture tests' titles, `<state>.<theme>.<width>.png`); MS-8 then compares
// the chrome within those states only (its reference is the first state measured), so a run that must count MS-8 uses
// `--tier`. The look is `--look`, else `NUIGET_UI_LOOK`, else Modern UI; the VS Code is test:ui's pin in `package.json`
// unless `--code_version` names one. The suites are handed to ExTester as files in name order, once they are compiled:
// ExTester runs a glob in the file system's order, and the artboard export must follow the capture suite. The exit code
// is the first failing step's, else the test run's.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The folder of HEAD's compiled capture suites (the named states, then the artboard export). */
export const CAPTURE_DIR = 'out/test/ui/v2/capture';
/** The run step's placeholder for the capture suites, replaced by `captureSuites` when the step runs. */
export const CAPTURE_SUITES = `${CAPTURE_DIR}/*.ui.test.js`;

/** The compiled capture suites under `root`, in name order. */
export function captureSuites(root = ROOT) {
    const dir = path.join(root, CAPTURE_DIR);
    return existsSync(dir) ? readdirSync(dir).filter(file => file.endsWith('.ui.test.js')).sort().map(file => `${CAPTURE_DIR}/${file}`) : [];
}
export const DENSE_WORKSPACE = 'src/test/ui/fixtures/dense-workspace/dense.code-workspace';
export const SETTINGS = { modern: 'src/test/ui/settings.json', classic: 'src/test/ui/settings.classic.json' };
export const DEFAULT_STORAGE = '/tmp/nuiget-ui';

export const USAGE = 'usage: node scripts/ui-harness.mjs [--vsix <path> | --build-sha <sha> | --installed] [--tier A|B | --states <a,b,…>]'
    + ' [--look modern|classic] [--storage <dir>] [--extensions_dir <dir>] [--code_version <version>] [--code_settings <file>]'
    + ' [--open_resource <workspace>] [--dry-run]';

const VALUE_OPTIONS = ['--vsix', '--build-sha', '--tier', '--states', '--look', '--storage', '--extensions_dir', '--code_version', '--code_settings', '--open_resource'];
const FLAG_OPTIONS = ['--installed', '--dry-run'];

/** A wrong usage: the CLI prints it with the usage line and exits 2. */
export class UsageError extends Error {}

/** The VS Code that `npm run test:ui` pins (`--code_version` in its script), the harness's default. */
export function pinnedCodeVersion(packageJson) {
    const version = /--code_version (\S+)/.exec(packageJson.scripts?.['test:ui'] ?? '')?.[1];
    if (version === undefined) {
        throw new UsageError('package.json: test:ui names no --code_version');
    }
    return version;
}

/**
 * The options of a command line; `env` gives the look's default (`NUIGET_UI_LOOK`), `packageJson` the VS Code pin.
 * @param {string[]} argv
 * @param {{ env?: Record<string, string | undefined>, packageJson?: { scripts?: Record<string, string> } }} [context]
 */
export function parseArgs(argv, { env = process.env, packageJson } = {}) {
    const values = {};
    const flags = new Set();
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (FLAG_OPTIONS.includes(arg)) {
            flags.add(arg);
        } else if (VALUE_OPTIONS.includes(arg)) {
            const value = argv[i + 1];
            if (value === undefined || value.startsWith('--')) {
                throw new UsageError(`${arg} needs a value`);
            }
            if (arg in values) {
                throw new UsageError(`${arg} is given twice`);
            }
            values[arg] = value;
            i++;
        } else {
            throw new UsageError(`unknown argument ${arg}`);
        }
    }
    const sources = [values['--vsix'] !== undefined, values['--build-sha'] !== undefined, flags.has('--installed')].filter(Boolean);
    if (sources.length > 1) {
        throw new UsageError('--vsix, --build-sha and --installed exclude each other');
    }
    if (values['--tier'] !== undefined && values['--states'] !== undefined) {
        throw new UsageError('--tier and --states exclude each other');
    }
    const tier = values['--tier'];
    if (tier !== undefined && tier !== 'A' && tier !== 'B') {
        throw new UsageError(`--tier is A or B, not ${tier}`);
    }
    const states = values['--states']?.split(',').map(state => state.trim()).filter(state => state !== '');
    if (states !== undefined && (states.length === 0 || states.some(state => !/^[a-z0-9-]+$/.test(state)))) {
        throw new UsageError(`--states takes state names separated by commas, not ${values['--states']}`);
    }
    const buildSha = values['--build-sha'];
    if (buildSha !== undefined && !/^[0-9a-f]{7,40}$/i.test(buildSha)) {
        throw new UsageError(`--build-sha takes a commit SHA (7 to 40 hex digits), not ${buildSha}`);
    }
    const look = values['--look'] ?? (env.NUIGET_UI_LOOK === 'classic' ? 'classic' : 'modern');
    if (look !== 'modern' && look !== 'classic') {
        throw new UsageError(`--look is modern or classic, not ${look}`);
    }
    const run = tier !== undefined || states !== undefined;
    if (!run && buildSha === undefined) {
        throw new UsageError('name the captures with --tier or --states (only --build-sha builds without a run)');
    }
    const storage = path.resolve(values['--storage'] ?? DEFAULT_STORAGE);
    return {
        vsix: values['--vsix'] === undefined ? undefined : path.resolve(values['--vsix']),
        buildSha: buildSha?.toLowerCase(),
        installed: flags.has('--installed'),
        tier,
        states,
        run,
        look,
        storage,
        extensionsDir: path.resolve(values['--extensions_dir'] ?? path.join(storage, 'extensions')),
        codeVersion: values['--code_version'] ?? pinnedCodeVersion(packageJson ?? JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))),
        codeSettings: values['--code_settings'] ?? SETTINGS[look],
        openResource: values['--open_resource'] ?? DENSE_WORKSPACE,
        dryRun: flags.has('--dry-run'),
    };
}

/** The `MOCHA_GREP` that keeps the capture tests of `states` (titles end in `<state>.<theme>.<width>.png`). */
export function stateGrep(states) {
    return ` (${states.join('|')})\\.[a-z0-9-]+\\.\\d+\\.png$`;
}

/** The folder `--build-sha` builds in. */
export const buildDir = sha => `/tmp/nuiget-${sha}`;

/**
 * The steps of one harness run, in order: `{ title, command, args, cwd, env?, outDir? }` runs a process (after creating
 * `outDir`, the folder vsce writes into), `{ title, vsix }` prints the VSIX path and its sha256. `exists` tells whether a
 * `--build-sha` worktree is already there (it is reused).
 */
export function plan(options, { root = ROOT, exists = existsSync } = {}) {
    const steps = [];
    let vsix = options.vsix;
    if (options.buildSha !== undefined) {
        const dir = buildDir(options.buildSha);
        if (!exists(dir)) {
            steps.push({ title: `worktree of ${options.buildSha}`, command: 'git', args: ['worktree', 'add', '--detach', dir, options.buildSha], cwd: root });
        }
        vsix = path.join(dir, `nuiget-${options.buildSha}.vsix`);
        steps.push({ title: `install the dependencies of ${options.buildSha}`, command: 'npm', args: ['ci', '--no-audit', '--no-fund'], cwd: dir });
        steps.push({ title: `package ${options.buildSha}`, command: 'npx', args: ['vsce', 'package', '--out', vsix], cwd: dir, outDir: dir });
        steps.push({ title: 'the VSIX', vsix });
    }
    if (!options.run) {
        return steps;
    }
    steps.push({ title: "compile HEAD's suites", command: 'npx', args: ['tsc', '-p', 'tsconfig.test.json'], cwd: root });
    if (!options.installed) {
        if (vsix === undefined) {
            vsix = path.join(options.storage, 'nuiget-working-tree.vsix');
            steps.push({ title: 'package the working tree', command: 'npx', args: ['vsce', 'package', '--out', vsix], cwd: root, outDir: options.storage });
        }
        if (options.buildSha === undefined) {
            steps.push({ title: 'the VSIX', vsix });
        }
        const where = ['--code_version', options.codeVersion, '--storage', options.storage];
        steps.push({ title: 'get VS Code', command: 'npx', args: ['extest', 'get-vscode', ...where], cwd: root });
        steps.push({ title: 'get ChromeDriver', command: 'npx', args: ['extest', 'get-chromedriver', ...where], cwd: root });
        steps.push({
            title: 'install the VSIX', command: 'npx', cwd: root,
            args: ['extest', 'install-vsix', '--vsix_file', vsix, '--storage', options.storage, '--extensions_dir', options.extensionsDir],
        });
    }
    const env = { NUIGET_UI_LOOK: options.look };
    if (options.tier === 'B') {
        env.NUIGET_UI_LANE = 'matrix';
    }
    if (options.states !== undefined) {
        env.MOCHA_GREP = stateGrep(options.states);
    }
    steps.push({
        title: 'run the capture suites', command: 'npx', cwd: root, env,
        args: [
            'extest', 'run-tests', CAPTURE_SUITES, '--code_version', options.codeVersion, '--code_settings', options.codeSettings,
            '--open_resource', options.openResource, '--storage', options.storage, '--extensions_dir', options.extensionsDir,
        ],
    });
    return steps;
}

/** One line per step, as `--dry-run` prints them. */
export function describeStep(step) {
    if (step.vsix !== undefined) {
        return `[harness] ${step.title}: ${step.vsix}`;
    }
    const env = Object.entries(step.env ?? {}).map(([key, value]) => `${key}=${JSON.stringify(value)} `).join('');
    return `[harness] ${step.title}: (cd ${step.cwd} && ${env}${[step.command, ...step.args].join(' ')})`;
}

/**
 * Runs the steps in order and returns the exit code: the first failing step's, else 0. The capture suites' placeholder
 * becomes the compiled files under the step's `cwd`, in name order (an empty folder fails the step).
 * @param {Array<{ title: string, command?: string, args?: string[], cwd?: string, env?: Record<string, string>, outDir?: string, vsix?: string }>} steps
 * @param {{ spawn?: (command: string, args: string[], options: object) => { status: number | null, error?: Error }, log?: (line: string) => void }} [io]
 * @returns {number}
 */
export function execute(steps, { spawn = spawnSync, log = console.log } = {}) {
    for (const step of steps) {
        if (step.vsix !== undefined) {
            if (!existsSync(step.vsix)) {
                log(`[harness] no VSIX at ${step.vsix}`);
                return 1;
            }
            log(`[harness] vsix ${step.vsix} sha256 ${createHash('sha256').update(readFileSync(step.vsix)).digest('hex')}`);
            continue;
        }
        let args = step.args;
        if (args.includes(CAPTURE_SUITES)) {
            const suites = captureSuites(step.cwd);
            if (suites.length === 0) {
                log(`[harness] no compiled capture suite under ${path.join(step.cwd, CAPTURE_DIR)}`);
                return 1;
            }
            args = args.flatMap(arg => (arg === CAPTURE_SUITES ? suites : [arg]));
        }
        if (step.outDir !== undefined) {
            mkdirSync(step.outDir, { recursive: true });
        }
        log(describeStep({ ...step, args }));
        const result = spawn(step.command, args, { cwd: step.cwd, env: { ...process.env, ...step.env }, stdio: 'inherit' });
        const status = result.error === undefined ? result.status ?? 1 : 1;
        if (status !== 0) {
            log(`[harness] ${step.title} failed (exit ${status}${result.error ? `, ${result.error.message}` : ''})`);
            return status;
        }
    }
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
        console.error(`ui-harness: ${error.message}\n${USAGE}`);
        process.exit(2);
    }
    const steps = plan(options);
    if (options.states !== undefined) {
        console.log('[harness] --states: MS-8 compares the chrome within the selected states only');
    }
    if (options.dryRun) {
        for (const step of steps) {
            console.log(describeStep(step));
        }
        process.exit(0);
    }
    process.exit(execute(steps));
}

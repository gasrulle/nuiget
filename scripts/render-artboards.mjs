// Renders the artboards of the manifest (`src/test/ui/v2/artboards.ts`) on their own:
//   node scripts/render-artboards.mjs [--states <a,b,…>] [--themes <t,…>] [--looks modern,classic] [--storage <dir>]
//       [--extensions_dir <dir>] [--code_version <version>] [--dry-run]
//
// UX-P0.27 (`docs/design/export-method.md`). It compiles HEAD's suites, fetches the pinned VS Code and its ChromeDriver
// into the storage directory and runs the artboard export suite alone (`zz-artboards.ui.test.js`, ExTester's
// `run-tests`), with `--extensions_dir` under the storage directory so nothing is written into `~/.vscode`. The suite
// opens each artboard in VS Code's integrated browser through `scripts/serve-artboards.mjs`, renders it at DPR 1 by CDP
// and writes `<storage>/screenshots/artboards/<state>.<theme>.<width>.png` (the capture naming; `<theme>-classic` for the
// classic look) and `<state>.spec.json`; each render's colour sample must match or the run fails. `--states`, `--themes`
// and `--looks` narrow the manifest (`NUIGET_ARTBOARD_STATES`, `_THEMES`, `_LOOKS`). The `ui` job renders the same
// artboards after its captures (`ui-harness.mjs` runs the suite last), and only that job's artifact is ever copied into
// `docs/design/artboards/`: a render on another host is never committed (fonts and colour profiles differ). The exit code
// is the first failing step's, else 0; the PNGs and their sha256 are listed at the end.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTURE_DIR, DEFAULT_STORAGE, describeStep, execute, pinnedCodeVersion, SETTINGS, UsageError } from './ui-harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The compiled export suite, run alone. */
export const ARTBOARD_SUITE = `${CAPTURE_DIR}/zz-artboards.ui.test.js`;

export const USAGE = 'usage: node scripts/render-artboards.mjs [--states <a,b,…>] [--themes <t,…>] [--looks modern,classic]'
    + ' [--storage <dir>] [--extensions_dir <dir>] [--code_version <version>] [--dry-run]';

const VALUE_OPTIONS = ['--states', '--themes', '--looks', '--storage', '--extensions_dir', '--code_version'];
const LIST_OPTIONS = { '--states': 'NUIGET_ARTBOARD_STATES', '--themes': 'NUIGET_ARTBOARD_THEMES', '--looks': 'NUIGET_ARTBOARD_LOOKS' };

/**
 * The options of a command line; `packageJson` gives the VS Code pin (`test:ui`'s `--code_version`). A list option takes
 * lower-case names separated by commas; the suite checks them against the manifest.
 * @param {string[]} argv
 * @param {{ packageJson?: { scripts?: Record<string, string> } }} [context]
 */
export function parseArgs(argv, { packageJson } = {}) {
    const values = {};
    let dryRun = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--dry-run') {
            dryRun = true;
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
    const env = { NUIGET_UI_LANE: 'ui', NUIGET_UI_LOOK: 'modern' };
    for (const [option, variable] of Object.entries(LIST_OPTIONS)) {
        const value = values[option];
        if (value === undefined) {
            continue;
        }
        const names = value.split(',').map(name => name.trim()).filter(name => name !== '');
        if (names.length === 0 || names.some(name => !/^[a-z0-9-]+$/.test(name))) {
            throw new UsageError(`${option} takes names separated by commas, not ${value}`);
        }
        env[variable] = names.join(',');
    }
    const storage = path.resolve(values['--storage'] ?? DEFAULT_STORAGE);
    return {
        env,
        storage,
        extensionsDir: path.resolve(values['--extensions_dir'] ?? path.join(storage, 'extensions')),
        codeVersion: values['--code_version'] ?? pinnedCodeVersion(packageJson ?? JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))),
        dryRun,
    };
}

/** Where the suite writes the renders: `artboards/` beside the crops, in the storage directory's screenshots. */
export const rendersDir = storage => path.join(storage, 'screenshots', 'artboards');

/** The steps of one render run, in the shape `ui-harness.mjs`'s `execute` runs. */
export function plan(options, { root = ROOT } = {}) {
    const where = ['--code_version', options.codeVersion, '--storage', options.storage];
    return [
        { title: "compile HEAD's suites", command: 'npx', args: ['tsc', '-p', 'tsconfig.test.json'], cwd: root },
        { title: 'get VS Code', command: 'npx', args: ['extest', 'get-vscode', ...where], cwd: root },
        { title: 'get ChromeDriver', command: 'npx', args: ['extest', 'get-chromedriver', ...where], cwd: root },
        {
            title: 'render the artboards', command: 'npx', cwd: root, env: options.env,
            args: [
                'extest', 'run-tests', ARTBOARD_SUITE, '--code_version', options.codeVersion, '--code_settings', SETTINGS.modern,
                '--storage', options.storage, '--extensions_dir', options.extensionsDir,
            ],
        },
    ];
}

/**
 * One line per file of the renders folder (PNGs and specs) written at or after `since` (ms; the folder is shared with
 * `test:ui`'s runs), with its sha256, or a line that this run wrote none.
 */
export function listRenders(dir, since = 0) {
    const files = existsSync(dir)
        ? readdirSync(dir).filter(file => (file.endsWith('.png') || file.endsWith('.spec.json')) && statSync(path.join(dir, file)).mtimeMs >= since).sort()
        : [];
    if (files.length === 0) {
        return [`[render] no render in ${dir}${since > 0 ? ' from this run' : ''}`];
    }
    return files.map(file => `[render] ${path.join(dir, file)} sha256 ${createHash('sha256').update(readFileSync(path.join(dir, file))).digest('hex')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        if (!(error instanceof UsageError)) {
            throw error;
        }
        console.error(`render-artboards: ${error.message}\n${USAGE}`);
        process.exit(2);
    }
    const steps = plan(options);
    if (options.dryRun) {
        for (const step of steps) {
            console.log(describeStep(step));
        }
        process.exit(0);
    }
    // A second's slack: some file systems keep modification times in whole seconds.
    const started = Date.now() - 1000;
    const status = execute(steps);
    for (const line of listRenders(rendersDir(options.storage), started)) {
        console.log(line);
    }
    console.log('[render] a render off the ui job is never committed: docs/design/artboards/ is copied from its artifact');
    process.exit(status);
}

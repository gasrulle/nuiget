import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { buildDir, CAPTURE_DIR, CAPTURE_SUITES, captureSuites, DENSE_WORKSPACE, describeStep, execute, parseArgs, pinnedCodeVersion, plan, stateGrep, UsageError } from '../../../scripts/ui-harness.mjs';
import { captureFile, isReady, STATES } from '../ui/v2/states';

/**
 * UX-P0.16: `scripts/ui-harness.mjs`, the one entry that installs a VSIX into the UI tests' VS Code and runs HEAD's
 * capture suites on it (the working tree's, a given file, the one a previous step installed, or another commit's for the
 * negative control). This test holds the options, the steps in order, the state filter, the exit codes, the package
 * scripts that call it and the negative-control job.
 */
const root = path.resolve(__dirname, '../../..');
// The Windows Test job checks out CRLF line ends (gotcha "A test reading a committed text file").
const read = (file: string): string => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
const PIN = /--code_version (\S+)/.exec(packageJson.scripts['test:ui'])![1];
const parse = (argv: string[], env: Record<string, string> = {}) => parseArgs(argv, { env, packageJson });
const titles = (steps: ReturnType<typeof plan>): string[] => steps.map(step => step.title);
const runStep = (steps: ReturnType<typeof plan>) => steps.find(step => step.title === 'run the capture suites');
// The paths the harness builds with `path`, as they read on the runner's platform.
const STORAGE = path.resolve('/tmp/nuiget-ui');
const EXTENSIONS = path.join(STORAGE, 'extensions');

describe('the UI harness (UX-P0.16)', () => {
    it('defaults to the storage, extensions directory, VS Code, settings and workspace of test:ui', () => {
        const options = parse(['--tier', 'A']);
        expect(options).toMatchObject({
            tier: 'A', run: true, look: 'modern', installed: false, dryRun: false, vsix: undefined, buildSha: undefined,
            storage: STORAGE, extensionsDir: EXTENSIONS, codeVersion: PIN,
            codeSettings: 'src/test/ui/settings.json', openResource: DENSE_WORKSPACE,
        });
        expect(pinnedCodeVersion(packageJson)).toBe(PIN);
        expect(() => pinnedCodeVersion({ scripts: {} })).toThrow(UsageError);
    });

    it('takes the look from --look, else NUIGET_UI_LOOK, and the classic settings with it', () => {
        expect(parse(['--tier', 'A'], { NUIGET_UI_LOOK: 'classic' })).toMatchObject({ look: 'classic', codeSettings: 'src/test/ui/settings.classic.json' });
        expect(parse(['--tier', 'A', '--look', 'modern'], { NUIGET_UI_LOOK: 'classic' })).toMatchObject({ look: 'modern', codeSettings: 'src/test/ui/settings.json' });
        expect(parse(['--tier', 'A', '--look', 'classic', '--code_settings', 'x.json', '--storage', '/tmp/h'])).toMatchObject({ codeSettings: 'x.json', extensionsDir: path.join(path.resolve('/tmp/h'), 'extensions') });
    });

    it('refuses a wrong usage', () => {
        const refused = [
            ['--tier'], ['--frobnicate'], ['--tier', 'A', '--tier', 'B'], ['--tier', 'C'], ['--tier', 'A', '--states', 'main-updates'],
            ['--states', 'Main Updates'], ['--states', ','], ['--vsix', 'a.vsix', '--installed', '--tier', 'A'], ['--build-sha', 'abc', '--tier', 'A'],
            ['--build-sha', '80940aa; rm -rf /'], ['--look', 'dark', '--tier', 'A'], [], ['--vsix', 'a.vsix'],
        ];
        for (const argv of refused) {
            expect(() => parse(argv), argv.join(' ')).toThrow(UsageError);
        }
        expect(parse(['--build-sha', '80940AA'])).toMatchObject({ buildSha: '80940aa', run: false });
    });

    it('packages the working tree once, installs it with the split commands and runs the capture suites', () => {
        const steps = plan(parse(['--tier', 'A']), { root });
        expect(titles(steps)).toEqual([
            "compile HEAD's suites", 'package the working tree', 'the VSIX', 'get VS Code', 'get ChromeDriver', 'install the VSIX', 'run the capture suites',
        ]);
        const vsix = path.join(STORAGE, 'nuiget-working-tree.vsix');
        expect(steps[1]).toMatchObject({ command: 'npx', args: ['vsce', 'package', '--out', vsix], cwd: root, outDir: STORAGE });
        expect(steps[3]).toMatchObject({ args: ['extest', 'get-vscode', '--code_version', PIN, '--storage', STORAGE] });
        expect(steps[5]).toMatchObject({ args: ['extest', 'install-vsix', '--vsix_file', vsix, '--storage', STORAGE, '--extensions_dir', EXTENSIONS] });
        expect(runStep(steps)).toMatchObject({
            command: 'npx', cwd: root, env: { NUIGET_UI_LOOK: 'modern' },
            args: ['extest', 'run-tests', CAPTURE_SUITES, '--code_version', PIN, '--code_settings', 'src/test/ui/settings.json', '--open_resource', DENSE_WORKSPACE, '--storage', STORAGE, '--extensions_dir', EXTENSIONS],
        });
        // Tier A keeps the lane of the environment.
        expect(runStep(steps)?.env).not.toHaveProperty('NUIGET_UI_LANE');
        expect(steps.flatMap(step => step.args ?? [])).not.toContain('setup-and-run');
    });

    it('installs a given VSIX as it is, and runs on the installed extension with --installed', () => {
        const given = plan(parse(['--vsix', 'old.vsix', '--tier', 'A']), { root });
        expect(titles(given)).not.toContain('package the working tree');
        expect(given.find(step => step.title === 'install the VSIX')?.args).toContain(path.resolve('old.vsix'));
        expect(titles(plan(parse(['--installed', '--tier', 'A']), { root }))).toEqual(["compile HEAD's suites", 'run the capture suites']);
    });

    it('builds another commit in a worktree beside the checkout and measures its VSIX', () => {
        const sha = '80940aa';
        const dir = buildDir(sha);
        expect(dir).toBe('/tmp/nuiget-80940aa');
        const vsix = path.join(dir, `nuiget-${sha}.vsix`);
        const buildOnly = plan(parse(['--build-sha', sha]), { root, exists: () => false });
        expect(buildOnly).toEqual([
            { title: `worktree of ${sha}`, command: 'git', args: ['worktree', 'add', '--detach', dir, sha], cwd: root },
            { title: `install the dependencies of ${sha}`, command: 'npm', args: ['ci', '--no-audit', '--no-fund'], cwd: dir },
            { title: `package ${sha}`, command: 'npx', args: ['vsce', 'package', '--out', vsix], cwd: dir, outDir: dir },
            { title: 'the VSIX', vsix },
        ]);
        const measured = plan(parse(['--build-sha', sha, '--tier', 'A']), { root, exists: candidate => candidate === dir });
        expect(titles(measured)).toEqual([
            `install the dependencies of ${sha}`, `package ${sha}`, 'the VSIX', "compile HEAD's suites", 'get VS Code', 'get ChromeDriver', 'install the VSIX', 'run the capture suites',
        ]);
        expect(measured.find(step => step.title === 'install the VSIX')?.args).toContain(vsix);
        expect(runStep(measured)?.cwd).toBe(root);
    });

    it('runs Tier B in the matrix lane and --states through MOCHA_GREP', () => {
        expect(runStep(plan(parse(['--installed', '--tier', 'B']), { root }))?.env).toEqual({ NUIGET_UI_LOOK: 'modern', NUIGET_UI_LANE: 'matrix' });
        const env = runStep(plan(parse(['--installed', '--states', 'main-installed-single,main-updates']), { root }))?.env;
        expect(env).toEqual({ NUIGET_UI_LOOK: 'modern', MOCHA_GREP: stateGrep(['main-installed-single', 'main-updates']) });
    });

    it('keeps exactly the capture tests of the named states', () => {
        const all = STATES.filter(isReady).flatMap(state => state.captures.map(capture => ({ state: state.name, title: `named states (ui lane, modern look) ${captureFile(state.name, capture)}` })));
        const others = ['named states (ui lane, modern look) workbench exemplar, modern look (UX-P0.14)', 'named states (ui lane, modern look) theme dump, six themes, modern look (UX-P0.14)'];
        const chosen = ['main-installed-single', 'main-installed-all', 'sidebar-sections'];
        const grep = new RegExp(stateGrep(chosen));
        for (const { state, title } of all) {
            expect(grep.test(title), title).toBe(chosen.includes(state));
        }
        for (const title of others) {
            expect(grep.test(title), title).toBe(false);
        }
    });

    it('stops at the first failing step with its exit code and prints the VSIX hash', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuiget-harness-'));
        try {
            const vsix = path.join(dir, 'x.vsix');
            fs.writeFileSync(vsix, 'vsix');
            const calls: string[] = [];
            const lines: string[] = [];
            const spawn = (command: string, args: string[]) => {
                calls.push([command, ...args].join(' '));
                return { status: args.includes('fail') ? 3 : 0 };
            };
            const steps = [
                { title: 'one', command: 'a', args: ['ok'], cwd: dir },
                { title: 'the VSIX', vsix },
                { title: 'two', command: 'b', args: ['fail'], cwd: dir },
                { title: 'three', command: 'c', args: ['ok'], cwd: dir },
            ];
            expect(execute(steps, { spawn, log: line => lines.push(line) })).toBe(3);
            expect(calls).toEqual(['a ok', 'b fail']);
            expect(lines).toContain(`[harness] vsix ${vsix} sha256 ${createHash('sha256').update('vsix').digest('hex')}`);
            expect(lines).toContain('[harness] two failed (exit 3)');
            expect(execute([{ title: 'the VSIX', vsix: path.join(dir, 'missing.vsix') }], { spawn, log: () => undefined })).toBe(1);
            expect(execute([{ title: 'gone', command: 'x', args: [], cwd: dir }], { spawn: () => ({ status: null, error: new Error('ENOENT') }), log: () => undefined })).toBe(1);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('hands ExTester the compiled capture suites in name order, after creating the folder vsce writes into', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuiget-harness-'));
        try {
            const suites = path.join(dir, CAPTURE_DIR);
            fs.mkdirSync(suites, { recursive: true });
            for (const file of ['zz-artboards.ui.test.js', 'capture.ui.test.js', 'capture.ui.test.js.map', 'layout.js']) {
                fs.writeFileSync(path.join(suites, file), '');
            }
            expect(captureSuites(dir)).toEqual([`${CAPTURE_DIR}/capture.ui.test.js`, `${CAPTURE_DIR}/zz-artboards.ui.test.js`]);
            const out = path.join(dir, 'storage');
            const seen: string[][] = [];
            const spawn = (_command: string, args: string[]) => {
                seen.push(args);
                return { status: 0 };
            };
            const steps = [
                { title: 'package', command: 'npx', args: ['vsce'], cwd: dir, outDir: out },
                { title: 'run the capture suites', command: 'npx', args: ['extest', 'run-tests', CAPTURE_SUITES, '--storage', out], cwd: dir },
            ];
            expect(execute(steps, { spawn, log: () => undefined })).toBe(0);
            expect(fs.existsSync(out)).toBe(true);
            expect(seen[1]).toEqual(['extest', 'run-tests', `${CAPTURE_DIR}/capture.ui.test.js`, `${CAPTURE_DIR}/zz-artboards.ui.test.js`, '--storage', out]);
            // No compiled suite: the run step fails instead of running nothing.
            fs.rmSync(suites, { recursive: true });
            expect(execute([steps[1]], { spawn, log: () => undefined })).toBe(1);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('prints the steps with --dry-run and exits 2 on a wrong usage', () => {
        const script = path.join(root, 'scripts/ui-harness.mjs');
        const out = execFileSync(process.execPath, [script, '--installed', '--states', 'main-updates', '--dry-run'], { encoding: 'utf8', cwd: root });
        // The lines carry the checkout's path, which the script and the test spell alike only on POSIX: compare their shape.
        const lines = out.trim().split('\n');
        const steps = plan(parse(['--installed', '--states', 'main-updates']), { root });
        expect(lines[0]).toBe('[harness] --states: MS-8 compares the chrome within the selected states only');
        expect(lines.slice(1).map(line => line.slice(0, line.indexOf(':')))).toEqual(steps.map(step => `[harness] ${step.title}`));
        expect(lines.at(-1)).toContain(`MOCHA_GREP=${JSON.stringify(stateGrep(['main-updates']))} npx extest run-tests ${CAPTURE_SUITES}`);
        expect(describeStep(steps[0])).toContain('npx tsc -p tsconfig.test.json');
        let status = 0;
        try {
            execFileSync(process.execPath, [script, '--tier', 'Z'], { encoding: 'utf8', cwd: root, stdio: 'pipe' });
        } catch (error) {
            status = (error as { status: number }).status;
        }
        expect(status).toBe(2);
    });

    it('is how test:ui:capture and test:ui:classic run the capture suites on the extension test:ui installed', () => {
        for (const name of ['test:ui:capture', 'test:ui:classic']) {
            const script = packageJson.scripts[name];
            const [prefix, args] = script.split('node scripts/ui-harness.mjs ');
            expect(args, name).toBeDefined();
            const env = Object.fromEntries(prefix.trim().split(/\s+/).filter(Boolean).map(pair => pair.split('=') as [string, string]));
            const options = parse(args.split(' '), env);
            expect(options, name).toMatchObject({ installed: true, tier: 'A', codeVersion: PIN, storage: STORAGE, openResource: DENSE_WORKSPACE });
            expect(options.look, name).toBe(name === 'test:ui:classic' ? 'classic' : 'modern');
        }
    });

    it('runs the negative control on dispatch with a SHA, which reaches the harness through the environment', () => {
        const workflow = read('.github/workflows/ci.yml');
        const start = workflow.indexOf('\n  negative-control:\n');
        expect(start, 'the negative-control job').toBeGreaterThan(-1);
        const rest = workflow.slice(start + 1);
        const job = rest.slice(0, rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/) + 1);
        expect(job).toContain("if: github.event_name == 'workflow_dispatch' && inputs.negative_sha != ''");
        expect(job).toContain('fetch-depth: 0');
        expect(job).toContain('NEGATIVE_SHA: ${{ inputs.negative_sha }}');
        expect(job).toContain('node scripts/ui-harness.mjs --build-sha "$NEGATIVE_SHA" --tier A');
        expect(job).toContain(`key: extester-vscode-${PIN}-`);
        // No expression is expanded inside a script.
        const runs = [...job.matchAll(/run: \|\n((?: {10}.*\n)+)/g)].map(match => match[1]).join('');
        expect(runs).not.toContain('${{');
    });
});

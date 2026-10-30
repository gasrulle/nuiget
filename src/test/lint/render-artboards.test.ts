import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { ARTBOARD_SUITE, listRenders, parseArgs, plan, rendersDir } from '../../../scripts/render-artboards.mjs';
import { UsageError } from '../../../scripts/ui-harness.mjs';

/**
 * UX-P0.27: `scripts/render-artboards.mjs`, which runs the artboard export suite alone. This test holds its options, its
 * steps (the extensions directory under the storage directory, the suite file, the manifest's filter as environment), the
 * listing of the renders and the CLI's usage error. The renders are the `ui` job's; no test here starts VS Code.
 */
const root = path.resolve(__dirname, '../../..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8').replace(/\r\n/g, '\n')) as { scripts: Record<string, string> };
const PIN = /--code_version (\S+)/.exec(packageJson.scripts['test:ui'])![1];
const parse = (argv: string[]) => parseArgs(argv, { packageJson });
const STORAGE = path.resolve('/tmp/nuiget-ui');

describe('render-artboards (UX-P0.27)', () => {
    it('defaults to the storage and VS Code of test:ui, with the extensions directory under the storage', () => {
        expect(parse([])).toEqual({
            env: { NUIGET_UI_LANE: 'ui', NUIGET_UI_LOOK: 'modern' },
            storage: STORAGE, extensionsDir: path.join(STORAGE, 'extensions'), codeVersion: PIN, dryRun: false,
        });
        const elsewhere = parse(['--storage', '/tmp/elsewhere', '--code_version', '1.139.0', '--dry-run']);
        expect(elsewhere).toMatchObject({ storage: path.resolve('/tmp/elsewhere'), extensionsDir: path.resolve('/tmp/elsewhere/extensions'), codeVersion: '1.139.0', dryRun: true });
        expect(parse(['--extensions_dir', '/tmp/x']).extensionsDir).toBe(path.resolve('/tmp/x'));
    });

    it('passes the manifest\'s filter to the suite as its environment', () => {
        expect(parse(['--states', 'main-installed-single', '--themes', 'dark-modern, light-modern', '--looks', 'classic']).env).toEqual({
            NUIGET_UI_LANE: 'ui', NUIGET_UI_LOOK: 'modern',
            NUIGET_ARTBOARD_STATES: 'main-installed-single', NUIGET_ARTBOARD_THEMES: 'dark-modern,light-modern', NUIGET_ARTBOARD_LOOKS: 'classic',
        });
    });

    it('refuses a bad command line', () => {
        expect(() => parse(['--states'])).toThrow(UsageError);
        expect(() => parse(['--states', 'a', '--states', 'b'])).toThrow('--states is given twice');
        expect(() => parse(['--looks', 'Modern'])).toThrow('--looks takes names separated by commas, not Modern');
        expect(() => parse(['--looks', ','])).toThrow(UsageError);
        expect(() => parse(['--tier', 'A'])).toThrow('unknown argument --tier');
    });

    it('compiles, fetches VS Code and ChromeDriver into the storage and runs the export suite alone', () => {
        const options = parse(['--looks', 'modern']);
        const steps = plan(options, { root: '/repo' });
        expect(steps.map(step => step.title)).toEqual(["compile HEAD's suites", 'get VS Code', 'get ChromeDriver', 'render the artboards']);
        expect(steps[1].args).toEqual(['extest', 'get-vscode', '--code_version', PIN, '--storage', STORAGE]);
        expect(steps[3]).toMatchObject({ cwd: '/repo', env: options.env });
        expect(steps[3].args).toEqual([
            'extest', 'run-tests', ARTBOARD_SUITE, '--code_version', PIN, '--code_settings', 'src/test/ui/settings.json',
            '--storage', STORAGE, '--extensions_dir', path.join(STORAGE, 'extensions'),
        ]);
        expect(ARTBOARD_SUITE).toBe('out/test/ui/v2/capture/zz-artboards.ui.test.js');
        expect(fs.existsSync(path.join(root, 'src/test/ui/v2/capture/zz-artboards.ui.test.ts'))).toBe(true);
    });

    it('lists the renders with their sha256, and says when there are none', () => {
        const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'nuiget-render-'));
        try {
            const dir = rendersDir(storage);
            expect(dir).toBe(path.join(storage, 'screenshots', 'artboards'));
            expect(listRenders(dir)).toEqual([`[render] no render in ${dir}`]);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'b.dark-modern.932.png'), 'png');
            fs.writeFileSync(path.join(dir, 'b.spec.json'), '{}');
            fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a render');
            const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
            expect(listRenders(dir)).toEqual([
                `[render] ${path.join(dir, 'b.dark-modern.932.png')} sha256 ${sha('png')}`,
                `[render] ${path.join(dir, 'b.spec.json')} sha256 ${sha('{}')}`,
            ]);
            // A file an earlier run left in the shared folder is not this run's render.
            const earlier = new Date(Date.now() - 60_000);
            fs.utimesSync(path.join(dir, 'b.spec.json'), earlier, earlier);
            const since = Date.now() - 30_000;
            expect(listRenders(dir, since)).toEqual([`[render] ${path.join(dir, 'b.dark-modern.932.png')} sha256 ${sha('png')}`]);
            fs.utimesSync(path.join(dir, 'b.dark-modern.932.png'), earlier, earlier);
            expect(listRenders(dir, since)).toEqual([`[render] no render in ${dir} from this run`]);
        } finally {
            fs.rmSync(storage, { recursive: true, force: true });
        }
    });

    it('prints its steps on --dry-run and its usage on a bad argument', () => {
        const script = path.join(root, 'scripts/render-artboards.mjs');
        const dry = execFileSync(process.execPath, [script, '--dry-run', '--looks', 'classic'], { cwd: root, encoding: 'utf8' });
        expect(dry).toContain('NUIGET_ARTBOARD_LOOKS="classic" npx extest run-tests out/test/ui/v2/capture/zz-artboards.ui.test.js');
        let failure: { status?: number; stderr?: string } = {};
        try {
            execFileSync(process.execPath, [script, '--bogus'], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
        } catch (error) {
            failure = error as { status?: number; stderr?: string };
        }
        expect(failure.status).toBe(2);
        expect(failure.stderr).toContain('render-artboards: unknown argument --bogus');
    });
});

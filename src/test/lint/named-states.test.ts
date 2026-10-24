import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { captureFile, DIFF_TOLERANCE_START, expectedFiles, floorCaptures, isReady, laneFiles, laneProblems, LEGACY_STATES, MATRIX_THEMES, matrixCaptures, screenshotProblems, STATES, THEMES } from '../ui/v2/states';

/**
 * UX-P0.8: the one list of named states (`src/test/ui/v2/states.ts`). A pending state names an item that is still
 * open, a ready state has a setup in the capture suite, and every PNG name is unique. The suite itself runs only in
 * the UI job (ExTester); this test holds the list's shape on every push.
 */
const read = (relative: string): string => readFileSync(path.join(process.cwd(), relative), 'utf8').replace(/\r\n/g, '\n');

/** The status of each row of the UX tracker, by item id. */
function trackerStatuses(): Map<string, string> {
    const rows = read('docs/plans/STATUS-ux.md').split('\n').filter(line => /^\| P\d/.test(line));
    return new Map(rows.map(line => {
        const cells = line.split('|').map(cell => cell.trim());
        return [cells[1], cells[4]];
    }));
}

describe('the named states (UX-P0.8)', () => {
    it('names every state once and every capture file once', () => {
        const names = STATES.map(state => state.name);
        expect(new Set(names).size).toBe(names.length);
        const files = expectedFiles();
        expect(new Set(files).size).toBe(files.length);
        for (const state of STATES) {
            expect(state.name, 'a state name is kebab-case').toMatch(/^(main|sidebar)-[a-z0-9-]+$/);
            expect(state.name.startsWith(`${state.surface}-`), `${state.name} is named after its surface`).toBe(true);
            expect(state.captures.length, `${state.name} has a capture`).toBeGreaterThan(0);
            expect(state.setup.length, `${state.name} says how it is reached`).toBeGreaterThan(0);
        }
    });

    it('gives each pending state an item that is a tracker row and not done', () => {
        const statuses = trackerStatuses();
        const pending = STATES.filter(state => !isReady(state)).map(state => [state.name, (state.status as { pending: string }).pending] as const);
        expect(pending.length).toBeGreaterThan(0);
        for (const [name, item] of pending) {
            expect(statuses.has(item), `${name}: ${item} is a row of STATUS-ux.md`).toBe(true);
            expect(statuses.get(item), `${name}: ${item} is still open`).not.toBe('done');
        }
    });

    it('keeps the pending states of the P0.8 ruling on their items', () => {
        const byItem = (item: string): string[] => STATES.filter(state => !isReady(state) && (state.status as { pending: string }).pending === item).map(state => state.name);
        expect(byItem('P2.8b')).toEqual(['main-installed-loading', 'main-installed-revalidating', 'main-installed-empty', 'main-installed-error', 'main-installed-unresolved']);
        expect(byItem('P3.1b')).toEqual(['main-updates-unavailable']);
        expect(byItem('P3.10')).toEqual(['main-browse-unavailable', 'sidebar-updates-unavailable', 'sidebar-browse-unavailable']);
    });

    it('has a setup in the capture suite for every ready state', () => {
        const suite = read('src/test/ui/v2/capture/capture.ui.test.ts');
        for (const state of STATES.filter(isReady)) {
            expect(suite.includes(`'${state.name}': {`), `the capture suite reaches ${state.name}`).toBe(true);
        }
    });

    it('captures the Tier A defaults, the theme subset, the classic pass and the widths of the plan', () => {
        const files = new Set(expectedFiles());
        for (const file of [
            'main-installed-single.dark-modern.1200.png',
            'main-installed-single.light-modern.1200.png',
            'main-installed-single.dark-high-contrast.1200.png',
            'main-installed-single.dark-modern-classic.1200.png',
            'main-installed-single.dark-modern.932.png',
            'main-installed-single.dark-modern-classic.932.png',
            'main-installed-single.dark-modern.800.png',
            'main-installed-single.dark-modern.600.png',
            'main-installed-single.dark-modern.400.png',
            'main-installed-single.dark-modern.220.png',
            'main-installed-details.dark-modern.400.png',
            'sidebar-sections.dark-modern.300.png',
            'sidebar-sections.dark-modern.250.png',
            'sidebar-sections.dark-modern.170.png',
            'sidebar-narrow-200px.dark-modern.200.png',
        ]) {
            expect(files.has(file), file).toBe(true);
        }
        expect(captureFile('main-updates', { theme: 'dark-modern', look: 'classic', width: 1200 })).toBe('main-updates.dark-modern-classic.1200.png');
        expect(expectedFiles('classic').every(file => file.includes('-classic.'))).toBe(true);
    });

    it('fails CI for a missing crop, a crop of a pending state and a missing window PNG of the 2.0 set', () => {
        const crops = expectedFiles();
        const windows = LEGACY_STATES.map(state => `${state}.png`);
        expect(screenshotProblems(crops, windows)).toEqual([]);
        expect(screenshotProblems(crops.slice(1), windows)).toEqual([`no capture ${crops[0]}`]);
        expect(screenshotProblems([...crops, 'main-installed-empty.dark-modern.1200.png'], windows))
            .toEqual(['a capture of the pending state main-installed-empty: main-installed-empty.dark-modern.1200.png']);
        expect(screenshotProblems(crops, windows.filter(file => file !== 'main-updates.png'))).toEqual(['no window PNG of the 2.0 state main-updates']);
        // An empty folder fails for every expected file.
        expect(screenshotProblems([], [])).toHaveLength(crops.length + LEGACY_STATES.length);
    });

    it('runs the capture scripts on the VS Code, storage and extensions directory of test:ui', () => {
        const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
        const flag = (script: string, name: string): string | undefined => new RegExp(`--${name} (\\S+)`).exec(scripts[script])?.[1];
        for (const name of ['code_version', 'storage', 'extensions_dir']) {
            expect(flag('test:ui', name), `test:ui --${name}`).toBeDefined();
            expect(flag('test:ui:capture', name), `test:ui:capture --${name}`).toBe(flag('test:ui', name));
            expect(flag('test:ui:classic', name), `test:ui:classic --${name}`).toBe(flag('test:ui', name));
        }
        expect(scripts['test:ui']).toMatch(/&& npm run test:ui:capture$/);
        expect(scripts['test:ui:classic']).toContain('NUIGET_UI_LOOK=classic');
        expect(scripts['test:ui:classic']).toContain('--code_settings src/test/ui/settings.classic.json');
    });

    it('gives each Tier B shard every ready state at its surface\'s three widths, Modern UI (UX-P0.9)', () => {
        expect(MATRIX_THEMES).toEqual(Object.keys(THEMES));
        for (const theme of MATRIX_THEMES) {
            const files = laneFiles('matrix', theme);
            expect(files, theme).toHaveLength(64);
            expect(new Set(files).size).toBe(64);
            expect(files.every(file => file.includes(`.${theme}.`) && !file.includes('-classic'))).toBe(true);
        }
        const widths = new Set(matrixCaptures('dark-modern').map(({ state, capture }) => `${state.surface}:${capture.width}`));
        expect([...widths].sort()).toEqual(['main:1200', 'main:1600', 'main:800', 'sidebar:200', 'sidebar:300', 'sidebar:400']);
        expect(laneFiles('matrix', 'light-2026').filter(file => file.startsWith('sidebar-narrow-200px.'))).toEqual(['sidebar-narrow-200px.light-2026.200.png']);
    });

    it('gives every state the start tolerance of the pixel diff or 0 once masked (UX-P0.15)', () => {
        expect(DIFF_TOLERANCE_START).toBe(0.5);
        for (const state of STATES) {
            expect([0, DIFF_TOLERANCE_START], state.name).toContain(state.diffTolerance);
        }
    });

    it('captures every Tier A theme and width once on the floor, in the classic look', () => {
        const files = laneFiles('floor');
        // 36 at UX-P0.9, and UX-P0.14's four narrow widths (main-installed-single at 600/400/220, main-installed-details at 400).
        expect(files).toHaveLength(40);
        expect(new Set(files).size).toBe(40);
        expect(files.every(file => file.includes('-classic.'))).toBe(true);
        expect(floorCaptures().every(({ capture }) => capture.look === 'classic')).toBe(true);
        expect(laneFiles('macos')).toEqual(expectedFiles());
    });

    it('fails a lane for a missing, an extra and a pending crop', () => {
        const files = laneFiles('matrix', 'dark-2026');
        expect(laneProblems(files, 'matrix', 'dark-2026')).toEqual([]);
        expect(laneProblems(files.slice(1), 'matrix', 'dark-2026')).toEqual([`no capture ${files[0]}`]);
        expect(laneProblems([...files, 'main-installed-single.dark-modern.1200.png'], 'matrix', 'dark-2026')).toEqual(['an unexpected capture main-installed-single.dark-modern.1200.png']);
        expect(laneProblems([...files, 'main-installed-error.dark-2026.800.png'], 'matrix', 'dark-2026')).toEqual(['a capture of the pending state main-installed-error: main-installed-error.dark-2026.800.png']);
    });

    it('runs the Linux lanes under a window manager and the ui job without one', () => {
        const workflow = read('.github/workflows/ci.yml');
        const between = (from: string, to: string): string => workflow.slice(workflow.indexOf(`\n  ${from}:\n`), workflow.indexOf(`\n  ${to}:\n`));
        for (const [job, next, script] of [['ui-matrix', 'ui-floor', 'test:ui:matrix'], ['ui-floor', 'ui-macos', 'test:ui:floor']] as const) {
            const block = between(job, next);
            expect(block, `${job} installs fluxbox`).toContain('apt-get install -y --no-install-recommends fluxbox');
            expect(block, `${job} runs under fluxbox`).toContain(`bash -c 'fluxbox >/dev/null 2>&1 & sleep 2; npm run ${script}'`);
        }
        // The ui job (its comment block included) and the macOS lane keep their own windows.
        expect(between('ui', 'ui-matrix')).not.toContain('fluxbox');
        expect(between('ui-macos', 'build')).not.toContain('fluxbox');
    });

    it('runs the lane scripts on the storage of test:ui, the floor on 1.90.0 classic', () => {
        const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
        const flag = (script: string, name: string): string | undefined => new RegExp(`--${name} (\\S+)`).exec(scripts[script])?.[1];
        for (const script of ['test:ui:matrix', 'test:ui:floor', 'test:ui:macos']) {
            for (const name of ['storage', 'extensions_dir']) {
                expect(flag(script, name), `${script} --${name}`).toBe(flag('test:ui', name));
            }
            expect(scripts[script], script).toContain('--open_resource src/test/ui/fixtures/dense-workspace/dense.code-workspace');
        }
        expect(flag('test:ui:matrix', 'code_version')).toBe(flag('test:ui', 'code_version'));
        expect(flag('test:ui:macos', 'code_version')).toBe(flag('test:ui', 'code_version'));
        expect(flag('test:ui:matrix', 'code_settings')).toBe(flag('test:ui', 'code_settings'));
        // The floor is the engines floor (D54, D55): it never moves with the capture pin.
        expect(flag('test:ui:floor', 'code_version')).toBe('1.90.0');
        expect(flag('test:ui:floor', 'code_settings')).toBe('src/test/ui/settings.classic.json');
        expect(scripts['test:ui:macos']).toMatch(/&& npm run test:ui:classic$/);

        // Each lane job caches the VS Code its script runs.
        const workflow = read('.github/workflows/ci.yml');
        const jobBlock = (job: string): string => {
            const start = workflow.indexOf(`\n  ${job}:\n`);
            const rest = workflow.slice(start + 1);
            const end = rest.search(/\n {2}[a-z][\w-]*:\n/);
            return end === -1 ? rest : rest.slice(0, end);
        };
        for (const [job, script] of [['ui-matrix', 'test:ui:matrix'], ['ui-floor', 'test:ui:floor'], ['ui-macos', 'test:ui:macos']] as const) {
            expect(jobBlock(job), `${job} caches its VS Code`).toContain(`key: extester-vscode-${flag(script, 'code_version')}-`);
            expect(jobBlock(job), `${job} runs ${script}`).toContain(`npm run ${script}`);
        }
    });

    it('lists the themes as the theme pass does', () => {
        const suite = read('src/test/ui/v2/theme.ui.test.ts');
        const listed = [...suite.matchAll(/\{ labels: \[([^\]]+)\], bodyClass: '([a-z-]+)' \}/g)]
            .map(match => ({ labels: match[1].split(',').map(label => label.trim().replace(/^'|'$/g, '')), bodyClass: match[2] }));
        expect(listed).toEqual(MATRIX_THEMES.map(theme => ({ labels: [...THEMES[theme].labels], bodyClass: THEMES[theme].bodyClass })));
    });

    it('shards ci.yml\'s ui-matrix by the themes of states.ts', () => {
        const workflow = read('.github/workflows/ci.yml');
        const job = workflow.slice(workflow.indexOf('\n  ui-matrix:\n'));
        const themes = /\n {8}theme: \[ ([^\]]+) \]/.exec(job)?.[1].split(',').map(theme => theme.trim());
        expect(themes).toEqual([...MATRIX_THEMES]);
    });

    it('keeps the 15 states of the 2.0 set that the v2 suites screenshot', () => {
        expect(LEGACY_STATES).toHaveLength(15);
        const suites = ['main-all-projects', 'main-details', 'main-installed', 'main-search', 'main-transitive', 'main-updates', 'sidebar', 'sidebar-parity', 'theme']
            .map(name => read(`src/test/ui/v2/${name}.ui.test.ts`)).join('\n');
        const shot = new Set([...suites.matchAll(/screenshot\('([a-z0-9-]+)'\)/g)].map(match => match[1]));
        // The light and high-contrast variants come from the theme pass, which builds the name.
        for (const state of LEGACY_STATES.filter(name => !/-(light|hc)$/.test(name))) {
            expect(shot.has(state), `a v2 suite screenshots ${state}`).toBe(true);
        }
    });
});

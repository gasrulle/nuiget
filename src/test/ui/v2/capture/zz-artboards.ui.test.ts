import { type ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { By, EditorView, InputBox, VSBrowser, Workbench } from 'vscode-extension-tester';
import { artboardFile, artboardFilter, artboardJobs, ARTBOARDS, type ColourSample, isSpecRender, pixelAt, SAMPLE_COLOUR, sampleVerdict, SATURATION_MIN } from '../artboards';
import { driverOf, poll } from '../sidebarWebview';

/**
 * The artboard export (UX-P0.27a, generalized by UX-P0.27): renders each artboard of `ARTBOARDS` (`../artboards.ts`) in VS
 * Code's integrated browser by the route of `docs/design/export-method.md` and writes, next to the crops,
 * `artboards/<state>.<theme>.<width>.png` per width, theme and look (`<theme>-classic` for the classic look; artboard A:
 * `main-installed-single.dark-modern.932.png` and `main-installed-single.dark-modern-classic.932.png`) and
 * `artboards/<state>.spec.json` for the entry's first theme and width (the panel's elements by test id: rect and content
 * inset relative to the panel, padding, gap, and the artboard's `--nuiget-*` names their inline style uses). Each render's
 * colour sample is read back from its PNG; a mismatch fails the test once every PNG is written. The files are copied into
 * `docs/design/artboards/` from the `ui` job's artifact. It runs in the `ui` lane's Modern UI pass only, after the capture
 * suite (the file name sorts last), or alone through `scripts/render-artboards.mjs`, and leaves no editor open.
 */

const LANE = process.env.NUIGET_UI_LANE ?? 'ui';
const LOOK = process.env.NUIGET_UI_LOOK === 'classic' ? 'classic' : 'modern';
/** The viewport's height; its width is the render's (artboard A: 1280, which holds its 1252 px at DPR 1). */
const VIEWPORT_HEIGHT = 900;

type Cdp = {
    sendDevToolsCommand(cmd: string, params?: object): Promise<void>;
    sendAndGetDevToolsCommand(cmd: string, params?: object): Promise<{ data: string }>;
};

/** The panel's rect in the page (its test id is `arguments[0]`) and every element under it with a test id. */
const SPEC = `
const panel = document.querySelector('[data-testid="' + arguments[0] + '"]');
if (!panel) return JSON.stringify(null);
const base = panel.getBoundingClientRect();
const round = n => Math.round(n * 10) / 10;
const elements = {};
for (const el of panel.querySelectorAll('[data-testid]')) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    let key = el.dataset.testid;
    for (let n = 2; key in elements; n++) key = el.dataset.testid + '#' + n;
    elements[key] = {
        rect: { x: round(r.left - base.left), y: round(r.top - base.top), w: round(r.width), h: round(r.height) },
        inset: round(r.left - base.left + (parseFloat(s.borderLeftWidth) || 0) + (parseFloat(s.paddingLeft) || 0)),
        padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].join(' '),
        gap: [s.rowGap, s.columnGap].join(' '),
        tokens: [...new Set((el.getAttribute('style') || '').match(/--nuiget-[a-z0-9-]+/g) || [])],
    };
}
return JSON.stringify({ rect: { x: base.left, y: base.top, w: base.width, h: base.height }, elements });
`;

interface Spec {
    rect: { x: number; y: number; w: number; h: number };
    elements: Record<string, unknown>;
}

/** Starts `scripts/serve-artboards.mjs` on `docs/design`; resolves with the process and its URL. */
async function startServer(): Promise<{ child: ChildProcess; url: string }> {
    const child = spawn(process.execPath, [path.resolve('scripts/serve-artboards.mjs'), path.resolve('docs/design')], { stdio: ['ignore', 'pipe', 'inherit'] });
    const url = await new Promise<string>((resolve, reject) => {
        let out = '';
        child.stdout?.on('data', chunk => {
            out += String(chunk);
            const match = /serve-artboards: (\S+)/.exec(out);
            if (match) {
                resolve(match[1]);
            }
        });
        child.once('exit', code => reject(new Error(`serve-artboards exited with ${code}`)));
        setTimeout(() => reject(new Error('serve-artboards did not start in 10 s')), 10_000);
    });
    return { child, url };
}

/** Runs the palette entry whose label is exactly the one offered for `text` (no fuzzy Enter). */
async function openIntegratedBrowser(): Promise<void> {
    await poll(async () => {
        await driverOf().switchTo().defaultContent();
        const input = await new Workbench().openCommandPrompt();
        await input.setText('>Open Integrated Browser');
        for (const pick of await input.getQuickPicks()) {
            if ((await pick.getLabel()).endsWith('Open Integrated Browser')) {
                await pick.select();
                return true;
            }
        }
        await input.cancel();
        return undefined;
    }, 'the palette entry "Open Integrated Browser"', 60_000);
}

if (LANE === 'ui' && LOOK === 'modern') {
    describe('artboard export (UX-P0.27a)', () => {
        let server: ChildProcess | undefined;
        let main: string | undefined;

        after(async function () {
            // Closing the browser editor and the emulation take longer than mocha's default 2 s.
            this.timeout(60_000);
            const driver = driverOf();
            await (driver as unknown as Cdp).sendDevToolsCommand('Emulation.clearDeviceMetricsOverride', {}).catch(() => undefined);
            if (main !== undefined) {
                await driver.switchTo().window(main).catch(() => undefined);
            }
            await driver.switchTo().defaultContent();
            await new EditorView().closeAllEditors().catch(() => undefined);
            server?.kill();
        });

        it('renders the artboards of the manifest and writes their specs', async function () {
            this.timeout(300_000);
            const jobs = artboardJobs(ARTBOARDS, artboardFilter(process.env));
            if (jobs.length === 0) {
                throw new Error('no artboard render selected (NUIGET_ARTBOARD_STATES, _THEMES, _LOOKS)');
            }
            const out = path.join(path.dirname(VSBrowser.instance.getScreenshotsDir()), 'artboards');
            fs.mkdirSync(out, { recursive: true });
            const started = await startServer();
            server = started.child;
            const target = started.url + jobs[0].entry.source;
            const driver = driverOf();
            await driver.switchTo().defaultContent();
            const workbench = await driver.getWindowHandle();
            main = workbench;

            await openIntegratedBrowser();
            const urlInput = await poll(async () => {
                await driver.switchTo().defaultContent();
                try {
                    return await InputBox.create(5_000);
                } catch {
                    const display = await driver.findElements(By.css('.browser-url-display, .browser-url-container'));
                    if (display.length > 0) {
                        await display[0].click();
                    }
                    return undefined;
                }
            }, 'the URL picker of the integrated browser', 60_000);
            await urlInput.setText(target);
            await urlInput.confirm();

            // The page is a window handle of its own (an Electron WebContentsView), never inside the workbench.
            await poll(async () => {
                for (const handle of await driver.getAllWindowHandles()) {
                    if (handle === workbench) {
                        continue;
                    }
                    // A handle that closed or runs no script is skipped, as the proof does.
                    try {
                        await driver.switchTo().window(handle);
                        if ((await driver.executeScript<string>('return location.href;')).startsWith(target)) {
                            return true;
                        }
                    } catch {
                        continue;
                    }
                }
                await driver.switchTo().window(workbench);
                return undefined;
            }, 'a window handle showing the artboard', 60_000);

            const cdp = driver as unknown as Cdp;
            /** Each entry's spec, by look, from its first width and theme. */
            const specs = new Map<string, Record<string, Spec>>();
            const failures: string[] = [];
            let viewport: number | undefined;
            for (const job of jobs) {
                const { entry, width, theme, look } = job;
                if (width.viewport !== viewport) {
                    await cdp.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', { width: width.viewport, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: false });
                    viewport = width.viewport;
                }
                const url = `${started.url}${entry.source}?theme=${theme}&look=${look}`;
                // The marker goes with the old document: two jobs on one URL (two widths) wait for the new one too.
                await driver.executeScript('window.__nuigetLeaving = true; location.assign(arguments[0]);', url);
                await poll(async () => {
                    const state = await driver.executeScript<string>(
                        'return [location.href, document.readyState, document.documentElement.dataset.look, document.fonts.status, window.innerWidth, window.devicePixelRatio, window.__nuigetLeaving === true].join("|");');
                    return state === `${url}|complete|${look}|loaded|${width.viewport}|1|false` ? true : undefined;
                }, `${entry.source} in ${theme}, the ${look} look`, 30_000);
                const spec = JSON.parse(await driver.executeScript<string>(SPEC, entry.panel)) as Spec | null;
                if (spec === null) {
                    throw new Error(`no [data-testid="${entry.panel}"] in ${url}`);
                }
                const { x, y, w, h } = spec.rect;
                const file = artboardFile(job);
                if (Math.abs(w - width.panel) > 0.5) {
                    throw new Error(`${file}: the panel of ${entry.source} is ${w} px wide at viewport ${width.viewport}, not ${width.panel}`);
                }
                const sample = await driver.executeScript<ColourSample>(SAMPLE_COLOUR, entry.panel, entry.sample, SATURATION_MIN);
                const clip = await cdp.sendAndGetDevToolsCommand('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 }, captureBeyondViewport: true });
                const png = path.join(out, file);
                fs.writeFileSync(png, clip.data, 'base64');
                // The PNG first: a mismatch leaves its evidence.
                const verdict = sampleVerdict(sample, 'error' in sample ? undefined : pixelAt(png, sample.x - x, sample.y - y));
                console.warn(`[artboard] ${file}: ${entry.source} panel ${x},${y} ${w}x${h} (dpr 1, viewport ${width.viewport}x${VIEWPORT_HEIGHT}); ${verdict.text}`);
                if (verdict.failure !== undefined) {
                    failures.push(`${file}: ${verdict.failure}`);
                }
                if (isSpecRender(job)) {
                    specs.set(entry.state, { ...specs.get(entry.state), [look]: spec });
                }
            }
            const chromium = /Chrome\/(\d+)/.exec(await driver.executeScript<string>('return navigator.userAgent;'))?.[1] ?? 'unknown';
            for (const entry of ARTBOARDS) {
                const looks = specs.get(entry.state);
                // A run narrowed to some looks leaves the entry's spec as it was: helper 8 reads every look from it.
                if (looks === undefined || entry.looks.some(look => !(look in looks))) {
                    continue;
                }
                fs.writeFileSync(path.join(out, `${entry.state}.spec.json`), JSON.stringify({
                    state: entry.state, theme: entry.themes[0], width: entry.widths[0].panel, source: `docs/design/${entry.source}`, vscode: VSBrowser.instance.version, chromium,
                    platform: process.platform, run: process.env.GITHUB_RUN_ID ?? 'local',
                    looks: Object.fromEntries(Object.entries(looks).map(([look, spec]) => [look, spec.elements])),
                }, null, 2) + '\n');
                const counts = [...new Set(Object.values(looks).map(spec => Object.keys(spec.elements).length))];
                console.warn(`[artboard] ${entry.state}.spec.json: ${counts.join('/')} elements per look`);
            }
            if (failures.length > 0) {
                throw new Error(failures.join('; '));
            }
        });
    });
}

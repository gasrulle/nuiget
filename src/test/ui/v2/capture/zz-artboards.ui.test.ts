import { type ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { By, EditorView, InputBox, VSBrowser, Workbench } from 'vscode-extension-tester';
import { driverOf, poll } from '../sidebarWebview';

/**
 * The artboard export (UX-P0.27a): renders artboard A in VS Code's integrated browser by the route of
 * `docs/design/export-method.md` and writes, next to the crops, `artboards/main-installed-single.dark-modern.932.png`
 * (Modern UI), `artboards/main-installed-single.dark-modern-classic.932.png` (classic) and
 * `artboards/main-installed-single.spec.json` (the main panel's elements by test id: rect and content inset relative to
 * the panel, padding, gap, and the artboard's `--nuiget-*` names their inline style uses). The files are copied into `docs/design/artboards/` from the `ui` job's artifact. It runs in the
 * `ui` lane's Modern UI pass only, after the capture suite (the file name sorts last), and leaves no editor open.
 */

const LANE = process.env.NUIGET_UI_LANE ?? 'ui';
const LOOK = process.env.NUIGET_UI_LOOK === 'classic' ? 'classic' : 'modern';
const ARTBOARD = 'artboards/round1/A-Extensions.dc.html';
const STATE = 'main-installed-single';
const THEME = 'dark-modern';
/** The artboard is 1252 px wide (sidebar 300, gap 20, main panel 932); the viewport holds it at DPR 1. */
const VIEWPORT = { width: 1280, height: 900 };
const PANEL = 'nuiget-app';

type Cdp = {
    sendDevToolsCommand(cmd: string, params?: object): Promise<void>;
    sendAndGetDevToolsCommand(cmd: string, params?: object): Promise<{ data: string }>;
};

/** The main panel's rect in the page and every element under it with a test id. */
const SPEC = `
const panel = document.querySelector('[data-testid="${PANEL}"]');
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

        it('renders artboard A in both looks at 932 px and writes its spec', async function () {
            this.timeout(300_000);
            const out = path.join(path.dirname(VSBrowser.instance.getScreenshotsDir()), 'artboards');
            fs.mkdirSync(out, { recursive: true });
            const started = await startServer();
            server = started.child;
            const target = started.url + ARTBOARD;
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
            await cdp.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });
            const specs: Record<string, Spec> = {};
            for (const look of ['modern', 'classic'] as const) {
                const url = `${target}?theme=${THEME}&look=${look}`;
                await driver.executeScript('location.assign(arguments[0]);', url);
                await poll(async () => {
                    const state = await driver.executeScript<string>(
                        'return [location.href, document.readyState, document.documentElement.dataset.look, document.fonts.status, window.innerWidth, window.devicePixelRatio].join("|");');
                    return state === `${url}|complete|${look}|loaded|${VIEWPORT.width}|1` ? true : undefined;
                }, `the artboard in the ${look} look`, 30_000);
                const spec = JSON.parse(await driver.executeScript<string>(SPEC)) as Spec | null;
                if (spec === null) {
                    throw new Error(`no [data-testid="${PANEL}"] in ${url}`);
                }
                const { x, y, w, h } = spec.rect;
                const clip = await cdp.sendAndGetDevToolsCommand('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 }, captureBeyondViewport: true });
                const file = `${STATE}.${THEME}${look === 'classic' ? '-classic' : ''}.${Math.round(w)}.png`;
                fs.writeFileSync(path.join(out, file), clip.data, 'base64');
                console.warn(`[artboard] ${file}: ${ARTBOARD} panel ${x},${y} ${w}x${h} (dpr 1, viewport ${VIEWPORT.width}x${VIEWPORT.height})`);
                specs[look] = spec;
            }
            const chromium = /Chrome\/(\d+)/.exec(await driver.executeScript<string>('return navigator.userAgent;'))?.[1] ?? 'unknown';
            fs.writeFileSync(path.join(out, `${STATE}.spec.json`), JSON.stringify({
                state: STATE, theme: THEME, width: 932, source: `docs/design/${ARTBOARD}`, vscode: VSBrowser.instance.version, chromium,
                platform: process.platform, run: process.env.GITHUB_RUN_ID ?? 'local',
                looks: Object.fromEntries(Object.entries(specs).map(([look, spec]) => [look, spec.elements])),
            }, null, 2) + '\n');
            console.warn(`[artboard] ${STATE}.spec.json: ${Object.keys(specs.modern.elements).length} elements per look`);
        });
    });
}

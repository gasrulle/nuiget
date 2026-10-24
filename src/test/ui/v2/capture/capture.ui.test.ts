import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { By, EditorView, Key, VSBrowser } from 'vscode-extension-tester';
import { selectTheme, setPanelWidth, setSidebarWidth, webviewRect, windowSize } from '../layout';
import { type ChromeReference, COLLECT_LAYOUT, formatLine, type Layout, measureLines, RAMP, TOLERANCES, type WorkbenchHeights } from '../measure';
import { chooseProjectCommitted, enterMainWebview, openMainPanel, optionFor, untilProjects } from '../mainWebview';
import { driverOf, enterSidebarWebview, findByTestId, leaveWebview, openSidebarView, poll, waitForTestIdGone, waitForText } from '../sidebarWebview';
import { measureWorkbench } from '../workbench';
import { type Capture, captureFile, floorCaptures, isReady, type Lane, type Look, matrixCaptures, MATRIX_THEMES, type NamedState, PANEL_WIDTH, SIDEBAR_WIDTH, STATES, type Theme, THEMES } from '../states';

/**
 * The capture suite of the named states (UX-P0.8), on the dense workspace (`npm run test:ui:capture`, and the classic
 * pass `npm run test:ui:classic` with `NUIGET_UI_LOOK=classic`). For each `ready` state of `states.ts` and each of its
 * captures in this run's look, it sets the theme and the surface width, reaches the state, waits for the state's
 * readiness predicate and writes the window PNG (ExTester's timestamp folder) and the webview crop
 * `<state>.<theme>.<width>.png` (the screenshots folder's root). A predicate that does not hold fails the test as
 * `not reachable` and writes no PNG under that name. Nothing is installed, removed, restored or confirmed: the
 * workspace is static (plan §2.6), and dialogs are cancelled.
 */

const LOOK: Look = process.env.NUIGET_UI_LOOK === 'classic' ? 'classic' : 'modern';
/** Ctrl, or Cmd on macOS: select all in the search box, and a bulk toggle with a click. */
const MODIFIER = process.platform === 'darwin' ? Key.COMMAND : Key.CONTROL;
const ALL_PROJECTS = '__all_projects__';

/** The lane (`NUIGET_UI_LANE`, UX-P0.9): unset is the per-push `ui` job; `NUIGET_UI_THEME` names a matrix shard. */
const LANE: Lane = (['matrix', 'floor', 'macos'] as const).find(lane => lane === process.env.NUIGET_UI_LANE) ?? 'ui';
const SHARD_THEME = MATRIX_THEMES.find(theme => theme === process.env.NUIGET_UI_THEME) ?? 'dark-modern';

/** Throws `not reachable` with what the readiness predicate waited for. */
class NotReachable extends Error {}
const notReachable = (what: string): never => {
    throw new NotReachable(what);
};

// ---- the main panel ------------------------------------------------------------------------------------------------

/** A new main panel: close the editor and open it again, so no current row, filter, tab or dialog stays from before. */
async function freshMainPanel(): Promise<void> {
    await leaveWebview();
    const editors = new EditorView();
    if ((await editors.getOpenEditorTitles()).includes('nUIget')) {
        await editors.closeEditor('nUIget');
    }
    await openMainPanel();
    await enterMainWebview();
}

async function chooseFixtureProject(file: string): Promise<void> {
    const value = file === ALL_PROJECTS
        ? await untilProjects(values => (values.includes(ALL_PROJECTS) ? ALL_PROJECTS : undefined), 'the All Projects option')
        : await optionFor(file);
    await chooseProjectCommitted(value, 60_000);
}

const script = <T>(source: string, ...args: unknown[]): Promise<T> => driverOf().executeScript<T>(source, ...args);
const until = async (predicate: string, what: string, timeoutMs = 120_000): Promise<void> => {
    await poll(async () => ((await script<boolean>(`return (${predicate});`)) ? true : undefined), what, timeoutMs);
};

const optionOf = async (rowTestId: string, timeoutMs = 120_000) => (await findByTestId(rowTestId, timeoutMs)).findElement(By.css('[role="option"]'));

/** Gateway's Installed list with its rows and their lite metadata (the authors of Serilog). */
async function gatewayInstalled(): Promise<void> {
    await chooseFixtureProject('Gateway.csproj');
    await (await findByTestId('installed-tab', 30_000)).click();
    await findByTestId('installed-list', 120_000);
    await findByTestId('package-row-fluentvalidation', 120_000);
    await poll(async () => (((await (await findByTestId('package-row-serilog')).getAttribute('textContent')) ?? '').includes('Serilog Contributors') ? true : undefined), 'the authors of the Serilog row', 60_000);
}

async function typeInSearch(text: string): Promise<void> {
    const search = await findByTestId('search-input', 30_000);
    await search.click();
    await search.sendKeys(Key.chord(MODIFIER, 'a'), Key.BACK_SPACE, text);
}

async function currentDetails(rowTestId: string): Promise<void> {
    await (await optionOf(rowTestId)).click();
    const id = rowTestId.replace(/^package-row-/, '');
    await poll(async () => (((await (await findByTestId('package-details-panel', 30_000)).getAttribute('textContent')) ?? '').toLowerCase().includes(id) ? true : undefined), `${id} in the details panel`, 30_000);
    await findByTestId('version-selector', 30_000);
    await waitForText('package-details-panel', 'Dependencies', 60_000);
}

async function expandTransitive(): Promise<void> {
    const header = await findByTestId('section-header-transitive', 60_000);
    await header.click();
    await poll(async () => ((await header.getAttribute('aria-expanded')) === 'true' ? true : undefined), 'the transitive section open', 10_000);
    const listed = await poll(async () => {
        const section = await findByTestId('transitive-section');
        if ((await section.findElements(By.css('[data-testid="transitive-restore-banner"]'))).length > 0) {
            return 'banner';
        }
        return (await section.findElements(By.css('[role="option"]'))).length > 0 ? 'rows' : undefined;
    }, 'the transitive rows', 120_000);
    if (listed === 'banner') {
        // The dense workspace is restored by the UI job; a restore from the suite would write its obj folders.
        notReachable('the transitive section offers Restore: the dense workspace was not restored');
    }
}

/** Ctrl/Cmd+click toggles a row into the bulk selection without making it the current row. */
async function toggleIntoSelection(rowTestId: string): Promise<void> {
    const option = await optionOf(rowTestId);
    await driverOf().actions().keyDown(MODIFIER).click(option).keyUp(MODIFIER).perform();
    await poll(async () => ((await option.getAttribute('aria-selected')) === 'true' ? true : undefined), `${rowTestId} selected`, 10_000);
}

// ---- the side bar --------------------------------------------------------------------------------------------------

async function sidebarSections(): Promise<void> {
    // The side bar follows the session: Gateway is chosen in the main panel.
    await freshMainPanel();
    await chooseFixtureProject('Gateway.csproj');
    await leaveWebview();
    await openSidebarView();
    await enterSidebarWebview();
    await findByTestId('sidebar-installed-list', 120_000);
    await findByTestId('package-row-serilog', 120_000);
    await poll(async () => ((await driverOf().findElements(By.css('[data-testid="sidebar-updates-list"] [role="option"]'))).length > 0 ? true : undefined), 'an update row in the sidebar', 120_000);
}

// ---- the states ------------------------------------------------------------------------------------------------------

interface Reach {
    /** Brings the surface to the state and waits for its readiness predicate. */
    reach: () => Promise<void>;
    /** Leaves the state after the capture (closes a dialog, clears a search); nothing is confirmed. */
    leave?: () => Promise<void>;
}

const cancelDialog = async (): Promise<void> => {
    await (await findByTestId('confirm-dialog-cancel', 10_000)).click();
    await waitForTestIdGone('confirm-dialog', 10_000);
};

const REACH: Record<string, Reach> = {
    'main-installed-single': { reach: gatewayInstalled },
    'main-installed-all': {
        reach: async () => {
            await chooseFixtureProject(ALL_PROJECTS);
            await (await findByTestId('installed-tab', 30_000)).click();
            await until('document.querySelectorAll(\'[role="listbox"][data-testid^="installed-list-"]\').length >= 4', 'four project sections');
            await until('[...document.querySelectorAll(".nuiget-section-header")].some(header => header.textContent.includes("Unsupported") && header.textContent.includes("provisional"))', 'the Unsupported and provisional badges on the Unsupported section');
        },
    },
    'main-installed-unsupported': {
        reach: async () => {
            await chooseFixtureProject('Unsupported.csproj');
            await (await findByTestId('installed-tab', 30_000)).click();
            await findByTestId('package-row-polly', 120_000);
            // The banner primitive's class: the main panel renders this banner without a test id.
            await until('[...document.querySelectorAll(".nuiget-banner--warning")].some(banner => banner.textContent.includes("Unsupported project"))', 'the Unsupported banner');
            await until('document.body.textContent.includes("provisional")', 'the provisional badge');
        },
    },
    'main-installed-cpm': {
        reach: async () => {
            await chooseFixtureProject('Catalog.csproj');
            await (await findByTestId('installed-tab', 30_000)).click();
            await findByTestId('package-row-mapster', 120_000);
        },
    },
    'main-installed-details': {
        reach: async () => {
            await gatewayInstalled();
            await currentDetails('package-row-newtonsoft.json');
        },
    },
    'main-installed-filter': {
        reach: async () => {
            await gatewayInstalled();
            await typeInSearch('@installed Microsoft.Extensions');
            await until('(() => { const ids = [...document.querySelectorAll(\'[data-testid="installed-list"] [data-testid^="package-row-"]\')].map(row => row.dataset.testid); return ids.length >= 3 && ids.every(id => id.startsWith("package-row-microsoft.extensions.")); })()', 'only Microsoft.Extensions rows in the list', 30_000);
        },
    },
    'main-installed-filter-nomatch': {
        reach: async () => {
            await gatewayInstalled();
            await typeInSearch('@installed zz-no-such-package');
            await until('document.querySelectorAll(\'[data-testid="installed-list"] [role="option"]\').length === 0 && document.body.textContent.includes("No installed package matches")', 'the no-match text and no option', 30_000);
        },
    },
    'main-installed-hover': {
        reach: async () => {
            await gatewayInstalled();
            const option = await optionOf('package-row-serilog');
            await driverOf().actions().move({ origin: option }).perform();
            await until('document.querySelector(\'[data-testid="package-row-serilog"] [role="option"]\').matches(":hover")', 'the Serilog row under the pointer', 10_000);
        },
    },
    'main-installed-focus': {
        reach: async () => {
            await gatewayInstalled();
            const search = await findByTestId('search-input', 30_000);
            await search.click();
            await poll(async () => {
                if (await script<boolean>('const active = document.activeElement; return active !== null && active.matches(\'[data-testid="installed-list"] [role="option"]\');')) {
                    return true;
                }
                await (await driverOf().switchTo().activeElement()).sendKeys(Key.TAB);
                return undefined;
            }, 'the list reached with Tab', 15_000);
            await (await driverOf().switchTo().activeElement()).sendKeys(Key.ARROW_DOWN);
            await until('document.activeElement.matches(\'[data-testid="installed-list"] [role="option"]:focus-visible\')', 'a focus-visible option', 10_000);
        },
    },
    'main-installed-unfocused': {
        reach: async () => {
            await gatewayInstalled();
            await toggleIntoSelection('package-row-serilog');
            await (await findByTestId('search-input', 30_000)).click();
            await until('!document.querySelector(\'[data-testid="installed-list"]\').contains(document.activeElement) && document.querySelector(\'[data-testid="installed-list"] [role="option"][aria-selected="true"]\') !== null', 'a selected row in an unfocused list', 10_000);
        },
    },
    'main-installed-bulk-dialog': {
        reach: async () => {
            await gatewayInstalled();
            await toggleIntoSelection('package-row-serilog');
            await (await findByTestId('uninstall-selected-button', 10_000)).click();
            await findByTestId('confirm-dialog', 10_000);
        },
        leave: cancelDialog,
    },
    'main-transitive-expanded': {
        reach: async () => {
            await gatewayInstalled();
            await expandTransitive();
        },
    },
    'main-transitive-details': {
        reach: async () => {
            await gatewayInstalled();
            await expandTransitive();
            const [first] = await (await findByTestId('transitive-section')).findElements(By.css('[role="option"]'));
            await first.click();
            await waitForText('transitive-details', 'Required by', 30_000);
        },
    },
    'main-updates': {
        reach: async () => {
            await chooseFixtureProject('Gateway.csproj');
            await (await findByTestId('updates-tab', 30_000)).click();
            await findByTestId('updates-list', 120_000);
            await until('document.querySelectorAll(\'[data-testid="updates-list"] [role="option"]\').length > 0', 'an update row', 120_000);
        },
    },
    'main-browse-results': {
        reach: async () => {
            await chooseFixtureProject('Gateway.csproj');
            await typeInSearch('Newtonsoft.Json');
            await (await findByTestId('search-input')).sendKeys(Key.ENTER);
            await findByTestId('browse-list', 120_000);
            await until('document.querySelector(\'[data-testid="browse-list"] [data-testid="package-row-newtonsoft.json"]\') !== null', 'the Newtonsoft.Json Browse row');
        },
    },
    'main-browse-details': {
        reach: async () => {
            await REACH['main-browse-results'].reach();
            await currentDetails('package-row-newtonsoft.json');
        },
    },
    'main-quicksearch-open': {
        reach: async () => {
            await chooseFixtureProject('Gateway.csproj');
            await typeInSearch('Serilog');
            const suggestions = await findByTestId('search-suggestions', 60_000);
            await poll(async () => ((await suggestions.findElements(By.css('[role="option"]:not([aria-disabled="true"])'))).length > 0 ? true : undefined), 'a suggestion', 60_000);
        },
    },
    'main-quicksearch-versions': {
        reach: async () => {
            await REACH['main-quicksearch-open'].reach();
            await (await findByTestId('search-input')).sendKeys(Key.ARROW_DOWN, Key.ARROW_RIGHT);
            await poll(async () => ((await (await findByTestId('search-suggestions', 10_000)).findElements(By.css('.nuiget-search-option--version'))).length > 0 ? true : undefined), 'a version', 60_000);
        },
    },
    'main-details-readme': {
        reach: async () => {
            await gatewayInstalled();
            await currentDetails('package-row-newtonsoft.json');
            await (await findByTestId('details-tab-readme', 30_000)).click();
            await until('document.querySelector(\'[data-testid="readme-content"], [data-testid="readme-empty"]\') !== null', 'the README or its empty state', 60_000);
        },
    },
    'sidebar-sections': { reach: sidebarSections },
    'sidebar-narrow-200px': { reach: sidebarSections },
    'sidebar-update-all-dialog': {
        reach: async () => {
            await sidebarSections();
            await (await findByTestId('sidebar-update-all-button', 30_000)).click();
            await findByTestId('confirm-dialog', 10_000);
        },
        leave: cancelDialog,
    },
};

// ---- theme, width and the capture ----------------------------------------------------------------------------------

let currentTheme: Theme = 'dark-modern';

async function applyTheme(theme: Theme): Promise<void> {
    if (theme !== currentTheme) {
        await selectTheme(THEMES[theme].labels);
        currentTheme = theme;
    }
    await openMainPanel();
    await enterMainWebview();
    const { labels, bodyClass } = THEMES[theme];
    // The class tells the kind of theme; the name tells Modern from 2026, which share their class.
    await poll(async () => {
        const body = await script<{ classes: string; name: string }>('return { classes: document.body.className, name: document.body.dataset.vscodeThemeName ?? "" };');
        const classes = body.classes.split(/\s+/);
        const kind = classes.includes(bodyClass) && !(bodyClass === 'vscode-high-contrast' && classes.includes('vscode-high-contrast-light'));
        return kind && labels.includes(body.name) ? true : undefined;
    }, `the body class ${bodyClass} and the theme name ${labels[0]}`, 60_000);
}

async function applyWidth(state: NamedState, width: number): Promise<void> {
    // One sash sets the captured surface's width; the other part takes the slack (the P0.8 width ruling).
    await leaveWebview();
    await openSidebarView();
    if (state.surface === 'main') {
        await openMainPanel();
        await setPanelWidth(width);
    } else {
        await setSidebarWidth(width);
    }
}

/**
 * Writes the window PNG and the webview crop of `capture`, exactly `capture.width` CSS px wide from the webview's left
 * edge, and logs the rectangle. The pointer is moved to the window's corner first, outside both webviews, except for
 * the state that is about its hover.
 */
async function shoot(state: NamedState, capture: Capture): Promise<void> {
    const file = captureFile(state.name, capture);
    if (state.name !== 'main-installed-hover') {
        await leaveWebview();
        await driverOf().actions().move({ x: 1, y: 1 }).perform();
    }
    const rect = await webviewRect(state.surface === 'main' ? 'nuiget-app' : 'nuiget-sidebar');
    if (rect.width < capture.width - 0.5) {
        throw new Error(`${file}: the webview is ${rect.width} px wide, narrower than the capture`);
    }
    const dpr = await script<number>('return window.devicePixelRatio;');
    const windowName = file.replace(/\.png$/, '.window');
    await VSBrowser.instance.takeScreenshot(windowName);
    const dir = VSBrowser.instance.getScreenshotsDir();
    execFileSync(process.execPath, [
        path.resolve('scripts/crop-png.mjs'),
        path.join(dir, `${windowName}.png`),
        String(rect.x), String(rect.y), String(capture.width), String(rect.height),
        path.join(path.dirname(dir), file),
        String(dpr),
    ], { stdio: 'pipe' });
    console.warn(`[capture] ${file}: iframe.webview ${rect.x},${rect.y} ${rect.width}x${rect.height} (dpr ${dpr}), cropped ${capture.width}x${rect.height}`);
}

/** The pending lines of this run, printed again at its end. */
const pendingLines: string[] = [];

/** The workbench's own controls, measured once at the start of the run (UX-P0.11): helper 3's parity. */
let workbench: WorkbenchHeights = {};

/** MS-8's reference: the chrome of the first state measured at each surface, theme, width and look (UX-P0.12). */
const chromeReferences = new Map<string, ChromeReference>();

/**
 * Measures the state the driver has just reached (UX-P0.10, `measure.ts`): one `[measure]` line per rule that applies;
 * returns the names of the red `hard` rules.
 */
async function measure(state: NamedState, capture: Capture): Promise<string[]> {
    await (state.surface === 'main' ? enterMainWebview() : enterSidebarWebview());
    const layout = await script<Layout>(COLLECT_LAYOUT, state.surface === 'main' ? 'nuiget-app' : 'nuiget-sidebar', RAMP, TOLERANCES.gapMembership, TOLERANCES.containment);
    const key = `${state.surface} ${capture.theme} ${capture.width} ${capture.look}`;
    const before = chromeReferences.get(key);
    // Measured against the reference as it stood; then an element (or first row) the reference lacked joins it.
    const reference = before === undefined ? undefined : { ...before, chrome: { ...before.chrome } };
    const red: string[] = [];
    const lines = measureLines(state.name, layout, capture.look, workbench, reference, capture.width);
    if (layout.root) {
        const merged = before ?? { state: state.name, chrome: {}, firstRow: undefined };
        for (const [name, rect] of Object.entries(layout.chrome)) {
            merged.chrome[name] ??= rect ?? undefined;
        }
        merged.firstRow ??= layout.firstRow ?? undefined;
        chromeReferences.set(key, merged);
    }
    for (const line of lines) {
        const text = formatLine(line);
        console.warn(text);
        if (line.status === 'hard') {
            if (!line.pass) {
                red.push(`${line.name}: ${line.value}`);
            }
        } else {
            pendingLines.push(text);
        }
    }
    return red;
}

/** This run's captures: the lane's set (Tier A in this run's look for the `ui` job and macOS), theme by theme, the default width of each surface first. */
const laneJobs = LANE === 'matrix'
    ? matrixCaptures(SHARD_THEME)
    : LANE === 'floor'
        ? floorCaptures()
        : STATES.filter(isReady).flatMap(state => state.captures.filter(capture => capture.look === LOOK).map(capture => ({ state, capture })));
const isDefaultWidth = (job: { state: NamedState; capture: Capture }): boolean =>
    job.capture.width === (job.state.surface === 'main' ? PANEL_WIDTH : SIDEBAR_WIDTH);
const jobs = laneJobs
    .map((job, order) => ({ ...job, order }))
    .sort((a, b) => MATRIX_THEMES.indexOf(a.capture.theme) - MATRIX_THEMES.indexOf(b.capture.theme)
        || Number(!isDefaultWidth(a)) - Number(!isDefaultWidth(b))
        || a.order - b.order);

/** The width and height of a PNG, from its IHDR chunk. */
const pngSize = (png: Buffer): string => `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;

describe(`named states (${LANE} lane, ${LOOK} look)`, () => {
    before(async function () {
        // The workbench phases (at most about 3 minutes when every control is absent) and the panel's first list.
        this.timeout(600_000);
        if (LANE === 'ui' && LOOK === 'modern') {
            for (const state of STATES) {
                if (typeof state.status === 'object') {
                    console.warn(`[capture] ${state.name}: not captured (pending ${state.status.pending})`);
                }
            }
        }
        // The provenance of every crop of this run. The suite never sizes the window (ChromeDriver cannot on Electron):
        // the window VS Code opened, and the size of a window screenshot, show here.
        const window = await windowSize();
        const chromium = /Chrome\/(\d+)/.exec(await script<string>('return navigator.userAgent;'))?.[1] ?? 'unknown';
        const dpr = await script<number>('return window.devicePixelRatio;');
        const png = Buffer.from(await driverOf().takeScreenshot(), 'base64');
        console.warn(`[capture] lane ${LANE} vscode ${VSBrowser.instance.version} chromium ${chromium} ${process.platform} dpr ${dpr} look ${LOOK} window ${window.width}x${window.height} png ${pngSize(png)}`);
        // The workbench of this run, in its look (UX-P0.11): written next to the crops as workbench.<look>.json, the
        // file docs/design/workbench/<look>.json is copied from.
        const widgets = await measureWorkbench();
        for (const [name, widget] of Object.entries(widgets)) {
            console.warn(`[workbench] ${name}: ${widget === null ? 'absent' : `${widget.height} (${widget.selector})`}`);
        }
        workbench = Object.fromEntries(Object.entries(widgets).flatMap(([name, widget]) => (widget === null ? [] : [[name, widget.height]])));
        const crops = path.dirname(VSBrowser.instance.getScreenshotsDir());
        fs.mkdirSync(crops, { recursive: true });
        fs.writeFileSync(path.join(crops, `workbench.${LOOK}.json`), JSON.stringify({
            look: LOOK, lane: LANE, vscode: VSBrowser.instance.version, chromium, platform: process.platform, dpr, window: `${window.width}x${window.height}`,
            run: process.env.GITHUB_RUN_ID ?? 'local', widgets,
        }, null, 2) + '\n');
        await openSidebarView();
        await openMainPanel();
        await enterMainWebview();
        // The dense workspace's four projects, discovered across its two folders.
        await optionFor('Unsupported.csproj');
    });

    afterEach(async () => {
        await leaveWebview();
    });

    for (const { state, capture } of jobs) {
        const reach = REACH[state.name];
        it(captureFile(state.name, capture), async function () {
            this.timeout(300_000);
            if (reach === undefined) {
                throw new Error(`no setup for the ready state ${state.name}`);
            }
            await applyTheme(capture.theme);
            await applyWidth(state, capture.width);
            if (state.surface === 'main') {
                await freshMainPanel();
            }
            try {
                await reach.reach();
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                console.warn(`[capture] ${captureFile(state.name, capture)}: not reachable (${reason})`);
                throw new Error(`${state.name} is not reachable: ${reason}`, { cause: error });
            }
            const red = await measure(state, capture);
            await shoot(state, capture);
            if (reach.leave) {
                await (state.surface === 'main' ? enterMainWebview() : enterSidebarWebview());
                await reach.leave();
            }
            // The PNG is written first: a red hard rule leaves its evidence.
            if (red.length > 0) {
                throw new Error(`hard measurement red: ${red.join('; ')}`);
            }
        });
    }

    after(() => {
        // The pending list (plan §2.7): the rules each pending item flips, at the end of the run.
        console.warn(`[measure] pending list: ${pendingLines.length} lines`);
        for (const line of pendingLines) {
            console.warn(line);
        }
    });
});

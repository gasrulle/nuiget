import { execFileSync } from 'child_process';
import * as path from 'path';
import { By, EditorView, Key, VSBrowser } from 'vscode-extension-tester';
import { selectTheme, setPanelWidth, setSidebarWidth, startWindow, webviewRect } from '../layout';
import { chooseProjectCommitted, enterMainWebview, openMainPanel, optionFor, untilProjects } from '../mainWebview';
import { driverOf, enterSidebarWebview, findByTestId, leaveWebview, openSidebarView, poll, waitForTestIdGone, waitForText } from '../sidebarWebview';
import { type Capture, captureFile, isReady, type Look, type NamedState, PANEL_WIDTH, SIDEBAR_WIDTH, STATES, type Theme } from '../states';

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

/** The labels of the Color Theme picker per theme (newest VS Code first) and the body class VS Code gives the webviews. */
const THEMES: Record<Theme, { labels: readonly string[]; bodyClass: string }> = {
    'dark-modern': { labels: ['Dark Modern', 'Default Dark Modern'], bodyClass: 'vscode-dark' },
    'light-modern': { labels: ['Light Modern', 'Default Light Modern'], bodyClass: 'vscode-light' },
    'dark-high-contrast': { labels: ['Dark High Contrast', 'Default High Contrast'], bodyClass: 'vscode-high-contrast' },
};
const THEME_ORDER: readonly Theme[] = ['dark-modern', 'light-modern', 'dark-high-contrast'];

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
    const expected = THEMES[theme].bodyClass;
    await poll(async () => {
        const classes = (await script<string>('return document.body.className;')).split(/\s+/);
        return classes.includes(expected) && !(expected === 'vscode-high-contrast' && classes.includes('vscode-high-contrast-light')) ? true : undefined;
    }, `the body class ${expected}`, 60_000);
}

async function applyWidth(state: NamedState, width: number): Promise<void> {
    await leaveWebview();
    await openSidebarView();
    if (state.surface === 'main') {
        await setSidebarWidth(SIDEBAR_WIDTH);
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

/** This run's captures, theme by theme, the default width of each surface first. */
const jobs = STATES.filter(isReady)
    .flatMap(state => state.captures.filter(capture => capture.look === LOOK).map(capture => ({ state, capture })))
    .map((job, order) => ({ ...job, order }))
    .sort((a, b) => THEME_ORDER.indexOf(a.capture.theme) - THEME_ORDER.indexOf(b.capture.theme)
        || Number(a.capture.width !== (a.state.surface === 'main' ? PANEL_WIDTH : SIDEBAR_WIDTH)) - Number(b.capture.width !== (b.state.surface === 'main' ? PANEL_WIDTH : SIDEBAR_WIDTH))
        || a.order - b.order);

describe(`named states, Tier A (${LOOK} look)`, () => {
    before(async function () {
        this.timeout(300_000);
        if (LOOK === 'modern') {
            for (const state of STATES) {
                if (typeof state.status === 'object') {
                    console.warn(`[capture] ${state.name}: not captured (pending ${state.status.pending})`);
                }
            }
        }
        await startWindow();
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
            await shoot(state, capture);
            if (reach.leave) {
                await (state.surface === 'main' ? enterMainWebview() : enterSidebarWebview());
                await reach.leave();
            }
        });
    }
});

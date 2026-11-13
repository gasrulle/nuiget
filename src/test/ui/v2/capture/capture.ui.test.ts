import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { By, EditorView, Key, VSBrowser } from 'vscode-extension-tester';
import { selectTheme, setPanelWidth, setSidebarWidth, webviewRect, windowSize } from '../layout';
import { type ArtboardSpec, cellList, type ChromeReference, COLLECT_LAYOUT, ROW_LEFTS_REFERENCE, rowLeftsOf, formatLine, type Layout, type LookMeasure, measureLines, outerScrollVerdict, pixelRuleLines, RAMP, type SpecLook, thumbVerdict, TOLERANCES, type WorkbenchHeights } from '../measure';
import { COLLECT_TEXT_LINES, fringeLine, fringeVerdict, hostGuard, type HostReading, type LineVerdict, summarize, type TextLine } from '../fringe';
import { chooseProject, chooseProjectCommitted, enterMainWebview, openMainPanel, optionFor, untilProjects } from '../mainWebview';
import { authoritative, BROWSE_ROW, dependencies, details, icons, INSTALLED_ROW, installedRowOf, type PerfChain, perfComplete, perfLines, perfRecorder, type PerfResult, PROVISIONAL, READ_PERF, REVALIDATING, SETTLED, STOP_PERF } from '../perf';
import { driverOf, enterSidebarWebview, findByTestId, leaveWebview, openSidebarView, poll, typeHeld, waitForTestIdGone, waitForText } from '../sidebarWebview';
import { measureExemplar, measureWorkbench } from '../workbench';
import { artboardOf } from '../artboards';
import { type Capture, captureFile, floorCaptures, isReady, type Lane, type Look, matrixCaptures, MATRIX_THEMES, type NamedState, PANEL_WIDTH, SIDEBAR_WIDTH, STATES, type Theme, THEMES } from '../states';
import { declaredTokens, DUMP_THEME, formatThemeDump, formatTokenDump, type ThemeDump, themeDumpFile, tokenDumpFile } from '../themeDump';
import { CAPTURE_FACTS, type CropRect, type Sidecar, sidecarFile } from '../golden';
import { acceptedSelectors, ARIA_SNAPSHOT, CONTRAST_STATUS, LAYER_SELECTOR, type Resolved, RESOLVE_CONTRAST, resolvedLines, type AriaNode, type AriaSnapshot, ariaLineFor, ariaSnapshot, AXE_EXTRA_RULES, AXE_NODES_PER_RULE, axeLines, DESCRIBE_FOCUS, type FocusFacts, FULL_AXE_STATUS, type FullAxe, type KeyOutcome, type KeyScreen, KEYS_STATUS, KEYS_TREE_TAIL, keysLines, MOTION_STATUS, type MotionFacts, motionLines, RUN_FULL_AXE, RUNNING_ANIMATIONS, treeTail } from '../a11y';

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

const optionOf = async (rowTestId: string, timeoutMs = 120_000) => (await findByTestId(rowTestId, timeoutMs)).findElement(By.css('.nuiget-row-option'));

/**
 * Clicks a tab at the centre of its visible part, the intersection of its rect with its tab list's (and the viewport):
 * the tab's centre where it fits its strip; at the editor's 220 px minimum, where the centre lies under the list/details
 * sash's 24 px pointer target, a point the user can see inside the list pane (V50; UX-P0.14 design-advisor ruling). No
 * visible part, or a click still intercepted, fails as not reachable.
 */
async function clickVisible(testId: string, timeoutMs = 30_000): Promise<void> {
    const element = await findByTestId(testId, timeoutMs);
    // WebDriver's offset is from the element's in-view centre, the centre of its rect within the viewport.
    const offset = await script<{ dx: number; dy: number } | null>(`
        const el = arguments[0];
        const clip = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
        const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
        const own = clip(el.getBoundingClientRect(), viewport);
        const list = el.closest('[role="tablist"]');
        const shown = list ? clip(own, list.getBoundingClientRect()) : own;
        if (shown.right <= shown.left || shown.bottom <= shown.top) return null;
        return { dx: (shown.left + shown.right) / 2 - (own.left + own.right) / 2, dy: (shown.top + shown.bottom) / 2 - (own.top + own.bottom) / 2 };
    `, element);
    if (offset === null) {
        throw new NotReachable(`${testId} has no visible part`);
    }
    await driverOf().actions().move({ origin: element, x: Math.round(offset.dx), y: Math.round(offset.dy) }).click().perform();
}

/** The tree is virtualized and keeps its offset: a state starts at the list's top, where its rows are rendered (UX-P2.1e). */
async function installedListAtTop(): Promise<void> {
    await findByTestId('installed-list', 120_000);
    await script<void>('document.querySelector(\'[data-testid="installed-list"]\').scrollTop = 0;');
}

/** The states whose answers are held while they are read: their list is busy by design, so the audit does not wait for it to settle. */
const HELD_STATES = ['main-installed-loading', 'main-installed-revalidating', 'main-updates-loading', 'main-updates-revalidating', 'main-browse-loading', 'main-browse-revalidating', 'main-quicksearch-loading', 'main-sources-revalidating', 'sidebar-browse-loading', 'sidebar-browse-revalidating', 'sidebar-installed-loading'];
/** The cells whose tabs have no count by design (no list, or none in it): only the busy clause of the settle predicate can clear there. */
const NO_COUNT_STATES = ['main-installed-empty', 'main-installed-error', 'main-updates-empty', 'main-updates-empty-uptodate', 'main-updates-error', 'main-updates-unavailable'];

/**
 * Holds every envelope of one request type (`installed/get`, or `updates/get` since UX-P3.1b; one type per hold, never two)
 * before it is dispatched: the outer frame hands the host's messages to the content frame through its `postMessage`, so a
 * wrapper there sees them first. A `message` listener cannot: on `window` listeners run in registration order whatever their
 * capture flag, so the bus's comes first (run on 2e5c48c; UX-P2.8b architecture follow-up). The stream is held too, or the
 * provisional chunk paints rows. A failure (`failHeld`) or a rewrite (`rewriteHeld`) then applies to every later answer of
 * the type until the state's `leave`.
 */
const HOLD_SOURCE = `
const real = window.postMessage;
const hold = { real, type: arguments[0], held: [], failure: null, failed: 0, rewrite: null, rewritten: 0 };
window.__nuigetHold = hold;
// Each rewrite is an answer the host itself gives for its type, bound to that type (UX-P3.1b, UX-P3.2 architecture rulings):
// an update check with no source answered or no update (Catalog.updates); a search one source could not answer, the rows of
// the others kept (Catalog.ts:447); a quick search answered by two sources, the second unreachable by construction (RFC 2606
// .invalid), so no request the product sends can reach it.
hold.literals = {
    unavailable: { type: 'updates/get', of: result => ({ projectPath: result.projectPath, updates: [], sourcesUnavailable: true }) },
    uptodate: { type: 'updates/get', of: result => ({ projectPath: result.projectPath, updates: [] }) },
    'browse-unavailable': { type: 'search/query', of: result => ({ ...result, sourcesUnavailable: true }) },
    // The host's answer for a config chain with no source (UX-P3.6).
    'sources-empty': { type: 'sources/list', of: result => ({ ...result, sources: [] }) },
    // The one live nuget.org answer split in two, no id twice (design-advisor follow-up, UX-P3.2): the first half stays under
    // nuget.org, the rest under a second source unreachable by construction (architecture-advisor, UX-P3.2).
    'quicksearch-grouped': { type: 'search/autocomplete', of: result => {
        const [first] = result.groups;
        const half = Math.ceil(first.packageIds.length / 2);
        return { ...result, groups: [{ ...first, packageIds: first.packageIds.slice(0, half) },
            { ...first, sourceName: 'Fixture source', sourceUrl: 'https://fixture.invalid/v3/index.json', packageIds: first.packageIds.slice(half) }] };
    } },
};
hold.literal = (mode, result) => hold.literals[mode].of(result);
hold.apply = data => {
    if (hold.failure !== null) {
        hold.failed += 1;
        if (data.kind === 'response') real.call(window, { kind: data.kind, id: data.id, type: data.type, ok: false, error: { code: 'failed', message: hold.failure } }, '*');
        return;
    }
    if (data.kind !== 'response') return;
    hold.rewritten += 1;
    real.call(window, data.ok ? { ...data, result: hold.literal(hold.rewrite, data.result) } : data, '*');
};
window.postMessage = function (data, ...rest) {
    if (!data || data.type !== hold.type || (data.kind !== 'stream' && data.kind !== 'response')) return real.call(window, data, ...rest);
    if (hold.failure === null && hold.rewrite === null) { hold.held.push(data); return undefined; }
    hold.apply(data);
    return undefined;
};`;

type HeldType = 'installed/get' | 'updates/get' | 'search/query' | 'search/autocomplete' | 'sources/list';
/** The rewrite modes, each bound to the one type whose answer it replaces. */
type RewriteMode = 'unavailable' | 'uptodate' | 'browse-unavailable' | 'quicksearch-grouped' | 'sources-empty';

async function holdRequest(type: HeldType): Promise<void> {
    await script<void>(HOLD_SOURCE, type);
}

/** Ends the hold, handing the bus what was held in order, and prints what it held. */
async function releaseHeld(state: string): Promise<void> {
    const counts = await script<{ stream: number; response: number; type: string }>(`
const hold = window.__nuigetHold;
if (!hold) return { stream: 0, response: 0, type: 'none' };
window.postMessage = hold.real;
const counts = { stream: hold.held.filter(d => d.kind === 'stream').length, response: hold.held.filter(d => d.kind === 'response').length, type: hold.type };
for (const d of hold.held) window.postMessage(d, '*');
delete window.__nuigetHold;
return counts;`);
    console.warn(`[hold] ${state}: ${counts.stream + counts.response} held (stream ${counts.stream}, response ${counts.response}, ${counts.type})`);
}

/**
 * From here on every real answer of the held type reaches the bus as a failure, its id and type kept, and its stream not at
 * all: the host invalidates a provisional list once it is evaluated, and the answer to that second request would replace the
 * cell (UX-P2.8b). Printed as `[hold]` and ended by the state's `leave`.
 */
async function failHeld(state: string, message: string): Promise<void> {
    const failed = await script<{ count: number; type: string }>(`
const hold = window.__nuigetHold;
hold.failure = arguments[0];
for (const d of hold.held) hold.apply(d);
hold.held = [];
return { count: hold.failed, type: hold.type };`, message);
    console.warn(`[hold] ${state}: ${failed.count} answers failed (${failed.type})`);
}

/**
 * From here on every real ok answer of `updates/get` reaches the bus with its result replaced by one of the host's own two
 * answers, the envelope spread so its id, type and generation stay, and its stream not at all: no source answered
 * (`unavailable`) or no update (`uptodate`) (UX-P3.1b, architecture-advisor ruling of 2026-11-06). Ended by `endHold`.
 */
async function rewriteHeld(state: string, mode: RewriteMode): Promise<void> {
    const rewritten = await script<{ count: number; type: string }>(`
const hold = window.__nuigetHold;
const bound = hold.literals[arguments[0]];
if (bound === undefined || bound.type !== hold.type) throw new Error('[hold] ' + arguments[1] + ': mode ' + arguments[0] + ' on type ' + hold.type);
hold.rewrite = arguments[0];
for (const d of hold.held) hold.apply(d);
hold.held = [];
return { count: hold.rewritten, type: hold.type };`, mode, state);
    console.warn(`[hold] ${state}: ${rewritten.count} answers rewritten (${rewritten.type})`);
}

/** Ends `failHeld` or `rewriteHeld`: the content frame's own `postMessage` back by assignment. */
async function endHold(): Promise<void> {
    await script<void>('const hold = window.__nuigetHold; if (hold) { window.postMessage = hold.real; delete window.__nuigetHold; }');
}

/**
 * Brings a row to the list's top by the list's own scroll. An element's own scroll-into-view call moves the outer webview
 * frame by 5 px and the crop shows the editor chrome (UX-P2.8b follow-up 2, runs 41296382421 and 41298538865).
 */
async function scrollListTo(listTestId: string, rowTestId: string): Promise<void> {
    const step = `const list = document.querySelector('[data-testid="${listTestId}"]'); const row = list.querySelector('[data-testid="${rowTestId}"]'); if (!row) { list.scrollTop += 300; return false; } list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top; return true;`;
    await poll(async () => ((await script<boolean>(step)) ? true : undefined), `${rowTestId} at the top of ${listTestId}`, 60_000);
}

/**
 * Gateway's Installed list with its rows and their lite metadata. The rendered window shrinks with the pane's width: the
 * wait is on what every width renders, never on a row by position (UX-P2.1e).
 */
async function gatewayInstalled(): Promise<void> {
    await chooseFixtureProject('Gateway.csproj');
    await clickVisible('installed-tab');
    await installedListAtTop();
    await until('document.querySelector(\'[data-testid="installed-list"] .nuiget-row:not([data-row-kind="group"])\') !== null', 'the first package row of the list');
    await poll(async () => ((await script<string>(UNSETTLED)) === '' ? true : undefined), 'the rendered rows\' authors and the tab counts', 120_000);
}

/** Gateway's Updates tab with an update row (the `main-updates` reach). */
async function gatewayUpdates(): Promise<void> {
    await chooseFixtureProject('Gateway.csproj');
    await clickVisible('updates-tab');
    await findByTestId('updates-list', 120_000);
    await until('document.querySelectorAll(\'[data-testid="updates-list"] .nuiget-row-option\').length > 0', 'an update row', 120_000);
}

/** Types a search and submits it with Enter (a Browse search, UX-P3.2). */
async function searchWithEnter(text: string): Promise<void> {
    await typeInSearch(text);
    await (await findByTestId('search-input')).sendKeys(Key.ENTER);
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

/** The rows under the Transitive group row, its last level-1 group (UX-P2.1e). */
const TRANSITIVE_ROWS = '[data-testid="group-row-transitive"] ~ .nuiget-row:not([data-row-kind="group"]) .nuiget-row-option';

async function expandTransitive(): Promise<void> {
    // The tree is virtualized: at its end, with the group still collapsed, the last direct rows sit above the group row,
    // and expanding grows the content below this offset (PF-2's picture).
    await findByTestId('installed-list', 60_000);
    await poll(async () => {
        await script<void>('document.querySelector(\'[data-testid="installed-list"]\').scrollTop = 1e9;');
        return (await driverOf().findElements(By.css('[data-testid="section-header-transitive"]'))).length > 0 ? true : undefined;
    }, 'the Transitive group row at the end of the list', 60_000);
    const header = await findByTestId('section-header-transitive', 60_000);
    await header.click();
    await until('document.querySelector(\'[data-testid="group-row-transitive"] [role="treeitem"]\').getAttribute("aria-expanded") === "true"', 'the Transitive group open', 10_000);
    const listed = await poll(async () => {
        if ((await driverOf().findElements(By.css('[data-testid="transitive-restore-banner"]'))).length > 0) {
            return 'banner';
        }
        return (await driverOf().findElements(By.css(TRANSITIVE_ROWS))).length > 0 ? 'rows' : undefined;
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
    // A box left filled by a state that could not leave (a reach that timed out) would hide a pane: start from an empty box.
    const box = await findByTestId('sidebar-search-input', 60_000);
    if ((await box.getAttribute('value')) !== '') {
        await box.sendKeys(Key.chord(MODIFIER, 'a'), Key.BACK_SPACE);
    }
    await findByTestId('sidebar-installed-list', 120_000);
    await findByTestId('package-row-serilog', 120_000);
    await poll(async () => ((await driverOf().findElements(By.css('[data-testid="sidebar-updates-list"] .nuiget-row-option'))).length > 0 ? true : undefined), 'an update row in the sidebar', 120_000);
    await parkSidebarPointer();
}

/**
 * Rests the pointer in the search row's start padding, inside the side bar but off both lists: a shot's composition never
 * depends on where a sash drag left the cursor (UX-P3.7a, design-advisor ruling DO 5). Moving to the window's corner leaves
 * the webview's last :hover in place.
 */
async function parkSidebarPointer(): Promise<void> {
    const input = await findByTestId('sidebar-search-input', 30_000);
    const { width } = await input.getRect();
    await driverOf().actions().move({ origin: input, x: -Math.ceil(width / 2) - 3, y: 0 }).perform();
    await until('document.querySelector(\'.nuiget-sidebar .nuiget-row-option:hover\') === null', 'no sidebar row under the pointer', 10_000);
}

/**
 * The side bar with Gateway selected and `text` typed and submitted with Enter in its box: a Browse search whose results
 * take the place of the sections (UX-P3.8). The box's own debounced search may have gone first; Enter asks again at once.
 */
async function sidebarSearchWithEnter(text: string, state: string): Promise<void> {
    await sidebarSections();
    const search = await findByTestId('sidebar-search-input', 30_000);
    await typeHeld(search, text, state);
    await search.sendKeys(Key.ENTER);
}

/** Clears the sidebar box after a Browse cell, the hold ended first: the two sections come back (UX-P3.8). */
async function leaveSidebarSearch(): Promise<void> {
    await enterSidebarWebview();
    const search = await findByTestId('sidebar-search-input', 30_000);
    await search.sendKeys(Key.chord(MODIFIER, 'a'), Key.BACK_SPACE);
    await findByTestId('sidebar-installed-list', 60_000);
    await parkSidebarPointer();
}

/** The Serilog search of the sidebar's Browse cells: its installed row and a row that can be installed (UX-P3.8, SB9). */
// A badge with a title reads its label first and the title in a visually hidden span: the label is the first text node.
const SIDEBAR_SERILOG_LISTED = 'document.querySelector(\'[data-testid="sidebar-browse-list"] [data-testid="package-row-serilog"] .nuiget-badge\')?.firstChild?.textContent === "Installed" && document.querySelector(\'[data-testid="sidebar-browse-list"] [data-testid="row-action-install"]\') !== null && document.querySelector(\'[data-testid="sidebar-browse-list"]\')?.getAttribute("aria-busy") !== "true"';

// ---- the states ------------------------------------------------------------------------------------------------------

interface Reach {
    /** Brings the surface to the state and waits for its readiness predicate. */
    reach: () => Promise<void>;
    /**
     * A JS predicate, true when every truth the state's hard rules read holds at once; polled again inside `measure()` before
     * the collector reads (UX-P3.1b, architecture-advisor ruling on run 42263438578). A function, since the module's later
     * constants (`UNSETTLED`) are not initialised when this table is.
     */
    settled?: () => string;
    /** Leaves the state after the capture (closes a dialog, clears a search); nothing is confirmed. */
    leave?: () => Promise<void>;
}

/** The transitive header is not revalidating: its insets are measured on a still header (UX-P0.15 DO 5; UX-P0.fix-2). */
const TRANSITIVE_HEADER_STILL = 'document.querySelector(\'[data-testid="section-header-transitive"]\')?.querySelector(\'.nuiget-spinner\') === null';

/**
 * The Transitive group row settled: present, its count a number, no spinner. "No spinner" alone also holds before the
 * transitive request has started, and a shot then shows the row without its badges (UX-P2.fix-7, dispatch 42092022943).
 */
const TRANSITIVE_GROUP_SETTLED = '(() => { const row = document.querySelector(\'[data-testid="group-row-transitive"]\'); return row !== null && /^\\d+$/.test(row.querySelector(".nuiget-badge--count")?.textContent ?? "") && row.querySelector(".nuiget-spinner") === null; })()';

/** No CSS transition runs in the webview: a measurement reads a still subject (the chevron rotates for 100 ms; UX-P0.fix-4). */
const NO_RUNNING_TRANSITION = 'document.getAnimations().every(animation => !(animation instanceof CSSTransition) || animation.playState !== "running")';

/** Opens the sources dialog from the header's gear and waits for its listed, settled rows (UX-P3.6). */
const openSources = async (): Promise<void> => {
    await clickVisible('source-settings');
    await until('document.querySelector(\'[data-testid="source-row-nuget.org"]\') !== null && document.querySelector(\'[data-testid="source-settings-list"]\')?.getAttribute("aria-busy") !== "true"', 'the sources dialog with its rows', 60_000);
};

/** Closes the sources dialog with Escape on the focused element. */
const closeSources = async (): Promise<void> => {
    await driverOf().switchTo().activeElement().sendKeys(Key.ESCAPE);
    await waitForTestIdGone('source-settings-modal', 10_000);
};

const cancelDialog = async (): Promise<void> => {
    await (await findByTestId('confirm-dialog-cancel', 10_000)).click();
    await waitForTestIdGone('confirm-dialog', 10_000);
};

/** The states whose subject is the pointer: the shot leaves it where it is. */
const HOVER_STATES = ['main-installed-hover', 'main-installed-hover-current', 'main-installed-toolbar-hover', 'main-installed-refresh-hover', 'main-updates-hover', 'main-browse-hover', 'sidebar-hover', 'sidebar-browse-hover'];

const REACH: Record<string, Reach> = {
    'main-installed-single': { reach: gatewayInstalled },
    'main-installed-loading': {
        reach: async () => {
            await gatewayInstalled();
            await holdRequest('installed/get');
            await chooseFixtureProject('Utility.csproj');
            await until('document.querySelector(\'[data-testid="installed-progress"]\') !== null && document.querySelectorAll(".nuiget-skeleton-row").length === 3 && document.querySelector(\'[data-testid="installed-list"] .nuiget-row-option\') === null', 'the bar and the skeleton with no row');
        },
        leave: () => releaseHeld('main-installed-loading'),
    },
    'main-installed-revalidating': {
        reach: async () => {
            await gatewayInstalled();
            await holdRequest('installed/get');
            await clickVisible('refresh-button');
            await until('document.querySelector(\'[data-testid="installed-progress"]\') !== null && document.querySelector(\'[data-testid="installed-list"]\').getAttribute("aria-busy") === "true" && document.querySelector(\'[data-testid="installed-list"] .nuiget-row-option\') !== null && !document.querySelector(\'[data-testid="refresh-button"]\').disabled', 'the rows under the bar, the list busy');
        },
        leave: () => releaseHeld('main-installed-revalidating'),
    },
    'main-installed-empty': {
        reach: async () => {
            await chooseFixtureProject('Empty.csproj');
            await clickVisible('installed-tab');
            await until('document.querySelector(\'[data-testid="installed-empty"]\')?.textContent.includes("No packages installed.") === true', 'the empty state');
            await until(TRANSITIVE_GROUP_SETTLED, 'the Transitive group settled (count, no spinner)', 60_000);
        },
    },
    'main-installed-error': {
        reach: async () => {
            await gatewayInstalled();
            await holdRequest('installed/get');
            await chooseFixtureProject('Utility.csproj');
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'the held answer');
            await failHeld('main-installed-error', 'The project file could not be read.');
            await until('document.querySelector(\'[data-testid="installed-error"] button\') !== null', 'the inline error with Retry');
            // The Updates tab's count for Utility comes from `updates/get`, not held here and answered by the feeds; the shot waited
            // only for the inline error and lost that race on 3 of 32 ui runs (UX-P3.2 fix-forward, runs 42292613923 and 42301793109).
            await until('/[0-9]/.test(document.querySelector(\'[data-testid="updates-tab"]\')?.textContent ?? "")', 'the Updates tab\'s count');
        },
        leave: endHold,
    },
    'main-installed-unresolved': {
        reach: async () => {
            await chooseFixtureProject('Unresolved.csproj');
            await clickVisible('installed-tab');
            await until('document.querySelector(\'[data-testid="package-row-serilog"] .nuiget-row-option\')?.getAttribute("aria-disabled") === "true" && document.querySelector(\'[data-testid="package-row-serilog"] .nuiget-row-version\')?.textContent === "unresolved"', 'the unresolved row');
            await until('document.querySelector(\'[data-testid="package-row-newtonsoft.json"] .nuiget-row-authors\') !== null', 'the other row\'s authors');
        },
    },
    'main-installed-all': {
        reach: async () => {
            await chooseFixtureProject(ALL_PROJECTS);
            await clickVisible('installed-tab');
            // The tree is virtualized: the fan-out settled is the tab's count, shown once every project answered, and the
            // level-1 groups in the tree, the two folders and Transitive (UX-P2.1e).
            await until('/\\d/.test(document.querySelector(\'[data-testid="installed-tab"]\').textContent) && Number(document.querySelector(\'[data-testid^="group-row-"] [role="treeitem"]\')?.getAttribute("aria-setsize")) >= 3', 'the settled fan-out');
            // UX-P0.fix-2 (P0 phase review, design-2): the settled data before the shot, P0.23's predicate (its goldens show it).
            // The window is pinned at the Tools folder so both looks compose the same and the leaf is rendered (UX-P2.8b follow-up).
            await scrollListTo('installed-list', 'group-row-folder-tools');
            // The suite's data budget: the leaf renders when the Unsupported chunk has answered through the fan-out (macOS Intel, dispatch 41310624224).
            // UX-P2.fix-6: the pin is renewed on every probe; rows above the folder that grow as their data arrives move it
            // past the rendered window between a single pin and the leaf (the light-theme cell, floor and macOS lanes).
            // UX-P3.1b: every truth on one probe (the pin, the three markers, nothing unsettled), re-checked before the collector.
            await settleOrReport('main-installed-all', INSTALLED_ALL_SETTLED());
        },
        settled: () => INSTALLED_ALL_SETTLED(),
    },
    'main-installed-unsupported': {
        reach: async () => {
            await chooseFixtureProject('Unsupported.csproj');
            await clickVisible('installed-tab');
            await installedListAtTop();
            await findByTestId('package-row-polly', 120_000);
            await until('document.querySelector(\'[data-testid="installed-unsupported"]\') !== null', 'the Unsupported banner');
            await until('document.querySelector(\'[data-testid="installed-provisional"]\') !== null', 'the provisional badge');
            await until('(() => { const row = document.querySelector(\'[data-testid="group-row-transitive"]\'); return row === null || (/^\\d+$/.test(row.querySelector(".nuiget-badge--count")?.textContent ?? "") && row.querySelector(".nuiget-spinner") === null); })()', 'the transitive section settled (count, no spinner)', 60_000);
        },
    },
    'main-installed-cpm': {
        reach: async () => {
            await chooseFixtureProject('Catalog.csproj');
            await clickVisible('installed-tab');
            await installedListAtTop();
            await findByTestId('package-row-mapster', 120_000);
            await until('(() => { const row = document.querySelector(\'[data-testid="group-row-transitive"]\'); return row === null || (/^\\d+$/.test(row.querySelector(".nuiget-badge--count")?.textContent ?? "") && row.querySelector(".nuiget-spinner") === null); })()', 'the transitive section settled (count, no spinner)', 60_000);
        },
    },
    'main-installed-details': {
        reach: async () => {
            await gatewayInstalled();
            // Newtonsoft.Json sorts past the fold: the list is scrolled to its end, the row current there (UX-P3.fix-1).
            await scrollListTo('installed-list', 'package-row-newtonsoft.json');
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
            await until('document.querySelectorAll(\'[data-testid="installed-list"] .nuiget-row-option\').length === 0 && document.body.textContent.includes("No installed package matches")', 'the no-match text and no option', 30_000);
        },
    },
    'main-installed-hover': {
        reach: async () => {
            await gatewayInstalled();
            // Serilog sorts past the fold: the list is scrolled to it, never by the pointer (UX-P3.fix-1).
            await scrollListTo('installed-list', 'package-row-serilog');
            const option = await optionOf('package-row-serilog');
            await driverOf().actions().move({ origin: option }).perform();
            await until('document.querySelector(\'[data-testid="package-row-serilog"] .nuiget-row-option\').matches(":hover")', 'the Serilog row under the pointer', 10_000);
        },
    },
    'main-installed-hover-current': {
        reach: async () => {
            await gatewayInstalled();
            await scrollListTo('installed-list', 'package-row-newtonsoft.json');
            await currentDetails('package-row-newtonsoft.json');
            const option = await optionOf('package-row-newtonsoft.json');
            await driverOf().actions().move({ origin: option }).perform();
            await until('document.querySelector(\'[data-testid="package-row-newtonsoft.json"] .nuiget-row-option\').matches(":hover")', 'the current row under the pointer', 10_000);
        },
    },
    'main-installed-toolbar-hover': {
        reach: async () => {
            await gatewayInstalled();
            await driverOf().actions().move({ origin: await findByTestId('select-all-button', 30_000) }).perform();
            await until('document.querySelector(\'[data-testid="select-all-button"]\').matches(":hover")', 'the Select all button under the pointer', 10_000);
        },
    },
    'main-installed-refresh-hover': {
        reach: async () => {
            await gatewayInstalled();
            await driverOf().actions().move({ origin: await findByTestId('refresh-button', 30_000) }).perform();
            await until('document.querySelector(\'[data-testid="refresh-button"]\').matches(":hover")', 'the Refresh button under the pointer', 10_000);
        },
    },
    'main-installed-focus': {
        reach: async () => {
            await gatewayInstalled();
            const search = await findByTestId('search-input', 30_000);
            await search.click();
            await poll(async () => {
                if (await script<boolean>('const active = document.activeElement; return active !== null && active.closest(\'[data-testid="installed-list"]\') !== null;')) {
                    return true;
                }
                await (await driverOf().switchTo().activeElement()).sendKeys(Key.TAB);
                return undefined;
            }, 'the list reached with Tab', 15_000);
            // The tab stop is the group row: twice keeps the ring on the second package row.
            await (await driverOf().switchTo().activeElement()).sendKeys(Key.ARROW_DOWN);
            await (await driverOf().switchTo().activeElement()).sendKeys(Key.ARROW_DOWN);
            await until('document.activeElement.matches(\'[data-testid="installed-list"] .nuiget-row-option:focus-visible\')', 'a focus-visible option', 10_000);
        },
    },
    'main-installed-unfocused': {
        reach: async () => {
            await gatewayInstalled();
            await scrollListTo('installed-list', 'package-row-serilog');
            await toggleIntoSelection('package-row-serilog');
            await (await findByTestId('search-input', 30_000)).click();
            await until('!document.querySelector(\'[data-testid="installed-list"]\').contains(document.activeElement) && document.querySelector(\'[data-testid="installed-list"] .nuiget-row-option[aria-selected="true"]\') !== null', 'a selected row in an unfocused list', 10_000);
        },
    },
    'main-installed-bulk-dialog': {
        reach: async () => {
            await gatewayInstalled();
            await scrollListTo('installed-list', 'package-row-serilog');
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
            await until(TRANSITIVE_HEADER_STILL, 'the transitive header without its spinner', 60_000);
        },
    },
    'main-transitive-details': {
        reach: async () => {
            await gatewayInstalled();
            await expandTransitive();
            const [first] = await driverOf().findElements(By.css(TRANSITIVE_ROWS));
            await first.click();
            await waitForText('transitive-details', 'Required by', 30_000);
            await until(TRANSITIVE_HEADER_STILL, 'the transitive header without its spinner', 60_000);
        },
    },
    'main-updates': { reach: gatewayUpdates },
    'main-updates-hover': {
        reach: async () => {
            await gatewayUpdates();
            const [option] = await driverOf().findElements(By.css('[data-testid="updates-list"] .nuiget-row-option'));
            await driverOf().actions().move({ origin: option }).perform();
            await until('document.querySelector(\'[data-testid="updates-list"] .nuiget-row-option:hover\') !== null', 'an update row under the pointer', 10_000);
        },
    },
    'main-updates-all': {
        reach: async () => {
            await chooseFixtureProject(ALL_PROJECTS);
            await clickVisible('updates-tab');
            // The fan-out settled: the tab's count and the level-1 groups, the two workspace folders (UX-P3.1b, as main-installed-all).
            await until('/\\d/.test(document.querySelector(\'[data-testid="updates-tab"]\').textContent) && Number(document.querySelector(\'[data-testid="updates-list"] [data-testid^="group-row-"] [role="treeitem"]\')?.getAttribute("aria-setsize")) >= 2', 'the settled fan-out');
            // The window is pinned at the Tools folder with its markers and nothing unsettled, on one probe (as main-installed-all).
            await settleOrReport('main-updates-all', UPDATES_ALL_SETTLED());
        },
        settled: () => UPDATES_ALL_SETTLED(),
    },
    'main-updates-loading': {
        reach: async () => {
            await gatewayUpdates();
            await holdRequest('updates/get');
            await chooseFixtureProject('Utility.csproj');
            await until('document.querySelector(\'[data-testid="updates-progress"]\') !== null && document.querySelectorAll(".nuiget-skeleton-row").length === 3 && document.querySelector(\'[data-testid="updates-list"] .nuiget-row-option\') === null', 'the bar and the skeleton with no row');
        },
        leave: () => releaseHeld('main-updates-loading'),
    },
    'main-updates-revalidating': {
        reach: async () => {
            await gatewayUpdates();
            await holdRequest('updates/get');
            await clickVisible('refresh-button');
            await until('document.querySelector(\'[data-testid="updates-progress"]\') !== null && document.querySelector(\'[data-testid="updates-list"]\').getAttribute("aria-busy") === "true" && document.querySelector(\'[data-testid="updates-list"] .nuiget-row-option\') !== null && !document.querySelector(\'[data-testid="refresh-button"]\').disabled', 'the rows under the bar, the list busy');
        },
        leave: () => releaseHeld('main-updates-revalidating'),
    },
    'main-updates-empty': {
        reach: async () => {
            await chooseFixtureProject('Empty.csproj');
            // The Updates tab is held for the whole wait: re-clicked whenever it is not selected, the first click included
            // (UX-P3.7c red run 1, architecture-advisor ruling: the project switch can land after a click resolved on the old strip).
            // "No updates available." first means the installed result had not arrived: the wait goes on (MU10).
            await poll(async () => {
                const selected = await script<string | null>('return document.querySelector(\'[data-testid="updates-tab"]\')?.getAttribute("aria-selected") ?? null;');
                if (selected !== 'true') {
                    const evidence = await script<string>('return (document.querySelector(\'[role="tab"][aria-selected="true"]\')?.getAttribute("data-testid") ?? "none") + "; tab badges " + document.querySelectorAll(".nuiget-tab-count").length;');
                    console.warn(`[reach] main-updates-empty: updates-tab re-clicked (selected: ${evidence})`);
                    await clickVisible('updates-tab');
                    return undefined;
                }
                return (await script<boolean>('return document.querySelector(\'[data-testid="updates-empty"]\')?.textContent === "No packages installed.";')) ? true : undefined;
            }, 'the empty state', 120_000);
        },
    },
    'main-updates-error': {
        reach: async () => {
            await gatewayUpdates();
            await holdRequest('updates/get');
            await chooseFixtureProject('Utility.csproj');
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'the held answer');
            await failHeld('main-updates-error', 'The package sources could not be read.');
            await until('document.querySelector(\'[data-testid="updates-error"] button\') !== null', 'the inline error with Retry');
        },
        leave: endHold,
    },
    // UX-P3.6 (design-advisor ruling of 2026-11-07, DO 7): the sources dialog over Gateway; Escape closes it, nothing is
    // removed or added. The cells hold `sources/list` across Refresh (the slice keeps its list on a re-ask).
    'main-sources': {
        reach: async () => {
            await gatewayInstalled();
            await openSources();
        },
        leave: closeSources,
    },
    'main-sources-add': {
        reach: async () => {
            await gatewayInstalled();
            await openSources();
            await clickVisible('add-source-button');
            await until('document.querySelector(\'[data-testid="add-source-panel"] .nuiget-select-input\') !== null && document.activeElement?.getAttribute("data-testid") === "add-source-url"', 'the add form with its config file select and the URL field focused', 30_000);
        },
        leave: closeSources,
    },
    'main-sources-add-invalid': {
        reach: async () => {
            await REACH['main-sources-add'].reach();
            await clickVisible('add-source-credentials');
            await (await findByTestId('add-source-password', 10_000)).sendKeys('%NUGET_TOKEN%');
            await clickVisible('add-source-submit');
            await until('document.querySelector(\'[data-testid="add-source-error"]\') !== null && document.querySelector(\'[data-testid="add-source-url"]\')?.getAttribute("aria-invalid") === "true" && document.querySelector(\'[data-testid="add-source-clear-text"]\') !== null', 'the inline error, aria-invalid and the clear-text sentence', 30_000);
        },
        leave: closeSources,
    },
    'main-sources-remove-dialog': {
        reach: async () => {
            await gatewayInstalled();
            await openSources();
            await clickVisible('source-row-remove-nuget.org');
            await findByTestId('confirm-dialog', 10_000);
        },
        leave: async () => {
            await cancelDialog();
            await closeSources();
        },
    },
    'main-sources-revalidating': {
        reach: async () => {
            await gatewayInstalled();
            await holdRequest('sources/list');
            await clickVisible('refresh-button');
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'the held sources answer');
            await clickVisible('source-settings');
            await until('document.querySelector(\'[data-testid="source-settings-progress"]\') !== null && document.querySelector(\'[data-testid="source-settings-list"]\')?.getAttribute("aria-busy") === "true" && document.querySelector(\'[data-testid="source-row-nuget.org"]\') !== null', 'the rows under the bar, the list busy');
        },
        leave: async () => {
            await closeSources();
            await releaseHeld('main-sources-revalidating');
        },
    },
    'main-sources-empty': {
        reach: async () => {
            await gatewayInstalled();
            await holdRequest('sources/list');
            await clickVisible('refresh-button');
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'the held sources answer');
            await rewriteHeld('main-sources-empty', 'sources-empty');
            await clickVisible('source-settings');
            await until('document.querySelector(\'[data-testid="source-settings-empty"]\')?.textContent === "No package sources."', 'the empty sentence');
        },
        leave: async () => {
            await closeSources();
            await endHold();
        },
    },
    'main-sources-error': {
        reach: async () => {
            await gatewayInstalled();
            await holdRequest('sources/list');
            await clickVisible('refresh-button');
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'the held sources answer');
            await failHeld('main-sources-error', 'The NuGet configuration could not be read.');
            await clickVisible('source-settings');
            await until('document.querySelector(\'[data-testid="source-settings-error"] button\') !== null && document.querySelector(\'[data-testid="source-row-nuget.org"]\') !== null', 'the inline error with Retry above the kept list');
        },
        leave: async () => {
            await closeSources();
            await endHold();
        },
    },
    'main-updates-unavailable': {
        reach: async () => {
            await gatewayUpdates();
            await holdRequest('updates/get');
            await chooseFixtureProject('Utility.csproj');
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'the held answer');
            await rewriteHeld('main-updates-unavailable', 'unavailable');
            await until('document.querySelector(\'[data-testid="updates-unavailable-banner"] button\') !== null && document.querySelector(\'[data-testid="updates-list"]\') === null', 'the unavailable banner with Retry, alone');
        },
        leave: endHold,
    },
    'main-updates-empty-uptodate': {
        reach: async () => {
            await gatewayUpdates();
            await holdRequest('updates/get');
            await chooseFixtureProject('Utility.csproj');
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'the held answer');
            await rewriteHeld('main-updates-empty-uptodate', 'uptodate');
            await until('document.querySelector(\'[data-testid="updates-empty"]\')?.textContent === "No updates available."', 'the up-to-date sentence');
        },
        leave: endHold,
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
    'main-browse-hover': {
        reach: async () => {
            await REACH['main-browse-results'].reach();
            const option = await optionOf('package-row-newtonsoft.json');
            await driverOf().actions().move({ origin: option }).perform();
            await until('document.querySelector(\'[data-testid="browse-list"] .nuiget-row-option:hover\') !== null', 'a Browse row under the pointer', 10_000);
        },
    },
    'main-browse-empty': {
        reach: async () => {
            await chooseFixtureProject('Gateway.csproj');
            await typeInSearch('zz-no-such-package-nuiget');
            await (await findByTestId('search-input')).sendKeys(Key.ENTER);
            await until('document.querySelector(\'[data-testid="browse-empty"]\')?.textContent === \'No results for "zz-no-such-package-nuiget".\'', 'the Browse empty state', 120_000);
        },
    },
    'main-browse-loading': {
        reach: async () => {
            await chooseFixtureProject('Gateway.csproj');
            await holdRequest('search/query');
            await searchWithEnter('Newtonsoft.Json');
            // The bar stands because the answer is held, not because nuget.org is slow (VERIFY: `[hold] … N held`, N ≥ 1).
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'the held answer');
            await until('document.querySelector(\'[data-testid="browse-progress"]\') !== null && document.querySelector(\'[data-testid="browse-list"]\') === null && document.querySelectorAll(".nuiget-skeleton-row").length === 0', 'the bar alone');
        },
        leave: () => releaseHeld('main-browse-loading'),
    },
    'main-browse-revalidating': {
        reach: async () => {
            await REACH['main-browse-results'].reach();
            await holdRequest('search/query');
            await (await findByTestId('search-input')).sendKeys(Key.ENTER);
            await until('document.querySelector(\'[data-testid="browse-progress"]\') !== null && document.querySelector(\'[data-testid="browse-list"]\')?.getAttribute("aria-busy") === "true" && document.querySelector(\'[data-testid="browse-list"] .nuiget-row-option\') !== null', 'the rows under the bar, the list busy');
        },
        leave: () => releaseHeld('main-browse-revalidating'),
    },
    'main-browse-error': {
        reach: async () => {
            await chooseFixtureProject('Gateway.csproj');
            await holdRequest('search/query');
            await searchWithEnter('Newtonsoft.Json');
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'the held answer');
            await failHeld('main-browse-error', 'The package source could not be read.');
            await until('document.querySelector(\'[data-testid="browse-error"] button\') !== null', 'the inline error with Retry');
        },
        leave: endHold,
    },
    'main-browse-unavailable': {
        reach: async () => {
            await chooseFixtureProject('Gateway.csproj');
            await holdRequest('search/query');
            await searchWithEnter('Newtonsoft.Json');
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'the held answer');
            await rewriteHeld('main-browse-unavailable', 'browse-unavailable');
            await until('document.querySelector(\'[data-testid="browse-unavailable-banner"] button\') !== null && document.querySelector(\'[data-testid="browse-list"] [data-testid="package-row-newtonsoft.json"]\') !== null', 'the banner over the rows');
        },
        leave: endHold,
    },
    'main-browse-details': {
        reach: async () => {
            await REACH['main-browse-results'].reach();
            await currentDetails('package-row-newtonsoft.json');
        },
    },
    // UX-P3.5 (design-advisor ruling of 2026-11-07, DO 5): a package installed in no project offers Install in projects…;
    // the dialog's list is aria-busy while a project is unlisted or a cpm/preview (read-only) is unanswered, and no project
    // may read "not listed yet" (design-advisor follow-up 2). Cancelled with Escape, never confirmed.
    'main-browse-multi-install-dialog': {
        reach: async () => {
            await REACH['main-browse-results'].reach();
            await currentDetails('package-row-newtonsoft.json.bson');
            await (await findByTestId('multi-install-button', 30_000)).click();
            await until('(() => { const list = document.querySelector(\'[data-testid="multi-install-dialog"] ul[aria-label="Projects"]\'); return list !== null && list.getAttribute("aria-busy") !== "true" && ![...list.querySelectorAll(".nuiget-multi-install-note")].some(note => note.textContent === "not listed yet"); })()', 'the Multi Install dialog with every project listed and its previews answered', 60_000);
        },
        leave: async () => {
            await driverOf().switchTo().activeElement().sendKeys(Key.ESCAPE);
            await waitForTestIdGone('multi-install-dialog', 10_000);
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
    // Each keystroke aborts the previous quick-search ask and the bus drops answers to aborted ids, so a hold here counts more
    // than one answer (architecture-advisor ruling, UX-P3.2).
    'main-quicksearch-loading': {
        reach: async () => {
            await chooseFixtureProject('Gateway.csproj');
            await holdRequest('search/autocomplete');
            await typeInSearch('Serilog');
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'a held answer');
            await until('document.querySelector(\'[data-testid="search-suggestions-loading"]\') !== null', 'the Searching row');
        },
        leave: () => releaseHeld('main-quicksearch-loading'),
    },
    'main-quicksearch-error': {
        reach: async () => {
            await chooseFixtureProject('Gateway.csproj');
            await holdRequest('search/autocomplete');
            await typeInSearch('Serilog');
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'a held answer');
            await failHeld('main-quicksearch-error', 'The package source did not answer.');
            await until('document.querySelector(\'[data-testid="search-suggestions-error"]\') !== null', 'the error row');
        },
        leave: endHold,
    },
    'main-quicksearch-grouped': {
        reach: async () => {
            await chooseFixtureProject('Gateway.csproj');
            await holdRequest('search/autocomplete');
            await typeInSearch('Serilog');
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'a held answer');
            await rewriteHeld('main-quicksearch-grouped', 'quicksearch-grouped');
            // Two groups, each with an option: fewer than two live suggestions is not reachable, never one group under the name.
            // No key and no click from here to leave (the second source is unreachable by construction).
            await until('(() => { const groups = [...document.querySelectorAll(\'[data-testid="search-suggestions"] [role="group"]\')]; return groups.length === 2 && groups.every(group => group.querySelector(\'[role="option"]:not([aria-disabled="true"])\') !== null) && groups[1].querySelector(".nuiget-search-group-header")?.textContent === "Fixture source"; })()', 'two groups with their labels');
        },
        leave: async () => {
            await endHold();
            await (await findByTestId('search-input')).sendKeys(Key.ESCAPE, Key.ESCAPE);
        },
    },
    'main-details-readme': {
        reach: async () => {
            await gatewayInstalled();
            // Artboard A's scene: the first direct row current (UX-P3.3b); SPEC reads the select's width, so its versions are listed.
            await currentDetails('package-row-microsoft.extensions.dependencyinjection.abstractions');
            await until('(() => { const select = document.querySelector(\'[data-testid="version-selector"]\'); return select !== null && !select.disabled && (select.selectedOptions[0]?.textContent ?? "").endsWith("(installed)"); })()', 'the version selector listing the installed version', 60_000);
            await clickVisible('details-tab-readme');
            await until('document.querySelector(\'[data-testid="readme-content"], [data-testid="readme-empty"]\') !== null', 'the README or its empty state', 60_000);
        },
    },
    'sidebar-sections': { reach: sidebarSections },
    'sidebar-narrow-200px': { reach: sidebarSections },
    'sidebar-all-projects': {
        reach: async () => {
            // The side bar follows the session: All Projects is chosen in the main panel (UX-P3.7c).
            await freshMainPanel();
            await chooseFixtureProject(ALL_PROJECTS);
            await leaveWebview();
            await openSidebarView();
            await enterSidebarWebview();
            const search = await findByTestId('sidebar-search-input', 60_000);
            await typeHeld(search, '@installed ', 'sidebar-all-projects');
            // Settled: the pane's count shown once every project answered, and the two folder rows at level 1 of the one tree.
            await until('/\\d/.test(document.querySelector(\'[data-testid="section-box-installed"] .nuiget-badge--count\')?.textContent ?? "") && Number(document.querySelector(\'[data-testid="sidebar-installed-list"] [role="treeitem"][aria-level="1"]\')?.getAttribute("aria-setsize")) === 2 && document.querySelector(\'[data-testid="sidebar-installed-list"] .nuiget-spinner\') === null', 'the sidebar\'s All Projects tree settled', 120_000);
            await parkSidebarPointer();
        },
        leave: async () => {
            await enterSidebarWebview();
            const search = await findByTestId('sidebar-search-input', 30_000);
            await search.sendKeys(Key.chord(MODIFIER, 'a'), Key.BACK_SPACE);
            await leaveWebview();
            await enterMainWebview();
            await chooseFixtureProject('Gateway.csproj');
        },
    },
    'sidebar-all-projects-updates': {
        reach: async () => {
            // The Updates tree of All Projects (UX-P3.7d), reached as `sidebar-all-projects` is, with "@updates" typed.
            await freshMainPanel();
            await chooseFixtureProject(ALL_PROJECTS);
            await leaveWebview();
            await openSidebarView();
            await enterSidebarWebview();
            const search = await findByTestId('sidebar-search-input', 60_000);
            await typeHeld(search, '@updates ', 'sidebar-all-projects-updates');
            // Settled: the pane's count shown once every project answered, and the two folder rows at level 1 of the one tree.
            await until('/\\d/.test(document.querySelector(\'[data-testid="section-box-updates"] .nuiget-badge--count\')?.textContent ?? "") && Number(document.querySelector(\'[data-testid="sidebar-updates-list"] [role="treeitem"][aria-level="1"]\')?.getAttribute("aria-setsize")) === 2 && document.querySelector(\'[data-testid="sidebar-updates-list"] .nuiget-spinner\') === null', 'the sidebar\'s All Projects Updates tree settled', 120_000);
            // Pinned at the Tools folder, its two leaves rendered (design-advisor ruling of 2026-11-08, DO 7).
            await settleOrReport('sidebar-all-projects-updates', SIDEBAR_UPDATES_ALL_SETTLED(), SIDEBAR_UPDATES_FACTS);
            await parkSidebarPointer();
        },
        settled: () => SIDEBAR_UPDATES_ALL_SETTLED(),
        leave: async () => {
            await enterSidebarWebview();
            const search = await findByTestId('sidebar-search-input', 30_000);
            await search.sendKeys(Key.chord(MODIFIER, 'a'), Key.BACK_SPACE);
            await leaveWebview();
            await enterMainWebview();
            await chooseFixtureProject('Gateway.csproj');
        },
    },
    'sidebar-filter': {
        reach: async () => {
            await sidebarSections();
            const search = await findByTestId('sidebar-search-input', 30_000);
            await typeHeld(search, '@installed Seri', 'sidebar-filter');
            await until('/^\\d+ of \\d+$/.test(document.querySelector(\'[data-testid="section-box-installed"] .nuiget-section-count-text\')?.textContent ?? "") && document.querySelector(\'[data-testid="sidebar-updates-list"]\') === null && document.querySelector(\'[data-testid="sidebar-installed-list"] .nuiget-row-option\') !== null', 'the Installed section filtered, "k of N"', 30_000);
            await parkSidebarPointer();
        },
        leave: async () => {
            await enterSidebarWebview();
            const search = await findByTestId('sidebar-search-input', 30_000);
            await search.sendKeys(Key.chord(MODIFIER, 'a'), Key.BACK_SPACE);
            await findByTestId('sidebar-updates-list', 30_000);
        },
    },
    'sidebar-hover': {
        reach: async () => {
            await sidebarSections();
            const option = await optionOf('package-row-serilog');
            await driverOf().actions().move({ origin: option }).perform();
            await until('document.querySelector(\'.nuiget-sidebar [data-testid="package-row-serilog"] .nuiget-row-option\').matches(":hover")', 'the Serilog row under the pointer', 10_000);
        },
        leave: async () => {
            await enterSidebarWebview();
            await parkSidebarPointer();
        },
    },
    // UX-P3.8 (design-advisor ruling of 2026-11-13, DO 9): no reach presses Delete, Enter on a row, Ctrl+Enter or a row action.
    'sidebar-browse-results': {
        reach: async () => {
            await sidebarSearchWithEnter('Serilog', 'sidebar-browse-results');
            await until(SIDEBAR_SERILOG_LISTED, 'the Serilog results, its installed row and an install action', 120_000);
            await parkSidebarPointer();
        },
        leave: leaveSidebarSearch,
    },
    'sidebar-browse-hover': {
        reach: async () => {
            await REACH['sidebar-browse-results'].reach();
            const option = await optionOf('package-row-serilog');
            await driverOf().actions().move({ origin: option }).perform();
            await until('document.querySelector(\'[data-testid="sidebar-browse-list"] [data-testid="package-row-serilog"] .nuiget-row-option\').matches(":hover")', 'the Serilog Browse row under the pointer', 10_000);
        },
        leave: leaveSidebarSearch,
    },
    'sidebar-browse-loading': {
        reach: async () => {
            await sidebarSections();
            await holdRequest('search/query');
            const search = await findByTestId('sidebar-search-input', 30_000);
            await typeHeld(search, 'Newtonsoft.Json', 'sidebar-browse-loading');
            await search.sendKeys(Key.ENTER);
            // The bar stands because the answer is held, not because nuget.org is slow (VERIFY: `[hold] … N held`, N ≥ 1).
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'the held answer');
            await until('document.querySelector(\'[data-testid="sidebar-browse-progress"]\') !== null && document.querySelector(\'[data-testid="sidebar-browse-list"]\') === null && document.querySelectorAll(".nuiget-skeleton-row").length === 0', 'the bar alone');
            await parkSidebarPointer();
        },
        leave: async () => {
            await enterSidebarWebview();
            await releaseHeld('sidebar-browse-loading');
            await leaveSidebarSearch();
        },
    },
    'sidebar-browse-revalidating': {
        reach: async () => {
            await sidebarSearchWithEnter('Newtonsoft.Json', 'sidebar-browse-revalidating');
            await until('document.querySelector(\'[data-testid="sidebar-browse-list"] .nuiget-row-option\') !== null && document.querySelector(\'[data-testid="sidebar-browse-progress"]\') === null', 'the Newtonsoft.Json results', 120_000);
            await holdRequest('search/query');
            await (await findByTestId('sidebar-search-input', 30_000)).sendKeys(Key.ENTER);
            await until('document.querySelector(\'[data-testid="sidebar-browse-progress"]\') !== null && document.querySelector(\'[data-testid="sidebar-browse-list"]\')?.getAttribute("aria-busy") === "true" && document.querySelector(\'[data-testid="sidebar-browse-list"] .nuiget-row-option\') !== null', 'the rows under the bar, the list busy');
            await parkSidebarPointer();
        },
        leave: async () => {
            await enterSidebarWebview();
            await releaseHeld('sidebar-browse-revalidating');
            await leaveSidebarSearch();
        },
    },
    'sidebar-browse-empty': {
        reach: async () => {
            await sidebarSearchWithEnter('zz-no-such-package-nuiget', 'sidebar-browse-empty');
            await until('document.querySelector(\'[data-testid="sidebar-browse-empty"]\')?.textContent === \'No results for "zz-no-such-package-nuiget".\'', 'the sidebar Browse empty state', 120_000);
            await parkSidebarPointer();
        },
        leave: leaveSidebarSearch,
    },
    'sidebar-browse-error': {
        reach: async () => {
            await sidebarSections();
            await holdRequest('search/query');
            const search = await findByTestId('sidebar-search-input', 30_000);
            await typeHeld(search, 'Newtonsoft.Json', 'sidebar-browse-error');
            await search.sendKeys(Key.ENTER);
            await until('window.__nuigetHold.held.some(d => d.kind === "response")', 'the held answer');
            await failHeld('sidebar-browse-error', 'The package source could not be read.');
            await until('document.querySelector(\'[data-testid="sidebar-browse-error"] button\') !== null', 'the inline error with Retry');
            await parkSidebarPointer();
        },
        leave: async () => {
            await enterSidebarWebview();
            await endHold();
            await leaveSidebarSearch();
        },
    },
    'sidebar-installed-loading': {
        reach: async () => {
            // The Installed pane alone, so no Updates row counts as a row of the cell (design-advisor DO 9).
            await sidebarSections();
            await typeHeld(await findByTestId('sidebar-search-input', 30_000), '@installed ', 'sidebar-installed-loading');
            await findByTestId('sidebar-installed-list', 30_000);
            await holdRequest('installed/get');
            await leaveWebview();
            await enterMainWebview();
            await chooseFixtureProject('Utility.csproj');
            await leaveWebview();
            await enterSidebarWebview();
            await until('window.__nuigetHold.held.length > 0', 'the held Installed answer', 60_000);
            await until('document.querySelector(\'[data-testid="sidebar-installed-progress"]\') !== null && document.querySelector(\'[data-testid="section-header-installed"] .nuiget-spinner\') !== null && document.querySelector(\'[data-testid="section-box-installed"] .nuiget-badge--count\') === null && document.querySelector(".nuiget-sidebar .nuiget-row-option") === null', 'the pane loading: its bar, the header spinner, no count, no row');
            await parkSidebarPointer();
        },
        leave: async () => {
            await enterSidebarWebview();
            await releaseHeld('sidebar-installed-loading');
            await leaveSidebarSearch();
            await leaveWebview();
            await enterMainWebview();
            await chooseFixtureProject('Gateway.csproj');
        },
    },
    'sidebar-update-all-dialog': {
        reach: async () => {
            await sidebarSections();
            // The header's actions show on the section's hover (UX-P3.7b): rest the pointer on the Updates header first.
            await driverOf().actions().move({ origin: await findByTestId('section-header-updates', 30_000) }).perform();
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

/** A window PNG of a capture, the webview's offset in it in CSS px, and the device pixels per CSS px. */
interface Shot {
    png: string;
    x: number;
    y: number;
    dpr: number;
}

/** The outer webview frame's scroll offset, read in that frame: the inner document's measurements cannot see it (UX-P2.8b follow-up 2). */
async function outerFrameScroll(rootTestId: string): Promise<[number, number]> {
    const driver = driverOf();
    await driver.switchTo().defaultContent();
    try {
        for (const outer of await driver.findElements(By.css('iframe.webview'))) {
            await driver.switchTo().frame(outer);
            const offset = await script<[number, number]>('const page = document.scrollingElement || document.documentElement; return [page.scrollLeft + document.body.scrollLeft, page.scrollTop + document.body.scrollTop];');
            const inner = await driver.findElements(By.css('iframe#active-frame'));
            if (inner.length > 0) {
                await driver.switchTo().frame(inner[0]);
                if ((await driver.findElements(By.css(`[data-testid="${rootTestId}"]`))).length > 0) {
                    return offset;
                }
            }
            await driver.switchTo().defaultContent();
        }
    } finally {
        await driver.switchTo().defaultContent();
    }
    throw new Error(`no webview holds ${rootTestId}`);
}

/**
 * Writes the window PNG and the webview crop of `capture`, exactly `capture.width` CSS px wide from the webview's left
 * edge, and logs the rectangle. The pointer is moved to the window's corner first, outside both webviews, except for
 * the state that is about its hover.
 */
async function shoot(state: NamedState, capture: Capture): Promise<Shot> {
    const file = captureFile(state.name, capture);
    if (!HOVER_STATES.includes(state.name)) {
        await leaveWebview();
        await driverOf().actions().move({ x: 1, y: 1 }).perform();
    }
    const rect = await webviewRect(state.surface === 'main' ? 'nuiget-app' : 'nuiget-sidebar');
    const outer = outerScrollVerdict(...await outerFrameScroll(state.surface === 'main' ? 'nuiget-app' : 'nuiget-sidebar'));
    if (!outer.pass) {
        console.warn(`[capture] ${file}: not reachable (${outer.text})`);
        throw new Error(`${state.name} is not reachable: ${outer.text}`);
    }
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
    console.warn(`[capture] ${file}: iframe.webview ${rect.x},${rect.y} ${rect.width}x${rect.height} (dpr ${dpr}), cropped ${capture.width}x${rect.height}, ${outer.text}`);
    return { png: path.join(dir, `${windowName}.png`), x: rect.x, y: rect.y, dpr };
}

/** This pass's `[fringe] host` reading, read once at its first sidebar cell (UX-P3.fix-4, follow-up 3). */
let hostReading: HostReading | undefined;

/** Prints the line verdicts of a crop (DS-TYPE-10, `fringe.ts`), read with the decoder of `scripts/crop-png.mjs`; JSON in on stdin. */
const READ_FRINGE = 'const { decodePng } = await import(process.argv[1]); const { lineVerdicts } = await import(process.argv[2]); let input = \'\'; '
    + 'for await (const chunk of process.stdin) { input += chunk; } const { file, lines, dpr } = JSON.parse(input); '
    + 'console.log(JSON.stringify(lineVerdicts(decodePng(file), lines, dpr)));';

/** The verdict of every text line of a PNG taken at `dpr` (UX-P3.fix-4). */
function lineVerdictsOf(png: string, lines: readonly TextLine[], dpr: number): LineVerdict[] {
    const decoder = pathToFileURL(path.resolve('scripts/crop-png.mjs')).href;
    const reader = pathToFileURL(path.join(__dirname, '..', 'fringe.js')).href;
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', READ_FRINGE, decoder, reader], { encoding: 'utf8', input: JSON.stringify({ file: png, lines, dpr }) })) as LineVerdict[];
}

/**
 * A crop's `[fringe]` line and DS-TYPE-10's result (UX-P3.fix-4): a reading that throws prints `not read` and leaves the
 * rule without a result, which prints `not measurable (no pixels)`.
 */
function fringeOf(name: string, png: string, lines: readonly TextLine[], dpr: number, host: HostReading): { text: string; result?: { value: string; pass: boolean } } {
    try {
        const summary = summarize(lineVerdictsOf(png, lines, dpr));
        return { text: fringeLine(name, summary), result: fringeVerdict(summary, host) };
    } catch (error) {
        return { text: `[fringe] ${name}: not read (${error instanceof Error ? error.message.split('\n')[0] : String(error)})` };
    }
}

/**
 * `[fringe] host` (opening ruling, DO 9; follow-up 3): the side bar's own title label in a window screenshot, read as one
 * text line in the top document: the exemplar of DS-TYPE-10 and its condition. Never throws.
 */
async function hostFringe(windowPng: string, dpr: number): Promise<HostReading> {
    try {
        await leaveWebview();
        const label = await script<TextLine | null>(`
const element = document.querySelector('.part.sidebar .composite.title .title-label h2') || document.querySelector('.part.sidebar .title-label');
const node = element ? [...element.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim()) : undefined;
if (!element || !node) { return null; }
const range = document.createRange();
range.selectNodeContents(node);
const rect = range.getBoundingClientRect();
const m = /rgba?\\(([^)]+)\\)/.exec(getComputedStyle(element).color) || ['', '0,0,0'];
const p = m[1].split(',').map(Number);
const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, label: element.textContent.trim().slice(0, 20), color: [p[0], p[1], p[2]], visible: hit !== null && (hit === element || element.contains(hit)) };`);
        if (label === null) {
            console.warn('[fringe] host: not read (no side bar title label)');
            return 'not read';
        }
        const [verdict] = lineVerdictsOf(windowPng, [label], dpr);
        const reading: HostReading = verdict.skipped !== undefined ? 'not read' : verdict.greyscale ? 'greyscale' : 'lcd';
        console.warn(`[fringe] host: ${verdict.fringe}/${verdict.ink} (${verdict.skipped !== undefined ? `not read: ${verdict.skipped}` : reading}) "${label.label}"`);
        return reading;
    } catch (error) {
        console.warn(`[fringe] host: not read (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`);
        return 'not read';
    }
}

/** Prints the RGBA of one device pixel of a PNG, read with the decoder of `scripts/crop-png.mjs`. */
const PIXEL_AT = 'const { decodePng } = await import(process.argv[1]); const [file, x, y] = process.argv.slice(2); const png = decodePng(file); '
    + 'const at = (Number(y) * png.width + Number(x)) * 4; console.log(JSON.stringify([...png.pixels.subarray(at, at + 4)]));';

/** The RGBA of the device pixel at `x`, `y` of a PNG. */
function pixelAt(png: string, x: number, y: number): number[] {
    const decoder = pathToFileURL(path.resolve('scripts/crop-png.mjs')).href;
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', PIXEL_AT, decoder, png, String(Math.round(x)), String(Math.round(y))], { encoding: 'utf8' })) as number[];
}

/** The axe-core the harness injects into a webview, as `theme.ui.test.ts` does. */
const AXE_SOURCE = fs.readFileSync(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8');

/**
 * Runs in the webview: why the state's data is still arriving, or `''` once it is all there (UX-P0.23 design-advisor follow-up):
 * no busy element; each visible tab with its count (the slice is `ready`); every comfortable row with its authors (its
 * metadata arrived). The snapshot reads counts and marks that arrive after the crop.
 */
/** UX-P2.fix-6: what the tree holds when the Unsupported project's leaf never came (the tab, the pin, the project's group row). */
const LEAF_FACTS = `
const list = document.querySelector('[data-testid="installed-list"]');
if (list === null) return 'no installed-list';
const box = list.getBoundingClientRect();
const at = el => { if (el === null) return 'absent'; const rect = el.getBoundingClientRect(); return Math.round(rect.top) + '–' + Math.round(rect.bottom); };
const project = list.querySelector('[data-testid^="group-row-project-unsupported"]');
const item = project === null ? null : project.querySelector('[role="treeitem"]');
const rows = list.querySelectorAll('[data-index]').length;
return 'tab "' + (document.querySelector('[data-testid="installed-tab"]')?.textContent ?? '') + '", clip y ' + Math.round(box.top) + '–' + Math.round(box.bottom)
    + ', scrollTop ' + Math.round(list.scrollTop) + ' of ' + list.scrollHeight + ', rendered ' + rows
    + ', tools folder y ' + at(list.querySelector('[data-testid="group-row-folder-tools"]'))
    + ', Unsupported group row y ' + at(project) + (item === null ? '' : ' expanded ' + item.getAttribute('aria-expanded') + ', busy ' + (project.querySelector('.nuiget-spinner') !== null))
    + ', unsupported cells ' + [...document.querySelectorAll('[data-testid^="installed-unsupported"]')].map(el => el.dataset.testid).join(' ');
`;

const UNSETTLED = `
const clauses = [];
if (document.querySelector('[aria-busy="true"]')) clauses.push('a busy element');
for (const id of ['installed-tab', 'updates-tab']) {
    const tab = document.querySelector('[data-testid="' + id + '"]');
    if (tab && tab.offsetParent !== null && !/[0-9]/.test(tab.textContent || '')) clauses.push(id + ' without a count');
}
if ([...document.querySelectorAll('.nuiget-row--comfortable:not([data-row-kind])')].some(row => !row.querySelector('.nuiget-row-authors') && !row.querySelector('[aria-disabled="true"]'))) clauses.push('a comfortable row without authors');
return clauses.join('; ');
`;

/**
 * An All Projects list pinned at the Tools folder with every marker its hard rules read rendered and nothing unsettled, in one
 * evaluation (UX-P3.1b, architecture-advisor ruling on run 42263438578; the P2.fix-6 pin). A probe that has to move the pin
 * answers false: the virtualizer renders the new window after it, and the next probe reads it.
 */
const allProjectsSettled = (listTestId: string, markers: readonly string[], pinRow = 'group-row-folder-tools', pin: 'top' | 'top-or-end' = 'top'): string => `
const list = document.querySelector('[data-testid="${listTestId}"]');
if (list === null) return false;
const row = list.querySelector('[data-testid="${pinRow}"]');
if (row === null) { list.scrollTop += 300; return false; }
const delta = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
${pin === 'top-or-end'
        // The sidebar's tree ends before the Tools row can reach the list's top: pinned at its end (UX-P3.7d).
        ? 'const atEnd = list.scrollTop >= list.scrollHeight - list.clientHeight - 1;\nif (Math.abs(delta) >= 1 && !(delta > 0 && atEnd)) { list.scrollTop += delta; return false; }'
        : 'if (Math.abs(delta) >= 1) { list.scrollTop += delta; return false; }'}
if (!${JSON.stringify(markers)}.every(id => document.querySelector('[data-testid="' + id + '"]') !== null)) return false;
const unsettled = (() => { ${UNSETTLED} })();
return unsettled === '';`;

/** `STATE_MARKERS['main-installed-all']` of `measure.ts`: the markers DS-STATE-1 reads in this state. */
const INSTALLED_ALL_SETTLED = (): string => allProjectsSettled('installed-list', ['installed-provisional-unsupported.csproj', 'installed-unsupported-unsupported.csproj', 'installed-empty-empty.csproj']);
/** `STATE_MARKERS['main-updates-all']` of `measure.ts`. */
const UPDATES_ALL_SETTLED = (): string => allProjectsSettled('updates-list', ['updates-unsupported-unsupported.csproj', 'updates-empty-empty.csproj']);
/** What the sidebar's Updates tree shows when its settle times out: the scroll box, the pin row, the markers and what is unsettled (UX-P3.7d). */
const SIDEBAR_UPDATES_FACTS = `
const list = document.querySelector('[data-testid="sidebar-updates-list"]');
if (list === null) return 'no sidebar-updates-list';
const row = list.querySelector('[data-testid="group-row-updates-folder-tools"]');
const unsettled = (() => { ${UNSETTLED} })();
return 'scrollTop ' + Math.round(list.scrollTop) + ' of ' + list.scrollHeight + ', client ' + list.clientHeight + ', rendered ' + list.querySelectorAll('[data-index]').length
    + ', tools row ' + (row === null ? 'absent' : 'at ' + Math.round(row.getBoundingClientRect().top - list.getBoundingClientRect().top))
    + ', markers ' + [...document.querySelectorAll('[data-testid^="sidebar-updates-empty-"], [data-testid^="sidebar-updates-unsupported-"]')].map(el => el.dataset.testid).join(' ')
    + ', unsettled "' + unsettled + '"';
`;
/** `STATE_MARKERS['sidebar-all-projects-updates']` of `measure.ts`, pinned at the Updates tree's Tools folder (UX-P3.7d). */
const SIDEBAR_UPDATES_ALL_SETTLED = (): string => allProjectsSettled('sidebar-updates-list', ['sidebar-updates-unsupported-unsupported.csproj', 'sidebar-updates-empty-empty.csproj'], 'group-row-updates-folder-tools', 'top-or-end');

/** Polls a state's settle predicate; on a timeout prints the list's facts as a `[reach]` line, then fails. */
async function settleOrReport(state: string, predicate: string, facts = LEAF_FACTS): Promise<void> {
    try {
        await poll(async () => ((await script<boolean>(predicate)) ? true : undefined), `${state} settled (the pin, its markers, nothing unsettled)`, 120_000);
    } catch (error) {
        console.warn(`[reach] ${state}: ${await script<string>(facts)}`);
        throw error;
    }
}

/** The settle wait's budget: bounded and never fatal. */
const SETTLE_MS = 120_000;

/** The states this run has audited (UX-P0.23): once per state, at its first capture. */
const audited = new Set<string>();

/**
 * UX-P0.23 (`a11y.ts`): the full axe ruleset over the page the state shows, layers open, and in the Modern UI pass the
 * snapshot of its accessible tree, written to `aria/<state>.json` beside the crops and compared with the committed one.
 * Prints the `[axe]` and `[aria]` lines; returns the axe failures, which fail the capture once the rule is `hard`.
 */
async function auditAccessibility(state: NamedState): Promise<string[]> {
    await (state.surface === 'main' ? enterMainWebview() : enterSidebarWebview());
    const driver = driverOf();
    if (!(await script<boolean>('return typeof window.axe !== "undefined";'))) {
        await script(AXE_SOURCE);
    }
    // After the shot and the measurements, never before them: the snapshot and axe read the state's settled data.
    if (!HELD_STATES.includes(state.name)) {
        const unsettled = NO_COUNT_STATES.includes(state.name) ? 'return document.querySelector(\'[aria-busy="true"]\') ? "a busy element" : "";' : UNSETTLED;
        try {
            await poll(async () => ((await script<string>(unsettled)) === '' ? true : undefined), 'the state\'s data to settle', SETTLE_MS);
        } catch {
            console.warn(`[aria] ${state.name}: not settled after ${SETTLE_MS / 1000} s (${await script<string>(unsettled)})`);
        }
    }
    if (LOOK === 'modern') {
        const tree = await script<{ nodes?: AriaNode[]; error?: string }>(ARIA_SNAPSHOT);
        if (tree.nodes === undefined) {
            console.warn(`[aria] ${state.name}: not read (${tree.error ?? 'no answer'})`);
        } else {
            const snapshot = ariaSnapshot(state.name, tree.nodes);
            const dir = path.join(path.dirname(VSBrowser.instance.getScreenshotsDir()), 'aria');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `${state.name}.json`), JSON.stringify(snapshot, null, 2) + '\n');
            const committedFile = path.resolve('src/test/ui/v2/aria', `${state.name}.json`);
            const committed = fs.existsSync(committedFile) ? JSON.parse(fs.readFileSync(committedFile, 'utf8')) as AriaSnapshot : undefined;
            console.warn(ariaLineFor(state.name, snapshot, committed));
        }
    }
    await driver.manage().setTimeouts({ script: 120_000 });
    const result = JSON.parse(await driver.executeAsyncScript<string>(RUN_FULL_AXE, AXE_EXTRA_RULES, AXE_NODES_PER_RULE, acceptedSelectors())) as FullAxe;
    // UX-P0.25: what axe left undecided outside the details pane is decided by scrolling or measured as pairs; no layer is
    // closed and every scroll is restored, so the state's later captures stay as they were.
    const undecided = result.undecidedContrast ?? [];
    let resolved: Resolved | undefined;
    if (undecided.length > 0) {
        try {
            resolved = JSON.parse(await driver.executeAsyncScript<string>(RESOLVE_CONTRAST, undecided, LAYER_SELECTOR)) as Resolved;
        } catch (error) {
            // A script timeout or a bad answer belongs to the resolve pass (CONTRAST_STATUS), not to the full run.
            resolved = { targets: undecided.length, decided: 0, violations: [], pairs: [], unresolved: undecided, error: error instanceof Error ? error.message : String(error) };
        }
    }
    const contrast = resolved === undefined ? { lines: [], failures: [] } : resolvedLines(state.name, 'dark-modern', resolved);
    // The full run's undecided contrast stands (with its AXE_PENDING owner) unless the resolve pass decided all of it with no
    // failure of its own: a violation, a pair below threshold, an unresolved node or an error keeps it.
    const unresolved = resolved === undefined ? undefined : { unresolved: contrast.failures.length };
    const { lines, failures } = axeLines(state.name, state.surface, result, undefined, undefined, undefined, unresolved);
    for (const line of [...lines, ...contrast.lines]) {
        console.warn(line);
        if (/\(pending [^)]+\)$/.test(line)) {
            pendingLines.push(line);
        }
    }
    return [...(FULL_AXE_STATUS === 'hard' ? failures : []), ...(CONTRAST_STATUS === 'hard' ? contrast.failures : [])];
}

/** The audit with its own errors caught: an error is a failure, which fails the capture only once the rule is `hard`. */
async function auditSafely(state: NamedState): Promise<string[]> {
    try {
        return await auditAccessibility(state);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[axe] ${state.name}: the audit failed: ${reason}`);
        return FULL_AXE_STATUS === 'hard' ? [`the audit failed: ${reason}`] : [];
    }
}

// ---- UX-P0.24: the keyboard walks and the motion check ---------------------------------------------------------------

/** Sends keys to the focused element of the webview the driver is in: the driver's action queue does not reach it (H48). */
const press = async (...keys: string[]): Promise<void> => {
    await (await driverOf().switchTo().activeElement()).sendKeys(...keys);
};

/** The focused element of the webview the driver is in (`DESCRIBE_FOCUS`), axe injected first. */
async function focused(rootTestId: string): Promise<FocusFacts> {
    if (!(await script<boolean>('return typeof window.axe !== "undefined";'))) {
        await script(AXE_SOURCE);
    }
    return script<FocusFacts>(DESCRIBE_FOCUS, rootTestId);
}

/** Tab from the search box: every stop until focus leaves the webview root, comes back to the search box, or 40 stops. */
async function walkTab(rootTestId: string, searchTestId: string): Promise<FocusFacts[]> {
    await (await findByTestId(searchTestId, 30_000)).click();
    const stops = [await focused(rootTestId)];
    for (let step = 0; step < 40; step++) {
        await press(Key.TAB);
        const stop = await focused(rootTestId);
        if (!stop.inRoot || stop.testid === searchTestId) {
            break;
        }
        stops.push(stop);
    }
    return stops;
}

/**
 * Runs in the webview: the focused option of the list `arguments[0]` as `row <posinset>` (`current row …` when it is the
 * row whose details show: `aria-current` in a multi-selectable list, `aria-selected` in a single-select one), else what has
 * focus.
 */
const ACTIVE_ROW = `
const el = document.activeElement;
if (!el || el === document.body) return 'body';
if (!el.closest('[data-testid="' + arguments[0] + '"]') || !el.matches('.nuiget-row-option, .nuiget-row-group')) return el.getAttribute('data-testid') || el.tagName.toLowerCase();
if (el.matches('.nuiget-row-group')) return 'group ' + el.getAttribute('aria-posinset');
const list = el.closest('.nuiget-listbox');
const current = list && list.getAttribute('aria-multiselectable') === 'true' ? el.getAttribute('aria-current') === 'true' : el.getAttribute('aria-selected') === 'true';
return (current ? 'current ' : '') + 'row ' + el.getAttribute('aria-posinset');
`;

const A_ROW = /^(current )?(row|group) /;
const activeRow = (listTestId: string): Promise<string> => script<string>(ACTIVE_ROW, listTestId);

const focusedTestId = async (): Promise<string> => (await script<string | null>('const el = document.activeElement; return el && el !== document.body ? el.getAttribute("data-testid") || el.tagName.toLowerCase() : "body";')) ?? 'body';

/**
 * The row keys of interaction model §5 that write nothing, on the list reached from the search box: Ctrl+DownArrow, Home,
 * ArrowDown, ArrowUp, End, Enter where it only shows the details (else `enter` says why it is not pressed), Ctrl+UpArrow.
 */
async function rowKeys(screen: KeyScreen, listTestId: string, searchTestId: string, enter: 'press' | { skipped: string }): Promise<KeyOutcome[]> {
    const outcomes: KeyOutcome[] = [];
    await (await findByTestId(searchTestId, 30_000)).click();
    await press(Key.chord(MODIFIER, Key.ARROW_DOWN));
    const landed = await activeRow(listTestId);
    outcomes.push({ path: 'search Ctrl+DownArrow', observed: A_ROW.test(landed) ? 'a row of the list' : landed, expected: 'a row of the list' });
    if (!A_ROW.test(landed)) {
        // The list reached with Tab instead, as the focus state's setup does, so that the row keys are still read.
        await poll(async () => {
            if (A_ROW.test(await activeRow(listTestId))) {
                return true;
            }
            await press(Key.TAB);
            return undefined;
        }, `${listTestId} reached with Tab`, 15_000);
    }
    const tree = await script<boolean>('return document.querySelector(\'[data-testid="\' + arguments[0] + \'"]\').getAttribute("role") === "tree";', listTestId);
    const readSize = (): Promise<number> => script<number>('return Number(document.activeElement.getAttribute("aria-setsize"));');
    let size = await readSize();
    const step = async (path: string, key: string, expected: string): Promise<void> => {
        await press(key);
        outcomes.push({ path, observed: (await activeRow(listTestId)).replace(/^current /, ''), expected });
    };
    if (tree) {
        // A grouped list (D48): the group row comes first and the package rows count among themselves.
        await step('rows Home', Key.HOME, 'group 1');
        // The level-1 set size checks the declared tail: a group added or removed fails until `KEYS_TREE_TAIL` follows.
        const declared = KEYS_TREE_TAIL[screen];
        outcomes.push({ path: 'rows Home groups', observed: String(await readSize()), expected: declared === undefined ? 'no KEYS_TREE_TAIL entry' : String(declared.groups) });
        await step('rows ArrowDown', Key.ARROW_DOWN, 'row 1');
        size = await readSize();
        await step('rows ArrowUp', Key.ARROW_UP, 'group 1');
    } else {
        await step('rows Home', Key.HOME, 'row 1');
        await step('rows ArrowDown', Key.ARROW_DOWN, size > 1 ? 'row 2' : 'row 1');
        await step('rows ArrowUp', Key.ARROW_UP, 'row 1');
    }
    // A tree's tail is the screen's declaration in `KEYS_TREE_TAIL` (End on its last treeitem, interaction model §5), checked
    // by the level-1 set size read at Home; a tree screen without an entry fails, never guessed.
    if (tree) {
        const tail = treeTail(screen, size);
        if (tail === undefined) {
            outcomes.push({ path: 'rows End', observed: await activeRow(listTestId), expected: 'no KEYS_TREE_TAIL entry' });
        } else {
            await step('rows End', Key.END, tail.end);
            await step('rows ArrowUp from End', Key.ARROW_UP, tail.upFromEnd);
        }
    } else {
        await step('rows End', Key.END, `row ${size}`);
    }
    if (enter === 'press') {
        await press(Key.ENTER);
        const current = await poll(async () => {
            const now = await activeRow(listTestId);
            return now.startsWith('current ') ? now : undefined;
        }, 'the row made current', 10_000).catch(() => activeRow(listTestId));
        outcomes.push({ path: 'rows Enter', observed: current, expected: `current row ${size}` });
    } else {
        outcomes.push({ path: 'rows Enter', observed: '', expected: '', skipped: enter.skipped });
    }
    await press(Key.chord(MODIFIER, Key.ARROW_UP));
    outcomes.push({ path: 'rows Ctrl+UpArrow', observed: await focusedTestId(), expected: searchTestId });
    return outcomes;
}

/** Runs in the webview: whether focus is inside an open dialog. */
const FOCUS_IN_DIALOG = 'const el = document.activeElement; return Boolean(el && el.closest(\'[role="alertdialog"], [role="dialog"]\'));';

/**
 * The bulk dialog of the Installed list by keyboard (`main-installed-bulk-dialog`'s path, never confirmed): opened with
 * Enter on its button, Tab kept inside, closed with Escape, focus back on the opener; the selection is put back after.
 */
async function dialogKeys(): Promise<KeyOutcome[]> {
    const outcomes: KeyOutcome[] = [];
    await scrollListTo('installed-list', 'package-row-serilog');
    await toggleIntoSelection('package-row-serilog');
    await script('document.querySelector(\'[data-testid="uninstall-selected-button"]\').focus();');
    await press(Key.ENTER);
    await findByTestId('confirm-dialog', 10_000);
    outcomes.push({ path: 'dialog open', observed: (await script<boolean>(FOCUS_IN_DIALOG)) ? 'focus inside the dialog' : 'focus outside the dialog', expected: 'focus inside the dialog' });
    let inside = true;
    for (let step = 0; step < 6; step++) {
        await press(Key.TAB);
        inside = inside && (await script<boolean>(FOCUS_IN_DIALOG));
    }
    outcomes.push({ path: 'dialog Tab ×6', observed: inside ? 'focus stays inside' : 'focus left the dialog', expected: 'focus stays inside' });
    await press(Key.ESCAPE);
    const closed = await poll(async () => ((await driverOf().findElements(By.css('[data-testid="confirm-dialog"]'))).length === 0 ? true : undefined), 'the dialog closed', 10_000).then(() => true, () => false);
    outcomes.push({ path: 'dialog Escape', observed: closed ? 'closed' : 'still open', expected: 'closed' });
    if (!closed) {
        await cancelDialog();
    }
    outcomes.push({ path: 'dialog restore', observed: await focusedTestId(), expected: 'uninstall-selected-button' });
    await scrollListTo('installed-list', 'package-row-serilog');
    const option = await optionOf('package-row-serilog');
    await driverOf().actions().keyDown(MODIFIER).click(option).keyUp(MODIFIER).perform();
    await poll(async () => ((await option.getAttribute('aria-selected')) !== 'true' ? true : undefined), 'package-row-serilog out of the selection', 10_000);
    return outcomes;
}

/** Prints a walk's or a check's lines, the pending ones into the run's pending list. */
function printLines(lines: readonly string[]): void {
    for (const line of lines) {
        console.warn(line);
        if (/\(pending [^)]+\)$/.test(line)) {
            pendingLines.push(line);
        }
    }
}

/** A screen's walk: the tab sequence from its search box, then its keys; fails only once `KEYS_STATUS` is `hard`. */
async function walkScreen(screen: KeyScreen, rootTestId: string, searchTestId: string, keys: () => Promise<KeyOutcome[]>): Promise<void> {
    // The settled state the ARIA snapshot reads: a tab's name arrives with its count (design-advisor ruling of 2026-10-25).
    try {
        await poll(async () => ((await script<string>(UNSETTLED)) === '' ? true : undefined), 'the screen\'s data to settle', SETTLE_MS);
    } catch {
        console.warn(`[keys] ${screen}: not settled after ${SETTLE_MS / 1000} s (${await script<string>(UNSETTLED)})`);
    }
    const stops = await walkTab(rootTestId, searchTestId);
    const { lines, failures } = keysLines(screen, stops, await keys());
    printLines(lines);
    if (KEYS_STATUS === 'hard' && failures.length > 0) {
        throw new Error(`[keys] ${screen}: ${failures.join('; ')}`);
    }
}

/** The state whose default capture a walk's screen is set up like. */
const stateNamed = (name: string): NamedState => {
    const state = STATES.find(candidate => candidate.name === name);
    if (state === undefined) {
        throw new Error(`no named state ${name}`);
    }
    return state;
};

// ---- UX-P0.26: the in-page timings -----------------------------------------------------------------------------------

/** Utility's packages that Gateway lacks: its own rows, told apart from the rows the list showed before. */
const UTILITY_ROW = installedRowOf(['system.commandline', 'spectre.console', 'csvhelper', 'yamldotnet', 'nodatime']);
/** A Utility row whose details no earlier test opens. */
const DETAILS_ID = 'system.commandline';
/** A text no earlier test searches for with Enter: the host has no answer for it yet. */
const SEARCH_TEXT = 'Humanizer';

const PROVISIONAL_FLAG = { name: 'provisional', predicate: PROVISIONAL, seen: 'a provisional list came first', unseen: 'no provisional list (the first answer was the evaluated one)' };

/**
 * A reopen, its lists cached: the recorder starts once the driver reaches the content frame, and every mark may be there
 * by then (an upper bound). The session's first open is not timed: the exemplar test closes every editor before a read
 * could wait for it, and a wait there would move the captures (run 41025682652).
 */
const PANEL_OPEN: PerfChain = {
    label: 'panel open again',
    context: 'Gateway, its lists cached by the captures',
    start: { kind: 'load' },
    marks: [
        { name: 'first row', predicate: INSTALLED_ROW },
        { name: 'authoritative list', predicate: authoritative(INSTALLED_ROW) },
        { name: 'icons', predicate: icons(INSTALLED_ROW) },
    ],
    flags: [PROVISIONAL_FLAG],
};

const REFRESH: PerfChain = {
    label: 'refresh',
    context: 'Gateway, every resource invalidated by the Refresh button',
    start: { kind: 'event', type: 'pointerdown', selector: '[data-testid="refresh-button"]' },
    marks: [{ name: 'list settled', predicate: SETTLED, after: 'revalidating' }],
    flags: [{ name: 'revalidating', predicate: REVALIDATING, seen: 'the list revalidated', unseen: 'no revalidation seen' }, PROVISIONAL_FLAG],
};

const PROJECT_CHOSEN: PerfChain = {
    label: 'project chosen',
    context: 'Utility, not read since the Refresh',
    start: { kind: 'event', type: 'change', selector: '[data-testid="project-selector"]' },
    marks: [
        { name: 'first row', predicate: UTILITY_ROW },
        { name: 'authoritative list', predicate: authoritative(UTILITY_ROW) },
        { name: 'icons', predicate: icons(UTILITY_ROW) },
    ],
    flags: [PROVISIONAL_FLAG],
};

const SELECT: PerfChain = {
    label: 'select',
    context: `${DETAILS_ID} in Utility's Installed list, its details not read before`,
    start: { kind: 'event', type: 'pointerdown', selector: `[data-testid="package-row-${DETAILS_ID}"] .nuiget-row-option` },
    marks: [{ name: 'details', predicate: details(DETAILS_ID) }, { name: 'dependencies', predicate: dependencies(DETAILS_ID) }],
};

/** `search` (a new text: the line P5.9a's gate reads) and `search again` (the same text, its answer cached). */
const searchChain = (label: 'search' | 'search again'): PerfChain => ({
    label,
    context: `"${SEARCH_TEXT}"${label === 'search' ? ', not searched before' : ' again'}, Enter in the search box`,
    start: { kind: 'event', type: 'keydown', selector: '[data-testid="search-input"]', key: 'Enter' },
    marks: [{ name: 'first result', predicate: BROWSE_ROW }],
});

/** Waits at most `timeoutMs` for the marks of the armed `chain`, disarms its recorder and prints its lines. */
async function finishChain(chain: PerfChain, timeoutMs: number): Promise<void> {
    let result: PerfResult | null;
    try {
        result = await poll(async () => {
            const read = await script<PerfResult | null>(READ_PERF);
            return perfComplete(chain, read) ? read : undefined;
        }, `the marks of ${chain.label}`, timeoutMs);
    } catch {
        result = await script<PerfResult | null>(READ_PERF).catch(() => null);
    }
    await script(STOP_PERF).catch(() => undefined);
    printLines(perfLines(chain, result, timeoutMs));
}

/** Arms `chain` in the webview the driver is in, acts, and prints the chain. */
async function timeChain(chain: PerfChain, act: () => Promise<void>, timeoutMs = 60_000): Promise<void> {
    await script(perfRecorder(chain));
    await act();
    await finishChain(chain, timeoutMs);
}

/**
 * A new main panel with the recorder of a `load` chain armed as soon as the driver reaches the content frame: the
 * outer frame's pending frame as well as its active one, once the static `#root` is written and before the bundle has
 * rendered, when the driver is that quick. A mark already shown is then an upper bound.
 */
async function openMainPanelTimed(chain: PerfChain): Promise<void> {
    await leaveWebview();
    const editors = new EditorView();
    if ((await editors.getOpenEditorTitles()).includes('nUIget')) {
        await editors.closeEditor('nUIget');
    }
    await openMainPanel();
    const driver = driverOf();
    const install = perfRecorder(chain, '#root');
    const deadline = Date.now() + 60_000;
    // No pause between tries: each costs a few WebDriver round trips, and the first rows can follow the bundle closely.
    for (;;) {
        try {
            await driver.switchTo().defaultContent();
            for (const outer of await driver.findElements(By.css('iframe.webview'))) {
                await driver.switchTo().frame(outer);
                for (const inner of await driver.findElements(By.css('iframe#active-frame, iframe#pending-frame'))) {
                    await driver.switchTo().frame(inner);
                    if (await script<boolean>(install)) {
                        return;
                    }
                    await driver.switchTo().parentFrame();
                }
                await driver.switchTo().defaultContent();
            }
        } catch {
            // A frame that went away while it was entered is "not yet".
        }
        if (Date.now() > deadline) {
            throw new Error('the new main panel\'s content frame was not reached in 60 s');
        }
    }
}

/** Clears the search box with Escape until the tabs are back (a first Escape may close the suggestions only). */
async function clearSearch(): Promise<void> {
    const box = await findByTestId('search-input', 30_000);
    await poll(async () => {
        if ((await driverOf().findElements(By.css('[data-testid="tab-bar"]'))).length > 0 && (await box.getAttribute('value')) === '') {
            return true;
        }
        await box.click();
        await box.sendKeys(Key.ESCAPE);
        return undefined;
    }, 'the tabs back after Escape', 10_000);
    await waitForTestIdGone('browse-list', 10_000);
}

/** One step of the timings: a step that throws prints why it was not measured, and the next one runs. */
async function perfStep(label: string, run: () => Promise<void>): Promise<void> {
    try {
        await run();
    } catch (error) {
        console.warn(`[perf] ${label}: not measured (${error instanceof Error ? error.message : String(error)})`);
    }
}

/** Whether this run has printed its `[probe] scrollbar` line. */
let scrollbarProbed = false;

/**
 * UX-P0.22 (V15, ADR-011 Decision 6): once per run, at the first capture with a list that scrolls, the bar's thickness, the
 * root's `scrollbar-color` and the thumb's pixel in the window PNG against the slider token over the track's backdrop
 * (the track is transparent). The thumb is sampled at the bar's centre line, near its top: at `scrollTop` 0 it starts there.
 */
function probeScrollbar(state: NamedState, capture: Capture, layout: Layout, shot: Shot): void {
    const scroller = layout.root ? layout.scrollbar.scrollers.find(candidate => candidate.size > 0) ?? layout.scrollbar.scrollers[0] : undefined;
    if (scrollbarProbed || scroller === undefined) {
        return;
    }
    scrollbarProbed = true;
    const x = shot.x + scroller.right - scroller.size / 2;
    const y = shot.y + scroller.top + Math.min(scroller.thumb / 2, 6);
    const [r, g, b] = pixelAt(shot.png, x * shot.dpr, y * shot.dpr);
    const { expected, match } = thumbVerdict(layout.scrollbar.slider, scroller.backdrop, [r, g, b]);
    const verdict = expected === undefined ? 'no expected colour' : `${match ? 'the token colour' : 'not the token colour'} ${expected}`;
    console.warn(`[probe] scrollbar ${captureFile(state.name, capture)}: ${scroller.label} ${scroller.size} px, :root scrollbar-color ${layout.scrollbar.rootColor || 'unset'}, `
        + `thumb rgb(${r}, ${g}, ${b}) at ${Math.round(x)},${Math.round(y)}, slider ${layout.scrollbar.slider || 'unset'} over ${scroller.backdrop || 'nothing'}: ${verdict}`);
}

/** The run's host, for each capture's fingerprint (UX-P0.15): set in `before`. */
const host = { chromium: 'unknown', image: process.env.ImageOS ? `${process.env.ImageOS} ${process.env.ImageVersion ?? ''}`.trim() : process.platform };

/** What the webview says about a capture before its screenshot: the root's font facts and the masks' rectangles. */
interface CaptureFacts {
    fontFamily: string;
    font: string;
    referenceWidth: number;
    dpr: number;
    masks: Array<{ selector: string; rects: CropRect[] }>;
}

/**
 * Writes the crop's sidecar `<state>.<theme>.<width>.json` beside it (UX-P0.15, `golden.ts`): the masks as rectangles in
 * the crop, the state's tolerance and the fingerprint `scripts/compare-goldens.mjs` reads.
 */
function writeSidecar(state: NamedState, capture: Capture, facts: CaptureFacts): void {
    const file = captureFile(state.name, capture);
    const sidecar: Sidecar = {
        state: state.name, theme: capture.theme, look: capture.look, width: capture.width, tolerance: state.diffTolerance,
        masks: state.masks.map((mask, index) => ({ selector: mask.selector, reason: mask.reason, rects: facts.masks[index]?.rects ?? [] })),
        fingerprint: {
            fontFamily: facts.fontFamily, font: facts.font, referenceWidth: facts.referenceWidth, dpr: facts.dpr,
            vscode: VSBrowser.instance.version, chromium: host.chromium, image: host.image,
        },
        run: process.env.GITHUB_RUN_ID ?? 'local',
    };
    fs.writeFileSync(path.join(path.dirname(VSBrowser.instance.getScreenshotsDir()), sidecarFile(file)), JSON.stringify(sidecar, null, 2) + '\n');
}

/** The pending lines of this run, printed again at its end. */
const pendingLines: string[] = [];

/**
 * Helper 3's parity: the exemplar's controls (`docs/design/workbench/<look>.json`, measured on the `ui` lane with VS Code
 * 1.140.0) in every lane, and this run's own controls, measured once at its start (UX-P0.11), printed beside them as
 * information (UX-P2.fix-2: D22's "same ExTester session" is the `ui` lane's).
 */
const exemplarHeights = (look: string): WorkbenchHeights => {
    const file = JSON.parse(fs.readFileSync(path.resolve('docs/design/workbench', `${look}.json`), 'utf8')) as { widgets: Record<string, { height: number } | null> };
    return Object.fromEntries(Object.entries(file.widgets).flatMap(([name, widget]) => (widget === null ? [] : [[name, widget.height]])));
};
const workbench: WorkbenchHeights = exemplarHeights(LOOK);
let laneWorkbench: WorkbenchHeights = {};

let lookReported = false;

const READ_DOCUMENT = 'const doc = document.documentElement; return { width: doc.clientWidth, height: doc.clientHeight, scrollWidth: doc.scrollWidth, scrollHeight: doc.scrollHeight };';

/**
 * The virtualized tree's numbers (design-advisor, UX-P2.1e; informational): the scroller, its sizer, the rendered rows and
 * their heights, and the items of the sets a rendered row belongs to (an unrendered group's children are not counted).
 */
const READ_VIRTUAL = `
const list = document.querySelector('[data-testid="installed-list"]');
if (list === null) return null;
const scroller = list.matches('.nuiget-listbox') ? list : list.querySelector('.nuiget-listbox');
const sizer = list.querySelector('.nuiget-listbox-sizer');
const rows = sizer === null ? [] : [...sizer.children].filter(row => row.hasAttribute('data-index'));
const sets = new Map();
let parent = '';
for (const row of rows) {
    const item = row.querySelector('[role="treeitem"]') ?? row;
    const level = Number(item.getAttribute('aria-level'));
    const size = Number(item.getAttribute('aria-setsize'));
    if (row.getAttribute('data-row-kind') === 'group') parent = row.getAttribute('data-index');
    sets.set(level === 1 ? 'root' : parent + '/' + level, size);
}
return {
    client: scroller.clientHeight,
    scroll: scroller.scrollHeight,
    sizer: sizer === null ? 0 : sizer.getBoundingClientRect().height,
    rendered: rows.length,
    heights: rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0),
    items: [...sets.values()].reduce((sum, size) => sum + size, 0),
    // UX-P2.fix-5: where the list stands and where the Direct header sits against its clip (DS-GRID-2b's inView).
    scrollTop: Math.round(scroller.scrollTop * 10) / 10,
    clip: (() => { const box = scroller.getBoundingClientRect(); return Math.round(box.top) + '–' + Math.round(box.bottom); })(),
    direct: (() => { const box = list.querySelector('[data-testid="section-box-direct"]'); if (box === null) return 'absent'; const rect = box.getBoundingClientRect(); return Math.round(rect.top) + '–' + Math.round(rect.bottom); })(),
};
`;

/** MS-8's reference: the chrome of the first state measured at each surface, theme, width and look (UX-P0.12). */
const chromeReferences = new Map<string, ChromeReference>();

/**
 * The look's elements of the state's artboard spec (`docs/design/artboards/<state>.spec.json`, UX-P0.27a) when the
 * capture has the spec's theme and width, else undefined: helper 8's input (UX-P0.13).
 */
function specFor(state: NamedState, capture: Capture): SpecLook | undefined {
    const file = path.resolve('docs/design/artboards', `${artboardOf(state.name)}.spec.json`);
    if (!fs.existsSync(file)) {
        return undefined;
    }
    const spec = JSON.parse(fs.readFileSync(file, 'utf8')) as ArtboardSpec;
    return spec.theme === capture.theme && spec.width === capture.width ? spec.looks[capture.look] : undefined;
}

/**
 * DS-OVERFLOW-4 (UX-P3.7b): the side bar's visible view-title actions in the top document, the `...` item left out (the
 * research probe's `sidebar_title` count).
 */
const VIEW_TITLE_ACTIONS = `return [...document.querySelectorAll('.part.sidebar .title-actions .action-item')].filter(item => {
    const label = item.querySelector('.action-label');
    const more = label !== null && (label.classList.contains('codicon-toolbar-more') || /more actions/i.test(label.getAttribute('aria-label') ?? ''));
    return !more && item.getBoundingClientRect().width > 0;
}).length;`;

/**
 * Measures the state the driver has just reached (UX-P0.10, `measure.ts`): one `[measure]` line per rule that applies;
 * returns the names of the red `hard` rules.
 */
async function measure(state: NamedState, capture: Capture): Promise<{ red: string[]; layout: Layout; overflowHard: boolean }> {
    let viewTitleActions: number | undefined;
    if (state.surface === 'sidebar') {
        await leaveWebview();
        viewTitleActions = await script<number>(VIEW_TITLE_ACTIONS);
    }
    await (state.surface === 'main' ? enterMainWebview() : enterSidebarWebview());
    await until(NO_RUNNING_TRANSITION, 'the CSS transitions to end', 30_000);
    // A state that declares its settled truths has them re-checked here, before the collector reads (UX-P3.1b).
    const settled = REACH[state.name]?.settled;
    if (settled !== undefined) {
        await settleOrReport(state.name, settled());
    }
    const layout = { ...await script<Layout>(COLLECT_LAYOUT, state.surface === 'main' ? 'nuiget-app' : 'nuiget-sidebar', RAMP, TOLERANCES.gapMembership, TOLERANCES.containment, cellList(state.name)), viewTitleActions };
    const key = `${state.surface} ${capture.theme} ${capture.width} ${capture.look}`;
    const before = chromeReferences.get(key);
    // Measured against the reference as it stood; then an element (or first row) the reference lacked joins it.
    const reference = before === undefined ? undefined : { ...before, chrome: { ...before.chrome } };
    const red: string[] = [];
    // The look of a capture is the document's (UX-P1.3): a run whose host shows another look than its name measures nothing true.
    if (layout.root) {
        if (!lookReported) {
            console.warn(`[capture] data-look "${layout.endOfP0.dataLook}" on the document element (${state.name})`);
            lookReported = true;
        }
        if (layout.endOfP0.dataLook !== capture.look) {
            red.push(`data-look "${layout.endOfP0.dataLook}" in a ${capture.look} capture`);
        }
    }
    const lines = measureLines(state.name, layout, capture.look, workbench, reference, capture.width, specFor(state, capture), capture.theme, laneWorkbench, LANE);
    if (layout.root) {
        const merged = before ?? { state: state.name, chrome: {}, firstRow: undefined };
        for (const [name, rect] of Object.entries(layout.chrome)) {
            merged.chrome[name] ??= rect ?? undefined;
        }
        merged.firstRow ??= layout.firstRow ?? undefined;
        // DS-ROW-2 across views reads the Browse rows against these (UX-P3.2).
        if (state.name === ROW_LEFTS_REFERENCE) {
            merged.rowLefts ??= rowLeftsOf(state.name, layout);
        }
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
    return { red, layout, overflowHard: lines.some(line => line.name.startsWith('DS-OVERFLOW-6@') && line.status === 'hard') };
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
        host.chromium = chromium;
        const dpr = await script<number>('return window.devicePixelRatio;');
        const png = Buffer.from(await driverOf().takeScreenshot(), 'base64');
        console.warn(`[capture] lane ${LANE} vscode ${VSBrowser.instance.version} chromium ${chromium} ${process.platform} dpr ${dpr} look ${LOOK} window ${window.width}x${window.height} png ${pngSize(png)}`);
        // The workbench of this run, in its look (UX-P0.11): written next to the crops as workbench.<look>.json, the
        // file docs/design/workbench/<look>.json is copied from.
        const widgets = await measureWorkbench();
        for (const [name, widget] of Object.entries(widgets)) {
            console.warn(`[workbench] ${name}: ${widget === null ? 'absent' : `${widget.height} (${widget.selector})`}`);
        }
        laneWorkbench = Object.fromEntries(Object.entries(widgets).flatMap(([name, widget]) => (widget === null ? [] : [[name, widget.height]])));
        const crops = path.dirname(VSBrowser.instance.getScreenshotsDir());
        fs.mkdirSync(crops, { recursive: true });
        fs.writeFileSync(path.join(crops, `workbench.${LOOK}.json`), JSON.stringify({
            look: LOOK, lane: LANE, vscode: VSBrowser.instance.version, chromium, platform: process.platform, dpr, window: `${window.width}x${window.height}`,
            run: process.env.GITHUB_RUN_ID ?? 'local', widgets,
        }, null, 2) + '\n');
        await openSidebarView();
        await openMainPanel();
        await enterMainWebview();
        // The dense workspace's six projects, discovered across its two folders.
        await optionFor('Unsupported.csproj');
    });

    afterEach(async () => {
        await leaveWebview();
    });

    if (LANE === 'ui') {
        // First, so the captures start from the side bar width it restores. A probe that logs and goes on, as the heights
        // of the `before` do: a step that fails prints `[exemplar] <step>: <reason>` and leaves its entries out; a test of
        // its own, so its time is its own and not the `before`'s (UX-P0.14).
        it(`workbench exemplar, ${LOOK} look (UX-P0.14)`, async function () {
            this.timeout(300_000);
            const started = Date.now();
            const exemplar = await measureExemplar();
            const paint = (look: LookMeasure | null): string => (look === null ? 'absent' : `background ${look.background}, outline ${look.outline} ${look.outlineOffset}`);
            for (const [name, state] of Object.entries(exemplar.rowStates)) {
                console.warn(`[exemplar] row ${name}: ${paint(state.row)}, list focused ${state.listFocused}, classes "${state.row?.classes ?? ''}"`);
            }
            for (const label of exemplar.editor.navbarLabels) {
                const indicator = Object.entries(label.pseudo).map(([which, box]) => `::${which} ${box?.height} ${box?.background} ${box?.borderBottom}`).join(', ');
                console.warn(`[exemplar] navbar label "${label.classes}": ${label.fontSize}/${label.fontWeight} ${label.textTransform}, line ${label.lineHeight}, padding ${label.padding}, colour ${label.color}, border-bottom ${label.borderBottom}${indicator ? `, ${indicator}` : ''}`);
            }
            console.warn(`[exemplar] editor header: ${exemplar.editor.header === null ? 'absent' : `padding ${exemplar.editor.header.padding}, ${exemplar.editor.header.rect.w}x${exemplar.editor.header.rect.h}`}`);
            for (const [width, parts] of Object.entries(exemplar.sideBarWidths)) {
                console.warn(`[exemplar] side bar ${width}: viewlet "${parts.viewlet?.classes ?? ''}", row ${parts.row?.rect.h ?? 'absent'}, icon ${parts.icon === null ? 'hidden' : `${parts.icon.rect.w}x${parts.icon.rect.h}`}`);
            }
            for (const [width, parts] of Object.entries(exemplar.editorWidths)) {
                console.warn(`[exemplar] editor ${width}: header ${parts.header === null ? 'absent' : `${parts.header.rect.w}x${parts.header.rect.h} padding ${parts.header.padding}${parts.header.overflowsX ? ' overflows' : ''}`}, navbar ${parts.navbar?.rect.h ?? 'absent'}, actions ${parts.actions === null ? 'absent' : `${parts.actions.rect.w}${parts.actions.overflowsX ? ' overflow' : ''}`}`);
            }
            const { widget, separator, separatorLabel } = exemplar.layer;
            console.warn(`[exemplar] layer: ${widget === null ? 'absent' : `radius ${widget.radius}, shadow ${widget.boxShadow}, border ${widget.border}`}; separator ${separator === null ? 'absent' : separator.border}, label ${separatorLabel === null ? 'absent' : `${separatorLabel.fontSize} ${separatorLabel.textTransform} ${separatorLabel.color}`}`);
            console.warn(`[exemplar] measured in ${Math.round((Date.now() - started) / 1000)} s`);
            // Beside the heights of the run's `before`, in the file docs/design/workbench/<look>.json is copied from.
            const file = path.join(path.dirname(VSBrowser.instance.getScreenshotsDir()), `workbench.${LOOK}.json`);
            fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), exemplar }, null, 2) + '\n');
        });
    }

    for (const { state, capture } of jobs) {
        const reach = REACH[state.name];
        // The title spelled out, not captureFile(): scripts/check-regression-matrix.mjs reads a test's title from the source and keeps a template's placeholders (the matrix rows of the named states, UX-P0.29; the format is states.ts captureFile).
        it(`${state.name}.${capture.theme}${capture.look === 'classic' ? '-classic' : ''}.${capture.width}.png`, async function () {
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
            const { red, layout, overflowHard } = await measure(state, capture);
            // In the webview still (measure entered it): the masks are read before the shot moves the pointer.
            const facts = await script<CaptureFacts>(CAPTURE_FACTS, state.surface === 'main' ? 'nuiget-app' : 'nuiget-sidebar', state.masks.map(mask => ({ selector: mask.selector })), capture.width);
            // UX-P2.1a: the document as it stands immediately before the shot; a state whose DS-OVERFLOW-6 is hard fails as the rule does.
            const page = await script<{ width: number; height: number; scrollWidth: number; scrollHeight: number }>(READ_DOCUMENT);
            console.warn(`[overflow] ${captureFile(state.name, capture)}: document ${page.width}×${page.height}, scroll ${page.scrollWidth}×${page.scrollHeight}`);
            if (overflowHard && (page.scrollWidth > page.width || page.scrollHeight > page.height)) {
                red.push(`[overflow] the document scrolls before the shot: ${page.scrollWidth}×${page.scrollHeight} in ${page.width}×${page.height}`);
            }
            const virtual = await script<{ client: number; scroll: number; sizer: number; rendered: number; heights: number; items: number; scrollTop: number; clip: string; direct: string } | null>(READ_VIRTUAL);
            if (virtual !== null) {
                console.warn(`[virtual] ${captureFile(state.name, capture).replace(/\.png$/, '')}: client ${virtual.client}, scroll ${virtual.scroll}, sizer ${virtual.sizer}, rendered ${virtual.rendered} of ${virtual.items}, rendered heights ${virtual.heights}, scrollTop ${virtual.scrollTop}, clip y ${virtual.clip}, direct header y ${virtual.direct}`);
            }
            // DS-TYPE-10 (UX-P3.fix-4): the side bar's text lines under the same settle, read in the crop after the shot.
            const textLines = state.surface === 'sidebar' && LANE === 'ui' ? await script<TextLine[]>(COLLECT_TEXT_LINES, 'nuiget-sidebar') : undefined;
            const shot = await shoot(state, capture);
            writeSidecar(state, capture, facts);
            probeScrollbar(state, capture, layout, shot);
            if (textLines !== undefined) {
                // Once per pass, before the first sidebar cell is judged: the side bar's own title in that cell's window
                // screenshot (opening ruling DO 9, follow-up 3 DO 1-2); on Linux in the ui lane a host not drawing LCD is red.
                if (hostReading === undefined) {
                    hostReading = await hostFringe(shot.png, shot.dpr);
                    const guard = hostGuard(hostReading, process.platform, LANE);
                    if (guard !== undefined) {
                        console.warn(guard);
                        red.push(guard);
                    }
                }
                const cell = captureFile(state.name, capture);
                const fringe = fringeOf(cell.replace(/\.png$/, ''), path.join(path.dirname(VSBrowser.instance.getScreenshotsDir()), cell), textLines, shot.dpr, hostReading);
                console.warn(fringe.text);
                for (const line of pixelRuleLines(state.name, capture.width, capture.theme, LANE, fringe.result === undefined ? {} : { 'DS-TYPE-10': fringe.result })) {
                    const text = formatLine(line);
                    console.warn(text);
                    if (line.status !== 'hard') {
                        pendingLines.push(text);
                    } else if (!line.pass) {
                        red.push(`${line.name}: ${line.value}`);
                    }
                }
            }
            // Once per state in the `ui` lane, after the PNG and before the setup's layer closes.
            const inaccessible = LANE === 'ui' && !audited.has(state.name) ? await auditSafely(state) : [];
            audited.add(state.name);
            if (reach.leave) {
                await (state.surface === 'main' ? enterMainWebview() : enterSidebarWebview());
                await reach.leave();
            }
            // The PNG is written first: a red hard rule leaves its evidence.
            if (red.length > 0) {
                throw new Error(`hard measurement red: ${red.join('; ')}`);
            }
            if (inaccessible.length > 0) {
                throw new Error(`axe (a11y-full-axe-real-page): ${inaccessible.join('; ')}`);
            }
        });
    }

    if (LANE === 'ui' && LOOK === 'modern') {
        // UX-P0.24 (H48): the keyboard paths of interaction model §5, each screen from scratch in Dark Modern at its default
        // width; a key that writes on today's tree (Enter on a main Updates row, Enter or Delete on a sidebar or Installed row,
        // Ctrl+Enter, Confirm) is never pressed. Before the theme dump, after every capture.
        it('keyboard paths: main panel, Installed (UX-P0.24)', async function () {
            this.timeout(300_000);
            await applyTheme('dark-modern');
            await applyWidth(stateNamed('main-installed-single'), PANEL_WIDTH);
            await freshMainPanel();
            // The motion check, once per run, while the panel's first list is still loading (H87; pending P4.5).
            const motion = motionLines('main panel at open', await script<MotionFacts>(RUNNING_ANIMATIONS));
            printLines(motion.lines);
            await gatewayInstalled();
            await walkScreen('main-installed', 'nuiget-app', 'search-input', async () => [...await rowKeys('main-installed', 'installed-list', 'search-input', 'press'), ...await dialogKeys()]);
            if (MOTION_STATUS === 'hard' && motion.failures.length > 0) {
                throw new Error(`[motion] ${motion.failures.join('; ')}`);
            }
        });

        it('keyboard paths: main panel, Updates (UX-P0.24)', async function () {
            this.timeout(300_000);
            await applyTheme('dark-modern');
            await applyWidth(stateNamed('main-updates'), PANEL_WIDTH);
            await freshMainPanel();
            await REACH['main-updates'].reach();
            await walkScreen('main-updates', 'nuiget-app', 'search-input', () => rowKeys('main-updates', 'updates-list', 'search-input', { skipped: 'Enter updates the package on today\'s tree (A1)' }));
        });

        it('keyboard paths: main panel, Browse (UX-P0.24)', async function () {
            this.timeout(300_000);
            await applyTheme('dark-modern');
            await applyWidth(stateNamed('main-browse-results'), PANEL_WIDTH);
            await freshMainPanel();
            await REACH['main-browse-results'].reach();
            await walkScreen('main-browse', 'nuiget-app', 'search-input', () => rowKeys('main-browse', 'browse-list', 'search-input', 'press'));
        });

        it('keyboard paths: sidebar (UX-P0.24)', async function () {
            this.timeout(300_000);
            await applyTheme('dark-modern');
            await applyWidth(stateNamed('sidebar-sections'), SIDEBAR_WIDTH);
            await sidebarSections();
            await walkScreen('sidebar', 'nuiget-sidebar', 'sidebar-search-input', () => rowKeys('sidebar', 'sidebar-installed-list', 'sidebar-search-input', { skipped: 'Enter uninstalls the package on today\'s tree (A2, R127)' }));
        });

        // UX-P0.26 (H57–H59): informational `[perf]` lines, timed in page; after the walks, so no capture's data state
        // moves, and before the theme dump, which reuses the panel in Dark Modern. Nothing is written or confirmed.
        it('in-page timings (UX-P0.26)', async function () {
            // Above the sum of the chains' waits (540 s), so a mark never stamped prints `not measured` and fails nothing.
            this.timeout(900_000);
            await applyTheme('dark-modern');
            await applyWidth(stateNamed('main-installed-single'), PANEL_WIDTH);
            await freshMainPanel();
            // Gateway is the session's project, and its lists are settled, before the panel is opened again.
            await gatewayInstalled();
            await perfStep(PANEL_OPEN.label, async () => {
                await openMainPanelTimed(PANEL_OPEN);
                await finishChain(PANEL_OPEN, 60_000);
            });
            await perfStep(REFRESH.label, async () => {
                await enterMainWebview();
                await timeChain(REFRESH, async () => (await findByTestId('refresh-button', 30_000)).click());
            });
            await perfStep(PROJECT_CHOSEN.label, async () => {
                await enterMainWebview();
                const utility = await optionFor('Utility.csproj');
                await timeChain(PROJECT_CHOSEN, () => chooseProject(utility), 120_000);
            });
            await perfStep(SELECT.label, async () => {
                await enterMainWebview();
                await scrollListTo('installed-list', `package-row-${DETAILS_ID}`);
                await timeChain(SELECT, async () => (await optionOf(`package-row-${DETAILS_ID}`, 30_000)).click());
            });
            for (const label of ['search', 'search again'] as const) {
                const chain = searchChain(label);
                await perfStep(chain.label, async () => {
                    await enterMainWebview();
                    await clearSearch();
                    await typeInSearch(SEARCH_TEXT);
                    await waitForTestIdGone('tab-bar', 10_000);
                    const box = await findByTestId('search-input', 10_000);
                    await timeChain(chain, () => box.sendKeys(Key.ENTER), 120_000);
                });
            }
            // Back to the panel the captures left: no search, Gateway.
            try {
                await enterMainWebview();
                await clearSearch();
                await chooseFixtureProject('Gateway.csproj');
            } catch (error) {
                console.warn(`[perf] the panel was not restored: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }

    if (LANE === 'ui') {
        // Last, so the captures above keep their theme order.
        it(`theme dump, six themes, ${LOOK} look (UX-P0.14)`, async function () {
            this.timeout(600_000);
            const names = declaredTokens(fs.readFileSync(path.resolve('src/webview/shared/tokens.css'), 'utf8'));
            const dir = path.join(path.dirname(VSBrowser.instance.getScreenshotsDir()), 'themes');
            fs.mkdirSync(dir, { recursive: true });
            const provenance = {
                look: LOOK, vscode: VSBrowser.instance.version, platform: process.platform,
                run: process.env.GITHUB_RUN_ID ?? 'local', date: new Date().toISOString().slice(0, 10),
            };
            const started = Date.now();
            for (const theme of MATRIX_THEMES) {
                await applyTheme(theme);
                // A colour read during a transition is a mix of two themes (the gotcha of theme.ui.test.ts).
                await until(NO_RUNNING_TRANSITION, 'the colour transitions to end', 30_000);
                const dump = await script<ThemeDump>(DUMP_THEME, names);
                const unresolved = names.filter(name => dump.tokens[name] === '');
                fs.writeFileSync(path.join(dir, themeDumpFile(theme, LOOK)), formatThemeDump(THEMES[theme].labels[0], dump, provenance));
                fs.writeFileSync(path.join(dir, tokenDumpFile(theme, LOOK)), formatTokenDump(THEMES[theme].labels[0], dump, provenance));
                console.warn(`[theme] ${themeDumpFile(theme, LOOK)}: ${Object.keys(dump.vars).length} --vscode-* properties, ${names.length - unresolved.length}/${names.length} --nuiget-* tokens resolved${unresolved.length > 0 ? ` (empty: ${unresolved.join(', ')})` : ''}; body "${dump.bodyClass}", theme name "${dump.themeName ?? ''}"`);
            }
            console.warn(`[theme] six themes in ${Math.round((Date.now() - started) / 1000)} s`);
            // The artboard export runs next in the same window, in the theme the captures started in.
            await applyTheme('dark-modern');
            await leaveWebview();
        });
    }

    // UX-P2.9b: the menu is the workbench's, read from the top document; on Linux with the custom title bar it is HTML (ruling).
    // Last in the suite: a right-click makes its row the list's current row and tab stop, which the sidebar's walk reads.
    if ((LANE === 'ui' && LOOK === 'modern') || LANE === 'floor') {
        it('the row menu opens on right-click and Shift+F10 (UX-P2.9b)', async function () {
            this.timeout(240_000);
            if (process.platform !== 'linux') {
                console.warn(`[menu] ${LANE}: not read on ${process.platform}: a native menu cannot be read or closed from the suite`);
                return;
            }
            const manifest = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as { contributes: { commands: Array<{ command: string; title: string }> } };
            const titleOf = (name: string): string => manifest.contributes.commands.find(entry => entry.command === `nuiget.row.${name}`)?.title ?? name;
            const expected = ['changeVersion', 'uninstall', 'copyId', 'viewDetails'].map(titleOf).join(', ');
            const read = async (where: string, enter: () => Promise<void>, open: () => Promise<void>): Promise<void> => {
                await open();
                await until('document.body.classList.contains("vscode-context-menu-visible")', `the menu of ${where} visible`, 15_000);
                await leaveWebview();
                const labels = await poll(async () => {
                    const found = await script<string[]>('return [...document.querySelectorAll(".context-view .monaco-menu .action-label")].map(label => label.textContent.trim()).filter(Boolean);');
                    return found.length > 0 ? found : undefined;
                }, `the labels of ${where}`, 15_000);
                console.warn(`[menu] ${LANE} ${where}: ${labels.join(', ')}`);
                // Closed from where the keyboard is: the menu in the top document, which has the focus; never by an item.
                await poll(async () => {
                    const menus = await driverOf().findElements(By.css('.context-view .monaco-menu'));
                    if (menus.length === 0) {
                        return true;
                    }
                    await menus[0].sendKeys(Key.ESCAPE);
                    return undefined;
                }, `the menu of ${where} closed`, 15_000);
                await enter();
                if (labels.join(', ') !== expected) {
                    throw new Error(`[menu] ${where}: ${labels.join(', ')}; expected ${expected}`);
                }
            };
            await freshMainPanel();
            await gatewayInstalled();
            const row = 'package-row-newtonsoft.json';
            await read('right-click', enterMainWebview, async () => driverOf().actions().contextClick(await optionOf(row)).perform());
            await read('Shift+F10', enterMainWebview, async () => {
                await (await optionOf(row)).click();
                await (await driverOf().switchTo().activeElement()).sendKeys(Key.chord(Key.SHIFT, Key.F10));
            });
            if (LANE === 'ui') {
                await leaveWebview();
                await openSidebarView();
                await enterSidebarWebview();
                await read('sidebar right-click', enterSidebarWebview, async () => driverOf().actions().contextClick(await optionOf('package-row-serilog')).perform());
            }
            await leaveWebview();
        });
    }

    after(() => {
        if (!scrollbarProbed) {
            console.warn('[probe] scrollbar: no capture of this run had a list that scrolls');
        }
        // The pending list (plan §2.7): the rules each pending item flips, at the end of the run.
        console.warn(`[measure] pending list: ${pendingLines.length} lines`);
        for (const line of pendingLines) {
            console.warn(line);
        }
    });
});

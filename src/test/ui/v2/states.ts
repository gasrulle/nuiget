/**
 * The one list of named states (UX-P0.8; plan D33, H20, H77, X41). A Tier A name denotes the dense workspace
 * (`src/test/ui/fixtures/dense-workspace/dense.code-workspace`) and the `setup` written here; the capture suite
 * (`capture/capture.ui.test.ts`) reaches each `ready` state, waits for its readiness predicate and writes the webview
 * crop as `<state>.<theme>.<width>.png` (theme part `<theme>-classic` for the classic look) at the root of the
 * screenshots folder, the `ui-screenshots` artifact. A state whose markers no item renders yet is `{ pending: '<item>' }`:
 * it is printed `[capture] <state>: not captured (pending <item>)` and never captured; only that item makes it `ready`
 * (plan §2.7). The v2 suites still save window PNGs of the 2.0 set on the e2e workspace in ExTester's timestamp
 * folder (`LEGACY_STATES`); they never write a file at the root.
 *
 * Plain data on purpose: `src/test/lint/named-states.test.ts` imports it without ExTester.
 */

export type Theme = 'dark-modern' | 'light-modern' | 'dark-high-contrast' | 'light-high-contrast' | 'dark-2026' | 'light-2026';

/**
 * The built-in themes the captures use, by the labels of the Color Theme picker (newest VS Code first, as
 * `theme.ui.test.ts` lists them), the body class VS Code gives the webviews, and the order a run visits them in.
 * The body's `data-vscode-theme-name` is one of the labels: the 2026 themes share their body class with Modern.
 */
export const THEMES: Readonly<Record<Theme, { labels: readonly string[]; bodyClass: string }>> = {
    'dark-modern': { labels: ['Dark Modern', 'Default Dark Modern'], bodyClass: 'vscode-dark' },
    'light-modern': { labels: ['Light Modern', 'Default Light Modern'], bodyClass: 'vscode-light' },
    'dark-high-contrast': { labels: ['Dark High Contrast', 'Default High Contrast'], bodyClass: 'vscode-high-contrast' },
    'light-high-contrast': { labels: ['Light High Contrast', 'Default High Contrast Light'], bodyClass: 'vscode-high-contrast-light' },
    'dark-2026': { labels: ['Dark 2026'], bodyClass: 'vscode-dark' },
    'light-2026': { labels: ['Light 2026'], bodyClass: 'vscode-light' },
};

/** The six shards of the Tier B matrix (`ui-matrix` in `ci.yml`), one theme each. */
export const MATRIX_THEMES: readonly Theme[] = ['dark-modern', 'light-modern', 'dark-high-contrast', 'light-high-contrast', 'dark-2026', 'light-2026'];

/**
 * The lanes of the capture suite (`NUIGET_UI_LANE`): the per-push `ui` job (unset), the Tier B matrix, the VS Code
 * 1.90.0 floor and macOS, the last three on `workflow_dispatch` only (UX-P0.9).
 */
export type Lane = 'ui' | 'matrix' | 'floor' | 'macos';
export type Look = 'modern' | 'classic';
export type Surface = 'main' | 'sidebar';
export type Tier = 'A' | 'B' | 'marketing' | 'hero';
export type StateStatus = 'ready' | { pending: string };

/** One PNG of a state: the theme, the look and the width of its surface (the main panel or the side bar), in CSS px. */
export interface Capture {
    theme: Theme;
    look: Look;
    width: number;
}

/** A live region that a pixel diff (UX-P0.15) leaves out, by selector inside the webview. */
export interface Mask {
    selector: string;
    reason: string;
}

export interface NamedState {
    name: string;
    surface: Surface;
    tier: Tier;
    captures: readonly Capture[];
    /** How the capture suite reaches the state and the predicate it waits for before the screenshot. */
    setup: string;
    masks: readonly Mask[];
    status: StateStatus;
    /**
     * The share of a crop's pixels the pixel diff may find different from its golden, in percent (UX-P0.15):
     * `DIFF_TOLERANCE_START` to start, 0 once the state's live regions are masked.
     */
    diffTolerance: number;
}

/** A state's pixel-diff tolerance until its live regions are masked, in percent of the crop (plan P0.15). */
export const DIFF_TOLERANCE_START = 0.5;

/** The surface widths of a Tier A capture unless a state names others (plan P0.8). */
export const PANEL_WIDTH = 1200;
export const SIDEBAR_WIDTH = 300;

/** The widths of a Tier B capture, per surface (plan P0.9). */
export const PANEL_WIDTHS: readonly number[] = [800, 1200, 1600];
export const SIDEBAR_WIDTHS: readonly number[] = [200, 300, 400];

const primary = (surface: Surface): Capture => ({ theme: 'dark-modern', look: 'modern', width: surface === 'main' ? PANEL_WIDTH : SIDEBAR_WIDTH });

/** The theme-sensitive subset (selection, focus, badges, section headers, details): Light Modern, Dark High Contrast and one classic pass. */
const themeSensitive = (surface: Surface): Capture[] => {
    const base = primary(surface);
    return [base, { ...base, theme: 'light-modern' }, { ...base, theme: 'dark-high-contrast' }, { ...base, look: 'classic' }];
};

const ready = (name: string, surface: Surface, captures: Capture[], setup: string, masks: Mask[] = []): NamedState =>
    ({ name, surface, tier: 'A', captures, setup, masks, status: 'ready', diffTolerance: DIFF_TOLERANCE_START });

const pending = (name: string, surface: Surface, item: string, setup: string): NamedState =>
    ({ name, surface, tier: 'A', captures: [primary(surface)], setup, masks: [], status: { pending: item }, diffTolerance: DIFF_TOLERANCE_START });

/** Live nuget.org content (download counts, newest versions, descriptions) that differs between runs. */
const LIVE_RESULTS: Mask = { selector: '[data-testid="browse-list"]', reason: 'nuget.org search results change between runs' };
const LIVE_DETAILS: Mask = { selector: '[data-testid="package-details-panel"]', reason: 'nuget.org metadata (downloads, versions) changes between runs' };
const LIVE_SUGGESTIONS: Mask = { selector: '[data-testid="search-suggestions"]', reason: 'nuget.org suggestions change between runs' };
/** The search box of a state whose setup leaves the focus in it (UX-P0.15, design-advisor ruling). */
const LIVE_CARET: Mask = { selector: '[data-testid="search-input"]', reason: 'the caret blinks and the selection differs between runs (H27)' };
/** The package icon of every comfortable row (UX-P0.15, design-advisor ruling of CI run 40097664968). */
const LIVE_ICONS: Mask = { selector: '.nuiget-row-icon', reason: 'nuget.org icons are resolved by the host per run: the breaker race (X2, V31; P7.1) and any failed fetch leave the default icon, so which rows show one differs between runs' };
/**
 * The side bar's Updates list and the Update-all dialog's list show the newest versions on nuget.org, as `main-updates`'
 * list does: masked whole, since a version of another length moves the name's ellipsis point (UX-P0.fix-2, P0 phase review).
 */
const LIVE_SIDEBAR_UPDATES: Mask = { selector: '[data-testid="sidebar-updates-list"]', reason: 'the newest versions on nuget.org change' };
const LIVE_BULK_LIST: Mask = { selector: '.nuiget-sidebar-bulk-list', reason: 'the dialog lists the newest versions on nuget.org' };
/** The versions level's `‹ <id>` header above the suggestions (UX-P0.15, design-advisor ruling of CI run 40097664968). */
const LIVE_POPUP_HEADER: Mask = { selector: '.nuiget-search-popup-header', reason: 'the popup text renders with greyscale or subpixel anti-aliasing from run to run (H27, corrected); the options are under LIVE_SUGGESTIONS' };

/**
 * A state at 0 px on a run and its rerun of one SHA compares with a zero `diffTolerance` (UX-P0.15, CI run 40097664968 and its
 * UI rerun; `main-installed-all` from UX-P2.1a, run 41140772255 and its UI rerun).
 */
export const STATES: readonly NamedState[] = [
    { ...ready('main-installed-single', 'main', [
        ...themeSensitive('main'),
        { theme: 'dark-modern', look: 'modern', width: 932 },
        { theme: 'dark-modern', look: 'classic', width: 932 },
        { theme: 'dark-modern', look: 'modern', width: 800 },
        // The narrow widths of DS-ROW-6, DS-OVERFLOW-1 and DS-OVERFLOW-3, down to the editor's 220 px minimum (UX-P0.14).
        { theme: 'dark-modern', look: 'modern', width: 600 },
        { theme: 'dark-modern', look: 'modern', width: 400 },
        { theme: 'dark-modern', look: 'modern', width: 220 },
    ], 'Gateway selected; the Installed list shows its direct rows (package-row-newtonsoft.json present).', [LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-installed-all', 'main', themeSensitive('main'),
        'All Projects selected; four project sections, the Unsupported section header shows "Unsupported" and "provisional". The provisional badge is the Unsupported project\'s permanent one (an SDK-8 project is never evaluated), not the SDK-10 provisional window.', [LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-installed-unsupported', 'main', [primary('main')],
        'Unsupported selected; the Unsupported banner, the read-only list and both header badges; the transitive header shows its count and framework badge (the prefetch settled).', [LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-installed-cpm', 'main', [primary('main')],
        'Catalog selected (Central Package Management); its rows are listed (package-row-mapster present); the transitive header shows its count and framework badge (the prefetch settled).', [LIVE_ICONS]), diffTolerance: 0 },
    // DS-OVERFLOW-5's split at 400 px: at the editor's 220 px minimum the setup cannot select a row in the 77 px list pane
    // (V50; UX-P0.14 design-advisor ruling).
    { ...ready('main-installed-details', 'main', [...themeSensitive('main'), { theme: 'dark-modern', look: 'modern', width: 400 }],
        'Gateway selected, Newtonsoft.Json 12.0.1 (an update exists) made current; the details panel shows "Dependencies".', [LIVE_DETAILS, LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-installed-filter', 'main', [primary('main')],
        'Gateway selected, "@installed Microsoft.Extensions" in the search box; every listed option is a Microsoft.Extensions id.', [LIVE_CARET, LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-installed-filter-nomatch', 'main', [primary('main')],
        'Gateway selected, "@installed zz-no-such-package" in the search box; the list has no option and says "No installed package matches".', [LIVE_CARET]), diffTolerance: 0 },
    { ...ready('main-installed-hover', 'main', [primary('main')],
        'Gateway selected, the pointer on the Serilog row; the row matches :hover.', [LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-installed-toolbar-hover', 'main', [primary('main')],
        'Gateway selected, the Select all button under the pointer (DS-COLOR-7).', [LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-installed-refresh-hover', 'main', [primary('main')],
        'Gateway selected, the header\'s Refresh button under the pointer (DS-COLOR-3).', [LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-installed-focus', 'main', themeSensitive('main'),
        'Gateway selected, the list reached from the keyboard; the active option matches :focus-visible.', [LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-installed-unfocused', 'main', [primary('main')],
        'Gateway selected, a row selected, then the focus in the search box; document.activeElement is outside the list and a row is aria-selected.', [LIVE_CARET, LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-installed-bulk-dialog', 'main', [primary('main')],
        'Gateway selected, one row in the bulk selection, Uninstall selected pressed; the confirm dialog is open and is cancelled after the capture, never confirmed.', [LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-transitive-expanded', 'main', [primary('main')],
        'Gateway selected, the Transitive group row expanded; its rows are rendered below the crop\'s edge, PF-2\'s picture.', [LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-transitive-details', 'main', [primary('main')],
        'Gateway selected, a transitive row made current; the details panel shows its id.', [LIVE_DETAILS, LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('main-updates', 'main', [primary('main')],
        'Gateway selected, the Updates tab; its list has rows.', [{ selector: '[data-testid="updates-list"]', reason: 'the newest versions on nuget.org change' }]), diffTolerance: 0 },
    { ...ready('main-browse-results', 'main', [primary('main')],
        '"Newtonsoft.Json" searched with Enter; the Browse list shows package-row-newtonsoft.json.', [LIVE_RESULTS, LIVE_CARET]), diffTolerance: 0 },
    { ...ready('main-browse-details', 'main', [primary('main')],
        'The Newtonsoft.Json Browse row made current; the details panel shows "Dependencies".', [LIVE_RESULTS, LIVE_DETAILS]), diffTolerance: 0 },
    { ...ready('main-quicksearch-open', 'main', [primary('main')],
        '"Serilog" typed in the search box; the suggestions have an enabled option.', [LIVE_SUGGESTIONS, LIVE_CARET]), diffTolerance: 0 },
    { ...ready('main-quicksearch-versions', 'main', [primary('main')],
        'The first suggestion opened with ArrowRight; the versions level is listed.', [LIVE_SUGGESTIONS, LIVE_CARET, LIVE_POPUP_HEADER]), diffTolerance: 0 },
    { ...ready('main-details-readme', 'main', [primary('main')],
        'Gateway selected, Newtonsoft.Json made current, the README tab; the README or its empty state is shown.', [LIVE_DETAILS, LIVE_ICONS]), diffTolerance: 0 },
    { ...ready('sidebar-sections', 'sidebar', [
        ...themeSensitive('sidebar'),
        { theme: 'dark-modern', look: 'modern', width: 250 },
        { theme: 'dark-modern', look: 'modern', width: 170 },
    ], 'The nUIget side bar view with Gateway selected; the Installed section lists package-row-serilog and the Updates section has a row.', [LIVE_SIDEBAR_UPDATES]), diffTolerance: 0 },
    { ...ready('sidebar-narrow-200px', 'sidebar', [{ theme: 'dark-modern', look: 'modern', width: 200 }],
        'The side bar at 200 px with Gateway selected; both sections keep their rows.', [LIVE_SIDEBAR_UPDATES]), diffTolerance: 0 },
    { ...ready('sidebar-update-all-dialog', 'sidebar', [primary('sidebar')],
        'Gateway selected, Update all pressed in the Updates section header; the confirmation is open and is cancelled after the capture, never confirmed.', [LIVE_SIDEBAR_UPDATES, LIVE_BULK_LIST]), diffTolerance: 0 },
    pending('main-installed-loading', 'main', 'P2.8b', 'The first list loading: skeleton rows and the 2 px bar (marker installed-progress).'),
    pending('main-installed-revalidating', 'main', 'P2.8b', 'A shown list revalidating under the 2 px bar.'),
    pending('main-installed-empty', 'main', 'P2.8b', 'A project without packages: the welcome-style "No packages installed." (marker installed-empty).'),
    pending('main-installed-error', 'main', 'P2.8b', 'The installed read failed: the inline error with Retry (marker installed-error).'),
    pending('main-installed-unresolved', 'main', 'P2.8b', 'A reference whose version cannot be told: the row says unresolved.'),
    pending('main-updates-unavailable', 'main', 'P3.1b', 'No source answered the update check: the unavailable banner.'),
    pending('main-browse-unavailable', 'main', 'P3.10', 'No source answered the search: the unavailable banner.'),
    pending('sidebar-updates-unavailable', 'sidebar', 'P3.10', 'No source answered the update check: the sidebar banner.'),
    pending('sidebar-browse-unavailable', 'sidebar', 'P3.10', 'No source answered the search: the sidebar banner.'),
];

/**
 * The 2.0 set that the v2 suites save as window PNGs on the e2e workspace (`screenshot()` in `sidebarWebview.ts`),
 * under ExTester's timestamp folder; CI requires every one of them so none is dropped.
 */
export const LEGACY_STATES = [
    'main-installed-single',
    'main-installed-single-light',
    'main-installed-single-hc',
    'main-installed-all',
    'main-transitive-expanded',
    'main-transitive-details',
    'main-updates',
    'main-browse-results',
    'main-browse-details',
    'main-quicksearch-open',
    'main-quicksearch-versions',
    'main-details-readme',
    'sidebar-sections',
    'sidebar-update-all-dialog',
    'sidebar-narrow-200px',
] as const;

export type LegacyState = (typeof LEGACY_STATES)[number];

/** The file name of one capture: `<state>.<theme>.<width>.png`, `<theme>-classic` for the classic look. */
export function captureFile(state: string, capture: Capture): string {
    return `${state}.${capture.theme}${capture.look === 'classic' ? '-classic' : ''}.${capture.width}.png`;
}

export const isReady = (state: NamedState): boolean => state.status === 'ready';

/** Every PNG the capture runs of `look` must write, in state order. */
export function expectedFiles(look?: Look): string[] {
    return STATES.filter(isReady).flatMap(state => state.captures
        .filter(capture => look === undefined || capture.look === look)
        .map(capture => captureFile(state.name, capture)));
}

/**
 * What CI's step "Check the named screenshots" fails for, given the PNG names at the root of the screenshots folder
 * (`root`) and in its timestamp folders (`nested`): a missing crop of a ready state, a crop of a pending state, and a
 * state of the 2.0 set without its window PNG.
 */
export function screenshotProblems(root: Iterable<string>, nested: Iterable<string>): string[] {
    const crops = new Set(root);
    const windows = new Set(nested);
    const problems = expectedFiles().filter(file => !crops.has(file)).map(file => `no capture ${file}`);
    for (const state of STATES.filter(entry => !isReady(entry))) {
        for (const file of crops) {
            if (file.startsWith(`${state.name}.`)) {
                problems.push(`a capture of the pending state ${state.name}: ${file}`);
            }
        }
    }
    for (const state of LEGACY_STATES) {
        if (!windows.has(`${state}.png`)) {
            problems.push(`no window PNG of the 2.0 state ${state}`);
        }
    }
    return problems;
}

/** The width a state's name fixes (`sidebar-narrow-200px`), or undefined. */
const namedWidth = (state: NamedState): number | undefined => {
    const match = /-(\d+)px$/.exec(state.name);
    return match ? Number(match[1]) : undefined;
};

/**
 * One Tier B shard: every ready state of tier A or B at each width of its surface (a state whose name fixes a width at
 * that width only), in `theme`, Modern UI.
 */
export function matrixCaptures(theme: Theme): Array<{ state: NamedState; capture: Capture }> {
    // A secondary button's hover equals its rest in high contrast and an icon button's hover fill is transparent there (the
    // dashed line is P3.9's): the two hover states have no subject there (DS-COLOR-7, DS-COLOR-3).
    const shown = (state: NamedState) => !((state.name === 'main-installed-toolbar-hover' || state.name === 'main-installed-refresh-hover') && theme.includes('high-contrast'));
    return STATES.filter(state => isReady(state) && (state.tier === 'A' || state.tier === 'B') && shown(state)).flatMap(state => {
        const fixed = namedWidth(state);
        const widths = fixed !== undefined ? [fixed] : state.surface === 'main' ? PANEL_WIDTHS : SIDEBAR_WIDTHS;
        return widths.map(width => ({ state, capture: { theme, look: 'modern' as const, width } }));
    });
}

/** The floor lane (VS Code 1.90.0, which has no Modern UI): every Tier A (theme, width) of a ready state, classic. */
export function floorCaptures(): Array<{ state: NamedState; capture: Capture }> {
    return STATES.filter(state => isReady(state) && state.tier === 'A').flatMap(state => {
        const seen = new Set<string>();
        return state.captures.flatMap(capture => {
            const key = `${capture.theme}.${capture.width}`;
            if (seen.has(key)) {
                return [];
            }
            seen.add(key);
            return [{ state, capture: { ...capture, look: 'classic' as const } }];
        });
    });
}

/** The crops a lane must write: `theme` names the matrix shard. */
export function laneFiles(lane: Lane, theme?: Theme): string[] {
    const jobs = lane === 'matrix'
        ? matrixCaptures(theme ?? 'dark-modern')
        : lane === 'floor'
            ? floorCaptures()
            : STATES.filter(isReady).flatMap(state => state.captures.map(capture => ({ state, capture })));
    return jobs.map(({ state, capture }) => captureFile(state.name, capture));
}

/** What a lane's check step fails for: a missing crop, an extra crop and a crop of a pending state. */
export function laneProblems(root: Iterable<string>, lane: Lane, theme?: Theme): string[] {
    const expected = new Set(laneFiles(lane, theme));
    const crops = [...root];
    const problems = [...expected].filter(file => !crops.includes(file)).map(file => `no capture ${file}`);
    for (const file of crops) {
        if (!expected.has(file)) {
            const pendingState = STATES.find(state => !isReady(state) && file.startsWith(`${state.name}.`));
            problems.push(pendingState ? `a capture of the pending state ${pendingState.name}: ${file}` : `an unexpected capture ${file}`);
        }
    }
    return problems;
}

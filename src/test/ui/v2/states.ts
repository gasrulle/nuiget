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

export type Theme = 'dark-modern' | 'light-modern' | 'dark-high-contrast';
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
}

/** The surface widths of a Tier A capture unless a state names others (plan P0.8). */
export const PANEL_WIDTH = 1200;
export const SIDEBAR_WIDTH = 300;

const primary = (surface: Surface): Capture => ({ theme: 'dark-modern', look: 'modern', width: surface === 'main' ? PANEL_WIDTH : SIDEBAR_WIDTH });

/** The theme-sensitive subset (selection, focus, badges, section headers, details): Light Modern, Dark High Contrast and one classic pass. */
const themeSensitive = (surface: Surface): Capture[] => {
    const base = primary(surface);
    return [base, { ...base, theme: 'light-modern' }, { ...base, theme: 'dark-high-contrast' }, { ...base, look: 'classic' }];
};

const ready = (name: string, surface: Surface, captures: Capture[], setup: string, masks: Mask[] = []): NamedState =>
    ({ name, surface, tier: 'A', captures, setup, masks, status: 'ready' });

const pending = (name: string, surface: Surface, item: string, setup: string): NamedState =>
    ({ name, surface, tier: 'A', captures: [primary(surface)], setup, masks: [], status: { pending: item } });

/** Live nuget.org content (download counts, newest versions, descriptions) that differs between runs. */
const LIVE_RESULTS: Mask = { selector: '[data-testid="browse-list"]', reason: 'nuget.org search results change between runs' };
const LIVE_DETAILS: Mask = { selector: '[data-testid="package-details-panel"]', reason: 'nuget.org metadata (downloads, versions) changes between runs' };
const LIVE_SUGGESTIONS: Mask = { selector: '[data-testid="search-suggestions"]', reason: 'nuget.org suggestions change between runs' };

export const STATES: readonly NamedState[] = [
    ready('main-installed-single', 'main', [
        ...themeSensitive('main'),
        { theme: 'dark-modern', look: 'modern', width: 932 },
        { theme: 'dark-modern', look: 'classic', width: 932 },
        { theme: 'dark-modern', look: 'modern', width: 800 },
    ], 'Gateway selected; the Installed list shows its direct rows (package-row-newtonsoft.json present).'),
    ready('main-installed-all', 'main', themeSensitive('main'),
        'All Projects selected; four project sections, the Unsupported section header shows "Unsupported" and "provisional". The provisional badge is the Unsupported project\'s permanent one (an SDK-8 project is never evaluated), not the SDK-10 provisional window.'),
    ready('main-installed-unsupported', 'main', [primary('main')],
        'Unsupported selected; the Unsupported banner, the read-only list and both header badges.'),
    ready('main-installed-cpm', 'main', [primary('main')],
        'Catalog selected (Central Package Management); its rows are listed (package-row-mapster present).'),
    ready('main-installed-details', 'main', themeSensitive('main'),
        'Gateway selected, Newtonsoft.Json 12.0.1 (an update exists) made current; the details panel shows "Dependencies".', [LIVE_DETAILS]),
    ready('main-installed-filter', 'main', [primary('main')],
        'Gateway selected, "@installed Microsoft.Extensions" in the search box; every listed option is a Microsoft.Extensions id.'),
    ready('main-installed-filter-nomatch', 'main', [primary('main')],
        'Gateway selected, "@installed zz-no-such-package" in the search box; the list has no option and says "No installed package matches".'),
    ready('main-installed-hover', 'main', [primary('main')],
        'Gateway selected, the pointer on the Serilog row; the row matches :hover.'),
    ready('main-installed-focus', 'main', themeSensitive('main'),
        'Gateway selected, the list reached from the keyboard; the active option matches :focus-visible.'),
    ready('main-installed-unfocused', 'main', [primary('main')],
        'Gateway selected, a row selected, then the focus in the search box; document.activeElement is outside the list and a row is aria-selected.'),
    ready('main-installed-bulk-dialog', 'main', [primary('main')],
        'Gateway selected, one row in the bulk selection, Uninstall selected pressed; the confirm dialog is open and is cancelled after the capture, never confirmed.'),
    ready('main-transitive-expanded', 'main', [primary('main')],
        'Gateway selected, the transitive section expanded; its list has rows.'),
    ready('main-transitive-details', 'main', [primary('main')],
        'Gateway selected, a transitive row made current; the details panel shows its id.', [LIVE_DETAILS]),
    ready('main-updates', 'main', [primary('main')],
        'Gateway selected, the Updates tab; its list has rows.', [{ selector: '[data-testid="updates-list"]', reason: 'the newest versions on nuget.org change' }]),
    ready('main-browse-results', 'main', [primary('main')],
        '"Newtonsoft.Json" searched with Enter; the Browse list shows package-row-newtonsoft.json.', [LIVE_RESULTS]),
    ready('main-browse-details', 'main', [primary('main')],
        'The Newtonsoft.Json Browse row made current; the details panel shows "Dependencies".', [LIVE_RESULTS, LIVE_DETAILS]),
    ready('main-quicksearch-open', 'main', [primary('main')],
        '"Serilog" typed in the search box; the suggestions have an enabled option.', [LIVE_SUGGESTIONS]),
    ready('main-quicksearch-versions', 'main', [primary('main')],
        'The first suggestion opened with ArrowRight; the versions level is listed.', [LIVE_SUGGESTIONS]),
    ready('main-details-readme', 'main', [primary('main')],
        'Gateway selected, Newtonsoft.Json made current, the README tab; the README or its empty state is shown.', [LIVE_DETAILS]),
    ready('sidebar-sections', 'sidebar', [
        ...themeSensitive('sidebar'),
        { theme: 'dark-modern', look: 'modern', width: 250 },
        { theme: 'dark-modern', look: 'modern', width: 170 },
    ], 'The nUIget side bar view with Gateway selected; the Installed section lists package-row-serilog and the Updates section has a row.'),
    ready('sidebar-narrow-200px', 'sidebar', [{ theme: 'dark-modern', look: 'modern', width: 200 }],
        'The side bar at 200 px with Gateway selected; both sections keep their rows.'),
    ready('sidebar-update-all-dialog', 'sidebar', [primary('sidebar')],
        'Gateway selected, Update all pressed in the Updates section header; the confirmation is open and is cancelled after the capture, never confirmed.'),
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

/**
 * The measurement rules of the named states (UX-P0.10; plan §2.7, D34, Appendix B; MS-1, MS-4, MS-5). The capture
 * suite measures every state it reaches before its screenshot: each rule that applies to the state prints one line,
 * `[measure] <rule>@<state>[/<element group>]: <value> (hard)` or `… (pending <item>)`. Only a `hard` rule is
 * asserted; a `pending` rule is the item it names to flip (§2.7: only that item flips it, in the commit that makes it
 * green). A rule whose elements are absent prints `not measurable`, which fails a `hard` rule and never passes one.
 *
 * Insets are content insets: from the box's padding box (minus a visible scrollbar) to the union of its visible leaf
 * content (text ranges, images, SVGs, controls), never to children that fill the box. A control is a form field or a
 * button that paints its own box (a background or a border on all four sides); a transparent button, such as a
 * section toggle or an icon button, is a container and its content is measured. Helper 1 is gap membership
 * (DS-GRID-1, DS-GRID-2a, DS-GRID-2b), helper 2 shared insets (DS-INSET-1, DS-INSET-2, PF-6), helper 3 heights against
 * the Design System and the workbench measured in the same run (DS-HEIGHT-1..11, PF-5; UX-P0.11), helper 4 box centring
 * (PF-3b), helper 5 truncation of named text (PF-3a, DS-ROW-5; UX-P0.12), helper 6 overlap, containment, clipping and
 * still chrome (PF-2, PF-4, MS-8, DS-INSET-3, DS-OVERFLOW-2); helper 7, the 24 px target, is DS-HEIGHT-8's hit check.
 *
 * Plain data and string scripts: the module needs no DOM types (tsconfig.test.json has none) and no ExTester import, so
 * `src/test/lint` can import its registry.
 */

export type RuleStatus = 'hard' | { pending: string };

/** The state groups of Appendix B ("main" is the main panel's Installed states). */
export type StateGroup = 'main-installed' | 'main-updates' | 'browse' | 'details' | 'dialogs' | 'sources' | 'sidebar';

/** The element groups Appendix B names for DS-INSET-2 (the sidebar is a state group there). */
export type ElementGroup = 'toolbars' | 'headers' | 'main-header' | 'rows' | 'chrome' | 'first-row';

export type Scope = StateGroup | ElementGroup;

/** D34's tolerances, written once: never changed to make a rule green (design trigger 1). */
export const TOLERANCES = {
    /** Edges meant to coincide (shared insets, symmetric insets). */
    coincide: 1,
    /** Gap membership: a gap or a spacing value is a scale value within this. */
    gapMembership: 0.5,
    /** A section header's gap below may exceed its gap above by this (DS-GRID-2b). */
    proximity: 2,
    /** A height against its Design System value (plan row UX-P0.11: ± 1 px of the token). */
    height: 1,
    /** A control's box centre against its row's (D34). */
    centring: 1,
    /** A height against the workbench's own control, measured in the same run (D34). */
    parity: 1,
    /** Clearance for containment: a child inside its parent's content box, no two siblings intersecting (D34). */
    containment: 0,
    /** Persistent chrome: the same rectangle in every state of a surface, theme, width and look (D34). */
    chrome: 0.5,
    /** PF-4: P9.fix-4's own tolerance for the primary toolbar button's right edge against the list's (H9). */
    primaryEdge: 8,
} as const;

/** The spacing ramp of DS-GRID-1, in px. */
export const RAMP: readonly number[] = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40];

/** The block gaps of DS-GRID-2a: 4 inside a group, 8 between groups (premise P-1). */
export const BLOCK_GAPS: readonly number[] = [4, 8];

/** The main panel's shared start inset (DS-INSET-1) and the details pane's (DS-INSET-4's 20). */
export const MAIN_INSET = 16;
export const DETAILS_INSET = 20;

/** The heights of `docs/design/design-system.md` DS-HEIGHT-1..11, in px, per look where they differ. */
export const HEIGHTS = {
    paneHeader: { modern: 28, classic: 22 },
    compactRow: 22,
    comfortableRow: 72,
    tabStrip: 36,
    button: 26,
    searchBox: 26,
    select: 26,
    textField: 25,
    iconButton: 22,
    iconButtonInHeader: 20,
    target: 24,
    checkBox: 18,
    countBadge: { modern: 19, classic: 18 },
    progress: 2,
} as const;

/** DS-INSET-3's trailing ends: a row's last action, a sidebar section header's trailing count or action, a surface. */
export const TRAILING = { rowAction: 6, sidebarHeader: { modern: 6, classic: 12 }, surface: 16 } as const;

/** DS-HEIGHT-6's text button, DS-HEIGHT-9's check box and DS-HEIGHT-10's badges: computed styles per look. */
export const CONTROL_STYLES = {
    button: { fontSize: '12px', lineHeight: '16px', padding: '4px 8px 4px 8px', radius: '4px' },
    checkBoxRadius: '3px',
    countBadge: { modern: { fontSize: '10px', padding: '4px 6px 4px 6px' }, classic: { fontSize: '11px', padding: '3px 5px 3px 5px', radius: '11px' } },
    labelBadge: { modern: { fontSize: '10px', padding: '4px 6px 4px 6px' }, classic: { fontSize: '11px', padding: '2px 4px 2px 4px', radius: '2px' } },
} as const;

/** A rule of the registry: its helper, a status per scope (Appendix B) and its tolerance. */
export interface RuleDefinition {
    id: string;
    helper: 1 | 2 | 3 | 4 | 5 | 6;
    scopes: Partial<Record<Scope, RuleStatus>>;
    tolerance: number;
    /** States the rule is limited to (PF-6), or undefined for every state of its scopes. */
    states?: readonly string[];
    /** A pattern the state's name must match (DS-HEIGHT-11's loading states), or undefined. */
    statePattern?: RegExp;
    /** Webview widths the rule is limited to (PF-3a at 1200), or undefined for every width. */
    widths?: readonly number[];
    /**
     * States a `hard` scope does not hold in yet, with the item that makes them hold (plan §2.7: a rule today's tree does
     * not satisfy lands as pending with that item; design-advisor ruling of 2026-10-24, V72).
     */
    pendingStates?: Readonly<Record<string, string>>;
}

/** Whether a rule measures a state (at a webview width) at all; its scopes then say for which state group. */
export const appliesTo = (definition: RuleDefinition, state: string, width?: number): boolean =>
    (definition.states === undefined || definition.states.includes(state)) && (definition.statePattern === undefined || definition.statePattern.test(state))
    && (definition.widths === undefined || (width !== undefined && definition.widths.some(candidate => Math.abs(candidate - width) <= 1)));

export function rule(id: string, options: Omit<RuleDefinition, 'id'>): RuleDefinition {
    return { id, ...options };
}

const asGrid1 = { 'main-updates': { pending: 'P3.1b' }, browse: { pending: 'P3.2' }, details: { pending: 'P3.3b' }, dialogs: { pending: 'P3.5' }, sources: { pending: 'P3.6' }, sidebar: { pending: 'P3.7a' } } as const;

/** One pending item for the state groups where a rule's elements are rendered. */
const on = (item: string, ...groups: StateGroup[]): Partial<Record<Scope, RuleStatus>> => Object.fromEntries(groups.map(group => [group, { pending: item }]));

const MAIN: StateGroup[] = ['main-installed', 'main-updates', 'browse', 'details'];

/**
 * V72's states, whose document scrolls today: the Listbox's visually hidden hint, absolutely placed with no positioned
 * ancestor, extends the document (DS-OVERFLOW-6 names it, CI run 40048739947). MS-8's chrome and DS-OVERFLOW-6 wait for
 * P2.1a, whose files own the span and its rule (design-advisor follow-up of 2026-10-24, step 4).
 */
const V72_STATES: Readonly<Record<string, string>> = { 'main-transitive-expanded': 'P2.1a', 'main-transitive-details': 'P2.1a', 'main-installed-all': 'P2.1a' };

export const RULES: readonly RuleDefinition[] = [
    rule('PF-6', { helper: 2, scopes: { 'main-installed': 'hard' }, tolerance: TOLERANCES.coincide, states: ['main-installed-single'] }),
    rule('DS-GRID-1', { helper: 1, scopes: { 'main-installed': { pending: 'P2.7' }, ...asGrid1 }, tolerance: TOLERANCES.gapMembership }),
    rule('DS-GRID-2a', { helper: 1, scopes: { 'main-installed': { pending: 'P2.7' }, ...asGrid1 }, tolerance: TOLERANCES.gapMembership }),
    rule('DS-GRID-2b', { helper: 1, scopes: { 'main-installed': { pending: 'P2.6' }, ...asGrid1 }, tolerance: TOLERANCES.proximity }),
    rule('DS-INSET-1', { helper: 2, scopes: { 'main-installed': { pending: 'P2.7' }, details: { pending: 'P3.3b' }, sidebar: { pending: 'P3.7a' } }, tolerance: TOLERANCES.coincide }),
    rule('DS-INSET-2', { helper: 2, scopes: { toolbars: { pending: 'P2.5' }, headers: { pending: 'P2.6' }, 'main-header': { pending: 'P2.7' }, sidebar: { pending: 'P3.7a' } }, tolerance: TOLERANCES.coincide }),
    // UX-P0.11: P9.fix-3's centring and P9.fix-5's shared column, in the states their tests cover.
    rule('PF-3b', { helper: 4, scopes: { 'main-installed': 'hard', 'main-updates': 'hard' }, tolerance: TOLERANCES.centring, states: ['main-installed-single', 'main-updates'] }),
    rule('PF-5', { helper: 3, scopes: { details: 'hard' }, tolerance: TOLERANCES.height, states: ['main-installed-details'] }),
    // The tracker's state group for DS-HEIGHT-1 and -2 is the sidebar (P3.7a's files: the sidebar and the compact Row).
    rule('DS-HEIGHT-1', { helper: 3, scopes: on('P3.7a', 'sidebar'), tolerance: TOLERANCES.height }),
    rule('DS-HEIGHT-2', { helper: 3, scopes: on('P3.7a', 'sidebar'), tolerance: TOLERANCES.height }),
    rule('DS-HEIGHT-3', { helper: 3, scopes: on('P2.2', ...MAIN), tolerance: TOLERANCES.height }),
    rule('DS-HEIGHT-4', { helper: 3, scopes: on('P2.5', ...MAIN), tolerance: TOLERANCES.height }),
    rule('DS-HEIGHT-5', { helper: 3, scopes: on('P3.3b', 'details'), tolerance: TOLERANCES.height }),
    rule('DS-HEIGHT-6', { helper: 3, scopes: on('P2.3', 'main-installed', 'main-updates', 'details', 'dialogs', 'sources'), tolerance: TOLERANCES.height }),
    rule('DS-HEIGHT-7', { helper: 3, scopes: on('P2.4', ...MAIN, 'dialogs', 'sources', 'sidebar'), tolerance: TOLERANCES.height }),
    rule('DS-HEIGHT-8', { helper: 3, scopes: on('P2.5', ...MAIN, 'sources', 'sidebar'), tolerance: TOLERANCES.height }),
    rule('DS-HEIGHT-9', { helper: 3, scopes: on('P2.3', ...MAIN, 'dialogs', 'sources'), tolerance: TOLERANCES.height }),
    rule('DS-HEIGHT-10', { helper: 3, scopes: on('P2.6', ...MAIN, 'sidebar'), tolerance: TOLERANCES.height }),
    rule('DS-HEIGHT-11', { helper: 3, scopes: { 'main-installed': { pending: 'P2.8b' }, ...on('P3.10', 'main-updates', 'browse', 'details', 'sidebar') }, tolerance: TOLERANCES.height, statePattern: /loading|revalidating/ }),
    // UX-P0.12: P9.fix-2, -3 (authors) and -4 at their own measures, in the states their tests cover; MS-8 for every state.
    rule('PF-2', { helper: 6, scopes: { 'main-installed': 'hard' }, tolerance: TOLERANCES.coincide, states: ['main-installed-single'] }),
    rule('PF-3a', { helper: 5, scopes: { 'main-installed': 'hard' }, tolerance: TOLERANCES.containment, states: ['main-installed-single'], widths: [1200] }),
    rule('PF-4', { helper: 6, scopes: { 'main-installed': 'hard', 'main-updates': 'hard' }, tolerance: TOLERANCES.primaryEdge, states: ['main-installed-single', 'main-updates'] }),
    rule('MS-8', { helper: 6, scopes: { chrome: 'hard', 'first-row': { pending: 'P3.1b' } }, tolerance: TOLERANCES.chrome, pendingStates: V72_STATES }),
    // The document never scrolls (V72, design-advisor ruling of 2026-10-24).
    rule('DS-OVERFLOW-6', { helper: 6, scopes: { 'main-installed': 'hard', 'main-updates': 'hard', browse: 'hard', details: 'hard', dialogs: 'hard', sources: 'hard', sidebar: 'hard' }, tolerance: TOLERANCES.containment, pendingStates: V72_STATES }),
    rule('DS-INSET-3', { helper: 6, scopes: { rows: { pending: 'P2.2' }, headers: { pending: 'P2.6' }, sidebar: { pending: 'P3.7a' } }, tolerance: TOLERANCES.coincide }),
    // DS-OVERFLOW-2 over the section headers, the tracker's `headers` and P2.6's files (SectionHeader, Badge).
    rule('DS-OVERFLOW-2', { helper: 6, scopes: on('P2.6', 'main-installed', 'details', 'sidebar'), tolerance: TOLERANCES.containment }),
    rule('DS-ROW-5', { helper: 5, scopes: { ...on('P2.2', ...MAIN), sidebar: { pending: 'P3.7a' } }, tolerance: TOLERANCES.containment }),
];

/** The state group of a named state, by its name. */
export function stateGroup(state: string): StateGroup {
    if (state.endsWith('-dialog')) {
        return 'dialogs';
    }
    if (state.startsWith('sidebar-')) {
        return 'sidebar';
    }
    if (state.startsWith('main-sources')) {
        return 'sources';
    }
    if (state.endsWith('-details') || state === 'main-details-readme') {
        return 'details';
    }
    if (state.startsWith('main-browse-') || state.startsWith('main-quicksearch-')) {
        return 'browse';
    }
    if (state.startsWith('main-updates')) {
        return 'main-updates';
    }
    return 'main-installed';
}

/** The states whose first row MS-8 compares (Installed and Updates, P3.1b). */
const FIRST_ROW_STATES: readonly string[] = ['main-installed-single', 'main-updates'];

/** The element groups measured in a state group (DS-INSET-2, DS-INSET-3, MS-8), and MS-8's first row in its two states. */
export function elementGroups(group: StateGroup, state?: string): ElementGroup[] {
    const firstRow: ElementGroup[] = state !== undefined && FIRST_ROW_STATES.includes(state) ? ['first-row'] : [];
    switch (group) {
        case 'main-installed':
        case 'main-updates':
            return ['toolbars', 'headers', 'main-header', 'rows', 'chrome', ...firstRow];
        case 'browse':
            return ['main-header', 'rows', 'chrome'];
        case 'details':
            return ['headers', 'main-header', 'rows', 'chrome'];
        default:
            return ['chrome'];
    }
}

export interface MeasureLine {
    name: string;
    value: string;
    status: RuleStatus;
    pass: boolean;
}

/** The one line format of plan §2.7. */
export function formatLine(line: MeasureLine): string {
    const status = line.status === 'hard' ? 'hard' : `pending ${line.status.pending}`;
    return `[measure] ${line.name}: ${line.value} (${status})`;
}

// ---- the in-page collector ------------------------------------------------------------------------------------------

/** The content insets of a box: start, end, top and bottom, in px; undefined when it shows no content. */
export interface Insets {
    start: number;
    end: number;
    top: number;
    bottom: number;
}

export interface SectionBox {
    id: string;
    variant: string;
    insets: Insets | undefined;
    /** DS-INSET-3: the box's right minus its trailing count, badge or action's right; undefined without one. */
    trailingEnd?: number;
    /** DS-GRID-2b on text line boxes: the last text or border above to the title's top, and the title's bottom to the first row name below. */
    above: number | undefined;
    below: number | undefined;
}

/** Helper 3's heights (and the computed styles DS-HEIGHT-6, -9 and -10 name) of the state's scope. */
export interface Heights {
    headers: Array<{ id: string; variant: string; height: number }>;
    compactRows: number[];
    comfortableRows: number[];
    /** The distances between consecutive comfortable row tops, per list. */
    comfortablePitches: number[];
    tabStrip: number | undefined;
    detailsTabs: number | undefined;
    buttons: Array<{ height: number; fontSize: string; lineHeight: string; padding: string; radius: string }>;
    inputs: Array<{ kind: 'search' | 'select' | 'field'; id: string; height: number }>;
    iconButtons: Array<{ inHeader: boolean; width: number; height: number; hit: { width: number; height: number } }>;
    checkBoxes: Array<{ width: number; height: number; radius: string; selected: { fill: string; border: string } | undefined }>;
    /** The theme's `checkbox.selectBackground` and `checkbox.selectBorder` as VS Code put them on the root (hex, or empty). */
    checkSelect: { fill: string; border: string };
    badges: Array<{ count: boolean; width: number; height: number; fontSize: string; padding: string; radius: string }>;
    progress: number[];
}

/** Helpers 5 and 6 for one row (UX-P0.12). */
export interface RowFacts {
    /** The `data-testid` of the row's list. */
    list: string;
    compact: boolean;
    name: string;
    nameCut: boolean;
    nameEllipsis: boolean;
    /** Undefined when the row shows no authors. */
    authorsCut: boolean | undefined;
    versionShown: boolean;
    /** The version ellipsized itself (it collapses before the name, DS-ROW-5). */
    versionCut: boolean;
    badgesShown: number;
    /** The row band's right minus its last visible action's right; undefined without a visible action. */
    actionsEnd: number | undefined;
}

export interface ChromeRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** MS-8's persistent chrome of a surface, by name; undefined where the state does not show it. */
export type Chrome = Record<string, ChromeRect | undefined>;

/** The chrome (and first row) of the first state measured at a surface, theme, width and look: MS-8's reference. */
export interface ChromeReference {
    state: string;
    chrome: Chrome;
    firstRow: number | undefined;
}

export interface Layout {
    /** Whether the webview root was found; every rule is `not measurable` without it. */
    root: boolean;
    /** The visible elements DS-GRID-1 read. */
    examined: number;
    /** Spacing values off the ramp: `selector prop value`, at most 12, and their count. */
    offRamp: string[];
    offRampCount: number;
    /** Gaps between consecutive visible children of the block containers. */
    blockGaps: number[];
    sections: SectionBox[];
    toolbars: Array<{ id: string; insets: Insets | undefined }>;
    mainHeader: Insets | undefined;
    sidebarHeader: Insets | undefined;
    /** The left edges of PF-6's and DS-INSET-1's elements in the main panel, absent when not rendered. */
    mainLefts: Record<string, number | undefined>;
    /** The main list column's content-box left. */
    mainRegionLeft: number | undefined;
    /** The details pane: its padding-box left and the left of its content union. */
    details: { regionLeft: number; contentLeft: number } | undefined;
    /** The sidebar: its root left, the section-title and row-name lefts, the search box left. */
    sidebar: { rootLeft: number; titles: number[]; names: number[]; search: number | undefined } | undefined;
    heights: Heights;
    /** Helper 4: the vertical centres of each Installed or Updates row wrapper and of its check box and icon. */
    centring: Array<{ name: string; row: number; check: number | undefined; icon: number | undefined }>;
    /** PF-5: the details pane's Uninstall and Update buttons. */
    detailsButtons: { uninstall: { left: number; height: number } | undefined; update: { left: number; height: number } | undefined };
    /** The webview's width (PF-3a's 1200). */
    width: number;
    rows: RowFacts[];
    chrome: Chrome;
    /** The top of the first Installed or Updates row (MS-8's first-row y). */
    firstRow: number | undefined;
    /** DS-OVERFLOW-2 over the section-header boxes: offenders (at most 8 of each kind, their total in `count`) and every badge's rect. */
    overflow: { containers: number; collisions: string[]; outside: string[]; clipped: string[]; count: number; badges: string[] };
    /** PF-2: the last direct row's bottom, the transitive header's top, and whether one element scrolls both. */
    transitiveGap: { lastRowBottom: number; headerTop: number; sameScroller: boolean } | undefined;
    /** PF-4: the primary toolbar button's right and its list's right. */
    primaryEdges: Array<{ list: string; button: number; listRight: number; listboxRight: number }>;
    /** MS-8: the Browse view is shown instead of the tab strip (`.nuiget-browse`). */
    browsing: boolean;
    /** DS-OVERFLOW-6: the document's client and scroll sizes, and the deepest element outside the viewport no scroller holds. */
    documentOverflow: { clientWidth: number; clientHeight: number; scrollWidth: number; scrollHeight: number; outside: string | undefined } | undefined;
}

/**
 * Runs in the webview: `arguments[0]` is the root's test id, `arguments[1]` the ramp, `arguments[2]` the gap
 * tolerance, `arguments[3]` the containment tolerance (DS-OVERFLOW-2). Returns `Layout`.
 */
export const COLLECT_LAYOUT = `
const [rootTestId, ramp, tolerance, containment = 0] = arguments;
const root = document.querySelector('[data-testid="' + rootTestId + '"]');
if (!root) return { root: false, examined: 0, offRamp: [], offRampCount: 0, blockGaps: [], sections: [], toolbars: [], mainHeader: undefined, sidebarHeader: undefined, mainLefts: {}, mainRegionLeft: undefined, details: undefined, sidebar: undefined, heights: { headers: [], compactRows: [], comfortableRows: [], comfortablePitches: [], tabStrip: undefined, detailsTabs: undefined, buttons: [], inputs: [], iconButtons: [], checkBoxes: [], checkSelect: { fill: '', border: '' }, badges: [], progress: [] }, centring: [], detailsButtons: { uninstall: undefined, update: undefined }, width: 0, rows: [], chrome: {}, firstRow: undefined, overflow: { containers: 0, collisions: [], outside: [], clipped: [], count: 0, badges: [] }, transitiveGap: undefined, primaryEdges: [], browsing: false, documentOverflow: undefined };
const dialog = document.querySelector('.nuiget-dialog');
const visible = el => {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
};
const px = value => Number.parseFloat(value) || 0;
const round = n => Math.round(n * 10) / 10;
const paintsBox = el => {
    const style = getComputedStyle(el);
    const transparent = style.backgroundColor === 'transparent' || /^rgba\\(.*,\\s*0\\)$/.test(style.backgroundColor);
    const bordered = ['Top', 'Right', 'Bottom', 'Left'].every(side => px(style['border' + side + 'Width']) > 0 && style['border' + side + 'Style'] !== 'none');
    return !transparent || bordered;
};
const isControl = el => ['IMG', 'INPUT', 'SELECT', 'TEXTAREA', 'CANVAS'].includes(el.tagName) || el.tagName.toLowerCase() === 'svg' || (el.tagName === 'BUTTON' && paintsBox(el));
const leafRects = box => {
    const rects = [];
    const walk = parent => {
        for (const node of parent.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (!node.textContent.trim() || !visible(node.parentElement)) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0) rects.push(rect);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.classList.contains('nuiget-visually-hidden') || getComputedStyle(node).display === 'none') continue;
                if (isControl(node)) {
                    if (visible(node)) rects.push(node.getBoundingClientRect());
                } else {
                    walk(node);
                }
            }
        }
    };
    walk(box);
    return rects;
};
const union = rects => rects.length === 0 ? undefined : { left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)), top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) };
const contentInsets = box => {
    if (!visible(box)) return undefined;
    const content = union(leafRects(box));
    if (!content) return undefined;
    const outer = box.getBoundingClientRect();
    const style = getComputedStyle(box);
    const scrollbar = Math.max(0, box.offsetWidth - box.clientWidth - px(style.borderLeftWidth) - px(style.borderRightWidth));
    const pad = { left: outer.left + px(style.borderLeftWidth), right: outer.right - px(style.borderRightWidth) - scrollbar, top: outer.top + px(style.borderTopWidth), bottom: outer.bottom - px(style.borderBottomWidth) };
    return { start: round(content.left - pad.left), end: round(pad.right - content.right), top: round(content.top - pad.top), bottom: round(pad.bottom - content.bottom) };
};
const label = el => (el.dataset.testid ? '[' + el.dataset.testid + ']' : el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : el.tagName.toLowerCase());
const scope = dialog ?? root;
// Helper 1, DS-GRID-1: every padding, margin and gap on the ramp.
const offRamp = [];
let offRampCount = 0;
let examined = 0;
const props = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'row-gap', 'column-gap'];
for (const el of [scope, ...scope.querySelectorAll('*')]) {
    if (!visible(el) || el.closest('.nuiget-visually-hidden, code, [data-testid="readme-content"]')) continue;
    examined++;
    const style = getComputedStyle(el);
    // getComputedStyle resolves an auto margin to its used px; the typed computed value keeps the keyword.
    const typed = el.computedStyleMap ? el.computedStyleMap() : null;
    for (const prop of props) {
        const raw = style.getPropertyValue(prop);
        if (raw === 'normal' || raw === 'auto' || raw === '') continue;
        if (typed && String(typed.get(prop)) === 'auto') continue;
        const value = Math.abs(px(raw));
        if (prop.startsWith('margin') && value > 40) continue;
        if (!ramp.some(step => Math.abs(value - step) <= tolerance)) {
            offRampCount++;
            if (offRamp.length < 12) offRamp.push(label(el) + ' ' + prop + ' ' + raw);
        }
    }
}
// Helper 1, DS-GRID-2a: block gaps between consecutive visible children.
const blockGaps = [];
const containers = dialog ? [dialog] : rootTestId === 'nuiget-app' ? [...document.querySelectorAll('.nuiget-main, .nuiget-main-list, .nuiget-installed')] : [root];
for (const container of containers) {
    const children = [...container.children].filter(visible).filter(el => getComputedStyle(el).position !== 'absolute' && getComputedStyle(el).position !== 'fixed');
    for (let i = 1; i < children.length; i++) {
        const gap = children[i].getBoundingClientRect().top - children[i - 1].getBoundingClientRect().bottom;
        if (gap >= -0.5) blockGaps.push(round(gap));
    }
}
// Section boxes: content insets, and DS-GRID-2b on the title's line box.
const lastEdgeAbove = box => {
    for (let el = box; el && el !== scope; el = el.parentElement) {
        for (let prev = el.previousElementSibling; prev; prev = prev.previousElementSibling) {
            if (getComputedStyle(prev).display === 'none') continue;
            const text = union(leafRects(prev));
            const style = getComputedStyle(prev);
            const border = visible(prev) && px(style.borderBottomWidth) > 0 && style.borderBottomStyle !== 'none' ? prev.getBoundingClientRect().bottom : undefined;
            const edge = Math.max(text ? text.bottom : -Infinity, border ?? -Infinity);
            if (edge > -Infinity) return edge;
        }
        const parent = el.parentElement;
        if (parent && parent !== scope) {
            const style = getComputedStyle(parent);
            if (px(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none') return parent.getBoundingClientRect().top + px(style.borderTopWidth);
        }
    }
    return undefined;
};
// The first row name (or, without rows, the first content) below the title in what the header labels: the content its
// toggle controls, absent while collapsed, or for a heading without a toggle the blocks after it.
const firstNameBelow = (box, title) => {
    const below = el => {
        const names = [...el.querySelectorAll('.nuiget-row-name')].filter(visible);
        const rects = (names.length > 0 ? names.flatMap(leafRects) : leafRects(el)).filter(r => r.top >= title.bottom - 0.5);
        return rects.length > 0 ? Math.min(...rects.map(r => r.top)) : undefined;
    };
    const toggle = box.querySelector('[aria-controls]');
    if (toggle) {
        const content = document.getElementById(toggle.getAttribute('aria-controls'));
        return content && visible(content) ? below(content) : undefined;
    }
    for (let el = box; el && el !== scope; el = el.parentElement) {
        for (let next = el.nextElementSibling; next; next = next.nextElementSibling) {
            if (getComputedStyle(next).display === 'none') continue;
            const top = below(next);
            if (top !== undefined) return top;
        }
    }
    return undefined;
};
// A title scrolled out of a clipping ancestor (or the viewport) is not on screen: its gaps are not measured.
const inView = (rect, el) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
        if (/auto|scroll|hidden|clip/.test(getComputedStyle(a).overflowY)) {
            const clip = a.getBoundingClientRect();
            if (rect.bottom <= clip.top + 0.5 || rect.top >= clip.bottom - 0.5) return false;
        }
    }
    return rect.bottom > 0 && rect.top < window.innerHeight;
};
const sections = [...scope.querySelectorAll('[data-testid^="section-box-"]')].filter(visible).map(box => {
    const title = union(leafRects(box.querySelector('.nuiget-section-title') ?? box));
    const shown = title && inView(title, box);
    const edge = shown ? lastEdgeAbove(box) : undefined;
    const name = shown ? firstNameBelow(box, title) : undefined;
    return {
        id: box.dataset.testid.replace(/^section-box-/, ''),
        variant: box.dataset.variant ?? '',
        insets: contentInsets(box),
        trailingEnd: (() => {
            const trailing = [...box.querySelectorAll('.nuiget-badge, .nuiget-section-actions > *')].filter(visible);
            return trailing.length > 0 ? round(box.getBoundingClientRect().right - Math.max(...trailing.map(el => el.getBoundingClientRect().right))) : undefined;
        })(),
        above: edge === undefined ? undefined : round(title.top - edge),
        below: name === undefined ? undefined : round(name - title.bottom),
    };
});
const toolbars = [...scope.querySelectorAll('[data-testid="installed-toolbar"], [data-testid="updates-toolbar"]')].filter(visible).map(box => ({ id: box.dataset.testid, insets: contentInsets(box) }));
const header = scope.querySelector('[data-testid="main-header"]');
const sidebarHeader = rootTestId === 'nuiget-sidebar' ? root.querySelector('.nuiget-sidebar-header') : null;
const left = selector => { const el = scope.querySelector(selector); return visible(el) ? el.getBoundingClientRect().left : undefined; };
const firstOption = scope.querySelector('[data-testid="installed-list"] [role="option"]');
const mainLefts = rootTestId !== 'nuiget-app' ? {} : {
    title: left('.nuiget-main-title'),
    search: left('.nuiget-main-search-input'),
    tab: left('[data-testid="installed-tab"] .nuiget-tab-label'),
    toolbar: left('[data-testid="select-all-button"]'),
    section: left('[data-testid="section-header-direct"] .nuiget-section-chevron'),
    row: firstOption && firstOption.firstElementChild && visible(firstOption.firstElementChild) ? firstOption.firstElementChild.getBoundingClientRect().left : undefined,
};
const list = scope.querySelector('.nuiget-main-list');
const mainRegionLeft = visible(list) ? list.getBoundingClientRect().left + px(getComputedStyle(list).borderLeftWidth) + px(getComputedStyle(list).paddingLeft) : undefined;
const panel = scope.querySelector('[data-testid="package-details-panel"]');
let details;
if (visible(panel)) {
    const content = union(leafRects(panel));
    if (content) details = { regionLeft: panel.getBoundingClientRect().left + px(getComputedStyle(panel).borderLeftWidth), contentLeft: content.left };
}
let sidebar;
if (rootTestId === 'nuiget-sidebar' && visible(root)) {
    const lefts = selector => [...root.querySelectorAll(selector)].filter(visible).map(el => round(el.getBoundingClientRect().left));
    const search = root.querySelector('[data-testid="sidebar-search-input"]');
    sidebar = { rootLeft: root.getBoundingClientRect().left, titles: lefts('.nuiget-section-title'), names: lefts('.nuiget-row-name'), search: visible(search) ? search.getBoundingClientRect().left : undefined };
}
// Helper 3: heights, and the computed styles the height rules name.
const rectOf = el => el.getBoundingClientRect();
const shown = selector => [...scope.querySelectorAll(selector)].filter(visible);
const heightOf = el => round(rectOf(el).height);
const paddingOf = style => [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(' ');
const visibleHeight = selector => { const el = scope.querySelector(selector); return visible(el) ? heightOf(el) : undefined; };
const inputKinds = [['search', '[data-testid="search-input"], [data-testid="sidebar-search-input"]'], ['select', '[data-testid="project-selector"], [data-testid="source-selector"], [data-testid="version-selector"]'], ['field', '.nuiget-input, .nuiget-text-field']];
const rootVars = document.documentElement.style;
// A badge's visible label: its own text, or its aria-hidden child's when it has a title in a visually hidden one.
const badgeLabel = el => {
    const own = [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
    const shownLabel = el.querySelector('[aria-hidden="true"]');
    return own || (shownLabel ? shownLabel.textContent.trim() : '');
};
const heights = {
    headers: shown('[data-testid^="section-box-"]').map(el => ({ id: el.dataset.testid.replace(/^section-box-/, ''), variant: el.dataset.variant ?? '', height: heightOf(el) })),
    compactRows: shown('.nuiget-row--compact').map(heightOf),
    comfortableRows: shown('.nuiget-row--comfortable').map(heightOf),
    comfortablePitches: [...scope.querySelectorAll('[role="listbox"]')].flatMap(list => {
        const tops = [...list.querySelectorAll('.nuiget-row--comfortable')].filter(visible).map(el => rectOf(el).top).sort((a, b) => a - b);
        return tops.slice(1).map((top, i) => round(top - tops[i]));
    }),
    tabStrip: visibleHeight('[data-testid="tab-bar"]'),
    detailsTabs: visibleHeight('[data-testid="package-details-panel"] [role="tablist"]'),
    buttons: shown('.nuiget-button').map(el => { const style = getComputedStyle(el); return { height: heightOf(el), fontSize: style.fontSize, lineHeight: style.lineHeight, padding: paddingOf(style), radius: style.borderTopLeftRadius }; }),
    inputs: inputKinds.flatMap(([kind, selector]) => shown(selector).map(el => ({ kind, id: el.dataset.testid ?? label(el), height: heightOf(el) }))),
    iconButtons: shown('.nuiget-icon-button').map(el => {
        const rect = rectOf(el);
        // A pointer target widened by an absolutely placed ::after (DS-HEIGHT-8).
        const after = getComputedStyle(el, '::after');
        const widened = after.content && after.content !== 'none' && after.position === 'absolute';
        const hit = widened ? { width: round(rect.width - px(after.left) - px(after.right)), height: round(rect.height - px(after.top) - px(after.bottom)) } : { width: round(rect.width), height: round(rect.height) };
        return { inHeader: Boolean(el.closest('[data-variant="pane"]')), width: round(rect.width), height: round(rect.height), hit };
    }),
    checkBoxes: shown('input[type="checkbox"], .nuiget-row-check').map(el => {
        const style = getComputedStyle(el);
        const rect = rectOf(el);
        const selected = el.matches('.nuiget-row-check') && el.closest('[aria-selected="true"]');
        return { width: round(rect.width), height: round(rect.height), radius: style.borderTopLeftRadius, selected: selected ? { fill: style.backgroundColor, border: style.borderTopColor } : undefined };
    }),
    checkSelect: { fill: rootVars.getPropertyValue('--vscode-checkbox-selectBackground').trim(), border: rootVars.getPropertyValue('--vscode-checkbox-selectBorder').trim() },
    badges: shown('.nuiget-badge').map(el => {
        const style = getComputedStyle(el);
        const rect = rectOf(el);
        const text = badgeLabel(el);
        return { count: /^[0-9]+$/.test(text), width: round(rect.width), height: round(rect.height), fontSize: style.fontSize, padding: paddingOf(style), radius: style.borderTopLeftRadius };
    }),
    progress: shown('.nuiget-progress').map(heightOf),
};
// Helper 4: box centres of the rows of the Installed and Updates lists.
const centreOf = el => { const rect = rectOf(el); return round(rect.top + rect.height / 2); };
const centring = shown('[data-testid="installed-list"] [role="option"], [data-testid="updates-list"] [role="option"]').map(option => {
    const row = option.closest('.nuiget-row') ?? option;
    const check = option.querySelector('.nuiget-row-check');
    const icon = option.querySelector('.nuiget-row-icon');
    const name = option.querySelector('.nuiget-row-name');
    return { name: name ? name.textContent : '', row: centreOf(row), check: visible(check) ? centreOf(check) : undefined, icon: visible(icon) ? centreOf(icon) : undefined };
});
const buttonBox = id => { const el = scope.querySelector('[data-testid="' + id + '"]'); if (!visible(el)) return undefined; const rect = rectOf(el); return { left: round(rect.left), height: round(rect.height) }; };
const detailsButtons = { uninstall: buttonBox('uninstall-button'), update: buttonBox('install-update-button') };
// Helpers 5 and 6 (UX-P0.12): named text, rows' trailing actions, still chrome, collisions and containment.
const width = round(document.documentElement.clientWidth);
const rows = shown('.nuiget-row').map(row => {
    const option = row.querySelector('[role="option"]') ?? row;
    const name = option.querySelector('.nuiget-row-name');
    const authors = option.querySelector('.nuiget-row-authors');
    const version = option.querySelector('.nuiget-row-version');
    const actions = [...row.querySelectorAll('.nuiget-row-actions > *')].filter(visible);
    const list = row.closest('[role="listbox"]');
    return {
        list: list && list.dataset.testid ? list.dataset.testid : '',
        compact: row.classList.contains('nuiget-row--compact'),
        name: name ? name.textContent : '',
        nameCut: visible(name) && name.scrollWidth > name.clientWidth,
        nameEllipsis: Boolean(name) && getComputedStyle(name).textOverflow === 'ellipsis',
        authorsCut: visible(authors) ? authors.scrollWidth > authors.clientWidth : undefined,
        versionShown: visible(version),
        versionCut: visible(version) && version.scrollWidth > version.clientWidth,
        badgesShown: [...option.querySelectorAll('.nuiget-badge')].filter(visible).length,
        actionsEnd: actions.length > 0 ? round(rectOf(row).right - Math.max(...actions.map(action => rectOf(action).right))) : undefined,
    };
});
const boxOf = el => { const r = rectOf(el); return { left: round(r.left), top: round(r.top), width: round(r.width), height: round(r.height) }; };
const chromeOf = selector => { const el = root.querySelector(selector); return visible(el) ? boxOf(el) : undefined; };
const chrome = rootTestId === 'nuiget-app'
    ? { 'main-header': chromeOf('[data-testid="main-header"]'), search: chromeOf('[data-testid="search-input"]'), 'tab-bar': chromeOf('[data-testid="tab-bar"]') }
    : { 'sidebar-header': chromeOf('.nuiget-sidebar-header') };
const firstListed = root.querySelector('[data-testid="installed-list"] [role="option"], [data-testid="updates-list"] [role="option"]');
const firstRow = visible(firstListed) ? round(rectOf(firstListed.closest('.nuiget-row') ?? firstListed).top) : undefined;
// DS-OVERFLOW-2 over the section-header boxes of the Design System's overflow table (section 8), on rects in tenths.
const overflow = { containers: 0, collisions: [], outside: [], clipped: [], count: 0, badges: [] };
const note = (list, text) => { overflow.count++; if (list.length < 8) list.push(text); };
const extent = r => round(r.left) + '–' + round(r.right);
const overflowContainers = '[data-testid^="section-box-"]';
for (const container of shown(overflowContainers)) {
    overflow.containers++;
    const style = getComputedStyle(container);
    const r = rectOf(container);
    const left = r.left + px(style.borderLeftWidth) + px(style.paddingLeft);
    const right = r.right - px(style.borderRightWidth) - px(style.paddingRight);
    const children = [...container.children].filter(visible).filter(child => !['absolute', 'fixed'].includes(getComputedStyle(child).position));
    for (let i = 0; i < children.length; i++) {
        const a = rectOf(children[i]);
        for (let j = i + 1; j < children.length; j++) {
            const b = rectOf(children[j]);
            const area = Math.max(0, Math.min(round(a.right), round(b.right)) - Math.max(round(a.left), round(b.left))) * Math.max(0, Math.min(round(a.bottom), round(b.bottom)) - Math.max(round(a.top), round(b.top)));
            if (area > containment) note(overflow.collisions, label(container) + ' ' + label(children[i]) + ' × ' + label(children[j]));
        }
    }
    for (const child of new Set([...children, ...[...container.querySelectorAll('.nuiget-badge')].filter(visible)])) {
        const c = rectOf(child);
        if (round(c.left) < round(left) - containment || round(c.right) > round(right) + containment) note(overflow.outside, label(container) + ' ' + label(child) + ' ' + extent(c) + ' outside ' + round(left) + '–' + round(right));
    }
    if (/hidden|clip/.test(style.overflowX + ' ' + style.overflowY) && (container.scrollWidth > container.clientWidth || container.scrollHeight > container.clientHeight)) note(overflow.clipped, label(container));
}
overflow.badges = shown('[data-testid^="section-box-"] .nuiget-badge').map(badge => {
    const box = badge.closest('[data-testid^="section-box-"]');
    return box.dataset.testid.replace(/^section-box-/, '') + ' "' + badgeLabel(badge) + '" ' + extent(rectOf(badge)) + ' (box right ' + round(rectOf(box).right) + ')';
});
// PF-2: the first transitive header after the last direct row, in one scroller.
const scrollerOf = el => { for (let a = el ? el.parentElement : null; a; a = a.parentElement) if (/auto|scroll/.test(getComputedStyle(a).overflowY)) return a; return null; };
const directRows = [...root.querySelectorAll('[data-testid="installed-list"] .nuiget-row')].filter(visible);
const transitiveBox = root.querySelector('[data-testid="section-box-transitive"]');
const transitiveGap = directRows.length > 0 && visible(transitiveBox)
    ? { lastRowBottom: round(Math.max(...directRows.map(row => rectOf(row).bottom))), headerTop: round(rectOf(transitiveBox).top), sameScroller: scrollerOf(transitiveBox) === scrollerOf(directRows[directRows.length - 1]) }
    : undefined;
// PF-4: the primary toolbar button against its list's right edge.
// The list's right edge is its scroll port's: the listbox when it scrolls itself, else its scroller, else the listbox.
const edgePair = (button, list) => {
    const b = root.querySelector('[data-testid="' + button + '"]');
    const l = root.querySelector('[data-testid="' + list + '"]');
    if (!visible(b) || !visible(l)) return [];
    const port = /auto|scroll/.test(getComputedStyle(l).overflowY) ? l : scrollerOf(l) ?? l;
    return [{ list, button: round(rectOf(b).right), listRight: round(rectOf(port).right), listboxRight: round(rectOf(l).right) }];
};
const primaryEdges = [...edgePair('uninstall-selected-button', 'installed-list'), ...edgePair('update-all-button', 'updates-list')];
// MS-8: MainShell renders the Browse view in place of the Tabs root inside the list pane (MainShell.tsx:284), its idle
// status included (an empty state, no .nuiget-browse); if the tabs vanish and nothing takes their place, this is false.
const pane = rootTestId === 'nuiget-app' ? root.querySelector('.nuiget-main-list') : null;
const paneChildren = pane ? [...pane.children].filter(visible) : [];
const browsing = paneChildren.length > 0 && paneChildren.every(child => !child.classList.contains('nuiget-tabs'));
// DS-OVERFLOW-6: the document's sizes and the deepest element past the viewport that no scroller holds.
const doc = document.documentElement;
const depth = el => { let n = 0; for (let a = el; a; a = a.parentElement) n++; return n; };
// What clips an element below the document: an ancestor that does not let overflow show, on its containing-block chain
// (an absolutely placed element starts at its nearest positioned or transformed ancestor; with none, nothing holds it).
const belowDocument = a => a && a !== document.body && a !== document.documentElement;
const containingBlockOf = el => {
    for (let a = el.parentElement; belowDocument(a); a = a.parentElement) {
        const style = getComputedStyle(a);
        if (style.position !== 'static' || (style.transform && style.transform !== 'none')) return a;
    }
    return null;
};
const heldBelowDocument = el => {
    const position = getComputedStyle(el).position;
    if (position === 'fixed') return true;
    for (let a = position === 'absolute' ? containingBlockOf(el) : el.parentElement; belowDocument(a); a = a.parentElement) {
        const style = getComputedStyle(a);
        if (style.overflowY !== 'visible' || style.overflowX !== 'visible') return true;
    }
    return false;
};
let outside;
let past = 0;
if (doc.scrollHeight > doc.clientHeight || doc.scrollWidth > doc.clientWidth) {
    // The cheap rect test first; the computed-style walks only for the elements past the viewport.
    for (const el of document.body.querySelectorAll('*')) {
        const r = rectOf(el);
        if (r.width === 0 || r.height === 0 || (r.bottom <= doc.clientHeight + 0.5 && r.right <= doc.clientWidth + 0.5)) continue;
        if (heldBelowDocument(el)) continue;
        past++;
        if (visible(el) && (!outside || depth(el) > depth(outside))) outside = el;
    }
}
const documentOverflow = {
    clientWidth: doc.clientWidth, clientHeight: doc.clientHeight, scrollWidth: doc.scrollWidth, scrollHeight: doc.scrollHeight,
    outside: outside ? label(outside) + ' ' + round(rectOf(outside).left) + ',' + round(rectOf(outside).top) + ' ' + round(rectOf(outside).width) + '×' + round(rectOf(outside).height)
        : past > 0 ? 'none visible (' + past + ' past the viewport)' : undefined,
};
return { root: true, examined, offRamp, offRampCount, blockGaps, sections, toolbars, mainHeader: contentInsets(header), sidebarHeader: sidebarHeader ? contentInsets(sidebarHeader) : undefined, mainLefts, mainRegionLeft, details, sidebar, heights, centring, detailsButtons, width, rows, chrome, firstRow, overflow, transitiveGap, primaryEdges, browsing, documentOverflow };
`;

// ---- the workbench of the same run (helper 3's parity) --------------------------------------------------------------

/** The workbench controls the Design System's heights stand for (plan row UX-P0.11), with the selectors to try in order. */
export const WORKBENCH_WIDGETS = {
    extensionsRow: ['.extensions-viewlet .monaco-list-row'],
    extensionsSearch: ['.extensions-viewlet .suggest-input-container', '.extensions-viewlet .monaco-inputbox'],
    paneHeader: ['.part.sidebar .pane-header'],
    extensionNavbar: ['.extension-editor .navbar'],
    settingsSelect: ['.settings-editor .setting-item-control .monaco-select-box'],
    settingsInput: ['.settings-editor .setting-item-control .monaco-inputbox'],
    settingsButton: ['.settings-editor .setting-list-addButton', '.settings-editor .setting-item-control .monaco-button', '.settings-editor .monaco-text-button'],
    editorTabs: ['.part.editor .title.tabs', '.part.editor .tabs-and-actions-container'],
    quickInputBox: ['.quick-input-widget .quick-input-box .monaco-inputbox'],
    quickInputRow: ['.quick-input-widget .quick-input-list .monaco-list-row'],
} as const;

export type WorkbenchWidget = keyof typeof WORKBENCH_WIDGETS;

/** One workbench control as `MEASURE_WIDGETS` returns it; `null` when no selector matched a visible element. */
export interface WidgetMeasure {
    selector: string;
    height: number;
    width: number;
    fontSize: string;
    lineHeight: string;
    padding: string;
    radius: string;
}

/** The heights of the workbench controls, by name; absent when not measured. */
export type WorkbenchHeights = Partial<Record<WorkbenchWidget, number>>;

/**
 * Runs in the workbench (top) document: `arguments[0]` is a list of `[name, selectors]`. Returns, per name, the first
 * visible element's `WidgetMeasure`, or `null`.
 */
export const MEASURE_WIDGETS = `
const [specs] = arguments;
const round = n => Math.round(n * 10) / 10;
const visible = el => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
};
const out = {};
for (const [name, selectors] of specs) {
    out[name] = null;
    for (const selector of selectors) {
        const el = [...document.querySelectorAll(selector)].find(visible);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        out[name] = { selector, height: round(rect.height), width: round(rect.width), fontSize: style.fontSize, lineHeight: style.lineHeight, padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(' '), radius: style.borderTopLeftRadius };
        break;
    }
}
return out;
`;

// ---- the rules over a collected layout ------------------------------------------------------------------------------

const near = (a: number, b: number, tolerance: number): boolean => Math.abs(a - b) <= tolerance;
const tenth = (n: number): number => Math.round(n * 10) / 10;
const insetText = (insets: Insets): string => `${insets.start}/${insets.end} ${insets.top}/${insets.bottom}`;
const NOT_MEASURABLE = 'not measurable';

/** The sidebar's start insets per look (DS-INSET-1): section titles and row names, and the header row. */
const SIDEBAR_INSETS = { modern: { content: 28, header: 8 }, classic: { content: 20, header: 20 } } as const;

/** DS-INSET-2's values where the rule sets them (main panel 16/16, toolbar 4 above and below, sidebar header per look); elsewhere symmetry alone. */
interface InsetTarget {
    startEnd?: number;
    topBottom?: number;
}

function insetTarget(scope: Scope, box: string, variant: string, look: 'modern' | 'classic'): InsetTarget {
    if (scope === 'toolbars') {
        return { startEnd: MAIN_INSET, topBottom: 4 };
    }
    if (scope === 'main-header' || (scope === 'headers' && variant === 'group')) {
        return { startEnd: MAIN_INSET };
    }
    if (scope === 'sidebar' && box === 'sidebar-header') {
        return { startEnd: SIDEBAR_INSETS[look].header, topBottom: SIDEBAR_INSETS[look].header };
    }
    return {};
}

function meetsInset(insets: Insets, target: InsetTarget, tolerance: number): boolean {
    const symmetric = near(insets.start, insets.end, tolerance) && near(insets.top, insets.bottom, tolerance);
    const startEnd = target.startEnd === undefined || (near(insets.start, target.startEnd, tolerance) && near(insets.end, target.startEnd, tolerance));
    const topBottom = target.topBottom === undefined || (near(insets.top, target.topBottom, tolerance) && near(insets.bottom, target.topBottom, tolerance));
    return symmetric && startEnd && topBottom;
}

/** `22 ×4, 23`: each distinct value once, with its count when it repeats, numbers in ascending order. */
function tally(values: ReadonlyArray<number | string>): string {
    const counts = new Map<number | string, number>();
    for (const value of [...values].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))))) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts].map(([value, count]) => (count > 1 ? `${value} ×${count}` : `${value}`)).join(', ');
}

/** A set of heights against a Design System value and, for a parity rule, the workbench's own control. */
function heightCheck(label: string, values: readonly number[], target: number, tolerance: number, parity?: { widget: WorkbenchWidget; workbench: WorkbenchHeights }): { text: string; pass: boolean } {
    const workbench = parity === undefined ? undefined : parity.workbench[parity.widget];
    const against = parity === undefined ? `target ${target}` : `target ${target}, workbench ${workbench ?? 'absent'}`;
    const onTarget = values.every(value => near(value, target, tolerance));
    const onWorkbench = parity === undefined || (workbench !== undefined && values.every(value => near(value, workbench, TOLERANCES.parity)));
    return { text: `${label}${label ? ' ' : ''}${tally(values)} (${against})`, pass: onTarget && onWorkbench };
}

/** Computed styles that differ from the ones a rule sets: `font 13px ×2; padding 0px 12px 0px 12px ×2`. */
function offStyles<T extends object>(items: readonly T[], expected: Readonly<Partial<Record<keyof T & string, string>>>): string[] {
    return (Object.entries(expected) as Array<[keyof T & string, string]>).flatMap(([key, value]) => {
        const off = items.map(item => String(item[key])).filter(actual => actual !== value);
        return off.length === 0 ? [] : [`${key} ${tally(off)} (target ${value})`];
    });
}

/** A colour as `[r, g, b, a]` from `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` or `rgba()`; undefined otherwise. */
export function parseColour(text: string): [number, number, number, number] | undefined {
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text.trim());
    if (hex) {
        const digits = hex[1].length === 3 ? [...hex[1]].map(digit => digit + digit).join('') : hex[1];
        const [r, g, b, a = 255] = (digits.match(/../g) ?? []).map(pair => Number.parseInt(pair, 16));
        return [r, g, b, Math.round((a / 255) * 100) / 100];
    }
    const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(text.trim());
    return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Math.round(Number(rgb[4]) * 100) / 100] : undefined;
}

const sameColour = (a: string, b: string): boolean => {
    const [x, y] = [parseColour(a), parseColour(b)];
    return x !== undefined && y !== undefined && x.every((channel, i) => Math.abs(channel - y[i]) <= (i === 3 ? 0.01 : 0));
};

/** A radius that makes a pill or a circle of its box. */
const isRound = (radius: string, width: number, height: number): boolean => radius.endsWith('%') ? Number.parseFloat(radius) >= 50 : Number.parseFloat(radius) >= Math.min(width, height) / 2 - 0.5;

/** Helpers 3 and 4 (UX-P0.11): the value and the verdict of a height or centring rule, or undefined for another rule. */
function evaluateHeights(definition: RuleDefinition, layout: Layout, look: 'modern' | 'classic', workbench: WorkbenchHeights): { value: string; pass: boolean } | undefined {
    const tolerance = definition.tolerance;
    const heights = layout.heights;
    switch (definition.id) {
        case 'PF-3b': {
            // As P9.fix-3: at least two rows, and a check box (and here an icon) in every one.
            const rows = layout.centring;
            const missing = rows.filter(row => row.check === undefined || row.icon === undefined).map(row => row.name);
            if (rows.length < 2 || missing.length > 0) {
                return { value: `${NOT_MEASURABLE} (${rows.length < 2 ? `fewer than 2 rows` : `no check box or icon in ${missing.join(', ')}`})`, pass: false };
            }
            const offsets = (part: 'check' | 'icon') => rows.map(row => tenth((row[part] as number) - row.row));
            const [check, icon] = [offsets('check'), offsets('icon')];
            return { value: `check box ${tally(check)}; icon ${tally(icon)} (centre offsets, ${rows.length} rows)`, pass: [...check, ...icon].every(offset => Math.abs(offset) <= tolerance) };
        }
        case 'PF-5': {
            const { uninstall, update } = layout.detailsButtons;
            if (uninstall === undefined || update === undefined) {
                return { value: `${NOT_MEASURABLE} (${uninstall === undefined ? 'uninstall-button' : 'install-update-button'})`, pass: false };
            }
            return {
                value: `left ${uninstall.left}/${update.left}, height ${uninstall.height}/${update.height}`,
                pass: near(uninstall.left, update.left, TOLERANCES.coincide) && near(uninstall.height, update.height, tolerance),
            };
        }
        case 'DS-HEIGHT-1': {
            const boxes = heights.headers.filter(header => header.variant === 'pane' || header.variant === 'group');
            if (boxes.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const check = heightCheck('', boxes.map(header => header.height), HEIGHTS.paneHeader[look], tolerance);
            return { value: check.text, pass: check.pass };
        }
        case 'DS-HEIGHT-2': {
            if (heights.compactRows.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const check = heightCheck('', heights.compactRows, HEIGHTS.compactRow, tolerance);
            return { value: check.text, pass: check.pass };
        }
        case 'DS-HEIGHT-3': {
            if (heights.comfortableRows.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const rows = heightCheck('rows', heights.comfortableRows, HEIGHTS.comfortableRow, tolerance);
            const pitch = heightCheck('pitch', heights.comfortablePitches, HEIGHTS.comfortableRow, tolerance);
            return { value: heights.comfortablePitches.length === 0 ? rows.text : `${rows.text}; ${pitch.text}`, pass: rows.pass && pitch.pass };
        }
        case 'DS-HEIGHT-4':
        case 'DS-HEIGHT-5': {
            const strip = definition.id === 'DS-HEIGHT-4' ? heights.tabStrip : heights.detailsTabs;
            if (strip === undefined) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const check = heightCheck('', [strip], HEIGHTS.tabStrip, tolerance, { widget: 'extensionNavbar', workbench });
            return { value: check.text, pass: check.pass };
        }
        case 'DS-HEIGHT-6': {
            if (heights.buttons.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const check = heightCheck('', heights.buttons.map(button => button.height), HEIGHTS.button, tolerance, { widget: 'settingsButton', workbench });
            const off = offStyles(heights.buttons, CONTROL_STYLES.button);
            return { value: [check.text, ...off].join('; '), pass: check.pass && off.length === 0 };
        }
        case 'DS-HEIGHT-7': {
            if (heights.inputs.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const kinds = [['search', HEIGHTS.searchBox, 'extensionsSearch'], ['select', HEIGHTS.select, 'settingsSelect'], ['field', HEIGHTS.textField, 'settingsInput']] as const;
            const checks = kinds.filter(([kind]) => heights.inputs.some(input => input.kind === kind))
                .map(([kind, target, widget]) => heightCheck(kind, heights.inputs.filter(input => input.kind === kind).map(input => input.height), target, tolerance, { widget, workbench }));
            return { value: checks.map(check => check.text).join('; '), pass: checks.every(check => check.pass) };
        }
        case 'DS-HEIGHT-8': {
            if (heights.iconButtons.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const painted = (inHeader: boolean, target: number) => {
                const buttons = heights.iconButtons.filter(button => button.inHeader === inHeader);
                return buttons.length === 0 ? undefined : {
                    text: `${inHeader ? 'section header' : 'painted'} ${tally(buttons.map(button => `${button.width}×${button.height}`))} (target ${target}×${target})`,
                    pass: buttons.every(button => near(button.width, target, tolerance) && near(button.height, target, tolerance)),
                };
            };
            const parts = [painted(false, HEIGHTS.iconButton), painted(true, HEIGHTS.iconButtonInHeader)].filter(part => part !== undefined);
            const hits = heights.iconButtons.map(button => Math.min(button.hit.width, button.hit.height));
            // A minimum: the ± 1 px of the painted box does not apply to the pointer target.
            const hitPass = hits.every(hit => hit >= HEIGHTS.target);
            return { value: [...parts.map(part => part.text), `hit ${tally(hits)} (at least ${HEIGHTS.target})`].join('; '), pass: parts.every(part => part.pass) && hitPass };
        }
        case 'DS-HEIGHT-9': {
            if (heights.checkBoxes.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const target = HEIGHTS.checkBox;
            const sizes = heights.checkBoxes.map(box => `${box.width}×${box.height}`);
            const sizePass = heights.checkBoxes.every(box => near(box.width, target, tolerance) && near(box.height, target, tolerance));
            const radii = heights.checkBoxes.map(box => box.radius).filter(radius => radius !== CONTROL_STYLES.checkBoxRadius);
            const selected = heights.checkBoxes.flatMap(box => (box.selected === undefined ? [] : [box.selected]));
            const { fill, border } = heights.checkSelect;
            const offColour = selected.filter(box => !sameColour(box.fill, fill) || !sameColour(box.border, border));
            const parts = [`${tally(sizes)} (target ${target}×${target})`];
            if (radii.length > 0) {
                parts.push(`radius ${tally(radii)} (target ${CONTROL_STYLES.checkBoxRadius})`);
            }
            if (selected.length > 0) {
                parts.push(`selected ${offColour.length === 0 ? 'in' : 'not in'} checkbox.selectBackground/selectBorder (${fill || 'unset'}/${border || 'unset'})`);
            }
            return { value: parts.join('; '), pass: sizePass && radii.length === 0 && offColour.length === 0 };
        }
        case 'DS-HEIGHT-10': {
            if (heights.badges.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const min = HEIGHTS.countBadge[look];
            const counts = heights.badges.filter(badge => badge.count);
            const labels = heights.badges.filter(badge => !badge.count);
            const parts: string[] = [];
            let pass = true;
            if (counts.length > 0) {
                const style = CONTROL_STYLES.countBadge[look];
                const small = counts.filter(badge => badge.width < min - tolerance || badge.height < min - tolerance);
                const off = offStyles(counts, { fontSize: style.fontSize, padding: style.padding, ...('radius' in style ? { radius: style.radius } : {}) });
                const unround = 'radius' in style ? [] : counts.filter(badge => !isRound(badge.radius, badge.width, badge.height));
                parts.push(`count ${tally(counts.map(badge => `${badge.width}×${badge.height}`))} (at least ${min}×${min})`, ...off.map(text => `count ${text}`));
                if (unround.length > 0) {
                    parts.push(`count radius ${tally(unround.map(badge => badge.radius))} (target round)`);
                }
                pass = pass && small.length === 0 && off.length === 0 && unround.length === 0;
            }
            if (labels.length > 0) {
                const style = CONTROL_STYLES.labelBadge[look];
                const off = offStyles(labels, { fontSize: style.fontSize, padding: style.padding, ...('radius' in style ? { radius: style.radius } : {}) });
                const unround = 'radius' in style ? [] : labels.filter(badge => !isRound(badge.radius, badge.width, badge.height));
                parts.push(`label ${labels.length}`, ...off.map(text => `label ${text}`));
                if (unround.length > 0) {
                    parts.push(`label radius ${tally(unround.map(badge => badge.radius))} (target pill)`);
                }
                pass = pass && off.length === 0 && unround.length === 0;
            }
            return { value: parts.join('; '), pass };
        }
        case 'DS-HEIGHT-11': {
            if (heights.progress.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const check = heightCheck('', heights.progress, HEIGHTS.progress, tolerance);
            return { value: check.text, pass: check.pass };
        }
        default:
            return undefined;
    }
}

/** Helpers 5 and 6 (UX-P0.12): the value and the verdict of a truncation, overlap or chrome rule, or undefined for another. */
function evaluateOverflow(definition: RuleDefinition, scope: Scope, layout: Layout, look: 'modern' | 'classic', reference: ChromeReference | undefined): { value: string; pass: boolean } | undefined {
    const tolerance = definition.tolerance;
    switch (definition.id) {
        case 'PF-2': {
            const gap = layout.transitiveGap;
            if (gap === undefined) {
                return { value: `${NOT_MEASURABLE} (no direct row or transitive header)`, pass: false };
            }
            // At most two block gaps below the last direct row; P9.fix-2's subpixel slack above it.
            const below = tenth(gap.headerTop - gap.lastRowBottom);
            const most = 2 * Math.max(...BLOCK_GAPS);
            return {
                value: `gap ${below} (at most ${most}; last direct row ${gap.lastRowBottom}, transitive header ${gap.headerTop}, ${gap.sameScroller ? 'one scroller' : 'two scrollers'})`,
                pass: gap.sameScroller && below >= -tolerance && below <= most,
            };
        }
        case 'PF-3a': {
            const rows = layout.rows.filter(row => row.list === 'installed-list' && row.authorsCut !== undefined);
            if (rows.length === 0) {
                return { value: `${NOT_MEASURABLE} (no authors)`, pass: false };
            }
            const cut = rows.filter(row => row.authorsCut).map(row => row.name);
            return { value: cut.length === 0 ? `${rows.length} authors, none cut` : `cut: ${cut.join(', ')} (of ${rows.length})`, pass: cut.length === 0 };
        }
        case 'PF-4': {
            if (layout.primaryEdges.length === 0) {
                return { value: `${NOT_MEASURABLE} (no primary toolbar button)`, pass: false };
            }
            return {
                value: layout.primaryEdges.map(pair => `${pair.list}: button ${pair.button}, scroll port ${pair.listRight} (${tenth(pair.listRight - pair.button)}; listbox ${pair.listboxRight})`).join('; '),
                pass: layout.primaryEdges.every(pair => Math.abs(pair.listRight - pair.button) <= tolerance),
            };
        }
        case 'MS-8': {
            if (scope === 'first-row') {
                if (layout.firstRow === undefined) {
                    return { value: `${NOT_MEASURABLE} (no first row)`, pass: false };
                }
                // The first state of its surface, theme, width and look is the reference.
                if (reference === undefined || reference.firstRow === undefined) {
                    return { value: `reference ${layout.firstRow}`, pass: true };
                }
                return { value: `${layout.firstRow} (${reference.state} ${reference.firstRow})`, pass: near(layout.firstRow, reference.firstRow, tolerance) };
            }
            const rectText = (rect: ChromeRect): string => `${rect.left},${rect.top} ${rect.width}×${rect.height}`;
            const present = Object.entries(layout.chrome).filter((entry): entry is [string, ChromeRect] => entry[1] !== undefined);
            if (present.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            if (reference === undefined) {
                return { value: `reference (${present.map(([name, rect]) => `${name} ${rectText(rect)}`).join('; ')})`, pass: true };
            }
            // An element the reference lacks is new here: the capture suite adds it to the reference.
            const moved = present.flatMap(([name, rect]) => {
                const before = reference.chrome[name];
                if (before === undefined) {
                    return [];
                }
                const delta = Math.max(Math.abs(rect.left - before.left), Math.abs(rect.top - before.top), Math.abs(rect.width - before.width), Math.abs(rect.height - before.height));
                return delta > tolerance ? [`${name} ${rectText(before)} → ${rectText(rect)}`] : [];
            });
            // Chrome that disappears fails too, but for the tab strip while the Browse view is shown (`layout.browsing`).
            const absent = Object.keys(reference.chrome).filter(name => reference.chrome[name] !== undefined && layout.chrome[name] === undefined);
            const exempt = (name: string): boolean => name === 'tab-bar' && layout.browsing;
            const missing = absent.filter(name => !exempt(name));
            const gone = absent.length > 0 ? `; not shown: ${absent.map(name => (exempt(name) ? `${name} (browsing)` : name)).join(', ')}` : '';
            return { value: moved.length === 0 ? `still (as ${reference.state})${gone}` : `moved against ${reference.state}: ${moved.join('; ')}${gone}`, pass: moved.length === 0 && missing.length === 0 };
        }
        case 'DS-INSET-3': {
            const check = (label: string, ends: readonly number[], target: number) => ({ text: `${label} ${tally(ends)} (target ${target})`, pass: ends.every(end => near(end, target, tolerance)) });
            const parts: Array<{ text: string; pass: boolean }> = [];
            const actions = (compact: boolean) => layout.rows.filter(row => row.compact === compact && row.actionsEnd !== undefined).map(row => row.actionsEnd as number);
            if (scope === 'rows' && actions(false).length > 0) {
                parts.push(check('row actions', actions(false), TRAILING.rowAction));
            }
            if (scope === 'headers') {
                const groups = layout.sections.filter(section => section.variant === 'group' && section.trailingEnd !== undefined).map(section => section.trailingEnd as number);
                const surfaces = [...(layout.mainHeader === undefined ? [] : [layout.mainHeader.end]), ...layout.toolbars.flatMap(toolbar => (toolbar.insets === undefined ? [] : [toolbar.insets.end]))];
                if (groups.length > 0) {
                    parts.push(check('group headers', groups, TRAILING.surface));
                }
                if (surfaces.length > 0) {
                    parts.push(check('header and toolbars', surfaces, TRAILING.surface));
                }
            }
            if (scope === 'sidebar') {
                const panes = layout.sections.filter(section => section.variant === 'pane' && section.trailingEnd !== undefined).map(section => section.trailingEnd as number);
                if (panes.length > 0) {
                    parts.push(check('section headers', panes, TRAILING.sidebarHeader[look]));
                }
                if (actions(true).length > 0) {
                    parts.push(check('row actions', actions(true), TRAILING.rowAction));
                }
            }
            if (parts.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            return { value: parts.map(part => part.text).join('; '), pass: parts.every(part => part.pass) };
        }
        case 'DS-OVERFLOW-2': {
            const overflow = layout.overflow;
            if (overflow.containers === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const found = [
                ...(overflow.collisions.length > 0 ? [`collisions: ${overflow.collisions.join('; ')}`] : []),
                ...(overflow.outside.length > 0 ? [`outside: ${overflow.outside.join('; ')}`] : []),
                ...(overflow.clipped.length > 0 ? [`clipped: ${overflow.clipped.join(', ')}`] : []),
            ];
            const badges = overflow.badges.length > 0 ? `; badges: ${overflow.badges.join('; ')}` : '';
            return { value: `${overflow.count} offending in ${overflow.containers} containers${found.length > 0 ? ` (${found.join('; ')})` : ''}${badges}`, pass: overflow.count === 0 };
        }
        case 'DS-OVERFLOW-6': {
            const page = layout.documentOverflow;
            if (page === undefined) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const fits = page.scrollHeight <= page.clientHeight + tolerance && page.scrollWidth <= page.clientWidth + tolerance;
            const size = `document ${page.clientWidth}×${page.clientHeight}`;
            return {
                value: fits ? `${size} fits` : `${size}, scroll ${page.scrollWidth}×${page.scrollHeight} (+${page.scrollHeight - page.clientHeight}); outside: ${page.outside ?? 'none past the viewport'}`,
                pass: fits,
            };
        }
        case 'DS-ROW-5': {
            const rows = layout.rows.filter(row => row.compact === (scope === 'sidebar'));
            if (rows.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            // The name truncates last: never while the row still shows its version or a badge, and always with an ellipsis.
            // The version shares the name's line in a compact row only; a comfortable row's version is on its second line.
            const early = rows.filter(row => row.nameCut && (row.badgesShown > 0 || (row.compact && row.versionShown && !row.versionCut))).map(row => row.name);
            const plain = rows.filter(row => !row.nameEllipsis).length;
            const cut = rows.filter(row => row.nameCut).length;
            return {
                value: `${rows.length} rows, ${cut} names cut${early.length > 0 ? `; cut before the version or badges: ${early.join(', ')}` : ''}${plain > 0 ? `; no ellipsis ${plain}` : ''}`,
                pass: early.length === 0 && plain === 0,
            };
        }
        default:
            return undefined;
    }
}

/** The value and the verdict of one rule in one scope, or undefined when no helper measures that scope. */
function evaluate(definition: RuleDefinition, scope: Scope, layout: Layout, look: 'modern' | 'classic', workbench: WorkbenchHeights, reference: ChromeReference | undefined): { value: string; pass: boolean } | undefined {
    const tolerance = definition.tolerance;
    if (!layout.root) {
        return { value: `${NOT_MEASURABLE} (no root)`, pass: false };
    }
    const heightVerdict = evaluateHeights(definition, layout, look, workbench) ?? evaluateOverflow(definition, scope, layout, look, reference);
    if (heightVerdict !== undefined) {
        return heightVerdict;
    }
    switch (definition.id) {
        case 'PF-6': {
            const lefts = Object.entries(layout.mainLefts);
            if (lefts.length === 0 || lefts.some(([, x]) => x === undefined)) {
                return { value: `${NOT_MEASURABLE} (${lefts.filter(([, x]) => x === undefined).map(([name]) => name).join(', ') || 'no main panel'})`, pass: false };
            }
            // P9.fix-6's tolerance: every edge within 1 px of the title's.
            const edges = Object.fromEntries(lefts) as Record<string, number>;
            const xs = Object.values(edges);
            const spread = tenth(Math.max(...xs) - Math.min(...xs));
            return {
                value: `spread ${spread} (${lefts.map(([name, x]) => `${name} ${tenth(x as number)}`).join(', ')})`,
                pass: edges.title !== undefined && xs.every(x => near(x, edges.title, tolerance)),
            };
        }
        case 'DS-GRID-1':
            if (layout.examined === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            return { value: layout.offRampCount === 0 ? '0 off-ramp' : `${layout.offRampCount} off-ramp (${layout.offRamp.join('; ')})`, pass: layout.offRampCount === 0 };
        case 'DS-GRID-2a': {
            if (layout.blockGaps.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const off = layout.blockGaps.filter(gap => !BLOCK_GAPS.some(step => near(gap, step, tolerance)));
            const distinct = [...new Set(layout.blockGaps)].sort((a, b) => a - b);
            return { value: `gaps ${distinct.join(', ')}${off.length > 0 ? ` (${off.length} off {4, 8})` : ''}`, pass: off.length === 0 };
        }
        case 'DS-GRID-2b': {
            const measured = layout.sections.filter(section => section.above !== undefined && section.below !== undefined);
            if (measured.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const far = measured.filter(section => (section.below as number) > (section.above as number) + tolerance);
            return { value: measured.map(section => `${section.id} ${section.above}/${section.below}`).join('; '), pass: far.length === 0 };
        }
        case 'DS-INSET-1': {
            if (scope === 'main-installed') {
                const lefts = Object.entries(layout.mainLefts).filter(([, x]) => x !== undefined) as Array<[string, number]>;
                if (layout.mainRegionLeft === undefined || lefts.length === 0) {
                    return { value: NOT_MEASURABLE, pass: false };
                }
                const region = layout.mainRegionLeft;
                const insets = lefts.map(([name, x]) => [name, tenth(x - region)] as const);
                return { value: insets.map(([name, inset]) => `${name} ${inset}`).join(', '), pass: insets.every(([, inset]) => near(inset, MAIN_INSET, tolerance)) };
            }
            if (scope === 'details') {
                if (layout.details === undefined) {
                    return { value: NOT_MEASURABLE, pass: false };
                }
                const inset = tenth(layout.details.contentLeft - layout.details.regionLeft);
                return { value: `content ${inset}`, pass: near(inset, DETAILS_INSET, tolerance) };
            }
            if (scope === 'sidebar') {
                const sidebar = layout.sidebar;
                if (sidebar === undefined || (sidebar.titles.length === 0 && sidebar.names.length === 0)) {
                    return { value: NOT_MEASURABLE, pass: false };
                }
                const expected = SIDEBAR_INSETS[look];
                const content = [...sidebar.titles, ...sidebar.names].map(x => tenth(x - sidebar.rootLeft));
                const search = sidebar.search === undefined ? undefined : tenth(sidebar.search - sidebar.rootLeft);
                const pass = content.every(inset => near(inset, expected.content, tolerance)) && (search === undefined || near(search, expected.header, tolerance));
                return { value: `content ${[...new Set(content)].sort((a, b) => a - b).join(', ')}; search ${search ?? 'absent'}`, pass };
            }
            return undefined;
        }
        case 'DS-INSET-2': {
            const sectionBoxes = layout.sections.map(section => [section.id, section.variant, section.insets] as [string, string, Insets | undefined]);
            let boxes: Array<[string, string, Insets | undefined]>;
            switch (scope) {
                case 'toolbars':
                    boxes = layout.toolbars.map(toolbar => [toolbar.id, '', toolbar.insets]);
                    break;
                case 'headers':
                    boxes = sectionBoxes;
                    break;
                case 'main-header':
                    boxes = [['main-header', '', layout.mainHeader]];
                    break;
                case 'sidebar':
                    boxes = [['sidebar-header', '', layout.sidebarHeader], ...sectionBoxes];
                    break;
                default:
                    return undefined;
            }
            const measured = boxes.filter(([, , insets]) => insets !== undefined) as Array<[string, string, Insets]>;
            if (measured.length === 0) {
                return { value: NOT_MEASURABLE, pass: false };
            }
            const value = measured.length === 1 && scope !== 'headers' ? insetText(measured[0][2]) : measured.map(([id, , insets]) => `${id} ${insetText(insets)}`).join('; ');
            return { value, pass: measured.every(([id, variant, insets]) => meetsInset(insets, insetTarget(scope, id, variant, look), tolerance)) };
        }
        default:
            return undefined;
    }
}

/** WebDriver returns the collector's `undefined` as `null`; the rules read absent as `undefined`. */
function withoutNulls<T>(value: T): T {
    if (value === null) {
        return undefined as T;
    }
    if (Array.isArray(value)) {
        return value.map(withoutNulls) as T;
    }
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as object).map(([key, entry]) => [key, withoutNulls(entry)])) as T;
    }
    return value;
}

/** Every line of a state: one per rule and scope that applies, in `RULES` order. */
export function measureLines(state: string, collected: Layout, look: 'modern' | 'classic', workbench: WorkbenchHeights = {}, reference?: ChromeReference, width?: number): MeasureLine[] {
    const layout = withoutNulls(collected);
    const chromeReference = reference === undefined ? undefined : withoutNulls(reference);
    const group = stateGroup(state);
    const lines: MeasureLine[] = [];
    for (const definition of RULES) {
        // The capture's own width when given (PF-3a at 1200), else the webview's.
        if (!appliesTo(definition, state, width ?? layout.width)) {
            continue;
        }
        for (const scope of [group, ...elementGroups(group, state)] as Scope[]) {
            const declared = definition.scopes[scope];
            if (declared === undefined) {
                continue;
            }
            // A hard scope that a state does not hold in yet prints as pending on the item named for that state.
            const later = definition.pendingStates?.[state];
            const status: RuleStatus = declared === 'hard' && later !== undefined ? { pending: later } : declared;
            // A scope with a status and no helper is never silent: it prints, and a hard one fails.
            const result = evaluate(definition, scope, layout, look, workbench, chromeReference) ?? { value: `${NOT_MEASURABLE} (no helper)`, pass: false };
            const name = scope === group ? `${definition.id}@${state}` : `${definition.id}@${state}/${scope}`;
            lines.push({ name, value: result.value, status, pass: result.pass });
        }
    }
    return lines;
}

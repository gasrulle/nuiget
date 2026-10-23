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
 * (PF-3b).
 *
 * Plain data and string scripts: the module needs no DOM types (tsconfig.test.json has none) and no ExTester import, so
 * `src/test/lint` can import its registry.
 */

export type RuleStatus = 'hard' | { pending: string };

/** The state groups of Appendix B ("main" is the main panel's Installed states). */
export type StateGroup = 'main-installed' | 'main-updates' | 'browse' | 'details' | 'dialogs' | 'sources' | 'sidebar';

/** The element groups Appendix B names for DS-INSET-2 (the sidebar is a state group there). */
export type ElementGroup = 'toolbars' | 'headers' | 'main-header';

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
    helper: 1 | 2 | 3 | 4;
    scopes: Partial<Record<Scope, RuleStatus>>;
    tolerance: number;
    /** States the rule is limited to (PF-6), or undefined for every state of its scopes. */
    states?: readonly string[];
    /** A pattern the state's name must match (DS-HEIGHT-11's loading states), or undefined. */
    statePattern?: RegExp;
}

/** Whether a rule measures a state at all; its scopes then say for which state group. */
export const appliesTo = (definition: RuleDefinition, state: string): boolean =>
    (definition.states === undefined || definition.states.includes(state)) && (definition.statePattern === undefined || definition.statePattern.test(state));

export function rule(id: string, options: Omit<RuleDefinition, 'id'>): RuleDefinition {
    return { id, ...options };
}

const asGrid1 = { 'main-updates': { pending: 'P3.1b' }, browse: { pending: 'P3.2' }, details: { pending: 'P3.3b' }, dialogs: { pending: 'P3.5' }, sources: { pending: 'P3.6' }, sidebar: { pending: 'P3.7a' } } as const;

/** One pending item for the state groups where a rule's elements are rendered. */
const on = (item: string, ...groups: StateGroup[]): Partial<Record<Scope, RuleStatus>> => Object.fromEntries(groups.map(group => [group, { pending: item }]));

const MAIN: StateGroup[] = ['main-installed', 'main-updates', 'browse', 'details'];

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

/** The element groups DS-INSET-2 measures in a state group. */
export function elementGroups(group: StateGroup): ElementGroup[] {
    switch (group) {
        case 'main-installed':
        case 'main-updates':
            return ['toolbars', 'headers', 'main-header'];
        case 'browse':
            return ['main-header'];
        case 'details':
            return ['headers', 'main-header'];
        default:
            return [];
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
}

/**
 * Runs in the webview: `arguments[0]` is the root's test id, `arguments[1]` the ramp, `arguments[2]` the gap
 * tolerance. Returns `Layout`.
 */
export const COLLECT_LAYOUT = `
const [rootTestId, ramp, tolerance] = arguments;
const root = document.querySelector('[data-testid="' + rootTestId + '"]');
if (!root) return { root: false, examined: 0, offRamp: [], offRampCount: 0, blockGaps: [], sections: [], toolbars: [], mainHeader: undefined, sidebarHeader: undefined, mainLefts: {}, mainRegionLeft: undefined, details: undefined, sidebar: undefined, heights: { headers: [], compactRows: [], comfortableRows: [], comfortablePitches: [], tabStrip: undefined, detailsTabs: undefined, buttons: [], inputs: [], iconButtons: [], checkBoxes: [], checkSelect: { fill: '', border: '' }, badges: [], progress: [] }, centring: [], detailsButtons: { uninstall: undefined, update: undefined } };
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
        // The visible label is the badge's own text; a title goes into a visually hidden child.
        const text = [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
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
return { root: true, examined, offRamp, offRampCount, blockGaps, sections, toolbars, mainHeader: contentInsets(header), sidebarHeader: sidebarHeader ? contentInsets(sidebarHeader) : undefined, mainLefts, mainRegionLeft, details, sidebar, heights, centring, detailsButtons };
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

/** The value and the verdict of one rule in one scope, or undefined when no helper measures that scope. */
function evaluate(definition: RuleDefinition, scope: Scope, layout: Layout, look: 'modern' | 'classic', workbench: WorkbenchHeights): { value: string; pass: boolean } | undefined {
    const tolerance = definition.tolerance;
    if (!layout.root) {
        return { value: `${NOT_MEASURABLE} (no root)`, pass: false };
    }
    const heightVerdict = evaluateHeights(definition, layout, look, workbench);
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
export function measureLines(state: string, collected: Layout, look: 'modern' | 'classic', workbench: WorkbenchHeights = {}): MeasureLine[] {
    const layout = withoutNulls(collected);
    const group = stateGroup(state);
    const lines: MeasureLine[] = [];
    for (const definition of RULES) {
        if (!appliesTo(definition, state)) {
            continue;
        }
        for (const scope of [group, ...elementGroups(group)] as Scope[]) {
            const status = definition.scopes[scope];
            if (status === undefined) {
                continue;
            }
            // A scope with a status and no helper is never silent: it prints, and a hard one fails.
            const result = evaluate(definition, scope, layout, look, workbench) ?? { value: `${NOT_MEASURABLE} (no helper)`, pass: false };
            const name = scope === group ? `${definition.id}@${state}` : `${definition.id}@${state}/${scope}`;
            lines.push({ name, value: result.value, status, pass: result.pass });
        }
    }
    return lines;
}

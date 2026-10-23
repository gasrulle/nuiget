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
 * (DS-GRID-1, DS-GRID-2a, DS-GRID-2b), helper 2 shared insets (DS-INSET-1, DS-INSET-2, PF-6).
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
} as const;

/** The spacing ramp of DS-GRID-1, in px. */
export const RAMP: readonly number[] = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40];

/** The block gaps of DS-GRID-2a: 4 inside a group, 8 between groups (premise P-1). */
export const BLOCK_GAPS: readonly number[] = [4, 8];

/** The main panel's shared start inset (DS-INSET-1) and the details pane's (DS-INSET-4's 20). */
export const MAIN_INSET = 16;
export const DETAILS_INSET = 20;

/** A rule of the registry: its helper, a status per scope (Appendix B) and its tolerance. */
export interface RuleDefinition {
    id: string;
    helper: 1 | 2;
    scopes: Partial<Record<Scope, RuleStatus>>;
    tolerance: number;
    /** States the rule is limited to (PF-6), or undefined for every state of its scopes. */
    states?: readonly string[];
}

export function rule(id: string, options: Omit<RuleDefinition, 'id'>): RuleDefinition {
    return { id, ...options };
}

const asGrid1 = { 'main-updates': { pending: 'P3.1b' }, browse: { pending: 'P3.2' }, details: { pending: 'P3.3b' }, dialogs: { pending: 'P3.5' }, sources: { pending: 'P3.6' }, sidebar: { pending: 'P3.7a' } } as const;

export const RULES: readonly RuleDefinition[] = [
    rule('PF-6', { helper: 2, scopes: { 'main-installed': 'hard' }, tolerance: TOLERANCES.coincide, states: ['main-installed-single'] }),
    rule('DS-GRID-1', { helper: 1, scopes: { 'main-installed': { pending: 'P2.7' }, ...asGrid1 }, tolerance: TOLERANCES.gapMembership }),
    rule('DS-GRID-2a', { helper: 1, scopes: { 'main-installed': { pending: 'P2.7' }, ...asGrid1 }, tolerance: TOLERANCES.gapMembership }),
    rule('DS-GRID-2b', { helper: 1, scopes: { 'main-installed': { pending: 'P2.6' }, ...asGrid1 }, tolerance: TOLERANCES.proximity }),
    rule('DS-INSET-1', { helper: 2, scopes: { 'main-installed': { pending: 'P2.7' }, details: { pending: 'P3.3b' }, sidebar: { pending: 'P3.7a' } }, tolerance: TOLERANCES.coincide }),
    rule('DS-INSET-2', { helper: 2, scopes: { toolbars: { pending: 'P2.5' }, headers: { pending: 'P2.6' }, 'main-header': { pending: 'P2.7' }, sidebar: { pending: 'P3.7a' } }, tolerance: TOLERANCES.coincide }),
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
}

/**
 * Runs in the webview: `arguments[0]` is the root's test id, `arguments[1]` the ramp, `arguments[2]` the gap
 * tolerance. Returns `Layout`.
 */
export const COLLECT_LAYOUT = `
const [rootTestId, ramp, tolerance] = arguments;
const root = document.querySelector('[data-testid="' + rootTestId + '"]');
if (!root) return { root: false, examined: 0, offRamp: [], offRampCount: 0, blockGaps: [], sections: [], toolbars: [], mainHeader: undefined, sidebarHeader: undefined, mainLefts: {}, mainRegionLeft: undefined, details: undefined, sidebar: undefined };
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
    for (const prop of props) {
        const raw = style.getPropertyValue(prop);
        if (raw === 'normal' || raw === 'auto' || raw === '') continue;
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
const firstNameBelow = box => {
    for (let el = box; el && el !== scope; el = el.parentElement) {
        for (let next = el.nextElementSibling; next; next = next.nextElementSibling) {
            if (getComputedStyle(next).display === 'none') continue;
            const name = next.matches('.nuiget-row-name') ? next : next.querySelector('.nuiget-row-name');
            const rects = name ? leafRects(name) : leafRects(next);
            if (rects.length > 0) return Math.min(...rects.map(r => r.top));
        }
    }
    return undefined;
};
const sections = [...scope.querySelectorAll('[data-testid^="section-box-"]')].filter(visible).map(box => {
    const title = union(leafRects(box.querySelector('.nuiget-section-title') ?? box));
    const edge = title ? lastEdgeAbove(box) : undefined;
    const name = title ? firstNameBelow(box) : undefined;
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
return { root: true, examined, offRamp, offRampCount, blockGaps, sections, toolbars, mainHeader: contentInsets(header), sidebarHeader: sidebarHeader ? contentInsets(sidebarHeader) : undefined, mainLefts, mainRegionLeft, details, sidebar };
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

/** The value and the verdict of one rule in one scope, or undefined when no helper measures that scope. */
function evaluate(definition: RuleDefinition, scope: Scope, layout: Layout, look: 'modern' | 'classic'): { value: string; pass: boolean } | undefined {
    const tolerance = definition.tolerance;
    if (!layout.root) {
        return { value: `${NOT_MEASURABLE} (no root)`, pass: false };
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

/** Every line of a state: one per rule and scope that applies, in `RULES` order. */
export function measureLines(state: string, layout: Layout, look: 'modern' | 'classic'): MeasureLine[] {
    const group = stateGroup(state);
    const lines: MeasureLine[] = [];
    for (const definition of RULES) {
        if (definition.states !== undefined && !definition.states.includes(state)) {
            continue;
        }
        for (const scope of [group, ...elementGroups(group)] as Scope[]) {
            const status = definition.scopes[scope];
            if (status === undefined) {
                continue;
            }
            // A scope with a status and no helper is never silent: it prints, and a hard one fails.
            const result = evaluate(definition, scope, layout, look) ?? { value: `${NOT_MEASURABLE} (no helper)`, pass: false };
            const name = scope === group ? `${definition.id}@${state}` : `${definition.id}@${state}/${scope}`;
            lines.push({ name, value: result.value, status, pass: result.pass });
        }
    }
    return lines;
}

/**
 * The accessibility harness of the named states (UX-P0.23; H17, H30, H31, H46, H47; `a11y-full-axe-real-page`). The
 * capture suite runs it once per state and run, at the state's first capture, after the screenshot:
 *
 * - the full axe ruleset over the whole page with the state's layers open: every rule axe enables by default,
 *   best-practice included, plus `target-size` and `label-content-name-mismatch`, which axe 4.12 leaves off. A violation
 *   fails the capture unless `AXE_PENDING` names the item that removes it or `AXE_ACCEPTED` the decision that declares it
 *   (scoped to a selector or a surface); an `incomplete` result fails unless it is `color-contrast` inside the details pane,
 *   tolerated until P3.4 (A5, the ruling of P5.12b), or `AXE_PENDING` names the item that removes it;
 * - a snapshot of the accessible tree, read from inside the webview with axe's own role and name functions (no CDP:
 *   whether ChromeDriver reaches the webview's out-of-process frame is unverified, H31), compared with
 *   `src/test/ui/v2/aria/<state>.json` and written beside the crops for adoption. It is read once the state's data has
 *   settled (no busy element, the tabs' counts, every comfortable row's authors; a bounded wait after the shot). Digits are
 *   masked (versions, counts, sizes), so a fixture's new release does not change a snapshot; their presence is not.
 *
 * UX-P0.24 (H48, H86, H87; `a11y-reduced-motion-both-signals`) adds the keyboard walks' and the motion check's scripts,
 * expectations and verdicts: the capture suite walks Tab from the search box on four screens and presses the row and dialog
 * keys of interaction model §5 that write nothing (`[keys]` lines; a stop is recorded as a line of the screen's ARIA
 * snapshot), and reads what moves under VS Code's reduce-motion signal (`[motion]` lines).
 *
 * Plain data and string scripts, like `measure.ts`: `src/test/lint` imports it without ExTester.
 */
import { composite, contrastRatio, parseCssColor, thresholdFor } from './contrast';
import type { RuleStatus } from './measure';

/** The rule of the tracker's a11y table this harness holds (`a11y-full-axe-real-page`, A5). */
export const FULL_AXE_RULE = 'a11y-full-axe-real-page';

/** Its status: `hard` since the closing commit of P0.23, which triaged the first run's results (design-advisor ruling). */
export const FULL_AXE_STATUS: RuleStatus = 'hard';

/** The rules axe 4.12 leaves off that the harness turns on (H47). */
export const AXE_EXTRA_RULES: readonly string[] = ['target-size', 'label-content-name-mismatch'];

/** At most this many nodes of a rule travel back over WebDriver; `count` keeps the total. */
export const AXE_NODES_PER_RULE = 8;

export interface AxeNode {
    target: string;
    summary: string;
    insideDetails: boolean;
}

export interface AxeRule {
    id: string;
    impact: string | null;
    count: number;
    /** The nodes of all `count` outside `package-details-panel`, counted before the cap. */
    outsideDetails: number;
    /** Axe's messages over all `count` nodes, most frequent first, at most three: why a node failed or stayed undecided. */
    reasons: Array<{ text: string; count: number }>;
    /** Per selector of `AXE_ACCEPTED`, the nodes of all `count` whose element matches it, counted before the cap. */
    accepted: Record<string, number>;
    nodes: AxeNode[];
}

export interface FullAxe {
    violations: AxeRule[];
    incomplete: AxeRule[];
    passes: number;
    inapplicable: number;
    /** Every `color-contrast` target axe left undecided outside the details pane, uncapped: the resolve pass's input (UX-P0.25). */
    undecidedContrast?: string[];
    error?: string;
}

/** In-page: axe's check messages over a result's nodes, most frequent first, at most three (shared by the scripts below). */
const REASONS_OF = `
const reasonsOf = nodes => {
    const tally = new Map();
    for (const node of nodes) {
        const text = [...node.any, ...node.all, ...node.none].map(check => check.message).filter(Boolean).join(' | ').slice(0, 160) || 'no message';
        tally.set(text, (tally.get(text) || 0) + 1);
    }
    return [...tally].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([text, count]) => ({ text, count }));
};
`;

/**
 * Runs in the webview, asynchronously (`executeAsyncScript`): `arguments[0]` the extra rules, `arguments[1]` the node cap,
 * `arguments[2]` the selectors of `AXE_ACCEPTED`. Answers a `FullAxe` as JSON, small enough for the WebDriver channel.
 */
export const RUN_FULL_AXE = `
const done = arguments[arguments.length - 1];
const [extra, cap, selectors] = arguments;
const matching = (target, selector) => {
    try {
        const element = document.querySelector(target);
        return element !== null && element.matches(selector);
    } catch (error) {
        return false;
    }
};
${REASONS_OF}
const details = document.querySelector('[data-testid="package-details-panel"]');
const inside = target => {
    try {
        const element = document.querySelector(target);
        return details !== null && element !== null && details.contains(element);
    } catch (error) {
        return false;
    }
};
const rules = list => list.map(result => {
    const nodes = result.nodes.map(node => {
        const target = node.target.map(String).join(' ');
        return { target, summary: node.failureSummary || node.any.map(check => check.message).join('; '), insideDetails: inside(target) };
    });
    const reasons = reasonsOf(result.nodes);
    const accepted = Object.fromEntries(selectors.map(selector => [selector, nodes.filter(node => matching(node.target, selector)).length]));
    return { id: result.id, impact: result.impact || null, count: nodes.length, outsideDetails: nodes.filter(node => !node.insideDetails).length, reasons, accepted, nodes: nodes.slice(0, cap) };
});
axe.run(document, {
    rules: Object.fromEntries(extra.map(id => [id, { enabled: true }])),
    resultTypes: ['violations', 'incomplete'],
}).then(results => done(JSON.stringify({
    violations: rules(results.violations),
    incomplete: rules(results.incomplete),
    passes: results.passes.length,
    inapplicable: results.inapplicable.length,
    undecidedContrast: results.incomplete.filter(result => result.id === 'color-contrast').flatMap(result => result.nodes).map(node => node.target.map(String).join(' ')).filter(target => !inside(target)),
})), error => done(JSON.stringify({ violations: [], incomplete: [], passes: 0, inapplicable: 0, error: String(error) })));
`;

/** A violation or an incomplete result the item that removes it is named for; `states` limits it, else every state. */
export interface AxePending {
    rule: string;
    kind: 'violation' | 'incomplete';
    item: string;
    states?: readonly string[];
}

/**
 * The axe results of today's tree that later items remove, each with its item; the state lists are exact, never widened,
 * never a wildcard. Empty since UX-P0.25: the three undecided `color-contrast` cases of UX-P0.23 (rows beyond a scroller's
 * fold, the empty messages under the quick-search popup, the Update-all dialog's bullets over the content beneath it) are
 * decided by the resolve pass (`RESOLVE_CONTRAST`), which decided every node of their 17 states in run 40152178889, in both
 * looks (design-advisor ruling of 2026-10-25, UX-P0.25). A state that prints an unresolved node again fails hard.
 */
export const AXE_PENDING: readonly AxePending[] = [];

/** A violation a decision declares by design, on the nodes of one selector or on one surface; `ruling` names the decision. */
export interface AxeAccepted {
    rule: string;
    kind: 'violation' | 'incomplete';
    selector?: string;
    surface?: 'main' | 'sidebar';
    ruling: string;
}

/** The violations declared by design (design-advisor ruling of 2026-10-25, UX-P0.23; `docs/design/DECISIONS.md`). */
export const AXE_ACCEPTED: readonly AxeAccepted[] = [
    // The row is named by id and version and described by its other spans (DS §7, T-27, DS-ROW-5, CA-R5); the experimental
    // rule reads every visible span as the label. A button or tab whose name drops its visible text still fails.
    { rule: 'label-content-name-mismatch', kind: 'violation', selector: '.nuiget-row-option', ruling: 'DECISIONS.md 2026-10-25: the row keeps its triad' },
    // The view's title is the host's pane header, as for every native pane; the main panel keeps its h1.
    { rule: 'page-has-heading-one', kind: 'violation', surface: 'sidebar', ruling: 'DECISIONS.md 2026-10-25: the sidebar view has no h1' },
    // The hit is an ::after inside the button, which axe's getBoundingClientRect cannot see; DS-HEIGHT-8 measures it in every
    // state, so this reading blinds nothing (UX-P2.5).
    { rule: 'target-size', kind: 'violation', selector: '.nuiget-icon-button', ruling: 'DECISIONS.md 2026-10-31: an icon button paints 22 (20 in a pane header) and hits 24 through its ::after, which axe cannot read; DS-HEIGHT-8 measures the hit in every state' },
    // A tabindex=-1 icon button makes axe ask whether it is a target; it is, by pointer, and its hit is DS-HEIGHT-8's.
    { rule: 'target-size', kind: 'incomplete', selector: '.nuiget-icon-button', ruling: 'DECISIONS.md 2026-10-31: an icon button paints 22 (20 in a pane header) and hits 24 through its ::after, which axe cannot read; DS-HEIGHT-8 measures the hit in every state' },
    // A section toggle paints its header's height; its 24 px hit is an ::after axe cannot read, and DS-HEIGHT-8 measures it.
    { rule: 'target-size', kind: 'violation', selector: '.nuiget-section-toggle', ruling: 'DECISIONS.md 2026-10-31: a section toggle is as high as its header (DS-HEIGHT-1, 22 in classic) and hits 24 through its ::after, which axe cannot read; DS-HEIGHT-8 measures the hit in every state' },
    { rule: 'target-size', kind: 'incomplete', selector: '.nuiget-section-toggle', ruling: 'DECISIONS.md 2026-10-31: a section toggle is as high as its header (DS-HEIGHT-1, 22 in classic) and hits 24 through its ::after, which axe cannot read; DS-HEIGHT-8 measures the hit in every state' },
    // A group row's height is DS-HEIGHT-1's; its band cannot grow a hit without covering its neighbours.
    { rule: 'target-size', kind: 'violation', selector: '.nuiget-row-group', ruling: 'DECISIONS.md 2026-10-31: a group row is a pane header\'s height (DS-HEIGHT-1, M 28 / C 22), the workbench\'s own tree row; its band is the target and no ::after may overlap its neighbours' },
    { rule: 'target-size', kind: 'incomplete', selector: '.nuiget-row-group', ruling: 'DECISIONS.md 2026-10-31: a group row is a pane header\'s height (DS-HEIGHT-1, M 28 / C 22), the workbench\'s own tree row; its band is the target and no ::after may overlap its neighbours' },
];

/** The selectors `RUN_FULL_AXE` counts nodes against. */
export const acceptedSelectors = (accepted: readonly AxeAccepted[] = AXE_ACCEPTED): string[] =>
    [...new Set(accepted.flatMap(entry => (entry.selector === undefined ? [] : [entry.selector])))];

/** The selectors the theme pass drops from its `target-size` violations: the one registry, read for that rule alone. */
export const acceptedTargetSelectors = (): string[] => acceptedSelectors(AXE_ACCEPTED.filter(entry => entry.rule === 'target-size'));

/** The acceptance that covers a result: every node on its selector, or the state's surface. */
const acceptedFor = (rule: AxeRule, surface: 'main' | 'sidebar', accepted: readonly AxeAccepted[], kind: AxeAccepted['kind']): { ruling: string; where: string } | undefined => {
    const entries = accepted.filter(entry => entry.rule === rule.id && entry.kind === kind);
    const bySelector = entries.filter(entry => entry.selector !== undefined);
    const countOf = (entry: AxeAccepted): number => rule.accepted?.[entry.selector as string] ?? 0;
    // The sum, so a rule whose nodes span two declared selectors is accepted, and a node on none of them still fails.
    if (bySelector.length > 0 && bySelector.reduce((sum, entry) => sum + countOf(entry), 0) === rule.count) {
        const hit = bySelector.filter(entry => countOf(entry) > 0);
        const where = hit.length === 1 ? hit[0].selector as string : hit.map(entry => `${entry.selector} ×${countOf(entry)}`).join(', ');
        return { ruling: hit.map(entry => entry.ruling).join('; '), where };
    }
    const bySurface = entries.find(entry => entry.surface !== undefined && entry.surface === surface);
    return bySurface === undefined ? undefined : { ruling: bySurface.ruling, where: `the ${surface}` };
};

const pendingFor = (state: string, kind: AxePending['kind'], rule: string, registry: readonly AxePending[]): AxePending | undefined =>
    registry.find(entry => entry.rule === rule && entry.kind === kind && (entry.states === undefined || entry.states.includes(state)));

const statusText = (status: RuleStatus): string => (status === 'hard' ? 'hard' : `pending ${status.pending}`);

/**
 * The `[axe]` lines of a state and the failures among them: one summary line, then one line per violation or incomplete
 * rule. A failure is a result neither tolerated, accepted nor pending; it fails the capture only while `status` is `hard`.
 * `surface` is the state's own (`NamedState.surface`), never read from its name.
 */
export function axeLines(state: string, surface: 'main' | 'sidebar', result: FullAxe, status: RuleStatus = FULL_AXE_STATUS, registry: readonly AxePending[] = AXE_PENDING, accepted: readonly AxeAccepted[] = AXE_ACCEPTED, resolvedContrast?: { unresolved: number }): { lines: string[]; failures: string[] } {
    if (result.error !== undefined) {
        return { lines: [`[axe] ${state}: axe.run failed: ${result.error} (${statusText(status)})`], failures: [`axe.run failed: ${result.error}`] };
    }
    const lines: string[] = [];
    const failures: string[] = [];
    const sample = (rule: AxeRule): string =>
        `${rule.nodes.slice(0, 2).map(node => node.target).join(', ')}${rule.reasons.length > 0 ? `; ${rule.reasons.map(reason => `"${reason.text}" ×${reason.count}`).join('; ')}` : ''}`;
    for (const rule of result.violations) {
        const declared = acceptedFor(rule, surface, accepted, 'violation');
        if (declared !== undefined) {
            lines.push(`[axe] ${state}: violation ${rule.id} ×${rule.count} on ${declared.where} (accepted-as-design: ${declared.ruling})`);
            continue;
        }
        const pending = pendingFor(state, 'violation', rule.id, registry);
        lines.push(`[axe] ${state}: violation ${rule.id} (${rule.impact ?? 'no impact'}) ×${rule.count}: ${sample(rule)} (${pending ? `pending ${pending.item}` : statusText(status)})`);
        if (pending === undefined) {
            failures.push(`violation ${rule.id} ×${rule.count}`);
        }
    }
    for (const rule of result.incomplete) {
        // A5: what axe cannot decide in the details pane is its content below the fold (P5.12b), until P3.4.
        if (rule.id === 'color-contrast' && rule.outsideDetails === 0) {
            lines.push(`[axe] ${state}: incomplete color-contrast ×${rule.count} in the details pane (tolerated until P3.4)`);
            continue;
        }
        // UX-P0.25: the resolve pass decided or measured every undecided node outside the pane; its `[contrast]` lines judge them.
        if (rule.id === 'color-contrast' && resolvedContrast !== undefined && resolvedContrast.unresolved === 0) {
            lines.push(`[axe] ${state}: color-contrast left ${rule.outsideDetails} undecided outside the details pane, all decided by the resolve pass ([contrast] lines)`);
            continue;
        }
        const declared = acceptedFor(rule, surface, accepted, 'incomplete');
        if (declared !== undefined) {
            lines.push(`[axe] ${state}: incomplete ${rule.id} ×${rule.count} on ${declared.where} (accepted-as-design: ${declared.ruling})`);
            continue;
        }
        const pending = pendingFor(state, 'incomplete', rule.id, registry);
        lines.push(`[axe] ${state}: incomplete ${rule.id} ×${rule.count}: ${sample(rule)} (${pending ? `pending ${pending.item}` : statusText(status)})`);
        if (pending === undefined) {
            failures.push(`incomplete ${rule.id} ×${rule.count}`);
        }
    }
    lines.unshift(`[axe] ${state}: ${result.violations.length} violations, ${result.incomplete.length} incomplete, ${result.passes} rules passed, ${result.inapplicable} inapplicable (${FULL_AXE_RULE}, ${statusText(status)})`);
    return { lines, failures };
}

/** One element of the accessible tree as the webview reports it. */
export interface AriaNode {
    depth: number;
    role: string;
    name: string;
    states: string[];
    testid?: string;
}

/**
 * Runs in the webview (synchronously; axe injected): every element visible to a screen reader with a role other than
 * `generic`, `none` or `presentation`, in document order from `document.body` (portaled layers included), with its depth
 * among such elements, its accessible name, its ARIA states and its test id. `axe.setup` builds the tree the commons
 * read; `axe.teardown` releases it so that `axe.run` can set up its own.
 */
export const ARIA_SNAPSHOT = `
if (typeof axe === 'undefined') return { error: 'axe is not injected' };
axe.setup(document);
try {
    const nodes = [];
    const states = el => {
        const out = [];
        const attr = name => el.getAttribute(name);
        if (attr('aria-selected') === 'true') out.push('selected');
        const checked = attr('aria-checked') ?? (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? String(el.indeterminate ? 'mixed' : el.checked) : null);
        if (checked === 'true') out.push('checked'); else if (checked === 'mixed') out.push('mixed'); else if (checked === 'false') out.push('unchecked');
        if (attr('aria-expanded') !== null) out.push(attr('aria-expanded') === 'true' ? 'expanded' : 'collapsed');
        if (attr('aria-disabled') === 'true' || el.disabled === true) out.push('disabled');
        if (attr('aria-current') !== null && attr('aria-current') !== 'false') out.push('current');
        if (attr('aria-pressed') !== null) out.push(attr('aria-pressed') === 'true' ? 'pressed' : 'not pressed');
        if (attr('aria-busy') === 'true') out.push('busy');
        if (attr('aria-haspopup') !== null && attr('aria-haspopup') !== 'false') out.push('haspopup');
        if (attr('aria-level') !== null) out.push('level ' + attr('aria-level'));
        if (attr('aria-multiselectable') === 'true') out.push('multiselectable');
        if (document.activeElement === el) out.push('focused');
        return out;
    };
    const walk = (parent, depth) => {
        for (const child of parent.children) {
            const vNode = axe.utils.getNodeFromTree(child);
            if (!vNode || !axe.commons.dom.isVisibleToScreenReaders(vNode)) continue;
            const role = axe.commons.aria.getRole(vNode, { noPresentational: true });
            const kept = Boolean(role) && role !== 'generic';
            if (kept) {
                nodes.push({ depth, role, name: axe.commons.text.accessibleText(child) || '', states: states(child), testid: child.dataset ? child.dataset.testid : undefined });
            }
            walk(child, kept ? depth + 1 : depth);
        }
    };
    walk(document.body, 0);
    return { nodes };
} finally {
    axe.teardown();
}
`;

/** A committed snapshot: the state and one line per node. */
export interface AriaSnapshot {
    state: string;
    lines: string[];
}

/** Digits masked (versions, counts, sizes, dates), white space collapsed, at most 120 characters. */
export const maskDigits = (text: string): string => text.replace(/\s+/g, ' ').trim().replace(/\d+(?:[.,]\d+)*/g, '#').slice(0, 120);

/** The snapshot's line of a node: indent by depth, role, quoted name, states, test id. */
export const ariaLine = (node: AriaNode): string =>
    `${'  '.repeat(node.depth)}${node.role} "${maskDigits(node.name)}"${node.states.length > 0 ? ` [${node.states.join(', ')}]` : ''}${node.testid ? ` {${maskDigits(node.testid)}}` : ''}`;

export const ariaSnapshot = (state: string, nodes: readonly AriaNode[]): AriaSnapshot => ({ state, lines: nodes.map(ariaLine) });

/** Lines only in `expected` (removed) and only in `actual` (added), by a longest common subsequence; the first of each. */
export function compareAria(expected: readonly string[], actual: readonly string[]): { equal: boolean; removed: number; added: number; firstRemoved?: string; firstAdded?: string } {
    const n = expected.length;
    const m = actual.length;
    const common: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            common[i][j] = expected[i] === actual[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
        }
    }
    const removed: string[] = [];
    const added: string[] = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
        if (i < n && j < m && expected[i] === actual[j]) {
            i++;
            j++;
        } else if (j < m && (i === n || common[i][j + 1] >= common[i + 1][j])) {
            added.push(actual[j++]);
        } else {
            removed.push(expected[i++]);
        }
    }
    return { equal: removed.length === 0 && added.length === 0, removed: removed.length, added: added.length, firstRemoved: removed[0]?.trim(), firstAdded: added[0]?.trim() };
}

/** The `[aria]` line of a state against its committed snapshot (undefined when none is committed). */
export function ariaLineFor(state: string, actual: AriaSnapshot, committed: AriaSnapshot | undefined): string {
    if (committed === undefined) {
        return `[aria] ${state}: ${actual.lines.length} nodes, no committed snapshot`;
    }
    const diff = compareAria(committed.lines, actual.lines);
    return diff.equal
        ? `[aria] ${state}: ${actual.lines.length} nodes, equal`
        : `[aria] ${state}: ${actual.lines.length} nodes, differs (-${diff.removed} +${diff.added}; first removed: ${diff.firstRemoved ?? 'none'}; first added: ${diff.firstAdded ?? 'none'})`;
}

// ---- UX-P0.24: keyboard paths and reduced motion -------------------------------------------------------------------

/** The keyboard walks' status: `hard` since the closing commit of P0.24; recorded from run 40146274455. */
export const KEYS_STATUS: RuleStatus = 'hard';

/** The reduced-motion check's status: P4.5 makes the tokens honour `body.vscode-reduce-motion` (A4, H29, H87). */
export const MOTION_STATUS: RuleStatus = { pending: 'P4.5' };

/** The screens the capture suite walks, each from scratch. */
export type KeyScreen = 'main-installed' | 'main-updates' | 'main-browse' | 'sidebar';

/** The focused element as the webview reports it (`DESCRIBE_FOCUS`). */
export interface FocusFacts {
    role: string;
    name: string;
    testid: string | null;
    focusVisible: boolean;
    /** The computed outline (`<width> <style> <colour>`) or `none`. */
    outline: string;
    /** The computed box shadow or `none`: a ring may be drawn with it. */
    boxShadow: string;
    /** Inside the webview root, or inside a layer portaled out of it. */
    inRoot: boolean;
    error?: string;
}

/**
 * Runs in the webview (synchronously; axe injected): the focused element's role and name by axe's own functions (the
 * snapshot's path), its test id, whether it matches `:focus-visible`, and what would draw its ring. `arguments[0]` is the
 * root's test id.
 */
export const DESCRIBE_FOCUS = `
const el = document.activeElement;
if (!el || el === document.body) return { role: 'body', name: '', testid: null, focusVisible: false, outline: 'none', boxShadow: 'none', inRoot: false };
if (typeof axe === 'undefined') return { role: el.tagName.toLowerCase(), name: '', testid: null, focusVisible: false, outline: 'none', boxShadow: 'none', inRoot: false, error: 'axe is not injected' };
const root = document.querySelector('[data-testid="' + arguments[0] + '"]');
axe.setup(document);
try {
    const vNode = axe.utils.getNodeFromTree(el);
    const role = (vNode && axe.commons.aria.getRole(vNode, { noPresentational: true })) || el.tagName.toLowerCase();
    const style = getComputedStyle(el);
    const width = Number.parseFloat(style.outlineWidth) || 0;
    return {
        role,
        name: (vNode && axe.commons.text.accessibleText(el)) || '',
        testid: (el.dataset && el.dataset.testid) || null,
        focusVisible: el.matches(':focus-visible'),
        outline: style.outlineStyle === 'none' || width === 0 ? 'none' : style.outlineWidth + ' ' + style.outlineStyle + ' ' + style.outlineColor,
        boxShadow: style.boxShadow || 'none',
        inRoot: Boolean((root && root.contains(el)) || el.closest('.nuiget-dialog, .nuiget-popover, [role="dialog"], [role="alertdialog"]')),
    };
} finally {
    axe.teardown();
}
`;

/** A focus stop as a line of the screen's ARIA snapshot without its states: role, quoted name, test id. */
export const focusLine = (focus: FocusFacts): string =>
    `${focus.role} "${maskDigits(focus.name)}"${focus.testid ? ` {${maskDigits(focus.testid)}}` : ''}`;

/** Whether a stop shows a ring: it matches `:focus-visible` and an outline or a box shadow paints it. */
export const showsRing = (focus: FocusFacts): boolean => focus.focusVisible && (focus.outline !== 'none' || focus.boxShadow !== 'none');

/** What a key the walk pressed did, against what interaction model §5 makes it do; `skipped` when the walk did not press it. */
export interface KeyOutcome {
    path: string;
    observed: string;
    expected: string;
    skipped?: string;
}

/**
 * The tab sequence each screen's walk records, as `focusLine`s, copied from run 40146274455 (design-advisor ruling of
 * 2026-10-25; interaction model §5 has no Tab-order table, H48). Only the item whose change moves a stop updates its screen
 * here, in the same commit, with the reason in its note (P2.5 the tab stops' names, P3.7a the main Installed row order).
 * A stop the snapshot cannot hold before the item's green run is named by `KEYS_AWAITING_ARIA`.
 */
export const KEYS_EXPECTED: Readonly<Partial<Record<KeyScreen, readonly string[]>>> = {
    'main-installed': [
        'combobox "Search packages, or filter with @installed, @updates or @vulnerable" {search-input}',
        'tab "Installed # # package with known vulnerabilities" {installed-tab}',
        'button "Select all" {select-all-button}',
        'treeitem "Direct packages #"',
        'separator "Resize the package list" {sash}',
    ],
    'main-updates': [
        'combobox "Search packages, or filter with @installed, @updates or @vulnerable" {search-input}',
        'tab "Updates #" {updates-tab}',
        'button "Select all" {select-all-button}',
        'option "Dapper # → #"',
        'separator "Resize the package list" {sash}',
    ],
    'main-browse': [
        'combobox "Search packages, or filter with @installed, @updates or @vulnerable" {search-input}',
        'option "Newtonsoft.Json #"',
        'separator "Resize the package list" {sash}',
    ],
    'sidebar': [
        'combobox "Search packages, or filter with @installed or @updates" {sidebar-search-input}',
        'button "Installed #" {section-header-installed}',
        'option "Dapper #"',
        'separator "Resize the Installed and Updates sections" {sash}',
        'button "Updates #" {section-header-updates}',
        'button "Update all (#)" {sidebar-update-all-button}',
        'option "Dapper # → #"',
    ],
};

/** The key paths today's tree fails, by `<screen> <path>`, with the item that fixes them (each under a ruling). */
export const KEYS_PENDING: Readonly<Record<string, string>> = {
    // A1/A2 (R127): Enter on a main Updates row updates and on a sidebar row uninstalls, without asking, on today's tree;
    // the walks record it and never press it.
    'main-updates rows Enter': 'P4.2a',
    'sidebar rows Enter': 'P4.2b',
    // ADR-013 Decision 6 (SB7, X21, A11), P4.3: the search box ↔ list bridge. Today the search box handles ArrowDown only
    // while its popup is open (`SearchBox.tsx:176-191`) and the list moves on ArrowUp whatever the modifier (`Listbox.tsx:144`).
    'main-installed search Ctrl+DownArrow': 'P4.3',
    'main-installed rows Ctrl+UpArrow': 'P4.3',
    'main-updates search Ctrl+DownArrow': 'P4.3',
    'main-updates rows Ctrl+UpArrow': 'P4.3',
    'main-browse search Ctrl+DownArrow': 'P4.3',
    'main-browse rows Ctrl+UpArrow': 'P4.3',
    'sidebar search Ctrl+DownArrow': 'P4.3',
    'sidebar rows Ctrl+UpArrow': 'P4.3',
};

/**
 * A screen whose moved stops are not yet in its committed ARIA snapshot, with the item whose green run adopts it; that
 * item's closing commit removes the entry (UX-P2.1d).
 */
export const KEYS_AWAITING_ARIA: Readonly<Partial<Record<KeyScreen, string>>> = { 'main-installed': 'P2.6' };

/**
 * The `[keys]` lines of a screen and their failures: the tab sequence against `KEYS_EXPECTED`, a ring at every stop, and
 * each key outcome against its expectation. A failure fails the walk only while `status` is `hard`.
 */
export function keysLines(screen: KeyScreen, stops: readonly FocusFacts[], outcomes: readonly KeyOutcome[], status: RuleStatus = KEYS_STATUS, expectations: Readonly<Partial<Record<KeyScreen, readonly string[]>>> = KEYS_EXPECTED, pending: Readonly<Record<string, string>> = KEYS_PENDING): { lines: string[]; failures: string[] } {
    const expected = expectations[screen];
    const lines: string[] = [];
    const failures: string[] = [];
    const suffix = (path: string): string => {
        const item = pending[`${screen} ${path}`];
        return item !== undefined ? `pending ${item}` : statusText(status);
    };
    const sequence = stops.map(focusLine);
    const sameOrder = expected !== undefined && expected.length === sequence.length && expected.every((line, index) => line === sequence[index]);
    lines.push(`[keys] ${screen} tab: ${sequence.length} stops: ${sequence.join(' → ')}${expected === undefined ? '; no expected sequence' : sameOrder ? '; as expected' : `; expected ${expected.join(' → ')}`} (${suffix('tab')})`);
    if (!sameOrder && pending[`${screen} tab`] === undefined) {
        failures.push(`${screen} tab order`);
    }
    const ringless = stops.filter(stop => !showsRing(stop)).map(focusLine);
    lines.push(`[keys] ${screen} ring: ${ringless.length === 0 ? 'a visible ring at every stop' : `no visible ring at ${ringless.join(', ')}`} (${suffix('ring')})`);
    if (ringless.length > 0 && pending[`${screen} ring`] === undefined) {
        failures.push(`${screen} ring ×${ringless.length}`);
    }
    for (const outcome of outcomes) {
        if (outcome.skipped !== undefined) {
            lines.push(`[keys] ${screen} ${outcome.path}: not pressed (${outcome.skipped}) (${suffix(outcome.path)})`);
            continue;
        }
        const pass = outcome.observed === outcome.expected;
        lines.push(`[keys] ${screen} ${outcome.path}: ${outcome.observed}${pass ? '' : `; expected ${outcome.expected}`} (${suffix(outcome.path)})`);
        if (!pass && pending[`${screen} ${outcome.path}`] === undefined) {
            failures.push(`${screen} ${outcome.path}`);
        }
    }
    return { lines, failures };
}

/** What moves in the webview (`RUNNING_ANIMATIONS`). */
export interface MotionFacts {
    reduceMotion: boolean;
    running: number;
    /** Running animations by the animated element's first class (or tag) and the animation's name. */
    groups: Record<string, number>;
    fast: string;
    normal: string;
}

/** Runs in the webview: VS Code's reduce-motion body class, the running animations and transitions, the duration tokens. */
export const RUNNING_ANIMATIONS = `
const running = document.getAnimations().filter(animation => animation.playState === 'running');
const groups = {};
for (const animation of running) {
    const target = animation.effect && animation.effect.target;
    const element = target ? (typeof target.className === 'string' && target.className.trim() ? '.' + target.className.trim().split(/\\s+/)[0] : target.tagName.toLowerCase()) : 'unknown';
    const key = element + ' ' + (typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition ? 'transition ' + animation.transitionProperty : animation.animationName || 'animation');
    groups[key] = (groups[key] || 0) + 1;
}
const root = getComputedStyle(document.documentElement);
return {
    reduceMotion: document.body.classList.contains('vscode-reduce-motion'),
    running: running.length,
    groups,
    fast: root.getPropertyValue('--nuiget-duration-fast').trim(),
    normal: root.getPropertyValue('--nuiget-duration-normal').trim(),
};
`;

/** The `[motion]` line of a moment and its failure: the body class set and nothing moving. */
export function motionLines(where: string, facts: MotionFacts, status: RuleStatus = MOTION_STATUS): { lines: string[]; failures: string[] } {
    const moving = Object.entries(facts.groups).map(([key, count]) => `${key} ×${count}`).join(', ');
    const line = `[motion] ${where}: body.vscode-reduce-motion ${facts.reduceMotion ? 'set' : 'absent'}, ${facts.running} running${moving ? ` (${moving})` : ''}; durations fast ${facts.fast || 'unset'}, normal ${facts.normal || 'unset'} (${statusText(status)})`;
    const failures = [...(facts.reduceMotion ? [] : ['body.vscode-reduce-motion absent']), ...(facts.running === 0 ? [] : [`${facts.running} running animations`])];
    return { lines: [line], failures };
}

// ---- UX-P0.25: contrast axe could not decide, and the theme pass's moments ------------------------------------------

/** The roots of a layer: text inside one is measured against the layer's own background. */
export const LAYER_SELECTOR = '.nuiget-dialog, .nuiget-popover, [role="dialog"], [role="alertdialog"]';

/** A text measured directly: its colour over the backgrounds from the element up to the first opaque one. */
export interface ContrastPair {
    target: string;
    color: string;
    /** Non-transparent backgrounds from the element upward, the last one opaque (empty when none was found). */
    backgrounds: string[];
    fontPx: number;
    weight: number;
    layer: boolean;
}

/** What `RESOLVE_CONTRAST` decided of the undecided targets. */
export interface Resolved {
    targets: number;
    decided: number;
    violations: Array<{ target: string; summary: string }>;
    pairs: ContrastPair[];
    unresolved: string[];
    error?: string;
}

/**
 * Runs in the webview, asynchronously: `arguments[0]` the `color-contrast` targets axe left undecided. A target in a list
 * that scrolls is decided by scrolling its container one `clientHeight` at a time and re-running `color-contrast` scoped to
 * it, the scroll position restored exactly after; a target inside a layer, under one, or still undecided becomes a pair
 * measured directly (P0.23 design-advisor ruling; UX-P0.25).
 */
export const RESOLVE_CONTRAST = `
const done = arguments[arguments.length - 1];
const [targets, layerSelector] = arguments;
const find = target => { try { return document.querySelector(target); } catch (error) { return null; } };
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const scrollerOf = el => {
    for (let at = el.parentElement; at; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (/auto|scroll/.test(style.overflowY) && at.scrollHeight > at.clientHeight + 1) return at;
    }
    return null;
};
const transparent = colour => !colour || colour === 'transparent' || /^rgba\\(.*,\\s*0\\)$/.test(colour);
const opaque = colour => !/^rgba\\(/.test(colour) || /,\\s*1\\)$/.test(colour);
(async () => {
    const wanted = new Set(targets);
    const decided = new Set();
    const violations = [];
    const containers = new Map();
    for (const target of targets) {
        const el = find(target);
        const container = el && !el.closest(layerSelector) ? scrollerOf(el) : null;
        if (container) containers.set(container, true);
    }
    for (const container of containers.keys()) {
        const start = container.scrollTop;
        try {
            for (let top = 0; ; top += Math.max(1, container.clientHeight)) {
                container.scrollTop = top;
                await frame();
                const results = await axe.run({ include: [container] }, { runOnly: ['color-contrast'], resultTypes: ['violations', 'passes', 'incomplete'] });
                for (const rule of results.passes) for (const node of rule.nodes) decided.add(node.target.map(String).join(' '));
                for (const rule of results.violations) for (const node of rule.nodes) {
                    const target = node.target.map(String).join(' ');
                    decided.add(target);
                    if (wanted.has(target)) violations.push({ target, summary: node.failureSummary || '' });
                }
                if (top + container.clientHeight >= container.scrollHeight) break;
            }
        } finally {
            container.scrollTop = start;
            await frame();
        }
    }
    const pairs = [];
    const unresolved = [];
    for (const target of targets) {
        if (decided.has(target)) continue;
        const el = find(target);
        if (!el) { unresolved.push(target); continue; }
        const layer = el.closest(layerSelector);
        const backgrounds = [];
        for (let at = el; at; at = at.parentElement) {
            const colour = getComputedStyle(at).backgroundColor;
            if (!transparent(colour)) {
                backgrounds.push(colour);
                if (opaque(colour)) break;
            }
            if (at === layer) break;
        }
        const style = getComputedStyle(el);
        pairs.push({ target, color: style.color, backgrounds, fontPx: Number.parseFloat(style.fontSize) || 13, weight: Number(style.fontWeight) || 400, layer: Boolean(layer) });
    }
    done(JSON.stringify({ targets: targets.length, decided: targets.filter(target => decided.has(target)).length, violations, pairs, unresolved }));
})().catch(error => done(JSON.stringify({ targets: targets.length, decided: 0, violations: [], pairs: [], unresolved: [], error: String(error) })));
`;

/** A pair's ratio and threshold: its backgrounds composited from the opaque one down, its colour over that; null without an opaque background. */
export function pairContrast(pair: ContrastPair): { ratio: number; threshold: number } | null {
    const layers = pair.backgrounds.map(parseCssColor);
    const base = layers.at(-1);
    if (base === undefined || base === null || base.a < 1 || layers.some(layer => layer === null)) {
        return null;
    }
    let surface = base;
    for (let index = layers.length - 2; index >= 0; index--) {
        surface = composite(layers[index] as NonNullable<(typeof layers)[number]>, surface);
    }
    const fg = parseCssColor(pair.color);
    if (fg === null) {
        return null;
    }
    return { ratio: contrastRatio(fg.a < 1 ? composite(fg, surface) : fg, surface), threshold: thresholdFor(pair.fontPx, pair.weight, 'text') };
}

/**
 * Runs in the webview, asynchronously: the theme pass's two rules (`color-contrast`, `target-size`) over `arguments[0]` (a
 * selector, or the whole document when null), answering the violations, the number of `color-contrast` nodes that passed and
 * the targets it left undecided (those inside the details pane left out when `arguments[1]`, the A5 tolerance until P3.4).
 * A `target-size` node on a selector of `arguments[2]` (`acceptedTargetSelectors`) is counted in `acceptedTargets`, not a violation.
 */
export const RUN_CONTRAST = `
const done = arguments[arguments.length - 1];
${REASONS_OF}
const [scope, outsideDetailsOnly, acceptedTargets = []] = arguments;
const isAccepted = node => { try { const el = document.querySelector(String(node.target[0])); return el !== null && acceptedTargets.some(selector => el.matches(selector)); } catch (error) { return false; } };
const keptNodes = rule => (rule.id === 'target-size' ? rule.nodes.filter(node => !isAccepted(node)) : rule.nodes);
const details = document.querySelector('[data-testid="package-details-panel"]');
const inDetails = target => { try { const el = document.querySelector(target); return details !== null && el !== null && details.contains(el); } catch (error) { return false; } };
axe.run(scope ? { include: [scope] } : document, {
    runOnly: ['color-contrast', 'target-size'],
    rules: { 'target-size': { enabled: true } },
    resultTypes: ['violations', 'passes', 'incomplete'],
}).then(results => done(JSON.stringify({
    acceptedTargets: results.violations.filter(rule => rule.id === 'target-size').reduce((sum, rule) => sum + rule.nodes.length - keptNodes(rule).length, 0),
    violations: results.violations.map(rule => ({ ...rule, nodes: keptNodes(rule) })).filter(rule => rule.nodes.length > 0).map(rule => ({ rule: rule.id, count: rule.nodes.length, sample: rule.nodes.slice(0, 2).map(node => node.target.map(String).join(' ')).join(', '), reasons: reasonsOf(rule.nodes) })),
    passes: results.passes.filter(rule => rule.id === 'color-contrast').reduce((sum, rule) => sum + rule.nodes.length, 0),
    undecided: results.incomplete.filter(rule => rule.id === 'color-contrast').flatMap(rule => rule.nodes).map(node => node.target.map(String).join(' ')).filter(target => !outsideDetailsOnly || !inDetails(target)),
})), error => done(JSON.stringify({ violations: [], passes: 0, undecided: [], error: String(error) })));
`;

/**
 * The targets of `targets` drawn under the layer `layerSelector` (their box meets the layer's, outside it): the texts an
 * open popup covers, which the theme pass hands to `RESOLVE_CONTRAST` with the popup's own undecided nodes (UX-P0.25, DO 5).
 * An `executeScript` body: arguments `[layerSelector, targets]`.
 */
export const TEXTS_UNDER = `
const [layerSelector, targets] = arguments;
const layer = document.querySelector(layerSelector);
if (layer === null) return [];
const box = layer.getBoundingClientRect();
return targets.filter(target => {
    let el = null;
    try { el = document.querySelector(target); } catch (error) { return false; }
    if (el === null || layer.contains(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.right > box.left && rect.left < box.right && rect.bottom > box.top && rect.top < box.bottom;
});
`;

/** What `RUN_CONTRAST` answers. */
export interface ContrastRun {
    violations: MomentFacts['violations'];
    acceptedTargets?: number;
    passes: number;
    undecided: string[];
    error?: string;
}

/** The theme pass's moments (UX-P0.25): a hovered row in each surface, the open ConfirmDialog, the search popup, the README. */
export const MOMENTS = ['hover-main', 'readme', 'dialog', 'popup', 'hover-sidebar'] as const;
export type Moment = (typeof MOMENTS)[number];

/** The moments' and the resolve pass's status: `hard` since the design-advisor ruled on their first run (2026-10-25, UX-P0.25). */
export const CONTRAST_STATUS: RuleStatus = 'hard';

/** A red contrast line of today's tree: where (a moment or a capture state), the theme, the rule, the item that fixes it. */
export interface ContrastPending {
    where: string;
    theme: string;
    rule: 'color-contrast' | 'target-size' | 'pair' | 'unresolved';
    item: string;
}

/**
 * The red lines of today's tree, run 40152178889's and no others (design-advisor ruling of 2026-10-25, UX-P0.25; Appendix B:
 * README → P3.4 (A8, and the README's link list under 2.5.8, DECISIONS), hover → P4.6 (A14)).
 */
export const CONTRAST_PENDING: readonly ContrastPending[] = [
    { where: 'readme', theme: 'light-modern', rule: 'color-contrast', item: 'P3.4' },
    { where: 'readme', theme: 'light-high-contrast', rule: 'color-contrast', item: 'P3.4' },
    { where: 'readme', theme: 'light-2026', rule: 'color-contrast', item: 'P3.4' },
    { where: 'readme', theme: 'dark-modern', rule: 'target-size', item: 'P3.4' },
    { where: 'readme', theme: 'light-modern', rule: 'target-size', item: 'P3.4' },
    { where: 'readme', theme: 'dark-high-contrast', rule: 'target-size', item: 'P3.4' },
    { where: 'readme', theme: 'light-high-contrast', rule: 'target-size', item: 'P3.4' },
    { where: 'readme', theme: 'dark-2026', rule: 'target-size', item: 'P3.4' },
    { where: 'readme', theme: 'light-2026', rule: 'target-size', item: 'P3.4' },
    { where: 'hover-main', theme: 'dark-2026', rule: 'color-contrast', item: 'P4.6' },
    { where: 'hover-sidebar', theme: 'dark-2026', rule: 'color-contrast', item: 'P4.6' },
];

const pendingContrast = (where: string, theme: string, rule: ContrastPending['rule'], registry: readonly ContrastPending[]): ContrastPending | undefined =>
    registry.find(entry => entry.where === where && entry.theme === theme && entry.rule === rule);

/**
 * The `[contrast]` lines of a capture state's resolve pass and their failures: a violation found by scrolling, a pair below
 * its threshold or a target neither decided nor measurable fails, unless an exact `CONTRAST_PENDING` entry names its item.
 */
export function resolvedLines(state: string, theme: string, resolved: Resolved, status: RuleStatus = CONTRAST_STATUS, registry: readonly ContrastPending[] = CONTRAST_PENDING): { lines: string[]; failures: string[] } {
    const lines: string[] = [];
    const failures: string[] = [];
    const suffix = (rule: ContrastPending['rule']): string => {
        const owner = pendingContrast(state, theme, rule, registry);
        return owner ? `pending ${owner.item}` : statusText(status);
    };
    if (resolved.error !== undefined) {
        return { lines: [`[contrast] ${state}: the resolve pass failed: ${resolved.error} (${statusText(status)})`], failures: [`resolve pass failed: ${resolved.error}`] };
    }
    const measured = resolved.pairs.map(pair => ({ pair, value: pairContrast(pair) }));
    const below = measured.filter(entry => entry.value !== null && entry.value.ratio < entry.value.threshold);
    const unmeasured = [...resolved.unresolved, ...measured.filter(entry => entry.value === null).map(entry => entry.pair.target)];
    lines.push(`[contrast] ${state}: ${resolved.targets} undecided: ${resolved.decided} decided by scrolling, ${resolved.violations.length} violations, ${measured.filter(entry => entry.value !== null).length} measured as pairs, ${below.length} below, ${unmeasured.length} unresolved (${statusText(status)})`);
    if (resolved.violations.length > 0) {
        lines.push(`[contrast] ${state}: violation color-contrast ×${resolved.violations.length}: ${resolved.violations.slice(0, 2).map(entry => entry.target).join(', ')} (${suffix('color-contrast')})`);
        if (pendingContrast(state, theme, 'color-contrast', registry) === undefined) {
            failures.push(`contrast violation ×${resolved.violations.length}`);
        }
    }
    if (below.length > 0) {
        lines.push(`[contrast] ${state}: pairs below threshold ×${below.length}: ${below.slice(0, 3).map(entry => `${entry.pair.target} ${Math.round((entry.value?.ratio ?? 0) * 100) / 100} vs ${entry.value?.threshold}`).join(', ')} (${suffix('pair')})`);
        if (pendingContrast(state, theme, 'pair', registry) === undefined) {
            failures.push(`pairs below threshold ×${below.length}`);
        }
    }
    if (unmeasured.length > 0) {
        lines.push(`[contrast] ${state}: unresolved ×${unmeasured.length}: ${unmeasured.slice(0, 3).join(', ')} (${suffix('unresolved')})`);
        if (pendingContrast(state, theme, 'unresolved', registry) === undefined) {
            failures.push(`unresolved ×${unmeasured.length}`);
        }
    }
    return { lines, failures };
}

/** What the theme pass read at a moment: the two rules' violations and passes, and the pairs of what stayed undecided. */
export interface MomentFacts {
    violations: Array<{ rule: 'color-contrast' | 'target-size'; count: number; sample: string; reasons?: Array<{ text: string; count: number }> }>;
    passes: number;
    /** `target-size` nodes on an `AXE_ACCEPTED` selector, not violations. */
    acceptedTargets?: number;
    resolved?: Resolved;
    /** Why the moment could not be measured (a README the network did not deliver), or undefined. */
    notMeasurable?: string;
}

/** The `[contrast] <moment>@<theme>` lines and their failures; "the rule ran" holds when a node passed or a pair was measured. */
export function momentLines(moment: Moment, theme: string, facts: MomentFacts, status: RuleStatus = CONTRAST_STATUS, registry: readonly ContrastPending[] = CONTRAST_PENDING): { lines: string[]; failures: string[] } {
    const where = `${moment}@${theme}`;
    const suffix = (rule: ContrastPending['rule']): string => {
        const owner = pendingContrast(moment, theme, rule, registry);
        return owner ? `pending ${owner.item}` : statusText(status);
    };
    if (facts.notMeasurable !== undefined) {
        return { lines: [`[contrast] ${where}: not measurable (${facts.notMeasurable}) (${suffix('unresolved')})`], failures: pendingContrast(moment, theme, 'unresolved', registry) ? [] : [`${where} not measurable`] };
    }
    const lines: string[] = [];
    const failures: string[] = [];
    const pairs = facts.resolved?.pairs.length ?? 0;
    lines.push(`[contrast] ${where}: ${facts.passes} nodes passed, ${facts.violations.reduce((sum, entry) => sum + entry.count, 0)} violations, ${pairs} pairs measured${facts.acceptedTargets ? `, accepted target-size ${facts.acceptedTargets} on ${acceptedTargetSelectors().join(', ')}` : ''} (${statusText(status)})`);
    for (const violation of facts.violations) {
        const reasons = (violation.reasons ?? []).map(reason => `; "${reason.text}" ×${reason.count}`).join('');
        lines.push(`[contrast] ${where}: violation ${violation.rule} ×${violation.count}: ${violation.sample}${reasons} (${suffix(violation.rule)})`);
        if (pendingContrast(moment, theme, violation.rule, registry) === undefined) {
            failures.push(`${where} ${violation.rule} ×${violation.count}`);
        }
    }
    if (facts.resolved !== undefined) {
        const resolved = resolvedLines(moment, theme, facts.resolved, status, registry);
        // The resolve pass's summary is the moment's own first line; an error is its only line and is kept.
        const kept = facts.resolved.error !== undefined ? resolved.lines : resolved.lines.slice(1);
        lines.push(...kept.map(line => line.replace(`[contrast] ${moment}:`, `[contrast] ${where}:`)));
        failures.push(...resolved.failures.map(failure => `${where} ${failure}`));
    }
    if (facts.passes === 0 && pairs === 0) {
        lines.push(`[contrast] ${where}: the rule decided nothing (${statusText(status)})`);
        failures.push(`${where} decided nothing`);
    }
    return { lines, failures };
}

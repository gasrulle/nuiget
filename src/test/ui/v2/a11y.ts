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
 *   `src/test/ui/v2/aria/<state>.json` and written beside the crops for adoption. Digits are masked (versions, counts,
 *   sizes), so a fixture's new release does not change a snapshot.
 *
 * Plain data and string scripts, like `measure.ts`: `src/test/lint` imports it without ExTester.
 */
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
    error?: string;
}

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
    const tally = new Map();
    for (const node of result.nodes) {
        const text = [...node.any, ...node.all, ...node.none].map(check => check.message).filter(Boolean).join(' | ').slice(0, 160) || 'no message';
        tally.set(text, (tally.get(text) || 0) + 1);
    }
    const reasons = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([text, count]) => ({ text, count }));
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
 * The axe results of today's tree that later items remove (design-advisor ruling of 2026-10-25, UX-P0.23; run 40136298952).
 * Each `incomplete` below is "axe could not decide", which P0.25 turns into a measurement: it scrolls each scroll container
 * that holds undecided nodes in steps of its `clientHeight`, re-runs `color-contrast` with `include` on it, unions the
 * decided nodes and restores `scrollTop` (the state's later captures stay at `[diff]` 0 px), failing what stays undecided in
 * view; text under or inside an open layer is measured against the layer's own opaque background, or proven decided in the
 * state without the layer. The state lists are exact: never widened, never a wildcard.
 */
export const AXE_PENDING: readonly AxePending[] = [
    // elmPartiallyObscured: rows beyond a scroller's fold (`overflow: auto`; the only opaque ancestor is `.nuiget-main`).
    {
        rule: 'color-contrast', kind: 'incomplete', item: 'P0.25',
        states: [
            'main-installed-single', 'main-installed-all', 'main-installed-cpm', 'main-installed-details', 'main-installed-hover', 'main-installed-focus',
            'main-installed-unfocused', 'main-installed-bulk-dialog', 'main-transitive-expanded', 'main-transitive-details', 'main-updates',
            'main-browse-results', 'main-browse-details', 'main-details-readme',
        ],
    },
    // bgOverlap: the empty messages under the open quick-search popup.
    { rule: 'color-contrast', kind: 'incomplete', item: 'P0.25', states: ['main-quicksearch-open', 'main-quicksearch-versions'] },
    // elmPartiallyObscuring: the Update-all dialog's wrapped bullets over the varying content beneath the dialog.
    { rule: 'color-contrast', kind: 'incomplete', item: 'P0.25', states: ['sidebar-update-all-dialog'] },
];

/** A violation a decision declares by design, on the nodes of one selector or on one surface; `ruling` names the decision. */
export interface AxeAccepted {
    rule: string;
    kind: 'violation';
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
];

/** The selectors `RUN_FULL_AXE` counts nodes against. */
export const acceptedSelectors = (accepted: readonly AxeAccepted[] = AXE_ACCEPTED): string[] =>
    accepted.flatMap(entry => (entry.selector === undefined ? [] : [entry.selector]));

/** The acceptance that covers a violation: every node on its selector, or the state's surface. */
const acceptedFor = (rule: AxeRule, surface: 'main' | 'sidebar', accepted: readonly AxeAccepted[]): { entry: AxeAccepted; where: string } | undefined => {
    for (const entry of accepted) {
        if (entry.rule !== rule.id) {
            continue;
        }
        if (entry.selector !== undefined && (rule.accepted?.[entry.selector] ?? 0) === rule.count) {
            return { entry, where: entry.selector };
        }
        if (entry.surface !== undefined && entry.surface === surface) {
            return { entry, where: `the ${surface}` };
        }
    }
    return undefined;
};

const pendingFor = (state: string, kind: AxePending['kind'], rule: string, registry: readonly AxePending[]): AxePending | undefined =>
    registry.find(entry => entry.rule === rule && entry.kind === kind && (entry.states === undefined || entry.states.includes(state)));

const statusText = (status: RuleStatus): string => (status === 'hard' ? 'hard' : `pending ${status.pending}`);

/**
 * The `[axe]` lines of a state and the failures among them: one summary line, then one line per violation or incomplete
 * rule. A failure is a result neither tolerated, accepted nor pending; it fails the capture only while `status` is `hard`.
 * `surface` is the state's own (`NamedState.surface`), never read from its name.
 */
export function axeLines(state: string, surface: 'main' | 'sidebar', result: FullAxe, status: RuleStatus = FULL_AXE_STATUS, registry: readonly AxePending[] = AXE_PENDING, accepted: readonly AxeAccepted[] = AXE_ACCEPTED): { lines: string[]; failures: string[] } {
    if (result.error !== undefined) {
        return { lines: [`[axe] ${state}: axe.run failed: ${result.error} (${statusText(status)})`], failures: [`axe.run failed: ${result.error}`] };
    }
    const lines: string[] = [];
    const failures: string[] = [];
    const sample = (rule: AxeRule): string =>
        `${rule.nodes.slice(0, 2).map(node => node.target).join(', ')}${rule.reasons.length > 0 ? `; ${rule.reasons.map(reason => `"${reason.text}" ×${reason.count}`).join('; ')}` : ''}`;
    for (const rule of result.violations) {
        const declared = acceptedFor(rule, surface, accepted);
        if (declared !== undefined) {
            lines.push(`[axe] ${state}: violation ${rule.id} ×${rule.count} on ${declared.where} (accepted-as-design: ${declared.entry.ruling})`);
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

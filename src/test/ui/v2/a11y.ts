/**
 * The accessibility harness of the named states (UX-P0.23; H17, H30, H31, H46, H47; `a11y-full-axe-real-page`). The
 * capture suite runs it once per state and run, at the state's first capture, after the screenshot:
 *
 * - the full axe ruleset over the whole page with the state's layers open: every rule axe enables by default,
 *   best-practice included, plus `target-size` and `label-content-name-mismatch`, which axe 4.12 leaves off. A violation
 *   fails the capture unless `AXE_PENDING` names the item that removes it; an `incomplete` result is tolerated only for
 *   `color-contrast` inside the details pane, until P3.4 (A5, the ruling of P5.12b);
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

/** Its status: `pending` on this item until its run's results are triaged, then `hard` (the hard/pending flip rule). */
export const FULL_AXE_STATUS: RuleStatus = { pending: 'P0.23' };

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
 * Runs in the webview, asynchronously (`executeAsyncScript`): `arguments[0]` the extra rules, `arguments[1]` the node cap.
 * Answers a `FullAxe` as JSON, small enough for the WebDriver channel.
 */
export const RUN_FULL_AXE = `
const done = arguments[arguments.length - 1];
const [extra, cap] = arguments;
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
    return { id: result.id, impact: result.impact || null, count: nodes.length, outsideDetails: nodes.filter(node => !node.insideDetails).length, nodes: nodes.slice(0, cap) };
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

/** The axe results of today's tree that later items remove (filled from the run that flips the rule, with its ruling). */
export const AXE_PENDING: readonly AxePending[] = [];

const pendingFor = (state: string, kind: AxePending['kind'], rule: string, registry: readonly AxePending[]): AxePending | undefined =>
    registry.find(entry => entry.rule === rule && entry.kind === kind && (entry.states === undefined || entry.states.includes(state)));

const statusText = (status: RuleStatus): string => (status === 'hard' ? 'hard' : `pending ${status.pending}`);

/**
 * The `[axe]` lines of a state and the failures among them: one summary line, then one line per violation or incomplete
 * rule. A failure is a result neither tolerated nor pending; it fails the capture only while `status` is `hard`.
 */
export function axeLines(state: string, result: FullAxe, status: RuleStatus = FULL_AXE_STATUS, registry: readonly AxePending[] = AXE_PENDING): { lines: string[]; failures: string[] } {
    if (result.error !== undefined) {
        return { lines: [`[axe] ${state}: axe.run failed: ${result.error} (${statusText(status)})`], failures: [`axe.run failed: ${result.error}`] };
    }
    const lines: string[] = [];
    const failures: string[] = [];
    const sample = (rule: AxeRule): string => rule.nodes.slice(0, 2).map(node => node.target).join(', ');
    for (const rule of result.violations) {
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

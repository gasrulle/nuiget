/**
 * The in-page timings of the main panel (UX-P0.26; H57–H60, H71). The capture suite arms a recorder inside the webview
 * through `executeScript`, acts, and reads the recorder back: every interval is the difference of two `performance.now()`
 * readings in the webview's own document, never the test process's clock (H58), so WebDriver's round trips and the poll
 * interval of the waits are not in it. A chain starts at the document's time origin (`load`: the webview's content frame
 * began loading, which is what the product's own `perf/mark` details call "after load") or at the first event of a type
 * on an element (a key, a pointer press, a `change`), stamped by a capture-phase listener; a `MutationObserver` on the
 * document stamps the first time each mark's predicate holds, in the task that changed the DOM (before its paint).
 *
 * A mark already true when the recorder starts is an upper bound (`≤`, the recorder's start); one already true at the
 * start event says the action changed nothing and is not measured. The lines are informational: `[perf] <chain> →
 * <mark>: <ms> ms`, no status suffix, so none of them joins the pending list.
 *
 * Plain data and string scripts, like `measure.ts` and `a11y.ts`: `src/test/lint` imports it without ExTester.
 */

/** A mark of a chain: stamped the first time `predicate` (a script expression) holds, once `after` (a flag or mark) was. */
export interface PerfMark {
    name: string;
    predicate: string;
    after?: string;
}

/** A condition whose having held at some point the chain's head line reports, with the text for either outcome. */
export interface PerfFlag {
    name: string;
    predicate: string;
    seen: string;
    unseen: string;
}

/** What a chain is timed from: the document's time origin, or the first `type` event on (or in) `selector`. */
export type PerfStart = { kind: 'load' } | { kind: 'event'; type: string; selector: string; key?: string };

export interface PerfChain {
    /** The chain's name in its lines: `[perf] <label> → <mark>`. */
    label: string;
    /** What was timed, for the head line (project, cache temperature, text). */
    context: string;
    start: PerfStart;
    marks: readonly PerfMark[];
    flags?: readonly PerfFlag[];
}

/** How a mark was stamped: when the recorder started, at the start event, or by the observer after it. */
export type PerfWhen = 'install' | 'start' | 'observed';

/** What the recorder holds: times in ms of the webview's clock, marks relative to the chain's start. */
export interface PerfResult {
    installedAt: number;
    start: number | null;
    marks: Record<string, { ms: number; when: PerfWhen }>;
    flags: Record<string, number>;
}

/**
 * The script that arms `chain`'s recorder in the webview the driver is in, replacing any earlier one. With `root` it
 * arms only once an element matching it exists (the main panel's static `#root`, before the bundle has rendered
 * anything) and returns whether it did; without, it returns `true`.
 */
export function perfRecorder(chain: PerfChain, root?: string): string {
    const marks = chain.marks.map(mark => `{ name: ${JSON.stringify(mark.name)}, after: ${JSON.stringify(mark.after ?? null)}, test: () => (${mark.predicate}) }`);
    const flags = (chain.flags ?? []).map(flag => `{ name: ${JSON.stringify(flag.name)}, test: () => (${flag.predicate}) }`);
    const { start } = chain;
    const event = start.kind === 'event' ? { type: start.type, selector: start.selector, key: start.key ?? null } : null;
    return `
const root = ${JSON.stringify(root ?? null)};
if (root !== null && document.querySelector(root) === null) return false;
const previous = window.__nuigetPerf;
if (previous) previous.stop();
const marks = [${marks.join(', ')}];
const flags = [${flags.join(', ')}];
const state = { installedAt: performance.now(), start: ${start.kind === 'load' ? '0' : 'null'}, marks: {}, flags: {} };
const holds = test => { try { return Boolean(test()); } catch { return false; } };
const check = when => {
    if (state.start === null) return;
    const now = performance.now();
    for (const flag of flags) {
        if (!(flag.name in state.flags) && holds(flag.test)) state.flags[flag.name] = now - state.start;
    }
    for (const mark of marks) {
        if (mark.name in state.marks) continue;
        if (mark.after !== null && !(mark.after in state.flags) && !(mark.after in state.marks)) continue;
        if (holds(mark.test)) state.marks[mark.name] = { ms: now - state.start, when };
    }
};
const event = ${JSON.stringify(event)};
const onStart = dispatched => {
    if (state.start !== null) return;
    const target = dispatched.target instanceof Element ? dispatched.target : null;
    if (target === null || target.closest(event.selector) === null) return;
    if (event.key !== null && dispatched.key !== event.key) return;
    state.start = performance.now();
    check('start');
};
if (event !== null) document.addEventListener(event.type, onStart, true);
const observer = new MutationObserver(() => check('observed'));
observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
window.__nuigetPerf = {
    state,
    stop: () => { observer.disconnect(); if (event !== null) document.removeEventListener(event.type, onStart, true); },
};
check('install');
return true;
`;
}

/** Runs in the webview: the recorder's state, or `null` when none is armed (the document was replaced). */
export const READ_PERF = 'const perf = window.__nuigetPerf; return perf ? JSON.parse(JSON.stringify(perf.state)) : null;';

/** Runs in the webview: disarms the recorder. */
export const STOP_PERF = 'const perf = window.__nuigetPerf; if (perf) { perf.stop(); delete window.__nuigetPerf; } return true;';

/** Whether every mark of `chain` is stamped. */
export const perfComplete = (chain: PerfChain, result: PerfResult | null): boolean =>
    result !== null && chain.marks.every(mark => mark.name in result.marks);

/** The chain's lines: a head line with its context and flags, then one line per mark. */
export function perfLines(chain: PerfChain, result: PerfResult | null, waitedMs: number): string[] {
    if (result === null) {
        return [`[perf] ${chain.label}: not measured (no recorder in the webview)`];
    }
    const head = [chain.context];
    if (chain.start.kind === 'load') {
        head.push(`recorder started ${Math.round(result.installedAt)} ms after load`);
    } else if (result.start === null) {
        head.push('the start event never came');
    }
    for (const flag of chain.flags ?? []) {
        head.push(flag.name in result.flags ? flag.seen : flag.unseen);
    }
    const lines = [`[perf] ${chain.label}: ${head.join('; ')}`];
    for (const mark of chain.marks) {
        const stamp = result.marks[mark.name];
        const name = `[perf] ${chain.label} → ${mark.name}`;
        if (stamp === undefined) {
            lines.push(`${name}: not measured (${result.start === null ? 'no start event' : `not reached in ${Math.round(waitedMs / 1000)} s`})`);
        } else if (stamp.when === 'install') {
            lines.push(`${name}: ≤ ${Math.round(stamp.ms)} ms (present when the recorder started)`);
        } else if (stamp.when === 'start') {
            lines.push(`${name}: not measured (present before the start)`);
        } else {
            lines.push(`${name}: ${Math.round(stamp.ms)} ms`);
        }
    }
    return lines;
}

// ---- the predicates of the main panel's marks ------------------------------------------------------------------------

const INSTALLED_LIST = '[data-testid="installed-list"]';

/** A row in the single project's Installed list. */
export const INSTALLED_ROW = `document.querySelector('${INSTALLED_LIST} .nuiget-row-option') !== null`;

/** A row of one of `ids` (lower-case package ids) in the Installed list: a project's own rows, not the last project's. */
export const installedRowOf = (ids: readonly string[]): string =>
    `[...document.querySelectorAll('${INSTALLED_LIST} [data-testid^="package-row-"]')].some(row => ${JSON.stringify(ids)}.includes(row.dataset.testid.slice('package-row-'.length)))`;

/** The single project's header carries the `provisional` badge (the list from the project files, before evaluation). */
export const PROVISIONAL = `[...document.querySelectorAll('[data-testid="section-box-direct"] .nuiget-badge')].some(badge => badge.textContent.includes('provisional'))`;

/** The Installed list is revalidating: the list `aria-busy`, or the spinner in its header. */
export const REVALIDATING = `document.querySelector('${INSTALLED_LIST}[aria-busy="true"], [data-testid="section-box-direct"] .nuiget-spinner') !== null`;

/** `present` holds and the header has no `provisional` badge: the evaluated list. */
export const authoritative = (present: string): string => `(${present}) && !(${PROVISIONAL})`;

/**
 * `present` holds, every comfortable row of the list shows its authors and one shows its package's own icon (not the root's
 * `data-package-icon`): the lite metadata answer, which carries the icons and the authors together (X33), has arrived.
 */
export const icons = (present: string): string => `(${present}) && (() => {
    const rows = [...document.querySelectorAll('${INSTALLED_LIST} .nuiget-row--comfortable:not([data-row-kind="group"])')];
    const fallback = document.querySelector('[data-package-icon]')?.getAttribute('data-package-icon') ?? '';
    return rows.length > 0 && rows.every(row => row.querySelector('.nuiget-row-authors') !== null)
        && rows.some(row => { const img = row.querySelector('.nuiget-row-icon img'); return img !== null && img.getAttribute('src') !== fallback; });
})()`;

/** The list after a revalidation: rows, nothing busy, no `provisional` badge, every row with its authors. */
export const SETTLED = `(${INSTALLED_ROW}) && !(${REVALIDATING}) && !(${PROVISIONAL})
    && [...document.querySelectorAll('${INSTALLED_LIST} .nuiget-row--comfortable:not([data-row-kind="group"])')].every(row => row.querySelector('.nuiget-row-authors') !== null)`;

/** The details pane shows `id` (lower case) with its version selector. */
export const details = (id: string): string => `(() => {
    const panel = document.querySelector('[data-testid="package-details-panel"]');
    return panel !== null && panel.textContent.toLowerCase().includes(${JSON.stringify(id)}) && document.querySelector('[data-testid="version-selector"]') !== null;
})()`;

/** The details of `id` with their dependency groups. */
export const dependencies = (id: string): string => `(${details(id)}) && document.querySelector('[data-testid="package-details-panel"]').textContent.includes('Dependencies')`;

/** A row in the Browse results (the skeleton has none: it is `aria-hidden` and has no option). */
export const BROWSE_ROW = `document.querySelector('[data-testid="browse-list"] [role="option"]') !== null`;

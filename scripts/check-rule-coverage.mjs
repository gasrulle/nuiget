// Prints the Design System rules some named states exercise that no `rule()` of the measurement registry asserts:
// node scripts/check-rule-coverage.mjs --states <state,state,…>|all
//
// UX-P0.13 (design trigger 6). The ids are the rule rows of `docs/design/design-system.md` (`| DS-…-n |`); the registry is
// the `rule('<id>'` calls of `src/test/ui/v2/measure.ts` (an id the registry splits, `DS-GRID-2a`/`DS-GRID-2b`, covers
// `DS-GRID-2`). A state exercises a rule when plan Appendix B's "Flipped by" cell names the state's group (`main`,
// `updates`, `browse`, `details`, `dialogs`, `sources`, `sidebar`) or names none of them (the rule applies to every state);
// a "Flipped by" segment without a state-group qualifier (`P2.2`, `then as DS-GRID-1`, `toolbars: P2.5`) means every
// group. A rule Appendix B does not list is looked up in the tracker's "Pending measurement rules" table
// (`docs/plans/STATUS-ux.md`, Appendix B's second source under plan section 2.7) and marked `(tracker)`; one in neither is
// exercised by every state. Each printed id carries its helper cell and its class: `judge-only` (Appendix B's judge-only
// sentence), `hard at P0` (Appendix B's "pass on the probe" list), `gap` (the helper cell begins with P0 helper numbers,
// each 1 to 8, whatever follows: "6 at 220 px"; or no source names the rule) or `later` (a helper no P0 item provides:
// lint, computed styles, axe, keyboard paths, …). The exit code is 1 when any `gap` or `hard at P0` id prints. The groups
// follow `stateGroup` in measure.ts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');

/** `DS-STATE-1/2/3`, `DS-FOCUS-1..4`, `DS-HEIGHT-4/8` and plain ids, expanded. */
export function expandIds(text) {
    const ids = [];
    for (const match of text.matchAll(/DS-([A-Z]+)-(\d+[a-z]?)((?:\/\d+[a-z]?)*)(?:\.\.(\d+))?/g)) {
        const [, family, first, slashes, last] = match;
        ids.push(`DS-${family}-${first}`);
        for (const more of slashes.split('/').filter(Boolean)) {
            ids.push(`DS-${family}-${more}`);
        }
        if (last !== undefined) {
            for (let n = Number.parseInt(first, 10) + 1; n <= Number(last); n++) {
                ids.push(`DS-${family}-${n}`);
            }
        }
    }
    return ids;
}

/** The state group of a named state, as `stateGroup` in src/test/ui/v2/measure.ts. */
export function groupOf(state) {
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
        return 'updates';
    }
    return 'main';
}

const GROUPS = ['main', 'updates', 'browse', 'details', 'dialogs', 'sources', 'sidebar'];

/** The state groups a "Flipped by" cell names: every group as soon as one segment names none. */
export function groupsOf(flipped) {
    const named = [];
    for (const segment of flipped.split('·')) {
        const qualifier = /^\s*([a-z][a-z ]*?):/.exec(segment)?.[1]?.trim();
        if (qualifier === undefined || !GROUPS.includes(qualifier)) {
            return GROUPS;
        }
        named.push(qualifier);
    }
    return named;
}

/** The rows of a rule table (`| ids | helper | … |`) by expanded id, with their helper cell and state groups. */
function tableRows(lines, helperColumn, flippedColumn) {
    const rows = new Map();
    for (const line of lines) {
        const cells = line.split('|').map(cell => cell.trim());
        for (const id of expandIds(cells[1])) {
            rows.set(id, { helper: cells[helperColumn], flipped: cells[flippedColumn], groups: groupsOf(cells[flippedColumn]) });
        }
    }
    return rows;
}

/** The tracker's "Pending measurement rules" table: `| Rule | Helper | State group | Catches | Flipped by | Status |`. */
export function readTracker(tracker) {
    const start = tracker.indexOf('| Rule | Helper | State group | Catches | Flipped by | Status |');
    if (start < 0) {
        return new Map();
    }
    const lines = tracker.slice(start, tracker.indexOf('\n\n', start) < 0 ? undefined : tracker.indexOf('\n\n', start)).split('\n').filter(line => /^\| (?!Rule |---)/.test(line));
    return tableRows(lines, 2, 5);
}

/** Appendix B: its table rows by id, the hard-at-P0 ids and the judge-only ids. */
export function readAppendixB(plan) {
    const start = plan.indexOf('| Rule | Helper | Catches | Flipped by |');
    // The paragraph before the table: from the blank line before it, or the start of the text.
    const intro = plan.slice(Math.max(0, plan.lastIndexOf('\n\n', plan.lastIndexOf('\n\n', start) - 1)), start);
    const table = plan.slice(start, plan.indexOf('\n\n', start)).split('\n').filter(line => /^\| (?!Rule |---)/.test(line));
    const rows = tableRows(table, 2, 4);
    const hardSentence = /`hard` at P0:([\s\S]*?)Every other rule/.exec(intro)?.[1] ?? '';
    const judgeSentence = /Judge-only:([\s\S]*?)\n\n/.exec(intro + '\n\n')?.[1] ?? '';
    return { rows, hardAtP0: new Set(expandIds(hardSentence)), judgeOnly: new Set(expandIds(judgeSentence)) };
}

/** Whether a helper cell names P0 helpers: a leading list of numbers, each 1 to 8, whatever follows ("6 at 220 px"). */
export const isP0Helper = helper => {
    const list = /^\d+(?:\s*,\s*\d+)*/.exec(helper)?.[0];
    return list !== undefined && list.split(',').every(number => Number(number) >= 1 && Number(number) <= 8);
};

/** The class of an unasserted id: judge-only, hard at P0, gap (a P0 helper owns it, or no source does) or later. */
export function classify(id, appendix, tracker = new Map()) {
    if (appendix.judgeOnly.has(id)) {
        return 'judge-only';
    }
    if (appendix.hardAtP0.has(id)) {
        return 'hard at P0';
    }
    const row = appendix.rows.get(id) ?? tracker.get(id);
    if (row === undefined) {
        return 'gap';
    }
    return isP0Helper(row.helper) ? 'gap' : 'later';
}

export function coverage(states, sources = { designSystem: read('docs/design/design-system.md'), plan: read('docs/plans/2026-10-23-nuiget-ux-execution-plan.md'), measure: read('src/test/ui/v2/measure.ts'), tracker: read('docs/plans/STATUS-ux.md') }) {
    const ids = [...new Set([...sources.designSystem.matchAll(/^\| (DS-[A-Z]+-\d+)[a-z]? \|/gm)].map(match => match[1]))];
    const asserted = [...sources.measure.matchAll(/rule\('([A-Z0-9-]+[a-z]?)'/g)].map(match => match[1]);
    const appendix = readAppendixB(sources.plan);
    // The tracker is read only for the ids Appendix B does not list.
    const trackerRows = readTracker(sources.tracker ?? '');
    const tracker = new Map([...trackerRows].filter(([id]) => !appendix.rows.has(id)));
    const rowOf = id => appendix.rows.get(id) ?? tracker.get(id);
    const groups = new Set(states.map(groupOf));
    return ids
        .filter(id => !asserted.some(rule => rule === id || (rule.startsWith(id) && /^[a-z]$/.test(rule.slice(id.length)))))
        .filter(id => (rowOf(id)?.groups ?? GROUPS).some(group => groups.has(group)))
        .map(id => ({
            id,
            helper: appendix.rows.get(id)?.helper ?? (tracker.has(id) ? `${tracker.get(id).helper} (tracker)` : '(not in Appendix B)'),
            class: classify(id, appendix, tracker),
        }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const at = process.argv.indexOf('--states');
    const wanted = at < 0 ? undefined : process.argv[at + 1];
    if (wanted === undefined) {
        console.error('usage: node scripts/check-rule-coverage.mjs --states <state,state,…>|all');
        process.exit(2);
    }
    const states = wanted === 'all'
        ? [...new Set([...read('src/test/ui/v2/states.ts').matchAll(/(?:ready|pending)\('((?:main|sidebar)-[a-z0-9-]+)'/g)].map(match => match[1]))]
        : wanted.split(',');
    const rows = coverage(states);
    for (const row of rows) {
        console.log(`${row.id.padEnd(16)} ${row.class.padEnd(11)} ${row.helper}`);
    }
    const failing = rows.filter(row => row.class === 'gap' || row.class === 'hard at P0');
    console.log(`check-rule-coverage: ${states.length} states, ${rows.length} unasserted ids, ${failing.length} gap or hard at P0`);
    process.exit(failing.length === 0 ? 0 : 1);
}

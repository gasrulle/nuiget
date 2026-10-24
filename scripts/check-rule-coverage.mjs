// Prints the Design System rules some named states exercise that no `rule()` of the measurement registry asserts:
// node scripts/check-rule-coverage.mjs --states <state,state,…>|all
//
// UX-P0.13 (design trigger 6). The ids are the rule rows of `docs/design/design-system.md` (`| DS-…-n |`); the registry is
// the `rule('<id>'` calls of `src/test/ui/v2/measure.ts` (an id the registry splits, `DS-GRID-2a`/`DS-GRID-2b`, covers
// `DS-GRID-2`). A state exercises a rule when plan Appendix B's "Flipped by" cell names the state's group (`main`,
// `updates`, `browse`, `details`, `dialogs`, `sources`, `sidebar`) or names none of them (the rule applies to every state);
// a rule Appendix B does not list is exercised by every state. Each printed id carries its Appendix B helper cell and its
// class: `judge-only` (Appendix B's judge-only sentence), `later` (owned by a helper no P0 item provides: lint, computed
// styles, axe, keyboard paths, …), `hard at P0` (Appendix B's "pass on the probe" list) or `gap` (a P0 helper, 1 to 8,
// and no rule). The exit code is 1 when any `gap` or `hard at P0` id prints. The groups follow `stateGroup` in measure.ts.
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
    if (state.endsWith('-dialog')) return 'dialogs';
    if (state.startsWith('sidebar-')) return 'sidebar';
    if (state.startsWith('main-sources')) return 'sources';
    if (state.endsWith('-details') || state === 'main-details-readme') return 'details';
    if (state.startsWith('main-browse-') || state.startsWith('main-quicksearch-')) return 'browse';
    if (state.startsWith('main-updates')) return 'updates';
    return 'main';
}

const GROUPS = ['main', 'updates', 'browse', 'details', 'dialogs', 'sources', 'sidebar'];

/** Appendix B: its table rows by id, the hard-at-P0 ids and the judge-only ids. */
export function readAppendixB(plan) {
    const start = plan.indexOf('| Rule | Helper | Catches | Flipped by |');
    // The paragraph before the table: from the blank line before it, or the start of the text.
    const intro = plan.slice(Math.max(0, plan.lastIndexOf('\n\n', plan.lastIndexOf('\n\n', start) - 1)), start);
    const table = plan.slice(start, plan.indexOf('\n\n', start)).split('\n').filter(line => /^\| (?!Rule |---)/.test(line));
    const rows = new Map();
    for (const line of table) {
        const [, ids, helper, , flipped] = line.split('|').map(cell => cell.trim());
        // Group qualifiers are the words before a colon, `main: P2.7 · updates: P3.1b`.
        const named = [...flipped.matchAll(/(?:^|·)\s*([a-z][a-z ]*?):/g)].map(match => match[1].trim()).filter(word => GROUPS.includes(word));
        for (const id of expandIds(ids)) {
            rows.set(id, { helper, flipped, groups: named.length > 0 ? named : GROUPS });
        }
    }
    const hardSentence = /`hard` at P0:([\s\S]*?)Every other rule/.exec(intro)?.[1] ?? '';
    const judgeSentence = /Judge-only:([\s\S]*?)\n\n/.exec(intro + '\n\n')?.[1] ?? '';
    return { rows, hardAtP0: new Set(expandIds(hardSentence)), judgeOnly: new Set(expandIds(judgeSentence)) };
}

/** The class of an unasserted id: judge-only, hard at P0, gap (a P0 helper owns it) or later. */
export function classify(id, appendix) {
    if (appendix.judgeOnly.has(id)) return 'judge-only';
    if (appendix.hardAtP0.has(id)) return 'hard at P0';
    const row = appendix.rows.get(id);
    if (row === undefined) return 'gap';
    return /^\d/.test(row.helper) && [...row.helper.matchAll(/\d+/g)].every(match => Number(match[0]) <= 8) ? 'gap' : 'later';
}

export function coverage(states, sources = { designSystem: read('docs/design/design-system.md'), plan: read('docs/plans/2026-10-23-nuiget-ux-execution-plan.md'), measure: read('src/test/ui/v2/measure.ts') }) {
    const ids = [...new Set([...sources.designSystem.matchAll(/^\| (DS-[A-Z]+-\d+)[a-z]? \|/gm)].map(match => match[1]))];
    const asserted = [...sources.measure.matchAll(/rule\('([A-Z0-9-]+[a-z]?)'/g)].map(match => match[1]);
    const appendix = readAppendixB(sources.plan);
    const groups = new Set(states.map(groupOf));
    return ids
        .filter(id => !asserted.some(rule => rule === id || (rule.startsWith(id) && /^[a-z]$/.test(rule.slice(id.length)))))
        .filter(id => (appendix.rows.get(id)?.groups ?? GROUPS).some(group => groups.has(group)))
        .map(id => ({ id, helper: appendix.rows.get(id)?.helper ?? '(not in Appendix B)', class: classify(id, appendix) }));
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

// Lists the CSS audit baseline entries an item still owns (G-UI step 1 of the UX plan):
//   node scripts/check-css-baseline.mjs --item <ID>
//
// UX-P0.21 (D28, ADR-010 Decision 8). `src/test/lint/__fixtures__/css-audit-baseline.json` labels each entry of the CSS
// lint gate with the plan item that removes it (`css-audit.test.ts`). A screen or primitive item closes with `0 entries`:
// the script prints `check-css-baseline: <n> entries for <ID>`, then one line per entry still labelled with the item, and
// exits 1 while any is left. `UX-P1.1` and `P1.1` name the same item. Exit 2 for a wrong usage. `--baseline <path>`
// reads another baseline file (its test's fixture).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE = path.join(ROOT, 'src/test/lint/__fixtures__/css-audit-baseline.json');

/** The plan item id without the `UX-` prefix of commit messages and notes, or undefined when it is not one. */
export function itemId(argument) {
    const id = /^(?:UX-)?(P\d[\w.-]*)$/.exec(argument ?? '')?.[1];
    return id;
}

/**
 * The entries of `baseline` labelled with `item`.
 * @template {{ item: string }} T
 * @param {T[]} baseline
 * @param {string} item
 * @returns {T[]}
 */
export const entriesFor = (baseline, item) => baseline.filter(entry => entry.item === item);

/** One entry as the lint prints a stale one: file, rule, selector, then property and value. */
export const formatEntry = entry =>
    `${entry.file}  ${entry.rule}  ${entry.selector ?? ''}${entry.property === null ? `  ${entry.value}` : `  ${entry.property}: ${entry.value}`}`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const at = args.indexOf('--item');
    const item = at < 0 ? undefined : itemId(args[at + 1]);
    const from = args.indexOf('--baseline');
    const baseline = from < 0 ? BASELINE : args[from + 1];
    if (item === undefined || baseline === undefined) {
        console.error('usage: node scripts/check-css-baseline.mjs --item <ID> [--baseline <path>]   (a plan item id, e.g. P2.5 or UX-P2.5)');
        process.exit(2);
    }
    const entries = entriesFor(JSON.parse(readFileSync(baseline, 'utf8')), item);
    console.log(`check-css-baseline: ${entries.length} entries for ${item}`);
    for (const entry of entries) {
        console.log(`  ${formatEntry(entry)}`);
    }
    process.exit(entries.length === 0 ? 0 : 1);
}

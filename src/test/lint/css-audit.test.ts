import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { type AuditHit, auditStylesheets, auditWebview, classesOf, deadRules, disableComments, inlineStyles, LINTED, type Source, STYLESHEETS } from './cssAudit';

/**
 * UX-P0.20 and UX-P0.21: the CSS lint gate (D28, ADR-010 Decisions 5–7, CA-R1). The six rules of the CSS audit
 * (`cssAudit.ts`) run over the linted stylesheets and the inline-style rule over the webview's TSX, and their hits must
 * equal `__fixtures__/css-audit-baseline.json`, the audit's 116 places, each labelled
 * with the plan item that removes it (design-advisor ruling of 2026-10-24, `docs/plans/handoff/P0.20.md`). A hit and an
 * entry match on file, rule, selector, property and value (a duplicate's value by the earlier rule's file only).
 *
 * A new hit is never baselined (design trigger 3): the item that adds or keeps it clears it in the same change. An entry
 * whose hit disappears is stale and removed in the same change by the item whose diff removed the hit, even when its
 * label names a later item (recorded in that item's note as `cleared ahead of <label>`); an entry is never relabelled,
 * and a rule is never kept alive to preserve one.
 */
const root = path.resolve(__dirname, '../../..');
const read = (file: string): string => fs.readFileSync(path.join(root, file), 'utf8');

interface Entry {
    file: string;
    rule: AuditHit['rule'];
    selector: string | null;
    property: string | null;
    value: string;
    item: string;
}

const BASELINE = JSON.parse(read('src/test/lint/__fixtures__/css-audit-baseline.json')) as Entry[];
/** The audit's own copy (UX plan A1: sha256 4417610d…), which the fixture may only shrink from. */
const RESEARCH = JSON.parse(read('docs/research/2026-10-23-ux-research/css-audit-baseline.json')) as Array<Omit<Entry, 'item'> & { line: number }>;

/** The matching key: a duplicate's value is the earlier rule's `file:line`, compared by its file. */
const keyOf = (entry: Omit<Entry, 'item'>): string =>
    JSON.stringify([entry.file, entry.rule, entry.selector, entry.property, entry.rule === 'duplicateSelector' ? entry.value.replace(/:\d+$/, '') : entry.value]);
const describeHit = (hit: Omit<Entry, 'item'> & { line?: number }): string =>
    `${hit.file}${hit.line === undefined ? '' : `:${hit.line}`}  ${hit.rule}  ${hit.selector}${hit.property === null ? `  ${hit.value}` : `  ${hit.property}: ${hit.value}`}`;

/** The hits that no entry accounts for, and the entries no hit accounts for, as multisets. */
function compare(hits: readonly AuditHit[], entries: readonly Omit<Entry, 'item'>[]): { added: AuditHit[]; stale: Omit<Entry, 'item'>[] } {
    const open = new Map<string, Omit<Entry, 'item'>[]>();
    for (const entry of entries) {
        open.set(keyOf(entry), [...(open.get(keyOf(entry)) ?? []), entry]);
    }
    const added: AuditHit[] = [];
    for (const hit of hits) {
        const matches = open.get(keyOf(hit));
        if (matches === undefined || matches.length === 0) {
            added.push(hit);
        } else {
            matches.pop();
        }
    }
    return { added, stale: [...open.values()].flat() };
}

/** The `.ts`/`.tsx` files under `src/webview`, tests included (each rule decides which it reads). */
function webviewSources(): Source[] {
    const sources: Source[] = [];
    const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
            const child = `${dir}/${entry.name}`;
            if (entry.isDirectory()) {
                walk(child);
            } else if (/\.tsx?$/.test(entry.name)) {
                sources.push({ file: child, text: read(child) });
            }
        }
    };
    walk('src/webview');
    return sources;
}

/** The status of each tracker row, by item id. */
function trackerStatus(tracker: string): Map<string, string> {
    const status = new Map<string, string>();
    for (const line of tracker.split(/\r?\n/)) {
        const match = /^\| (P[0-9][0-9a-z.-]*) \|[^|]*\|[^|]*\| ([a-z -]+) \|/.exec(line);
        if (match !== null) {
            status.set(match[1], match[2]);
        }
    }
    return status;
}

/** The done rule (UX-P0.21): the entries whose item's tracker row is `done`. */
const doneEntries = (entries: readonly Entry[], status: ReadonlyMap<string, string>): string[] =>
    entries.filter(entry => status.get(entry.item) === 'done').map(entry => `${entry.item}: ${describeHit(entry)}`);

/** A reader over in-memory stylesheets: the named roles, every other stylesheet empty. */
const sample = (sheets: Partial<Record<keyof typeof STYLESHEETS, string>>) => {
    const byFile = new Map(Object.entries(STYLESHEETS).map(([role, file]) => [file as string, sheets[role as keyof typeof STYLESHEETS] ?? '']));
    return (file: string): string => byFile.get(file) ?? '';
};
const rulesOf = (hits: readonly AuditHit[]): string[] => hits.map(hit => `${hit.rule} ${hit.selector}${hit.property === null ? '' : ` ${hit.property}`}`);

describe('the CSS lint gate (UX-P0.20, UX-P0.21)', () => {
    it('lints every stylesheet under src/webview but tokens.css', () => {
        const found: string[] = [];
        const walk = (dir: string): void => {
            for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
                const child = `${dir}/${entry.name}`;
                if (entry.isDirectory()) {
                    walk(child);
                } else if (entry.name.endsWith('.css') && child !== STYLESHEETS.tokens) {
                    found.push(child);
                }
            }
        };
        walk('src/webview');
        expect(found.sort()).toEqual([...LINTED].sort());
    });

    it('finds exactly the baselined places in the stylesheets, no new hit and no stale entry', () => {
        const hits = auditWebview(read, webviewSources());
        const { added, stale } = compare(hits, BASELINE);
        const counts = BASELINE.reduce<Record<string, number>>((total, entry) => ({ ...total, [entry.rule]: (total[entry.rule] ?? 0) + 1 }), {});
        console.warn(`[css-audit] baseline ${BASELINE.length}: ${Object.entries(counts).map(([rule, count]) => `${rule} ${count}`).join(', ')}`);
        expect.soft(added.map(describeHit), 'new hits: clear them in this change, never baseline them (design trigger 3)').toEqual([]);
        expect.soft(stale.map(describeHit), 'stale entries: remove them in the change that removed their hit').toEqual([]);
    });

    it('fails for an entry whose item is done: the item that removes it has closed (UX-P0.21)', () => {
        const status = trackerStatus(read('docs/plans/STATUS-ux.md'));
        expect(status.get('P0.20')).toBe('done');
        expect(doneEntries(BASELINE, status)).toEqual([]);
        // Planted: an entry fails once its item is done, and stays while its item is open.
        const planted = trackerStatus('| P1.1 | P1 | tokens | done | abc1234 | 2026-11-01 | |\r\n| P2.2 | P2 | Row | open |  |  | |');
        const entry = (item: string): Entry => ({ file: 'a.css', rule: 'pxLength', selector: '.a', property: 'width', value: '3px', item });
        expect(doneEntries([entry('P1.1'), entry('P2.2'), entry('P9.9')], planted)).toEqual(['P1.1: a.css  pxLength  .a  width: 3px']);
    });

    it('negative control: with the baseline emptied in memory, the gate reports exactly the baseline\'s places, all of them audited (UX-P0.21)', () => {
        const { added, stale } = compare(auditWebview(read, webviewSources()), []);
        const places = (list: readonly { file: string; rule: string }[]): string[] => list.map(entry => `${entry.file} ${entry.rule}`).sort();
        console.warn(`[css-audit] negative control: ${added.length} hits with the baseline emptied, ${RESEARCH.length} audited`);
        expect(stale).toEqual([]);
        expect(places(added)).toEqual(places(BASELINE));
        const research = new Set(RESEARCH.map(keyOf));
        expect(added.filter(hit => !research.has(keyOf(hit))).map(describeHit)).toEqual([]);
    });

    it('keeps the baseline a subset of the audit, each entry labelled with a plan item', () => {
        const research = new Set(RESEARCH.map(keyOf));
        expect(BASELINE.filter(entry => !research.has(keyOf(entry))).map(describeHit)).toEqual([]);
        expect(BASELINE.every(entry => !('line' in entry))).toBe(true);
        const tracker = read('docs/plans/STATUS-ux.md').split(/\r?\n/);
        const items = new Set(tracker.flatMap(line => /^\| (P[0-9][0-9a-z.-]*) \|/.exec(line)?.[1] ?? []));
        expect(BASELINE.filter(entry => !items.has(entry.item)).map(entry => `${entry.item}: ${describeHit(entry)}`)).toEqual([]);
    });

    it('pxLength: a px, em or rem length outside the spacing properties and custom properties', () => {
        const hits = auditStylesheets(sample({ main: '.nuiget-a { width: 3px; padding: 4px; --nuiget-x: 2px; font-size: 1.2em; }\n.nuiget-b { width: var(--nuiget-space-2); }' }));
        expect(rulesOf(hits)).toEqual(['pxLength .nuiget-a width', 'pxLength .nuiget-a font-size']);
        expect(hits[0]).toMatchObject({ file: STYLESHEETS.main, value: '3px', line: 1 });
    });

    it('duplicateSelector: a prelude declared twice in a bundle or in two stylesheets, body and :root exempt, tokens.css never reported', () => {
        const hits = auditStylesheets(sample({
            primitives: ':root { color: inherit; }\n.nuiget-a { display: block; }\n\n.nuiget-a { order: 1; }\n.nuiget-b { order: 1; }',
            tokens: ':root { --nuiget-x: 0; }\n.nuiget-a { order: 2; }',
            main: 'body { margin: 0; }\n.nuiget-c { order: 1; }',
            sidebar: 'body { margin: 0; }\n:root { color: inherit; }\n.nuiget-c { order: 2; }',
        }));
        expect(hits.filter(hit => hit.rule === 'duplicateSelector')).toEqual([
            { file: STYLESHEETS.primitives, rule: 'duplicateSelector', selector: '.nuiget-a', property: null, value: `${STYLESHEETS.primitives}:2`, line: 4 },
            { file: STYLESHEETS.sidebar, rule: 'duplicateSelector', selector: '.nuiget-c', property: null, value: `${STYLESHEETS.main}:2`, line: 3 },
        ]);
    });

    it('refuses what it cannot read: a nested style rule, an unclosed comment or string', () => {
        expect(() => auditStylesheets(sample({ main: '.x .y { .z .w { color: inherit; } }' }))).toThrow(/nested/);
        expect(() => auditStylesheets(sample({ main: '.x { color: inherit; }\n/* open' }))).toThrow(/comment opened on line 2/);
        expect(() => auditStylesheets(sample({ main: '.x { content: "open; }' }))).toThrow(/string opened on line 1/);
        expect(auditStylesheets(sample({ main: '@media (forced-colors: active) { .x { color: inherit; } }' }))).toEqual([]);
    });

    it('specificity: a complex selector above (0,2,0), counted per Selectors Level 4', () => {
        const hits = auditStylesheets(sample({
            search: '.a .b .c, .a .b, .a:where(.b .c .d) .e, .a > input::placeholder,\n.a:not(.b.c), .a .b input, .a tr:nth-child(even) { color: inherit; }',
        }));
        expect(hits.map(hit => `${hit.selector} ${hit.value} line ${hit.line}`)).toEqual([
            '.a .b .c (0,3,0) line 1', '.a:not(.b.c) (0,3,0) line 2', '.a .b input (0,2,1) line 2', '.a tr:nth-child(even) (0,2,1) line 2',
        ]);
    });

    it('override: a feature rule whose subject carries a primitive\'s classes and wins on a shared longhand', () => {
        const hits = auditStylesheets(sample({
            primitives: '.nuiget-p { flex: 1; padding: 0 var(--nuiget-space-2); }',
            main: '.nuiget-m .nuiget-p { flex: none; padding-inline-start: var(--nuiget-inset); order: 1; }\n.nuiget-m .nuiget-q { flex: none; }\n.nuiget-p::after { flex: none; }',
        }));
        expect(hits.filter(hit => hit.rule === 'override').map(hit => `${hit.selector} ${hit.property}`)).toEqual([
            '.nuiget-m .nuiget-p flex', '.nuiget-m .nuiget-p padding-inline-start',
        ]);
    });

    it('deadRule: a class no non-test source renders, literally or through a template or quoted prefix (UX-P0.21)', () => {
        const css = '.nuiget-live, .nuiget-gone .nuiget-live, .nuiget-tone--warn, .nuiget-hljs-keyword, .nuiget-live[data-x=".nuiget-no"] { color: inherit; }';
        const sources: Source[] = [
            { file: 'src/webview/main/A.tsx', text: 'const a = <div className="nuiget-live" />; // nuiget-gone in a comment\nconst b = `nuiget-tone--${tone}`; const p = \'nuiget-hljs-\';' },
            { file: 'src/webview/main/A.test.tsx', text: 'render(<div className="nuiget-gone" />);' },
            // A custom property's template and a bare prefix render no class.
            { file: 'src/webview/shared/B.ts', text: 'export type V = `--nuiget-${string}`; const c = `nuiget-${name}`; const q = \'nuiget-\';' },
        ];
        expect(classesOf('.a:not(.b) > .c[data-x=".d"]::after')).toEqual(['a', 'b', 'c']);
        expect(deadRules(sample({ sidebar: css }), sources)).toEqual([
            { file: STYLESHEETS.sidebar, rule: 'deadRule', selector: '.nuiget-gone .nuiget-live', property: null, value: 'nuiget-gone', line: 1 },
        ]);
    });

    it('disableComment: a stylelint or eslint disable comment in a stylesheet (UX-P0.21)', () => {
        const hits = disableComments(sample({ search: '/* the popup */\n.a { color: inherit; }\n/* stylelint-disable-next-line declaration-no-important */\n/* eslint-disable */' }));
        expect(hits.map(hit => `${hit.line} ${hit.value}`)).toEqual(['3 /* stylelint-disable-next-line declaration-no-important */', '4 /* eslint-disable */']);
        // Comment-aware: the same words outside a comment are no directive.
        expect(disableComments(sample({ search: '.a::after { content: "eslint-disable"; }\n.b { grid-area: stylelint-disable; }' }))).toEqual([]);
    });

    it('inlineStyle: every style prop is a cssVars call of --nuiget-* properties, or undefined (UX-P0.21)', () => {
        const tsx = [
            '<div style={cssVars({ \'--nuiget-a\': `${x}px` })} />',
            '<div style={on ? cssVars({ \'--nuiget-b\': n, "--nuiget-c": m }) : undefined} />',
            '<div style={{ height: 3 }} />',
            '<div style={cssVars({ height: 3 })} />',
            '<div style={on ? cssVars({ \'--nuiget-d\': 1 }) : { width: 2 }} />',
        ].join('\n');
        const hits = inlineStyles([{ file: 'src/webview/main/A.tsx', text: tsx }, { file: 'src/webview/main/a.ts', text: 'style={{ height: 3 }}' }]);
        expect(hits.map(hit => `${hit.line} ${hit.value}`)).toEqual(['3 { height: 3 }', '4 cssVars({ height: 3 })', '5 on ? cssVars({ \'--nuiget-d\': 1 }) : { width: 2 }']);
    });
});

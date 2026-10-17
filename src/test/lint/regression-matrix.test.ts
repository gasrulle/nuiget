import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkMatrix, declaredTitles, parseMatrix, titleDeclared } from '../../../scripts/check-regression-matrix.mjs';

/** Plan item P10.0a: the regression coverage matrix cites tests that exist (`npm run check:matrix`). */
const MATRIX = 'docs/plans/regression-matrix.md';
const header = '| ID | Area | Behaviour | Surface | Kind | Test file | Test title | Status |\n|---|---|---|---|---|---|---|---|\n';
const files: Record<string, string> = {
    'src/a.test.ts': [
        "it('opens the panel', () => {});",
        "it.skipIf(onWindows)('the list\\'s right edge', () => {});",
        'it.each(themes)(`${nameOf(theme)}: no violation`, () => {});',
        "it.each(cases)('%s: one response', () => {});",
    ].join('\n'),
};
const read = (file: string): string => files[file] ?? '';
const exists = (file: string): boolean => file in files;
const findings = (rows: string[]): string[] => checkMatrix(header + rows.join('\n'), read, exists).findings;

describe('regression matrix check', () => {
    it('the matrix of the repository passes, every row has a status, and the counts add up', () => {
        const markdown = readFileSync(MATRIX, 'utf8');
        const result = checkMatrix(markdown, (file: string) => readFileSync(file, 'utf8'), (file: string) => existsSync(file));
        expect(result.findings).toEqual([]);
        expect(result.rows.length).toBeGreaterThan(100);
        expect(result.rows.every((row: { status: string }) => ['covered', 'gap', 'manual-credentials'].includes(row.status))).toBe(true);
    });

    it('reads the titles as the files write them: escapes, skipIf, each, templates and %s', () => {
        const titles = declaredTitles(files['src/a.test.ts']);
        expect(titles).toEqual(['opens the panel', "the list's right edge", '${nameOf(theme)}: no violation', '%s: one response']);
        expect(titleDeclared("the list's right edge", titles)).toBe(true);
        expect(titleDeclared('Dark Modern: no violation', titles)).toBe(true);
        expect(titleDeclared('ops/install: one response', titles)).toBe(true);
        expect(titleDeclared('opens the panel twice', titles)).toBe(false);
    });

    it('accepts a covered row whose title the file declares, a gap row naming its test, and a manual row without a citation', () => {
        expect(findings([
            '| R1 | A | b | main | unit | `src/a.test.ts` | opens the panel | covered |',
            '| R2 | A | b | main | unit | `src/new.test.ts` | the test to write | gap |',
            '| R3 | A | b | host | unit | — | — | manual-credentials |',
        ])).toEqual([]);
    });

    it('fails a planted bad row: missing file, missing title, unknown status or kind, duplicate id, a gap without its test', () => {
        expect(findings([
            '| R1 | A | b | main | unit | `src/missing.test.ts` | opens the panel | covered |',
            '| R2 | A | b | main | unit | `src/a.test.ts` | opens the panel twice | covered |',
            '| R3 | A | b | main | unit | `src/a.test.ts` | opens the panel | maybe |',
            '| R3 | A | b | main | screenshot | `src/a.test.ts` | opens the panel | covered |',
            '| R5 | A | b | main | unit | — | — | gap |',
            '| R6 | A | b | main | unit | `src/a.test.ts` | covered |',
        ])).toEqual([
            `${MATRIX}: R1: src/missing.test.ts does not exist`,
            `${MATRIX}: R2: src/a.test.ts declares no test "opens the panel twice"`,
            `${MATRIX}: R3: status "maybe" is not covered, gap or manual-credentials`,
            `${MATRIX}: R3: duplicate id`,
            `${MATRIX}: R3: kind "screenshot" is not ui, e2e, harness or unit`,
            `${MATRIX}: R5: a gap row names a test file and a test title`,
            `${MATRIX}: R6: 7 columns, expected 8`,
        ]);
        expect(checkMatrix('no table here', read, exists).findings).toEqual([`${MATRIX}: no rows`]);
        expect(parseMatrix(header + '| R1 | A | b | main | unit | `src/a.test.ts` | t | covered |')[0].file).toBe('src/a.test.ts');
    });
});

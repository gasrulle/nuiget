import { describe, expect, it } from 'vitest';
import { classify, coverage, expandIds, groupOf, readAppendixB } from '../../../scripts/check-rule-coverage.mjs';

/** UX-P0.13: `scripts/check-rule-coverage.mjs`, which lists the Design System rules the states exercise and no rule asserts. */
describe('scripts/check-rule-coverage.mjs', () => {
    const plan = [
        '`hard` at P0: PF-6 (P0.10); DS-ROW-4, DS-TYPE-1 (pass on the probe). Every other rule lands `pending`. Judge-only: optical',
        'centring, DS-DENSITY-2 under compact density.',
        '',
        '| Rule | Helper | Catches | Flipped by |',
        '|---|---|---|---|',
        '| DS-GRID-2b (header proximity) | 1 | V4 | main: P2.6 · then as DS-GRID-1 |',
        '| DS-ROW-1, DS-ROW-3 | 2, 4, 6 | V2 | P2.2 |',
        '| DS-ICON-1 | lint | — | P1.4a |',
        '| DS-STATE-1/2/3 | markers + captures | — | P2.8b |',
        '| DS-INSET-1 | 2 | — | main: P2.7 · sidebar: P3.7a |',
        '',
    ].join('\n');

    it('expands the shorthands Appendix B writes', () => {
        expect(expandIds('DS-STATE-1/2/3, DS-FOCUS-1..4 and DS-HEIGHT-4/8 and DS-GRID-2b')).toEqual([
            'DS-STATE-1', 'DS-STATE-2', 'DS-STATE-3', 'DS-FOCUS-1', 'DS-FOCUS-2', 'DS-FOCUS-3', 'DS-FOCUS-4', 'DS-HEIGHT-4', 'DS-HEIGHT-8', 'DS-GRID-2b',
        ]);
    });

    it('files states into the groups of measure.ts', () => {
        expect(['main-installed-single', 'main-updates', 'main-quicksearch-open', 'main-browse-details', 'sidebar-update-all-dialog', 'sidebar-sections', 'main-sources-list'].map(groupOf))
            .toEqual(['main', 'updates', 'browse', 'details', 'dialogs', 'sidebar', 'sources']);
    });

    it('reads Appendix B: rows with their groups, the hard-at-P0 ids and the judge-only ids', () => {
        const appendix = readAppendixB(plan);
        expect(appendix.rows.get('DS-INSET-1')?.groups).toEqual(['main', 'sidebar']);
        expect(appendix.rows.get('DS-ROW-3')?.groups).toHaveLength(7);
        expect([...appendix.hardAtP0]).toEqual(['DS-ROW-4', 'DS-TYPE-1']);
        expect([...appendix.judgeOnly]).toEqual(['DS-DENSITY-2']);
        expect(['DS-ROW-1', 'DS-ICON-1', 'DS-STATE-2', 'DS-ROW-4', 'DS-DENSITY-2', 'DS-ALIGN-1'].map(id => classify(id, appendix)))
            .toEqual(['gap', 'later', 'later', 'hard at P0', 'judge-only', 'gap']);
    });

    it('lists the ids the states exercise that no rule asserts, a split rule covering its parent', () => {
        const designSystem = ['DS-GRID-2', 'DS-ROW-1', 'DS-ROW-3', 'DS-ICON-1', 'DS-INSET-1', 'DS-ALIGN-1'].map(id => `| ${id} | text |`).join('\n');
        const measure = "rule('DS-GRID-2a', {}); rule('DS-GRID-2b', {}); rule('DS-ROW-3', {});";
        const rows = coverage(['main-updates'], { designSystem, plan, measure });
        // DS-GRID-2 is covered by 2a/2b; DS-ROW-3 is asserted; DS-INSET-1 is not exercised by an Updates state.
        expect(rows).toEqual([
            { id: 'DS-ROW-1', helper: '2, 4, 6', class: 'gap' },
            { id: 'DS-ICON-1', helper: 'lint', class: 'later' },
            { id: 'DS-ALIGN-1', helper: '(not in Appendix B)', class: 'gap' },
        ]);
        expect(coverage(['main-installed-single'], { designSystem, plan, measure }).map(row => row.id)).toContain('DS-INSET-1');
    });
});

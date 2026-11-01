import { describe, expect, it } from 'vitest';
import { composeSheet, diffLine, judgeVerdict, measurementSummary, pairCells, parseArgs, PNG, renderHtml } from '../../../scripts/contact-sheet.mjs';

/**
 * UX-P2.10: `scripts/contact-sheet.mjs`, the owner's before/after page. This test holds what the page may not get wrong: the
 * checkpoint's states, a capture without a "before" named as such, images at 1:1, the verdict and the counts read from the
 * logs, and one question per state.
 */
const image = (width: number, height: number, value: number) => {
    const png = new PNG({ width, height });
    png.data.fill(value);
    return { png, bytes: Buffer.from([1, 2, 3]), width, height, sha256: `sha-${value}` };
};

describe('contact-sheet (UX-P2.10)', () => {
    it('takes a known checkpoint and both directories', () => {
        expect(parseArgs(['slice-1', '--before', 'a', '--after', 'b'])).toMatchObject({ checkpoint: 'slice-1', before: 'a', after: 'b' });
        expect(() => parseArgs(['slice-2', '--before', 'a', '--after', 'b'])).toThrow(/usage/);
        expect(() => parseArgs(['slice-1', '--before', 'a'])).toThrow(/required/);
    });

    it('pairs by file name, inside the checkpoint, the primary cell first, and names a missing before', () => {
        const after = ['main-installed-single.light-modern.1200.png', 'main-installed-single.dark-modern.932.png', 'main-installed-single.dark-modern.1200.png', 'main-installed-empty.dark-modern.1200.png', 'main-updates.dark-modern.1200.png', 'workbench.modern.json'];
        const before = ['main-installed-single.dark-modern.1200.png', 'main-installed-single.light-modern.1200.png', 'main-installed-single.dark-modern.932.png', 'main-installed-single.webview.png'];
        const states = pairCells('slice-1', after, before);
        expect(states.map(entry => entry.state)).toEqual(['main-installed-empty', 'main-installed-single']);
        expect(states[0].cells).toEqual([{ file: 'main-installed-empty.dark-modern.1200.png', cell: 'main-installed-empty.dark-modern.1200', hasBefore: false }]);
        expect(states[1].cells.map((cell: { cell: string }) => cell.cell)).toEqual(['main-installed-single.dark-modern.1200', 'main-installed-single.dark-modern.932', 'main-installed-single.light-modern.1200']);
        expect(pairCells('release', after, before).map(entry => entry.state)).toContain('main-updates');
    });

    it('reads the last panel that scored a state, and says when none did', () => {
        const logs = [
            { item: 'P2.1', runs: [{ runId: '1', captures: { a: {} }, findings: [{ state: 'a', severity: 'blocking', rule: 'DS-X', owner: 'P9' }] }] },
            { item: 'P2.2', runs: [
                { runId: '2', captures: { a: {} }, findings: [{ state: 'a', severity: 'major', rule: 'DS-Y', owner: 'P3' }, { state: 'b', severity: 'major', rule: 'DS-Z' }], refuted: [{ state: 'a' }] },
                { runId: '3', captures: { b: {} }, findings: [] },
            ] },
        ];
        expect(judgeVerdict('a', logs).text).toBe('Judge (UX-P2.2, run 2): 1 standing, 0 blocking, 1 refuted; rules DS-Y; owners P3');
        expect(judgeVerdict('c', logs)).toEqual({ judged: false, text: 'Judge: no panel scored this state' });
    });

    it('counts a state\'s own measurement lines, not those of a state whose name starts the same', () => {
        const log = [
            '[measure] DS-A@main-installed-focus: 1 (hard)',
            '[measure] DS-B@main-installed-focus/rows: 2 (hard)',
            '[measure] DS-C@main-installed-focus: 3 (pending P3.9)',
            '[measure] DS-A@main-installed-focus-x: 1 (hard)',
            '[axe] main-installed-focus: 0 violations, 0 incomplete, 40 rules passed, 48 inapplicable (a11y-full-axe-real-page, hard)',
            '[aria] main-installed-focus: 60 nodes, equal',
        ].join('\r\n');
        expect(measurementSummary('main-installed-focus', log)).toBe('Measurements: 2 hard; 1 pending (P3.9). axe: 0 violations, 0 incomplete, 40 rules passed, 48 inapplicable. ARIA: 60 nodes, equal');
        expect(diffLine('a.dark-modern.1200', '[diff] a.dark-modern.1200: 0 px (within)')).toBe('0 px (within)');
        expect(diffLine('b.dark-modern.1200', '[diff] a.dark-modern.1200: 0 px (within)')).toBe('no golden line');
    });

    it('renders 1:1, one question per state, and no stand-in for a missing before', () => {
        const html = renderHtml({
            checkpoint: 'slice-1', runId: '42', states: [{
                state: 'main-installed-empty', verdict: 'Judge: <none>', summary: 'Measurements: 0 hard',
                cells: [{ cell: 'main-installed-empty.dark-modern.1200', diff: '0 px', after: image(1200, 803, 1) }, { cell: 'main-installed-empty.light-modern.1200', diff: '0 px', before: image(1200, 803, 2), after: image(1200, 803, 3) }],
            }],
        });
        expect(html.match(/width="1200" height="803"/g)).toHaveLength(3);
        expect(html).toContain('img { display: block; max-width: none;');
        expect(html).toContain('No 2.0 capture');
        expect(html.match(/type="radio"/g)).toHaveLength(2);
        expect(html).toContain('Judge: &lt;none&gt;');
        const unpaired = renderHtml({ checkpoint: 'slice-1', runId: '42', states: [{ state: 'main-installed-loading', verdict: 'v', summary: 's', cells: [{ cell: 'c', diff: '0 px', after: image(10, 10, 1) }] }] });
        expect(unpaired).not.toContain('type="radio"');
        expect(unpaired).toContain('no question for this state');
    });

    it('composes the pairs at 1:1, leaving a missing before empty', () => {
        const sheet = composeSheet([{ before: image(4, 2, 200), after: image(6, 3, 100) }, { after: image(6, 2, 50) }]);
        expect(sheet.width).toBe(24 * 3 + 6 + 6);
        expect(sheet.height).toBe(24 + 3 + 24 + 2 + 24);
        const at = (x: number, y: number) => sheet.data[(y * sheet.width + x) * 4];
        expect(at(24, 24)).toBe(200);
        expect(at(24 * 2 + 6, 24)).toBe(100);
        expect(at(24, 24 + 3 + 24)).toBe(0x80);
        expect(at(24 * 2 + 6, 24 + 3 + 24)).toBe(50);
    });
});

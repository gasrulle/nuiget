import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../../scripts/crop-png.mjs';
import { fringeLine, fringeValue, lineVerdict, lineVerdicts, LCD_RATIO, MIN_INK, summarize, type Pixels, type TextLine } from '../ui/v2/fringe';
import { pixelRuleLines, RULES } from '../ui/v2/measure';

/**
 * DS-TYPE-10's reader (UX-P3.fix-4, design-advisor opening ruling of 2026-11-13, DO 13), proved both ways on two crops cut
 * with `node scripts/crop-png.mjs <png> 0 55 300 110 <out> 1` (the Installed pane header and three rows):
 * - `sidebar-sections-lcd.png` from golden `sidebar-sections.dark-modern.300.png`, sha256
 *   48093b0738a0e49c615d8813f4d2850dba607f6abc813fad70a10888bb34a699 (LCD);
 * - `h27-P-a-greyscale.png` from `captures/43353120809/probe/h27-P-a.png`, sha256
 *   cab6a927734cb2cdad0a21ff8bfbbfe06a46c2a33a8199f2c9715c5d4f75ac3f (the box focused and empty; greyscale).
 * The fixtures, not the goldens, are read: the goldens are re-adopted at the cure.
 */
const fixture = (name: string): Pixels => decodePng(path.join(__dirname, '__fixtures__', 'fringe', name)) as Pixels;

const NEUTRAL: [number, number, number] = [204, 204, 204];
const line = (label: string, x: number, y: number, width: number, height: number, extra: Partial<TextLine> = {}): TextLine =>
    ({ label, x, y, width, height, color: NEUTRAL, visible: true, ...extra });

// The text lines of the two crops (CSS px at DPR 1): the pane header's title (the chevron and the count badge left out)
// and the three package rows, as the ink rows of both crops place them.
const LINES: TextLine[] = [
    line('section-header-installed', 26, 3, 200, 18),
    line('row 1', 27, 30, 150, 18),
    line('row 2', 27, 52, 160, 16),
    line('row 3', 27, 74, 160, 16),
    line('row 4', 27, 96, 240, 14),
];

describe('DS-TYPE-10 reader (UX-P3.fix-4)', () => {
    it('reads every line of the LCD golden as LCD', () => {
        const verdicts = lineVerdicts(fixture('sidebar-sections-lcd.png'), LINES, 1);
        expect(verdicts.map(verdict => verdict.skipped)).toEqual([undefined, undefined, undefined, undefined, undefined]);
        for (const verdict of verdicts) {
            expect(verdict.ink, verdict.label).toBeGreaterThanOrEqual(MIN_INK);
            expect(verdict.fringe / verdict.ink, verdict.label).toBeGreaterThanOrEqual(LCD_RATIO);
            expect(verdict.greyscale, verdict.label).toBe(false);
        }
        const summary = summarize(verdicts);
        expect(summary).toEqual({ judged: 5, greyscale: 0, skipped: 0, first: undefined, pass: true });
        expect(fringeLine('sidebar-sections.dark-modern.300', summary)).toBe('[fringe] sidebar-sections.dark-modern.300: 5 lines, 0 greyscale, 0 skipped');
    });

    it('reads every line of the focused-box probe as greyscale', () => {
        const verdicts = lineVerdicts(fixture('h27-P-a-greyscale.png'), LINES, 1);
        expect(verdicts.every(verdict => verdict.skipped === undefined && verdict.greyscale && verdict.fringe === 0)).toBe(true);
        const summary = summarize(verdicts);
        expect(summary).toEqual({ judged: 5, greyscale: 5, skipped: 0, first: 'section-header-installed', pass: false });
        expect(fringeLine('h27 P-a', summary)).toBe('[fringe] h27 P-a: 5 lines, 5 greyscale (section-header-installed), 0 skipped');
        expect(fringeValue(summary)).toBe('5 lines judged, 5 greyscale (first section-header-installed)');
    });

    it('skips what it cannot judge: a low rect, covered or coloured text, a coloured surface, a line with little ink', () => {
        const image = fixture('sidebar-sections-lcd.png');
        expect(lineVerdict(image, line('low', 27, 30, 150, 3), 1).skipped).toBe('low');
        expect(lineVerdict(image, line('covered', 27, 30, 150, 18, { visible: false }), 1).skipped).toBe('covered');
        expect(lineVerdict(image, line('green', 27, 30, 150, 18, { color: [137, 209, 133] }), 1).skipped).toBe('coloured text');
        expect(lineVerdict(image, line('outside', 400, 30, 20, 18), 1).skipped).toBe('outside');
        // The blank band between the header and the first row holds no ink.
        expect(lineVerdict(image, line('blank', 27, 24, 150, 6), 1).skipped).toBe('little ink');
        const tinted: Pixels = { width: 4, height: 4, pixels: new Uint8Array(4 * 4 * 4).map((_, index) => [0, 90, 200, 255][index % 4]) };
        expect(lineVerdict(tinted, line('band', 0, 0, 4, 4), 1).skipped).toBe('coloured surface');
    });

    it('reads a crop at DPR 2 through device pixels', () => {
        const image = fixture('sidebar-sections-lcd.png');
        // The same rect in CSS px at DPR 2 covers twice the device pixels: half the rect at DPR 2 is the rect at DPR 1.
        expect(lineVerdict(image, line('row 1', 13.5, 15, 75, 9), 2)).toEqual(lineVerdict(image, LINES[1], 1));
    });

    it('prints DS-TYPE-10 after the shot, on the sidebar cells of the ui lane, pending on UX-P3.fix-4', () => {
        const read = { 'DS-TYPE-10': { value: fringeValue(summarize(lineVerdicts(fixture('h27-P-a-greyscale.png'), LINES, 1))), pass: false } };
        expect(pixelRuleLines('sidebar-sections', 300, 'dark-modern', 'ui', read)).toEqual([
            { name: 'DS-TYPE-10@sidebar-sections', value: '5 lines judged, 5 greyscale (first section-header-installed)', status: { pending: 'P3.fix-4' }, pass: false },
        ]);
        expect(pixelRuleLines('sidebar-sections', 300, 'dark-modern', 'matrix', read)).toEqual([]);
        expect(pixelRuleLines('main-installed-single', 1200, 'dark-modern', 'ui', read)).toEqual([]);
        expect(pixelRuleLines('sidebar-filter', 300, 'dark-modern', 'ui', {})).toEqual([
            { name: 'DS-TYPE-10@sidebar-filter', value: 'not measurable (no pixels)', status: { pending: 'P3.fix-4' }, pass: false },
        ]);
        expect(RULES.find(rule => rule.id === 'DS-TYPE-10')).toMatchObject({ scopes: { sidebar: { pending: 'P3.fix-4' } }, lanes: ['ui'], pixels: true });
    });

    it('passes a cell only when it judged a line and found none greyscale', () => {
        expect(summarize([]).pass).toBe(false);
        expect(summarize([{ label: 'x', ink: 50, fringe: 0, skipped: 'little ink', greyscale: false }])).toEqual({ judged: 0, greyscale: 0, skipped: 1, first: undefined, pass: false });
    });
});

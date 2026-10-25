import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { composite, CONTRAST_LINT_STATUS, CONTRAST_PAIRS_PENDING, contrastPairLine, contrastRatio, exemptIn, pairName, pairRatio, parseCssColor, thresholdFor, TOKEN_PAIRS } from '../ui/v2/contrast';

/**
 * UX-P0.25 (H49; `a11y-text-contrast-all-states`, `a11y-nontext-contrast`): the curated token pairs of
 * `src/test/ui/v2/contrast.ts` measured offline in every theme and look of the theme dump's token records
 * (`docs/design/themes/<theme>.tokens.css` classic, `<theme>.modern.tokens.css` Modern UI; UX-P0.14). A red pair fails once
 * `CONTRAST_LINT_STATUS` is `hard`, unless it is exempt by a ruling or pending on the item that fixes it.
 */
const root = path.resolve(__dirname, '../../..');
const THEMES_DIR = path.join(root, 'docs/design/themes');

/** The `--nuiget-*` declarations of a token record (split on `\r?\n`: the Windows job checks out CRLF). */
const tokensOf = (file: string): Record<string, string> =>
    Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line => {
        const match = /^\s*(--nuiget-[a-z0-9-]+):\s*(.+?);\s*$/.exec(line);
        return match ? [[match[1], match[2]]] : [];
    }));

const records = fs.readdirSync(THEMES_DIR).filter(file => file.endsWith('.tokens.css')).sort().map(file => {
    const modern = file.endsWith('.modern.tokens.css');
    return { file, theme: file.replace(/(\.modern)?\.tokens\.css$/, ''), look: modern ? 'modern' as const : 'classic' as const, tokens: tokensOf(path.join(THEMES_DIR, file)) };
});

describe('theme contrast (UX-P0.25)', () => {
    it('computes WCAG 2.x contrast: luminance, alpha over a backdrop, the large-text threshold, an unparsable value', () => {
        const black = parseCssColor('#000')!;
        const white = parseCssColor('#ffffff')!;
        expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
        expect(contrastRatio(parseCssColor('#777777')!, white)).toBeCloseTo(4.48, 2);
        const thumb = composite(parseCssColor('rgba(121, 121, 121, 0.4)')!, parseCssColor('#181818')!);
        expect([thumb.r, thumb.g, thumb.b, thumb.a].map(value => Math.round(value * 10) / 10)).toEqual([62.8, 62.8, 62.8, 1]);
        expect(parseCssColor('#79797966')).toEqual({ r: 121, g: 121, b: 121, a: 0.4 });
        expect(parseCssColor('rgb(0 120 212 / 50%)')).toEqual({ r: 0, g: 120, b: 212, a: 0.5 });
        expect(parseCssColor('color-mix(in srgb, #000 50%, transparent)')).toBeNull();
        expect(parseCssColor('Canvas')).toBeNull();
        expect([thresholdFor(13, 400, 'text'), thresholdFor(24, 400, 'text'), thresholdFor(18.66, 700, 'text'), thresholdFor(18.66, 600, 'text'), thresholdFor(13, 400, 'non-text')]).toEqual([4.5, 3, 3, 4.5, 3]);
    });

    it('measures a pair from a theme\'s tokens, a translucent background over its surface, and says when a token is missing', () => {
        const tokens = { '--nuiget-color-fg': '#cccccc', '--nuiget-color-bg': '#1f1f1f', '--nuiget-color-list-hover-bg': 'rgba(255, 255, 255, 0.1)' };
        expect(pairRatio({ fg: 'fg', bg: 'bg', kind: 'text' }, tokens)).toBeCloseTo(contrastRatio(parseCssColor('#cccccc')!, parseCssColor('#1f1f1f')!), 6);
        const hover = composite(parseCssColor('rgba(255, 255, 255, 0.1)')!, parseCssColor('#1f1f1f')!);
        expect(pairRatio({ fg: 'fg', bg: 'list-hover-bg', over: 'bg', kind: 'text' }, tokens)).toBeCloseTo(contrastRatio(parseCssColor('#cccccc')!, hover), 6);
        expect(pairRatio({ fg: 'link', bg: 'bg', kind: 'text' }, tokens)).toBeNull();
        expect(contrastPairLine({ fg: 'link', bg: 'bg', kind: 'text' }, 'dark-modern', 'modern', null, 'hard', [])).toEqual({
            line: '[contrast] link/bg@dark-modern/modern: not measurable (a token is missing or not a colour) (hard)', failure: 'link/bg@dark-modern/modern not measurable',
        });
        expect(contrastPairLine({ fg: 'border', bg: 'bg', kind: 'non-text' }, 'dark-modern', 'classic', 1.26, 'hard', [{ pair: 'border/bg', theme: 'dark-modern', look: 'classic', item: 'P2.3' }])).toEqual({
            line: '[contrast] border/bg@dark-modern/classic: 1.26 vs 3 (below) (pending P2.3)', failure: undefined,
        });
        expect(contrastPairLine({ fg: 'fg', bg: 'bg', kind: 'text' }, 'light-2026', 'modern', 3.98, 'hard', []).failure).toBe('fg/bg@light-2026/modern 3.98 < 4.5');
        // An exemption scoped to themes holds there only; elsewhere the cell is judged.
        const scoped = { fg: 'input-border', bg: 'bg', kind: 'non-text' as const, exempt: { reason: 'parity', themes: ['dark-modern'] } };
        expect(contrastPairLine(scoped, 'dark-modern', 'modern', 1.2, 'hard', [])).toEqual({ line: '[contrast] input-border/bg@dark-modern/modern: 1.2 vs 3 (below) (exempt: parity)', failure: undefined });
        expect(contrastPairLine(scoped, 'dark-high-contrast', 'modern', 1.2, 'hard', []).failure).toBe('input-border/bg@dark-high-contrast/modern 1.2 < 3');
        expect(contrastPairLine({ ...scoped, exempt: { reason: 'parity' } }, 'dark-high-contrast', 'modern', null, 'hard', []).failure).toBeUndefined();
    });

    it('reads the twelve token records of the theme dump, six themes in two looks', () => {
        expect(records.map(record => `${record.theme}/${record.look}`)).toEqual([
            'dark-2026/modern', 'dark-2026/classic', 'dark-high-contrast/modern', 'dark-high-contrast/classic', 'dark-modern/modern', 'dark-modern/classic',
            'light-2026/modern', 'light-2026/classic', 'light-high-contrast/modern', 'light-high-contrast/classic', 'light-modern/modern', 'light-modern/classic',
        ]);
        for (const record of records) {
            expect(Object.keys(record.tokens).length, record.file).toBeGreaterThan(40);
        }
    });

    it('holds every curated pair to its threshold in every theme and look, unless a ruling exempts it or an item is named for it', () => {
        const failures: string[] = [];
        for (const record of records) {
            for (const pair of TOKEN_PAIRS) {
                const { line, failure } = contrastPairLine(pair, record.theme, record.look, pairRatio(pair, record.tokens));
                console.warn(line);
                if (failure !== undefined) {
                    failures.push(failure);
                }
            }
        }
        if (CONTRAST_LINT_STATUS === 'hard') {
            expect(failures).toEqual([]);
        }
    });

    it('names in its pending entries and exemptions only pairs, themes and looks the records have, each entry on an open tracker row and on a cell that fails', () => {
        const names = new Set(TOKEN_PAIRS.map(pairName));
        const cells = new Set(records.map(record => `${record.theme}/${record.look}`));
        const status = new Map(fs.readFileSync(path.join(root, 'docs/plans/STATUS-ux.md'), 'utf8').split(/\r?\n/).flatMap(line => {
            const match = /^\| (P[0-9][0-9a-z.-]*) \|[^|]*\|[^|]*\| ([a-z -]+) \|/.exec(line);
            return match ? [[match[1], match[2]]] : [];
        }));
        const themes = new Set(records.map(record => record.theme));
        for (const entry of CONTRAST_PAIRS_PENDING) {
            expect(names.has(entry.pair), entry.pair).toBe(true);
            expect(cells.has(`${entry.theme}/${entry.look}`), `${entry.theme}/${entry.look}`).toBe(true);
            expect(status.has(entry.item) && status.get(entry.item) !== 'done', entry.item).toBe(true);
            // A cell its item fixed (it now meets its threshold) leaves the registry in that item's change.
            const pair = TOKEN_PAIRS.find(candidate => pairName(candidate) === entry.pair)!;
            const record = records.find(candidate => candidate.theme === entry.theme && candidate.look === entry.look)!;
            const ratio = pairRatio(pair, record.tokens);
            expect(exemptIn(pair, entry.theme), `${entry.pair}@${entry.theme} is exempt and pending`).toBe(false);
            expect(ratio === null || ratio < thresholdFor(13, 400, pair.kind), `${entry.pair}@${entry.theme}/${entry.look} meets its threshold: a stale entry`).toBe(true);
        }
        expect(new Set(CONTRAST_PAIRS_PENDING.map(entry => `${entry.pair}@${entry.theme}/${entry.look}`)).size).toBe(CONTRAST_PAIRS_PENDING.length);
        for (const pair of TOKEN_PAIRS) {
            for (const theme of pair.exempt?.themes ?? []) {
                expect(themes.has(theme), `${pairName(pair)} exempt in ${theme}`).toBe(true);
            }
        }
    });
});

/**
 * WCAG 2.x contrast for the accessibility harness (UX-P0.25; H49; `a11y-text-contrast-all-states`,
 * `a11y-nontext-contrast`): one implementation of the colour maths for the offline lint over the theme dumps' token
 * records (`src/test/lint/theme-contrast.test.ts`, `docs/design/themes/<theme>[.modern].tokens.css`) and for the pairs the
 * capture audit and the theme pass measure in the webview (`a11y.ts`). The pair table is curated, not "every token pair":
 * the workbench's own pairs fall below the thresholds in places (H49's refutation, D22), and a pair's exemption is a
 * design-advisor ruling.
 *
 * Plain data and pure functions: `src/test/lint` imports it without ExTester.
 */
import type { RuleStatus } from './measure';

/** An sRGB colour with alpha, channels 0–255, alpha 0–1. */
export interface Rgba {
    r: number;
    g: number;
    b: number;
    a: number;
}

/** A colour from CSS text: hex (3, 4, 6, 8 digits), `rgb()`/`rgba()` or `transparent`; null for anything else (never a guess). */
export function parseCssColor(text: string): Rgba | null {
    const value = text.trim().toLowerCase();
    if (value === 'transparent') {
        return { r: 0, g: 0, b: 0, a: 0 };
    }
    const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value);
    if (hex) {
        const digits = hex[1].length <= 4 ? [...hex[1]].map(digit => digit + digit).join('') : hex[1];
        const [r, g, b, a = 255] = (digits.match(/../g) ?? []).map(pair => Number.parseInt(pair, 16));
        return { r, g, b, a: a / 255 };
    }
    const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value);
    if (rgb) {
        const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? Number.parseFloat(rgb[4]) / 100 : Number(rgb[4]);
        return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: alpha };
    }
    return null;
}

/** A colour composited over an opaque backdrop: what the eye sees of a translucent foreground or background. */
export function composite(top: Rgba, backdrop: Rgba): Rgba {
    const a = top.a;
    return { r: top.r * a + backdrop.r * (1 - a), g: top.g * a + backdrop.g * (1 - a), b: top.b * a + backdrop.b * (1 - a), a: 1 };
}

const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance of an opaque colour. */
export const luminance = (color: Rgba): number => 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);

/** The contrast ratio of two opaque colours, 1 to 21. */
export function contrastRatio(a: Rgba, b: Rgba): number {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
}

/** The WCAG threshold: 4.5 for text, 3 for large text (24 px, or 18.66 px at weight 700 and up) and for non-text. */
export function thresholdFor(fontPx: number, weight: number, kind: 'text' | 'non-text'): number {
    if (kind === 'non-text') {
        return 3;
    }
    return fontPx >= 24 || (fontPx >= 18.66 && weight >= 700) ? 3 : 4.5;
}

/** A pair the lint measures: a foreground token over a background token (over `over` when the background is translucent). */
export interface TokenPair {
    fg: string;
    bg: string;
    /** The opaque surface a translucent background sits on (the hover band over the editor). */
    over?: string;
    kind: 'text' | 'non-text';
    /** A design-advisor ruling that the pair is held to the workbench's own value, not to the threshold; in `themes` only, or in all. */
    exempt?: { reason: string; themes?: readonly string[] };
}

const text = (fg: string, ...bgs: string[]): TokenPair[] => bgs.map(bg => ({ fg, bg, kind: 'text' as const }));
const nonText = (fg: string, ...bgs: string[]): TokenPair[] => bgs.map(bg => ({ fg, bg, kind: 'non-text' as const }));

const INPUT_BORDER_PARITY = {
    reason: 'workbench parity (D22, H49): input.border of the four default themes (1.15–1.57), the Settings editor and quick input fields',
    themes: ['dark-2026', 'dark-modern', 'light-2026', 'light-modern'],
};

/**
 * The curated pairs (architecture-advisor ruling of 2026-10-25, UX-P0.25): text roles against the surfaces they are drawn
 * on, at 4.5:1; check boxes, the row check's line (A7), the focus ring and input borders against theirs, at 3:1. Token names
 * without the `--nuiget-color-` prefix. The design-advisor ruling of 2026-10-25 (UX-P0.25, DECISIONS) took out the pairs the
 * design never paints (secondary text on a selection inherits the row's foreground, `primitives.css:177-189`, DS §4; a
 * selected row's check is `checkbox.selectBorder`, D52), added the sidebar's hover band (A14) and gave the parity exemptions.
 */
export const TOKEN_PAIRS: readonly TokenPair[] = [
    ...text('fg', 'bg', 'bg-sidebar', 'widget-bg', 'dropdown-bg'),
    ...text('fg-muted', 'bg', 'bg-sidebar'),
    { fg: 'fg', bg: 'list-hover-bg', over: 'bg', kind: 'text' },
    { fg: 'fg-muted', bg: 'list-hover-bg', over: 'bg', kind: 'text' },
    { fg: 'version-new', bg: 'list-hover-bg', over: 'bg', kind: 'text' },
    { fg: 'fg-muted', bg: 'list-hover-bg', over: 'bg-sidebar', kind: 'text' },
    { fg: 'version-new', bg: 'list-hover-bg', over: 'bg-sidebar', kind: 'text' },
    ...text('link', 'bg', 'bg-sidebar'),
    ...text('version-new', 'bg', 'bg-sidebar'),
    ...text('list-active-fg', 'list-active-bg'),
    ...text('badge-fg', 'badge-bg'),
    { fg: 'input-placeholder', bg: 'input-bg', kind: 'text', exempt: { reason: 'workbench parity (D22, H49): input.placeholderForeground of the 2026 themes reads 2.34 / 2.85', themes: ['dark-2026', 'light-2026'] } },
    ...text('code-fg', 'code-bg'),
    ...['comment', 'function', 'keyword', 'number', 'string', 'type', 'variable'].flatMap(role => text(`syntax-${role}`, 'code-bg')),
    { fg: 'checkbox-border', bg: 'bg', kind: 'non-text', exempt: { reason: 'D52/F1a (owner round 2): unselected rows keep the exemplar\'s 1.5:1 checkbox.border', themes: ['dark-modern', 'light-modern'] } },
    { fg: 'checkbox-bg', bg: 'bg', kind: 'non-text', exempt: { reason: 'the fill is not the 1.4.11 boundary (checkbox-border carries it, D52); the exemplar\'s checkbox.background equals its input surface and the HC themes draw the box by border alone' } },
    ...nonText('border', 'bg', 'list-active-bg'),
    ...nonText('focus', 'bg'),
    // D52: a selected row's check mark (UX-P1.1, T-23).
    ...nonText('checkbox-select-border', 'list-active-bg'),
    { fg: 'focus', bg: 'list-active-bg', kind: 'non-text', exempt: { reason: 'workbench parity (D22, H49): the focused selected row rings in focusBorder/list.focusOutline on list.activeSelectionBackground at 2.65 (Dark Modern) and 2.58 (Dark 2026)', themes: ['dark-2026', 'dark-modern'] } },
    { fg: 'input-border', bg: 'input-bg', kind: 'non-text', exempt: INPUT_BORDER_PARITY },
    { fg: 'input-border', bg: 'bg', kind: 'non-text', exempt: INPUT_BORDER_PARITY },
];

/** The lint's status: `hard` since the design-advisor ruled on its first printout (2026-10-25, UX-P0.25). */
export const CONTRAST_LINT_STATUS: RuleStatus = 'hard';

/** A pair today's tokens fail in one theme and look, with the item that fixes it (each under a ruling). */
export interface PairPending {
    pair: string;
    theme: string;
    look: 'classic' | 'modern';
    item: string;
}

/** Every cell of `pairs` × `themes` in both looks, owned by `item`. */
const cells = (pairs: readonly string[], themes: readonly string[], item: string): PairPending[] =>
    pairs.flatMap(pair => themes.flatMap(theme => (['classic', 'modern'] as const).map(look => ({ pair, theme, look, item }))));

/**
 * The red or unmeasurable cells of today's tokens, each with the item that fixes it (design-advisor ruling of 2026-10-25,
 * UX-P0.25; Appendix B: A7 → P2.3, A8 → P3.4, A14 → P4.6; the high-contrast records' empty selection tokens → P1.1, T-21).
 */
export const CONTRAST_PAIRS_PENDING: readonly PairPending[] = [
    ...cells(['border/bg', 'border/list-active-bg'], ['dark-2026', 'dark-modern', 'light-2026', 'light-modern'], 'P2.3'),
    ...cells(['syntax-number/code-bg', 'syntax-type/code-bg', 'syntax-variable/code-bg'], ['light-2026', 'light-high-contrast', 'light-modern'], 'P3.4'),
    ...cells(['version-new/list-hover-bg over bg', 'version-new/list-hover-bg over bg-sidebar'], ['light-2026', 'light-modern'], 'P4.6'),
    ...cells(['fg-muted/list-hover-bg over bg-sidebar'], ['dark-2026'], 'P4.6'),
];

/** Whether the pair is exempt in this theme. */
export const exemptIn = (pair: TokenPair, theme: string): boolean => pair.exempt !== undefined && (pair.exempt.themes === undefined || pair.exempt.themes.includes(theme));

/** A pair's name as the lint prints it: `fg/bg`, or `fg/bg over over`. */
export const pairName = (pair: TokenPair): string => `${pair.fg}/${pair.bg}${pair.over ? ` over ${pair.over}` : ''}`;

const statusText = (status: RuleStatus): string => (status === 'hard' ? 'hard' : `pending ${status.pending}`);

/** One measured pair as the lint prints it, and whether it fails (only while not exempt, not pending and `hard`). */
export function contrastPairLine(pair: TokenPair, theme: string, look: 'classic' | 'modern', ratio: number | null, status: RuleStatus = CONTRAST_LINT_STATUS, pending: readonly PairPending[] = CONTRAST_PAIRS_PENDING): { line: string; failure?: string } {
    const name = pairName(pair);
    const threshold = thresholdFor(13, 400, pair.kind);
    const owner = pending.find(entry => entry.pair === name && entry.theme === theme && entry.look === look);
    const exempt = exemptIn(pair, theme);
    const suffix = exempt ? `exempt: ${pair.exempt?.reason}` : owner ? `pending ${owner.item}` : statusText(status);
    if (ratio === null) {
        return { line: `[contrast] ${name}@${theme}/${look}: not measurable (a token is missing or not a colour) (${suffix})`, failure: exempt || owner ? undefined : `${name}@${theme}/${look} not measurable` };
    }
    const value = Math.round(ratio * 100) / 100;
    const pass = ratio >= threshold;
    return {
        line: `[contrast] ${name}@${theme}/${look}: ${value} vs ${threshold}${pass ? '' : ' (below)'} (${suffix})`,
        failure: pass || exempt || owner ? undefined : `${name}@${theme}/${look} ${value} < ${threshold}`,
    };
}

/** A pair's ratio from a theme's tokens: the background composited over `over` (or opaque), the foreground over that. */
export function pairRatio(pair: TokenPair, tokens: Readonly<Record<string, string>>): number | null {
    const token = (name: string): Rgba | null => parseCssColor(tokens[`--nuiget-color-${name}`] ?? '');
    const fg = token(pair.fg);
    const bg = token(pair.bg);
    if (fg === null || bg === null) {
        return null;
    }
    let surface = bg;
    if (bg.a < 1) {
        const under = token(pair.over ?? 'bg');
        if (under === null || under.a < 1) {
            return null;
        }
        surface = composite(bg, under);
    }
    return contrastRatio(fg.a < 1 ? composite(fg, surface) : fg, surface);
}

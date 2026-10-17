import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRules } from './cssRules';

/**
 * N64 (P5.11): the 2.0 webviews run in the Chromium of the oldest supported VS Code, 114 in VS Code 1.85 (D10).
 * No CI job renders them there, so a stylesheet must not use a CSS feature that Chromium 114 lacks: the rule would
 * be dropped without a word, and the view would look right in every newer VS Code. JavaScript APIs are held by the
 * ES2022 `lib` and `target` of `tsconfig.json`.
 *
 * Each entry names the feature's key in MDN browser-compat-data and the Chromium version that key gives, read on
 * 2026-10-15 and 2026-10-16 from the data file of the key, for example
 * https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/properties/scrollbar-color.json for
 * `css.properties.scrollbar-color` (`css/<area>/<name>.json`, `support.chrome.version_added`). A feature that Chromium 114 had only
 * in part counts from the version that completed it (CSS nesting: 112 without nested rules that start with a type
 * selector, complete in 120). Add an entry from the data, never from memory.
 */
const ROOTS = ['src/webview/shared', 'src/webview/main', 'src/webview/sidebar'];
const BASELINE = 114;

interface Feature {
    name: string;
    /** The key in MDN browser-compat-data. */
    bcd: string;
    /** The first Chromium version with the feature, as that key gives it. */
    chromium: number;
    /** Matches a use of the feature in a stylesheet without comments and strings. */
    pattern: RegExp;
    /** A use the pattern must find. */
    sample: string;
}

const property = (name: string): RegExp => new RegExp(`(?:^|[\\s;{])${name}\\s*:`);

export const DENYLIST: readonly Feature[] = [
    { name: 'scrollbar-color', bcd: 'css.properties.scrollbar-color', chromium: 121, pattern: property('scrollbar-color'), sample: '.nuiget-list { scrollbar-color: red blue; }' },
    { name: 'scrollbar-width', bcd: 'css.properties.scrollbar-width', chromium: 121, pattern: property('scrollbar-width'), sample: '.nuiget-list { scrollbar-width: thin; }' },
    { name: '@starting-style', bcd: 'css.at-rules.starting-style', chromium: 117, pattern: /@starting-style\b/, sample: '@starting-style { .nuiget-dialog { opacity: 0; } }' },
    { name: '@scope', bcd: 'css.at-rules.scope', chromium: 118, pattern: /@scope\b/, sample: '@scope (.nuiget-row) { span { margin: 0; } }' },
    { name: '@position-try', bcd: 'css.at-rules.position-try', chromium: 125, pattern: /@position-try\b/, sample: '@position-try --below { top: anchor(bottom); }' },
    { name: 'anchor-name', bcd: 'css.properties.anchor-name', chromium: 125, pattern: property('anchor-name'), sample: '.nuiget-button { anchor-name: --menu; }' },
    { name: 'light-dark()', bcd: 'css.types.color.light-dark', chromium: 123, pattern: /\blight-dark\(/, sample: ':root { --x: light-dark(Canvas, CanvasText); }' },
    { name: 'relative colour syntax', bcd: 'css.types.color.color.relative_syntax', chromium: 119, pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*from\b/, sample: ':root { --x: rgb(from var(--y) r g b / 50%); }' },
    { name: 'field-sizing', bcd: 'css.properties.field-sizing', chromium: 123, pattern: property('field-sizing'), sample: '.nuiget-input { field-sizing: content; }' },
    { name: 'animation-timeline', bcd: 'css.properties.animation-timeline', chromium: 115, pattern: property('animation-timeline'), sample: '.nuiget-bar { animation-timeline: scroll(); }' },
    { name: 'scroll-timeline', bcd: 'css.properties.scroll-timeline', chromium: 115, pattern: property('scroll-timeline'), sample: '.nuiget-list { scroll-timeline: --list y; }' },
    { name: 'view-timeline', bcd: 'css.properties.view-timeline', chromium: 115, pattern: property('view-timeline'), sample: '.nuiget-row { view-timeline: --row; }' },
    { name: 'transition-behavior', bcd: 'css.properties.transition-behavior', chromium: 117, pattern: /(?:^|[\s;{])transition-behavior\s*:|\ballow-discrete\b/, sample: '.nuiget-popover { transition: display var(--nuiget-duration-fast) allow-discrete; }' },
    { name: 'overlay', bcd: 'css.properties.overlay', chromium: 117, pattern: property('overlay'), sample: '.nuiget-dialog { overlay: auto; }' },
    { name: 'interpolate-size', bcd: 'css.properties.interpolate-size', chromium: 129, pattern: property('interpolate-size'), sample: ':root { interpolate-size: allow-keywords; }' },
    { name: 'calc-size()', bcd: 'css.types.calc-size', chromium: 129, pattern: /\bcalc-size\(/, sample: '.nuiget-section { height: calc-size(auto, size); }' },
    { name: 'text-wrap: pretty', bcd: 'css.properties.text-wrap.pretty', chromium: 117, pattern: /(?:^|[\s;{])text-wrap(?:-style)?\s*:[^;}]*\bpretty\b/, sample: '.nuiget-empty { text-wrap: pretty; }' },
    { name: 'text-wrap: stable', bcd: 'css.properties.text-wrap.stable', chromium: 130, pattern: /(?:^|[\s;{])text-wrap(?:-style)?\s*:[^;}]*\bstable\b/, sample: '.nuiget-input { text-wrap: stable; }' },
    { name: 'text-wrap: auto', bcd: 'css.properties.text-wrap.auto', chromium: 130, pattern: /(?:^|[\s;{])text-wrap\s*:[^;}]*\bauto\b/, sample: '.nuiget-empty { text-wrap: auto; }' },
    { name: 'subgrid', bcd: 'css.properties.grid-template-columns.subgrid', chromium: 117, pattern: /(?:^|[\s;{])grid-template(?:-columns|-rows)?\s*:[^;}]*\bsubgrid\b/, sample: '.nuiget-row { grid-template-columns: subgrid; }' },
    { name: ':user-invalid', bcd: 'css.selectors.user-invalid', chromium: 119, pattern: /:user-invalid\b/, sample: '.nuiget-input:user-invalid { outline: 0; }' },
    { name: ':user-valid', bcd: 'css.selectors.user-valid', chromium: 119, pattern: /:user-valid\b/, sample: '.nuiget-input:user-valid { outline: 0; }' },
    { name: ':dir()', bcd: 'css.selectors.dir', chromium: 120, pattern: /:dir\(/, sample: '.nuiget-row:dir(rtl) { margin: 0; }' },
    { name: 'CSS nesting', bcd: 'css.selectors.nesting', chromium: 120, pattern: /&/, sample: '.nuiget-row { &:hover { color: inherit; } }' },
    { name: 'round()', bcd: 'css.types.round', chromium: 125, pattern: /(?<![\w-])round\(/, sample: '.nuiget-row { height: round(up, 23.5px, 1px); }' },
    { name: 'mod()', bcd: 'css.types.mod', chromium: 125, pattern: /(?<![\w-])mod\(/, sample: '.nuiget-row { width: mod(18px, 5px); }' },
];

/** A text without the contents of its strings, so that a string cannot match a feature. */
const withoutStrings = (text: string): string => text.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""');

/**
 * The features of the denylist that `css` uses, as `feature (Chromium n): where`. Every selector, at-rule and
 * declaration of the stylesheet (comments are gone with `parseRules`) is matched on its own.
 */
export function findNewerFeatures(css: string): string[] {
    const parts = parseRules(css).flatMap(rule => [rule.prelude, ...rule.declarations.map(declaration => `${rule.prelude} { ${declaration} }`)]);
    return DENYLIST.flatMap(feature => parts
        .map(withoutStrings)
        .filter(part => feature.pattern.test(part))
        .map(part => `${feature.name} (Chromium ${feature.chromium}): ${part}`));
}

function stylesheets(): string[] {
    return ROOTS.flatMap(root => (readdirSync(root, { recursive: true }) as string[])
        .map(entry => path.posix.join(root, entry.split(path.sep).join('/')))
        .filter(file => file.endsWith('.css')))
        .sort();
}

describe('2.0 webview stylesheets and Chromium 114 (N64)', () => {
    it('use no CSS feature newer than Chromium 114', () => {
        expect(stylesheets().flatMap(file => findNewerFeatures(readFileSync(file, 'utf8')).map(found => `${file}: ${found}`))).toEqual([]);
    });

    it('the scan covers every 2.0 stylesheet, tokens.css included', () => {
        const files = stylesheets();
        expect(files).toContain('src/webview/shared/tokens.css');
        expect(files).toContain('src/webview/shared/primitives/primitives.css');
        expect(files).toContain('src/webview/main/main.css');
        expect(files).toContain('src/webview/sidebar/sidebar.css');
    });

    it('every entry is newer than the baseline, named once, and finds its own sample', () => {
        expect(DENYLIST.filter(feature => feature.chromium <= BASELINE).map(feature => feature.name)).toEqual([]);
        expect(new Set(DENYLIST.map(feature => feature.name)).size).toBe(DENYLIST.length);
        expect(DENYLIST.filter(feature => findNewerFeatures(feature.sample).length === 0).map(feature => feature.name)).toEqual([]);
    });

    it('a comment, a string or a feature Chromium 114 has is not reported', () => {
        const allowed = [
            '/* scrollbar-color: red blue; @starting-style & round( */',
            '.nuiget-row::after { content: "a & b, light-dark(x)"; }',
            // text-wrap: balance entered in Chromium 114 (css.properties.text-wrap.balance).
            '.nuiget-empty { text-wrap: balance; }',
            // color-mix() entered in Chromium 111 (css.types.color.color-mix, read 2026-10-17).
            ':root { --x: color-mix(in srgb, var(--y) 60%, transparent); }',
            '.nuiget-list::-webkit-scrollbar-thumb { background: var(--nuiget-color-scrollbar); }',
            '.nuiget-row { overflow: auto; border-radius: var(--nuiget-radius-md); }',
        ].join('\n');
        expect(findNewerFeatures(allowed)).toEqual([]);
    });
});

import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRules } from './cssRules';

/**
 * N64 (P5.11): the 2.0 webviews run in the Chromium of the oldest supported VS Code, 122 in VS Code 1.90 (D10 as
 * amended by D25, UX-P0.5b). No CI job renders them there until the floor lane of UX-P0.9, so a stylesheet must not
 * use a CSS feature that Chromium 122 lacks: the rule would be dropped without a word, and the view would look right
 * in every newer VS Code. JavaScript APIs are held by the ES2022 `lib` and `target` of `tsconfig.json`.
 *
 * Each entry names the feature's key in MDN browser-compat-data and the Chromium version that key gives, read on
 * 2026-10-15 and 2026-10-16 from the data file of the key, for example
 * https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/properties/scrollbar-color.json for
 * `css.properties.scrollbar-color` (`css/<area>/<name>.json`, `support.chrome.version_added`). A feature that Chromium 122 had only
 * in part counts from the version that completed it (CSS nesting, retired at 122: 112 without nested rules that start
 * with a type selector, complete in 120). Add an entry from the data, never from memory.
 */
const ROOTS = ['src/webview/shared', 'src/webview/main', 'src/webview/sidebar'];
const BASELINE = 122;

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
    { name: '@position-try', bcd: 'css.at-rules.position-try', chromium: 125, pattern: /@position-try\b/, sample: '@position-try --below { top: anchor(bottom); }' },
    { name: 'anchor-name', bcd: 'css.properties.anchor-name', chromium: 125, pattern: property('anchor-name'), sample: '.nuiget-button { anchor-name: --menu; }' },
    { name: 'light-dark()', bcd: 'css.types.color.light-dark', chromium: 123, pattern: /\blight-dark\(/, sample: ':root { --x: light-dark(Canvas, CanvasText); }' },
    { name: 'field-sizing', bcd: 'css.properties.field-sizing', chromium: 123, pattern: property('field-sizing'), sample: '.nuiget-input { field-sizing: content; }' },
    { name: 'interpolate-size', bcd: 'css.properties.interpolate-size', chromium: 129, pattern: property('interpolate-size'), sample: ':root { interpolate-size: allow-keywords; }' },
    { name: 'calc-size()', bcd: 'css.types.calc-size', chromium: 129, pattern: /\bcalc-size\(/, sample: '.nuiget-section { height: calc-size(auto, size); }' },
    { name: 'text-wrap: stable', bcd: 'css.properties.text-wrap.stable', chromium: 130, pattern: /(?:^|[\s;{])text-wrap(?:-style)?\s*:[^;}]*\bstable\b/, sample: '.nuiget-input { text-wrap: stable; }' },
    { name: 'text-wrap: auto', bcd: 'css.properties.text-wrap.auto', chromium: 130, pattern: /(?:^|[\s;{])text-wrap\s*:[^;}]*\bauto\b/, sample: '.nuiget-empty { text-wrap: auto; }' },
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

describe('2.0 webview stylesheets and Chromium 122 (N64)', () => {
    it('use no CSS feature newer than Chromium 122', () => {
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

    it('a comment, a string or a feature Chromium 122 has is not reported', () => {
        const allowed = [
            '/* field-sizing: content; @position-try --x round( */',
            '.nuiget-row::after { content: "a, light-dark(x), anchor-name: --m"; }',
            // text-wrap: balance entered in Chromium 114 (css.properties.text-wrap.balance).
            '.nuiget-empty { text-wrap: balance; }',
            // scrollbar-color entered in Chromium 121 (css.properties.scrollbar-color), inside the 1.90 floor.
            '.nuiget-list { scrollbar-color: auto; }',
            // color-mix() entered in Chromium 111 (css.types.color.color-mix, read 2026-10-17).
            ':root { --x: color-mix(in srgb, var(--y) 60%, transparent); }',
            '.nuiget-list::-webkit-scrollbar-thumb { background: var(--nuiget-color-scrollbar); }',
            '.nuiget-row { overflow: auto; border-radius: var(--nuiget-radius-md); }',
        ].join('\n');
        expect(findNewerFeatures(allowed)).toEqual([]);
    });
});

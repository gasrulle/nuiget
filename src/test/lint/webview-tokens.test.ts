import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The shape of `src/webview/shared/tokens.css` (ADR-008): custom properties only, every colour an alias,
 * one block each for high contrast and forced colours, one per signal for reduced motion, and the look's blocks
 * (ADR-011). The token names are the reference's, `docs/design/tokens.json`.
 */
// Line endings are normalized: a checkout on Windows may have CRLF, and the lookups below name line breaks.
const css = readFileSync('src/webview/shared/tokens.css', 'utf8').replace(/\r\n/g, '\n');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
const lines = code.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
const declarations = lines.filter(line => !line.endsWith('{') && !line.endsWith(',') && line !== '}');

/** The declarations of the first block that follows `opener`, as `name → value`. */
function blockAfter(opener: string): Map<string, string> {
    const start = code.indexOf(opener);
    if (start < 0) {
        throw new Error(`tokens.css has no "${opener}"`);
    }
    const body = code.slice(code.indexOf('{', start + opener.length) + 1);
    const block = body.slice(0, body.indexOf('}'));
    return new Map([...block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}

/** The reference's tokens (`docs/design/tokens.json`, UX-P1.1): `:root` declares exactly these. */
const REFERENCE = (JSON.parse(readFileSync('docs/design/tokens.json', 'utf8')) as { tokens: Array<{ name: string }> }).tokens.map(token => token.name);
const LOOK = ':root[data-look="modern"]';
const LOOK_DENSITY = ':root[data-look="modern"][data-density="compact"]';
const LOOK_UPPERCASE = ':root[data-look="modern"][data-uppercase-headers]';
const REDUCED_DURATIONS = { '--nuiget-duration-fast': '0ms', '--nuiget-duration-normal': '0ms', '--nuiget-duration-spin': '0ms', '--nuiget-duration-progress': '0ms' };
/** DS-GRID-3: the tokens that alias a workbench size token, by name. */
const ALIASED_SIZES = [
    ...[1, 2, 3, 4, 5, 6, 7].map(step => `--nuiget-space-${step}`),
    ...['xs', 'sm', 'md', 'lg', 'xl', 'circle'].map(tier => `--nuiget-radius-${tier}`),
    ...['xs', 'sm', 'label', 'md', 'lg'].map(step => `--nuiget-font-size-${step}`),
    '--nuiget-font-weight-regular', '--nuiget-font-weight-semibold', '--nuiget-icon-size-sm', '--nuiget-icon-size-md', '--nuiget-line-width',
];
const THEME_DUMPS = readdirSync('docs/design/themes').filter(file => file.endsWith('.css') && !file.endsWith('.tokens.css'));

describe('2.0 webview tokens', () => {
    it('braces balance', () => {
        expect(code.split('{').length).toBe(code.split('}').length);
    });

    it('holds custom properties with the nuiget prefix and nothing else', () => {
        expect(declarations.length).toBeGreaterThan(0);
        expect(declarations.filter(line => !/^--nuiget-[a-z0-9-]+:\s.+;$/.test(line))).toEqual([]);
        // No element rule: a selector is `:root`, a look block, the reduced-motion body class or one of the two high-contrast body classes.
        const selectors = lines.filter(line => line.endsWith('{') || line.endsWith(','));
        expect(selectors.filter(line => !/^(?::root \{|:root\[data-look="modern"\] \{|:root\[data-look="modern"\]\[data-density="compact"\] \{|:root\[data-look="modern"\]\[data-uppercase-headers\] \{|body\.vscode-reduce-motion \{|body\.vscode-high-contrast,|body\.vscode-high-contrast-light \{|@media \((?:forced-colors: active|prefers-reduced-motion: reduce)\) \{)$/.test(line))).toEqual([]);
    });

    it('every colour is an alias: var() names a VS Code variable or another token', () => {
        const referenced = [...code.matchAll(/var\(\s*([^,)\s]+)/g)].map(match => match[1]);
        expect(referenced.length).toBeGreaterThan(0);
        expect(referenced.filter(name => !name.startsWith('--vscode-') && !name.startsWith('--nuiget-'))).toEqual([]);
        // In `:root` a colour token is nothing but such an alias, and the one derived colour: a VS Code background mixed
        // with transparent (the scrim; Chromium 111).
        const SCRIM = /^color-mix\(in srgb, var\(--vscode-[a-zA-Z-]+\) \d{1,3}%, transparent\)$/;
        const colours = [...blockAfter(':root'), ...blockAfter(LOOK)].filter(([name]) => name.startsWith('--nuiget-color-'));
        expect(colours.filter(([, value]) => !value.startsWith('var(--vscode-') && !SCRIM.test(value))).toEqual([]);
    });

    it('declares in :root exactly the tokens of the reference', () => {
        expect([...blockAfter(':root').keys()].sort()).toEqual([...REFERENCE].sort());
    });

    it('size tokens alias the exported workbench tokens with the dumped px as fallback', () => {
        const declared = blockAfter(':root');
        const dumps = THEME_DUMPS.map(file => ({ file, text: readFileSync(`docs/design/themes/${file}`, 'utf8').split(/\r?\n/) }));
        expect(dumps).toHaveLength(12);
        for (const name of ALIASED_SIZES) {
            const alias = declared.get(name)?.match(/^var\((--vscode-[a-zA-Z0-9-]+), (\d+(?:px)?)\)$/);
            expect(alias, `${name}: ${declared.get(name)}`).toBeTruthy();
            for (const dump of dumps) {
                const dumped = dump.text.map(line => line.trim()).find(line => line.startsWith(`${alias![1]}:`));
                expect(dumped, `${alias![1]} in ${dump.file}`).toBe(`${alias![1]}: ${alias![2]};`);
            }
        }
    });

    it('the look blocks re-value tokens of the reference, on the attributes of ADR-011', () => {
        const declared = blockAfter(':root');
        for (const opener of [LOOK, LOOK_DENSITY, LOOK_UPPERCASE]) {
            const block = blockAfter(opener);
            expect(block.size, opener).toBeGreaterThan(0);
            expect([...block.keys()].filter(name => !declared.has(name))).toEqual([]);
        }
        expect(Object.fromEntries(blockAfter(LOOK_DENSITY))).toEqual({ '--nuiget-row-inset-x': 'var(--nuiget-space-1)' });
        expect(Object.fromEntries(blockAfter(LOOK_UPPERCASE))).toEqual({ '--nuiget-text-transform-section-title': 'uppercase' });
    });

    it('the row heights that Listbox estimates with are the row-height tokens', () => {
        // The virtualizer needs numbers before layout, so Listbox.tsx repeats the tokens; this keeps the two equal.
        const listbox = readFileSync('src/webview/shared/primitives/Listbox.tsx', 'utf8');
        const repeated = listbox.match(/const ROW_HEIGHT = \{ compact: (\d+), comfortable: (\d+) \}/);
        expect(repeated, 'ROW_HEIGHT in Listbox.tsx').not.toBeNull();
        const declared = blockAfter(':root');
        expect(`${repeated![1]}px`).toBe(declared.get('--nuiget-row-height-compact'));
        expect(`${repeated![2]}px`).toBe(declared.get('--nuiget-row-height-comfortable'));
    });

    it('has one reduced-motion rule per signal, and each stops the four durations', () => {
        expect(code.match(/prefers-reduced-motion: reduce/g)).toHaveLength(1);
        const reduced = blockAfter('@media (prefers-reduced-motion: reduce) {\n    :root');
        expect(Object.fromEntries(reduced)).toEqual(REDUCED_DURATIONS);
        expect(Object.fromEntries(blockAfter('body.vscode-reduce-motion'))).toEqual(REDUCED_DURATIONS);
    });

    it('has one forced-colors rule, in system colours only', () => {
        expect(code.match(/forced-colors: active/g)).toHaveLength(1);
        const forced = blockAfter('@media (forced-colors: active) {\n    :root');
        expect(forced.size).toBeGreaterThan(0);
        const system = ['CanvasText', 'Canvas', 'Highlight', 'HighlightText', 'ButtonFace', 'ButtonText', 'GrayText', 'LinkText', 'Field', 'FieldText', 'transparent'];
        expect([...forced].filter(([name, value]) => !name.startsWith('--nuiget-color-') || !system.includes(value))).toEqual([]);
    });

    it('covers both high-contrast themes in one rule', () => {
        expect(code).toMatch(/body\.vscode-high-contrast,\s*body\.vscode-high-contrast-light \{/);
        const contrast = blockAfter('body.vscode-high-contrast-light');
        expect([...contrast.keys()].sort()).toEqual(['--nuiget-color-border', '--nuiget-color-focus', '--nuiget-color-shadow']);
    });
});

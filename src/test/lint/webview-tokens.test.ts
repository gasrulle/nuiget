import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The shape of `src/webview/shared/tokens.css` (ADR-008): custom properties only, every colour an alias,
 * and one block each for high contrast, forced colours and reduced motion. The primitives rely on the
 * token names listed here.
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

const REQUIRED = [
    ...[1, 2, 3, 4, 5, 6].map(step => `--nuiget-space-${step}`),
    '--nuiget-radius-sm', '--nuiget-radius-md',
    '--nuiget-row-height-compact', '--nuiget-row-height-comfortable',
    '--nuiget-icon-size-sm', '--nuiget-icon-size-md', '--nuiget-icon-size-lg', '--nuiget-target-min',
    '--nuiget-z-sticky', '--nuiget-z-popover', '--nuiget-z-dialog', '--nuiget-z-toast',
    '--nuiget-duration-fast', '--nuiget-duration-normal', '--nuiget-easing',
    '--nuiget-font-size-sm', '--nuiget-font-size-md', '--nuiget-font-size-lg', '--nuiget-line-height',
    '--nuiget-font-family', '--nuiget-font-family-mono',
    ...['fg', 'fg-muted', 'border', 'focus', 'list-hover-bg', 'list-active-bg', 'list-active-fg', 'list-inactive-bg',
        'badge-bg', 'badge-fg', 'button-bg', 'button-fg', 'button-hover-bg', 'button-secondary-bg', 'button-secondary-fg',
        'input-bg', 'input-fg', 'input-border', 'input-placeholder', 'link', 'error', 'warning', 'info', 'progress', 'shadow',
        'widget-bg', 'widget-fg',
        'scrollbar', 'scrollbar-hover', 'scrollbar-active'].map(name => `--nuiget-color-${name}`),
];

describe('2.0 webview tokens', () => {
    it('braces balance', () => {
        expect(code.split('{').length).toBe(code.split('}').length);
    });

    it('holds custom properties with the nuiget prefix and nothing else', () => {
        expect(declarations.length).toBeGreaterThan(0);
        expect(declarations.filter(line => !/^--nuiget-[a-z0-9-]+:\s.+;$/.test(line))).toEqual([]);
        // No element rule: a selector is `:root` or one of the two high-contrast body classes.
        const selectors = lines.filter(line => line.endsWith('{') || line.endsWith(','));
        expect(selectors.filter(line => !/^(?::root \{|body\.vscode-high-contrast,|body\.vscode-high-contrast-light \{|@media \((?:forced-colors: active|prefers-reduced-motion: reduce)\) \{)$/.test(line))).toEqual([]);
    });

    it('every colour is an alias: var() names a VS Code variable or another token', () => {
        const referenced = [...code.matchAll(/var\(\s*([^,)\s]+)/g)].map(match => match[1]);
        expect(referenced.length).toBeGreaterThan(0);
        expect(referenced.filter(name => !name.startsWith('--vscode-') && !name.startsWith('--nuiget-'))).toEqual([]);
        // In `:root` a colour token is nothing but such an alias.
        const colours = [...blockAfter(':root')].filter(([name]) => name.startsWith('--nuiget-color-'));
        expect(colours.filter(([, value]) => !value.startsWith('var(--vscode-'))).toEqual([]);
    });

    it('declares in :root every token the primitives rely on', () => {
        const declared = blockAfter(':root');
        expect(REQUIRED.filter(name => !declared.has(name))).toEqual([]);
    });

    it('has one reduced-motion rule, and it stops both durations', () => {
        expect(code.match(/prefers-reduced-motion: reduce/g)).toHaveLength(1);
        const reduced = blockAfter('@media (prefers-reduced-motion: reduce) {\n    :root');
        expect(Object.fromEntries(reduced)).toEqual({ '--nuiget-duration-fast': '0ms', '--nuiget-duration-normal': '0ms' });
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

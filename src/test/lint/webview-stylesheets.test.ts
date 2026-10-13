import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-008: what a 2.0 webview stylesheet may not do on its own. Reduced motion, forced colours and the type
 * scale are answered once, in `src/webview/shared/tokens.css`; a stylesheet that sets its own duration, its own
 * pixel font size or an `!important` steps out of that answer without a failing test anywhere else.
 */
const ROOTS = ['src/webview/shared', 'src/webview/main', 'src/webview/sidebar-next'];
const TOKENS = 'src/webview/shared/tokens.css';
const PRIMITIVES = 'src/webview/shared/primitives/primitives.css';

export interface CssRule {
    /** The selector list, or the at-rule with its condition. */
    prelude: string;
    /** The declarations directly in the block, as `property: value`. */
    declarations: string[];
}

/** The rules of a stylesheet, those inside at-rules included. Comments and line endings do not matter. */
export function parseRules(css: string): CssRule[] {
    const text = css.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules: CssRule[] = [];
    let position = 0;

    const block = (owner: CssRule | undefined): void => {
        let pending = '';
        const declare = (): void => {
            const declaration = pending.replace(/\s+/g, ' ').trim();
            if (declaration.length > 0) {
                owner?.declarations.push(declaration);
            }
            pending = '';
        };
        while (position < text.length) {
            const char = text[position++];
            if (char === '{') {
                const rule: CssRule = { prelude: pending.replace(/\s+/g, ' ').trim(), declarations: [] };
                pending = '';
                rules.push(rule);
                block(rule);
            } else if (char === '}') {
                declare();
                return;
            } else if (char === ';') {
                declare();
            } else {
                pending += char;
            }
        }
    };
    block(undefined);
    return rules;
}

const TIME = /(?<![\w-])\d*\.?\d+m?s\b/;
const TIMED = /^(?:animation|transition)(?:-duration)?$/;
const DELAYED = /^(?:animation|transition)-delay$/;

/** What a stylesheet does that only `tokens.css` may do, one line per defect. */
export function findStylesheetDefects(css: string): Record<'reducedMotion' | 'important' | 'pxFontSize' | 'duration' | 'classPrefix', string[]> {
    const rules = parseRules(css);
    const declarations = rules.flatMap(rule => rule.declarations.map(declaration => {
        const colon = declaration.indexOf(':');
        return { rule: rule.prelude, property: declaration.slice(0, colon).trim().toLowerCase(), value: declaration.slice(colon + 1).trim(), text: `${rule.prelude} { ${declaration} }` };
    }));
    const selectors = rules.map(rule => rule.prelude).filter(prelude => !prelude.startsWith('@'));

    return {
        reducedMotion: rules.filter(rule => /prefers-reduced-motion/i.test(rule.prelude)).map(rule => rule.prelude),
        important: declarations.filter(declaration => /!\s*important/i.test(declaration.value)).map(declaration => declaration.text),
        pxFontSize: declarations
            .filter(declaration => (declaration.property === 'font-size' || declaration.property === 'font') && /\d\s*px\b/i.test(declaration.value))
            .map(declaration => declaration.text),
        duration: declarations
            .filter(declaration => {
                if (DELAYED.test(declaration.property)) {
                    return TIME.test(declaration.value);
                }
                if (!TIMED.test(declaration.property) || /^(?:none|inherit|initial|unset|revert)$/i.test(declaration.value)) {
                    return false;
                }
                return TIME.test(declaration.value) || !declaration.value.includes('var(--nuiget-duration-');
            })
            .map(declaration => declaration.text),
        classPrefix: selectors.flatMap(selector => {
            // A dot inside an attribute value or a string is not a class.
            const bare = selector.replace(/\[[^\]]*\]/g, '').replace(/(["'])(?:\\.|(?!\1).)*\1/g, '');
            return [...bare.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].filter(match => !match[1].startsWith('nuiget-')).map(match => `${selector}: .${match[1]}`);
        }),
    };
}

function stylesheets(): string[] {
    return ROOTS.flatMap(root => (readdirSync(root, { recursive: true }) as string[])
        .map(entry => path.posix.join(root, entry.split(path.sep).join('/')))
        .filter(file => file.endsWith('.css') && file !== TOKENS))
        .sort();
}

const defectsOf = (kind: keyof ReturnType<typeof findStylesheetDefects>): string[] =>
    stylesheets().flatMap(file => findStylesheetDefects(readFileSync(file, 'utf8'))[kind].map(defect => `${file}: ${defect}`));

describe('2.0 webview stylesheets', () => {
    it('no reduced-motion rule outside tokens.css', () => {
        expect(defectsOf('reducedMotion')).toEqual([]);
    });

    it('no !important', () => {
        expect(defectsOf('important')).toEqual([]);
    });

    it('no px font size', () => {
        expect(defectsOf('pxFontSize')).toEqual([]);
    });

    it('every animation and transition duration is a duration token', () => {
        expect(defectsOf('duration')).toEqual([]);
        // The check has something to look at: the primitives move.
        const timed = parseRules(readFileSync(PRIMITIVES, 'utf8')).flatMap(rule => rule.declarations).filter(declaration => /^(?:animation|transition)/.test(declaration));
        expect(timed.length).toBeGreaterThanOrEqual(2);
    });

    it('every class selector starts with .nuiget-', () => {
        expect(defectsOf('classPrefix')).toEqual([]);
    });

    it('row actions are shown on hover and focus-within of the row', () => {
        const rules = parseRules(readFileSync(PRIMITIVES, 'utf8'));
        const hidden = rules.find(rule => rule.prelude === '.nuiget-row-actions');
        // Hidden but laid out: `display: none` would move the row's content when the pointer arrives.
        expect(hidden?.declarations).toContain('visibility: hidden');
        expect(hidden?.declarations.some(declaration => /^display:\s*none/.test(declaration))).toBe(false);
        const shown = rules.filter(rule => rule.declarations.includes('visibility: visible')).flatMap(rule => rule.prelude.split(',').map(selector => selector.trim()));
        expect(shown).toContain('.nuiget-row:hover .nuiget-row-actions');
        expect(shown).toContain('.nuiget-row:focus-within .nuiget-row-actions');
    });

    it('the scan covers the 2.0 stylesheets and leaves tokens.css out', () => {
        // An empty or misplaced glob must not pass for want of files.
        const files = stylesheets();
        expect(files).toContain(PRIMITIVES);
        expect(files).not.toContain(TOKENS);
    });

    it('the scanner finds planted defects', () => {
        const planted = [
            '/* .ignored-in-a-comment { font-size: 12px !important; } */',
            '@media (prefers-reduced-motion: reduce) {',
            '    .nuiget-spinner svg { animation: none; }',
            '}',
            '.nuiget-row { color: var(--nuiget-color-fg) !important; }',
            '.nuiget-badge { font-size: 11px; font: 12px/1.4 sans-serif; }',
            '.nuiget-icon-button { transition: color 100ms linear; }',
            '.nuiget-banner { transition: opacity; animation-duration: .2s; transition-delay: 1s; }',
            '.nuiget-row.selected,\r\n.codicon-loading > .nuiget-row-option[data-file="a.b"] { margin: 0.5em; }',
            '@keyframes nuiget-spin { 12.5% { transform: rotate(45deg); } }',
        ].join('\n');
        expect(findStylesheetDefects(planted)).toEqual({
            reducedMotion: ['@media (prefers-reduced-motion: reduce)'],
            important: ['.nuiget-row { color: var(--nuiget-color-fg) !important }'],
            pxFontSize: ['.nuiget-badge { font-size: 11px }', '.nuiget-badge { font: 12px/1.4 sans-serif }'],
            duration: [
                '.nuiget-icon-button { transition: color 100ms linear }',
                '.nuiget-banner { transition: opacity }',
                '.nuiget-banner { animation-duration: .2s }',
                '.nuiget-banner { transition-delay: 1s }',
            ],
            classPrefix: [
                '.nuiget-row.selected, .codicon-loading > .nuiget-row-option[data-file="a.b"]: .selected',
                '.nuiget-row.selected, .codicon-loading > .nuiget-row-option[data-file="a.b"]: .codicon-loading',
            ],
        });
    });

    it('the scanner accepts what the primitives are allowed to write', () => {
        const allowed = [
            '.nuiget-icon-button { transition: color var(--nuiget-duration-fast) var(--nuiget-easing); }',
            '.nuiget-spinner svg { animation: nuiget-spin calc(var(--nuiget-duration-normal) * 5) linear infinite; }',
            '.nuiget-banner { transition: none; font-size: var(--nuiget-font-size-sm); width: 1px; }',
            '@media (forced-colors: active) { .nuiget-row { outline: 1px solid; } }',
        ].join('\n');
        expect(Object.values(findStylesheetDefects(allowed)).flat()).toEqual([]);
    });
});

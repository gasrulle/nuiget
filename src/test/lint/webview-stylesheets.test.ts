import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRules } from './cssRules';

/**
 * ADR-008: what a 2.0 webview stylesheet may not do on its own. Reduced motion, forced colours and the type
 * scale are answered once, in `src/webview/shared/tokens.css`; a stylesheet that sets its own duration, its own
 * pixel font size or an `!important` steps out of that answer without a failing test anywhere else.
 */
const ROOTS = ['src/webview/shared', 'src/webview/main', 'src/webview/sidebar'];
const TOKENS = 'src/webview/shared/tokens.css';
const PRIMITIVES = 'src/webview/shared/primitives/primitives.css';

export { parseRules, type CssRule } from './cssRules';

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

/**
 * Pointer targets under 24 px (WCAG 2.5.8, `--nuiget-target-min`): a rule that gives the pointer cursor and does not
 * set `min-height: var(--nuiget-target-min)`. A row option keeps the default cursor; its height is the row's, and the
 * compact row is as high as the target.
 */
export function findSmallTargets(css: string): string[] {
    return parseRules(css)
        .filter(rule => rule.declarations.some(declaration => /^cursor:\s*pointer$/.test(declaration)))
        .filter(rule => !rule.declarations.some(declaration => /^min-height:\s*var\(--nuiget-target-min\)$/.test(declaration)))
        .map(rule => rule.prelude);
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

    it('every pointer target is at least --nuiget-target-min high, and the sash takes the pointer over that width', () => {
        expect(stylesheets().flatMap(file => findSmallTargets(readFileSync(file, 'utf8')).map(prelude => `${file}: ${prelude}`))).toEqual([]);
        // The sash is drawn thin; its ::after is the target, widened to the target size on both sides of the line.
        const rules = parseRules(readFileSync(PRIMITIVES, 'utf8'));
        const hitArea = (prelude: string): string[] => rules.find(rule => rule.prelude === prelude)?.declarations ?? [];
        expect(hitArea('.nuiget-sash--vertical::after')).toContain('inset: 0 calc((var(--nuiget-space-2) - var(--nuiget-target-min)) / 2)');
        expect(hitArea('.nuiget-sash--horizontal::after')).toContain('inset: calc((var(--nuiget-space-2) - var(--nuiget-target-min)) / 2) 0');
        // The check has something to look at.
        expect(rules.filter(rule => rule.declarations.includes('cursor: pointer')).length).toBeGreaterThanOrEqual(3);
    });

    it('the target scan finds a pointer rule without the target height', () => {
        const css = [
            '.nuiget-tag { cursor: pointer; min-height: 16px; }',
            '.nuiget-chip { cursor: pointer; }',
            '.nuiget-button { cursor: pointer; min-height: var(--nuiget-target-min); }',
            '.nuiget-button:disabled { cursor: default; }',
        ].join('\n');
        expect(findSmallTargets(css)).toEqual(['.nuiget-tag', '.nuiget-chip']);
    });

    it('the scrollbars are drawn with the scrollbar tokens', () => {
        const rules = parseRules(readFileSync(PRIMITIVES, 'utf8'));
        const declarationsOf = (prelude: string): string[] => rules.find(rule => rule.prelude === prelude)?.declarations ?? [];
        expect(declarationsOf('::-webkit-scrollbar')).toEqual(['width: var(--nuiget-scrollbar-size)', 'height: var(--nuiget-scrollbar-size)']);
        expect(declarationsOf('::-webkit-scrollbar-corner')).toEqual(['background-color: var(--nuiget-color-bg)']);
        expect(declarationsOf('::-webkit-scrollbar-thumb')).toEqual(['background-color: var(--nuiget-color-scrollbar)']);
        expect(declarationsOf('::-webkit-scrollbar-thumb:hover')).toEqual(['background-color: var(--nuiget-color-scrollbar-hover)']);
        expect(declarationsOf('::-webkit-scrollbar-thumb:active')).toEqual(['background-color: var(--nuiget-color-scrollbar-active)']);
    });

    it('the roots of both surfaces paint the surface background (axe measures against white without one)', () => {
        const background = (file: string, prelude: string): string[] => parseRules(readFileSync(file, 'utf8')).find(rule => rule.prelude === prelude)?.declarations.filter(declaration => declaration.startsWith('background')) ?? [];
        expect(background('src/webview/main/main.css', '.nuiget-main')).toEqual(['background: var(--nuiget-color-bg)']);
        expect(background('src/webview/sidebar/sidebar.css', '.nuiget-sidebar')).toEqual(['background: var(--nuiget-color-bg-sidebar)']);
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

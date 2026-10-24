/**
 * The CSS audit of the webview stylesheets as a lint (UX-P0.20; D28, CA-R1): the four rules of
 * `docs/research/2026-10-23-ux-research/css-audit.md` §3–§6, exactly as the audit defines them, over the linted
 * stylesheets in the cascade order of the two bundles. Each hit is `{ file, rule, selector, property, value, line }`;
 * `css-audit.test.ts` compares the hits with `__fixtures__/css-audit-baseline.json`. A small parser of its own keeps the
 * line numbers that `cssRules.ts` drops, and no dependency is added (no stylelint, no transitive parser).
 */

/** The stylesheets of the audit, by role. */
export const STYLESHEETS = {
    primitives: 'src/webview/shared/primitives/primitives.css',
    tokens: 'src/webview/shared/tokens.css',
    main: 'src/webview/main/main.css',
    sidebar: 'src/webview/sidebar/sidebar.css',
    search: 'src/webview/shared/search/search.css',
} as const;

/** The stylesheets a hit is reported in; `tokens.css` is read only as an earlier rule. */
export const LINTED: readonly string[] = [STYLESHEETS.primitives, STYLESHEETS.main, STYLESHEETS.sidebar, STYLESHEETS.search];

/** The two bundles in cascade order, as esbuild concatenates them (audit, Method). */
export const BUNDLES: readonly (readonly string[])[] = [
    [STYLESHEETS.primitives, STYLESHEETS.tokens, STYLESHEETS.main, STYLESHEETS.search],
    [STYLESHEETS.primitives, STYLESHEETS.tokens, STYLESHEETS.sidebar, STYLESHEETS.search],
];

export type AuditRule = 'pxLength' | 'duplicateSelector' | 'specificity' | 'override' | 'deadRule' | 'disableComment' | 'inlineStyle';

export interface AuditHit {
    file: string;
    rule: AuditRule;
    /** Null for a comment (`disableComment`) and a `style` prop (`inlineStyle`). */
    selector: string | null;
    property: string | null;
    value: string;
    line: number;
}

export interface Declaration {
    property: string;
    value: string;
    line: number;
}

export interface StyleRule {
    prelude: string;
    line: number;
    /** The at-rules around the rule, outermost first, joined with ` | `. */
    context: string;
    atRule: boolean;
    topLevel: boolean;
    inKeyframes: boolean;
    /** The complex selectors of the prelude with the line each starts on. */
    items: Array<{ text: string; line: number }>;
    declarations: Declaration[];
}

/** The spacing properties `webview-stylesheets.test.ts` already holds to the tokens (`pxSpacing`). */
const SPACING = /^(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?$/;
/** A px, em or rem length, the same expression as `pxSpacing`'s. */
const LENGTH = /(?<![\w.-])-?\d*\.?\d+(?:px|em|rem)\b/;
const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Splits at top-level commas (outside parentheses and brackets). */
function splitTopLevel(text: string): Array<{ start: number; end: number }> {
    const parts: Array<{ start: number; end: number }> = [];
    let depth = 0;
    let start = 0;
    for (let k = 0; k < text.length; k++) {
        const c = text[k];
        if (c === '(' || c === '[') {
            depth++;
        } else if (c === ')' || c === ']') {
            depth--;
        } else if (c === ',' && depth === 0) {
            parts.push({ start, end: k });
            start = k + 1;
        }
    }
    parts.push({ start, end: text.length });
    return parts;
}

/** The rules of a stylesheet with their lines, those inside at-rules included; comments are skipped. */
export function parseStylesheet(css: string): StyleRule[] {
    const text = css.replace(/\r\n/g, '\n');
    const rules: StyleRule[] = [];
    let position = 0;
    let line = 1;

    const block = (stack: StyleRule[]): void => {
        const owner = stack[stack.length - 1];
        let pending = '';
        const lines: number[] = [];
        const take = (char: string): void => {
            pending += char;
            lines.push(line);
            if (char === '\n') {
                line++;
            }
        };
        const declare = (): void => {
            const colon = pending.indexOf(':');
            const first = pending.search(/\S/);
            if (owner !== undefined && first >= 0 && colon > 0) {
                owner.declarations.push({ property: pending.slice(0, colon).trim(), value: collapse(pending.slice(colon + 1)), line: lines[first] });
            }
            pending = '';
            lines.length = 0;
        };
        while (position < text.length) {
            const char = text[position];
            if (char === '/' && text[position + 1] === '*') {
                const end = text.indexOf('*/', position + 2);
                if (end < 0) {
                    throw new Error(`css-audit: a comment opened on line ${line} is never closed`);
                }
                line += (text.slice(position, end).match(/\n/g) ?? []).length;
                position = end + 2;
                continue;
            }
            if (char === '"' || char === "'") {
                const end = text.indexOf(char, position + 1);
                if (end < 0) {
                    throw new Error(`css-audit: a string opened on line ${line} is never closed`);
                }
                for (const quoted of text.slice(position, end + 1)) {
                    take(quoted);
                }
                position = end + 1;
                continue;
            }
            position++;
            if (char === '{') {
                const first = pending.search(/\S/);
                const prelude = collapse(pending);
                const atRule = prelude.startsWith('@');
                if (!atRule && owner !== undefined && !owner.atRule) {
                    // The audit's rules read a selector as written; a nested one would escape them (CSS nesting is inside the floor).
                    throw new Error(`css-audit: the style rule "${prelude}" on line ${lines[first]} is nested in "${owner.prelude}": flatten it`);
                }
                const items = atRule ? [] : splitTopLevel(pending).flatMap(({ start, end }) => {
                    const offset = pending.slice(start, end).search(/\S/);
                    return offset < 0 ? [] : [{ text: collapse(pending.slice(start, end)), line: lines[start + offset] }];
                });
                const rule: StyleRule = {
                    prelude, line: lines[first], atRule, items, declarations: [],
                    context: stack.filter(parent => parent.atRule).map(parent => parent.prelude).join(' | '),
                    topLevel: stack.every(parent => !parent.atRule),
                    inKeyframes: stack.some(parent => parent.atRule && parent.prelude.startsWith('@keyframes')),
                };
                pending = '';
                lines.length = 0;
                rules.push(rule);
                block([...stack, rule]);
            } else if (char === '}') {
                declare();
                return;
            } else if (char === ';') {
                declare();
            } else {
                take(char);
            }
        }
    };
    block([]);
    return rules;
}

// ---- selectors ------------------------------------------------------------------------------------------------------

type Simple =
    | { kind: 'id' | 'class' | 'attribute' | 'type'; name: string }
    | { kind: 'pseudo-class' | 'pseudo-element'; name: string; argument: string | undefined }
    | { kind: 'universal' };

/** The compound selectors of a complex selector, combinators dropped. */
export function compounds(selector: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;
    let quote: string | undefined;
    for (const char of selector) {
        if (quote !== undefined) {
            current += char;
            quote = char === quote ? undefined : quote;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
        } else if (char === '(' || char === '[') {
            depth++;
        } else if (char === ')' || char === ']') {
            depth--;
        } else if (depth === 0 && /[\s>+~]/.test(char)) {
            if (current.trim() !== '') {
                result.push(current.trim());
            }
            current = '';
            continue;
        }
        current += char;
    }
    if (current.trim() !== '') {
        result.push(current.trim());
    }
    return result;
}

/** The end of the bracketed group that opens at `start`. */
function closing(text: string, start: number, open: string, close: string): number {
    let depth = 0;
    for (let k = start; k < text.length; k++) {
        if (text[k] === open) {
            depth++;
        } else if (text[k] === close && --depth === 0) {
            return k;
        }
    }
    return text.length - 1;
}

/** The simple selectors of a compound selector. */
export function simples(compound: string): Simple[] {
    const result: Simple[] = [];
    let k = 0;
    while (k < compound.length) {
        const rest = compound.slice(k);
        const char = compound[k];
        if (char === '#' || char === '.') {
            const name = /^[#.]([\w-]+)/.exec(rest)?.[1] ?? '';
            result.push({ kind: char === '#' ? 'id' : 'class', name });
            k += name.length + 1;
        } else if (char === '[') {
            const end = closing(compound, k, '[', ']');
            result.push({ kind: 'attribute', name: compound.slice(k + 1, end) });
            k = end + 1;
        } else if (char === ':') {
            const element = compound[k + 1] === ':';
            const match = /^::?([\w-]+)/.exec(rest);
            let end = k + (match?.[0].length ?? 1);
            let argument: string | undefined;
            if (compound[end] === '(') {
                const close = closing(compound, end, '(', ')');
                argument = compound.slice(end + 1, close);
                end = close + 1;
            }
            result.push({ kind: element ? 'pseudo-element' : 'pseudo-class', name: match?.[1] ?? '', argument });
            k = end;
        } else if (char === '*') {
            result.push({ kind: 'universal' });
            k++;
        } else {
            const name = /^[\w-]+/.exec(rest)?.[0] ?? char;
            result.push({ kind: 'type', name });
            k += name.length;
        }
    }
    return result;
}

export type Specificity = [number, number, number];
const plus = (a: Specificity, b: Specificity): Specificity => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const exceeds = (a: Specificity, b: Specificity): boolean => (a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2]);
const highest = (list: string): Specificity => {
    let best: Specificity = [0, 0, 0];
    for (const { start, end } of splitTopLevel(list)) {
        const candidate = specificity(list.slice(start, end).trim());
        best = exceeds(candidate, best) ? candidate : best;
    }
    return best;
};

/**
 * Specificity per Selectors Level 4: `:not()`, `:is()` and `:has()` take their most specific argument, `:where()`
 * counts 0, a pseudo-element counts in c, `:nth-child(even)` counts 1 in b (audit §5).
 */
export function specificity(selector: string): Specificity {
    let total: Specificity = [0, 0, 0];
    for (const compound of compounds(selector)) {
        for (const simple of simples(compound)) {
            if (simple.kind === 'id') {
                total = plus(total, [1, 0, 0]);
            } else if (simple.kind === 'class' || simple.kind === 'attribute') {
                total = plus(total, [0, 1, 0]);
            } else if (simple.kind === 'type' || simple.kind === 'pseudo-element') {
                total = plus(total, [0, 0, 1]);
            } else if (simple.kind === 'pseudo-class' && simple.name !== 'where') {
                total = plus(total, ['not', 'is', 'has'].includes(simple.name) ? highest(simple.argument ?? '') : [0, 1, 0]);
            }
        }
    }
    return total;
}

// ---- longhands ------------------------------------------------------------------------------------------------------

const SIDES = ['top', 'right', 'bottom', 'left'];
const ASPECTS = ['width', 'style', 'color'];
const LOGICAL: Record<string, string> = { 'block-start': 'top', 'block-end': 'bottom', 'inline-start': 'left', 'inline-end': 'right' };
const AXIS: Record<string, string[]> = { block: ['top', 'bottom'], inline: ['left', 'right'] };

/** The physical longhands a declaration sets, for horizontal LTR (audit §6, condition 6). */
export function longhands(property: string): string[] {
    const p = property.toLowerCase();
    const sides = (prefix: string, list: string[]): string[] => list.map(side => `${prefix}-${side}`);
    let m: RegExpExecArray | null;
    if (p === 'padding' || p === 'margin') {
        return sides(p, SIDES);
    }
    if ((m = /^(padding|margin)-(block|inline)$/.exec(p))) {
        return sides(m[1], AXIS[m[2]]);
    }
    if ((m = /^(padding|margin)-((?:block|inline)-(?:start|end))$/.exec(p))) {
        return [`${m[1]}-${LOGICAL[m[2]]}`];
    }
    if (p === 'inset') {
        return SIDES;
    }
    if ((m = /^inset-(block|inline)$/.exec(p))) {
        return AXIS[m[1]];
    }
    if ((m = /^inset-((?:block|inline)-(?:start|end))$/.exec(p))) {
        return [LOGICAL[m[1]]];
    }
    const border = (list: string[], aspects = ASPECTS): string[] => list.flatMap(side => aspects.map(aspect => `border-${side}-${aspect}`));
    if (p === 'border') {
        return border(SIDES);
    }
    if ((m = /^border-(width|style|color)$/.exec(p))) {
        return border(SIDES, [m[1]]);
    }
    if ((m = /^border-(top|right|bottom|left)$/.exec(p))) {
        return border([m[1]]);
    }
    if ((m = /^border-(block|inline)$/.exec(p))) {
        return border(AXIS[m[1]]);
    }
    if ((m = /^border-(block|inline)-(width|style|color)$/.exec(p))) {
        return border(AXIS[m[1]], [m[2]]);
    }
    if ((m = /^border-((?:block|inline)-(?:start|end))$/.exec(p))) {
        return border([LOGICAL[m[1]]]);
    }
    if ((m = /^border-((?:block|inline)-(?:start|end))-(width|style|color)$/.exec(p))) {
        return border([LOGICAL[m[1]]], [m[2]]);
    }
    if (p === 'border-radius') {
        return ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];
    }
    if ((m = /^(min-|max-)?(inline|block)-size$/.exec(p))) {
        return [`${m[1] ?? ''}${m[2] === 'inline' ? 'width' : 'height'}`];
    }
    const expansions: Record<string, string[]> = {
        flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
        'flex-flow': ['flex-direction', 'flex-wrap'],
        overflow: ['overflow-x', 'overflow-y'],
        font: ['font-style', 'font-weight', 'font-size', 'line-height', 'font-family'],
        background: ['background-color', 'background-image'],
        gap: ['row-gap', 'column-gap'],
    };
    return expansions[p] ?? [p];
}

// ---- the rules ------------------------------------------------------------------------------------------------------

/** §3: a px, em or rem length in a declaration outside the spacing properties and custom properties. */
function pxLength(sheets: Record<string, StyleRule[]>): AuditHit[] {
    return LINTED.flatMap(file => sheets[file].filter(rule => !rule.atRule).flatMap(rule => rule.declarations
        .filter(declaration => !declaration.property.startsWith('--') && !SPACING.test(declaration.property) && LENGTH.test(declaration.value))
        .map(declaration => ({ file, rule: 'pxLength' as const, selector: rule.prelude, property: declaration.property, value: declaration.value, line: declaration.line }))));
}

/** The preludes ADR-010 Decision 6 lets more than one stylesheet declare. */
const SHARED_PRELUDES = new Set(['body', ':root']);

/**
 * §4: a style rule whose prelude and at-rule context equal those of an earlier rule of the same bundle (the audit's
 * definition), and, as ADR-010 Decision 6 and the plan row say, of an earlier linted stylesheet in another bundle
 * (`main.css` and `sidebar.css` share none); `body` and `:root` are exempt.
 */
function duplicateSelector(sheets: Record<string, StyleRule[]>): AuditHit[] {
    const hits = new Map<string, AuditHit>();
    const record = (file: string, rule: StyleRule, first: { file: string; line: number }): void => {
        const hit: AuditHit = { file, rule: 'duplicateSelector', selector: rule.prelude, property: null, value: `${first.file}:${first.line}`, line: rule.line };
        hits.set(`${file}|${rule.line}`, hits.get(`${file}|${rule.line}`) ?? hit);
    };
    const styleRules = (file: string): StyleRule[] => sheets[file].filter(rule => !rule.atRule && !rule.inKeyframes && !SHARED_PRELUDES.has(rule.prelude));
    for (const bundle of [...BUNDLES, LINTED]) {
        const seen = new Map<string, { file: string; line: number }>();
        for (const file of bundle) {
            for (const rule of styleRules(file)) {
                const key = `${rule.context}|${rule.prelude}`;
                const first = seen.get(key);
                if (first === undefined) {
                    seen.set(key, { file, line: rule.line });
                } else if (LINTED.includes(file) && (bundle !== LINTED || first.file !== file)) {
                    record(file, rule, first);
                }
            }
        }
    }
    return [...hits.values()];
}

/** §5: a complex selector above (0,2,0). */
function specificityHits(sheets: Record<string, StyleRule[]>): AuditHit[] {
    return LINTED.flatMap(file => sheets[file].filter(rule => !rule.atRule && !rule.inKeyframes).flatMap(rule => rule.items.flatMap(item => {
        const value = specificity(item.text);
        return exceeds(value, [0, 2, 0]) ? [{ file, rule: 'specificity' as const, selector: item.text, property: null, value: `(${value.join(',')})`, line: item.line }] : [];
    })));
}

/** §6: a declaration in another file whose subject compound includes the classes of a primitive's and wins on a shared longhand. */
function override(sheets: Record<string, StyleRule[]>): AuditHit[] {
    const hits = new Map<string, AuditHit>();
    for (const bundle of BUNDLES) {
        const selectors = bundle.flatMap(file => sheets[file].filter(rule => !rule.atRule && rule.topLevel).map(rule => ({ file, rule })))
            .flatMap(({ file, rule }, order) => rule.items.map(item => {
                const parts = compounds(item.text);
                const subject = simples(parts[parts.length - 1] ?? '');
                return {
                    file, rule, order, selector: item.text, specificity: specificity(item.text),
                    classes: subject.flatMap(simple => (simple.kind === 'class' ? [simple.name] : [])),
                    element: subject.flatMap(simple => (simple.kind === 'pseudo-element' ? [simple.name] : [])).join(),
                };
            }));
        for (const earlier of selectors.filter(candidate => candidate.classes.length > 0)) {
            for (const later of selectors) {
                const wins = exceeds(later.specificity, earlier.specificity) || (later.specificity.join() === earlier.specificity.join() && later.order > earlier.order);
                if (later.file === earlier.file || !LINTED.includes(later.file) || later.element !== earlier.element || !wins
                    || !earlier.classes.every(name => later.classes.includes(name))) {
                    continue;
                }
                const shadowed = new Set(earlier.rule.declarations.flatMap(declaration => longhands(declaration.property)));
                for (const declaration of later.rule.declarations.filter(candidate => longhands(candidate.property).some(longhand => shadowed.has(longhand)))) {
                    const hit: AuditHit = { file: later.file, rule: 'override', selector: later.selector, property: declaration.property, value: declaration.value, line: declaration.line };
                    hits.set(JSON.stringify(hit), hit);
                }
            }
        }
    }
    return [...hits.values()];
}

/** Every hit of the four rules of UX-P0.20 over the stylesheets, read with `read(file)`. */
export function auditStylesheets(read: (file: string) => string): AuditHit[] {
    const sheets = Object.fromEntries(Object.values(STYLESHEETS).map(file => [file, parseStylesheet(read(file))]));
    return [...pxLength(sheets), ...duplicateSelector(sheets), ...specificityHits(sheets), ...override(sheets)];
}

// ---- UX-P0.21: dead rules, disable comments, inline styles -----------------------------------------------------------

/** A webview source file: its path and its text. */
export interface Source {
    file: string;
    text: string;
}

/** A TypeScript source without its comments, its lines kept (a `//` inside a URL, after no whitespace, is kept). */
const withoutComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' ')).replace(/(^|\s)\/\/.*$/gm, '$1');

/** The class names a selector names, attribute values and strings left out. */
export const classesOf = (selector: string): string[] =>
    [...selector.replace(/\[[^\]]*\]/g, '').replace(/(["'])(?:(?!\1).)*\1/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(match => match[1]);

/**
 * §8: a complex selector naming a class no non-test source renders, as a whole word after comments are removed, or
 * through a template prefix (`nuiget-x--${…}`) or a quoted prefix string (`'nuiget-hljs-'`) those sources build.
 * A prefix starts a token and names at least one segment after `nuiget-`: `--nuiget-${string}` (a custom property)
 * is no class prefix, and a bare `nuiget-` would render every class. Of `sources` (the `.ts`/`.tsx` files under
 * `src/webview`) tests, `testSupport.ts` and `.d.ts` files do not count.
 */
export function deadRules(read: (file: string) => string, sources: readonly Source[]): AuditHit[] {
    const code = sources.filter(source => !/(?:\.test\.tsx?|\.d\.ts|\/testSupport\.ts)$/.test(source.file)).map(source => withoutComments(source.text)).join('\n');
    const prefixes = new Set([
        ...[...code.matchAll(/(?<![\w-])(nuiget-\w[\w-]*)\$\{/g)].map(match => match[1]),
        ...[...code.matchAll(/['"`](nuiget-\w[\w-]*-)['"`]/g)].map(match => match[1]),
    ]);
    const rendered = (name: string): boolean =>
        new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(code) || [...prefixes].some(prefix => name.startsWith(prefix));
    return LINTED.flatMap(file => parseStylesheet(read(file)).filter(rule => !rule.atRule && !rule.inKeyframes).flatMap(rule => rule.items.flatMap(item => {
        const dead = classesOf(item.text).filter(name => !rendered(name));
        return dead.length === 0 ? [] : [{ file, rule: 'deadRule' as const, selector: item.text, property: null, value: [...new Set(dead)].join(', '), line: item.line }];
    })));
}

/** §10: a comment in a linted stylesheet that disables a linter. */
export function disableComments(read: (file: string) => string): AuditHit[] {
    return LINTED.flatMap(file => {
        const text = read(file).replace(/\r\n/g, '\n');
        return [...text.matchAll(/\/\*[\s\S]*?\*\//g)]
            .filter(match => /\b(?:stylelint|eslint)-disable\b/.test(match[0]))
            .map(match => ({ file, rule: 'disableComment' as const, selector: null, property: null, value: collapse(match[0]), line: text.slice(0, match.index).split('\n').length }));
    });
}

/** The expression of a JSX attribute value `{…}` that opens at `start` (the `{`), braces, strings and templates balanced. */
function jsxExpression(text: string, start: number): string {
    let depth = 0;
    let quote: string | undefined;
    for (let k = start; k < text.length; k++) {
        const char = text[k];
        if (quote !== undefined) {
            if (char === '\\') {
                k++;
            } else if (char === quote) {
                quote = undefined;
            }
            continue;
        }
        if (char === '"' || char === "'" || char === '`') {
            quote = char;
        } else if (char === '{') {
            depth++;
        } else if (char === '}' && --depth === 0) {
            return text.slice(start + 1, k).trim();
        }
    }
    return text.slice(start + 1).trim();
}

/** The branches of a top-level conditional `a ? b : c`, or the expression itself. */
function branches(expression: string): string[] {
    let depth = 0;
    let quote: string | undefined;
    let question = -1;
    for (let k = 0; k < expression.length; k++) {
        const char = expression[k];
        if (quote !== undefined) {
            quote = char === quote ? undefined : quote;
            continue;
        }
        if (char === '"' || char === "'" || char === '`') {
            quote = char;
        } else if ('({['.includes(char)) {
            depth++;
        } else if (')}]'.includes(char)) {
            depth--;
        } else if (depth === 0 && char === '?' && expression[k + 1] !== '.' && expression[k + 1] !== '?' && question < 0) {
            question = k;
        } else if (depth === 0 && char === ':' && question >= 0) {
            return [...branches(expression.slice(question + 1, k).trim()), ...branches(expression.slice(k + 1).trim())];
        }
    }
    return [expression];
}

/** Whether a `style` branch is `undefined` or a `cssVars({ '--nuiget-…': … })` call naming custom properties only. */
const cssVarsOnly = (branch: string): boolean => {
    if (branch === 'undefined') {
        return true;
    }
    const body = /^cssVars\(\{([\s\S]*)\}\)$/.exec(branch)?.[1];
    if (body === undefined) {
        return false;
    }
    const keys = [...body.matchAll(/(?:^|,)\s*(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*))\s*:/g)].map(match => match[2] ?? match[3]);
    return keys.length > 0 && keys.every(key => key.startsWith('--nuiget-'));
};

/** ADR-010 Decision 5: every `style` prop of a `.tsx` file, tests included, is a `cssVars({ '--nuiget-…': value })` call (or none). */
export function inlineStyles(sources: readonly Source[]): AuditHit[] {
    return sources.filter(source => source.file.endsWith('.tsx')).flatMap(source => {
        const text = withoutComments(source.text.replace(/\r\n/g, '\n'));
        return [...text.matchAll(/\bstyle=\{/g)].flatMap(match => {
            const expression = jsxExpression(text, (match.index ?? 0) + match[0].length - 1);
            return branches(expression).every(cssVarsOnly)
                ? []
                : [{ file: source.file, rule: 'inlineStyle' as const, selector: null, property: 'style', value: collapse(expression), line: text.slice(0, match.index).split('\n').length }];
        });
    });
}

/** Every hit of the six stylesheet rules and the inline-style rule. */
export function auditWebview(read: (file: string) => string, sources: readonly Source[]): AuditHit[] {
    return [...auditStylesheets(read), ...deadRules(read, sources), ...disableComments(read), ...inlineStyles(sources)];
}

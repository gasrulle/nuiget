import ts from 'typescript';

/**
 * UX-P3.11 (DS-COPY-1, DS-COPY-4; design-advisor opening ruling of 2026-11-15, DO 6): the microcopy of the webviews, read
 * from their sources. A literal is classified by its JSX position: a label (Title Case), a sentence (capital first, period
 * last) or a name (capital first). Interpolations count as words that pass.
 */

/** DS-COPY-1's minor words: lower case when not first. */
export const MINOR_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'at', 'by', 'with', 'from', 'as']);
/** Words written as their owners write them. */
export const PROPER_NOUNS = new Set(['nUIget', 'NuGet', 'README', 'CPM']);
/** The stand-in of an interpolation inside a template literal. */
export const SLOT = '${}';

/** Labels that open further UI (a form, a picker or a menu) and so end in "..." (DS-COPY-4). `${}` is an interpolation. */
export const OPENS_UI: readonly string[] = ['Add Source...', 'Install in Projects...', 'Install...', 'Manage Package Sources...', 'Install ${} ${}...', 'Uninstall ${}...'];

export type Kind = 'label' | 'sentence' | 'name';

/** Components whose `label` is Title Case, and those whose `label` is a name. A `label` on any other component fails. */
const TITLE_LABELS = new Set(['IconButton', 'Badge']);
const NAME_LABELS = new Set(['ProgressBar', 'Toolbar', 'SearchBox', 'Listbox', 'Tabs', 'Sash', 'Spinner']);
/** Components whose `title` is a sentence (a tooltip or the reason of a disabled control), and those whose `title` is a name. */
const SENTENCE_TITLES = new Set(['Button', 'IconButton']);
const NAME_TITLES = new Set(['Badge']);
/** Components whose `title` is a group header (Title Case). */
const HEADER_TITLES = new Set(['SectionHeader', 'GroupCaption']);
/** Components whose `action={{ label }}` is a button label. */
const ACTION_HOLDERS = new Set(['Banner', 'EmptyState']);

export interface Finding {
    file: string;
    line: number;
    kind: Kind | 'unclassified' | 'ellipsis' | 'failure-form' | 'failed-in-banner';
    text: string;
}

/** One word passes when it starts upper case, is a minor word not first, starts with a digit, `(`, `@` or a slot, or is a proper noun. */
function wordPasses(word: string, first: boolean): boolean {
    const bare = word.replace(/^["'“(]+/, '').replace(/[.,:;!?"')”]+$/, '').replace(/\.\.\.$/, '');
    if (bare === '' || /^[0-9(@]/.test(word) || word.startsWith(SLOT) || bare.startsWith(SLOT) || PROPER_NOUNS.has(bare)) {
        return true;
    }
    if (!first && MINOR_WORDS.has(bare)) {
        return true;
    }
    // Each part of a hyphenated word is capitalised ("Pre-Release").
    return bare.split('-').every(part => part === '' || /^[A-Z0-9]/.test(part) || part.startsWith(SLOT) || PROPER_NOUNS.has(part));
}

export function isTitleCase(text: string): boolean {
    const words = text.trim().split(/\s+/).filter(word => word !== '');
    return words.length > 0 && words.every((word, index) => wordPasses(word, index === 0));
}

export function isSentence(text: string): boolean {
    const trimmed = text.trim();
    return /^([A-Z0-9"“@]|\$\{\})/.test(trimmed) && /[.?!]$|\$\{\}$/.test(trimmed) && !trimmed.endsWith('...');
}

export function isName(text: string): boolean {
    return /^([A-Z0-9@]|\$\{\}|nUIget)/.test(text.trim());
}

const passes: Record<Kind, (text: string) => boolean> = { label: isTitleCase, sentence: isSentence, name: isName };

/** The texts an expression can show: literals, templates (slots for interpolations), both branches of a condition, the right of `??`. */
export function textsOf(node: ts.Node | undefined): string[] {
    if (node === undefined) {
        return [];
    }
    if (ts.isJsxExpression(node)) {
        return textsOf(node.expression);
    }
    if (ts.isParenthesizedExpression(node)) {
        return textsOf(node.expression);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return [node.text];
    }
    if (ts.isTemplateExpression(node)) {
        return [node.head.text + node.templateSpans.map(span => SLOT + span.literal.text).join('')];
    }
    if (ts.isConditionalExpression(node)) {
        return [...textsOf(node.whenTrue), ...textsOf(node.whenFalse)];
    }
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
        return textsOf(node.right);
    }
    return [];
}

function tagOf(node: ts.JsxOpeningLikeElement): string {
    return node.tagName.getText();
}

function attribute(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
    return node.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name);
}

/** The `label` of an object literal `{ label: … }` given to an `action` attribute. */
function actionLabel(attr: ts.JsxAttribute | undefined): ts.Expression | undefined {
    const value = attr?.initializer;
    if (value === undefined || !ts.isJsxExpression(value) || value.expression === undefined || !ts.isObjectLiteralExpression(value.expression)) {
        return undefined;
    }
    const property = value.expression.properties.find((entry): entry is ts.PropertyAssignment => ts.isPropertyAssignment(entry) && entry.name.getText() === 'label');
    return property?.initializer;
}

function childTexts(element: ts.JsxElement): Array<{ node: ts.Node; text: string }> {
    return element.children.flatMap(child => {
        if (ts.isJsxText(child)) {
            const text = child.getText().trim();
            return text === '' ? [] : [{ node: child as ts.Node, text: text.replace(/\s+/g, ' ') }];
        }
        if (ts.isJsxExpression(child)) {
            return textsOf(child).map(text => ({ node: child as ts.Node, text }));
        }
        return [];
    });
}

/** Lints one source file's microcopy; `file` names it in the findings. */
export function lintSource(file: string, source: string): Finding[] {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const findings: Finding[] = [];
    const lineOf = (node: ts.Node): number => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const check = (kind: Kind, node: ts.Node, texts: string[]): void => {
        for (const text of texts) {
            if (!passes[kind](text)) {
                findings.push({ file, line: lineOf(node), kind, text });
            }
        }
    };
    const visit = (node: ts.Node): void => {
        // DS-COPY-4: no U+2026 in any literal or JSX text (comments are trivia, never visited).
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) && node.getText(sf).includes('…')) {
            findings.push({ file, line: lineOf(node), kind: 'ellipsis', text: node.getText(sf).trim() });
        }
        // §10 item 8: a composed read failure goes through `failure()`.
        if ((ts.isTemplateExpression(node) && /could not be [a-z]+: $/.test(node.head.text)) || (ts.isTemplateExpression(node) && node.templateSpans.some(span => /could not be [a-z]+: $/.test(span.literal.text)))) {
            findings.push({ file, line: lineOf(node), kind: 'failure-form', text: node.getText(sf) });
        }
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
            const opening = ts.isJsxElement(node) ? node.openingElement : node;
            const tag = tagOf(opening);
            const label = attribute(opening, 'label');
            if (label !== undefined) {
                if (TITLE_LABELS.has(tag)) {
                    check('label', label, textsOf(label.initializer));
                } else if (NAME_LABELS.has(tag)) {
                    check('name', label, textsOf(label.initializer));
                } else {
                    findings.push({ file, line: lineOf(label), kind: 'unclassified', text: `<${tag} label>` });
                }
            }
            const title = attribute(opening, 'title');
            if (title !== undefined) {
                if (SENTENCE_TITLES.has(tag)) {
                    check('sentence', title, textsOf(title.initializer));
                } else if (NAME_TITLES.has(tag)) {
                    check('name', title, textsOf(title.initializer));
                } else if (HEADER_TITLES.has(tag)) {
                    check('label', title, textsOf(title.initializer));
                }
            }
            if (ACTION_HOLDERS.has(tag)) {
                const action = actionLabel(attribute(opening, 'action'));
                if (action !== undefined) {
                    check('label', action, textsOf(action));
                }
            }
            if (tag === 'EmptyState') {
                const message = attribute(opening, 'message');
                if (message !== undefined) {
                    check('sentence', message, textsOf(message.initializer));
                }
            }
            if (ts.isJsxElement(node) && tag === 'Button') {
                for (const { node: child, text } of childTexts(node)) {
                    check('label', child, [text]);
                }
            }
            if (ts.isJsxElement(node) && tag === 'Banner') {
                for (const { node: child, text } of childTexts(node)) {
                    check('sentence', child, [text]);
                    if (text.includes('failed:')) {
                        findings.push({ file, line: lineOf(child), kind: 'failed-in-banner', text });
                    }
                }
            }
        }
        // A group row's title and a tab's label in an object literal: `{ kind: 'group', title }`, `{ id, label, 'data-testid' }`.
        if (ts.isObjectLiteralExpression(node)) {
            const props = new Map(node.properties.filter(ts.isPropertyAssignment).map(entry => [entry.name.getText().replace(/['"]/g, ''), entry.initializer]));
            const kind = props.get('kind');
            if (kind !== undefined && ts.isStringLiteral(kind) && kind.text === 'group' && props.has('title')) {
                check('label', props.get('title')!, textsOf(props.get('title')));
            }
            if (props.has('id') && props.has('label') && props.has('data-testid')) {
                check('label', props.get('label')!, textsOf(props.get('label')));
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return findings;
}

/** Every label text of a source (Title Case positions only), with slots for interpolations: what DS-COPY-4's table is read against. */
export function labelsOf(file: string, source: string): string[] {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const labels: string[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
            const opening = ts.isJsxElement(node) ? node.openingElement : node;
            const tag = tagOf(opening);
            if (TITLE_LABELS.has(tag)) {
                labels.push(...textsOf(attribute(opening, 'label')?.initializer));
            }
            if (ts.isJsxElement(node) && tag === 'Button') {
                labels.push(...childTexts(node).map(entry => entry.text));
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return labels;
}

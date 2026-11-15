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
export const OPENS_UI: readonly string[] = ['Add Source...', 'Install in Projects...', 'Install...', 'Manage Package Sources...', 'Install ${} ${}...', 'Uninstall ${}...', 'Install Version...', 'Change Version...', 'Update to Version...'];

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
    kind: Kind | HostKind | 'unclassified' | 'ellipsis' | 'failure-form' | 'failed-in-banner' | 'prefix';
    text: string;
}

/**
 * The host's positions (UX-P3.11b; design-advisor opening ruling of 2026-11-15, DO 5): a prompt (`placeHolder`: capital,
 * digit or slot first, no final period, no "..."), a fragment (a quick-pick item's `description` or `detail`: capital,
 * digit, "(" or slot first, no final period) and a notification (a message or a status text: a sentence after its
 * `nUIget: ` prefix, which a non-modal one must carry).
 */
export type HostKind = 'prompt' | 'fragment' | 'notification';

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

/** The `nUIget: ` prefix of a notification or status text: the one product name every host message starts with (DS §10 item 10). */
export const HOST_PREFIX = 'nUIget: ';
/** A codicon at the start of a quick-pick label or a status bar text (`$(gear) `): an icon, not a word. */
const CODICON = /^\$\([a-z0-9~-]+\)\s*/;

export function isPrompt(text: string): boolean {
    const trimmed = text.trim();
    return /^([A-Z0-9]|\$\{\})/.test(trimmed) && !/[.]$/.test(trimmed);
}

export function isFragment(text: string): boolean {
    const trimmed = text.trim();
    return trimmed === '' || (/^([A-Z0-9(]|\$\{\}|nUIget)/.test(trimmed) && !/[.]$/.test(trimmed));
}

/**
 * A notification is a sentence after its prefix, ending in its own punctuation: a trailing interpolation (a host reason)
 * does not end it. The prefix is checked apart (finding `prefix`).
 */
export function isNotification(text: string): boolean {
    const body = text.startsWith(HOST_PREFIX) ? text.slice(HOST_PREFIX.length) : text;
    return isSentence(body) && /[.?!]$/.test(body.trim());
}

/** A host label: Title Case after its codicon; a word with no letter or digit (the dash of "nUIget — Install") passes. */
export function isHostLabel(text: string): boolean {
    return isTitleCase(text.replace(CODICON, '').split(/\s+/).filter(word => /[\p{L}\p{N}$]/u.test(word)).join(' '));
}

const hostPasses: Record<Kind | HostKind, (text: string) => boolean> = {
    label: isHostLabel,
    sentence: isSentence,
    name: text => isName(text.replace(CODICON, '')),
    prompt: isPrompt,
    fragment: isFragment,
    notification: isNotification,
};

/** One text the host shows, at its position: what the host reader yields and what its rules judge. */
export interface HostText {
    line: number;
    kind: Kind | HostKind;
    text: string;
    /** A notification that is not modal: its text must start with the prefix. */
    prefixed?: boolean;
}

/** Texts of one value in a host source. Interpolations are slots unless they call a function of the same file. */
class HostResolver {
    private readonly functions = new Map<string, ts.FunctionLikeDeclaration>();
    private readonly constants = new Map<string, ts.Expression>();
    /** Names bound to data: a destructured binding, an import, `undefined`. Shown as a slot, never unresolved. */
    private readonly data = new Set<string>(['undefined']);
    /** Variables holding a quick pick of `createQuickPick`: their `title` is a label. */
    readonly quickPicks = new Set<string>();
    private readonly unresolved: Array<{ node: ts.Node; text: string }> = [];

    constructor(private readonly sf: ts.SourceFile) {
        const collect = (node: ts.Node): void => {
            if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
                this.functions.set(node.name.text, node);
            }
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
                const init = node.initializer;
                if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
                    this.functions.set(node.name.text, init);
                } else if (ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) {
                    this.constants.set(node.name.text, init);
                }
                if (ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression) && init.expression.name.text === 'createQuickPick') {
                    this.quickPicks.add(node.name.text);
                }
            }
            if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
                this.data.add(node.name.text);
            }
            if ((ts.isImportSpecifier(node) || ts.isNamespaceImport(node) || ts.isImportClause(node)) && node.name !== undefined) {
                this.data.add(node.name.text);
            }
            ts.forEachChild(node, collect);
        };
        collect(sf);
    }

    /** Identifiers in a shown text that no rule resolved: each is a finding (`unclassified`), never a silent slot. */
    get unresolvedNodes(): ReadonlyArray<{ node: ts.Node; text: string }> {
        return this.unresolved;
    }

    /** The texts `node` can show; `depth` bounds the walk through functions and their call sites. */
    texts(node: ts.Node | undefined, depth = 0): string[] {
        if (node === undefined || depth > 6) {
            return [SLOT];
        }
        if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
            return this.texts(node.expression, depth);
        }
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            return [node.text];
        }
        if (ts.isTemplateExpression(node)) {
            let results = [node.head.text];
            for (const span of node.templateSpans) {
                const inner = this.spanTexts(span.expression, depth);
                results = results.flatMap(prefix => inner.map(text => prefix + text + span.literal.text));
            }
            return results;
        }
        if (ts.isConditionalExpression(node)) {
            return [...this.texts(node.whenTrue, depth), ...this.texts(node.whenFalse, depth)];
        }
        if (ts.isBinaryExpression(node)) {
            const op = node.operatorToken.kind;
            if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
                // An empty fallback shows nothing of its own: the left's texts stand for it.
                return [...this.texts(node.left, depth), ...this.texts(node.right, depth).filter(text => text !== '')];
            }
            if (op === ts.SyntaxKind.PlusToken) {
                const left = this.texts(node.left, depth);
                const right = this.texts(node.right, depth);
                return left.flatMap(a => right.map(b => a + b));
            }
        }
        if (ts.isIdentifier(node)) {
            return this.identifierTexts(node, depth);
        }
        if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
            // `TITLES[kind]`: every value of a constant record.
            const record = this.constants.get(node.expression.text);
            if (record !== undefined && ts.isObjectLiteralExpression(record)) {
                return record.properties.filter(ts.isPropertyAssignment).flatMap(entry => this.texts(entry.initializer, depth + 1));
            }
            return [SLOT];
        }
        if (ts.isCallExpression(node)) {
            const callee = node.expression;
            // `text.trimEnd()` and the like keep the receiver's words.
            if (ts.isPropertyAccessExpression(callee) && ['trim', 'trimEnd', 'trimStart'].includes(callee.name.text)) {
                return this.texts(callee.expression, depth);
            }
            if (ts.isIdentifier(callee) && this.functions.has(callee.text)) {
                return this.returnTexts(this.functions.get(callee.text)!, depth + 1);
            }
            return [SLOT];
        }
        // A property access, an element of data, a number: data, shown as a slot.
        return [SLOT];
    }

    /** An interpolation: a local function's sentences or a constant are spelled out, anything else is a slot. */
    private spanTexts(node: ts.Expression, depth: number): string[] {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && this.functions.has(node.expression.text)) {
            return this.returnTexts(this.functions.get(node.expression.text)!, depth + 1);
        }
        if (ts.isIdentifier(node)) {
            const constant = this.constants.get(node.text);
            if (constant !== undefined && ts.isStringLiteralLike(constant)) {
                return this.texts(constant, depth + 1);
            }
            // A `let` that holds a sentence of the same function (`sentence` in `doneSentence`).
            const owner = this.enclosingFunction(node);
            const isParameter = owner?.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === node.text) === true;
            const assigned = owner !== undefined && !isParameter ? this.assignedTexts(owner, node.text, depth) : undefined;
            if (assigned !== undefined) {
                return assigned;
            }
        }
        return [SLOT];
    }

    private identifierTexts(node: ts.Identifier, depth: number): string[] {
        const constant = this.constants.get(node.text);
        if (constant !== undefined) {
            return this.texts(constant, depth + 1);
        }
        const owner = this.enclosingFunction(node);
        if (owner !== undefined) {
            const index = owner.parameters.findIndex(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === node.text);
            if (index >= 0) {
                return this.parameterTexts(owner, index, depth);
            }
            const assigned = this.assignedTexts(owner, node.text, depth);
            if (assigned !== undefined) {
                return assigned;
            }
        }
        if (!this.data.has(node.text)) {
            this.unresolved.push({ node, text: node.text });
        }
        return [SLOT];
    }

    /** A parameter of a function the file calls by name: the texts of its arguments there; of any other function: data. */
    private parameterTexts(owner: ts.FunctionLikeDeclaration, index: number, depth: number): string[] {
        const name = this.nameOf(owner);
        if (name === undefined || this.isExported(owner)) {
            return [SLOT];
        }
        const calls: ts.CallExpression[] = [];
        const find = (node: ts.Node): void => {
            if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) {
                calls.push(node);
            }
            ts.forEachChild(node, find);
        };
        find(this.sf);
        return calls.length === 0 ? [SLOT] : calls.flatMap(call => this.texts(call.arguments[index], depth + 1));
    }

    /** A `let` of the function: the texts of every value assigned to it. */
    private assignedTexts(owner: ts.FunctionLikeDeclaration, name: string, depth: number): string[] | undefined {
        const values: ts.Expression[] = [];
        let declared = false;
        const find = (node: ts.Node): void => {
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
                declared = true;
                if (node.initializer !== undefined) {
                    values.push(node.initializer);
                }
            }
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left) && node.left.text === name) {
                values.push(node.right);
            }
            ts.forEachChild(node, find);
        };
        if (owner.body !== undefined) {
            find(owner.body);
        }
        return declared ? values.flatMap(value => this.texts(value, depth + 1)) : undefined;
    }

    private returnTexts(fn: ts.FunctionLikeDeclaration, depth: number): string[] {
        if (fn.body === undefined) {
            return [SLOT];
        }
        if (!ts.isBlock(fn.body)) {
            return this.texts(fn.body, depth);
        }
        const results: string[] = [];
        const find = (node: ts.Node): void => {
            if (ts.isReturnStatement(node) && node.expression !== undefined) {
                results.push(...this.texts(node.expression, depth));
            }
            if (!ts.isFunctionLike(node)) {
                ts.forEachChild(node, find);
            }
        };
        ts.forEachChild(fn.body, find);
        return results.length === 0 ? [SLOT] : results;
    }

    private enclosingFunction(node: ts.Identifier): ts.FunctionLikeDeclaration | undefined {
        for (let current = node.parent; current !== undefined; current = current.parent) {
            if (ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) || ts.isFunctionExpression(current) || ts.isMethodDeclaration(current)) {
                const declares = current.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === node.text);
                if (declares || this.declaresLocal(current, node.text)) {
                    return current;
                }
            }
        }
        return undefined;
    }

    private declaresLocal(fn: ts.FunctionLikeDeclaration, name: string): boolean {
        let found = false;
        const find = (node: ts.Node): void => {
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
                found = true;
            }
            if (!found && !(ts.isFunctionLike(node) && node !== fn)) {
                ts.forEachChild(node, find);
            }
        };
        if (fn.body !== undefined) {
            find(fn.body);
        }
        return found;
    }

    private nameOf(fn: ts.FunctionLikeDeclaration): string | undefined {
        if (ts.isFunctionDeclaration(fn)) {
            return fn.name?.text;
        }
        return ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : undefined;
    }

    private isExported(fn: ts.FunctionLikeDeclaration): boolean {
        const holder = ts.isFunctionDeclaration(fn) ? fn : fn.parent?.parent?.parent;
        return holder !== undefined && ts.canHaveModifiers(holder) && (ts.getModifiers(holder) ?? []).some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
    }
}

const MESSAGE_CALLS = new Set(['showInformationMessage', 'showWarningMessage', 'showErrorMessage']);

/** Every text a host source shows, by position (UX-P3.11b): what `lintHostSource` judges and its test reads by content. */
export function hostTextsOf(file: string, source: string): HostText[] {
    return readHost(file, source).texts;
}

/** The host reader: the texts by position, and the identifiers in them that no rule resolved (line and name). */
function readHost(file: string, source: string): { texts: HostText[]; unresolved: Array<{ line: number; text: string }> } {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const resolver = new HostResolver(sf);
    const found: HostText[] = [];
    const lineOf = (node: ts.Node): number => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const add = (kind: Kind | HostKind, node: ts.Node | undefined, prefixed?: boolean): void => {
        if (node === undefined) {
            return;
        }
        for (const text of resolver.texts(node)) {
            found.push({ line: lineOf(node), kind, text, prefixed });
        }
    };
    const propsOf = (node: ts.ObjectLiteralExpression): Map<string, ts.Node> => new Map(node.properties.flatMap(entry => {
        if (ts.isPropertyAssignment(entry)) {
            return [[entry.name.getText(sf).replace(/['"]/g, ''), entry.initializer] as const];
        }
        if (ts.isShorthandPropertyAssignment(entry)) {
            return [[entry.name.text, entry.name] as const];
        }
        return [];
    }));
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
            const callee = node.expression;
            const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
            if (MESSAGE_CALLS.has(name)) {
                const options = node.arguments.slice(1).find(ts.isObjectLiteralExpression);
                const modal = options !== undefined && options.properties.some(entry => ts.isPropertyAssignment(entry) && entry.name.getText(sf) === 'modal' && entry.initializer.kind === ts.SyntaxKind.TrueKeyword);
                add(modal ? 'sentence' : 'notification', node.arguments[0], !modal);
                if (options !== undefined) {
                    add('sentence', propsOf(options).get('detail'));
                }
                for (const button of node.arguments.slice(1).filter(argument => !ts.isObjectLiteralExpression(argument))) {
                    add('label', button);
                }
            } else if (name === 'setStatusBarMessage') {
                add('notification', node.arguments[0], true);
            } else if (name === 'pickSingleProject') {
                add('label', node.arguments[0]);
                add('prompt', node.arguments[1]);
            } else if (name === 'report' && node.arguments[0] !== undefined && ts.isObjectLiteralExpression(node.arguments[0])) {
                add('name', propsOf(node.arguments[0]).get('message'));
            }
        }
        if (ts.isObjectLiteralExpression(node)) {
            const props = propsOf(node);
            const separator = props.get('kind')?.getText(sf).endsWith('Separator') === true;
            if (props.has('label') && !separator) {
                add('label', props.get('label'));
                add('fragment', props.get('description'));
                add('fragment', props.get('detail'));
            }
            if (props.has('placeHolder') || props.has('placeholder')) {
                add('prompt', props.get('placeHolder') ?? props.get('placeholder'));
            }
            if (props.has('title') && props.has('location')) {
                add('name', props.get('title'));
            } else if (props.has('title') && (props.has('placeHolder') || props.has('placeholder') || props.has('canPickMany'))) {
                add('label', props.get('title'));
            }
        }
        // `statusBar.text = …`, `view.title = …` and a quick pick's `picker.placeholder = …`.
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left)) {
            const property = node.left.name.text;
            const onQuickPick = ts.isIdentifier(node.left.expression) && resolver.quickPicks.has(node.left.expression.text);
            if (property === 'title' && onQuickPick) {
                add('label', node.right);
            } else if (property === 'text' || property === 'title') {
                add('name', node.right);
            } else if (property === 'placeholder' || property === 'placeHolder') {
                add('prompt', node.right);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return { texts: found, unresolved: resolver.unresolvedNodes.map(entry => ({ line: lineOf(entry.node), text: entry.text })) };
}

/** Lints one host source's microcopy (UX-P3.11b): every position of `hostTextsOf` by its kind, the prefix, and no U+2026. */
export function lintHostSource(file: string, source: string): Finding[] {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const findings: Finding[] = [];
    const visit = (node: ts.Node): void => {
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && node.getText(sf).includes('…')) {
            findings.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, kind: 'ellipsis', text: node.getText(sf).trim() });
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    const read = readHost(file, source);
    for (const { line, text } of read.unresolved) {
        findings.push({ file, line, kind: 'unclassified', text });
    }
    for (const { line, kind, text, prefixed } of read.texts) {
        if (!hostPasses[kind](text)) {
            findings.push({ file, line, kind, text });
        }
        if (prefixed === true && !text.startsWith(HOST_PREFIX)) {
            findings.push({ file, line, kind: 'prefix', text });
        }
    }
    return findings;
}

/** Every label a host source shows (Title Case positions only, codicons stripped): what DS-COPY-4's table is read against. */
export function hostLabelsOf(file: string, source: string): string[] {
    return hostTextsOf(file, source).filter(entry => entry.kind === 'label').map(entry => entry.text.replace(CODICON, ''));
}

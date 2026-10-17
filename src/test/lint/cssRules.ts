/**
 * A small CSS rule reader for the lint tests of the 2.0 stylesheets (`webview-stylesheets.test.ts`,
 * `webview-css-baseline.test.ts`). It lives outside a test file so that importing it does not register a suite twice.
 */
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

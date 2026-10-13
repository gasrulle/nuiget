import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-008: no colour literal outside `src/webview/shared/tokens.css`. A 2.0 webview file names a colour
 * through a `--nuiget-color-*` token, so that the themes of VS Code, high contrast and forced colours
 * are answered in one place. Test files are scanned too: a literal in a test is a literal in a snapshot
 * of what the product may render.
 */
const ROOTS = ['src/webview/shared', 'src/webview/main', 'src/webview/sidebar-next'];
const TOKENS = 'src/webview/shared/tokens.css';

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/;
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;

/** The lines of `text` that hold a hex colour or a colour function, as `line: text`. */
export function findColourLiterals(text: string): string[] {
    return text
        .split(/\r?\n/)
        .flatMap((line, index) => HEX.test(line) || COLOUR_FUNCTION.test(line) ? [`${index + 1}: ${line.trim()}`] : []);
}

function webviewFiles(): string[] {
    return ROOTS.flatMap(root => (readdirSync(root, { recursive: true }) as string[])
        .map(entry => path.posix.join(root, entry.split(path.sep).join('/')))
        .filter(file => /\.(?:css|ts|tsx)$/.test(file)))
        .sort();
}

describe('2.0 webview colours', () => {
    it('no colour literal outside tokens.css', () => {
        const found = webviewFiles()
            .filter(file => file !== TOKENS)
            .flatMap(file => findColourLiterals(readFileSync(file, 'utf8')).map(hit => `${file}:${hit}`));
        expect(found).toEqual([]);
    });

    it('the scan covers the 2.0 webview files', () => {
        // An empty or misplaced glob must not pass for want of files.
        const files = webviewFiles();
        expect(files).toContain(TOKENS);
        expect(files).toContain('src/webview/shared/primitives/icons.tsx');
        expect(files).toContain('src/webview/main/index.tsx');
        expect(files).toContain('src/webview/sidebar-next/index.tsx');
    });

    it('the scanner finds planted literals', () => {
        const sample = [
            'color: #fff;',
            'background: #A1B2C3D4;',
            'border-color: rgb(0 0 0);',
            'outline-color: hsla(0, 0%, 0%, 0.5);',
            "document.querySelector('#root')",
            "document.getElementById('#sidebar-root')",
            "document.getElementById('#abc-def')",
            'color: var(--nuiget-color-fg);',
        ].join('\n');
        expect(findColourLiterals(sample)).toEqual([
            '1: color: #fff;',
            '2: background: #A1B2C3D4;',
            '3: border-color: rgb(0 0 0);',
            '4: outline-color: hsla(0, 0%, 0%, 0.5);',
        ]);
    });
});

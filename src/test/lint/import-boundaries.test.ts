import { ESLint } from 'eslint';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const RULE = '@typescript-eslint/no-restricted-imports';

function valueImport(specifier: string): string {
    return `import { x } from '${specifier}';\nexport const y = x;\n`;
}

function typeImport(specifier: string): string {
    return `import type { X } from '${specifier}';\nexport type Y = X;\n`;
}

/** Messages of the import fence for `code` linted as if it were the file at `filePath`. */
async function fenceMessages(eslint: ESLint, filePath: string, code: string): Promise<string[]> {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.filter(message => message.ruleId === RULE).map(message => message.message);
}

describe('ESLint import fences (plan §3)', () => {
    let eslint: ESLint;

    beforeAll(async () => {
        expect(existsSync(path.join(REPO_ROOT, 'eslint.config.mjs'))).toBe(true);
        eslint = new ESLint({ cwd: REPO_ROOT });
        // The first lint loads the TypeScript parser; keep that cost out of the individual tests.
        await eslint.lintText('export const warmUp = 1;\n', { filePath: 'src/core/zz-probe.ts' });
    }, 60_000);

    describe('fences', () => {
        const denied: Array<[file: string, specifier: string]> = [
            ['src/core/zz-probe.ts', 'vscode'],
            ['src/core/zz-probe.ts', 'react'],
            ['src/core/zz-probe.ts', 'react-dom'],
            ['src/core/zz-probe.ts', '../host/x'],
            ['src/core/zz-probe.ts', '../extension'],
            ['src/core/zz-probe.ts', '../webview/main/x'],
            ['src/protocol/zz-probe.ts', 'vscode'],
            ['src/protocol/zz-probe.ts', '../webview/shared/x'],
            ['src/webview/sidebar/zz-probe.tsx', 'vscode'],
            ['src/webview/sidebar/zz-probe.tsx', '../../core/x'],
            ['src/webview/shared/zz-probe.ts', 'vscode'],
            ['src/webview/shared/zz-probe.ts', '../../core/x'],
            ['src/host/zz-probe.ts', 'react'],
            ['src/host/zz-probe.ts', 'react-dom'],
        ];

        it.each(denied)('%s may not import %s', async (file, specifier) => {
            expect(await fenceMessages(eslint, file, valueImport(specifier))).toHaveLength(1);
        });

        const allowed: Array<[file: string, specifier: string]> = [
            ['src/core/zz-probe.ts', '../protocol/domain'],
            ['src/core/zz-probe.ts', './util/events'],
            ['src/core/zz-probe.ts', 'node:fs'],
            ['src/webview/sidebar/zz-probe.tsx', 'react'],
            ['src/webview/sidebar/zz-probe.tsx', '../../protocol/x'],
            ['src/webview/sidebar/zz-probe.tsx', '../shared/primitives/icons'],
            ['src/webview/main/zz-probe.tsx', '../sidebar/x'],
            ['src/host/zz-probe.ts', 'vscode'],
            ['src/host/zz-probe.ts', '../core/x'],
            ['src/host/zz-probe.ts', '../protocol/x'],
        ];

        it.each(allowed)('%s may import %s', async (file, specifier) => {
            expect(await fenceMessages(eslint, file, valueImport(specifier))).toEqual([]);
        });

        it('lets core import vscode types but not vscode values', async () => {
            expect(await fenceMessages(eslint, 'src/core/zz-probe.ts', typeImport('vscode'))).toEqual([]);
            expect(await fenceMessages(eslint, 'src/core/zz-probe.ts', valueImport('vscode'))).toHaveLength(1);
        });

        it('gives 2.0 webview code no type exemption for vscode', async () => {
            expect(await fenceMessages(eslint, 'src/webview/shared/zz-probe.ts', typeImport('vscode'))).toHaveLength(1);
        });
    });
});

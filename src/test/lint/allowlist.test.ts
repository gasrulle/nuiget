import { ESLint, type Linter } from 'eslint';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createConfig, LEGACY_IMPORT_ALLOWLIST } from '../../../eslint.config.mjs';

const REPO_ROOT = process.cwd();
const RULE = '@typescript-eslint/no-restricted-imports';
const LEGACY_DENIAL = '2.0 code does not import 1.x code';
const TWO_POINT_OH_PREFIXES = [
    'src/core/',
    'src/protocol/',
    'src/host/',
    'src/webview/main/',
    'src/webview/sidebar-next/',
    'src/webview/shared/',
];

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

function isTwoPointOh(file: string): boolean {
    return file === 'src/extension.next.ts' || TWO_POINT_OH_PREFIXES.some(prefix => file.startsWith(prefix));
}

/** Why each allow-list entry should be removed; empty when every entry is still needed. */
async function staleEntries(entries: readonly string[], eslint: ESLint): Promise<string[]> {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
        if (seen.has(entry)) {
            problems.push(`${entry}: listed twice`);
            continue;
        }
        seen.add(entry);
        if (/[*?{}[\]\\]/.test(entry) || path.isAbsolute(entry) || entry.startsWith('.')) {
            problems.push(`${entry}: must be a repository-relative POSIX file path without globs`);
            continue;
        }
        if (!isTwoPointOh(entry)) {
            problems.push(`${entry}: is not 2.0 code, so it needs no entry`);
            continue;
        }
        const absolute = path.join(REPO_ROOT, entry);
        if (!existsSync(absolute)) {
            problems.push(`${entry}: does not exist`);
            continue;
        }
        // Linted at a sibling path that is not allow-listed: the 1.x denial must still fire.
        const extension = path.extname(entry);
        const sibling = `${path.posix.dirname(entry)}/__allowlist-probe__${extension}`;
        const messages = await fenceMessages(eslint, sibling, readFileSync(absolute, 'utf8'));
        if (!messages.some(message => message.includes(LEGACY_DENIAL))) {
            problems.push(`${entry}: no longer imports 1.x code`);
        }
    }
    return problems;
}

describe('ESLint import fences (plan §3)', () => {
    let eslint: ESLint;

    beforeAll(async () => {
        expect(existsSync(path.join(REPO_ROOT, 'eslint.config.mjs'))).toBe(true);
        eslint = new ESLint({ cwd: REPO_ROOT });
        // The first lint loads the TypeScript parser; keep that cost out of the individual tests.
        await eslint.lintText('export const warmUp = 1;\n', { filePath: 'src/core/zz-probe.ts' });
    }, 60_000);

    describe('LEGACY_IMPORT_ALLOWLIST is self-pruning', () => {
        it('has no entry that is stale, misplaced or malformed', async () => {
            expect(await staleEntries(LEGACY_IMPORT_ALLOWLIST, eslint)).toEqual([]);
        });

        it('reports an entry that no longer imports 1.x code', async () => {
            expect(await staleEntries(['src/webview/main/index.tsx'], eslint)).toEqual([
                'src/webview/main/index.tsx: no longer imports 1.x code',
            ]);
        });

        it('reports missing, legacy, duplicated and malformed entries', async () => {
            const problems = await staleEntries(
                [
                    'src/core/does-not-exist.ts',
                    'src/services/NuGetService.ts',
                    'src/core/*.ts',
                    './src/core/x.ts',
                    'src/core/does-not-exist.ts',
                ],
                eslint,
            );

            expect(problems).toEqual([
                'src/core/does-not-exist.ts: does not exist',
                'src/services/NuGetService.ts: is not 2.0 code, so it needs no entry',
                'src/core/*.ts: must be a repository-relative POSIX file path without globs',
                './src/core/x.ts: must be a repository-relative POSIX file path without globs',
                'src/core/does-not-exist.ts: listed twice',
            ]);
        });
    });

    describe('an allow-listed file', () => {
        let withEntry: ESLint;

        beforeAll(() => {
            withEntry = new ESLint({
                cwd: REPO_ROOT,
                overrideConfigFile: true,
                overrideConfig: createConfig(['src/core/zz-probe.ts']) as Linter.Config[],
            });
        });

        it('may import 1.x code', async () => {
            expect(await fenceMessages(withEntry, 'src/core/zz-probe.ts', valueImport('../services/NuGetService'))).toEqual([]);
        });

        it('keeps every other denial of its layer', async () => {
            expect(await fenceMessages(withEntry, 'src/core/zz-probe.ts', valueImport('vscode'))).toHaveLength(1);
            expect(await fenceMessages(withEntry, 'src/core/zz-probe.ts', valueImport('../host/x'))).toHaveLength(1);
        });

        it('does not open the fence for its neighbours', async () => {
            expect(await fenceMessages(withEntry, 'src/core/other.ts', valueImport('../services/NuGetService'))).toHaveLength(1);
        });
    });

    describe('fences', () => {
        const denied: Array<[file: string, specifier: string]> = [
            ['src/core/zz-probe.ts', 'vscode'],
            ['src/core/zz-probe.ts', 'react'],
            ['src/core/zz-probe.ts', 'react-dom'],
            ['src/core/zz-probe.ts', '../host/x'],
            ['src/core/zz-probe.ts', '../extension'],
            ['src/core/zz-probe.ts', '../extension.next'],
            ['src/core/zz-probe.ts', '../services/NuGetService'],
            ['src/core/zz-probe.ts', '../webview/main/x'],
            ['src/core/nested/zz-probe.ts', '../../services/NuGetService'],
            ['src/protocol/zz-probe.ts', 'vscode'],
            ['src/protocol/zz-probe.ts', '../webview/shared/x'],
            ['src/webview/sidebar-next/zz-probe.tsx', 'vscode'],
            ['src/webview/sidebar-next/zz-probe.tsx', '../../core/x'],
            ['src/webview/sidebar-next/zz-probe.tsx', '../../services/x'],
            ['src/webview/sidebar-next/zz-probe.tsx', '../app/x'],
            ['src/webview/sidebar-next/zz-probe.tsx', '../sidebar/SidebarApp'],
            ['src/webview/sidebar-next/zz-probe.tsx', '../NuGetPanel'],
            ['src/webview/main/components/zz-probe.tsx', '../../app/icons'],
            ['src/webview/main/components/zz-probe.tsx', '../../NuGetSidebarPanel'],
            ['src/webview/shared/zz-probe.ts', 'vscode'],
            ['src/webview/shared/zz-probe.ts', '../../core/x'],
            ['src/webview/shared/zz-probe.ts', '../app'],
            ['src/host/zz-probe.ts', 'react'],
            ['src/host/zz-probe.ts', 'react-dom'],
            ['src/host/zz-probe.ts', '../services/x'],
            ['src/host/zz-probe.ts', '../webview/NuGetPanel'],
            ['src/extension.next.ts', './services/NuGetService'],
            ['src/extension.next.ts', './webview/NuGetPanel'],
            ['src/extension.next.ts', './webview/app/App'],
        ];

        it.each(denied)('%s may not import %s', async (file, specifier) => {
            expect(await fenceMessages(eslint, file, valueImport(specifier))).toHaveLength(1);
        });

        const allowed: Array<[file: string, specifier: string]> = [
            ['src/core/zz-probe.ts', '../protocol/domain'],
            ['src/core/zz-probe.ts', './util/events'],
            ['src/core/zz-probe.ts', 'node:fs'],
            ['src/webview/sidebar-next/zz-probe.tsx', 'react'],
            ['src/webview/sidebar-next/zz-probe.tsx', '../../protocol/x'],
            ['src/webview/sidebar-next/zz-probe.tsx', '../shared/primitives/icons'],
            ['src/webview/main/zz-probe.tsx', '../sidebar-next/x'],
            ['src/host/zz-probe.ts', 'vscode'],
            ['src/host/zz-probe.ts', '../core/x'],
            ['src/host/zz-probe.ts', '../protocol/x'],
            ['src/extension.next.ts', 'vscode'],
            ['src/extension.next.ts', './core/x'],
            ['src/extension.next.ts', './host/x'],
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

        it('names the allow-list in the 1.x denial', async () => {
            const [message] = await fenceMessages(eslint, 'src/host/zz-probe.ts', valueImport('../services/x'));

            expect(message).toContain(LEGACY_DENIAL);
            expect(message).toContain('LEGACY_IMPORT_ALLOWLIST');
        });

        const legacy: Array<[file: string, specifier: string]> = [
            ['src/services/zz-probe.ts', 'vscode'],
            ['src/services/zz-probe.ts', './NuGetService'],
            ['src/webview/app/zz-probe.tsx', '../../services/x'],
            ['src/webview/sidebar/zz-probe.tsx', '../app/icons'],
            ['src/webview/NuGetProbe.ts', './NuGetPanel'],
            ['src/webview/NuGetProbe.ts', '../services/x'],
            ['src/extension.ts', './services/NuGetService'],
        ];

        it.each(legacy)('leaves 1.x file %s free to import %s', async (file, specifier) => {
            expect(await fenceMessages(eslint, file, valueImport(specifier))).toEqual([]);
        });
    });
});

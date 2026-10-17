import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFiles, isAllowed, requiredFiles } from '../../../scripts/check-vsix-contents.mjs';

const manifest = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

const SHIPPED = [
    'package.json',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'dist/extension.js',
    'dist/webview.js',
    'dist/webview.css',
    'dist/sidebar.js',
    'dist/sidebar.css',
    'resources/icon.png',
    'resources/beaker-filled.svg',
    'resources/beaker-filled-light.svg',
    'resources/sidebar-icon.svg',
    'resources/tab-icon.png',
    'resources/package-icon.png',
];

describe('VSIX contents check', () => {
    describe('allow-list', () => {
        it.each(SHIPPED)('allows %s', file => {
            expect(isAllowed(file)).toBe(true);
        });

        it.each([
            'src/extension.ts',
            'src/_wip/draft.ts',
            'scripts/hooks/guard.mjs',
            'docs/adr/README.md',
            'ARCHITECTURE.md',
            'CLAUDE.md',
            '.claude/settings.json',
            '.mcp.json',
            '.nvmrc',
            '.editorconfig',
            '.vscode-test.mjs',
            'tsconfig.test.json',
            'dist/extension.js.map',
            'dist/extension.meta.json',
            'dist/nested/chunk.js',
            'out/esbuild/extension.meta.json',
            'node_modules/react/index.js',
        ])('rejects %s', file => {
            expect(isAllowed(file)).toBe(false);
        });

        it('normalizes Windows separators and a leading ./', () => {
            expect(isAllowed('dist\\extension.js')).toBe(true);
            expect(isAllowed('./resources/icon.png')).toBe(true);
            expect(isAllowed('src\\extension.ts')).toBe(false);
        });
    });

    describe('required files', () => {
        it('derives the entry point and every icon file from the manifest', () => {
            expect(requiredFiles(manifest)).toEqual([...SHIPPED].sort());
        });

        it('ignores codicon references and reads light and dark icon objects', () => {
            const required = requiredFiles({
                main: './dist/extension',
                contributes: {
                    commands: [
                        { command: 'a', icon: '$(refresh)' },
                        { command: 'b', icon: { light: 'resources/light.svg', dark: './resources/dark.svg' } },
                    ],
                },
            });

            expect(required).toContain('dist/extension.js');
            expect(required).toContain('resources/light.svg');
            expect(required).toContain('resources/dark.svg');
            expect(required.some(file => file.includes('$('))).toBe(false);
        });
    });

    describe('checkFiles', () => {
        it('accepts the expected file list', () => {
            expect(checkFiles(SHIPPED, manifest)).toMatchObject({ offenders: [], missing: [] });
        });

        it('reports files that must not ship', () => {
            const result = checkFiles([...SHIPPED, '.nvmrc', 'tsconfig.test.json', 'dist/extension.meta.json'], manifest);

            expect(result.offenders).toEqual(['.nvmrc', 'dist/extension.meta.json', 'tsconfig.test.json']);
            expect(result.missing).toEqual([]);
        });

        it('reports required files that are absent', () => {
            const withoutBundle = SHIPPED.filter(file => file !== 'dist/sidebar.css' && file !== 'resources/icon.png');

            expect(checkFiles(withoutBundle, manifest).missing).toEqual(['dist/sidebar.css', 'resources/icon.png']);
        });
    });
});

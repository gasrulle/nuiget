import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CORE_BOUNDARY_MESSAGE = 'core and protocol stay platform-agnostic: no host, extension, webview, React or vscode values; inject adapters (see src/core/contracts.ts)';
const WEBVIEW_BOUNDARY_MESSAGE = '2.0 webview code depends only on src/protocol and other 2.0 webview modules; talk to the host through the message bus';
const HOST_BOUNDARY_MESSAGE = 'host code adapts VS Code to src/core; it renders no UI';
const LEGACY_BOUNDARY_MESSAGE = '2.0 code does not import 1.x code; port what is needed, or add the file to LEGACY_IMPORT_ALLOWLIST in eslint.config.mjs';

/**
 * 2.0 files that may import 1.x code. Repository-relative POSIX file paths, no globs.
 * src/test/lint/allowlist.test.ts fails for an entry that is missing, is not 2.0 code or no longer
 * imports 1.x code, so the list empties itself as the legacy code is replaced.
 */
export const LEGACY_IMPORT_ALLOWLIST = [];

const LEGACY_PATTERNS = ['**/services/**', '**/webview/app/**', '**/webview/sidebar/**', '**/webview/NuGet*'];

// A 2.0 webview file reaches its 1.x siblings without naming the webview folder ('../app/x'), which the
// patterns above do not match. The NuGet*.ts hosts sit one to three levels up from any 2.0 webview file.
const LEGACY_WEBVIEW_SIBLING_PATTERNS = ['**/app', '**/app/**', '**/sidebar', '**/sidebar/**', '../NuGet*', '../../NuGet*', '../../../NuGet*'];

// One entry per 2.0 layer (plan §3). `owns` decides which layer an allow-listed file belongs to.
const LAYERS = [
    {
        files: ['src/core/**/*.ts', 'src/protocol/**/*.ts'],
        owns: (file) => file.startsWith('src/core/') || file.startsWith('src/protocol/'),
        paths: [
            { name: 'react', message: CORE_BOUNDARY_MESSAGE },
            { name: 'react-dom', message: CORE_BOUNDARY_MESSAGE },
            { name: 'vscode', message: CORE_BOUNDARY_MESSAGE, allowTypeImports: true },
        ],
        patterns: [{ group: ['**/host/**', '**/extension*', '**/webview/**'], message: CORE_BOUNDARY_MESSAGE }],
        legacyPatterns: LEGACY_PATTERNS,
    },
    {
        files: ['src/webview/main/**/*.{ts,tsx}', 'src/webview/sidebar-next/**/*.{ts,tsx}', 'src/webview/shared/**/*.{ts,tsx}'],
        owns: (file) => ['src/webview/main/', 'src/webview/sidebar-next/', 'src/webview/shared/'].some((prefix) => file.startsWith(prefix)),
        paths: [{ name: 'vscode', message: WEBVIEW_BOUNDARY_MESSAGE }],
        patterns: [{ group: ['**/core/**'], message: WEBVIEW_BOUNDARY_MESSAGE }],
        legacyPatterns: [...LEGACY_PATTERNS, ...LEGACY_WEBVIEW_SIBLING_PATTERNS],
    },
    {
        files: ['src/host/**/*.ts'],
        owns: (file) => file.startsWith('src/host/'),
        paths: [
            { name: 'react', message: HOST_BOUNDARY_MESSAGE },
            { name: 'react-dom', message: HOST_BOUNDARY_MESSAGE },
        ],
        patterns: [],
        legacyPatterns: LEGACY_PATTERNS,
    },
    {
        files: ['src/extension.next.ts'],
        owns: (file) => file === 'src/extension.next.ts',
        paths: [],
        patterns: [],
        legacyPatterns: LEGACY_PATTERNS,
    },
];

// Flat config replaces rule options instead of merging them, so each file gets exactly one fence.
function fence(files, paths, patterns) {
    return {
        files,
        rules: {
            '@typescript-eslint/no-restricted-imports': ['error', { paths, patterns }],
        },
    };
}

/** The fences, followed by the variants for allow-listed files, which drop only the 1.x denial. */
function boundaryConfigs(allowlist) {
    const fences = LAYERS.map(({ files, paths, patterns, legacyPatterns }) =>
        fence(files, paths, [...patterns, { group: legacyPatterns, message: LEGACY_BOUNDARY_MESSAGE }]),
    );
    const variants = LAYERS.map((layer) => ({ layer, files: allowlist.filter((file) => layer.owns(file)) }))
        .filter(({ files }) => files.length > 0)
        .map(({ layer, files }) => fence(files, layer.paths, layer.patterns));
    return [...fences, ...variants];
}

/** Builds the configuration for a given allow-list; the lint test uses it to check the mechanism. */
export function createConfig(allowlist) {
    return tseslint.config(
        eslint.configs.recommended,
        ...tseslint.configs.recommended,
        {
            languageOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                globals: {
                    ...globals.node,
                    ...globals.browser,
                },
                parserOptions: {
                    tsconfigRootDir: __dirname,
                },
            },
            plugins: {
                'react-hooks': reactHooks,
            },
            rules: {
                '@typescript-eslint/naming-convention': 'off', // Too strict for React components and API responses
                '@typescript-eslint/no-explicit-any': 'warn',
                '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
                '@typescript-eslint/no-non-null-assertion': 'warn',
                'curly': 'error',
                'eqeqeq': 'error',
                'no-throw-literal': 'error',
                'semi': 'error',
                'prefer-const': 'error',
                'no-console': ['warn', { allow: ['warn', 'error'] }],
                'react-hooks/rules-of-hooks': 'error',
                'react-hooks/exhaustive-deps': 'error',
            },
        },
        {
            files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test/**/*.ts', 'src/test/**/*.tsx'],
            rules: {
                '@typescript-eslint/no-explicit-any': 'off',
                '@typescript-eslint/no-non-null-assertion': 'off',
            },
        },
        {
            // E2E (Mocha), UI (ExTester/Chai), and benchmark tests use assertion styles and scaffolded imports
            files: ['src/test/e2e/**/*.ts', 'src/test/ui/**/*.ts', 'src/test/benchmarks/**/*.ts'],
            rules: {
                '@typescript-eslint/no-unused-expressions': 'off',
                '@typescript-eslint/no-require-imports': 'off',
                '@typescript-eslint/no-unused-vars': 'off',
            },
        },
        {
            // Build and maintenance scripts are command-line programs; stdout is their user interface.
            files: ['scripts/**/*.{js,mjs}', 'esbuild.mjs'],
            rules: {
                'no-console': 'off',
            },
        },
        ...boundaryConfigs(allowlist),
        {
            ignores: ['out/**', 'dist/**', '.vscode-test/**', 'src/_wip/**', '**/*.d.ts'],
        },
    );
}

export default createConfig(LEGACY_IMPORT_ALLOWLIST);

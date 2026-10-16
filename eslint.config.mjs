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

// One entry per 2.0 layer (plan §3).
const LAYERS = [
    {
        files: ['src/core/**/*.ts', 'src/protocol/**/*.ts'],
        paths: [
            { name: 'react', message: CORE_BOUNDARY_MESSAGE },
            { name: 'react-dom', message: CORE_BOUNDARY_MESSAGE },
            { name: 'vscode', message: CORE_BOUNDARY_MESSAGE, allowTypeImports: true },
        ],
        patterns: [{ group: ['**/host/**', '**/extension*', '**/webview/**'], message: CORE_BOUNDARY_MESSAGE }],
    },
    {
        files: ['src/webview/**/*.{ts,tsx}'],
        paths: [{ name: 'vscode', message: WEBVIEW_BOUNDARY_MESSAGE }],
        patterns: [{ group: ['**/core/**'], message: WEBVIEW_BOUNDARY_MESSAGE }],
    },
    {
        files: ['src/host/**/*.ts'],
        paths: [
            { name: 'react', message: HOST_BOUNDARY_MESSAGE },
            { name: 'react-dom', message: HOST_BOUNDARY_MESSAGE },
        ],
        patterns: [],
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

/** One fence per layer. */
function boundaryConfigs() {
    return LAYERS.map(({ files, paths, patterns }) => fence(files, paths, patterns));
}

/** Builds the ESLint configuration. */
function createConfig() {
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
            files: ['src/test/e2e/**/*.ts', 'src/test/ui/**/*.ts', 'src/test/benchmarks/**/*.ts', 'src/**/*.bench.ts'],
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
        ...boundaryConfigs(),
        {
            ignores: ['out/**', 'dist/**', '.vscode-test/**', 'src/_wip/**', '**/*.d.ts'],
        },
    );
}

export default createConfig();

import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
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
        ignores: ['out/**', 'dist/**', '**/*.d.ts'],
    }
);

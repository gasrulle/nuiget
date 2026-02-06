import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
        rules: {
            '@typescript-eslint/naming-convention': 'off', // Too strict for React components and API responses
            '@typescript-eslint/no-explicit-any': 'off', // NuGet APIs have varying response formats
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'curly': 'warn',
            'eqeqeq': 'warn',
            'no-throw-literal': 'warn',
            'semi': 'warn',
            'prefer-const': 'warn',
        },
    },
    {
        ignores: ['out/**', 'dist/**', '**/*.d.ts'],
    }
);

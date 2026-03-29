import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            vscode: resolve(__dirname, 'src/test/__mocks__/vscode.ts'),
        },
    },
    test: {
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', ['json-summary', { file: 'coverage-summary.json' }], 'lcov', 'html'],
            reportsDirectory: 'coverage',
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/test/**',
                'src/global.d.ts',
                'src/extension.ts',
                'src/services/NuGetTypes.ts',
                'src/webview/app/index.tsx',
                'src/webview/sidebar/index.tsx',
            ],
            thresholds: {
                statements: 65,
                branches: 50,
                functions: 55,
                lines: 65,
            },
        },
        include: [],
        exclude: ['node_modules', 'dist', 'out', '.vscode-test'],
        projects: [
            {
                extends: true,
                test: {
                    name: 'backend',
                    environment: 'node',
                    include: ['src/services/**/*.test.ts', 'src/extension.test.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'frontend',
                    environment: 'jsdom',
                    include: ['src/webview/**/*.test.{ts,tsx}'],
                    setupFiles: ['src/test/setup-frontend.ts'],
                },
            },
        ],
    },
});

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            vscode: resolve(__dirname, 'src/test/__mocks__/vscode.ts'),
        },
    },
    test: {
        globals: true,
        benchmark: {
            include: ['src/**/*.bench.ts', 'src/test/benchmarks/benchmark.test.ts'],
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', ['json-summary', { file: 'coverage-summary.json' }], 'lcov', 'html'],
            reportsDirectory: 'coverage',
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/test/**',
                'src/_wip/**',
                'src/**/__fixtures__/**',
                'src/**/*.bench.ts',
                // Type-only contract modules have nothing to execute.
                'src/protocol/**',
                'src/core/contracts.ts',
                'src/global.d.ts',
            ],
            thresholds: {
                statements: 90,
                branches: 80,
                functions: 85,
                lines: 90,
                // Ratchet for the webviews at the values measured at P8.2b (2.0 only since then), floored; raise, never lower.
                'src/webview/**': {
                    statements: 95,
                    branches: 88,
                    functions: 92,
                    lines: 95,
                },
                // Floor for the 2.0 core (plan P1.2 and the P1 gate). It applies to all of src/core together.
                'src/core/**': {
                    lines: 85,
                },
                // Ratchet for the 2.0 host (P5.10, from the P4 review): the measured lines of src/host, floored.
                'src/host/**': { lines: 87 },
            },
        },
        include: [],
        exclude: ['node_modules', 'dist', 'out', '.vscode-test', 'src/_wip/**'],
        projects: [
            {
                extends: true,
                test: {
                    name: 'backend',
                    environment: 'node',
                    include: [
                        'src/core/**/*.test.ts',
                        'src/protocol/**/*.test.ts',
                        'src/host/**/*.test.ts',
                        'src/extension.test.ts',
                        'src/test/lint/**/*.test.ts',
                    ],
                },
            },
            {
                extends: true,
                test: {
                    name: 'frontend',
                    environment: 'jsdom',
                    include: ['src/webview/**/*.test.{ts,tsx}'],
                    setupFiles: ['src/test/setup-frontend.ts'],
                    globalSetup: ['src/test/axeCoverage.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'integration',
                    environment: 'node',
                    include: ['src/test/harness/**/*.test.ts'],
                    testTimeout: 30_000,
                },
            },
        ],
    },
});

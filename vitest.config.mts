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
                // Ratchet for the webviews at the values measured on 2026-10-12 (plan P0.11); raise, never lower.
                'src/webview/**': {
                    statements: 62,
                    branches: 52,
                    functions: 54,
                    lines: 64,
                },
                // Floor for the 2.0 webviews (P3.6), like the core floor; the aggregate above is diluted by the 1.x
                // code until P8.2.
                'src/webview/{shared,main,sidebar-next}/**': { lines: 85 },
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
                        'src/services/**/*.test.ts',
                        'src/core/**/*.test.ts',
                        'src/protocol/**/*.test.ts',
                        'src/host/**/*.test.ts',
                        'src/extension.next.test.ts',
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
                },
            },
            {
                extends: true,
                test: {
                    name: 'integration',
                    environment: 'node',
                    include: ['src/test/integration/**/*.integration.test.ts', 'src/test/harness/**/*.test.ts'],
                    testTimeout: 30_000,
                },
            },
        ],
    },
});

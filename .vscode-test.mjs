// @ts-check
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    files: 'out/test/e2e/**/*.e2e.test.js',
    // CI runs this for the minimum supported VS Code (engines.vscode) and for current stable.
    version: process.env.VSCODE_TEST_VERSION ?? 'stable',
    workspaceFolder: 'src/test/e2e/fixtures/e2e-workspace',
    mocha: {
        timeout: 60_000,
        ui: 'tdd',
        color: true,
    },
    launchArgs: [
        '--disable-extensions',
    ],
});

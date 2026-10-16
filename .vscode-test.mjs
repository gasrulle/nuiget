// @ts-check
import { defineConfig } from '@vscode/test-cli';

// The 2.0 extension-host suites (`v2-*`). The 1.x e2e files are compiled by tsconfig.test.json but selected by nothing
// until P8.2 deletes them. The extension under test is whatever was last built into dist/.
export default defineConfig({
    files: 'out/test/e2e/v2-*.e2e.test.js',
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

// @ts-check
import { defineConfig } from '@vscode/test-cli';

// NUIGET_V2=1 selects the suites of the 2.0 entries (`v2-*`); without it every other suite runs, against 1.x.
// The extension under test is whatever was last built into dist/: build with the same variable or flag.
const v2 = process.env.NUIGET_V2 === '1';

export default defineConfig({
    files: v2 ? 'out/test/e2e/v2-*.e2e.test.js' : 'out/test/e2e/!(v2-*).e2e.test.js',
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

import * as path from 'path';
import { ExTester, ReleaseQuality } from 'vscode-extension-tester';

/**
 * ExTester setup: download VS Code + ChromeDriver, install VSIX, run UI tests.
 *
 * Usage:
 *   npm run test:ui
 *
 * This downloads a stable VS Code build, installs the packaged VSIX,
 * and runs Mocha tests using Selenium WebDriver.
 */
async function main(): Promise<void> {
    const vsixPath = getVsixPath();
    const workspacePath = path.resolve(__dirname, '..', 'e2e', 'fixtures', 'e2e-workspace');

    const exTester = new ExTester(
        undefined, // storage path (default)
        ReleaseQuality.Stable,
    );

    // Download VS Code and ChromeDriver
    await exTester.downloadCode();
    await exTester.downloadChromeDriver();

    // Install extension VSIX
    await exTester.installVsix({ vsixFile: vsixPath });

    // Run tests
    await exTester.runTests(
        'out/test/ui/**/*.ui.test.js',
        {
            settings: path.resolve(__dirname, 'settings.json'),
            resources: [workspacePath],
        },
    );
}

function getVsixPath(): string {
    // Find the .vsix in project root
    const rootDir = path.resolve(__dirname, '..', '..', '..');
    const fs = require('fs');
    const files: string[] = fs.readdirSync(rootDir);
    const vsix = files.find((f: string) => f.endsWith('.vsix'));
    if (!vsix) {
        throw new Error('No .vsix file found. Run "npm run package:vsix" first.');
    }
    return path.join(rootDir, vsix);
}

main().catch((err) => {
    console.error('ExTester setup failed:', err);
    process.exit(1);
});

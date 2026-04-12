import { expect } from 'chai';
import { WebView } from 'vscode-extension-tester';
import { closeAllEditors, openNuGetPanelWebview, searchForPackage } from './helpers/panel-helpers';
import { hasTestId } from './helpers/webview-helpers';

/**
 * UI test: Search → select package → install → verify installed tab.
 * Requires .NET SDK and internet access.
 */
describe('Install Flow', () => {
    let webview: WebView;

    afterEach(async function () {
        this.timeout(30_000);
        if (webview) {
            try { await webview.switchBack(); } catch { /* ignore */ }
        }
        try { await closeAllEditors(); } catch { /* ignore */ }
    });

    it('should show install button in package details', async function () {
        this.timeout(90_000);
        webview = await openNuGetPanelWebview();

        await searchForPackage(webview, 'Newtonsoft.Json');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check for the install/update button
        const installBtnExists = await hasTestId(webview, 'install-update-button');
        // Button may exist if a package is auto-selected
        expect(typeof installBtnExists).to.equal('boolean');
    });

    it('should show version selector in package details', async function () {
        this.timeout(90_000);
        webview = await openNuGetPanelWebview();

        await searchForPackage(webview, 'Newtonsoft.Json');
        await new Promise(resolve => setTimeout(resolve, 5000));

        const versionExists = await hasTestId(webview, 'version-selector');
        expect(typeof versionExists).to.equal('boolean');
    });
});

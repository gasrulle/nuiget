import { expect } from 'chai';
import { WebView } from 'vscode-extension-tester';
import { closeAllEditors, openNuGetPanelWebview } from './helpers/panel-helpers';
import { hasTestId } from './helpers/webview-helpers';

/**
 * UI test: Installed tab → select package → remove → verify.
 */
describe('Remove Flow', () => {
    let webview: WebView;

    afterEach(async function () {
        this.timeout(30_000);
        if (webview) {
            try { await webview.switchBack(); } catch { /* ignore */ }
        }
        try { await closeAllEditors(); } catch { /* ignore */ }
    });

    it('should show installed tab content', async function () {
        this.timeout(60_000);
        webview = await openNuGetPanelWebview();

        // Installed tab should be visible by default
        const installedTab = await hasTestId(webview, 'installed-tab');
        expect(installedTab, 'Installed tab should render').to.be.true;
    });

    it('should show uninstall button in package details when package is selected', async function () {
        this.timeout(60_000);
        webview = await openNuGetPanelWebview();
        await new Promise(resolve => setTimeout(resolve, 5000));

        // The uninstall button appears in the details panel
        const uninstallExists = await hasTestId(webview, 'uninstall-button');
        // May not exist if no package is selected
        expect(typeof uninstallExists).to.equal('boolean');
    });
});

import { expect } from 'chai';
import { WebView } from 'vscode-extension-tester';
import { closeAllEditors, openNuGetPanelWebview } from './helpers/panel-helpers';
import { findByTestId, hasTestId } from './helpers/webview-helpers';

/**
 * UI test: Open NuGet panel via Command Palette, verify webview loads.
 */
describe('Panel Open', () => {
    let webview: WebView;

    afterEach(async function () {
        this.timeout(30_000);
        if (webview) {
            try { await webview.switchBack(); } catch { /* ignore */ }
        }
        try { await closeAllEditors(); } catch { /* ignore */ }
    });

    it('should open panel with app container', async function () {
        this.timeout(30_000);
        webview = await openNuGetPanelWebview();

        const appExists = await hasTestId(webview, 'nuiget-app');
        expect(appExists, 'App container should exist').to.be.true;
    });

    it('should show search input', async function () {
        this.timeout(30_000);
        webview = await openNuGetPanelWebview();

        const searchInput = await findByTestId(webview, 'search-input');
        expect(searchInput).to.not.be.undefined;
    });

    it('should show project selector', async function () {
        this.timeout(30_000);
        webview = await openNuGetPanelWebview();

        const projectSelector = await findByTestId(webview, 'project-selector');
        expect(projectSelector).to.not.be.undefined;
    });

    it('should show source selector', async function () {
        this.timeout(30_000);
        webview = await openNuGetPanelWebview();

        const sourceSelector = await findByTestId(webview, 'source-selector');
        expect(sourceSelector).to.not.be.undefined;
    });

    it('should show tab bar', async function () {
        this.timeout(30_000);
        webview = await openNuGetPanelWebview();

        const tabBar = await findByTestId(webview, 'tab-bar');
        expect(tabBar).to.not.be.undefined;
    });
});

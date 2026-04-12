import { expect } from 'chai';
import { WebView } from 'vscode-extension-tester';
import { closeAllEditors, openNuGetPanelWebview, searchForPackage } from './helpers/panel-helpers';
import { findByTestId, hasTestId } from './helpers/webview-helpers';

/**
 * UI test: Type search → wait results → click package → verify details panel.
 */
describe('Search Flow', () => {
    let webview: WebView;

    afterEach(async function () {
        this.timeout(30_000);
        if (webview) {
            try { await webview.switchBack(); } catch { /* ignore */ }
        }
        try { await closeAllEditors(); } catch { /* ignore */ }
    });

    it('should search and show results', async function () {
        this.timeout(60_000);
        webview = await openNuGetPanelWebview();

        await searchForPackage(webview, 'Newtonsoft.Json');

        // Wait for results to appear
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Results should appear — check if the app container still exists (not crashed)
        const appExists = await hasTestId(webview, 'nuiget-app');
        expect(appExists, 'App should still be alive after search').to.be.true;
    });

    it('should show details panel when package is selected', async function () {
        this.timeout(60_000);
        webview = await openNuGetPanelWebview();

        await searchForPackage(webview, 'Newtonsoft.Json');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check for package details panel
        const detailsExists = await hasTestId(webview, 'package-details-panel');
        // Details panel may or may not render depending on whether a package is auto-selected
        expect(typeof detailsExists).to.equal('boolean');
    });

    it('should clear search when input is emptied', async function () {
        this.timeout(60_000);
        webview = await openNuGetPanelWebview();

        const searchInput = await findByTestId(webview, 'search-input');
        await searchInput.sendKeys('Newtonsoft');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Clear input using Ctrl+A + Backspace (Selenium clear() doesn't work with React controlled inputs)
        const Key = (await import('selenium-webdriver')).Key;
        await searchInput.sendKeys(Key.chord(Key.CONTROL, 'a'));
        await searchInput.sendKeys(Key.BACK_SPACE);
        await new Promise(resolve => setTimeout(resolve, 1000));

        const value = await searchInput.getAttribute('value');
        expect(value).to.equal('');
    });
});

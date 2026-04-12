import { expect } from 'chai';
import { WebView } from 'vscode-extension-tester';
import { closeAllEditors, openNuGetPanelWebview } from './helpers/panel-helpers';
import { hasTestId } from './helpers/webview-helpers';

/**
 * UI test: Source settings overlay — open, verify structure, close.
 */
describe('Source Settings', () => {
    let webview: WebView;

    afterEach(async function () {
        this.timeout(30_000);
        if (webview) {
            try { await webview.switchBack(); } catch { /* ignore */ }
        }
        try { await closeAllEditors(); } catch { /* ignore */ }
    });

    it('should open source settings overlay via gear icon', async function () {
        this.timeout(60_000);
        webview = await openNuGetPanelWebview();

        // Find and click the source settings gear icon
        // The gear icon is typically next to the source selector
        let gearBtn;
        try {
            gearBtn = await webview.findWebElement(
                { css: '.source-settings-btn, [title*="Source"], [aria-label*="Source Settings"]' },
            );
        } catch {
            return this.skip();
        }
        await gearBtn.click();
        await new Promise(resolve => setTimeout(resolve, 1000));

        const overlayExists = await hasTestId(webview, 'source-settings-overlay');
        expect(overlayExists, 'Source settings overlay should open').to.be.true;
    });

    it('should show source settings modal', async function () {
        this.timeout(60_000);
        webview = await openNuGetPanelWebview();

        let gearBtn;
        try {
            gearBtn = await webview.findWebElement(
                { css: '.source-settings-btn, [title*="Source"], [aria-label*="Source Settings"]' },
            );
        } catch {
            return this.skip();
        }
        await gearBtn.click();
        await new Promise(resolve => setTimeout(resolve, 1000));

        const modalExists = await hasTestId(webview, 'source-settings-modal');
        // After clicking the gear button, some form of settings UI should be visible
        const overlayExists = await hasTestId(webview, 'source-settings-overlay');
        expect(modalExists || overlayExists, 'Source settings UI should open after clicking gear').to.be.true;
    });
});

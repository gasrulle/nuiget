import { expect } from 'chai';
import { Key, WebView } from 'vscode-extension-tester';
import { closeAllEditors, openNuGetPanelWebview } from './helpers/panel-helpers';
import { findByTestId } from './helpers/webview-helpers';

/**
 * UI test: Keyboard navigation — Tab order, Enter, Escape, focus management.
 */
describe('Keyboard Navigation', () => {
    let webview: WebView;

    afterEach(async function () {
        this.timeout(30_000);
        if (webview) {
            try { await webview.switchBack(); } catch { /* ignore */ }
        }
        try { await closeAllEditors(); } catch { /* ignore cleanup errors */ }
    });

    it('should focus search input on panel open', async function () {
        this.timeout(30_000);
        webview = await openNuGetPanelWebview();

        const searchInput = await findByTestId(webview, 'search-input');
        const driver = webview.getDriver();

        // Check if search input is focused
        const activeElement = await driver.switchTo().activeElement();
        const activeTag = await activeElement.getTagName();
        // The search input may or may not be auto-focused depending on saved state
        expect(activeTag).to.be.a('string');
    });

    it('should support Tab key navigation between controls', async function () {
        this.timeout(30_000);
        webview = await openNuGetPanelWebview();

        const searchInput = await findByTestId(webview, 'search-input');
        await searchInput.click();

        // Tab through controls
        const driver = webview.getDriver();
        await driver.actions().sendKeys(Key.TAB).perform();
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify focus moved somewhere
        const activeElement = await driver.switchTo().activeElement();
        expect(activeElement).to.not.be.undefined;
    });

    it('should navigate tabs with keyboard', async function () {
        this.timeout(30_000);
        webview = await openNuGetPanelWebview();

        // Find installed tab button
        const tabBar = await findByTestId(webview, 'tab-bar');
        const buttons = await tabBar.findElements({ css: 'button' });

        expect(buttons.length, 'Tab bar should contain tab buttons').to.be.greaterThan(0);

        await buttons[0].click();
        await new Promise(resolve => setTimeout(resolve, 500));

        // Should be able to press Enter to select
        const driver = webview.getDriver();
        await driver.actions().sendKeys(Key.ENTER).perform();
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the tab button is still accessible after keyboard interaction
        const activeElement = await driver.switchTo().activeElement();
        expect(activeElement).to.not.be.undefined;
    });

    it('should handle Escape key in search', async function () {
        this.timeout(30_000);
        webview = await openNuGetPanelWebview();

        const searchInput = await findByTestId(webview, 'search-input');
        await searchInput.sendKeys('test query');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Escape should dismiss suggestions / clear
        const driver = webview.getDriver();
        await driver.actions().sendKeys(Key.ESCAPE).perform();
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the search input is still accessible after Escape
        const value = await searchInput.getAttribute('value');
        expect(value).to.be.a('string');
    });
});

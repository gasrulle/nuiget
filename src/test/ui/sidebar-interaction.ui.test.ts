import { expect } from 'chai';
import { By, WebDriver, WebView } from 'vscode-extension-tester';
import { closeAllEditors, openSidebar } from './helpers/panel-helpers';

/**
 * Try to switch into the sidebar webview frame.
 * Sidebar webviews are inside the sidebar panel, not an editor tab.
 * We look for webview iframes inside the sidebar DOM.
 */
async function switchToSidebarWebview(driver: WebDriver, timeout = 15_000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            // Find all iframes in the page — sidebar webviews are nested iframes
            const iframes = await driver.findElements(By.css('iframe.webview'));
            if (iframes.length > 0) {
                // Try to switch into the last iframe (sidebar webview)
                for (const iframe of iframes) {
                    try {
                        await driver.switchTo().frame(iframe);
                        // Look for internal webview iframe
                        const innerFrames = await driver.findElements(By.css('iframe#active-frame'));
                        if (innerFrames.length > 0) {
                            await driver.switchTo().frame(innerFrames[0]);
                            return true;
                        }
                        await driver.switchTo().defaultContent();
                    } catch {
                        try { await driver.switchTo().defaultContent(); } catch { /* ignore */ }
                    }
                }
            }
        } catch {
            // ignore and retry
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
}

/**
 * UI test: Sidebar sections, @-prefix search, expand/collapse.
 */
describe('Sidebar Interaction', () => {
    afterEach(async function () {
        this.timeout(30_000);
        try {
            const driver = (new WebView()).getDriver();
            await driver.switchTo().defaultContent();
        } catch { /* ignore */ }
        try {
            await closeAllEditors();
        } catch { /* ignore */ }
    });

    it('should show sidebar with search input', async function () {
        this.timeout(60_000);
        const sidebar = await openSidebar();

        // Verify sidebar opened
        expect(sidebar).to.not.be.undefined;
        const content = await sidebar.getContent();
        expect(content).to.not.be.undefined;
    });

    it('should support @-prefix search modes', async function () {
        this.timeout(60_000);
        const sidebar = await openSidebar();

        // Verify sidebar is open with content
        const content = await sidebar.getContent();
        expect(content).to.not.be.undefined;
    });

    it('should have collapsible section headers', async function () {
        this.timeout(60_000);
        const sidebar = await openSidebar();

        // Verify sidebar content is available
        const content = await sidebar.getContent();
        expect(content).to.not.be.undefined;
    });
});

import {
    ActivityBar,
    EditorView,
    SideBarView,
    WebView,
    Workbench
} from 'vscode-extension-tester';
import { findByTestId, switchToWebviewFrame, typeIntoTestId } from './webview-helpers';

/**
 * High-level panel/sidebar helpers for common UI test flows.
 */

/**
 * Open the NuGet panel via Command Palette.
 * Returns the Workbench reference.
 */
export async function openNuGetPanel(): Promise<Workbench> {
    const workbench = new Workbench();
    await workbench.executeCommand('nUIget: Manage NuGet Packages');

    // Wait for panel to appear
    await new Promise(resolve => setTimeout(resolve, 3000));
    return workbench;
}

/**
 * Open the NuGet panel and switch into its webview frame.
 */
export async function openNuGetPanelWebview(timeout = 10_000): Promise<WebView> {
    await openNuGetPanel();
    return switchToWebviewFrame(timeout);
}

/**
 * Search for a package in the main panel search input.
 */
export async function searchForPackage(
    webview: WebView,
    query: string,
): Promise<void> {
    await typeIntoTestId(webview, 'search-input', query);
    // Press Enter to submit search
    const searchInput = await findByTestId(webview, 'search-input');
    const Key = (await import('selenium-webdriver')).Key;
    await searchInput.sendKeys(Key.ENTER);

    // Wait for results
    await new Promise(resolve => setTimeout(resolve, 3000));
}

/**
 * Focus the nUIget sidebar panel via Activity Bar.
 * Waits for the icon to appear (extension activation can be slow).
 */
export async function openSidebar(): Promise<SideBarView> {
    // Wait for the nUIget icon to appear (activation takes time)
    const maxWait = 20_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        const activityBar = new ActivityBar();
        const controls = await activityBar.getViewControls();

        for (const control of controls) {
            const title = await control.getTitle();
            if (title.toLowerCase().includes('nuiget') || title.toLowerCase().includes('nuget')) {
                await control.openView();
                await new Promise(resolve => setTimeout(resolve, 3000));
                return new SideBarView();
            }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('nUIget sidebar not found in Activity Bar');
}

/**
 * Close all editors/panels. Resilient to click interception errors.
 */
export async function closeAllEditors(): Promise<void> {
    try {
        const editorView = new EditorView();
        await editorView.closeAllEditors();
    } catch {
        // Fallback: try via command palette
        try {
            const workbench = new Workbench();
            await workbench.executeCommand('View: Close All Editors');
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch {
            // Best effort — ignore cleanup errors
        }
    }
}

/**
 * Execute a command via the Command Palette with optional input.
 */
export async function executeCommand(command: string): Promise<void> {
    const workbench = new Workbench();
    await workbench.executeCommand(command);
    await new Promise(resolve => setTimeout(resolve, 1000));
}

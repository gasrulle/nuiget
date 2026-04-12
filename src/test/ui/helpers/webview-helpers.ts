import { By, WebElement, WebView } from 'vscode-extension-tester';

/**
 * WebView helpers for interacting with nUIget webview panels from ExTester.
 *
 * The webview runs inside an iframe. ExTester's WebView class handles
 * frame switching. Use findByTestId() to locate elements via data-testid.
 */

/**
 * Switch into the webview iframe and return its handle.
 * Must call switchBack() when done to return to the main frame.
 */
export async function switchToWebviewFrame(timeout = 10_000): Promise<WebView> {
    const webview = new WebView();
    await webview.switchToFrame(timeout);
    return webview;
}

/**
 * Find an element inside the webview by data-testid attribute.
 * Must be called while inside the webview frame (after switchToFrame).
 */
export async function findByTestId(
    webview: WebView,
    testId: string,
    timeout = 5000,
): Promise<WebElement> {
    const driver = webview.getDriver();
    const el = await driver.wait(
        async () => {
            try {
                const found = await webview.findWebElement(
                    By.css(`[data-testid="${testId}"]`),
                );
                return found;
            } catch {
                return undefined;
            }
        },
        timeout,
        `Element with data-testid="${testId}" not found within ${timeout}ms`,
    );
    if (!el) {
        throw new Error(`Element with data-testid="${testId}" not found`);
    }
    return el;
}

/**
 * Type text into an element identified by data-testid.
 */
export async function typeIntoTestId(
    webview: WebView,
    testId: string,
    text: string,
): Promise<void> {
    const el = await findByTestId(webview, testId);
    // Use Ctrl+A + text to replace (Selenium clear() doesn't work with React controlled inputs)
    const { Key } = await import('selenium-webdriver');
    await el.sendKeys(Key.chord(Key.CONTROL, 'a'));
    await el.sendKeys(text);
}

/**
 * Click an element identified by data-testid.
 */
export async function clickTestId(
    webview: WebView,
    testId: string,
): Promise<void> {
    const el = await findByTestId(webview, testId);
    await el.click();
}

/**
 * Get text content of an element identified by data-testid.
 */
export async function getTestIdText(
    webview: WebView,
    testId: string,
): Promise<string> {
    const el = await findByTestId(webview, testId);
    return el.getText();
}

/**
 * Check if an element with data-testid exists in the webview.
 */
export async function hasTestId(
    webview: WebView,
    testId: string,
): Promise<boolean> {
    try {
        await findByTestId(webview, testId, 2000);
        return true;
    } catch {
        return false;
    }
}

/**
 * Wait for an element with data-testid to disappear.
 */
export async function waitForTestIdGone(
    webview: WebView,
    testId: string,
    timeout = 10_000,
): Promise<void> {
    const driver = webview.getDriver();
    await driver.wait(
        async () => !(await hasTestId(webview, testId)),
        timeout,
        `Element data-testid="${testId}" still present after ${timeout}ms`,
    );
}

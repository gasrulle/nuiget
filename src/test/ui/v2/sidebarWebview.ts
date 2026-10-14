import { ActivityBar, By, VSBrowser, type WebDriver, type WebElement } from 'vscode-extension-tester';

/**
 * Helpers of the 2.0 UI suite. They share nothing with `src/test/ui/helpers`, which belongs to the 1.x
 * suites and goes with them. Waiting is always a bounded poll; nothing here sleeps for a fixed time.
 */

const POLL_MS = 250;

export const driverOf = (): WebDriver => VSBrowser.instance.driver;

/** Calls `probe` every 250 ms until it returns something other than `undefined`; fails with `what` after `timeoutMs`. */
export async function poll<T>(probe: () => Promise<T | undefined>, what: string, timeoutMs: number): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let last: unknown;
    for (;;) {
        try {
            const value = await probe();
            if (value !== undefined) {
                return value;
            }
        } catch (error) {
            // An element that went stale or is not there yet is "not yet"; the last reason is reported at the end.
            last = error;
        }
        if (Date.now() > deadline) {
            throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}${last instanceof Error ? ` (last error: ${last.message})` : ''}`);
        }
        await new Promise(resolve => setTimeout(resolve, POLL_MS));
    }
}

/** Opens the nUIget view from the Activity Bar; the control appears once the extension has activated. */
export async function openSidebarView(timeoutMs = 60_000): Promise<void> {
    const control = await poll(async () => {
        for (const candidate of await new ActivityBar().getViewControls()) {
            if ((await candidate.getTitle()).toLowerCase().includes('nuiget')) {
                return candidate;
            }
        }
        return undefined;
    }, 'the nUIget control in the Activity Bar', timeoutMs);
    await control.openView();
}

/**
 * Switches the driver into the document of the 2.0 sidebar: the webview's outer frame, then its content frame,
 * recognized by the root element of the sidebar. The driver stays there until `leaveWebview`.
 */
export async function enterSidebarWebview(timeoutMs = 60_000): Promise<void> {
    const driver = driverOf();
    await poll(async () => {
        await driver.switchTo().defaultContent();
        for (const outer of await driver.findElements(By.css('iframe.webview'))) {
            await driver.switchTo().frame(outer);
            const inner = await driver.findElements(By.css('iframe#active-frame'));
            if (inner.length > 0) {
                await driver.switchTo().frame(inner[0]);
                if ((await driver.findElements(By.css('[data-testid="nuiget-sidebar"]'))).length > 0) {
                    return true;
                }
            }
            await driver.switchTo().defaultContent();
        }
        return undefined;
    }, 'the 2.0 sidebar webview (data-testid="nuiget-sidebar")', timeoutMs);
}

export async function leaveWebview(): Promise<void> {
    await driverOf().switchTo().defaultContent();
}

const byTestId = (testId: string): By => By.css(`[data-testid="${testId}"]`);

/** The element with this test id, inside `within` when given; waits until it is there. */
export function findByTestId(testId: string, timeoutMs = 30_000, within?: WebElement): Promise<WebElement> {
    return poll(async () => (await (within ?? driverOf()).findElements(byTestId(testId)))[0], `data-testid="${testId}"`, timeoutMs);
}

export async function waitForTestIdGone(testId: string, timeoutMs: number): Promise<void> {
    await poll(async () => ((await driverOf().findElements(byTestId(testId))).length === 0 ? true : undefined), `data-testid="${testId}" to go`, timeoutMs);
}

/** Waits until the text of the element contains `text`. */
export async function waitForText(testId: string, text: string, timeoutMs: number): Promise<void> {
    await poll(async () => {
        const [element] = await driverOf().findElements(byTestId(testId));
        return element !== undefined && ((await element.getAttribute('textContent')) ?? '').includes(text) ? true : undefined;
    }, `"${text}" in data-testid="${testId}"`, timeoutMs);
}

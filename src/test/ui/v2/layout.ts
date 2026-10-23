import { By, InputBox, Origin, Workbench, type WebElement } from 'vscode-extension-tester';
import { driverOf, leaveWebview, poll } from './sidebarWebview';

/**
 * Layout helpers of the named states (UX-P0.8): the workbench theme, the width of the main panel and of the side bar,
 * and the rectangle of a webview. Widths are the widths of the webview's outer `iframe.webview`, reached within 1 px;
 * the capture suite crops exactly `<width>` CSS px from the webview's left edge, so a `<state>.<theme>.<width>.png` is
 * `<width>` CSS px wide.
 */

/** The window height of every capture; CI's xvfb screen is 1920x1080 (`ci.yml`), so 1200 px panels fit. */
export const WINDOW_HEIGHT = 900;

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Picks a theme in the Color Theme quick pick by one of its exact labels (a filter for one label also shows longer
 * ones); `labels` lists the names different VS Code versions give the same theme.
 */
export async function selectTheme(labels: readonly string[]): Promise<void> {
    await poll(async () => {
        await driverOf().switchTo().defaultContent();
        await new Workbench().executeCommand('Preferences: Color Theme');
        const input = await InputBox.create();
        const offered: string[] = [];
        for (const label of labels) {
            await input.setText(label);
            for (const pick of await input.getQuickPicks()) {
                const shown = await pick.getLabel();
                if (shown === label) {
                    await pick.select();
                    return true;
                }
                offered.push(shown);
            }
        }
        await input.cancel();
        // Reported by poll as the last reason when the theme never shows up.
        throw new Error(`offered: ${offered.map(label => JSON.stringify(label)).join(', ')}`);
    }, `the theme "${labels[0]}" in the quick pick`, 60_000);
}

/**
 * The rectangle, in CSS px of the window, of the outer `iframe.webview` whose content frame holds the element with
 * `rootTestId` (`nuiget-app` or `nuiget-sidebar`). Leaves the driver in the window's default content.
 */
export async function webviewRect(rootTestId: string, timeoutMs = 60_000): Promise<Rect> {
    const driver = driverOf();
    return poll(async () => {
        await driver.switchTo().defaultContent();
        const frames = await driver.findElements(By.css('iframe.webview'));
        for (let index = 0; index < frames.length; index++) {
            await driver.switchTo().defaultContent();
            const outer = (await driver.findElements(By.css('iframe.webview')))[index];
            if (outer === undefined) {
                return undefined;
            }
            const rect = await outer.getRect();
            await driver.switchTo().frame(outer);
            const inner = await driver.findElements(By.css('iframe#active-frame'));
            let found = false;
            if (inner.length > 0) {
                await driver.switchTo().frame(inner[0]);
                found = (await driver.findElements(By.css(`[data-testid="${rootTestId}"]`))).length > 0;
            }
            await driver.switchTo().defaultContent();
            if (found && rect.width > 0 && rect.height > 0) {
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }
        }
        return undefined;
    }, `the webview of data-testid="${rootTestId}"`, timeoutMs);
}

/** The webview's width once two reads 250 ms apart agree: the workbench lays out after a resize. */
async function settledWidth(rootTestId: string): Promise<number> {
    let last = -1;
    return poll(async () => {
        const width = (await webviewRect(rootTestId)).width;
        const settled = width === last;
        last = width;
        return settled ? width : undefined;
    }, `the webview of ${rootTestId} to settle`, 15_000);
}

/** Sets the window's size; the main panel takes what the activity bar and the side bar leave. */
async function setWindowWidth(width: number): Promise<void> {
    await driverOf().manage().window().setRect({ x: 0, y: 0, width, height: WINDOW_HEIGHT });
}

/**
 * Resizes the window until the main panel's webview is `width` px wide (± 1 px), or fails: a width the window
 * cannot reach is a stop-and-ask of the capture suite, never a smaller capture.
 */
export async function setPanelWidth(width: number): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const current = await settledWidth('nuiget-app');
        if (Math.abs(current - width) <= 1) {
            return;
        }
        const window = await driverOf().manage().window().getRect();
        await setWindowWidth(Math.round(window.width + width - current));
    }
    const reached = await settledWidth('nuiget-app');
    if (Math.abs(reached - width) > 1) {
        throw new Error(`the main panel does not reach ${width} px: it is ${reached} px after five resizes`);
    }
}

/** The vertical sash on the right edge of the side bar part. */
async function sideBarSash(): Promise<WebElement> {
    const driver = driverOf();
    const part = await driver.findElement(By.id('workbench.parts.sidebar'));
    const edge = await part.getRect();
    const right = edge.x + edge.width;
    for (const candidate of await driver.findElements(By.css('.monaco-sash.vertical'))) {
        const rect = await candidate.getRect();
        if (rect.height > edge.height / 2 && Math.abs(rect.x + rect.width / 2 - right) <= 4) {
            return candidate;
        }
    }
    throw new Error(`no vertical sash at x=${right}`);
}

/**
 * Drags the side bar's sash until the sidebar's webview is `width` px wide (± 1 px), or fails (VS Code keeps the side
 * bar at 170 px or more).
 */
export async function setSidebarWidth(width: number): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const current = await settledWidth('nuiget-sidebar');
        if (Math.abs(current - width) <= 1) {
            return;
        }
        await leaveWebview();
        const sash = await sideBarSash();
        await driverOf().actions().move({ origin: sash }).press().move({ origin: Origin.POINTER, x: Math.round(width - current), y: 0 }).release().perform();
    }
    const reached = await settledWidth('nuiget-sidebar');
    if (Math.abs(reached - width) > 1) {
        throw new Error(`the sidebar does not reach ${width} px: it is ${reached} px after five drags`);
    }
}

/** The window size every capture run starts from: wide enough for a 300 px side bar beside a 1200 px panel. */
export async function startWindow(): Promise<void> {
    await setWindowWidth(1700);
}

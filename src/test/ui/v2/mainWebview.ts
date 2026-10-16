import { By, Workbench } from 'vscode-extension-tester';
import { driverOf, poll } from './sidebarWebview';

/** The title of `nuiget.openManager` in `package.json`; the Command Palette finds a command by its title. */
const OPEN_MANAGER = 'nUIget: Manage NuGet Packages';

/**
 * Opens the 2.0 main panel through the Command Palette. Right after VS Code starts, the palette's input can be
 * there and not yet take text ("element not interactable"); that is "not yet", like a missing element.
 */
export async function openMainPanel(timeoutMs = 60_000): Promise<void> {
    await poll(async () => {
        await driverOf().switchTo().defaultContent();
        await new Workbench().executeCommand(OPEN_MANAGER);
        return true;
    }, `the command "${OPEN_MANAGER}"`, timeoutMs);
}

/**
 * Switches the driver into the document of the 2.0 main panel: the webview's outer frame, then its content frame,
 * recognized by the root element of the panel. With the sidebar open as well there are two webviews, in no fixed
 * order; the test id is what tells them apart. The driver stays there until `leaveWebview`.
 */
export async function enterMainWebview(timeoutMs = 60_000): Promise<void> {
    const driver = driverOf();
    await poll(async () => {
        await driver.switchTo().defaultContent();
        for (const outer of await driver.findElements(By.css('iframe.webview'))) {
            await driver.switchTo().frame(outer);
            const inner = await driver.findElements(By.css('iframe#active-frame'));
            if (inner.length > 0) {
                await driver.switchTo().frame(inner[0]);
                if ((await driver.findElements(By.css('[data-testid="nuiget-app"]'))).length > 0) {
                    return true;
                }
            }
            await driver.switchTo().defaultContent();
        }
        return undefined;
    }, 'the 2.0 main panel webview (data-testid="nuiget-app")', timeoutMs);
}

/** Selects an option of the project selector the way a user's choice reaches React: value set, `change` dispatched. */
export async function chooseProject(value: string): Promise<void> {
    await driverOf().executeScript(
        'const select = document.querySelector(\'[data-testid="project-selector"]\'); select.value = arguments[0]; select.dispatchEvent(new Event("change", { bubbles: true }));',
        value,
    );
}

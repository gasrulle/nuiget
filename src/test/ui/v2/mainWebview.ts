import { By, Workbench } from 'vscode-extension-tester';
import { driverOf, findByTestId, poll } from './sidebarWebview';

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

/**
 * One dispatch. Since P9.12 the host tells a surface of a project only after the session knows it (N86), so a choice
 * that is not committed is a regression, never retried here.
 */
export async function chooseProjectCommitted(value: string, timeoutMs = 60_000): Promise<void> {
    const selectorValue = async (): Promise<string> => (await driverOf().executeScript<string>('return document.querySelector(\'[data-testid="project-selector"]\')?.value ?? "";')) ?? '';
    await chooseProject(value);
    await poll(async () => ((await selectorValue()) === value ? true : undefined), `the project selector committed on ${value}`, timeoutMs);
}

/** The values of the project selector's options, as the host sent the paths. */
export async function projectOptionValues(): Promise<string[]> {
    const selector = await findByTestId('project-selector', 60_000);
    const values = await Promise.all((await selector.findElements(By.css('option'))).map(element => element.getAttribute('value')));
    return values.filter((value): value is string => value !== null);
}

/**
 * Waits for the host's project list to satisfy `probe`, pressing Refresh (a workspace rescan) every 15 s: a file
 * watcher may never report a project file created or deleted by the test (parity audit TF8).
 */
export async function untilProjects<T>(probe: (values: string[]) => T | undefined, what: string, totalMs = 180_000): Promise<T> {
    const deadline = Date.now() + totalMs;
    for (;;) {
        try {
            return await poll(async () => probe(await projectOptionValues()), what, 15_000);
        } catch (error) {
            if (Date.now() > deadline) {
                throw error;
            }
            await (await findByTestId('refresh-button')).click();
        }
    }
}

/** The value of the selector's option whose path ends with `file`, once the host lists it. */
export const optionFor = (file: string): Promise<string> => untilProjects(values => values.find(value => value.endsWith(file)), `${file} in the project selector`);


/** What a comfortable row measures in the webview: the wrapper carries `min-height`, the icon is the `<img>` it shows. */
export interface MeasuredRow {
    name: string;
    minHeight: string;
    height: number;
    iconSrc: string;
    iconLoaded: boolean;
}

/** The rows of the list `listTestId` measured once every icon has loaded (TF1, TF3); fails after `timeoutMs`. */
export async function measureLoadedRows(listTestId: string, timeoutMs = 30_000): Promise<MeasuredRow[]> {
    return poll(async () => {
        const rows = await driverOf().executeScript<MeasuredRow[]>(`
            return Array.from(document.querySelectorAll('[data-testid="${listTestId}"] .nuiget-row-option')).map(option => {
                const row = option.closest('.nuiget-row') ?? option;
                const img = option.querySelector('.nuiget-row-icon img');
                return {
                    name: option.querySelector('.nuiget-row-name')?.textContent ?? '',
                    minHeight: getComputedStyle(row).minHeight,
                    height: row.getBoundingClientRect().height,
                    iconSrc: img?.getAttribute('src') ?? '',
                    iconLoaded: img ? img.complete && img.naturalWidth > 0 : false,
                };
            });`);
        return rows.length > 0 && rows.every(row => row.iconLoaded) ? rows : undefined;
    }, `every row of ${listTestId} with a loaded icon`, timeoutMs);
}

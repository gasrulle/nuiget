import { ActivityBar, By, EditorView, Key, Workbench } from 'vscode-extension-tester';
import { MEASURE_WIDGETS, WORKBENCH_WIDGETS, type WidgetMeasure, type WorkbenchWidget } from './measure';
import { driverOf, poll } from './sidebarWebview';

/**
 * The workbench half of helper 3 (UX-P0.11): the heights of the workbench's own controls, measured in the run that
 * measures the webviews, in its look. Each view is opened, measured once the control is visible and closed again: the
 * Extensions view (a row, its search box, a pane header) and an extension's editor (its navbar), the Settings editor
 * (a select and an input of Commonly Used, the editor tab strip, and the Add Pattern button of `files.exclude`), the
 * command palette (its box and a row). A control no selector finds is `null` and says why in the log: the run goes on.
 * Each wait is short: on a given VS Code the control is there or it is not. A module of its own because `measure.ts`
 * stays free of ExTester (`src/test/lint` imports its registry).
 */

/** Waits for a visible element of the top document. */
async function untilVisible(selector: string, what: string, timeoutMs = 20_000): Promise<void> {
    await poll(async () => (await driverOf().executeScript<boolean>(
        'return [...document.querySelectorAll(arguments[0])].some(el => { const rect = el.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });',
        selector,
    )) ? true : undefined, what, timeoutMs);
}

export async function measureWorkbench(): Promise<Record<WorkbenchWidget, WidgetMeasure | null>> {
    const driver = driverOf();
    const widgets = Object.fromEntries(Object.keys(WORKBENCH_WIDGETS).map(name => [name, null])) as Record<WorkbenchWidget, WidgetMeasure | null>;
    const measure = async (...names: WorkbenchWidget[]): Promise<void> => {
        Object.assign(widgets, await driver.executeScript<Record<string, WidgetMeasure | null>>(MEASURE_WIDGETS, names.map(name => [name, WORKBENCH_WIDGETS[name]])));
    };
    const phase = async (name: string, steps: () => Promise<void>): Promise<void> => {
        try {
            await driver.switchTo().defaultContent();
            await steps();
        } catch (error) {
            console.warn(`[workbench] ${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    const closeEditors = async (): Promise<void> => {
        await driver.switchTo().defaultContent();
        await new EditorView().closeAllEditors().catch(() => undefined);
    };

    await phase('extensions', async () => {
        const control = await poll(async () => new ActivityBar().getViewControl('Extensions'), 'the Extensions view control', 20_000);
        await control.openView();
        await untilVisible(WORKBENCH_WIDGETS.extensionsRow[0], 'an extension row');
        await measure('extensionsRow', 'extensionsSearch', 'paneHeader');
        // The extension editor's navbar, the exemplar of DS-HEIGHT-4 and DS-HEIGHT-5.
        await (await driver.findElement(By.css(WORKBENCH_WIDGETS.extensionsRow[0]))).click();
        await untilVisible(WORKBENCH_WIDGETS.extensionNavbar[0], 'the extension editor navbar');
        await measure('extensionNavbar');
    });
    await closeEditors();

    await phase('settings', async () => {
        const settings = await new Workbench().openSettings();
        await untilVisible(WORKBENCH_WIDGETS.settingsSelect[0], 'a select in the Settings editor');
        await untilVisible(WORKBENCH_WIDGETS.settingsInput[0], 'an input in the Settings editor');
        await measure('settingsSelect', 'settingsInput', 'editorTabs');
        await settings.findSettingByID('files.exclude');
        await untilVisible(WORKBENCH_WIDGETS.settingsButton.join(', '), 'the Add Pattern button of files.exclude');
        await measure('settingsButton');
    });
    await closeEditors();

    await phase('quick input', async () => {
        await poll(async () => {
            await driver.switchTo().defaultContent();
            await new Workbench().openCommandPrompt();
            return true;
        }, 'the command palette', 30_000);
        await untilVisible(WORKBENCH_WIDGETS.quickInputRow[0], 'a command palette row');
        await measure('quickInputBox', 'quickInputRow');
    });
    await driver.switchTo().defaultContent();
    await driver.actions().sendKeys(Key.ESCAPE).perform().catch(() => undefined);
    await poll(async () => (await driver.findElements(By.css('.quick-input-widget'))).length === 0
        || !(await (await driver.findElement(By.css('.quick-input-widget'))).isDisplayed()) ? true : undefined, 'the command palette to close', 10_000).catch(() => undefined);
    return widgets;
}

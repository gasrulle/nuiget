import { ActivityBar, By, EditorView, Key, Workbench } from 'vscode-extension-tester';
import { setPartWidth } from './layout';
import { type LookMeasure, MEASURE_LOOK, MEASURE_WIDGETS, WORKBENCH_WIDGETS, type WidgetMeasure, type WorkbenchWidget } from './measure';
import { driverOf, poll } from './sidebarWebview';

/** Ctrl, or Cmd on macOS: select all in the Extensions search box. */
const MODIFIER = process.platform === 'darwin' ? Key.COMMAND : Key.CONTROL;

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

// ---- the exemplar's states and widths (UX-P0.14) --------------------------------------------------------------------

/** An Extensions row in one interaction state, and whether its list holds the focus. */
export interface RowState {
    row: LookMeasure | null;
    listFocused: boolean;
}

/**
 * The workbench exemplar in the states and widths the probe lacked (research §18, plan P0.14): an Extensions row at
 * rest, under the pointer, selected by a click, focused from the keyboard and selected in an unfocused list; the
 * Extensions view at side bar widths 250/200/170 (its row breakpoints); the extension editor's header and navbar labels
 * (the Tabs exemplar), then the editor at editor widths 800/600/400/220; the quick input as the layer, with its
 * separator when the list shows one. `null` is an element no selector found visible.
 */
export interface Exemplar {
    rowStates: Partial<Record<'rest' | 'hover' | 'selected' | 'keyboardFocus' | 'unfocused', RowState>>;
    sideBarWidths: Record<string, Record<string, LookMeasure | null>>;
    /** The extension editor at the side bar's starting width: its header and every navbar label (`.checked` in `classes`). */
    editor: { header: LookMeasure | null; navbarLabels: LookMeasure[] };
    editorWidths: Record<string, Record<string, LookMeasure | null>>;
    layer: Record<string, LookMeasure | null>;
}

const EXTENSIONS = {
    viewlet: ['.extensions-viewlet'],
    row: ['.extensions-viewlet .monaco-list-row'],
    list: ['.extensions-viewlet .extensions-list'],
    item: ['.extensions-viewlet .extension-list-item'],
    iconContainer: ['.extensions-viewlet .extension-list-item .icon-container'],
    icon: ['.extensions-viewlet .extension-list-item .icon-container .icon', '.extensions-viewlet .extension-list-item img.icon'],
    name: ['.extensions-viewlet .extension-list-item .name'],
    search: WORKBENCH_WIDGETS.extensionsSearch as readonly string[],
} as const;

const EDITOR = {
    header: ['.extension-editor > .header'],
    name: ['.extension-editor > .header .name'],
    actions: ['.extension-editor > .header .monaco-action-bar'],
    navbar: ['.extension-editor .navbar'],
} as const;

const NAVBAR_LABEL = '.extension-editor .navbar .action-label';

const LAYER = {
    widget: ['.quick-input-widget'],
    input: ['.quick-input-widget .quick-input-box .monaco-inputbox'],
    row: ['.quick-input-widget .quick-input-list .monaco-list-row'],
    separator: ['.quick-input-widget .quick-input-list .quick-input-list-separator-border'],
    separatorLabel: ['.quick-input-widget .quick-input-list .quick-input-list-separator'],
} as const;

/** The side bar part's width the captures start from (the side bar webview's Tier A 300 px, UX-P0.8). */
const SIDE_BAR_REST = 300;

/** Runs in the workbench: whether the list of the first visible \`arguments[0]\` holds the focus. */
const LIST_FOCUSED = `
const row = [...document.querySelectorAll(arguments[0])].find(el => el.getBoundingClientRect().height > 0);
const list = row ? row.closest('.monaco-list') : null;
return list !== null && list.contains(document.activeElement);
`;

/** The Extensions row at a list index (the list virtualizes, so document order is not list order). */
const ROW_AT = (index: number): string => `${EXTENSIONS.row[0]}[data-index="${index}"]`;

export const EXEMPLAR_SIDE_BAR_WIDTHS: readonly number[] = [250, 200, 170];
export const EXEMPLAR_EDITOR_WIDTHS: readonly number[] = [800, 600, 400, 220];

export async function measureExemplar(): Promise<Exemplar> {
    const driver = driverOf();
    const exemplar: Exemplar = { rowStates: {}, sideBarWidths: {}, editor: { header: null, navbarLabels: [] }, editorWidths: {}, layer: {} };
    const look = async (specs: Record<string, readonly string[]>): Promise<Record<string, LookMeasure | null>> =>
        driver.executeScript<Record<string, LookMeasure | null>>(MEASURE_LOOK, Object.entries(specs));
    const rowState = async (selector: string): Promise<RowState> => ({
        row: (await look({ row: [selector] })).row,
        listFocused: await driver.executeScript<boolean>(LIST_FOCUSED, selector),
    });
    const phase = async (name: string, steps: () => Promise<void>): Promise<void> => {
        try {
            await driver.switchTo().defaultContent();
            await steps();
        } catch (error) {
            console.warn(`[exemplar] ${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    const firstRow = async () => driver.findElement(By.css(EXTENSIONS.row[0]));

    const searchContainer = async () => driver.findElement(By.css(EXTENSIONS.search.join(', ')));
    const searchBox = async () => driver.findElement(By.css(EXTENSIONS.search.map(selector => `${selector} textarea, ${selector} input`).join(', ')));

    await phase('row states', async () => {
        const control = await poll(async () => new ActivityBar().getViewControl('Extensions'), 'the Extensions view control', 20_000);
        await control.openView();
        // The built-in extensions: many rows without the network, none selected by the heights' click above.
        await (await searchBox()).sendKeys(Key.chord(MODIFIER, 'a'), Key.BACK_SPACE, '@builtin');
        await untilVisible(ROW_AT(1), 'a second built-in extension row');
        await driver.actions().move({ x: 1, y: 1 }).perform();
        exemplar.rowStates.rest = await rowState(ROW_AT(1));
        await driver.actions().move({ origin: await driver.findElement(By.css(ROW_AT(1))) }).perform();
        await poll(async () => (await driver.executeScript<boolean>('return document.querySelector(arguments[0]).matches(":hover");', ROW_AT(1))) ? true : undefined, 'the row under the pointer', 10_000);
        exemplar.rowStates.hover = await rowState(ROW_AT(1));
        // From the search box, Down moves the focus into the list: the keyboard path, before any click opens an editor.
        await driver.actions().move({ x: 1, y: 1 }).perform();
        await (await searchContainer()).click();
        await driver.actions().sendKeys(Key.ARROW_DOWN).perform();
        await poll(async () => (await driver.executeScript<boolean>(LIST_FOCUSED, ROW_AT(0))) ? true : undefined, 'the focus in the list', 10_000);
        exemplar.rowStates.keyboardFocus = await rowState(ROW_AT(0));
        // A click selects the row (and opens the extension's editor).
        await (await driver.findElement(By.css(ROW_AT(1)))).click();
        await driver.actions().move({ x: 1, y: 1 }).perform();
        await poll(async () => (/\bselected\b/.test((await (await driver.findElement(By.css(ROW_AT(1)))).getAttribute('class')) ?? '') ? true : undefined), 'the row selected', 10_000);
        exemplar.rowStates.selected = await rowState(ROW_AT(1));
        await (await searchContainer()).click();
        await poll(async () => (await driver.executeScript<boolean>(LIST_FOCUSED, ROW_AT(1))) ? undefined : true, 'the focus out of the list', 10_000);
        exemplar.rowStates.unfocused = await rowState(ROW_AT(1));
        await (await searchBox()).sendKeys(Key.chord(MODIFIER, 'a'), Key.BACK_SPACE);
        await untilVisible(EXTENSIONS.row[0], 'an extension row');
    });

    // The editor the selected row opened, at the side bar's starting width: the header and every navbar label.
    await phase('editor', async () => {
        if ((await driver.findElements(By.css(EDITOR.header[0]))).length === 0) {
            await (await firstRow()).click();
        }
        await untilVisible(NAVBAR_LABEL, 'the extension editor navbar labels');
        exemplar.editor.header = (await look({ header: EDITOR.header })).header;
        for (let index = 0; index < 8; index++) {
            const label = (await driver.executeScript<Record<string, LookMeasure | null>>(MEASURE_LOOK, [['label', [NAVBAR_LABEL]]], index)).label;
            if (label === null) {
                break;
            }
            exemplar.editor.navbarLabels.push(label);
        }
    });

    await phase('side bar widths', async () => {
        for (const width of EXEMPLAR_SIDE_BAR_WIDTHS) {
            await setPartWidth('sidebar', width);
            await untilVisible(EXTENSIONS.row[0], 'an extension row');
            exemplar.sideBarWidths[String(width)] = await look(EXTENSIONS);
        }
    });

    await phase('editor widths', async () => {
        if ((await driver.findElements(By.css(EDITOR.header[0]))).length === 0) {
            await (await firstRow()).click();
        }
        await untilVisible(EDITOR.header[0], 'the extension editor header');
        for (const width of EXEMPLAR_EDITOR_WIDTHS) {
            await setPartWidth('editor', width);
            await untilVisible(EDITOR.header[0], 'the extension editor header');
            const groups = (await driver.findElements(By.css('.part.editor .editor-group-container'))).length;
            if (groups !== 1) {
                throw new Error(`${groups} editor groups at ${width} px: the editor part is not one editor`);
            }
            exemplar.editorWidths[String(width)] = await look(EDITOR);
        }
    });

    await phase('layer', async () => {
        await poll(async () => {
            await driver.switchTo().defaultContent();
            await new Workbench().openCommandPrompt();
            return true;
        }, 'the command palette', 30_000);
        await untilVisible(LAYER.row[0], 'a command palette row');
        exemplar.layer = await look(LAYER);
    });

    // Leave the workbench as the heights found it: one empty editor area and the side bar's width.
    await phase('restore', async () => {
        await driver.actions().sendKeys(Key.ESCAPE).perform();
        await new Workbench().executeCommand('View: Close All Editor Groups');
        await poll(async () => ((await driver.findElements(By.css('.part.editor .editor-group-container'))).length <= 1 ? true : undefined), 'one editor group', 10_000);
        await setPartWidth('sidebar', SIDE_BAR_REST);
    });
    await driver.switchTo().defaultContent();
    return exemplar;
}

import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, Key } from 'vscode-extension-tester';
import { acceptedTargetSelectors, CONTRAST_STATUS, type ContrastRun, LAYER_SELECTOR, type Moment, type MomentFacts, momentLines, type Resolved, RESOLVE_CONTRAST, RUN_CONTRAST, TEXTS_UNDER } from './a11y';
import { selectTheme as pickTheme } from './layout';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { driverOf, enterSidebarWebview, findByTestId, leaveWebview, openSidebarView, poll, screenshot, waitForTestIdGone } from './sidebarWebview';

/**
 * The theme pass of the 2.0 webviews (plan item P5.11, ruling of 2026-10-16), on the VSIX that `npm run test:ui` packages:
 * under six of VS Code's built-in themes (dark, light, both high-contrast themes and the 2026 pair), axe-core runs inside the main panel and the sidebar, and neither has a
 * `color-contrast` or a `target-size` (24 px) violation (an icon button's hit is DS-HEIGHT-8's measurement, `AXE_ACCEPTED`). jsdom cannot measure contrast: the colours exist only in VS
 * Code, which sets the `--vscode-*` variables and the body class of the theme. That the rule ran is part of the
 * assertion; what axe could not decide is written to the log. Forced colours are not emulated (the tokens lint holds
 * that block). The first theme is put back afterwards; nothing is installed or removed.
 */
/**
 * The built-in themes, by the labels of the Color Theme picker: the newest VS Code (ExTester's `max`) names them as in
 * the first entry, older versions as in the second. Dark 2026 and Light 2026 are the themes it offers new users.
 * The first theme is the one `src/test/ui/settings.json` starts with, and the one put back afterwards.
 */
const THEMES = [
    { labels: ['Dark Modern', 'Default Dark Modern'], bodyClass: 'vscode-dark' },
    { labels: ['Light Modern', 'Default Light Modern'], bodyClass: 'vscode-light' },
    { labels: ['Dark High Contrast', 'Default High Contrast'], bodyClass: 'vscode-high-contrast' },
    { labels: ['Light High Contrast', 'Default High Contrast Light'], bodyClass: 'vscode-high-contrast-light' },
    { labels: ['Dark 2026'], bodyClass: 'vscode-dark' },
    { labels: ['Light 2026'], bodyClass: 'vscode-light' },
] as const;

type Theme = (typeof THEMES)[number];

interface AxeNode { target: string[]; summary: string; insideDetails: boolean; accepted?: string }
interface AxeSummary {
    violations: Record<string, AxeNode[]>;
    passes: Record<string, number>;
    incomplete: Record<string, AxeNode[]>;
    backgrounds: { body: string; html: string };
}

const AXE_SOURCE = fs.readFileSync(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8');

/** Runs in the webview: axe on the two rules, answered as a summary small enough for the WebDriver channel. */
const RUN_AXE = `
    const done = arguments[arguments.length - 1];
    const acceptedTargets = arguments[0];
    const details = document.querySelector('[data-testid="package-details-panel"]');
    const nodes = list => list.map(node => ({
        accepted: acceptedTargets.find(selector => { const el = document.querySelector(String(node.target[0])); return el !== null && el.matches(selector); }),
        target: node.target.map(String),
        summary: node.failureSummary || node.any.map(check => check.message).join('; '),
        insideDetails: details !== null && node.target.length === 1 && details.contains(document.querySelector(String(node.target[0]))),
    }));
    const byRule = (results, map) => Object.fromEntries(results.map(result => [result.id, map(result)]));
    axe.run(document, {
        runOnly: ['color-contrast', 'target-size'],
        rules: { 'target-size': { enabled: true } },
        resultTypes: ['violations', 'passes', 'incomplete'],
    }).then(results => done(JSON.stringify({
        violations: byRule(results.violations, result => nodes(result.nodes)),
        passes: byRule(results.passes, result => result.nodes.length),
        incomplete: byRule(results.incomplete, result => nodes(result.nodes)),
        backgrounds: {
            body: getComputedStyle(document.body).backgroundColor,
            html: getComputedStyle(document.documentElement).backgroundColor,
        },
    })), error => done(JSON.stringify({ error: String(error) })));
`;

const nameOf = (theme: Theme): string => theme.labels[0];

/** The theme's id as the capture suite and the contrast registry name it (`Dark High Contrast` → `dark-high-contrast`). */
const slugOf = (theme: Theme): string => nameOf(theme).toLowerCase().replace(/ /g, '-');

const MODIFIER = process.platform === 'darwin' ? Key.COMMAND : Key.CONTROL;

// ---- UX-P0.25: the contrast moments (H49; A8, A14), each restoring what it changed before the next ----------------

/**
 * The two rules over `scope` (or the document), then the pairs of what axe left undecided (`a11y.ts`); with `textsUnder`, also
 * the texts the layer `scope` covers, which an unscoped run leaves undecided.
 */
async function contrastAt(scope: string | null, outsideDetailsOnly: boolean, textsUnder = false): Promise<MomentFacts> {
    const driver = driverOf();
    if (!(await driver.executeScript<boolean>('return typeof window.axe !== "undefined";'))) {
        await driver.executeScript(AXE_SOURCE);
    }
    await waitForTransitions();
    await driver.manage().setTimeouts({ script: 120_000 });
    const run = JSON.parse(await driver.executeAsyncScript<string>(RUN_CONTRAST, scope, outsideDetailsOnly, acceptedTargetSelectors())) as ContrastRun;
    if (run.error !== undefined) {
        return { violations: [], passes: 0, notMeasurable: `axe.run failed: ${run.error}` };
    }
    let undecided = run.undecided;
    if (textsUnder && scope !== null) {
        const page = JSON.parse(await driver.executeAsyncScript<string>(RUN_CONTRAST, null, true, acceptedTargetSelectors())) as ContrastRun;
        if (page.error !== undefined) {
            return { violations: [], passes: 0, notMeasurable: `axe.run over the page failed: ${page.error}` };
        }
        undecided = [...new Set([...undecided, ...(await driver.executeScript<string[]>(TEXTS_UNDER, scope, page.undecided))])];
    }
    const resolved = undecided.length > 0 ? JSON.parse(await driver.executeAsyncScript<string>(RESOLVE_CONTRAST, undecided, LAYER_SELECTOR)) as Resolved : undefined;
    return { violations: run.violations, passes: run.passes, acceptedTargets: run.acceptedTargets, resolved };
}

/** Prints a moment's `[contrast]` lines and collects its failures. */
function report(moment: Moment, theme: Theme, facts: MomentFacts, failures: string[]): void {
    const { lines, failures: found } = momentLines(moment, slugOf(theme), facts);
    for (const line of lines) {
        console.warn(line);
    }
    failures.push(...found);
}

/** The rows of a list by their test ids, the current one marked. */
async function rowsOf(listTestId: string): Promise<Array<{ id: string; current: boolean }>> {
    return driverOf().executeScript<Array<{ id: string; current: boolean }>>(`
        return Array.from(document.querySelectorAll('[data-testid="${listTestId}"] .nuiget-row-option')).map(option => ({
            id: option.closest('[data-testid^="package-row-"]').getAttribute('data-testid'),
            current: option.getAttribute('aria-current') === 'true' || option.getAttribute('aria-selected') === 'true',
        }));`);
}

const optionOf = async (rowTestId: string) => (await findByTestId(rowTestId, 30_000)).findElement(By.css('.nuiget-row-option'));

/** A pointer on the row, until it matches `:hover`. */
async function hover(rowTestId: string): Promise<void> {
    const option = await optionOf(rowTestId);
    await driverOf().actions().move({ origin: option }).perform();
    await poll(async () => ((await driverOf().executeScript<boolean>('return arguments[0].matches(":hover");', option)) ? true : undefined), `${rowTestId} under the pointer`, 10_000);
}

/** The row in or out of the bulk set, as a Ctrl/Cmd+click does. */
async function toggle(rowTestId: string, selected: boolean): Promise<void> {
    const option = await optionOf(rowTestId);
    await driverOf().actions().keyDown(MODIFIER).click(option).keyUp(MODIFIER).perform();
    await poll(async () => (((await option.getAttribute('aria-selected')) === 'true') === selected ? true : undefined), `${rowTestId} ${selected ? 'in' : 'out of'} the bulk set`, 10_000);
}

/** The main panel's four moments, from the Installed tab with its first row current; the tab is left as it was found. */
async function mainMoments(theme: Theme, failures: string[]): Promise<void> {
    const rows = await rowsOf('installed-list');
    const current = rows.find(row => row.current) ?? rows[0];
    const other = rows.find(row => row.id !== current.id) ?? rows[0];
    // A hovered row that is not selected: the hover band under secondary text (A14).
    await hover(other.id);
    report('hover-main', theme, await contrastAt(null, true), failures);
    await hover(current.id);
    // The README of a package with code blocks (A8); the details pane's incompletes stay tolerated until P3.4.
    await (await optionOf('package-row-newtonsoft.json')).click();
    await (await findByTestId('details-tab-readme', 30_000)).click();
    const readme = await poll(async () => (await driverOf().executeScript<string | null>(`
        const content = document.querySelector('[data-testid="readme-content"]');
        // ReadmeView mounts the container empty and fills it in an effect: decide once it holds the rendered README.
        if (content && content.childElementCount > 0) return content.querySelector('code, pre') ? 'content' : 'no code';
        return document.querySelector('[data-testid="readme-empty"]') ? 'empty' : null;`)) ?? undefined, 'the README or its empty state', 60_000);
    report('readme', theme, readme === 'content' ? await contrastAt(null, true) : { violations: [], passes: 0, notMeasurable: readme === 'empty' ? 'the README did not load (readme-empty)' : 'the README has no code element' }, failures);
    await (await findByTestId('details-tab-details', 30_000)).click();
    await (await optionOf(current.id)).click();
    // The open ConfirmDialog of a bulk uninstall of one row, cancelled; never confirmed.
    await toggle(other.id, true);
    await (await findByTestId('uninstall-selected-button', 10_000)).click();
    await findByTestId('confirm-dialog', 10_000);
    report('dialog', theme, await contrastAt('[data-testid="confirm-dialog"]', false), failures);
    await (await findByTestId('confirm-dialog-cancel', 10_000)).click();
    await waitForTestIdGone('confirm-dialog', 10_000);
    await toggle(other.id, false);
    // The search popup with its suggestions; closed with Escape and the box cleared.
    const search = await findByTestId('search-input', 30_000);
    await search.click();
    await search.sendKeys(Key.chord(MODIFIER, 'a'), Key.BACK_SPACE, 'Serilog');
    await poll(async () => ((await driverOf().findElements(By.css('[data-testid="search-suggestions"] [role="option"]:not([aria-disabled="true"])'))).length > 0 ? true : undefined), 'an enabled suggestion', 60_000);
    report('popup', theme, await contrastAt('[data-testid="search-suggestions"]', false, true), failures);
    await poll(async () => {
        if ((await driverOf().findElements(By.css('[data-testid="search-suggestions"]'))).length === 0) {
            return true;
        }
        await (await findByTestId('search-input')).sendKeys(Key.ESCAPE);
        return undefined;
    }, 'the popup closed', 10_000);
    await (await findByTestId('search-input')).sendKeys(Key.chord(MODIFIER, 'a'), Key.BACK_SPACE);
    await (await findByTestId('installed-tab', 30_000)).click();
}

/** The sidebar's hovered row that is not selected, the pointer put back on the selected one. */
async function sidebarMoment(theme: Theme, failures: string[]): Promise<void> {
    const rows = await rowsOf('sidebar-installed-list');
    const current = rows.find(row => row.current) ?? rows[0];
    const other = rows.find(row => row.id !== current.id) ?? rows[0];
    await hover(other.id);
    report('hover-sidebar', theme, await contrastAt(null, false), failures);
    await hover(current.id);
}

/** Picks `theme` in the Color Theme quick pick by an exact label (`layout.ts`, shared with the capture suite). */
async function selectTheme(theme: Theme): Promise<void> {
    await pickTheme(theme.labels);
}

/** Waits until the webview the driver is in carries the body class of `theme`, which VS Code sets with its variables. */
async function waitForBodyClass(theme: Theme): Promise<void> {
    await poll(async () => {
        const classes = await driverOf().executeScript<string>('return document.body.className;');
        const list = classes.split(/\s+/);
        const other = theme.bodyClass === 'vscode-high-contrast' && list.includes('vscode-high-contrast-light');
        return list.includes(theme.bodyClass) && !other ? true : undefined;
    }, `the body class ${theme.bodyClass}`, 60_000);
}

/**
 * Waits until no CSS transition runs in the webview the driver is in. A theme switch changes the variables at once,
 * and an element with a colour transition (a tab, an icon button) passes through the colours in between; measured
 * then, its contrast is neither the old theme's nor the new one's. Endless animations (spinner, skeleton) are no
 * transitions and do not count.
 */
async function waitForTransitions(): Promise<void> {
    await poll(async () => {
        const running = await driverOf().executeScript<number>(
            'return document.getAnimations().filter(animation => animation instanceof CSSTransition && animation.playState === "running").length;');
        return running === 0 ? true : undefined;
    }, 'the colour transitions to end', 30_000);
}

/**
 * Waits for rows in the webview the driver is in and selects the first, so that the selection colour is measured
 * whatever the files before this one left selected.
 */
async function selectFirstRow(selector: string, what: string): Promise<void> {
    const row = await poll(async () => (await driverOf().findElements(By.css(selector)))[0], what, 120_000);
    await row.click();
    await poll(async () => ((await row.getAttribute('aria-selected')) === 'true' || (await row.getAttribute('aria-current')) === 'true' ? true : undefined), `${what}: the first selected`, 10_000);
}

/**
 * Waits until the content of the webview the driver is in holds still: the same text and the same number of elements
 * in three checks in a row. A section or a details pane that is still filling would otherwise be measured in part.
 */
async function waitForSettledContent(): Promise<void> {
    let last = '';
    let steady = 0;
    await poll(async () => {
        const now = await driverOf().executeScript<string>('return `${document.body.innerText.length}:${document.body.getElementsByTagName("*").length}`;');
        steady = now === last ? steady + 1 : 0;
        last = now;
        return steady >= 2 ? true : undefined;
    }, 'the content to hold still', 60_000);
}

/** Runs axe in the webview the driver is in, once its content holds still and its transitions have ended. */
async function runAxe(): Promise<AxeSummary> {
    const driver = driverOf();
    await waitForSettledContent();
    await waitForTransitions();
    if (!(await driver.executeScript<boolean>('return typeof window.axe !== "undefined";'))) {
        await driver.executeScript(AXE_SOURCE);
    }
    await driver.manage().setTimeouts({ script: 120_000 });
    const answer = JSON.parse(await driver.executeAsyncScript<string>(RUN_AXE, acceptedTargetSelectors())) as AxeSummary & { error?: string };
    expect(answer.error, 'axe.run').to.equal(undefined);
    return answer;
}

/** Asserts the summary of one webview under one theme, and logs what axe could not decide. */
function expectNoViolations(surface: string, theme: Theme, summary: AxeSummary): void {
    const where = `${surface} under ${nameOf(theme)}`;
    const incomplete = Object.entries(summary.incomplete).flatMap(([rule, list]) => list.map(node => `${rule} ${node.target.join(' ')}: ${node.summary}`));
    console.warn(`[theme] ${where}: backgrounds body ${summary.backgrounds.body}, html ${summary.backgrounds.html}; ` +
        `passes ${JSON.stringify(summary.passes)}; incomplete ${incomplete.length}${incomplete.length > 0 ? `\n  ${incomplete.join('\n  ')}` : ''}`);
    // What axe could not decide is the details pane's content below its visible part (ruling (9) of P5.12b): only the
    // contrast rule, and only inside `package-details-panel`; anything else is a finding, whatever the count.
    const acceptedIncomplete = (summary.incomplete['target-size'] ?? []).filter(node => node.accepted !== undefined);
    if (acceptedIncomplete.length > 0) {
        console.warn(`[theme] ${where}: accepted target-size incomplete ${acceptedIncomplete.length} on ${acceptedIncomplete[0].accepted}`);
    }
    for (const [rule, all] of Object.entries(summary.incomplete)) {
        const list = rule === 'target-size' ? all.filter(node => node.accepted === undefined) : all;
        if (list.length === 0) {
            continue;
        }
        expect(rule, `incomplete rule in the ${where}`).to.equal('color-contrast');
        for (const node of list) {
            expect(node.insideDetails, `incomplete node outside the details pane in the ${where}: ${node.target.join(' ')}`).to.equal(true);
        }
    }
    expect(summary.violations['color-contrast'] ?? [], `color-contrast violations in the ${where}`).to.deep.equal([]);
    const targets = summary.violations['target-size'] ?? [];
    const accepted = targets.filter(node => node.accepted !== undefined);
    if (accepted.length > 0) {
        console.warn(`[theme] ${where}: accepted target-size ${accepted.length} on ${accepted[0].accepted}`);
    }
    expect(targets.filter(node => node.accepted === undefined), `target-size violations in the ${where}`).to.deep.equal([]);
    // "No violations" also holds for a rule that did not run: the contrast rule has to have checked text.
    expect(summary.passes['color-contrast'] ?? 0, `color-contrast nodes that passed in the ${where}`).to.be.at.least(10);
}

describe('2.0 theme pass', () => {
    before(async function () {
        this.timeout(240_000);
        // Both surfaces open with their rows and one row selected, so that axe has the content to measure.
        try {
            await openSidebarView();
            await enterSidebarWebview();
            // The fixture project has two packages and one update; both sections are filled before anything is measured.
            await poll(async () => ((await driverOf().findElements(By.css('[data-testid="sidebar-installed-list"] .nuiget-row-option'))).length >= 2 ? true : undefined), 'both installed rows in the sidebar', 120_000);
            await poll(async () => ((await driverOf().findElements(By.css('[data-testid="sidebar-updates-list"] .nuiget-row-option'))).length >= 1 ? true : undefined), 'the update row in the sidebar', 120_000);
            await selectFirstRow('[data-testid="sidebar-installed-list"] .nuiget-row-option', 'rows in the sidebar');
            await leaveWebview();
            await openMainPanel();
            await enterMainWebview();
            // Whichever tab an earlier file left selected, the panel lists rows.
            await selectFirstRow('[data-testid="nuiget-app"] .nuiget-row-option', 'rows in the main panel');
        } finally {
            await leaveWebview();
        }
    });

    afterEach(async () => {
        await leaveWebview();
    });

    after(async function () {
        this.timeout(120_000);
        await selectTheme(THEMES[0]);
        try {
            await enterSidebarWebview();
            await waitForBodyClass(THEMES[0]);
        } finally {
            await leaveWebview();
        }
    });

    /**
     * In a high-contrast theme the buttons, the project selector and the check boxes are drawn with the
     * theme's contrast border (P9.11): read `--vscode-contrastBorder` through a probe and compare each control's line.
     */
    async function expectContrastBorders(where: string): Promise<void> {
        await (await findByTestId('installed-tab', 30_000)).click();
        await findByTestId('package-row-serilog', 120_000);
        const lines = await driverOf().executeScript<Record<string, string>>(`
            const probe = document.createElement('span');
            document.body.appendChild(probe);
            probe.style.color = 'var(--vscode-contrastBorder)';
            const contrast = getComputedStyle(probe).color;
            probe.remove();
            const line = selector => getComputedStyle(document.querySelector(selector)).borderTopColor;
            return { contrast, button: line('.nuiget-button'), select: line('.nuiget-select-input'), checkbox: line('.nuiget-main-toggle input') };
        `);
        expect(lines.contrast, `${where}: the contrast border`).to.not.equal('rgba(0, 0, 0, 0)');
        // Tabs draw no box in high contrast (DS-HC-1); the selected tab's solid and the hovered tab's dashed lines are checked at P3.9.
        for (const control of ['button', 'select', 'checkbox']) {
            expect(lines[control], `${where}: ${control} border`).to.equal(lines.contrast);
        }
    }

    for (const theme of THEMES) {
        it(`${nameOf(theme)}: no contrast or target-size violation in the main panel and the sidebar`, async function () {
            this.timeout(300_000);
            await selectTheme(theme);
            await enterMainWebview();
            await waitForBodyClass(theme);
            // UX-P0.23 (H30): every theme measures the same states, the Updates tab and then the Installed tab, each with
            // its first row selected. Before, the high-contrast check's click on the Installed tab made the themes after
            // it measure another tab than the themes before it (53 against 25 contrast nodes).
            await (await findByTestId('updates-tab', 30_000)).click();
            await selectFirstRow('[data-testid="updates-list"] .nuiget-row-option', 'update rows in the main panel');
            const updates = await runAxe();
            await (await findByTestId('installed-tab', 30_000)).click();
            await selectFirstRow('[data-testid="installed-list"] .nuiget-row-option', 'installed rows in the main panel');
            const installed = await runAxe();
            // UX-P0.25: the contrast moments, the same ordered set in every theme (H30).
            const contrastFailures: string[] = [];
            await mainMoments(theme, contrastFailures);
            if (theme.bodyClass.startsWith('vscode-high-contrast')) {
                await expectContrastBorders(`main panel under ${nameOf(theme)}`);
            }
            await leaveWebview();
            await openSidebarView();
            await enterSidebarWebview();
            await waitForBodyClass(theme);
            await selectFirstRow('[data-testid="sidebar-installed-list"] .nuiget-row-option', 'rows in the sidebar');
            await sidebarMoment(theme, contrastFailures);
            const sidebar = await runAxe();
            await leaveWebview();
            if (CONTRAST_STATUS === 'hard') {
                expect(contrastFailures, `contrast moments under ${nameOf(theme)}`).to.deep.equal([]);
            }
            expectNoViolations('main panel (Updates)', theme, updates);
            expectNoViolations('main panel (Installed)', theme, installed);
            expectNoViolations('sidebar', theme, sidebar);
        });
    }

    // After the axe pass, which measures the Updates and the Installed tab in every theme (UX-P0.23): the
    // Installed tab under a light and a high-contrast theme, for the screenshots of plan item P9.0. The `after` hook
    // puts the first theme back.
    for (const [theme, state] of [[THEMES[1], 'main-installed-single-light'], [THEMES[2], 'main-installed-single-hc']] as const) {
        it(`${nameOf(theme)}: the Installed tab is screenshot (P9.0)`, async function () {
            this.timeout(180_000);
            await selectTheme(theme);
            await openMainPanel();
            await enterMainWebview();
            await waitForBodyClass(theme);
            await (await findByTestId('installed-tab', 30_000)).click();
            await findByTestId('package-row-serilog', 120_000);
            // A pointer focus never matches `:focus-visible`; a key press does: the Newtonsoft.Json row holds keyboard
            // focus, so the capture shows the focus ring (P9.11).
            await (await driverOf().findElements(By.css('[data-testid="package-row-serilog"] .nuiget-row-option')))[0].click();
            // The key goes to the element that has the focus inside the webview (as the sash test does).
            await (await driverOf().switchTo().activeElement()).sendKeys(Key.ARROW_UP);
            await poll(async () => ((await driverOf().executeScript<string | null>('return document.activeElement?.closest(\'[data-testid^="package-row-"]\')?.getAttribute("data-testid") ?? null;')) === 'package-row-newtonsoft.json' ? true : undefined), 'the focus on the Newtonsoft.Json row', 10_000);
            await waitForSettledContent();
            await waitForTransitions();
            await screenshot(state);
        });
    }
});

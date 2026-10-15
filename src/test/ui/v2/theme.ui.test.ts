import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { By, InputBox, Workbench } from 'vscode-extension-tester';
import { enterMainWebview, openMainPanel } from './mainWebview';
import { driverOf, enterSidebarWebview, leaveWebview, openSidebarView, poll } from './sidebarWebview';

/**
 * The theme pass of the 2.0 webviews (plan item P5.11, ruling of 2026-10-16), on a VSIX packaged with `NUIGET_V2=1`:
 * under six of VS Code's built-in themes (dark, light, both high-contrast themes and the 2026 pair), axe-core runs inside the main panel and the sidebar, and neither has a
 * `color-contrast` or a `target-size` (24 px) violation. jsdom cannot measure contrast: the colours exist only in VS
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

interface AxeNode { target: string[]; summary: string }
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
    const nodes = list => list.map(node => ({
        target: node.target.map(String),
        summary: node.failureSummary || node.any.map(check => check.message).join('; '),
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

/** Picks `theme` in the Color Theme quick pick by an exact label (a filter for one label also shows longer ones). */
async function selectTheme(theme: Theme): Promise<void> {
    await poll(async () => {
        await driverOf().switchTo().defaultContent();
        await new Workbench().executeCommand('Preferences: Color Theme');
        const input = await InputBox.create();
        const offered: string[] = [];
        for (const label of theme.labels) {
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
    }, `the theme "${nameOf(theme)}" in the quick pick`, 60_000);
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
    const answer = JSON.parse(await driver.executeAsyncScript<string>(RUN_AXE)) as AxeSummary & { error?: string };
    expect(answer.error, 'axe.run').to.equal(undefined);
    return answer;
}

/** Asserts the summary of one webview under one theme, and logs what axe could not decide. */
function expectNoViolations(surface: string, theme: Theme, summary: AxeSummary): void {
    const where = `${surface} under ${nameOf(theme)}`;
    const incomplete = Object.entries(summary.incomplete).flatMap(([rule, list]) => list.map(node => `${rule} ${node.target.join(' ')}: ${node.summary}`));
    console.warn(`[theme] ${where}: backgrounds body ${summary.backgrounds.body}, html ${summary.backgrounds.html}; ` +
        `passes ${JSON.stringify(summary.passes)}; incomplete ${incomplete.length}${incomplete.length > 0 ? `\n  ${incomplete.join('\n  ')}` : ''}`);
    expect(summary.violations['color-contrast'] ?? [], `color-contrast violations in the ${where}`).to.deep.equal([]);
    expect(summary.violations['target-size'] ?? [], `target-size violations in the ${where}`).to.deep.equal([]);
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
            await poll(async () => ((await driverOf().findElements(By.css('[data-testid="sidebar-installed-list"] [role="option"]'))).length >= 2 ? true : undefined), 'both installed rows in the sidebar', 120_000);
            await poll(async () => ((await driverOf().findElements(By.css('[data-testid="sidebar-updates-list"] [role="option"]'))).length >= 1 ? true : undefined), 'the update row in the sidebar', 120_000);
            await selectFirstRow('[data-testid="sidebar-installed-list"] [role="option"]', 'rows in the sidebar');
            await leaveWebview();
            await openMainPanel();
            await enterMainWebview();
            // Whichever tab an earlier file left selected, the panel lists rows.
            await selectFirstRow('[data-testid="nuiget-app"] [role="option"]', 'rows in the main panel');
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

    for (const theme of THEMES) {
        it(`${nameOf(theme)}: no contrast or target-size violation in the main panel and the sidebar`, async function () {
            this.timeout(300_000);
            await selectTheme(theme);
            await enterMainWebview();
            await waitForBodyClass(theme);
            const main = await runAxe();
            await leaveWebview();
            await openSidebarView();
            await enterSidebarWebview();
            await waitForBodyClass(theme);
            const sidebar = await runAxe();
            await leaveWebview();
            expectNoViolations('main panel', theme, main);
            expectNoViolations('sidebar', theme, sidebar);
        });
    }
});

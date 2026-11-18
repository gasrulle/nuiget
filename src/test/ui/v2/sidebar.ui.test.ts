import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { ActivityBar, By, EditorView, Key, NotificationType, Origin, type WebElement, Workbench } from 'vscode-extension-tester';
import { FEEDBACK_STATUS, feedbackLines } from './a11y';

/** The notification centre's texts, of every severity and of information ones; cleared after the read when `clear` (UX-P4.7). */
async function readNotificationCentre(clear: boolean): Promise<{ info: string[]; all: string[]; }> {
    await leaveWebview();
    const center = await new Workbench().openNotificationsCenter();
    const texts = async (type: NotificationType): Promise<string[]> => Promise.all((await center.getNotifications(type)).map(notification => notification.getMessage()));
    const read = { info: await texts(NotificationType.Info), all: await texts(NotificationType.Any) };
    if (clear) {
        await center.clearAllNotifications();
    }
    await center.close().catch(() => undefined);
    return read;
}
import { driverOf, enterSidebarWebview, findByTestId, leaveWebview, openSidebarView, poll, screenshot, tokenPx, typeHeld, waitForTestIdGone, waitForText } from './sidebarWebview';

/**
 * The 2.0 sidebar in VS Code (plan item P3.5), on the VSIX that `npm run test:ui` packages: the first time the 2.0
 * webview is loaded by a real host under its Content Security Policy. It shows the P3 gate: the sidebar lists
 * the installed packages and uninstalls one. The main panel is never opened; its 2.0 entry is a placeholder.
 */
describe('2.0 sidebar', () => {
    const csprojPath = path.resolve('src/test/e2e/fixtures/e2e-workspace/TestProject.csproj');
    let originalCsproj: string | undefined;

    const serilogOption = async () => (await findByTestId('package-row-serilog')).findElement(By.css('.nuiget-row-option'));

    before(() => {
        originalCsproj = fs.readFileSync(csprojPath, 'utf-8');
    });

    after(() => {
        // The fixture project is shared with the 1.x suites: leave it as it was found.
        if (originalCsproj !== undefined) {
            fs.writeFileSync(csprojPath, originalCsproj, 'utf-8');
        }
    });

    afterEach(async () => {
        await leaveWebview();
    });

    // SB14 (UX-P3.8, design-advisor ruling of 2026-11-13): the box takes the focus when the view takes it, as the Extensions
    // view's box does; the view's own focus command gives the view the focus (an activity-bar open leaves it nowhere).
    it('the sidebar search box takes the focus when the view takes it (SB14, UX-P3.8)', async function () {
        this.timeout(120_000);
        await openSidebarView();
        // The webviews are reloaded so the sidebar mounts afresh before the view is given the focus: the case reads a fresh
        // document (the claim on every later focus gain is read by the cases of UX-P4.fix-4 below).
        await new Workbench().executeCommand('Developer: Reload Webviews');
        await enterSidebarWebview();
        await findByTestId('sidebar-search-input', 60_000);
        // The command is held inside the wait (re-run while the box is not the focused view's active element), as a tab
        // click whose effect a wait depends on is (the gotcha row "An attribute read once right after a click in a UI test").
        let probes = 0;
        const active = await poll(async () => {
            if (probes++ % 8 === 0) {
                await leaveWebview();
                await new Workbench().executeCommand('nuiget.sidebarView.focus');
                await enterSidebarWebview();
            }
            const id = await driverOf().executeScript<string | null>('return document.hasFocus() && document.activeElement ? document.activeElement.getAttribute("data-testid") : null;');
            return id === 'sidebar-search-input' ? id : undefined;
        }, 'the sidebar search box as the active element of the focused view', 30_000);
        expect(active).to.equal('sidebar-search-input');
    });

    it('the sidebar search box rings in focusBorder at offset -1 (DS-FOCUS-1, UX-P2.4)', async function () {
        this.timeout(120_000);
        await openSidebarView();
        await enterSidebarWebview();
        await (await findByTestId('sidebar-search-input', 60_000)).click();
        const ring = await driverOf().executeScript<{ width: string; style: string; offset: string; colour: string; focus: string }>(`
            const style = getComputedStyle(document.activeElement);
            const probe = document.createElement('span');
            probe.style.color = 'var(--vscode-focusBorder)';
            document.body.append(probe);
            const focus = getComputedStyle(probe).color;
            probe.remove();
            return { width: style.outlineWidth, style: style.outlineStyle, offset: style.outlineOffset, colour: style.outlineColor, focus };`);
        expect([ring.width, ring.style, ring.offset, ring.colour]).to.deep.equal(['1px', 'solid', '-1px', ring.focus]);
    });

    it('renders the installed packages of the fixture project', async function () {
        this.timeout(180_000);
        await openSidebarView();
        await enterSidebarWebview();
        for (const testId of ['nuiget-sidebar', 'sidebar-search-input', 'section-header-installed', 'status-live']) {
            await findByTestId(testId);
        }
        // The first list needs the SDK probe and the project's sources: generous, and still bounded.
        const list = await findByTestId('sidebar-installed-list', 120_000);
        expect(await list.getAttribute('role')).to.equal('listbox');
        await findByTestId('package-row-newtonsoft.json');
        const serilog = await serilogOption();
        expect(await serilog.getText()).to.contain('Serilog').and.to.contain('3.1.1');
        // Both sections filled before the screenshot: the fixture project has one update.
        await poll(async () => ((await driverOf().findElements(By.css('[data-testid="sidebar-updates-list"] .nuiget-row-option'))).length > 0 ? true : undefined), 'the update row', 120_000);
        await screenshot('sidebar-sections');
    });

    /** The side bar part of the workbench, outside the webview. */
    const sideBarWidth = async (): Promise<number> => {
        await leaveWebview();
        return Math.round((await driverOf().findElement(By.id('workbench.parts.sidebar')).getRect()).width);
    };

    /** Drags the sash at the right edge of the side bar until the side bar is `width` px wide. */
    const dragSideBarTo = async (width: number): Promise<void> => {
        const part = await driverOf().findElement(By.id('workbench.parts.sidebar'));
        const edge = await part.getRect();
        const right = edge.x + edge.width;
        let sash: WebElement | undefined;
        for (const candidate of await driverOf().findElements(By.css('.monaco-sash.vertical'))) {
            const rect = await candidate.getRect();
            if (rect.height > edge.height / 2 && Math.abs(rect.x + rect.width / 2 - right) <= 4) {
                sash = candidate;
            }
        }
        if (sash === undefined) {
            throw new Error(`no vertical sash at x=${right}`);
        }
        await driverOf().actions().move({ origin: sash }).press().move({ origin: Origin.POINTER, x: Math.round(width - edge.width), y: 0 }).release().perform();
        await poll(async () => (Math.abs((await sideBarWidth()) - width) <= 2 ? true : undefined), `the side bar at ${width} px`, 10_000);
    };

    it('at 200 px the side bar keeps both sections (P9.0)', async function () {
        this.timeout(180_000);
        await openSidebarView();
        const original = await sideBarWidth();
        try {
            await dragSideBarTo(200);
            await enterSidebarWebview();
            // The webview follows the part: wait for its layout at the new width before the screenshot.
            await poll(async () => ((await driverOf().executeScript<number>('return document.querySelector(\'[data-testid="nuiget-sidebar"]\').getBoundingClientRect().width;')) <= 200 ? true : undefined), 'the sidebar laid out at 200 px', 10_000);
            await findByTestId('package-row-serilog', 60_000);
            await findByTestId('sidebar-updates-list', 60_000);
            await screenshot('sidebar-narrow-200px');
        } finally {
            // The theme pass measures target sizes in the sidebar at its usual width.
            await leaveWebview();
            await dragSideBarTo(original);
        }
    });

    it('narrow sidebar keeps package name visible', async function () {
        this.timeout(180_000);
        await openSidebarView();
        const original = await sideBarWidth();
        try {
            await dragSideBarTo(200);
            await enterSidebarWebview();
            await poll(async () => ((await driverOf().executeScript<number>('return document.querySelector(\'[data-testid="nuiget-sidebar"]\').getBoundingClientRect().width;')) <= 200 ? true : undefined), 'the sidebar laid out at 200 px', 10_000);
            await findByTestId('package-row-serilog', 60_000);
            await poll(async () => ((await driverOf().findElements(By.css('[data-testid="sidebar-updates-list"] .nuiget-row-option'))).length > 0 ? true : undefined), 'an update row', 60_000);
            type Measured = { list: string; name: string; nameWidth: number; nameScroll: number; versionWidth: number };
            const rows = await driverOf().executeScript<Measured[]>(`
                return [...document.querySelectorAll('[data-testid="sidebar-installed-list"] .nuiget-row-option, [data-testid="sidebar-updates-list"] .nuiget-row-option')].map(option => {
                    const name = option.querySelector('.nuiget-row-name');
                    const version = option.querySelector('.nuiget-row-version');
                    return { list: option.closest('[role="listbox"]').getAttribute('data-testid'), name: name.textContent, nameWidth: name.clientWidth, nameScroll: name.scrollWidth, versionWidth: version ? version.clientWidth : 0 };
                });
            `);
            expect(rows.filter(row => row.list === 'sidebar-installed-list').map(row => row.name)).to.deep.equal(['Newtonsoft.Json', 'Serilog']);
            for (const row of rows) {
                // The name is never the part that gives way to a long version (the owner's overflow bug, P9.2): it is
                // whole, or it is cut only by its cap and still at least as wide as the version beside it.
                expect(row.nameWidth, `${row.list} ${row.name}`).to.be.greaterThan(0);
                if (row.nameScroll > row.nameWidth) {
                    expect(row.nameWidth, `${row.list} ${row.name} is cut`).to.be.at.least(row.versionWidth);
                }
            }
            const serilog = rows.find(row => row.list === 'sidebar-installed-list' && row.name === 'Serilog');
            expect(serilog?.nameScroll, 'Serilog is not cut').to.be.at.most(serilog?.nameWidth ?? 0);
            console.warn(`[P9.10] 200 px rows: ${JSON.stringify(rows)}`);
        } finally {
            await leaveWebview();
            await dragSideBarTo(original);
        }
    });

    it('lays the rows out from the stylesheet under the CSP', async function () {
        this.timeout(120_000);
        await openSidebarView();
        await enterSidebarWebview();
        await findByTestId('package-row-serilog', 120_000);
        const layout = await driverOf().executeScript<{ rows: Array<{ index: number; y: number; height: number; offset: string }>; color: string; rootHeight: number }>(`
            const rows = [...document.querySelectorAll('[data-testid="sidebar-installed-list"] [data-index]')].map(row => {
                const box = row.getBoundingClientRect();
                return { index: Number(row.getAttribute('data-index')), y: box.y, height: box.height, offset: row.style.getPropertyValue('--nuiget-virtual-offset') };
            }).sort((a, b) => a.index - b.index);
            const root = document.querySelector('[data-testid="nuiget-sidebar"]');
            return { rows, color: getComputedStyle(root).color, rootHeight: root.getBoundingClientRect().height };
        `);
        const rowHeight = tokenPx('--nuiget-row-height-compact');
        expect(layout.rows.map(row => row.index)).to.deep.equal([0, 1]);
        // The stylesheet is loaded and the tokens resolve: a row is as high as the token says.
        expect(layout.rows.map(row => Math.round(row.height))).to.deep.equal([rowHeight, rowHeight]);
        // The offsets React sets as custom properties (CSSOM) are allowed by the policy and used by the stylesheet:
        // the second row is under the first, not on top of it.
        expect(layout.rows[1].offset).to.equal(`${rowHeight}px`);
        expect(layout.rows[1].y).to.be.at.least(layout.rows[0].y + layout.rows[0].height - 0.5);
        // The colour token resolves to a colour of the theme, and the shell fills the view.
        expect(layout.color).to.match(/^rgba?\(/).and.not.to.equal('rgba(0, 0, 0, 0)');
        expect(layout.rootHeight).to.be.greaterThan(rowHeight * 2);
    });

    it('shows the uninstall action when a row has focus', async function () {
        this.timeout(120_000);
        await openSidebarView();
        await enterSidebarWebview();
        const option = await serilogOption();
        await option.click();
        const row = await findByTestId('package-row-serilog');
        const action = await findByTestId('row-action-uninstall', 10_000, row);
        expect(await action.isDisplayed(), 'the action of the focused row').to.equal(true);
        // The other row has neither the pointer nor the focus: its action is there and not shown.
        const other = await findByTestId('row-action-uninstall', 10_000, await findByTestId('package-row-newtonsoft.json'));
        expect(await other.isDisplayed(), 'the action of the other row').to.equal(false);
    });

    /** Whether an element with this test id is in the sidebar now. */
    const present = async (testId: string): Promise<boolean> => (await driverOf().findElements(By.css(`[data-testid="${testId}"]`))).length > 0;

    it('@installed and @updates show one section alone; other text shows the browse results (P5.12b)', async function () {
        this.timeout(180_000);
        await openSidebarView();
        await enterSidebarWebview();
        const search = await findByTestId('sidebar-search-input');
        const replaceText = async (text: string): Promise<void> => typeHeld(search, text, `the sidebar box typed "${text}"`);

        await replaceText('@installed');
        await poll(async () => (await present('sidebar-installed-list')) && !(await present('sidebar-updates-list')) ? true : undefined, 'the Installed section alone', 30_000);
        await replaceText('@updates');
        await poll(async () => (await present('sidebar-updates-list')) && !(await present('sidebar-installed-list')) ? true : undefined, 'the Updates section alone', 60_000);
        await replaceText('Serilog');
        await search.sendKeys(Key.ENTER);
        await findByTestId('sidebar-browse-list', 120_000);

        await replaceText('');
        await poll(async () => (await present('sidebar-installed-list')) && (await present('sidebar-updates-list')) ? true : undefined, 'both sections again', 30_000);
    });

    it('a section header collapses its list and opens it again (P5.12b)', async function () {
        this.timeout(120_000);
        await openSidebarView();
        await enterSidebarWebview();
        const header = await findByTestId('section-header-installed');
        await findByTestId('sidebar-installed-list', 60_000);
        expect(await header.getAttribute('aria-expanded')).to.equal('true');

        await header.click();
        await poll(async () => ((await header.getAttribute('aria-expanded')) === 'false' ? true : undefined), 'the Installed section collapsed', 10_000);
        await waitForTestIdGone('sidebar-installed-list', 10_000);

        await header.click();
        await poll(async () => ((await header.getAttribute('aria-expanded')) === 'true' ? true : undefined), 'the Installed section open', 10_000);
        await findByTestId('sidebar-installed-list', 10_000);
    });

    it('uninstalls through the sidebar and the project file follows', async function () {
        this.timeout(300_000);
        // UX-P4.7 (DS-STATE-5; design-advisor follow-up ruling of 2026-11-18): the centre cleared before the operation, so the read
        // after it holds what this operation raised; what was cleared is listed in the line.
        const clearedBefore = (await readNotificationCentre(true)).all;
        await openSidebarView();
        await enterSidebarWebview();
        const option = await serilogOption();
        await option.click();
        await option.sendKeys(Key.DELETE);
        // Delete asks first since UX-P4.2b: confirm in the sidebar's own dialog.
        await (await findByTestId('confirm-dialog-confirm', 10_000)).click();

        // The outcome is announced, and the row leaves with the host's next list; the restore may take a while.
        await waitForText('status-live', 'Uninstalled Serilog', 180_000);
        // UX-P4.7 (DS-STATE-5; design-advisor ruling of 2026-11-18, DO 10): a single success raises no notification and the live
        // region says it. Read in the notification centre, which keeps a notification after its toast hides; never through the
        // palette. What the operation raised is cleared after the read.
        const said = (await (await findByTestId('status-live')).getAttribute('textContent')) ?? '';
        // Read once after the operation, nothing cleared in between; what it raised is cleared after the read.
        const after = await readNotificationCentre(true);
        const feedback = feedbackLines('sidebar', { done: 'Uninstalled', packageId: 'Serilog' }, after, clearedBefore, said);
        console.warn(feedback.lines[0]);
        await enterSidebarWebview();
        if (FEEDBACK_STATUS === 'hard' && feedback.failures.length > 0) {
            throw new Error(`[feedback] ${feedback.failures.join('; ')}`);
        }
        await waitForTestIdGone('package-row-serilog', 120_000);
        await findByTestId('package-row-newtonsoft.json');

        await leaveWebview();
        const csproj = fs.readFileSync(csprojPath, 'utf-8');
        expect(csproj).not.to.contain('Include="Serilog"');
        expect(csproj).to.contain('Include="Newtonsoft.Json"');
    });

    // UX-P4.fix-4 (design-advisor follow-up ruling and architecture-advisor third ruling of 2026-11-17): where the focus lands
    // when the side bar is shown, nUIget's side of the exemplar's readings of run 44149001126 (VS Code 1.140.0). Each case
    // builds its own start, and the `afterEach` restores the workbench: a case that times out keeps its driver calls pending
    // (the gotcha row "A UI case that outlives its Mocha timeout").
    describe('where the focus lands when the side bar is shown (SB14, UX-P4.fix-4)', () => {
        const EDITOR_PART = '.part.editor';
        const TOGGLE = 'Toggle Primary Side Bar Visibility';
        /** How long a reading must hold: the host's visibility send, removed by UX-P4.fix-4, moved the focus after about 300 ms. */
        const HOLD_MS = 1_500;
        interface Top { windowFocused: boolean; inEditor: boolean }
        interface Frame { focused: boolean; active: string }

        const releaseKeys = async (): Promise<void> => {
            await leaveWebview();
            await driverOf().actions().clear();
        };
        const readTop = async (): Promise<Top> => {
            await leaveWebview();
            return driverOf().executeScript<Top>(
                'const active = document.activeElement; return { windowFocused: document.hasFocus(), inEditor: Boolean(active) && Boolean(active.closest(arguments[0])) };',
                EDITOR_PART);
        };
        const readFrame = async (): Promise<Frame> => {
            try {
                await enterSidebarWebview(5_000);
                return await driverOf().executeScript<Frame>(
                    'const active = document.activeElement; return { focused: document.hasFocus(), active: active ? active.getAttribute("data-testid") || active.tagName.toLowerCase() : "none" };');
            } finally {
                await leaveWebview();
            }
        };
        /** A reading that holds for `HOLD_MS`, read with the file's `poll`; the last reading is named when it never does. */
        const held = async <T>(read: () => Promise<T>, holds: (value: T) => boolean, what: string): Promise<T> => {
            let since: number | undefined;
            let last: T | undefined;
            try {
                return await poll(async () => {
                    last = await read();
                    if (!holds(last)) {
                        since = undefined;
                        return undefined;
                    }
                    since ??= Date.now();
                    return Date.now() - since >= HOLD_MS ? last : undefined;
                }, `${what} for ${HOLD_MS} ms`, 15_000);
            } catch (error) {
                throw new Error(`${error instanceof Error ? error.message : String(error)}; last reading ${JSON.stringify(last)}`, { cause: error });
            }
        };
        /** Runs the first palette row whose label matches; throws when none does. */
        const runLooked = async (words: string, matches: (label: string) => boolean): Promise<string> => {
            await leaveWebview();
            const prompt = await new Workbench().openCommandPrompt();
            await prompt.setText(`>${words}`);
            const chosen = await poll(async () => {
                for (const pick of (await prompt.getQuickPicks()).slice(0, 5)) {
                    const label = await pick.getLabel();
                    if (matches(label)) {
                        return label;
                    }
                }
                return undefined;
            }, `a palette row for "${words}"`, 10_000);
            await prompt.selectQuickPick(chosen);
            await releaseKeys();
            return chosen;
        };
        const sideBarShown = (): Promise<boolean> => driverOf().executeScript<boolean>(
            'const part = document.querySelector(".part.sidebar"); return Boolean(part) && getComputedStyle(part).display !== "none" && part.getBoundingClientRect().width > 0;');
        const showExplorer = async (): Promise<void> => {
            await releaseKeys();
            const control = await poll(async () => new ActivityBar().getViewControl('Explorer'), 'the Explorer view control', 20_000);
            await control.openView();
        };
        // Go to File, not `VSBrowser.openResources`: that failed for this file on a local run (macOS, 2026-11-17).
        const openProjectFile = async (): Promise<void> => {
            await releaseKeys();
            const prompt = await new Workbench().openCommandPrompt();
            await prompt.setText(path.basename(csprojPath));
            const pick = await poll(async () => {
                for (const candidate of await prompt.getQuickPicks()) {
                    if ((await candidate.getLabel()) === path.basename(csprojPath)) {
                        return candidate;
                    }
                }
                return undefined;
            }, 'the project file in Go to File', 10_000);
            await pick.select();
            await releaseKeys();
            await poll(async () => ((await driverOf().findElements(By.css(`${EDITOR_PART} .monaco-editor .view-lines`))).length > 0 ? true : undefined), 'the project file in an editor', 10_000);
        };
        /** The project file open and its editor focused, read as focused; a start that cannot be built throws. */
        const startInEditor = async (): Promise<void> => {
            await openProjectFile();
            const lines = await poll(async () => (await driverOf().findElements(By.css(`${EDITOR_PART} .monaco-editor .view-lines`)))[0], 'the editor text', 20_000);
            await lines.click();
            await releaseKeys();
            await poll(async () => {
                const top = await readTop();
                return top.windowFocused && top.inEditor ? true : undefined;
            }, 'the editor as the focused element', 10_000);
        };
        /** The view shown and its search box focused once, so the side bar's document has claimed the focus before. */
        const claimOnce = async (): Promise<void> => {
            await releaseKeys();
            await openSidebarView();
            await enterSidebarWebview();
            await (await findByTestId('sidebar-search-input', 60_000)).click();
            await poll(async () => (await driverOf().executeScript<string | null>('return document.activeElement ? document.activeElement.getAttribute("data-testid") : null;')) === 'sidebar-search-input' ? true : undefined,
                'the search box focused by a click', 10_000);
            await releaseKeys();
        };
        const boxFocused = (frame: Frame): boolean => frame.focused && frame.active === 'sidebar-search-input';

        afterEach(async function () {
            this.timeout(60_000);
            await releaseKeys().catch(() => undefined);
            await new EditorView().closeAllEditors().catch(() => undefined);
            if (!(await sideBarShown().catch(() => true))) {
                await runLooked(TOGGLE, shown => shown.includes(TOGGLE)).catch(() => undefined);
            }
            await openSidebarView().catch(() => undefined);
            await releaseKeys().catch(() => undefined);
        });

        it('hiding and showing the side bar leaves the focus in the editor (SB14, UX-P4.fix-4)', async function () {
            this.timeout(120_000);
            await claimOnce();
            await startInEditor();
            const toggle = await runLooked(TOGGLE, shown => shown.includes(TOGGLE));
            await poll(async () => ((await sideBarShown()) ? undefined : true), 'the side bar hidden', 10_000);
            await runLooked(TOGGLE, shown => shown === toggle);
            await poll(async () => ((await sideBarShown()) ? true : undefined), 'the side bar shown again', 10_000);
            const reading = await held(async () => ({ top: await readTop(), frame: await readFrame() }),
                ({ top, frame }) => top.windowFocused && top.inEditor && !frame.focused, 'the focus in the editor and none in the side bar');
            expect(reading.top.inEditor).to.equal(true);
            expect(reading.frame.focused).to.equal(false);
        });

        it('shown from the activity bar after an editor had the focus, the search box takes it again (SB14, UX-P4.fix-4)', async function () {
            this.timeout(120_000);
            await claimOnce();
            await showExplorer();
            await startInEditor();
            await releaseKeys();
            await openSidebarView();
            const frame = await held(readFrame, boxFocused, 'the side bar focused with the search box active');
            expect(frame.active).to.equal('sidebar-search-input');
        });

        it('the view\'s focus command gives the search box the focus again (SB14, UX-P4.fix-4)', async function () {
            this.timeout(120_000);
            await claimOnce();
            await showExplorer();
            await startInEditor();
            await runLooked('nuiget.sidebarView.focus', shown => /nuiget/i.test(shown) && /focus/i.test(shown));
            const frame = await held(readFrame, boxFocused, 'the side bar focused with the search box active');
            expect(frame.active).to.equal('sidebar-search-input');
        });

        it('a press on an empty spot of the view focuses the view and not the search box (SB14, UX-P4.fix-4)', async function () {
            this.timeout(120_000);
            await claimOnce();
            await startInEditor();
            await enterSidebarWebview(10_000);
            const scope = '[data-testid="nuiget-sidebar"]';
            const origin = await driverOf().findElement(By.css(scope));
            // A point of the view whose element has no focusable ancestor, scanned from the bottom up.
            const spot = await driverOf().executeScript<{ dx: number; dy: number } | null>(`
                const root = document.querySelector(arguments[0]);
                const rect = root.getBoundingClientRect();
                const focusable = '[tabindex], input, button, a[href], textarea, select, [contenteditable], .monaco-list, iframe';
                for (let y = rect.bottom - 4; y > rect.top + 4; y -= 8) {
                    for (const x of [rect.left + rect.width / 2, rect.left + 6, rect.right - 6]) {
                        const element = document.elementFromPoint(x, y);
                        if (element && root.contains(element) && !element.closest(focusable)) {
                            return { dx: Math.round(x - (rect.left + rect.width / 2)), dy: Math.round(y - (rect.top + rect.height / 2)) };
                        }
                    }
                }
                return null;`, scope);
            if (spot === null) {
                throw new Error(`no spot without a focusable ancestor in ${scope}`);
            }
            await driverOf().actions().move({ origin, x: spot.dx, y: spot.dy }).press().release().perform();
            await releaseKeys();
            const frame = await held(readFrame, value => value.focused && value.active === 'body', 'the side bar focused with the body active');
            expect(frame.active).to.equal('body');
        });
    });
});

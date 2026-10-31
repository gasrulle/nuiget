// @vitest-environment jsdom
import axe from 'axe-core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { acceptedSelectors, acceptedTargetSelectors, ARIA_SNAPSHOT, CONTRAST_PENDING, CONTRAST_STATUS, type ContrastPair, type ContrastRun, LAYER_SELECTOR, momentLines, MOMENTS, pairContrast, type Resolved, RESOLVE_CONTRAST, resolvedLines, RUN_CONTRAST, TEXTS_UNDER, type AriaNode, ariaLine, ariaLineFor, ariaSnapshot, AXE_ACCEPTED, AXE_EXTRA_RULES, AXE_PENDING, type AxeRule, axeLines, compareAria, DESCRIBE_FOCUS, type FocusFacts, focusLine, FULL_AXE_RULE, FULL_AXE_STATUS, type FullAxe, KEYS_AWAITING_ARIA, KEYS_EXPECTED, KEYS_PENDING, KEYS_STATUS, keysLines, maskDigits, MOTION_STATUS, type MotionFacts, motionLines, RUN_FULL_AXE, RUNNING_ANIMATIONS, showsRing } from '../ui/v2/a11y';
import { trackerStatuses } from '../../../scripts/check-design-tokens.mjs';

/**
 * UX-P0.23: the accessibility harness of the capture suite (`src/test/ui/v2/a11y.ts`). The scripts run inside VS Code
 * only in the UI job; here they run on jsdom with the same axe-core, and the verdicts on hand-built results.
 */
beforeAll(() => {
    (window as unknown as { axe: typeof axe }).axe = axe;
});

afterEach(() => {
    document.body.innerHTML = '';
});

/** A rule's result; `outsideDetails` counts the given nodes unless set (a capped list leaves nodes out). */
const rule = (id: string, nodes: Array<Partial<AxeRule['nodes'][number]>>, count = nodes.length, outsideDetails?: number, accepted: Record<string, number> = {}): AxeRule => {
    const full = nodes.map(node => ({ target: '.x', summary: '', insideDetails: false, ...node }));
    return { id, impact: 'serious', count, outsideDetails: outsideDetails ?? full.filter(node => !node.insideDetails).length, reasons: [], accepted, nodes: full };
};
const result = (overrides: Partial<FullAxe> = {}): FullAxe => ({ violations: [], incomplete: [], passes: 40, inapplicable: 50, ...overrides });

/** Runs an `executeAsyncScript` body: the arguments, then the callback last. */
const runAsync = (source: string, ...args: unknown[]): Promise<string> =>
    new Promise(resolve => {
        new Function(source).apply(null, [...args, resolve]);
    });

describe('the accessibility harness (UX-P0.23)', () => {
    it('holds the full-axe rule hard since its first run was triaged, turns on the two rules axe leaves off, and names an owner or a decision for every known result', () => {
        expect(FULL_AXE_RULE).toBe('a11y-full-axe-real-page');
        expect(FULL_AXE_STATUS).toBe('hard');
        expect(AXE_EXTRA_RULES).toEqual(['target-size', 'label-content-name-mismatch']);
        // The design-advisor ruling of 2026-10-25 (UX-P0.25): the resolve pass decided the three undecided contrast cases of
        // UX-P0.23 in every state (run 40152178889), so no result is pending.
        expect(AXE_PENDING).toEqual([]);
        expect(AXE_ACCEPTED.map(entry => `${entry.rule} ${entry.selector ?? entry.surface}`)).toEqual(['label-content-name-mismatch .nuiget-row-option', 'page-has-heading-one sidebar', 'target-size .nuiget-icon-button', 'target-size .nuiget-icon-button', 'target-size .nuiget-section-toggle', 'target-size .nuiget-section-toggle', 'target-size .nuiget-row-group', 'target-size .nuiget-row-group']);
        expect(acceptedSelectors()).toEqual(['.nuiget-row-option', '.nuiget-icon-button', '.nuiget-section-toggle', '.nuiget-row-group']);
        expect(acceptedTargetSelectors()).toEqual(['.nuiget-icon-button', '.nuiget-section-toggle', '.nuiget-row-group']);
    });

    it('accepts a violation a decision declares only on its selector or its surface', () => {
        const rows = rule('label-content-name-mismatch', [{ target: '#r-option-0' }], 15, 15, { '.nuiget-row-option': 15 });
        const heading = rule('page-has-heading-one', [{ target: 'html' }]);
        const accepted = axeLines('sidebar-sections', 'sidebar', result({ violations: [rows, heading] }), 'hard', []);
        expect(accepted.lines.slice(1)).toEqual([
            '[axe] sidebar-sections: violation label-content-name-mismatch ×15 on .nuiget-row-option (accepted-as-design: DECISIONS.md 2026-10-25: the row keeps its triad)',
            '[axe] sidebar-sections: violation page-has-heading-one ×1 on the sidebar (accepted-as-design: DECISIONS.md 2026-10-25: the sidebar view has no h1)',
        ]);
        expect(accepted.failures).toEqual([]);
        // UX-P2.6a: a rule whose nodes span two declared selectors; a node on none of them still fails.
        const spanning = (count: number) => rule('target-size', [{ target: '.a' }], count, count, { '.nuiget-section-toggle': 2, '.nuiget-icon-button': 1 });
        const spans = axeLines('sidebar-sections', 'sidebar', result({ violations: [spanning(3)] }), 'hard', []);
        expect(spans.failures).toEqual([]);
        expect(spans.lines[1]).toContain('violation target-size ×3 on .nuiget-icon-button ×1, .nuiget-section-toggle ×2 (accepted-as-design:');
        expect(axeLines('sidebar-sections', 'sidebar', result({ violations: [spanning(4)] }), 'hard', []).failures).toEqual(['violation target-size ×4']);
        const groups = axeLines('main-installed-single', 'main', result({ incomplete: [rule('target-size', [{ target: '.a' }], 2, 2, { '.nuiget-row-group': 1, '.nuiget-icon-button': 1 })] }), 'hard', []);
        expect(groups.failures).toEqual([]);
        expect(groups.lines[1]).toContain('incomplete target-size ×2 on .nuiget-icon-button ×1, .nuiget-row-group ×1');
        // Not a pending line: the capture suite's pending list leaves it out.
        expect(accepted.lines.filter(line => /\(pending [^)]+\)$/.test(line))).toEqual([]);
        // One node off a row option, or the heading rule on the main panel, fails.
        const offRow = rule('label-content-name-mismatch', [{ target: '#tab' }], 16, 16, { '.nuiget-row-option': 15 });
        expect(axeLines('main-installed-single', 'main', result({ violations: [offRow, heading] }), 'hard', []).failures).toEqual([
            'violation label-content-name-mismatch ×16', 'violation page-has-heading-one ×1',
        ]);
    });

    it('fails a violation or an incomplete result unless an item is named for it; tolerates contrast it cannot decide in the details pane', () => {
        const clean = axeLines('main-installed-single', 'main', result(), 'hard', []);
        expect(clean).toEqual({ lines: ['[axe] main-installed-single: 0 violations, 0 incomplete, 40 rules passed, 50 inapplicable (a11y-full-axe-real-page, hard)'], failures: [] });
        const found = axeLines('main-installed-single', 'main', result({
            violations: [rule('button-name', [{ target: '.a' }, { target: '.b' }, { target: '.c' }], 5)],
            incomplete: [rule('color-contrast', [{ insideDetails: true }, { insideDetails: true }]), rule('aria-hidden-focus', [{ target: '.d' }])],
        }), 'hard', [{ rule: 'aria-hidden-focus', kind: 'incomplete', item: 'P2.1a', states: ['main-installed-single'] }]);
        expect(found.lines).toEqual([
            '[axe] main-installed-single: 1 violations, 2 incomplete, 40 rules passed, 50 inapplicable (a11y-full-axe-real-page, hard)',
            '[axe] main-installed-single: violation button-name (serious) ×5: .a, .b (hard)',
            '[axe] main-installed-single: incomplete color-contrast ×2 in the details pane (tolerated until P3.4)',
            '[axe] main-installed-single: incomplete aria-hidden-focus ×1: .d (pending P2.1a)',
        ]);
        expect(found.failures).toEqual(['violation button-name ×5']);
        // UX-P2.5: an icon button's `target-size` incomplete is declared by DS-HEIGHT-8's hit; a node off the selector still fails.
        const icons = (onSelector: number) => result({ incomplete: [rule('target-size', [{ target: '.f' }, { target: '.g' }], 2, undefined, { '.nuiget-icon-button': onSelector })] });
        const declared = axeLines('main-updates', 'main', icons(2), 'hard', []);
        expect(declared.failures).toEqual([]);
        expect(declared.lines[1]).toContain('incomplete target-size ×2 on .nuiget-icon-button (accepted-as-design: DECISIONS.md 2026-10-31');
        expect(axeLines('main-updates', 'main', icons(1), 'hard', []).failures).toEqual(['incomplete target-size ×2']);
        // Contrast axe cannot decide outside the details pane is not tolerated, also when only the nodes past the cap are
        // outside (the script counts them before it caps the list); every node inside is, however many.
        const outside = axeLines('main-installed-details', 'main', result({ incomplete: [rule('color-contrast', [{ insideDetails: true }, { insideDetails: false }]), rule('color-contrast', [{ insideDetails: true }], 9, 1)] }), 'hard', []);
        expect(outside.failures).toEqual(['incomplete color-contrast ×2', 'incomplete color-contrast ×9']);
        expect(axeLines('main-installed-details', 'main', result({ incomplete: [rule('color-contrast', [{ insideDetails: true }], 30, 0)] }), 'hard', []).failures).toEqual([]);
        const elsewhere = axeLines('main-updates', 'main', result({ incomplete: [rule('aria-hidden-focus', [{}])], violations: [rule('aria-hidden-focus', [{}])] }), 'hard', [{ rule: 'aria-hidden-focus', kind: 'incomplete', item: 'P2.1a', states: ['main-installed-single'] }]);
        expect(elsewhere.failures).toEqual(['violation aria-hidden-focus ×1', 'incomplete aria-hidden-focus ×1']);
        // While pending, the lines say so; the capture suite fails nothing until the rule is hard.
        expect(axeLines('main-updates', 'main', result({ violations: [rule('region', [{}])] }), { pending: 'P0.23' }, []).lines[1]).toBe('[axe] main-updates: violation region (serious) ×1: .x (pending P0.23)');
        // Axe's reasons follow the sample.
        const reasoned = { ...rule('color-contrast', [{ target: '.row' }]), reasons: [{ text: 'Element is outside the viewport', count: 30 }] };
        expect(axeLines('main-updates', 'main', result({ incomplete: [reasoned] }), 'hard', []).lines[1]).toBe('[axe] main-updates: incomplete color-contrast ×1: .row; "Element is outside the viewport" ×30 (hard)');
        expect(axeLines('main-updates', 'main', result({ error: 'Axe is already running' }), 'hard', [])).toEqual({
            lines: ['[axe] main-updates: axe.run failed: Axe is already running (hard)'], failures: ['axe.run failed: Axe is already running'],
        });
    });

    it('runs the full ruleset with the extra rules, every result type the verdict reads, and caps the nodes', async () => {
        document.body.innerHTML = '<main><h1>NuGet</h1>' + Array.from({ length: 10 }, (_, i) => `<button class="b${i}"></button>`).join('') + '</main>';
        const answer = JSON.parse(await runAsync(RUN_FULL_AXE, AXE_EXTRA_RULES, 3, [])) as FullAxe;
        expect(answer.error).toBeUndefined();
        const buttonName = answer.violations.find(entry => entry.id === 'button-name');
        expect(buttonName).toMatchObject({ id: 'button-name', impact: 'critical', count: 10, outsideDetails: 10 });
        // Axe's reasons over every node, not only the capped ones.
        expect(buttonName?.reasons.length).toBeGreaterThanOrEqual(1);
        expect(buttonName?.reasons.length).toBeLessThanOrEqual(3);
        expect(buttonName?.reasons.reduce((sum, reason) => sum + reason.count, 0)).toBe(10);
        expect(buttonName?.reasons[0].text).toMatch(/text|label|title|name/i);
        expect(buttonName?.nodes.map(node => node.target)).toEqual(['.b0', '.b1', '.b2']);
        expect(buttonName?.nodes[0]).toMatchObject({ insideDetails: false });
        expect(answer.passes).toBeGreaterThan(0);
        expect(answer.inapplicable).toBeGreaterThan(0);
    });

    it('marks a node inside the details pane', async () => {
        document.body.innerHTML = '<main><div data-testid="package-details-panel"><button class="inside"></button></div><button class="outside"></button></main>';
        const answer = JSON.parse(await runAsync(RUN_FULL_AXE, [], 8, [])) as FullAxe;
        const found = answer.violations.find(entry => entry.id === 'button-name');
        expect(found?.nodes.map(node => [node.target, node.insideDetails])).toEqual([['.inside', true], ['.outside', false]]);
        expect(found?.outsideDetails).toBe(1);
        // Counted before the cap: one node returned, the one outside still counted.
        const capped = JSON.parse(await runAsync(RUN_FULL_AXE, [], 1, [])) as FullAxe;
        expect(capped.violations.find(entry => entry.id === 'button-name')).toMatchObject({ count: 2, outsideDetails: 1, nodes: [{ target: '.inside' }] });
    });

    it('counts the nodes on each accepted selector over every node, before the cap', async () => {
        document.body.innerHTML = '<main><h1>NuGet</h1>' + Array.from({ length: 5 }, (_, i) => `<button class="b${i}${i < 4 ? ' nuiget-row-option' : ''}"></button>`).join('') + '</main>';
        const answer = JSON.parse(await runAsync(RUN_FULL_AXE, [], 2, ['.nuiget-row-option', '.nuiget-tab'])) as FullAxe;
        expect(answer.violations.find(entry => entry.id === 'button-name')).toMatchObject({ count: 5, accepted: { '.nuiget-row-option': 4, '.nuiget-tab': 0 } });
    });

    it('snapshots the accessible tree: roles, names, states and test ids, hidden subtrees and generic containers left out', () => {
        document.body.innerHTML = `
            <div>
              <div role="listbox" aria-label="Installed" aria-multiselectable="true" data-testid="installed-list">
                <div role="option" aria-selected="true" data-testid="package-row-serilog">Serilog 3.1.1</div>
                <div role="option" aria-selected="false">Moq 4.20.70</div>
              </div>
              <div aria-hidden="true"><button>Hidden</button></div>
              <button disabled>Update all (2)</button>
              <input type="checkbox" aria-label="Include prerelease" checked>
              <span role="presentation"><button aria-expanded="false">Transitive packages</button></span>
            </div>`;
        const answer = new Function(ARIA_SNAPSHOT)() as { nodes: AriaNode[] };
        expect(answer.nodes.map(ariaLine)).toEqual([
            'listbox "Installed" [multiselectable] {installed-list}',
            '  option "Serilog #" [selected] {package-row-serilog}',
            '  option "Moq #"',
            'button "Update all (#)" [disabled]',
            'checkbox "Include prerelease" [checked]',
            'button "Transitive packages" [collapsed]',
        ]);
        // The tree is released: axe.run can set up its own afterwards.
        expect(() => axe.setup(document)).not.toThrow();
        axe.teardown();
    });

    it('masks digits, collapses white space and compares snapshots line by line', () => {
        expect(maskDigits('  Newtonsoft.Json  13.0.3\n 1,234 downloads ')).toBe('Newtonsoft.Json # # downloads');
        expect(maskDigits('x'.repeat(200))).toHaveLength(120);
        const before = ['listbox "Installed"', '  option "A #"', '  option "B #"'];
        expect(compareAria(before, before)).toEqual({ equal: true, removed: 0, added: 0, firstRemoved: undefined, firstAdded: undefined });
        expect(compareAria(before, ['listbox "Installed"', '  option "B #"', '  option "C #" [selected]'])).toEqual({
            equal: false, removed: 1, added: 1, firstRemoved: 'option "A #"', firstAdded: 'option "C #" [selected]',
        });
        const snapshot = ariaSnapshot('main-updates', [{ depth: 0, role: 'listbox', name: 'Updates', states: [] }]);
        expect(snapshot).toEqual({ state: 'main-updates', lines: ['listbox "Updates"'] });
        expect(ariaLineFor('main-updates', snapshot, undefined)).toBe('[aria] main-updates: 1 nodes, no committed snapshot');
        expect(ariaLineFor('main-updates', snapshot, snapshot)).toBe('[aria] main-updates: 1 nodes, equal');
        expect(ariaLineFor('main-updates', snapshot, { state: 'main-updates', lines: ['listbox "Installed"'] }))
            .toBe('[aria] main-updates: 1 nodes, differs (-1 +1; first removed: listbox "Installed"; first added: listbox "Updates")');
    });
    it('holds the keyboard walks hard since their first run, the motion check pending on P4.5, and never presses an Enter that writes (UX-P0.24)', () => {
        expect(KEYS_STATUS).toBe('hard');
        expect(MOTION_STATUS).toEqual({ pending: 'P4.5' });
        const bridge = ['main-installed', 'main-updates', 'main-browse', 'sidebar'].flatMap(screen => [[`${screen} search Ctrl+DownArrow`, 'P4.3'], [`${screen} rows Ctrl+UpArrow`, 'P4.3']]);
        expect(KEYS_PENDING).toEqual({ 'main-updates rows Enter': 'P4.2a', 'sidebar rows Enter': 'P4.2b', ...Object.fromEntries(bridge) });
        expect(KEYS_AWAITING_ARIA).toEqual({ 'main-installed': 'P2.6' });
        expect(Object.entries(KEYS_EXPECTED).map(([screen, stops]) => `${screen} ${stops?.length} ${stops?.[0]}`)).toEqual([
            'main-installed 5 combobox "Search packages, or filter with @installed, @updates or @vulnerable" {search-input}',
            'main-updates 5 combobox "Search packages, or filter with @installed, @updates or @vulnerable" {search-input}',
            'main-browse 3 combobox "Search packages, or filter with @installed, @updates or @vulnerable" {search-input}',
            'sidebar 7 combobox "Search packages, or filter with @installed or @updates" {sidebar-search-input}',
        ]);
    });

    it('describes the focused element as a line of the screen\'s ARIA snapshot, with what would draw its ring (UX-P0.24)', () => {
        document.body.innerHTML = '<main data-testid="nuiget-app"><button data-testid="refresh-button" aria-label="Refresh 2">R</button></main><div role="dialog" aria-label="Sources"><button>Close</button></div>';
        document.querySelector<HTMLButtonElement>('[data-testid="refresh-button"]')!.focus();
        const focus = new Function(DESCRIBE_FOCUS).apply(null, ['nuiget-app']) as FocusFacts;
        expect(focus).toMatchObject({ role: 'button', name: 'Refresh 2', testid: 'refresh-button', inRoot: true });
        expect(focusLine(focus)).toBe('button "Refresh #" {refresh-button}');
        // A layer portaled out of the root still counts as inside; the page itself does not.
        document.querySelector<HTMLButtonElement>('[role="dialog"] button')!.focus();
        expect((new Function(DESCRIBE_FOCUS).apply(null, ['nuiget-app']) as FocusFacts).inRoot).toBe(true);
        (document.activeElement as HTMLElement).blur();
        expect(new Function(DESCRIBE_FOCUS).apply(null, ['nuiget-app'])).toMatchObject({ role: 'body', inRoot: false });
        expect(() => axe.setup(document)).not.toThrow();
        axe.teardown();
    });

    it('reports the tab order, a ring at every stop and each key against interaction model §5, pending or hard (UX-P0.24)', () => {
        const stop = (role: string, name: string, testid: string | null, ring = true): FocusFacts => ({ role, name, testid, focusVisible: ring, outline: ring ? '1px solid rgb(0, 120, 212)' : 'none', boxShadow: 'none', inRoot: true });
        const stops = [stop('combobox', 'Search', 'search-input'), stop('tab', 'Installed 15', 'installed-tab'), stop('option', 'Serilog 3.1.1', null, false)];
        expect(showsRing(stops[0])).toBe(true);
        expect(showsRing({ ...stops[0], outline: 'none', boxShadow: 'rgb(0, 120, 212) 0px 0px 0px 1px inset' })).toBe(true);
        expect(showsRing(stops[2])).toBe(false);
        const expected = ['combobox "Search" {search-input}', 'tab "Installed #" {installed-tab}', 'option "Serilog #"'];
        const outcomes = [
            { path: 'rows Home', observed: 'row 1', expected: 'row 1' },
            { path: 'rows End', observed: 'row 14', expected: 'row 15' },
            { path: 'rows Enter', observed: '', expected: '', skipped: 'Enter uninstalls' },
        ];
        const hard = keysLines('sidebar', stops, outcomes, 'hard', { sidebar: expected }, { 'sidebar rows Enter': 'P4.2b' });
        expect(hard.lines).toEqual([
            '[keys] sidebar tab: 3 stops: combobox "Search" {search-input} → tab "Installed #" {installed-tab} → option "Serilog #"; as expected (hard)',
            '[keys] sidebar ring: no visible ring at option "Serilog #" (hard)',
            '[keys] sidebar rows Home: row 1 (hard)',
            '[keys] sidebar rows End: row 14; expected row 15 (hard)',
            '[keys] sidebar rows Enter: not pressed (Enter uninstalls) (pending P4.2b)',
        ]);
        expect(hard.failures).toEqual(['sidebar ring ×1', 'sidebar rows End']);
        // Another order, or none recorded yet, fails the sequence; a pending status prints it and fails nothing in the suite.
        expect(keysLines('sidebar', stops.slice(0, 2), [], 'hard', { sidebar: expected }, {}).failures).toEqual(['sidebar tab order']);
        const pending = keysLines('main-browse', stops.slice(0, 2), [], { pending: 'P0.24' }, {}, {});
        expect(pending.lines[0]).toBe('[keys] main-browse tab: 2 stops: combobox "Search" {search-input} → tab "Installed #" {installed-tab}; no expected sequence (pending P0.24)');
        expect(pending.failures).toEqual(['main-browse tab order']);
    });

    it('reads what moves under VS Code\'s reduce-motion signal and holds it to nothing running (UX-P0.24)', () => {
        document.body.classList.add('vscode-reduce-motion');
        document.body.innerHTML = '<div class="nuiget-spinner"></div>';
        const spinner = document.querySelector('.nuiget-spinner')!;
        const animations = [{ playState: 'running', effect: { target: spinner }, animationName: 'nuiget-spin' }, { playState: 'finished', effect: { target: spinner }, animationName: 'nuiget-spin' }];
        (document as unknown as { getAnimations: () => unknown[] }).getAnimations = () => animations;
        try {
            const facts = new Function(RUNNING_ANIMATIONS)() as MotionFacts;
            // jsdom loads no stylesheet: the duration tokens resolve to nothing.
            expect(facts).toEqual({ reduceMotion: true, running: 1, groups: { '.nuiget-spinner nuiget-spin': 1 }, fast: '', normal: '' });
            expect(motionLines('main panel at open', facts)).toEqual({
                lines: ['[motion] main panel at open: body.vscode-reduce-motion set, 1 running (.nuiget-spinner nuiget-spin ×1); durations fast unset, normal unset (pending P4.5)'],
                failures: ['1 running animations'],
            });
        } finally {
            delete (document as unknown as { getAnimations?: unknown }).getAnimations;
            document.body.classList.remove('vscode-reduce-motion');
        }
        const still: MotionFacts = { reduceMotion: true, running: 0, groups: {}, fast: '0ms', normal: '0ms' };
        expect(motionLines('main panel at open', still, 'hard')).toEqual({ lines: ['[motion] main panel at open: body.vscode-reduce-motion set, 0 running; durations fast 0ms, normal 0ms (hard)'], failures: [] });
        expect(motionLines('sidebar', { ...still, reduceMotion: false }, 'hard').failures).toEqual(['body.vscode-reduce-motion absent']);
    });

    it('expects only tab stops that the screen\'s committed ARIA snapshot holds, or that KEYS_AWAITING_ARIA names for the item adopting the snapshot (UX-P0.24, UX-P2.1d)', () => {
        const statuses = trackerStatuses(fs.readFileSync(path.resolve(__dirname, '../../../docs/plans/STATUS-ux.md'), 'utf8'));
        const snapshotOf: Record<string, string> = { 'main-installed': 'main-installed-single', 'main-updates': 'main-updates', 'main-browse': 'main-browse-results', sidebar: 'sidebar-sections' };
        const stripped = (line: string): string => line.trim().replace(/ \[[^\]]*\]/, '');
        for (const [screen, expected] of Object.entries(KEYS_EXPECTED)) {
            const lines = (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../ui/v2/aria', `${snapshotOf[screen]}.json`), 'utf8')) as { lines: string[] }).lines.map(stripped);
            const missing = (expected ?? []).filter(stop => !lines.includes(stop));
            const item = KEYS_AWAITING_ARIA[screen as keyof typeof KEYS_AWAITING_ARIA];
            if (item === undefined) {
                expect(missing, screen).toEqual([]);
            } else {
                expect(missing.length, screen).toBeGreaterThan(0);
                expect(statuses.get(item), item).toBeDefined();
                expect(statuses.get(item), item).not.toBe('done');
            }
        }
    });
    it('holds the contrast moments and the resolve pass hard since UX-P0.25\'s run was ruled on, with run 40152178889\'s red lines on their owners (UX-P0.25)', () => {
        expect(CONTRAST_STATUS).toBe('hard');
        expect(CONTRAST_PENDING.map(entry => `${entry.where}@${entry.theme} ${entry.rule} ${entry.item}`)).toEqual([
            'readme@light-modern color-contrast P3.4', 'readme@light-high-contrast color-contrast P3.4', 'readme@light-2026 color-contrast P3.4',
            'readme@dark-modern target-size P3.4', 'readme@light-modern target-size P3.4', 'readme@dark-high-contrast target-size P3.4',
            'readme@light-high-contrast target-size P3.4', 'readme@dark-2026 target-size P3.4', 'readme@light-2026 target-size P3.4',
            'hover-main@dark-2026 color-contrast P4.6', 'hover-sidebar@dark-2026 color-contrast P4.6',
        ]);
        expect(MOMENTS).toEqual(['hover-main', 'readme', 'dialog', 'popup', 'hover-sidebar']);
    });

    it('resolves undecided contrast: a list that scrolls is scrolled and restored, text in a layer is measured on the layer\'s background (UX-P0.25)', async () => {
        document.body.innerHTML = `
            <main style="background-color: rgb(31, 31, 31)">
              <div class="list" style="overflow-y: auto"><span id="row" style="color: rgb(204, 204, 204)">Serilog</span></div>
              <div role="dialog" aria-label="Uninstall" style="background-color: rgb(37, 37, 38)"><p id="text" style="color: rgb(150, 150, 150)">From App:</p></div>
            </main>`;
        const list = document.querySelector<HTMLElement>('.list')!;
        let top = 50;
        const seen: number[] = [];
        Object.defineProperties(list, {
            scrollHeight: { value: 300 }, clientHeight: { value: 100 },
            scrollTop: { get: () => top, set: (value: number) => { top = value; seen.push(value); } },
        });
        const answer = JSON.parse(await runAsync(RESOLVE_CONTRAST, ['#row', '#text', '#gone'], LAYER_SELECTOR)) as Resolved;
        expect(answer.error).toBeUndefined();
        // Every step of the container, then back where it was.
        expect(seen).toEqual([0, 100, 200, 50]);
        expect(top).toBe(50);
        expect(answer.unresolved).toEqual(['#gone']);
        const byTarget = Object.fromEntries(answer.pairs.map(pair => [pair.target, pair]));
        expect(byTarget['#row']).toMatchObject({ color: 'rgb(204, 204, 204)', backgrounds: ['rgb(31, 31, 31)'], layer: false });
        expect(byTarget['#text']).toMatchObject({ color: 'rgb(150, 150, 150)', backgrounds: ['rgb(37, 37, 38)'], layer: true });
    });

    it('hands the resolve pass the contrast axe left undecided, outside the details pane only when asked, and scoped to a layer (UX-P0.25)', async () => {
        const text = 'style="color: rgb(150, 150, 150); background-color: rgb(31, 31, 31)"';
        // Axe on jsdom leaves the first text of a context undecided (no layout): enough to see what each script passes on.
        document.body.innerHTML = `<main><div data-testid="package-details-panel"><p id="in" ${text}>README</p></div></main>`;
        expect((JSON.parse(await runAsync(RUN_FULL_AXE, [], 8, [])) as FullAxe).undecidedContrast).toEqual([]);
        const outsideOnly = JSON.parse(await runAsync(RUN_CONTRAST, null, true)) as ContrastRun;
        expect(outsideOnly).toMatchObject({ undecided: [], passes: 0 });
        expect(outsideOnly.error).toBeUndefined();
        expect((JSON.parse(await runAsync(RUN_CONTRAST, null, false)) as ContrastRun).undecided).toEqual(['#in']);
        document.body.innerHTML = `<main><p id="out" ${text}>Serilog</p><div id="pop" role="listbox"><p id="suggestion" ${text}>Serilog.Sinks</p></div></main>`;
        expect((JSON.parse(await runAsync(RUN_FULL_AXE, [], 8, [])) as FullAxe).undecidedContrast).toEqual(['#out']);
        expect((JSON.parse(await runAsync(RUN_CONTRAST, '#pop', false)) as ContrastRun).undecided).toEqual(['#suggestion']);
    });

    it('picks the texts an open layer covers: outside it, their box meeting its box (UX-P0.25)', () => {
        document.body.innerHTML = '<div id="pop"><span id="own">Serilog</span></div><span id="under">Newtonsoft.Json</span><span id="beside">13.0.2</span>';
        const box = (left: number, top: number, width: number, height: number) => () => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
        document.querySelector('#pop')!.getBoundingClientRect = box(10, 30, 300, 120);
        document.querySelector('#under')!.getBoundingClientRect = box(20, 60, 100, 18);
        document.querySelector('#beside')!.getBoundingClientRect = box(320, 60, 40, 18);
        const under = (...args: unknown[]): string[] => new Function(TEXTS_UNDER)(...args) as string[];
        expect(under('#pop', ['#own', '#under', '#beside', '#gone', '['])).toEqual(['#under']);
        expect(under('#closed', ['#under'])).toEqual([]);
    });

    it('measures a pair over its composited backgrounds and judges the resolve pass, hard or pending (UX-P0.25)', () => {
        const pair = (target: string, color: string, backgrounds: string[]): ContrastPair => ({ target, color, backgrounds, fontPx: 13, weight: 400, layer: false });
        expect(pairContrast(pair('#a', 'rgb(204, 204, 204)', ['rgb(31, 31, 31)']))?.ratio).toBeCloseTo(10.26, 1);
        // A translucent hover band over the editor: composited before the text is measured.
        const hovered = pairContrast(pair('#b', 'rgb(157, 157, 157)', ['rgba(255, 255, 255, 0.1)', 'rgb(31, 31, 31)']));
        expect(hovered?.threshold).toBe(4.5);
        expect(hovered!.ratio).toBeLessThan(pairContrast(pair('#b', 'rgb(157, 157, 157)', ['rgb(31, 31, 31)']))!.ratio);
        expect(pairContrast(pair('#c', 'rgb(0, 0, 0)', []))).toBeNull();
        const resolved: Resolved = { targets: 4, decided: 1, violations: [], pairs: [pair('#a', 'rgb(204, 204, 204)', ['rgb(31, 31, 31)']), pair('#d', 'rgb(100, 100, 100)', ['rgb(31, 31, 31)'])], unresolved: ['#e'] };
        const hard = resolvedLines('main-installed-single', 'dark-modern', resolved, 'hard', []);
        expect(hard.lines[0]).toBe('[contrast] main-installed-single: 4 undecided: 1 decided by scrolling, 0 violations, 2 measured as pairs, 1 below, 1 unresolved (hard)');
        expect(hard.failures).toEqual(['pairs below threshold ×1', 'unresolved ×1']);
        const owned = resolvedLines('main-installed-single', 'dark-modern', resolved, 'hard', [{ where: 'main-installed-single', theme: 'dark-modern', rule: 'pair', item: 'P4.6' }]);
        expect(owned.failures).toEqual(['unresolved ×1']);
        expect(owned.lines.find(line => line.includes('pairs below'))).toMatch(/\(pending P4\.6\)$/);
    });

    it('reports a theme pass moment: its violations, its pairs, and a moment that decided nothing or could not be measured (UX-P0.25)', () => {
        const facts = { violations: [{ rule: 'color-contrast' as const, count: 2, sample: '.a, .b' }], passes: 12 };
        expect(momentLines('hover-main', 'light-2026', facts, 'hard', [])).toEqual({
            lines: ['[contrast] hover-main@light-2026: 12 nodes passed, 2 violations, 0 pairs measured (hard)', '[contrast] hover-main@light-2026: violation color-contrast ×2: .a, .b (hard)'],
            failures: ['hover-main@light-2026 color-contrast ×2'],
        });
        expect(momentLines('hover-main', 'light-2026', facts, 'hard', [{ where: 'hover-main', theme: 'light-2026', rule: 'color-contrast', item: 'P4.6' }]).failures).toEqual([]);
        // Axe's check messages follow the sample, as the full run's lines carry them.
        expect(momentLines('hover-sidebar', 'dark-modern', { violations: [], passes: 15, acceptedTargets: 1 }, 'hard', []).lines[0]).toBe('[contrast] hover-sidebar@dark-modern: 15 nodes passed, 0 violations, 0 pairs measured, accepted target-size 1 on .nuiget-icon-button, .nuiget-section-toggle, .nuiget-row-group (hard)');
        const withReasons = { violations: [{ rule: 'target-size' as const, count: 3, sample: 'li:nth-child(2) > a', reasons: [{ text: 'Target has insufficient size (16px by 16px, should be at least 24px by 24px)', count: 3 }] }], passes: 5 };
        expect(momentLines('readme', 'dark-modern', withReasons, 'hard', [{ where: 'readme', theme: 'dark-modern', rule: 'target-size', item: 'P3.4' }]).lines[1])
            .toBe('[contrast] readme@dark-modern: violation target-size ×3: li:nth-child(2) > a; "Target has insufficient size (16px by 16px, should be at least 24px by 24px)" ×3 (pending P3.4)');
        expect(momentLines('popup', 'dark-modern', { violations: [], passes: 0 }, 'hard', []).failures).toEqual(['popup@dark-modern decided nothing']);
        // A resolve pass that failed keeps its line: the moment's summary does not stand in for it.
        const failed = momentLines('popup', 'dark-modern', { violations: [], passes: 3, resolved: { targets: 2, decided: 0, violations: [], pairs: [], unresolved: ['#a', '#b'], error: 'script timeout' } }, { pending: 'P0.25' }, []);
        expect(failed.lines).toEqual(['[contrast] popup@dark-modern: 3 nodes passed, 0 violations, 0 pairs measured (pending P0.25)', '[contrast] popup@dark-modern: the resolve pass failed: script timeout (pending P0.25)']);
        expect(failed.failures).toEqual(['popup@dark-modern resolve pass failed: script timeout']);
        expect(momentLines('readme', 'dark-modern', { violations: [], passes: 0, notMeasurable: 'the README did not load (readme-empty)' }, { pending: 'P0.25' }, [])).toEqual({
            lines: ['[contrast] readme@dark-modern: not measurable (the README did not load (readme-empty)) (pending P0.25)'], failures: ['readme@dark-modern not measurable'],
        });
    });

    it('lets the resolve pass stand in for the contrast axe left undecided outside the details pane (UX-P0.25)', () => {
        const undecided = { violations: [], incomplete: [rule('color-contrast', [{ target: '#r' }], 21, 21)], passes: 40, inapplicable: 50 };
        expect(axeLines('main-installed-single', 'main', undecided, 'hard', [], [], { unresolved: 0 })).toEqual({
            lines: [
                '[axe] main-installed-single: 0 violations, 1 incomplete, 40 rules passed, 50 inapplicable (a11y-full-axe-real-page, hard)',
                '[axe] main-installed-single: color-contrast left 21 undecided outside the details pane, all decided by the resolve pass ([contrast] lines)',
            ],
            failures: [],
        });
        expect(axeLines('main-installed-single', 'main', undecided, 'hard', [], [], { unresolved: 1 }).failures).toEqual(['incomplete color-contrast ×21']);
    });
});

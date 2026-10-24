// @vitest-environment jsdom
import axe from 'axe-core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { acceptedSelectors, ARIA_SNAPSHOT, type AriaNode, ariaLine, ariaLineFor, ariaSnapshot, AXE_ACCEPTED, AXE_EXTRA_RULES, AXE_PENDING, type AxeRule, axeLines, compareAria, FULL_AXE_RULE, FULL_AXE_STATUS, type FullAxe, maskDigits, RUN_FULL_AXE } from '../ui/v2/a11y';

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
        // The design-advisor ruling of 2026-10-25: the three undecided contrast cases are P0.25's to measure, state by state.
        expect(AXE_PENDING.map(entry => `${entry.rule} ${entry.kind} ${entry.item} ${entry.states?.length}`)).toEqual([
            'color-contrast incomplete P0.25 14', 'color-contrast incomplete P0.25 2', 'color-contrast incomplete P0.25 1',
        ]);
        expect(AXE_ACCEPTED.map(entry => `${entry.rule} ${entry.selector ?? entry.surface}`)).toEqual(['label-content-name-mismatch .nuiget-row-option', 'page-has-heading-one sidebar']);
        expect(acceptedSelectors()).toEqual(['.nuiget-row-option']);
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
});

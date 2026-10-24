// @vitest-environment jsdom
import axe from 'axe-core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ARIA_SNAPSHOT, type AriaNode, ariaLine, ariaLineFor, ariaSnapshot, AXE_EXTRA_RULES, type AxeRule, axeLines, compareAria, FULL_AXE_RULE, FULL_AXE_STATUS, type FullAxe, maskDigits, RUN_FULL_AXE } from '../ui/v2/a11y';

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
const rule = (id: string, nodes: Array<Partial<AxeRule['nodes'][number]>>, count = nodes.length, outsideDetails?: number): AxeRule => {
    const full = nodes.map(node => ({ target: '.x', summary: '', insideDetails: false, ...node }));
    return { id, impact: 'serious', count, outsideDetails: outsideDetails ?? full.filter(node => !node.insideDetails).length, nodes: full };
};
const result = (overrides: Partial<FullAxe> = {}): FullAxe => ({ violations: [], incomplete: [], passes: 40, inapplicable: 50, ...overrides });

/** Runs an `executeAsyncScript` body: the arguments, then the callback last. */
const runAsync = (source: string, ...args: unknown[]): Promise<string> =>
    new Promise(resolve => {
        new Function(source).apply(null, [...args, resolve]);
    });

describe('the accessibility harness (UX-P0.23)', () => {
    it('holds the full-axe rule pending on this item until its run is triaged, and turns on the two rules axe leaves off', () => {
        expect(FULL_AXE_RULE).toBe('a11y-full-axe-real-page');
        expect(FULL_AXE_STATUS).toEqual({ pending: 'P0.23' });
        expect(AXE_EXTRA_RULES).toEqual(['target-size', 'label-content-name-mismatch']);
    });

    it('fails a violation or an incomplete result unless an item is named for it; tolerates contrast it cannot decide in the details pane', () => {
        const clean = axeLines('main-installed-single', result(), 'hard', []);
        expect(clean).toEqual({ lines: ['[axe] main-installed-single: 0 violations, 0 incomplete, 40 rules passed, 50 inapplicable (a11y-full-axe-real-page, hard)'], failures: [] });
        const found = axeLines('main-installed-single', result({
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
        const outside = axeLines('main-installed-details', result({ incomplete: [rule('color-contrast', [{ insideDetails: true }, { insideDetails: false }]), rule('color-contrast', [{ insideDetails: true }], 9, 1)] }), 'hard', []);
        expect(outside.failures).toEqual(['incomplete color-contrast ×2', 'incomplete color-contrast ×9']);
        expect(axeLines('main-installed-details', result({ incomplete: [rule('color-contrast', [{ insideDetails: true }], 30, 0)] }), 'hard', []).failures).toEqual([]);
        const elsewhere = axeLines('main-updates', result({ incomplete: [rule('aria-hidden-focus', [{}])], violations: [rule('aria-hidden-focus', [{}])] }), 'hard', [{ rule: 'aria-hidden-focus', kind: 'incomplete', item: 'P2.1a', states: ['main-installed-single'] }]);
        expect(elsewhere.failures).toEqual(['violation aria-hidden-focus ×1', 'incomplete aria-hidden-focus ×1']);
        // While pending, the lines say so; the capture suite fails nothing until the rule is hard.
        expect(axeLines('main-updates', result({ violations: [rule('region', [{}])] }), { pending: 'P0.23' }, []).lines[1]).toBe('[axe] main-updates: violation region (serious) ×1: .x (pending P0.23)');
        expect(axeLines('main-updates', result({ error: 'Axe is already running' }), 'hard', [])).toEqual({
            lines: ['[axe] main-updates: axe.run failed: Axe is already running (hard)'], failures: ['axe.run failed: Axe is already running'],
        });
    });

    it('runs the full ruleset with the extra rules, every result type the verdict reads, and caps the nodes', async () => {
        document.body.innerHTML = '<main><h1>NuGet</h1>' + Array.from({ length: 10 }, (_, i) => `<button class="b${i}"></button>`).join('') + '</main>';
        const answer = JSON.parse(await runAsync(RUN_FULL_AXE, AXE_EXTRA_RULES, 3)) as FullAxe;
        expect(answer.error).toBeUndefined();
        const buttonName = answer.violations.find(entry => entry.id === 'button-name');
        expect(buttonName).toMatchObject({ id: 'button-name', impact: 'critical', count: 10, outsideDetails: 10 });
        expect(buttonName?.nodes.map(node => node.target)).toEqual(['.b0', '.b1', '.b2']);
        expect(buttonName?.nodes[0]).toMatchObject({ insideDetails: false });
        expect(answer.passes).toBeGreaterThan(0);
        expect(answer.inapplicable).toBeGreaterThan(0);
    });

    it('marks a node inside the details pane', async () => {
        document.body.innerHTML = '<main><div data-testid="package-details-panel"><button class="inside"></button></div><button class="outside"></button></main>';
        const answer = JSON.parse(await runAsync(RUN_FULL_AXE, [], 8)) as FullAxe;
        const found = answer.violations.find(entry => entry.id === 'button-name');
        expect(found?.nodes.map(node => [node.target, node.insideDetails])).toEqual([['.inside', true], ['.outside', false]]);
        expect(found?.outsideDetails).toBe(1);
        // Counted before the cap: one node returned, the one outside still counted.
        const capped = JSON.parse(await runAsync(RUN_FULL_AXE, [], 1)) as FullAxe;
        expect(capped.violations.find(entry => entry.id === 'button-name')).toMatchObject({ count: 2, outsideDetails: 1, nodes: [{ target: '.inside' }] });
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

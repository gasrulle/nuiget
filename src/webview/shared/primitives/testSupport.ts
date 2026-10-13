/**
 * Test support for the primitives and for every test that renders a `Listbox`; nothing here is bundled.
 *
 * jsdom parses and styles a document but lays nothing out: every box is 0 by 0, and
 * `document.elementFromPoint` does not exist. Two things then go wrong without an error. A virtualized list of
 * no height has no row in view, so it renders none. And axe cannot run its `aria-hidden-focus` rule, reports it
 * as "incomplete", and `toHaveNoViolations` accepts that.
 */

/** The layout a browser would compute: lists `viewport` pixels high, rows `row` pixels high, one under the other. */
export interface FakeLayout {
    /** Height of every `role="listbox"` element. */
    viewport: number;
    /** Height of every row (`[data-index]`). */
    row: number;
}

const LIST = '[role="listbox"]';
const ROW = '[data-index]';
const LIST_WIDTH = 300;

/** Gives the document a layout until the returned function is called. */
export function installFakeLayout({ viewport, row }: FakeLayout = { viewport: 120, row: 24 }): () => void {
    const replaced: Array<[target: object, name: string, original: PropertyDescriptor | undefined]> = [];
    const define = (target: object, name: string, descriptor: PropertyDescriptor): void => {
        replaced.push([target, name, Object.getOwnPropertyDescriptor(target, name)]);
        Object.defineProperty(target, name, { configurable: true, ...descriptor });
    };

    // The virtualizer reads the size of its scroll element from these two.
    define(HTMLElement.prototype, 'offsetHeight', {
        get(this: HTMLElement) {
            return this.matches(LIST) ? viewport : 0;
        },
    });
    define(HTMLElement.prototype, 'offsetWidth', {
        get(this: HTMLElement) {
            return this.matches(LIST) ? LIST_WIDTH : 0;
        },
    });
    // A row and everything in it has the row's box; the Listbox measures rows and anchors menus with it.
    define(Element.prototype, 'getBoundingClientRect', {
        writable: true,
        value(this: Element): DOMRect {
            const owner = this.closest(ROW);
            const top = owner ? Number(owner.getAttribute('data-index')) * row : 0;
            const height = owner ? row : this.matches(LIST) ? viewport : 0;
            const width = owner || this.matches(LIST) ? LIST_WIDTH : 0;
            return { x: 0, y: top, left: 0, top, width, height, right: width, bottom: top + height, toJSON: () => ({}) };
        },
    });
    // Nothing covers anything: no dialog is open.
    define(document, 'elementFromPoint', { writable: true, value: () => null });

    return () => {
        for (const [target, name, original] of replaced.reverse()) {
            if (original) {
                Object.defineProperty(target, name, original);
            } else {
                delete (target as Record<string, unknown>)[name];
            }
        }
        replaced.length = 0;
    };
}

export type AxeRuleOutcome = 'violations' | 'passes' | 'incomplete' | 'inapplicable';

/**
 * Where axe filed a rule. "No violations" is true of a rule that did not apply and of one axe gave up on; a test
 * of markup that exists for one rule asserts that the rule is among `passes`.
 */
export function axeRuleOutcome(results: object, ruleId: string): AxeRuleOutcome | undefined {
    const filed = results as Partial<Record<AxeRuleOutcome, Array<{ id: string }>>>;
    const outcomes: AxeRuleOutcome[] = ['violations', 'passes', 'incomplete', 'inapplicable'];
    return outcomes.find(outcome => filed[outcome]?.some(rule => rule.id === ruleId));
}

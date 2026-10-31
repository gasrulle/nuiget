/**
 * Test support for the primitives and for every test that renders a `Listbox`; nothing here is bundled.
 *
 * jsdom parses and styles a document but lays nothing out: every box is 0 by 0, and
 * `document.elementFromPoint` does not exist. Two things then go wrong without an error. A virtualized list of
 * no height has no row in view, so it renders none. And axe cannot run its `aria-hidden-focus` rule, reports it
 * as "incomplete", and `toHaveNoViolations` accepts that.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

/** The layout a browser would compute: lists `viewport` pixels high, rows `row` pixels high, one under the other. */
export interface FakeLayout {
    /** Height of every `role="listbox"` or `role="tree"` element. */
    viewport: number;
    /** Height of every row (`[data-index]`). */
    row: number;
}

const LIST = '[role="listbox"], [role="tree"]';
const ROW = '[data-index]';
const LIST_WIDTH = 300;

/** Gives the document a layout until the returned function is called. */
export function installFakeLayout({ viewport, row }: FakeLayout = { viewport: 120, row: 24 }): () => void {
    const replaced: Array<[target: object, name: string, original: PropertyDescriptor | undefined]> = [];
    const define = (target: object, name: string, descriptor: PropertyDescriptor): void => {
        replaced.push([target, name, Object.getOwnPropertyDescriptor(target, name)]);
        Object.defineProperty(target, name, { configurable: true, ...descriptor });
    };

    // The virtualizer reads the size of its scroll element from the client box (virtual-core 3.19.6 and later) or
    // the offset box (earlier versions); the list has no border or scrollbar here, so both are the same.
    for (const [height, width] of [
        ['offsetHeight', 'offsetWidth'],
        ['clientHeight', 'clientWidth'],
    ] as const) {
        define(HTMLElement.prototype, height, {
            get(this: HTMLElement) {
                return this.matches(LIST) ? viewport : 0;
            },
        });
        define(HTMLElement.prototype, width, {
            get(this: HTMLElement) {
                return this.matches(LIST) ? LIST_WIDTH : 0;
            },
        });
    }
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

/** A viewport and the boxes of chosen elements, for placing a `Popover`; every other element keeps jsdom's 0 by 0. */
export interface FakeViewport {
    width: number;
    height: number;
    /** The box of the first element that matches a selector, by selector. */
    rects?: Record<string, { left: number; top: number; width: number; height: number }>;
}

/** Gives the window a size and the matching elements a box until the returned function is called. */
export function installFakeViewport({ width, height, rects = {} }: FakeViewport): () => void {
    const restore: Array<() => void> = [];
    for (const [name, value] of [['innerWidth', width], ['innerHeight', height]] as const) {
        const original = Object.getOwnPropertyDescriptor(window, name);
        Object.defineProperty(window, name, { configurable: true, writable: true, value });
        restore.push(() => {
            if (original) {
                Object.defineProperty(window, name, original);
            }
        });
    }
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
    const jsdomRect = Element.prototype.getBoundingClientRect;
    Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
        configurable: true,
        writable: true,
        value(this: Element): DOMRect {
            const selector = Object.keys(rects).find(candidate => this.matches(candidate));
            if (selector === undefined) {
                return jsdomRect.call(this);
            }
            const { left, top, width: w, height: h } = rects[selector];
            return { x: left, y: top, left, top, width: w, height: h, right: left + w, bottom: top + h, toJSON: () => ({}) };
        },
    });
    restore.push(() => {
        if (original) {
            Object.defineProperty(Element.prototype, 'getBoundingClientRect', original);
        }
    });
    return () => {
        for (const undo of restore.reverse()) {
            undo();
        }
        restore.length = 0;
    };
}

/**
 * Puts `tokens.css` and `primitives.css` into the document until the returned function is called. Vitest injects no
 * CSS for an `import './primitives.css'`, so without this `getComputedStyle` sees no rule of the primitives. jsdom
 * cascades the rules but resolves no `var()` and lays nothing out: a test may read declared values only.
 */
export function installStylesheet(): () => void {
    const style = document.createElement('style');
    style.textContent = ['src/webview/shared/tokens.css', 'src/webview/shared/primitives/primitives.css']
        .map(file => readFileSync(resolve(file), 'utf-8'))
        .join('\n');
    document.head.appendChild(style);
    return () => style.remove();
}

/**
 * UX-P0.24 (`a11y-focus-after-close`, A6, H86): the cases of feature tests whose dialog closes with focus on `<body>` today,
 * with the item that fixes them. Interaction model §5: a dialog returns focus to its opener, or, when the opener is gone or
 * disabled, to the list's active row or the toolbar's first enabled control, never to the page.
 */
export const FOCUS_AFTER_CLOSE_PENDING: Readonly<Record<string, { pending: string }>> = {
    // A6: Confirm empties the selection or the candidates, which disables the opener, and focus has no fallback.
    'installed-bulk-uninstall-confirm': { pending: 'P4.4' },
    'updates-update-all-confirm': { pending: 'P4.4' },
    // A6's mechanism at other close sites (design-advisor ruling of 2026-10-25): the confirm's own update disables the opener.
    'installed-bulk-uninstall-partial-confirm': { pending: 'P4.4' },
    'installed-all-projects-uninstall-confirm': { pending: 'P4.4' },
    'updates-busy-update-all-confirm': { pending: 'P4.4' },
    'updates-all-projects-update-confirm': { pending: 'P4.4' },
    'sidebar-update-all-confirm': { pending: 'P4.4' },
    'sidebar-all-projects-update-all-confirm': { pending: 'P4.4' },
    'details-cpm-install-confirm': { pending: 'P4.4' },
    'details-cpm-update-confirm': { pending: 'P4.4' },
    // No opener: the host opened the dialog with nothing focused; the target is the `source-settings` button.
    'sources-host-opened-escape': { pending: 'P4.4' },
};

/** The focused element as a test prints it: tag, test id or id. */
const describeFocus = (element: Element): string => {
    const testId = element.getAttribute('data-testid');
    return `${element.tagName.toLowerCase()}${testId ? `[data-testid="${testId}"]` : element.id ? `#${element.id}` : ''}`;
};

/**
 * Called by a feature test right after its dialog closes: fails when focus fell to `<body>`, unless the registry names the
 * case `pending`, which prints `[focus] <case>: … (pending <item>)` and asserts nothing (the gate's printed pending cases).
 */
export function expectFocusAfterClose(caseId: string, registry: Readonly<Record<string, { pending: string }>> = FOCUS_AFTER_CLOSE_PENDING): void {
    const active = document.activeElement;
    const where = active === null || active === document.body ? '<body>' : describeFocus(active);
    const pending = registry[caseId];
    if (pending !== undefined) {
        console.warn(`[focus] ${caseId}: focus on ${where} after the dialog closed (pending ${pending.pending})`);
        return;
    }
    if (where === '<body>') {
        throw new Error(`[focus] ${caseId}: focus fell to <body> after the dialog closed (a11y-focus-after-close)`);
    }
}

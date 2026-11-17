/**
 * The open dialogs of a page, in the order they opened. Only the topmost one answers Escape, traps
 * focus or closes on an outside click, so that a confirmation opened from a dialog, or any layer opened inside
 * one, is dismissed first and alone. The stack is per page: each webview is its own document.
 */
export interface Layer {
    /** The element that holds the layer's content. */
    readonly element: () => HTMLElement | null;
}

const stack: Layer[] = [];

/**
 * Marks every layer under the topmost one `data-covered` on its `.nuiget-dialog-layer`, which hides it: one scrim and one box,
 * the workbench's single-modal look (UX-P3.6). Synchronous, so a layer uncovered by `removeLayer` can take focus back at once.
 */
function markCovered(): void {
    stack.forEach((entry, index) => entry.element()?.parentElement?.toggleAttribute('data-covered', index < stack.length - 1));
}

export function pushLayer(layer: Layer): void {
    stack.push(layer);
    markCovered();
}

export function removeLayer(layer: Layer): void {
    const index = stack.indexOf(layer);
    if (index >= 0) {
        stack.splice(index, 1);
    }
    markCovered();
}

export function isTopLayer(layer: Layer): boolean {
    return stack[stack.length - 1] === layer;
}

/** Whether `node` is inside a layer that opened after `layer`, such as a confirmation over a dialog. */
export function isInLayerAbove(layer: Layer, node: Node): boolean {
    const index = stack.indexOf(layer);
    return stack.slice(index + 1).some(above => above.element()?.contains(node) ?? false);
}

// One literal, not an array joined at load time: a call at module level is kept by the bundler in every bundle
// that imports the barrel, used or not (N63).
const TABBABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), '
    + 'textarea:not(:disabled), [tabindex], [contenteditable="true"]';

/** The elements in `root` that Tab stops on, in document order. Layout is not consulted: jsdom has none. */
export function tabbables(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(element => element.tabIndex >= 0 && !element.closest('[inert], [aria-hidden="true"]'));
}

/** Focus `target`, else the first tabbable element in `root`, else `root` itself. */
export function focusInto(root: HTMLElement, target?: HTMLElement | null): void {
    (target ?? tabbables(root)[0] ?? root).focus({ preventScroll: true });
}

/** Whether focus is on `root`'s content or nowhere (`<body>`, `<html>` or none), the moment a layer closes. */
export function focusWasInside(root: HTMLElement | null): boolean {
    const active = document.activeElement;
    return active === null || active === document.body || active === document.documentElement || (root?.contains(active) ?? false);
}

// One literal each (N63): a list's tab stop, a hidden or inert subtree, a toolbar's controls.
const LIST_TAB_STOP = '[role="listbox"] [tabindex="0"], [role="tree"] [tabindex="0"]';
const HIDDEN = '[inert], [aria-hidden="true"], [hidden], .nuiget-dialog-layer';
const TOOLBAR_CONTROL = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]';

/** Focuses `element` and answers whether it took the focus (a disabled or hidden element does not). */
function takesFocus(element: Element | null | undefined): boolean {
    if (!(element instanceof HTMLElement) || !element.isConnected || element.matches(':disabled')) {
        return false;
    }
    element.focus({ preventScroll: true });
    return document.activeElement === element;
}

/**
 * Gives the focus back when a layer has closed with the focus inside it or nowhere (UX-P4.4, A6; design-advisor ruling of
 * 2026-11-17, DO 2), read after the closing update's DOM changes: (a) a layer still open takes it, at the opener when the
 * opener is inside it; (b) the opener, when it takes the focus; (c) the active row of the nearest list, from the opener
 * upward; (d) the first enabled control of the opener's toolbar; (e) the first tabbable of the page outside every layer.
 * `<body>` and `<html>` count as no opener; focus never lands on the page while a layer is open.
 */
export function restoreFocus(opener: Element | null): void {
    const known = opener instanceof HTMLElement && opener.isConnected && opener !== document.body && opener !== document.documentElement ? opener : null;
    const below = stack[stack.length - 1]?.element();
    if (below) {
        if (!(known && below.contains(known) && takesFocus(known))) {
            focusInto(below);
        }
        return;
    }
    if (takesFocus(known)) {
        return;
    }
    for (let scope: Element | null = known ?? document.body; scope; scope = scope.parentElement) {
        const rows = [...scope.querySelectorAll(LIST_TAB_STOP)].filter(row => !row.closest(HIDDEN));
        if (rows.length > 0) {
            if (rows.some(row => takesFocus(row))) {
                return;
            }
            break;
        }
    }
    const toolbar = known?.closest('[role="toolbar"]');
    if (toolbar && [...toolbar.querySelectorAll(TOOLBAR_CONTROL)].some(control => takesFocus(control))) {
        return;
    }
    tabbables(document.body).filter(element => !element.closest(HIDDEN)).some(element => takesFocus(element));
}

/**
 * The open dialogs and popovers of a page, in the order they opened. Only the topmost one answers Escape, traps
 * focus or closes on an outside click, so that a confirmation opened from a dialog, or a popover opened inside
 * one, is dismissed first and alone. The stack is per page: each webview is its own document.
 */
export interface Layer {
    /** The element that holds the layer's content. */
    readonly element: () => HTMLElement | null;
}

const stack: Layer[] = [];

export function pushLayer(layer: Layer): void {
    stack.push(layer);
}

export function removeLayer(layer: Layer): void {
    const index = stack.indexOf(layer);
    if (index >= 0) {
        stack.splice(index, 1);
    }
}

export function isTopLayer(layer: Layer): boolean {
    return stack[stack.length - 1] === layer;
}

/** Whether `node` is inside a layer that opened after `layer`, such as a popover over a dialog. */
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

/**
 * Gives focus back to `opener` when the layer closes with focus inside it (or nowhere, as after the focused
 * element was removed). Focus that the user moved elsewhere stays where it is.
 */
export function restoreFocus(root: HTMLElement | null, opener: Element | null): void {
    const active = document.activeElement;
    const focusWasInside = active === null || active === document.body || (root?.contains(active) ?? false);
    if (focusWasInside && opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true });
    }
}

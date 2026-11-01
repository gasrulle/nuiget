import './primitives.css';

/**
 * Opens VS Code's `webview/context` menu on a row from the keyboard: a `contextmenu` event on the row's wrapper, which the
 * webview's host page reads as a right-click there (ADR-013 Decision 4). Without a row with a context it does nothing.
 */
export function openRowMenu(from: Element | null): void {
    const wrapper = from?.closest('.nuiget-row[data-vscode-context]');
    if (!wrapper) {
        return;
    }
    const rect = wrapper.getBoundingClientRect();
    wrapper.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 8, clientY: rect.top + rect.height / 2 }));
}

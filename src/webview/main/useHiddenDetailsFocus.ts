import { useEffect, useRef } from 'react';
import type React from 'react';
import { focusList } from '../shared/primitives';
import { restoreFocus } from '../shared/primitives/layers';

const PANE = '.nuiget-main-details';

/** No element holds the focus: `<body>`, `<html>` or none. */
const nowhere = (active: Element | null): boolean => active === null || active === document.body || active === document.documentElement;

/**
 * When the main panel narrows until the split hides the details pane (the container query of `main.css`, below 391 px) with
 * the focus inside the pane, the focus goes to the active row of the visible list (`listId`), or, when it has no row, by
 * `restoreFocus`'s order from the list pane (`listPaneId`) to the first control of the page, never `<body>` (UX-P4.fix-6;
 * design-advisor opening ruling of 2026-11-18). Only on a shown-to-hidden transition and only for focus that was in the pane: a panel that opens narrow claims
 * nothing. A `focus()` in a webview pulls the workbench focus into its frame (UX-P3.8), so the move happens only while the
 * document has the focus; otherwise it is owed until the document's next focus gain. No timer, no retry.
 */
export function useHiddenDetailsFocus(splitRef: React.RefObject<HTMLElement | null>, listId: string, listPaneId: string): void {
    const move = useRef<() => void>(() => undefined);
    move.current = () => {
        if (!focusList(listId)) {
            restoreFocus(document.getElementById(listPaneId));
        }
    };

    useEffect(() => {
        const split = splitRef.current;
        if (split === null || typeof ResizeObserver === 'undefined') {
            return undefined;
        }
        const pane = (): HTMLElement | null => split.querySelector<HTMLElement>(PANE);
        // Read from the stylesheet, never a width: the query in main.css is the one source.
        const hidden = (): boolean => {
            const element = pane();
            return element !== null && getComputedStyle(element).display === 'none';
        };
        // `shown` is undefined until the observer's first callback, which only records it.
        let shown: boolean | undefined;
        let inPane = false;
        let owed = false;

        const settle = (): void => {
            if (!owed) {
                return;
            }
            const active = document.activeElement;
            const element = pane();
            if (!hidden() || !document.hasFocus() || !(nowhere(active) || (element?.contains(active) ?? false))) {
                return;
            }
            owed = false;
            move.current();
        };

        const onFocusIn = (event: FocusEvent): void => {
            const element = pane();
            inPane = element !== null && event.target instanceof Node && element.contains(event.target);
            if (!inPane) {
                owed = false;
            }
        };
        const onFocusOut = (event: FocusEvent): void => {
            const element = pane();
            // Left to nowhere by the user: the pane still shown, the document still focused. A focus fixup on the hidden pane,
            // or a focus that left the webview, keeps the record.
            if (element !== null && event.target instanceof Node && element.contains(event.target) && event.relatedTarget === null && !hidden() && document.hasFocus()) {
                inPane = false;
            }
        };

        const observer = new ResizeObserver(() => {
            const isHidden = hidden();
            if (shown === undefined) {
                shown = !isHidden;
                return;
            }
            if (shown && isHidden) {
                const active = document.activeElement;
                const element = pane();
                if ((element?.contains(active) ?? false) || (nowhere(active) && inPane)) {
                    owed = true;
                }
            } else if (!isHidden) {
                owed = false;
            }
            shown = !isHidden;
            settle();
        });
        observer.observe(split);
        document.addEventListener('focusin', onFocusIn);
        document.addEventListener('focusout', onFocusOut);
        window.addEventListener('focus', settle);
        return () => {
            observer.disconnect();
            document.removeEventListener('focusin', onFocusIn);
            document.removeEventListener('focusout', onFocusOut);
            window.removeEventListener('focus', settle);
        };
    }, [splitRef]);
}

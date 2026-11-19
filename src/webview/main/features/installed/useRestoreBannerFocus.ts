import { useEffect, useLayoutEffect, useRef } from 'react';
import { focusList, focusListRow } from '../../../shared/primitives';
import { restoreFocus } from '../../../shared/primitives/layers';

const BANNER = '[data-testid="transitive-restore-banner"]';

/** No element holds the focus: `<body>`, `<html>` or none. */
const nowhere = (active: Element | null): boolean => active === null || active === document.body || active === document.documentElement;

/**
 * When the transitive restore banner leaves (its projects restored) with the focus on it, the focus goes to the Transitive
 * group row of `listId`; when that row is not in the document, to the list's active row; else by `restoreFocus`'s order; never
 * `<body>` (UX-P4.fix-16, A6; design-advisor opening ruling of 2026-11-19). Only on a present-to-gone transition and only for
 * focus that was in the banner and is now nowhere. A `focus()` in a webview pulls the workbench focus into its frame (UX-P3.8),
 * so the move happens only while the document has the focus; otherwise it is owed until the window's next focus, and dropped
 * when the focus lands elsewhere first. No timer, no retry, as `useHiddenDetailsFocus` (UX-P4.fix-6). A pointer press
 * outside the banner ends the record, as it moves the focus away even where it lands on `<body>` (precommit-review).
 */
export function useRestoreBannerFocus(listId: string): void {
    const state = useRef({ inBanner: false, present: false, owed: false });
    const settle = useRef<() => void>(() => undefined);
    settle.current = () => {
        const current = state.current;
        if (!current.owed) {
            return;
        }
        if (document.querySelector(BANNER) !== null || !nowhere(document.activeElement)) {
            current.owed = false;
            return;
        }
        if (!document.hasFocus()) {
            return;
        }
        current.owed = false;
        if (!focusListRow(listId, 'group-row-transitive') && !focusList(listId)) {
            restoreFocus(null);
        }
    };

    useEffect(() => {
        const onFocusIn = (event: FocusEvent): void => {
            const inBanner = event.target instanceof Element && event.target.closest(BANNER) !== null;
            state.current.inBanner = inBanner;
            if (!inBanner) {
                state.current.owed = false;
            }
        };
        // A press outside the banner moves the focus away from it, to `<body>` on a part that takes none, with no `focusin`.
        const onPointerDown = (event: PointerEvent): void => {
            if (!(event.target instanceof Element && event.target.closest(BANNER) !== null)) {
                state.current.inBanner = false;
                state.current.owed = false;
            }
        };
        const onFocus = (): void => settle.current();
        document.addEventListener('focusin', onFocusIn);
        document.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('focus', onFocus);
        return () => {
            document.removeEventListener('focusin', onFocusIn);
            document.removeEventListener('pointerdown', onPointerDown, true);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    // After every commit: a banner that was in the document and is not, with the focus last in it and now nowhere, owes the move.
    useLayoutEffect(() => {
        const current = state.current;
        const present = document.querySelector(BANNER) !== null;
        if (current.present && !present && current.inBanner && nowhere(document.activeElement)) {
            current.owed = true;
        }
        current.present = present;
        settle.current();
    });
}

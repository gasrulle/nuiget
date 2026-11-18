import { act, cleanup, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHiddenDetailsFocus } from './useHiddenDetailsFocus';

/** The split as the shell renders it: the list pane with a tree (or none), the details pane with a control. */
function Split({ withRow = true }: { withRow?: boolean }): React.JSX.Element {
    const splitRef = useRef<HTMLDivElement>(null);
    useHiddenDetailsFocus(splitRef, 'installed-list', 'list-pane');
    return (
        <>
            <input aria-label="Search" data-testid="search-input" />
            <div className="nuiget-main-split" ref={splitRef}>
                <div className="nuiget-main-list" id="list-pane">
                    <div role="tree" aria-label="Installed packages" data-testid="installed-list">
                        {withRow ? <div role="treeitem" aria-selected="false" tabIndex={0} data-testid="row">Serilog</div> : null}
                    </div>
                </div>
                <div className="nuiget-main-details" data-testid="details">
                    <button type="button" data-testid="details-control">Update</button>
                </div>
            </div>
        </>
    );
}

describe('the details pane the split hides with the focus inside (UX-P4.fix-6)', () => {
    let resized: () => void;
    let hasFocus: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        const callbacks: Array<() => void> = [];
        resized = () => act(() => callbacks.forEach(callback => callback()));
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: () => void) {
                callbacks.push(callback);
            }
            observe(): void { /* the test calls `resized` */ }
            disconnect(): void { /* nothing to release */ }
        });
        hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        hasFocus.mockRestore();
    });

    const pane = (): HTMLElement => screen.getByTestId('details');
    const hide = (): void => { pane().style.display = 'none'; };
    const show = (): void => { pane().style.display = ''; };
    /** Mounted with the pane shown: the observer's first callback records it. */
    const mountShown = (withRow = true): void => {
        render(<Split withRow={withRow} />);
        resized();
    };

    it('moves the focus from a control in the pane to the visible list\'s active row when the pane is hidden', () => {
        mountShown();
        act(() => screen.getByTestId('details-control').focus());
        hide();
        resized();
        expect(screen.getByTestId('row')).toHaveFocus();
    });

    it('moves it as well when the hidden pane left the focus on <body> and the focus was last in the pane', () => {
        mountShown();
        act(() => screen.getByTestId('details-control').focus());
        // The focus goes nowhere while the document is not the focused one (jsdom keeps the focus on a hidden element, so the
        // fixup is played by a blur): the record stays.
        hasFocus.mockReturnValue(false);
        act(() => screen.getByTestId('details-control').blur());
        hasFocus.mockReturnValue(true);
        expect(document.activeElement).toBe(document.body);
        hide();
        resized();
        expect(screen.getByTestId('row')).toHaveFocus();
    });

    it('claims nothing when the panel opens narrow with the focus on <body>', () => {
        render(<Split />);
        hide();
        resized();
        resized();
        expect(document.activeElement).toBe(document.body);
    });

    it('waits for the document\'s focus gain when the document has no focus, then moves it', () => {
        mountShown();
        act(() => screen.getByTestId('details-control').focus());
        hasFocus.mockReturnValue(false);
        hide();
        resized();
        expect(screen.getByTestId('details-control')).toHaveFocus();
        hasFocus.mockReturnValue(true);
        act(() => { window.dispatchEvent(new FocusEvent('focus')); });
        expect(screen.getByTestId('row')).toHaveFocus();
    });

    it('owes nothing once the pane is shown again before the focus gain', () => {
        mountShown();
        act(() => screen.getByTestId('details-control').focus());
        hasFocus.mockReturnValue(false);
        hide();
        resized();
        show();
        resized();
        hasFocus.mockReturnValue(true);
        act(() => { window.dispatchEvent(new FocusEvent('focus')); });
        expect(screen.getByTestId('details-control')).toHaveFocus();
    });

    it('forgets the pane when the user left it to nowhere while it was shown: a later narrowing claims nothing', () => {
        mountShown();
        act(() => screen.getByTestId('details-control').focus());
        act(() => screen.getByTestId('details-control').blur());
        expect(document.activeElement).toBe(document.body);
        hide();
        resized();
        expect(document.activeElement).toBe(document.body);
    });

    it('owes nothing once the focus lands outside the pane before the focus gain', () => {
        mountShown();
        act(() => screen.getByTestId('details-control').focus());
        hasFocus.mockReturnValue(false);
        hide();
        resized();
        act(() => screen.getByTestId('search-input').focus());
        hasFocus.mockReturnValue(true);
        act(() => { window.dispatchEvent(new FocusEvent('focus')); });
        expect(screen.getByTestId('search-input')).toHaveFocus();
    });

    it('gives the focus to the first control of the page when the list has no row, never to <body>', () => {
        mountShown(false);
        act(() => screen.getByTestId('details-control').focus());
        hide();
        resized();
        expect(screen.getByTestId('search-input')).toHaveFocus();
    });
});

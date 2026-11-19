import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useRestoreBannerFocus } from './useRestoreBannerFocus';

/** A banner with Restore above a list; `row` decides whether the Transitive group row is rendered (a virtualized row may not be). */
function Harness({ list = true, row = true }: { list?: boolean; row?: boolean }): React.JSX.Element {
    const [banner, setBanner] = useState(true);
    useRestoreBannerFocus('installed-list');
    return (
        <>
            <button type="button" data-testid="leave" onClick={() => setBanner(false)}>Leave</button>
            <p data-testid="text">Text</p>
            {banner ? <div data-testid="transitive-restore-banner"><button type="button" data-testid="restore">Restore</button></div> : null}
            {list ? (
                <div role="tree" data-testid="installed-list">
                    <div role="presentation" data-testid="package-row-serilog"><div role="treeitem" tabIndex={0} data-testid="serilog">Serilog</div></div>
                    {row ? <div role="presentation" data-testid="group-row-transitive"><div role="treeitem" tabIndex={-1} data-testid="transitive">Transitive</div></div> : null}
                </div>
            ) : null}
        </>
    );
}

describe('useRestoreBannerFocus (UX-P4.fix-16)', () => {
    let hasFocus: MockInstance<() => boolean>;

    beforeEach(() => {
        hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    });

    afterEach(() => {
        cleanup();
        hasFocus.mockRestore();
    });

    it('moves the focus to the Transitive group row when the banner leaves with the focus on Restore', () => {
        render(<Harness />);
        act(() => screen.getByTestId('restore').focus());
        // The click that removes the banner comes from code here, not a focus move: the focus stays on Restore until it goes.
        act(() => { screen.getByTestId('leave').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(screen.getByTestId('transitive')).toHaveFocus();
    });

    it('falls back to the list\'s active row when the Transitive group row is not rendered', () => {
        render(<Harness row={false} />);
        act(() => screen.getByTestId('restore').focus());
        act(() => { screen.getByTestId('leave').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(screen.getByTestId('serilog')).toHaveFocus();
    });

    it('falls back to the dialogs\' order, the first control of the page, when there is no list', () => {
        render(<Harness list={false} />);
        act(() => screen.getByTestId('restore').focus());
        act(() => { screen.getByTestId('leave').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(screen.getByTestId('leave')).toHaveFocus();
    });

    it('drops an owed move when the focus lands elsewhere before the window\'s next focus', () => {
        render(<Harness />);
        hasFocus.mockReturnValue(false);
        act(() => screen.getByTestId('restore').focus());
        act(() => { screen.getByTestId('leave').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(document.activeElement).toBe(document.body);
        act(() => screen.getByTestId('serilog').focus());
        hasFocus.mockReturnValue(true);
        act(() => { window.dispatchEvent(new FocusEvent('focus')); });
        expect(screen.getByTestId('serilog')).toHaveFocus();
    });

    it('moves nothing when a press outside the banner took the focus away to the page first', () => {
        render(<Harness />);
        act(() => screen.getByTestId('restore').focus());
        // A press on text that takes no focus: the focus goes to <body> with no focusin.
        fireEvent.pointerDown(screen.getByTestId('text'));
        act(() => screen.getByTestId('restore').blur());
        act(() => { screen.getByTestId('leave').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(document.activeElement).toBe(document.body);
    });
});

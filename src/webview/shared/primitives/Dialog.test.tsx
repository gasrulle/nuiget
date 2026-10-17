import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import React, { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog } from './Dialog';
import { axeRuleOutcome } from './testSupport';

/** A page with a button that opens a dialog of three controls. */
function Page({ initialFocus = false }: { initialFocus?: boolean }) {
    const [open, setOpen] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);
    return (
        <main>
            <button type="button" onClick={() => setOpen(true)}>Sources</button>
            <button type="button">Outside</button>
            <Dialog
                open={open}
                onClose={() => setOpen(false)}
                title="NuGet sources"
                description="Sources are read from the nuget.config files of the project."
                closeLabel="Close NuGet sources"
                initialFocus={initialFocus ? nameRef : undefined}
                data-testid="source-settings-modal"
                footer={<button type="button" onClick={() => setOpen(false)}>Done</button>}
            >
                <label>Name <input ref={nameRef} /></label>
            </Dialog>
        </main>
    );
}

describe('Dialog', () => {
    it('renders nothing when closed and a modal dialog on the body when open', async () => {
        const user = userEvent.setup();
        const { container } = render(<Page />);
        expect(screen.queryByRole('dialog')).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Sources' }));
        const dialog = screen.getByRole('dialog', { name: 'NuGet sources' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAccessibleDescription('Sources are read from the nuget.config files of the project.');
        expect(dialog).toHaveAttribute('data-testid', 'source-settings-modal');
        // Portalled: no parent of the page clips it or stacks above it.
        expect(container).not.toContainElement(dialog);
        expect(dialog.closest('.nuiget-dialog-layer')?.parentElement).toBe(document.body);
        // The title is a heading; the close button has a name (U6: the 1.x close button had none).
        expect(screen.getByRole('heading', { level: 2, name: 'NuGet sources' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close NuGet sources' })).toBeInTheDocument();
    });

    it('focus moves to the first control, or to initialFocus, when it opens', async () => {
        const user = userEvent.setup();
        const first = render(<Page />);
        await user.click(screen.getByRole('button', { name: 'Sources' }));
        expect(screen.getByRole('button', { name: 'Close NuGet sources' })).toHaveFocus();
        first.unmount();

        render(<Page initialFocus />);
        await user.click(screen.getByRole('button', { name: 'Sources' }));
        expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    });

    it('Tab and Shift+Tab wrap inside the dialog', async () => {
        const user = userEvent.setup();
        render(<Page />);
        await user.click(screen.getByRole('button', { name: 'Sources' }));
        const close = screen.getByRole('button', { name: 'Close NuGet sources' });
        const done = screen.getByRole('button', { name: 'Done' });
        await user.tab();
        expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
        await user.tab();
        expect(done).toHaveFocus();
        await user.tab();
        expect(close).toHaveFocus();
        await user.tab({ shift: true });
        expect(done).toHaveFocus();
    });

    it('Escape closes it and focus returns to the opener', async () => {
        const user = userEvent.setup();
        render(<Page />);
        const opener = screen.getByRole('button', { name: 'Sources' });
        await user.click(opener);
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(opener).toHaveFocus();

        // The same through the close button and through the owner's own button.
        await user.click(opener);
        await user.click(screen.getByRole('button', { name: 'Close NuGet sources' }));
        expect(opener).toHaveFocus();
        await user.click(opener);
        await user.click(screen.getByRole('button', { name: 'Done' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(opener).toHaveFocus();
    });

    it('focus that lands outside is taken back', async () => {
        const user = userEvent.setup();
        render(<Page />);
        await user.click(screen.getByRole('button', { name: 'Sources' }));
        act(() => screen.getByRole('button', { name: 'Outside' }).focus());
        expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    });

    it('a dialog without a focusable control holds focus itself', async () => {
        const user = userEvent.setup();
        render(<Dialog open onClose={() => undefined} title="Working">Removing the source…</Dialog>);
        const dialog = screen.getByRole('dialog', { name: 'Working' });
        expect(dialog).toHaveFocus();
        await user.tab();
        expect(dialog).toHaveFocus();
    });

    it('a dialog opened from a dialog traps focus and Escape closes only the inner one', async () => {
        // The third 1.x dialog: Remove source asks for confirmation over the Source Settings dialog.
        function Sources() {
            const [confirming, setConfirming] = useState(false);
            const [open, setOpen] = useState(true);
            return (
                <Dialog open={open} onClose={() => setOpen(false)} title="NuGet sources" closeLabel="Close NuGet sources">
                    <button type="button" onClick={() => setConfirming(true)}>Remove nuget.org</button>
                    <ConfirmDialog open={confirming} title="Remove source?" confirmLabel="Remove" onConfirm={() => setConfirming(false)} onCancel={() => setConfirming(false)}>
                        The source nuget.org is removed from nuget.config. This cannot be undone.
                    </ConfirmDialog>
                </Dialog>
            );
        }
        const user = userEvent.setup();
        render(<Sources />);
        const remove = screen.getByRole('button', { name: 'Remove nuget.org' });
        await user.click(remove);
        const confirm = screen.getByRole('alertdialog', { name: 'Remove source?' });
        expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus();
        // The inner dialog traps: Tab cycles between its two buttons and never reaches the outer one.
        await user.tab();
        expect(screen.getByTestId('confirm-dialog-confirm')).toHaveFocus();
        await user.tab();
        expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus();
        // Escape closes the confirmation, not the dialog under it, and focus goes back to the Remove button.
        await user.keyboard('{Escape}');
        expect(confirm).not.toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'NuGet sources' })).toBeInTheDocument();
        expect(remove).toHaveFocus();
        // Now the outer dialog is on top again and answers Escape.
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('a change of onClose while open does not move focus', async () => {
        const user = userEvent.setup();
        const first = vi.fn();
        const second = vi.fn();
        const { rerender } = render(<Dialog open onClose={first} title="Sources"><input aria-label="Name" /><input aria-label="Url" /></Dialog>);
        await user.tab();
        expect(screen.getByRole('textbox', { name: 'Url' })).toHaveFocus();
        rerender(<Dialog open onClose={second} title="Sources"><input aria-label="Name" /><input aria-label="Url" /></Dialog>);
        expect(screen.getByRole('textbox', { name: 'Url' })).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('Tab skips pointer-only buttons: Shift+Tab from the first control wraps to the last tabbable one', async () => {
        const user = userEvent.setup();
        render(
            <Dialog open onClose={() => undefined} title="Sources" footer={<><button type="button">Done</button><button type="button" tabIndex={-1}>Pointer only</button></>}>
                <input aria-label="Name" />
            </Dialog>,
        );
        expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
        await user.tab({ shift: true });
        expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
    });

    it('Escape that closes the dialog does not reach the page', async () => {
        // A surface uses Escape too (the filter box clears on it); closing a dialog must not also do that.
        const user = userEvent.setup();
        const onPageKey = vi.fn();
        const onClose = vi.fn();
        render(
            <div onKeyDown={event => onPageKey(event.key)}>
                <Dialog open onClose={onClose} title="Sources"><input aria-label="Name" /></Dialog>
            </div>,
        );
        await user.keyboard('a{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onPageKey.mock.calls).toEqual([['a']]);
    });

    it('has no axe violations', async () => {
        const user = userEvent.setup();
        render(<Page />);
        await user.click(screen.getByRole('button', { name: 'Sources' }));
        // The dialog is on the body, outside the render container: check the whole document.
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-dialog-name')).toBe('passes');
    });
});

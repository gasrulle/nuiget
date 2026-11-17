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
        // UX-P3.6: the outer layer is covered (hidden) while the inner one is open; the inner one is not.
        const outerLayer = (): Element | null => screen.getByRole('dialog', { name: 'NuGet sources', hidden: true }).parentElement;
        expect(outerLayer()).toHaveAttribute('data-covered');
        expect(confirm.parentElement).not.toHaveAttribute('data-covered');
        // The inner dialog traps: Tab cycles between its two buttons and never reaches the outer one.
        await user.tab();
        expect(screen.getByTestId('confirm-dialog-confirm')).toHaveFocus();
        await user.tab();
        expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus();
        // Escape closes the confirmation, not the dialog under it, and focus goes back to the Remove button.
        await user.keyboard('{Escape}');
        expect(confirm).not.toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'NuGet sources' })).toBeInTheDocument();
        expect(outerLayer()).not.toHaveAttribute('data-covered');
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

    describe('where the focus goes when it closes (UX-P4.4, A6)', () => {
        /** A toolbar whose button opens a confirm and a list with a roving tab stop; Confirm can disable the opener. */
        function BulkPage({ disableOnConfirm = true, disabledFromStart = false, rows = true }: { disableOnConfirm?: boolean; disabledFromStart?: boolean; rows?: boolean }) {
            const [open, setOpen] = useState(false);
            const [count, setCount] = useState(disabledFromStart ? 0 : 2);
            return (
                <main>
                    <div role="toolbar" aria-label="Bulk">
                        <button type="button" tabIndex={-1}>Select All</button>
                        <button type="button" disabled={count === 0} onClick={() => setOpen(true)}>Uninstall Selected</button>
                    </div>
                    {rows ? (
                        <div role="listbox" aria-label="Packages">
                            <div role="option" aria-selected="false" tabIndex={-1}>Moq</div>
                            <div role="option" aria-selected="false" tabIndex={0}>Serilog</div>
                        </div>
                    ) : null}
                    <ConfirmDialog
                        open={open}
                        title="Uninstall 2 packages?"
                        confirmLabel="Uninstall"
                        onConfirm={() => { setOpen(false); if (disableOnConfirm) { setCount(0); } }}
                        onCancel={() => setOpen(false)}
                    />
                </main>
            );
        }

        it('goes to the list\'s active row when Confirm disables the opener in the same update', async () => {
            const user = userEvent.setup();
            render(<BulkPage />);
            await user.click(screen.getByRole('button', { name: 'Uninstall Selected' }));
            await user.click(screen.getByRole('button', { name: 'Uninstall' }));
            expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Serilog' }));
        });

        it('goes to the list\'s active row when the opener was disabled as the dialog opened', async () => {
            const user = userEvent.setup();
            function DisablingOpener() {
                const [open, setOpen] = useState(false);
                const [used, setUsed] = useState(false);
                return (
                    <main>
                        <div role="toolbar" aria-label="Details">
                            <button type="button" disabled={used} onClick={() => { setUsed(true); setOpen(true); }}>Install</button>
                        </div>
                        <div role="listbox" aria-label="Results"><div role="option" aria-selected="false" tabIndex={0}>Polly</div></div>
                        <ConfirmDialog open={open} title="Install Polly?" confirmLabel="Install" onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)} />
                    </main>
                );
            }
            render(<DisablingOpener />);
            const opener = screen.getByRole('button', { name: 'Install' });
            await user.click(opener);
            expect(opener).toBeDisabled();
            await user.keyboard('{Escape}');
            expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Polly' }));
        });

        it('goes to the first control of the page when no list and no toolbar can take it', async () => {
            const user = userEvent.setup();
            function Bare() {
                const [open, setOpen] = useState(false);
                const [gone, setGone] = useState(false);
                return (
                    <main>
                        {gone ? null : <button type="button" onClick={() => setOpen(true)}>Open</button>}
                        <button type="button">Next</button>
                        <ConfirmDialog open={open} title="Remove?" confirmLabel="Remove" onConfirm={() => { setOpen(false); setGone(true); }} onCancel={() => setOpen(false)} />
                    </main>
                );
            }
            render(<Bare />);
            await user.click(screen.getByRole('button', { name: 'Open' }));
            await user.click(screen.getByRole('button', { name: 'Remove' }));
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
        });

        it('a dialog unmounted while open gives the focus back at once', async () => {
            const user = userEvent.setup();
            function Owner() {
                const [shown, setShown] = useState(true);
                const [open, setOpen] = useState(false);
                return (
                    <main>
                        <button type="button" onClick={() => setOpen(true)}>Open</button>
                        <button type="button" onClick={() => setShown(false)}>Hide</button>
                        {shown ? <Dialog open={open} onClose={() => setOpen(false)} title="Sources"><button type="button" onClick={() => setShown(false)}>Leave</button></Dialog> : null}
                    </main>
                );
            }
            render(<Owner />);
            const opener = screen.getByRole('button', { name: 'Open' });
            await user.click(opener);
            await user.click(screen.getByRole('button', { name: 'Leave' }));
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(document.activeElement).toBe(opener);
        });

        it('under StrictMode, Cancel still returns to the opener', async () => {
            const user = userEvent.setup();
            render(<React.StrictMode><BulkPage /></React.StrictMode>);
            const opener = screen.getByRole('button', { name: 'Uninstall Selected' });
            await user.click(opener);
            await user.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(document.activeElement).toBe(opener);
        });

        it('goes to a list\'s active row when nothing was focused before it opened', () => {
            render(<main><div role="listbox" aria-label="Packages"><div role="option" aria-selected="false" tabIndex={0}>Polly</div></div></main>);
            (document.activeElement as HTMLElement | null)?.blur();
            const { rerender } = render(<Dialog open onClose={() => undefined} title="NuGet sources"><button type="button">Done</button></Dialog>);
            rerender(<Dialog open={false} onClose={() => undefined} title="NuGet sources"><button type="button">Done</button></Dialog>);
            expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Polly' }));
        });

        it('stays in a layer still open underneath, never on the page', async () => {
            const user = userEvent.setup();
            function Stacked() {
                const [inner, setInner] = useState(false);
                return (
                    <Dialog open onClose={() => undefined} title="NuGet sources">
                        <button type="button" onClick={() => setInner(true)}>Remove</button>
                        <ConfirmDialog open={inner} title="Remove nuget.org?" confirmLabel="Remove" onConfirm={() => setInner(false)} onCancel={() => setInner(false)} />
                    </Dialog>
                );
            }
            render(<main><button type="button">Page</button><Stacked /></main>);
            await user.click(screen.getByRole('button', { name: 'Remove' }));
            await user.click(screen.getByTestId('confirm-dialog-confirm'));
            expect(screen.getByRole('dialog', { name: 'NuGet sources' })).toContainElement(document.activeElement as HTMLElement);
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove' }));
        });

        it('goes to the first enabled control of the opener\'s toolbar, whatever its tabindex, when no list has a row', async () => {
            const user = userEvent.setup();
            render(<BulkPage rows={false} />);
            await user.click(screen.getByRole('button', { name: 'Uninstall Selected' }));
            await user.click(screen.getByRole('button', { name: 'Uninstall' }));
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Select All' }));
        });

        it('Cancel and Escape still return to an enabled opener', async () => {
            const user = userEvent.setup();
            render(<BulkPage />);
            const opener = screen.getByRole('button', { name: 'Uninstall Selected' });
            await user.click(opener);
            await user.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(document.activeElement).toBe(opener);
            await user.click(opener);
            await user.keyboard('{Escape}');
            expect(document.activeElement).toBe(opener);
        });
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

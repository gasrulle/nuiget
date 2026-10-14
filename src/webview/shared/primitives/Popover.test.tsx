import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import React, { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';
import { placePopover, Popover, type PopoverPoint } from './Popover';
import { axeRuleOutcome, installFakeViewport } from './testSupport';

const viewport = { width: 400, height: 300 };
const size = { width: 120, height: 80 };

/** The Multi Install picker of the details panel (the second 1.x dialog): a button and a popover of checkboxes. */
function MultiInstall({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    const anchor = useRef<HTMLButtonElement>(null);
    return (
        <main>
            <button ref={anchor} type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>Multi Install</button>
            <button type="button">Elsewhere</button>
            <p>Plain text</p>
            <Popover
                open={open}
                anchor={anchor}
                label="Install in projects"
                data-testid="multi-install-popover"
                onClose={() => {
                    onClose?.();
                    setOpen(false);
                }}
            >
                <label><input type="checkbox" /> App.csproj</label>
                <label><input type="checkbox" /> Lib.csproj</label>
                <button type="button">Install</button>
            </Popover>
        </main>
    );
}

describe('placePopover', () => {
    it('places it below the anchor, aligned with its start', () => {
        expect(placePopover({ left: 10, top: 20, right: 60, bottom: 44 }, size, viewport)).toEqual({ x: 10, y: 46, side: 'below' });
    });

    it('flips above when there is no room below and more above', () => {
        expect(placePopover({ left: 10, top: 250, right: 60, bottom: 274 }, size, viewport)).toEqual({ x: 10, y: 168, side: 'above' });
    });

    it('stays below when neither side fits and below has more room, moved up to stay inside', () => {
        const tall = { width: 120, height: 280 };
        expect(placePopover({ left: 10, top: 100, right: 60, bottom: 124 }, tall, viewport)).toEqual({ x: 10, y: 16, side: 'below' });
    });

    it('moves left to stay inside the right edge and never past the left edge', () => {
        expect(placePopover({ left: 350, top: 20, right: 390, bottom: 44 }, size, viewport).x).toBe(276);
        expect(placePopover({ left: -30, top: 20, right: 10, bottom: 44 }, size, viewport).x).toBe(4);
        expect(placePopover({ left: 0, top: 20, right: 10, bottom: 44 }, { width: 500, height: 80 }, viewport).x).toBe(4);
    });
});

describe('Popover', () => {
    let removeViewport: (() => void) | undefined;

    afterEach(() => {
        removeViewport?.();
        removeViewport = undefined;
    });

    it('is a named non-modal dialog on the body, placed by custom properties only', async () => {
        removeViewport = installFakeViewport({ ...viewport, rects: { '.nuiget-popover': { left: 0, top: 0, ...size }, 'main > button:first-child': { left: 350, top: 250, width: 40, height: 24 } } });
        const user = userEvent.setup();
        const { container } = render(<MultiInstall />);
        await user.click(screen.getByRole('button', { name: 'Multi Install' }));
        const popover = screen.getByRole('dialog', { name: 'Install in projects' });
        expect(popover).not.toHaveAttribute('aria-modal');
        expect(container).not.toContainElement(popover);
        expect(popover.parentElement).toBe(document.body);
        // Anchored at the bottom right: flipped above and moved inside the right edge.
        expect(popover).toHaveAttribute('data-placed', 'true');
        expect(popover.getAttribute('style')).toBe('--nuiget-popover-x: 276px; --nuiget-popover-y: 168px;');
    });

    it('focus moves into it; Escape closes it and returns focus to the anchor', async () => {
        const user = userEvent.setup();
        render(<MultiInstall />);
        const anchor = screen.getByRole('button', { name: 'Multi Install' });
        await user.click(anchor);
        expect(screen.getByRole('checkbox', { name: 'App.csproj' })).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(anchor).toHaveFocus();
    });

    it('Tab past the last or before the first control closes it and returns focus to the anchor', async () => {
        const user = userEvent.setup();
        render(<MultiInstall />);
        const anchor = screen.getByRole('button', { name: 'Multi Install' });
        await user.click(anchor);
        await user.tab();
        await user.tab();
        expect(screen.getByRole('button', { name: 'Install' })).toHaveFocus();
        await user.tab();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(anchor).toHaveFocus();

        await user.click(anchor);
        await user.tab({ shift: true });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(anchor).toHaveFocus();
    });

    it('a press outside closes it and leaves focus where the press put it; a press on the anchor toggles', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<MultiInstall onClose={onClose} />);
        const anchor = screen.getByRole('button', { name: 'Multi Install' });
        await user.click(anchor);
        // Inside: stays open.
        await user.click(screen.getByRole('checkbox', { name: 'Lib.csproj' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        // On the anchor: the anchor's own click closes it, once.
        await user.click(anchor);
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(onClose).not.toHaveBeenCalled();
        // Outside: closes, and focus stays on what was pressed.
        await user.click(anchor);
        await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
    });

    it('a press on something that takes no focus closes it too', async () => {
        const user = userEvent.setup();
        render(<MultiInstall />);
        await user.click(screen.getByRole('button', { name: 'Multi Install' }));
        await user.click(screen.getByText('Plain text'));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('focus moved out by a script closes it and stays where it was moved', async () => {
        const user = userEvent.setup();
        render(<MultiInstall />);
        await user.click(screen.getByRole('button', { name: 'Multi Install' }));
        const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
        act(() => elsewhere.focus());
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(elsewhere).toHaveFocus();
    });

    it('a dialog opened from it is on top: pressing in the dialog leaves the popover open', async () => {
        function PickerWithHelp() {
            const [open, setOpen] = useState(false);
            const [help, setHelp] = useState(false);
            const anchor = useRef<HTMLButtonElement>(null);
            return (
                <>
                    <button ref={anchor} type="button" onClick={() => setOpen(true)}>Multi Install</button>
                    <Popover open={open} anchor={anchor} label="Install in projects" onClose={() => setOpen(false)}>
                        <button type="button" onClick={() => setHelp(true)}>Why is a project missing?</button>
                        <Dialog open={help} onClose={() => setHelp(false)} title="Missing projects">
                            <p>Projects of an unsupported format are not listed.</p>
                            <button type="button" onClick={() => setHelp(false)}>Got it</button>
                        </Dialog>
                    </Popover>
                </>
            );
        }
        const user = userEvent.setup();
        render(<PickerWithHelp />);
        await user.click(screen.getByRole('button', { name: 'Multi Install' }));
        const why = screen.getByRole('button', { name: 'Why is a project missing?' });
        await user.click(why);
        await user.click(screen.getByText('Projects of an unsupported format are not listed.'));
        expect(screen.getByRole('dialog', { name: 'Install in projects' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Got it' }));
        expect(screen.queryByRole('dialog', { name: 'Missing projects' })).toBeNull();
        expect(screen.getByRole('dialog', { name: 'Install in projects' })).toBeInTheDocument();
        expect(why).toHaveFocus();
    });

    it('closing it while focus is in a dialog above it leaves focus in the dialog', async () => {
        function Stack({ popover, dialog }: { popover: boolean; dialog: boolean }) {
            const anchor = useRef<HTMLButtonElement>(null);
            const url = useRef<HTMLInputElement>(null);
            return (
                <>
                    <button ref={anchor} type="button">Multi Install</button>
                    <Popover open={popover} anchor={anchor} label="Install in projects" onClose={() => undefined}>
                        <button type="button">Install</button>
                    </Popover>
                    <Dialog open={dialog} onClose={() => undefined} title="Add source" initialFocus={url}>
                        <input aria-label="Name" />
                        <input ref={url} aria-label="Url" />
                    </Dialog>
                </>
            );
        }
        const { rerender } = render(<Stack popover dialog={false} />);
        expect(screen.getByRole('button', { name: 'Install' })).toHaveFocus();
        rerender(<Stack popover dialog />);
        const url = screen.getByRole('textbox', { name: 'Url' });
        expect(url).toHaveFocus();
        rerender(<Stack popover={false} dialog />);
        expect(url).toHaveFocus();
    });

    it('a point anchor places it at the point, and Escape returns focus to what had it', async () => {
        // A context menu asked for with Shift+F10 on a row: the Listbox reports a point below the row.
        removeViewport = installFakeViewport({ ...viewport, rects: { '.nuiget-popover': { left: 0, top: 0, ...size } } });
        function RowMenu() {
            const [at, setAt] = useState<PopoverPoint | null>(null);
            return (
                <>
                    <button type="button" onClick={() => setAt({ x: 30, y: 60 })}>Serilog</button>
                    <Popover open={at !== null} anchor={at ?? { x: 0, y: 0 }} label="Actions for Serilog" onClose={() => setAt(null)}>
                        <button type="button">Uninstall</button>
                    </Popover>
                </>
            );
        }
        const user = userEvent.setup();
        render(<RowMenu />);
        const row = screen.getByRole('button', { name: 'Serilog' });
        await user.click(row);
        expect(screen.getByRole('dialog', { name: 'Actions for Serilog' }).getAttribute('style')).toBe('--nuiget-popover-x: 30px; --nuiget-popover-y: 62px;');
        expect(screen.getByRole('button', { name: 'Uninstall' })).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(row).toHaveFocus();
    });

    it('inside a dialog, Escape closes the popover and not the dialog', async () => {
        const user = userEvent.setup();
        const onDialogClose = vi.fn();
        render(<Dialog open onClose={onDialogClose} title="NuGet sources"><MultiInstall /></Dialog>);
        const anchor = screen.getByRole('button', { name: 'Multi Install' });
        await user.click(anchor);
        // Focus in the popover, which is outside the dialog's element: the dialog does not take it back.
        expect(screen.getByRole('checkbox', { name: 'App.csproj' })).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog', { name: 'Install in projects' })).toBeNull();
        expect(onDialogClose).not.toHaveBeenCalled();
        expect(anchor).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(onDialogClose).toHaveBeenCalledTimes(1);
    });

    it('has no axe violations', async () => {
        const user = userEvent.setup();
        render(<MultiInstall />);
        await user.click(screen.getByRole('button', { name: 'Multi Install' }));
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-dialog-name')).toBe('passes');
    });
});

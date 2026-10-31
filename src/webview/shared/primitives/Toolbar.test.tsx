import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { IconButton } from './IconButton';
import { TrashIcon } from './icons';
import { Toolbar } from './Toolbar';

/** The bulk toolbar of interaction model §8, with a selection count the owner changes. */
function BulkToolbar({ selected, extra = false }: { selected: number; extra?: boolean }) {
    return (
        <Toolbar label="Bulk actions" data-testid="bulk-toolbar">
            <button type="button" data-testid="select-all-button">Select all</button>
            <button type="button" data-testid="update-all-button">{`Update ${selected}`}</button>
            {extra ? <button type="button">Restore</button> : null}
            <IconButton label="Uninstall selected" disabled={selected === 0} data-testid="uninstall-selected-button"><TrashIcon /></IconButton>
        </Toolbar>
    );
}

const tabIndexes = (): number[] => screen.getAllByRole('button').map(button => button.tabIndex);

describe('Toolbar', () => {
    it('is a named toolbar with one tab stop', async () => {
        const user = userEvent.setup();
        render(<><button type="button">Before</button><BulkToolbar selected={2} /><button type="button">After</button></>);
        expect(screen.getByRole('toolbar', { name: 'Bulk actions' })).toHaveAttribute('data-testid', 'bulk-toolbar');
        expect(tabIndexes()).toEqual([0, 0, -1, -1, 0]);
        await user.click(screen.getByRole('button', { name: 'Before' }));
        await user.tab();
        expect(screen.getByTestId('select-all-button')).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    });

    it('ArrowRight, ArrowLeft, Home and End move between the enabled controls and wrap around', async () => {
        const user = userEvent.setup();
        render(<BulkToolbar selected={2} />);
        await user.click(screen.getByTestId('select-all-button'));
        await user.keyboard('{ArrowRight}');
        expect(screen.getByTestId('update-all-button')).toHaveFocus();
        await user.keyboard('{ArrowRight}');
        expect(screen.getByTestId('uninstall-selected-button')).toHaveFocus();
        await user.keyboard('{ArrowRight}');
        expect(screen.getByTestId('select-all-button')).toHaveFocus();
        await user.keyboard('{ArrowLeft}');
        expect(screen.getByTestId('uninstall-selected-button')).toHaveFocus();
        await user.keyboard('{Home}');
        expect(screen.getByTestId('select-all-button')).toHaveFocus();
        await user.keyboard('{End}');
        expect(screen.getByTestId('uninstall-selected-button')).toHaveFocus();
        // The control that has focus is the tab stop.
        expect(tabIndexes()).toEqual([-1, -1, 0]);
    });

    it('a disabled control is skipped, and a disabled tab stop hands the stop to the first control', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<BulkToolbar selected={2} />);
        await user.click(screen.getByTestId('uninstall-selected-button'));
        expect(tabIndexes()).toEqual([-1, -1, 0]);
        rerender(<BulkToolbar selected={0} />);
        await waitFor(() => expect(tabIndexes()).toEqual([0, -1, -1]));
        await user.click(screen.getByTestId('update-all-button'));
        await user.keyboard('{ArrowRight}');
        expect(screen.getByTestId('select-all-button')).toHaveFocus();
    });

    it('remembers the last focused control: a re-render of a child does not reset it, a later child is no second stop', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<BulkToolbar selected={2} />);
        await user.click(screen.getByTestId('update-all-button'));
        rerender(<BulkToolbar selected={5} />);
        expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update 5');
        expect(tabIndexes()).toEqual([-1, 0, -1]);
        rerender(<BulkToolbar selected={5} extra />);
        await waitFor(() => expect(tabIndexes()).toEqual([-1, 0, -1, -1]));
    });

    it('in a text field Home, End and the arrows move the caret, and an arrow leaves at the edge of the text', async () => {
        function Filtered() {
            const [text, setText] = useState('ab');
            return (
                <Toolbar label="Filter">
                    <input aria-label="Filter" value={text} onChange={event => setText(event.target.value)} />
                    <button type="button">Clear</button>
                </Toolbar>
            );
        }
        const user = userEvent.setup();
        render(<Filtered />);
        const field = screen.getByRole('textbox', { name: 'Filter' });
        await user.click(field);
        await user.keyboard('{ArrowLeft}x');
        expect(field).toHaveFocus();
        expect(field).toHaveValue('axb');
        await user.keyboard('{End}y');
        expect(field).toHaveValue('axby');
        // At the end of the text, ArrowRight leaves the field; at the start, ArrowLeft does.
        await user.keyboard('{ArrowRight}');
        expect(screen.getByRole('button', { name: 'Clear' })).toHaveFocus();
        await user.keyboard('{ArrowLeft}');
        expect(field).toHaveFocus();
        await user.keyboard('{Home}{ArrowLeft}');
        expect(screen.getByRole('button', { name: 'Clear' })).toHaveFocus();
    });

    it('has no axe violations', async () => {
        const { container } = render(<BulkToolbar selected={0} />);
        expect(await axe(container)).toHaveNoViolations();
    });

    it('renders the end slot after the controls; ArrowRight, End and Home reach it in document order', async () => {
        const user = userEvent.setup();
        render(<Toolbar label="Bulk" end={<button type="button">Uninstall</button>}><button type="button">Select all</button><button type="button">Clear</button></Toolbar>);
        const toolbar = screen.getByRole('toolbar', { name: 'Bulk' });
        const end = screen.getByRole('button', { name: 'Uninstall' });
        expect(toolbar.lastElementChild).toHaveClass('nuiget-toolbar-end');
        expect(toolbar.lastElementChild).toContainElement(end);
        const first = screen.getByRole('button', { name: 'Select all' });
        await user.click(screen.getByRole('button', { name: 'Clear' }));
        await user.keyboard('{ArrowRight}');
        expect(end).toHaveFocus();
        await user.keyboard('{ArrowRight}');
        expect(first).toHaveFocus();
        await user.keyboard('{End}');
        expect(end).toHaveFocus();
        await user.keyboard('{Home}');
        expect(first).toHaveFocus();
    });
});

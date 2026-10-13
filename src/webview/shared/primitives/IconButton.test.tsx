import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';
import { TrashIcon } from './icons';

describe('IconButton', () => {
    it('has the accessible name it is given', async () => {
        const onClick = vi.fn();
        render(<IconButton label="Uninstall Serilog" onClick={onClick}><TrashIcon /></IconButton>);
        const button = screen.getByRole('button', { name: 'Uninstall Serilog' });
        expect(button).toHaveAttribute('type', 'button');
        // Named by `aria-label`; the tooltip says the same to those who see the icon. A title alone is a name
        // only where nothing better is found, and not every screen reader reads it.
        expect(button).toHaveAttribute('aria-label', 'Uninstall Serilog');
        expect(button).toHaveAttribute('title', 'Uninstall Serilog');
        // Whatever is given as the icon is decoration: the name is the button's.
        expect(button.children).toHaveLength(1);
        expect(button.firstElementChild).toHaveAttribute('aria-hidden', 'true');
        expect(button.firstElementChild).toContainElement(button.querySelector('svg'));
        await userEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('passes tabIndex, pressed and disabled through', () => {
        render(<>
            <IconButton label="Include prerelease" pressed tabIndex={-1} data-testid="row-action-toggle"><TrashIcon /></IconButton>
            <IconButton label="Update" disabled><TrashIcon /></IconButton>
        </>);
        const toggle = screen.getByTestId('row-action-toggle');
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        expect(toggle).toHaveAttribute('tabindex', '-1');
        expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
        // Not a toggle unless it says so.
        expect(screen.getByRole('button', { name: 'Update' })).not.toHaveAttribute('aria-pressed');
    });

    it('has no axe violations', async () => {
        const { container } = render(<IconButton label="Uninstall Serilog"><TrashIcon /></IconButton>);
        expect(await axe(container)).toHaveNoViolations();
    });
});

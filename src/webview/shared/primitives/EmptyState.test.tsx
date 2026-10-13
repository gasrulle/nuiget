import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
    it('renders the sentence and the optional action', async () => {
        const onClick = vi.fn();
        const { rerender } = render(<EmptyState message="No updates available" data-testid="updates-empty" />);
        const empty = screen.getByTestId('updates-empty');
        expect(empty).toHaveTextContent('No updates available');
        expect(screen.queryByRole('button')).toBeNull();
        // No role and no tab stop: the list's container around it takes the focus.
        expect(empty).not.toHaveAttribute('role');
        expect(empty.querySelector('[tabindex]')).toBeNull();
        expect(empty).not.toHaveAttribute('tabindex');

        rerender(<EmptyState message="No results for serilog" action={{ label: 'Clear search', onClick }} />);
        const action = screen.getByRole('button', { name: 'Clear search' });
        expect(action).toHaveAttribute('type', 'button');
        await userEvent.click(action);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('has no axe violations', async () => {
        const { container } = render(<EmptyState message="No results for serilog" action={{ label: 'Clear search', onClick: () => undefined }} />);
        expect(await axe(container)).toHaveNoViolations();
    });
});

import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
    it('determinate exposes the value, indeterminate omits aria-valuenow', () => {
        const { rerender } = render(<ProgressBar label="Restoring" value={40} />);
        const bar = screen.getByRole('progressbar', { name: 'Restoring' });
        expect(bar).toHaveAttribute('aria-valuenow', '40');
        expect(bar).toHaveAttribute('aria-valuemin', '0');
        expect(bar).toHaveAttribute('aria-valuemax', '100');
        expect(bar).not.toHaveClass('nuiget-progress--indeterminate');

        rerender(<ProgressBar label="Refreshing installed packages" />);
        const unknown = screen.getByRole('progressbar', { name: 'Refreshing installed packages' });
        // Without a value a screen reader says "busy", not "0 percent".
        expect(unknown).not.toHaveAttribute('aria-valuenow');
        expect(unknown).toHaveClass('nuiget-progress--indeterminate');

        // Nothing is done is a value too, and a value stays within the scale.
        rerender(<ProgressBar label="Restoring" value={0} />);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
        expect(screen.getByRole('progressbar')).not.toHaveClass('nuiget-progress--indeterminate');
        rerender(<ProgressBar label="Restoring" value={140} />);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
        rerender(<ProgressBar label="Restoring" value={-5} />);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    });

    it('the only inline style is the progress custom property', () => {
        const { container, rerender, unmount } = render(<ProgressBar label="Restoring" value={40} />);
        const styled = [...container.querySelectorAll('[style]')];
        expect(styled).toHaveLength(1);
        expect(styled[0]).toHaveClass('nuiget-progress-bar');
        expect(styled[0].getAttribute('style')).toBe('--nuiget-progress-value: 40%;');
        rerender(<ProgressBar label="Restoring" value={75} />);
        expect(styled[0].getAttribute('style')).toBe('--nuiget-progress-value: 75%;');
        // The value becomes unknown: the property goes, and the stylesheet's stripe takes over.
        rerender(<ProgressBar label="Restoring" />);
        expect(styled[0].getAttribute('style') ?? '').toBe('');
        unmount();

        const fresh = render(<ProgressBar label="Refreshing installed packages" />);
        expect(fresh.container.querySelectorAll('[style]')).toHaveLength(0);
    });

    it('has no axe violations', async () => {
        const { container } = render(<><ProgressBar label="Restoring" value={40} /><ProgressBar label="Refreshing installed packages" /></>);
        expect(await axe(container)).toHaveNoViolations();
    });
});

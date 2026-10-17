import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
    it('renders the number of rows asked and is hidden from assistive technology', () => {
        const { container, rerender } = render(<Skeleton density="compact" />);
        const skeleton = container.querySelector('.nuiget-skeleton');
        expect(skeleton).toHaveAttribute('aria-hidden', 'true');
        expect(container.querySelectorAll('.nuiget-skeleton-row.nuiget-skeleton-row--compact')).toHaveLength(3);
        // Decoration: no words, and not the live region. "Loading …" is a message of `LiveStatus`.
        expect(skeleton?.textContent).toBe('');
        expect(container.querySelector('[role]')).toBeNull();
        expect(screen.queryByTestId('status-live')).toBeNull();
        expect(skeleton).not.toHaveAttribute('aria-live');

        rerender(<Skeleton density="comfortable" rows={5} />);
        expect(container.querySelectorAll('.nuiget-skeleton-row--comfortable')).toHaveLength(5);
        expect(container.querySelectorAll('.nuiget-skeleton-row--compact')).toHaveLength(0);
    });

    it('has no axe violations', async () => {
        const { container } = render(<Skeleton density="compact" />);
        expect(await axe(container)).toHaveNoViolations();
    });
});

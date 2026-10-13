import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
    it('reads its title to assistive technology when one is given', () => {
        const { container } = render(<p aria-label="described" id="about"><Badge label="CPM" title="Centrally managed" tone="info" /></p>);
        const badge = container.querySelector('.nuiget-badge');
        expect(badge).toHaveClass('nuiget-badge--info');
        // The abbreviation is for the eye, the words for the ear.
        expect(screen.getByText('CPM')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByText('Centrally managed')).toHaveClass('nuiget-visually-hidden');
        // A span may not carry `aria-label` (axe: aria-prohibited-attr).
        expect(badge).not.toHaveAttribute('aria-label');
        expect(badge).not.toHaveAttribute('role');
    });

    it('shows its label as it is when it has no title', () => {
        const { container } = render(<Badge label="3" />);
        const badge = container.querySelector('.nuiget-badge');
        expect(badge).toHaveTextContent('3');
        expect(badge).toHaveClass('nuiget-badge--neutral');
        expect(badge?.querySelector('[aria-hidden]')).toBeNull();
    });

    it('has no axe violations', async () => {
        const { container } = render(<p>Serilog <Badge label="CPM" title="Centrally managed" /> <Badge label="2" /></p>);
        expect(await axe(container)).toHaveNoViolations();
    });
});

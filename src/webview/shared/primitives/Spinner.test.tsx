import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
    it('is decorative without a label and an image with one', () => {
        const decorative = render(<Spinner />);
        expect(decorative.container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.queryByRole('img')).toBeNull();
        decorative.unmount();

        render(<Spinner label="Updating Serilog" />);
        expect(screen.getByRole('img', { name: 'Updating Serilog' })).toBeInTheDocument();
    });

    it('renders no inline style: the stylesheet turns it', () => {
        const { container } = render(<Spinner label="Loading" size={12} />);
        expect(container.querySelector('.nuiget-spinner')).not.toBeNull();
        expect(container.querySelectorAll('[style]')).toHaveLength(0);
        expect(container.querySelector('svg')).toHaveAttribute('width', '12');
    });

    it('has no axe violations', async () => {
        const { container } = render(<p><Spinner /> <Spinner label="Updating Serilog" /></p>);
        expect(await axe(container)).toHaveNoViolations();
    });
});

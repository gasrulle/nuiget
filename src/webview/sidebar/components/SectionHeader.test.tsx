import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SectionHeader } from './SectionHeader';

describe('SectionHeader', () => {
    const defaultProps = {
        title: 'Updates',
        expanded: false,
        onToggle: vi.fn(),
    };

    it('renders title', () => {
        render(<SectionHeader {...defaultProps} />);
        expect(screen.getByText('Updates')).toBeInTheDocument();
    });

    it('has button role and aria-expanded', () => {
        render(<SectionHeader {...defaultProps} expanded={true} />);
        const header = screen.getByRole('button');
        expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    it('sets aria-expanded=false when collapsed', () => {
        render(<SectionHeader {...defaultProps} expanded={false} />);
        expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    });

    it('calls onToggle on click', () => {
        const onToggle = vi.fn();
        render(<SectionHeader {...defaultProps} onToggle={onToggle} />);
        fireEvent.click(screen.getByRole('button'));
        expect(onToggle).toHaveBeenCalledOnce();
    });

    it('calls onToggle on Enter key', () => {
        const onToggle = vi.fn();
        render(<SectionHeader {...defaultProps} onToggle={onToggle} />);
        fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
        expect(onToggle).toHaveBeenCalledOnce();
    });

    it('calls onToggle on Space key', () => {
        const onToggle = vi.fn();
        render(<SectionHeader {...defaultProps} onToggle={onToggle} />);
        fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
        expect(onToggle).toHaveBeenCalledOnce();
    });

    it('shows count badge when count > 0 and not loading', () => {
        render(<SectionHeader {...defaultProps} count={5} />);
        expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('does not show badge when count is 0', () => {
        const { container } = render(<SectionHeader {...defaultProps} count={0} />);
        expect(container.querySelector('.section-badge')).not.toBeInTheDocument();
    });

    it('shows spinner when loading', () => {
        const { container } = render(<SectionHeader {...defaultProps} loading={true} />);
        expect(container.querySelector('.section-spinner')).toBeInTheDocument();
    });

    it('hides badge when loading even if count > 0', () => {
        const { container } = render(<SectionHeader {...defaultProps} loading={true} count={5} />);
        expect(container.querySelector('.section-badge')).not.toBeInTheDocument();
    });

    it('renders action buttons without triggering toggle', () => {
        const onToggle = vi.fn();
        render(
            <SectionHeader
                {...defaultProps}
                onToggle={onToggle}
                actions={<button data-testid="action-btn">Refresh</button>}
            />
        );
        fireEvent.click(screen.getByTestId('action-btn'));
        expect(onToggle).not.toHaveBeenCalled();
    });

    it('is keyboard focusable', () => {
        render(<SectionHeader {...defaultProps} />);
        expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0');
    });

    it('applies expanded class when expanded', () => {
        render(<SectionHeader {...defaultProps} expanded={true} />);
        expect(screen.getByRole('button')).toHaveClass('expanded');
    });

    it('forwards style prop to the container element', () => {
        render(<SectionHeader {...defaultProps} style={{ paddingTop: 4, height: 'auto' }} />);
        const header = screen.getByRole('button');
        expect(header).toHaveStyle({ paddingTop: '4px', height: 'auto' });
    });
});

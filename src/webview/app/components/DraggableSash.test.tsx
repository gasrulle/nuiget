import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoizedDraggableSash } from './DraggableSash';

describe('DraggableSash', () => {
    const defaultProps = {
        onDrag: vi.fn(),
        onReset: vi.fn(),
    };

    it('renders separator with correct role', () => {
        render(<MemoizedDraggableSash {...defaultProps} />);
        expect(screen.getByRole('separator')).toBeInTheDocument();
    });

    it('has accessible label', () => {
        render(<MemoizedDraggableSash {...defaultProps} />);
        expect(screen.getByLabelText('Drag to resize panels')).toBeInTheDocument();
    });

    it('defaults to horizontal orientation (vertical aria)', () => {
        render(<MemoizedDraggableSash {...defaultProps} />);
        expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical');
    });

    it('uses horizontal aria for vertical orientation', () => {
        render(<MemoizedDraggableSash {...defaultProps} orientation="vertical" />);
        expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal');
    });

    it('applies vertical class for vertical orientation', () => {
        render(<MemoizedDraggableSash {...defaultProps} orientation="vertical" />);
        expect(screen.getByRole('separator')).toHaveClass('sash-vertical');
    });

    it('calls onReset on double-click', () => {
        const onReset = vi.fn();
        render(<MemoizedDraggableSash {...defaultProps} onReset={onReset} />);
        fireEvent.doubleClick(screen.getByRole('separator'));
        expect(onReset).toHaveBeenCalledOnce();
    });

    it('applies dragging class during mousedown', () => {
        render(<MemoizedDraggableSash {...defaultProps} />);
        const sash = screen.getByRole('separator');
        fireEvent.mouseDown(sash);
        expect(sash).toHaveClass('dragging');
    });

    it('calls onDrag during drag with clamped position', () => {
        const onDrag = vi.fn();
        const { container } = render(
            <div style={{ width: '100px', height: '100px' }}>
                <MemoizedDraggableSash {...defaultProps} onDrag={onDrag} />
            </div>
        );

        const sash = container.querySelector('.sash')!;
        // Mock parent element bounding rect
        const parent = sash.parentElement!;
        vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue({
            left: 0, top: 0, width: 100, height: 100,
            right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({})
        });

        fireEvent.mouseDown(sash);
        fireEvent.mouseMove(document, { clientX: 50, clientY: 50 });
        expect(onDrag).toHaveBeenCalledWith(50);
    });

    it('clamps drag position to 20-80% range', () => {
        const onDrag = vi.fn();
        const { container } = render(
            <div style={{ width: '100px', height: '100px' }}>
                <MemoizedDraggableSash {...defaultProps} onDrag={onDrag} />
            </div>
        );

        const sash = container.querySelector('.sash')!;
        const parent = sash.parentElement!;
        vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue({
            left: 0, top: 0, width: 100, height: 100,
            right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({})
        });

        fireEvent.mouseDown(sash);
        fireEvent.mouseMove(document, { clientX: 5, clientY: 50 }); // 5% -> clamped to 20
        expect(onDrag).toHaveBeenCalledWith(20);

        onDrag.mockClear();
        fireEvent.mouseMove(document, { clientX: 95, clientY: 50 }); // 95% -> clamped to 80
        expect(onDrag).toHaveBeenCalledWith(80);
    });

    it('calls onDragEnd with final position on mouseup', () => {
        const onDragEnd = vi.fn();
        const { container } = render(
            <div style={{ width: '100px', height: '100px' }}>
                <MemoizedDraggableSash {...defaultProps} onDragEnd={onDragEnd} />
            </div>
        );

        const sash = container.querySelector('.sash')!;
        const parent = sash.parentElement!;
        vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue({
            left: 0, top: 0, width: 100, height: 100,
            right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({})
        });

        fireEvent.mouseDown(sash);
        fireEvent.mouseMove(document, { clientX: 60, clientY: 50 });
        fireEvent.mouseUp(document);
        expect(onDragEnd).toHaveBeenCalledWith(60);
    });

    it('removes dragging class after mouseup', () => {
        render(<MemoizedDraggableSash {...defaultProps} />);
        const sash = screen.getByRole('separator');
        fireEvent.mouseDown(sash);
        expect(sash).toHaveClass('dragging');
        fireEvent.mouseUp(document);
        expect(sash).not.toHaveClass('dragging');
    });

    it('has resize tooltip', () => {
        render(<MemoizedDraggableSash {...defaultProps} />);
        expect(screen.getByRole('separator')).toHaveAttribute('title', 'Drag to resize. Double-click to reset.');
    });
});

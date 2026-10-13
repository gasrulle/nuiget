import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sash, type SashProps } from './Sash';

/** A sash between two panes, with an owner that keeps the value, as a surface does. */
function Split({ initial = 50, ...props }: Partial<SashProps> & { initial?: number }) {
    const [value, setValue] = useState(initial);
    return (
        <div data-testid="split">
            <div id="first-pane">first</div>
            <Sash
                orientation="vertical"
                label="Resize the package list"
                controls="first-pane"
                {...props}
                value={value}
                onChange={next => {
                    setValue(next);
                    props.onChange?.(next);
                }}
            />
            <div>second</div>
        </div>
    );
}

const valueNow = (): number => Number(screen.getByRole('separator').getAttribute('aria-valuenow'));

describe('Sash', () => {
    const capture = vi.fn();
    const release = vi.fn();

    beforeEach(() => {
        // jsdom has pointer events but not pointer capture.
        Object.assign(Element.prototype, { setPointerCapture: capture, releasePointerCapture: release });
    });

    afterEach(() => {
        delete (Element.prototype as Partial<Element>).setPointerCapture;
        delete (Element.prototype as Partial<Element>).releasePointerCapture;
        vi.restoreAllMocks();
        capture.mockClear();
        release.mockClear();
    });

    it('is a focusable separator with value, min, max and orientation', () => {
        const { rerender } = render(<Split initial={35} />);
        const sash = screen.getByRole('separator', { name: 'Resize the package list' });
        expect(sash).toBe(screen.getByTestId('sash'));
        expect(sash).toHaveAttribute('tabindex', '0');
        expect(sash).toHaveAttribute('aria-orientation', 'vertical');
        expect(sash).toHaveAttribute('aria-valuenow', '35');
        expect(sash).toHaveAttribute('aria-valuemin', '20');
        expect(sash).toHaveAttribute('aria-valuemax', '80');
        expect(sash).toHaveAttribute('aria-controls', 'first-pane');
        expect(sash).toHaveClass('nuiget-sash', 'nuiget-sash--vertical');

        rerender(<Split orientation="horizontal" min={10} max={90} />);
        const horizontal = screen.getByRole('separator');
        expect(horizontal).toHaveAttribute('aria-orientation', 'horizontal');
        expect(horizontal).toHaveAttribute('aria-valuemin', '10');
        expect(horizontal).toHaveAttribute('aria-valuemax', '90');
        expect(horizontal).toHaveClass('nuiget-sash--horizontal');
    });

    it('arrows, Shift+arrows, Home, End and Enter change the value within the clamps', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const onChangeEnd = vi.fn();
        const { unmount } = render(<Split onChange={onChange} onChangeEnd={onChangeEnd} />);
        await user.tab();
        expect(screen.getByRole('separator')).toHaveFocus();
        await user.keyboard('{ArrowRight}');
        expect(valueNow()).toBe(51);
        await user.keyboard('{ArrowLeft}{ArrowLeft}');
        expect(valueNow()).toBe(49);
        // A key is a finished change: it is reported as the value to keep as well.
        expect(onChange.mock.calls).toEqual([[51], [50], [49]]);
        expect(onChangeEnd.mock.calls).toEqual([[51], [50], [49]]);
        await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
        expect(valueNow()).toBe(59);
        await user.keyboard('{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}');
        expect(valueNow()).toBe(39);
        // The arrows across the line belong to whatever is around the sash.
        await user.keyboard('{ArrowUp}{ArrowDown}');
        expect(valueNow()).toBe(39);
        await user.keyboard('{End}');
        expect(valueNow()).toBe(80);
        // Nothing beyond the limits, and no change reported for staying there.
        onChange.mockClear();
        await user.keyboard('{ArrowRight}{Shift>}{ArrowRight}{/Shift}');
        expect(valueNow()).toBe(80);
        expect(onChange).not.toHaveBeenCalled();
        await user.keyboard('{Home}');
        expect(valueNow()).toBe(20);
        await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
        expect(valueNow()).toBe(20);
        // Enter is the double-click of the keyboard: back to where the sash started.
        await user.keyboard('{Enter}');
        expect(valueNow()).toBe(50);
        // A key the sash acts on is taken (the page does not scroll with it); any other is left alone.
        expect(fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })).toBe(false);
        expect(fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowDown' })).toBe(true);
        expect(fireEvent.keyDown(screen.getByRole('separator'), { key: 'a' })).toBe(true);
        unmount();

        // A horizontal line moves up and down, in steps of its own.
        render(<Split orientation="horizontal" step={5} defaultValue={40} />);
        await user.tab();
        await user.keyboard('{ArrowDown}');
        expect(valueNow()).toBe(55);
        await user.keyboard('{ArrowUp}{ArrowUp}');
        expect(valueNow()).toBe(45);
        await user.keyboard('{ArrowLeft}{ArrowRight}');
        expect(valueNow()).toBe(45);
        await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
        expect(valueNow()).toBe(80);
        await user.keyboard('{Enter}');
        expect(valueNow()).toBe(40);
    });

    it('dragging reports clamped percentages and the end value', () => {
        const onChange = vi.fn();
        const onChangeEnd = vi.fn();
        render(<Split onChange={onChange} onChangeEnd={onChangeEnd} />);
        const sash = screen.getByRole('separator');
        // The panes share a container 400 px wide that starts 100 px from the left edge.
        vi.spyOn(screen.getByTestId('split'), 'getBoundingClientRect').mockReturnValue({ left: 100, top: 0, width: 400, height: 200 } as DOMRect);

        // The pointer is over the sash but not down: nothing moves.
        fireEvent.pointerMove(sash, { pointerId: 7, clientX: 200 });
        expect(onChange).not.toHaveBeenCalled();

        fireEvent.pointerDown(sash, { pointerId: 7, clientX: 300 });
        // Captured: the sash keeps getting the pointer when it leaves the thin line.
        expect(capture).toHaveBeenCalledExactlyOnceWith(7);
        fireEvent.pointerMove(sash, { pointerId: 7, clientX: 260 });
        expect(valueNow()).toBe(40);
        fireEvent.pointerMove(sash, { pointerId: 7, clientX: 261 });
        // Left of the smallest and right of the largest share.
        fireEvent.pointerMove(sash, { pointerId: 7, clientX: 110 });
        expect(valueNow()).toBe(20);
        fireEvent.pointerMove(sash, { pointerId: 7, clientX: 900 });
        expect(valueNow()).toBe(80);
        fireEvent.pointerMove(sash, { pointerId: 7, clientX: 340 });
        // One report per new value; the end of the drag is reported once, with the last of them.
        expect(onChange.mock.calls).toEqual([[40], [20], [80], [60]]);
        expect(onChangeEnd).not.toHaveBeenCalled();
        fireEvent.pointerUp(sash, { pointerId: 7, clientX: 340 });
        expect(onChangeEnd.mock.calls).toEqual([[60]]);
        expect(release).toHaveBeenCalledExactlyOnceWith(7);

        // The drag is over.
        fireEvent.pointerMove(sash, { pointerId: 7, clientX: 200 });
        fireEvent.pointerUp(sash, { pointerId: 7 });
        expect(onChange).toHaveBeenCalledTimes(4);
        expect(onChangeEnd).toHaveBeenCalledTimes(1);

        // A drag the system takes away ends like any other.
        fireEvent.pointerDown(sash, { pointerId: 8, clientX: 340 });
        fireEvent.pointerMove(sash, { pointerId: 8, clientX: 300 });
        fireEvent.pointerCancel(sash, { pointerId: 8 });
        expect(onChangeEnd.mock.calls).toEqual([[60], [50]]);

        // A double-click puts the sash back.
        fireEvent.pointerDown(sash, { pointerId: 9, clientX: 300 });
        fireEvent.pointerMove(sash, { pointerId: 9, clientX: 420 });
        fireEvent.pointerUp(sash, { pointerId: 9 });
        expect(valueNow()).toBe(80);
        fireEvent.doubleClick(sash);
        expect(valueNow()).toBe(50);
        expect(onChangeEnd.mock.calls.at(-1)).toEqual([50]);
    });

    it('a horizontal sash is dragged up and down, in whole steps', () => {
        const onChange = vi.fn();
        render(<Split orientation="horizontal" step={5} onChange={onChange} />);
        const sash = screen.getByRole('separator');
        vi.spyOn(screen.getByTestId('split'), 'getBoundingClientRect').mockReturnValue({ left: 0, top: 50, width: 300, height: 200 } as DOMRect);
        fireEvent.pointerDown(sash, { pointerId: 1, clientX: 10, clientY: 150 });
        fireEvent.pointerMove(sash, { pointerId: 1, clientX: 290, clientY: 110 });
        expect(valueNow()).toBe(30);
        // 43 percent of the height: the nearest step is 45, and 44 percent is the same step.
        fireEvent.pointerMove(sash, { pointerId: 1, clientX: 290, clientY: 136 });
        fireEvent.pointerMove(sash, { pointerId: 1, clientX: 290, clientY: 138 });
        expect(onChange.mock.calls).toEqual([[30], [45]]);
    });

    it('renders no inline style', () => {
        const { container } = render(<Split />);
        const sash = screen.getByRole('separator');
        vi.spyOn(screen.getByTestId('split'), 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 200 } as DOMRect);
        fireEvent.pointerDown(sash, { pointerId: 1, clientX: 200 });
        fireEvent.pointerMove(sash, { pointerId: 1, clientX: 120 });
        // Not on the sash, not on the panes, and not on the body, where 1.x put the cursor of a drag.
        expect(container.querySelectorAll('[style]')).toHaveLength(0);
        expect(document.body.getAttribute('style')).toBeNull();
        fireEvent.pointerUp(sash, { pointerId: 1 });
        expect(document.body.getAttribute('style')).toBeNull();
    });

    it('has no axe violations', async () => {
        const { container } = render(<Split />);
        expect(await axe(container)).toHaveNoViolations();
    });
});

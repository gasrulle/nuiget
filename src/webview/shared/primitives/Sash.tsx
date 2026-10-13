import React, { useRef } from 'react';
import './primitives.css';

export interface SashProps {
    /** The share of the first pane (left or top) in percent. */
    value: number;
    min?: number;
    max?: number;
    /** Where Enter and a double-click put the sash back. */
    defaultValue?: number;
    /** One arrow key moves this far; with Shift ten times as far. */
    step?: number;
    /** The direction of the line: `vertical` stands between a left and a right pane, `horizontal` between an upper and a lower one. */
    orientation: 'horizontal' | 'vertical';
    /** What the sash resizes, for example "Resize the package list". */
    label: string;
    /** The id of the pane whose size the value is. */
    controls?: string;
    /** Every change, also each step of a drag. */
    onChange: (value: number) => void;
    /** The value to keep: after a key, a double-click or the end of a drag. */
    onChangeEnd?: (value: number) => void;
}

/**
 * The line between two panes that is dragged, or moved with the arrow keys, to resize them. It reports
 * percentages and renders no style: the owner puts the value on its layout container as a custom property.
 * A drag uses pointer capture, so it needs no listener on the document and no cursor set on the body.
 */
export function Sash({ value, min = 20, max = 80, defaultValue = 50, step = 1, orientation, label, controls, onChange, onChangeEnd }: SashProps): React.JSX.Element {
    // The last value a drag reported, or `null` when no drag is in progress.
    const dragged = useRef<number | null>(null);
    const clamp = (next: number): number => Math.min(max, Math.max(min, next));

    const commit = (next: number): void => {
        const clamped = clamp(next);
        if (clamped !== value) {
            onChange(clamped);
        }
        onChangeEnd?.(clamped);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        const [back, forward] = orientation === 'vertical' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
        const distance = event.shiftKey ? step * 10 : step;
        if (event.key === back) {
            commit(value - distance);
        } else if (event.key === forward) {
            commit(value + distance);
        } else if (event.key === 'Home') {
            commit(min);
        } else if (event.key === 'End') {
            commit(max);
        } else if (event.key === 'Enter') {
            commit(defaultValue);
        } else {
            return;
        }
        event.preventDefault();
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
        const container = event.currentTarget.parentElement;
        if (dragged.current === null || !container) {
            return;
        }
        const box = container.getBoundingClientRect();
        const [position, extent] = orientation === 'vertical' ? [event.clientX - box.left, box.width] : [event.clientY - box.top, box.height];
        if (extent <= 0) {
            return;
        }
        const next = clamp(Math.round((position / extent) * 100 / step) * step);
        if (next !== dragged.current) {
            dragged.current = next;
            onChange(next);
        }
    };

    const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
        if (dragged.current === null) {
            return;
        }
        const last = dragged.current;
        dragged.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        onChangeEnd?.(last);
    };

    return (
        <div
            className={`nuiget-sash nuiget-sash--${orientation}`}
            role="separator"
            tabIndex={0}
            aria-orientation={orientation}
            aria-valuenow={value}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-label={label}
            aria-controls={controls}
            data-testid="sash"
            onKeyDown={handleKeyDown}
            onDoubleClick={() => commit(defaultValue)}
            onPointerDown={event => {
                dragged.current = value;
                event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
        />
    );
}

import type React from 'react';
import './primitives.css';

export interface IconButtonProps {
    /** The accessible name, also shown as the tooltip. An icon alone says nothing to a screen reader. */
    label: string;
    /** The icon. It is decoration here: the button carries the name. */
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    /** For a button beside a field that keeps the focus: `preventDefault` here leaves it in the field. */
    onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
    /** For a toggle: whether it is on. */
    pressed?: boolean;
    disabled?: boolean;
    /** `-1` for a button that is reachable by pointer only (the actions of a row). */
    tabIndex?: number;
    'data-testid'?: string;
}

/** A button that shows an icon and is named by `label`. Its target is at least 24 px in both directions. */
export function IconButton({ label, children, onClick, onMouseDown, pressed, disabled, tabIndex, 'data-testid': testId }: IconButtonProps): React.JSX.Element {
    return (
        <button
            type="button"
            className="nuiget-icon-button"
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            disabled={disabled}
            tabIndex={tabIndex}
            data-testid={testId}
            onClick={onClick}
            onMouseDown={onMouseDown}
        >
            <span className="nuiget-icon-button-icon" aria-hidden="true">{children}</span>
        </button>
    );
}

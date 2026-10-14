import React, { useRef } from 'react';
import { cssVars } from './cssVars';
import { CheckIcon } from './icons';
import { Spinner } from './Spinner';
import './primitives.css';

/** What a `Listbox` knows about the place of a row and hands to `renderRow`; spread it into the `Row`. */
export interface RowPlacement {
    /** Zero-based position among all items of the list, rendered or not. */
    index: number;
    /** The number of items of the list. */
    setSize: number;
    /** The row that holds the list's tab stop (roving `tabIndex`). */
    active: boolean;
    selected: boolean;
    /** In a multi-selectable list: the row whose details are shown (`aria-current`); `selected` is then the bulk set. */
    current?: boolean;
    /** In a multi-selectable list: the option begins with a decorative check mark that shows `selected`. */
    checkable?: boolean;
    /** The id of the option element; its title and description ids derive from it. */
    optionId: string;
    /** Offset of the row from the top of the list, in pixels. */
    offset: number;
    /** Lets the list measure the rendered row. */
    measureRef?: (element: HTMLElement | null) => void;
}

export interface RowProps extends RowPlacement {
    /** The package id. Lower-cased it is the row's test id, `package-row-<id>`. */
    itemId: string;
    name: string;
    version?: React.ReactNode;
    description?: string;
    /** Shown in comfortable rows only. Decoration: the name is the text. */
    icon?: React.ReactNode;
    /** `Badge`s. They are part of the row's description. */
    badges?: React.ReactNode;
    /** What is special about the row right now, in a word or two: "Updating", "Unresolved". */
    status?: string;
    /** An operation on this package is pending: a spinner takes the place of the actions. */
    busy?: boolean;
    /** The row can be focused and selected, but its actions do not apply (an unresolved package). */
    disabled?: boolean;
    /** `IconButton`s with `tabIndex={-1}` and `data-testid="row-action-<name>"`. Pointer only: the list has a key for each. */
    actions?: React.ReactNode;
    density: 'compact' | 'comfortable';
}

/**
 * One row of a `Listbox`. The wrapper is presentational and carries nothing but classes, data attributes and
 * the measuring ref. The option is the one focusable element and contains only text. The action buttons sit
 * beside it, hidden from assistive technology and out of the tab order: a button inside an option is nested
 * interactive content, which a screen reader cannot reach.
 */
export function Row(props: RowProps): React.JSX.Element {
    const { itemId, name, version, description, icon, badges, status, busy, disabled, actions, density, index, setSize, active, selected, current, checkable, optionId, offset, measureRef } = props;
    const optionRef = useRef<HTMLDivElement>(null);
    const titleId = `${optionId}-title`;
    const descriptionId = `${optionId}-desc`;
    const described = Boolean(badges) || Boolean(description) || Boolean(status);
    const className = `nuiget-row nuiget-row--${density}${busy ? ' nuiget-row--busy' : ''}`;

    // A click on a button would move focus to it, and so into a subtree that assistive technology cannot see.
    const keepFocusOnOption = (event: React.MouseEvent): void => {
        event.preventDefault();
        optionRef.current?.focus();
    };

    return (
        <div
            className={className}
            role="presentation"
            data-index={index}
            data-testid={`package-row-${itemId.toLowerCase()}`}
            ref={measureRef}
            style={cssVars({ '--nuiget-virtual-offset': `${offset}px` })}
        >
            <div
                className="nuiget-row-option"
                role="option"
                id={optionId}
                ref={optionRef}
                tabIndex={active ? 0 : -1}
                aria-selected={selected}
                aria-current={current ? true : undefined}
                aria-posinset={index + 1}
                aria-setsize={setSize}
                aria-busy={busy ? true : undefined}
                aria-disabled={disabled ? true : undefined}
                aria-labelledby={titleId}
                aria-describedby={described ? descriptionId : undefined}
            >
                {/* Decoration: the state is `aria-selected`; a click on it is handled by the list, nothing here takes focus. */}
                {checkable ? <span className="nuiget-row-check" aria-hidden="true">{selected ? <CheckIcon size={12} /> : null}</span> : null}
                {density === 'comfortable' && icon ? <span className="nuiget-row-icon" aria-hidden="true">{icon}</span> : null}
                <span className="nuiget-row-title" id={titleId}>
                    <span className="nuiget-row-name">{name}</span>
                    {version === undefined ? null : <>{' '}<span className="nuiget-row-version">{version}</span></>}
                </span>
                {described ? (
                    <span className="nuiget-row-desc" id={descriptionId}>
                        {badges}
                        {description ? <>{' '}<span className="nuiget-row-description">{description}</span></> : null}
                        {status ? <>{' '}<span className="nuiget-row-status">{status}</span></> : null}
                    </span>
                ) : null}
            </div>
            {disabled ? null : (
                <div className="nuiget-row-actions" aria-hidden="true" onMouseDown={keepFocusOnOption}>
                    {busy ? <Spinner /> : actions}
                </div>
            )}
        </div>
    );
}

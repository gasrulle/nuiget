import React, { useRef } from 'react';
import { cssVars } from './cssVars';
import { CheckIcon, VerifiedIcon } from './icons';
import { Spinner } from './Spinner';
import './primitives.css';

/** What a `Listbox` knows about the place of a row and hands to `renderRow`; spread it into the `Row`. */
export interface RowPlacement {
    /** Zero-based position among all items of the list, rendered or not. */
    index: number;
    /** The rows of the row's set: the list, or in a tree its parent's children. */
    setSize: number;
    /** In a tree, the row's depth; absent in a listbox. */
    level?: number;
    /** In a tree, the row's position among its siblings. */
    posInSet?: number;
    /** The row that holds the list's tab stop (roving `tabIndex`). */
    active: boolean;
    selected: boolean;
    /** In a multi-selectable list: the row whose details are shown (`aria-current`); `selected` is then the bulk set. */
    current?: boolean;
    /** In a multi-selectable list: the option begins with a decorative check mark that shows `selected`. */
    checkable?: boolean;
    /** The row can be focused and selected, but its actions do not apply (an unresolved package). */
    disabled?: boolean;
    /** In a multi-selectable list, the check mark's own click; the list decides whether a disabled row toggles. */
    onToggle?: () => void;
    /** The id of the option element; its title and description ids derive from it. */
    optionId: string;
    /** Offset of the row from the top of the list, in pixels. */
    offset: number;
    /** Lets the list measure the rendered row. */
    measureRef?: (element: HTMLElement | null) => void;
    /** The list's density: it belongs to the surface, never to a call site (DS-DENSITY-1). */
    density: 'compact' | 'comfortable';
}

export interface RowProps extends RowPlacement {
    /** The package id. Lower-cased it is the row's test id, `package-row-<id>`. */
    itemId: string;
    name: string;
    version?: string;
    /** An update's target: the version cell reads `version → nextVersion`, the new version marked. */
    nextVersion?: string;
    /** The tooltip of the version cell (for example why a version is unresolved). */
    versionTitle?: string;
    /** A fact shown after the version in comfortable rows (Browse: downloads), read out in compact ones; part of the description. */
    meta?: string;
    /** Shown after the version in comfortable rows, read out in compact ones. */
    authors?: string;
    /** The package id prefix is reserved by its owner: a check mark before the authors. */
    verified?: boolean;
    /** The middle line of a comfortable row, for Browse rows only (D14); read out, not shown, in compact rows. */
    description?: string;
    /** Shown in comfortable rows only, in a column that is there with or without it. Decoration: the name is the text. */
    icon?: React.ReactNode;
    /** `Badge`s. They are part of the row's description. */
    badges?: React.ReactNode;
    /** What is special about the row right now, in a word or two: "Updating", "Unresolved". */
    status?: string;
    /** An operation on this package is pending: a spinner takes the place of the actions. */
    busy?: boolean;
    /**
     * In a multi-selectable list: `false` means the row cannot join a bulk action; its check mark is drawn muted and
     * empty. The list still calls `onToggleSelected`, and the feature says why.
     */
    selectable?: boolean;
    /** `IconButton`s with `tabIndex={-1}` and `data-testid="row-action-<name>"`. Pointer only: the list has a key for each. */
    actions?: React.ReactNode;
}

/**
 * One row of a `Listbox`. The wrapper is presentational and carries nothing but classes, data attributes and
 * the measuring ref. The option is the one focusable element and contains only text. The action buttons sit
 * beside it, hidden from assistive technology and out of the tab order: a button inside an option is nested
 * interactive content, which a screen reader cannot reach.
 *
 * A comfortable row is the Extensions row (D46): 72 px, an icon column, then two lines: name and badges, then version
 * and status with the authors and the Verified mark; a row with a description (Browse) has it as a line between the two.
 * A compact row shows the same spans on one line, name first. The option is the band; a comfortable row's actions lie
 * over its end. The name is the name and the version; the badges, authors, description and status describe the option. The tooltip `id version`
 * sits on the text column: on the option a `title` would become its description.
 */
export function Row(props: RowProps): React.JSX.Element {
    const { itemId, name, version, nextVersion, versionTitle, meta, authors, verified, description, icon, badges, status, busy, disabled, selectable, actions, density, index, setSize, active, selected, current, checkable, optionId, offset, measureRef, onToggle, level, posInSet } = props;
    const optionRef = useRef<HTMLDivElement>(null);
    const ids = {
        name: `${optionId}-name`,
        version: `${optionId}-version`,
        badges: `${optionId}-badges`,
        meta: `${optionId}-meta`,
        authors: `${optionId}-authors`,
        description: `${optionId}-description`,
        status: `${optionId}-status`,
    };
    const hasAuthors = Boolean(authors) || Boolean(verified);
    const labelledBy = version === undefined ? ids.name : `${ids.name} ${ids.version}`;
    const describedBy = [badges ? ids.badges : '', meta ? ids.meta : '', hasAuthors ? ids.authors : '', description ? ids.description : '', status ? ids.status : '']
        .filter(Boolean)
        .join(' ');
    const tooltip = [name, version, nextVersion === undefined ? undefined : `→ ${nextVersion}`].filter(Boolean).join(' ');
    const className = `nuiget-row nuiget-row--${density}${busy ? ' nuiget-row--busy' : ''}`;
    // A part after another on its line starts with the separator, as generated content: the description text stays as it was.
    const separated = (present: boolean, before: boolean): string => (present && before ? ' nuiget-row-sep' : '');
    const metaSep = separated(Boolean(meta), version !== undefined);
    const authorsSep = separated(hasAuthors, version !== undefined || Boolean(meta));
    const statusSep = separated(Boolean(status), version !== undefined || Boolean(meta) || hasAuthors);
    const factsLine = (authorsSpan: React.ReactNode): React.ReactNode => (
        <span className="nuiget-row-line">
            {version === undefined ? null : (
                <span className="nuiget-row-version" id={ids.version} title={versionTitle}>
                    {version}
                    {/* The arrow stays text: the name reads "3.0.0 → 3.1.0". A text node of the version, never an element of its own: axe cannot measure a symbol-only element (theme.ui.test.ts). */}
                    {nextVersion === undefined ? null : <>{' → '}<span className="nuiget-row-version-new">{nextVersion}</span></>}
                </span>
            )}
            {meta ? <span className={`nuiget-row-meta${metaSep}`} id={ids.meta}>{meta}</span> : null}
            {authorsSpan}
            {status ? <span className={`nuiget-row-status${statusSep}`} id={ids.status}>{status}</span> : null}
        </span>
    );
    const authorsSpan = hasAuthors ? (
        <span className={`nuiget-row-authors${authorsSep}`} id={ids.authors}>
            {/* A space, not a margin: the icon's title and the authors are two words when read out. */}
            {verified ? <><VerifiedIcon size={12} className="nuiget-verified" title="Verified: the package id prefix is reserved by its owner" />{' '}</> : null}
            {authors}
        </span>
    ) : null;

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
            data-level={level}
            style={cssVars({ '--nuiget-virtual-offset': `${offset}px` })}
        >
            <div
                className={`nuiget-row-option nuiget-row-option--${density}`}
                role={level === undefined ? 'option' : 'treeitem'}
                id={optionId}
                ref={optionRef}
                tabIndex={active ? 0 : -1}
                aria-selected={selected}
                aria-current={current ? true : undefined}
                aria-level={level}
                aria-posinset={posInSet ?? index + 1}
                aria-setsize={setSize}
                aria-busy={busy ? true : undefined}
                aria-disabled={disabled ? true : undefined}
                aria-labelledby={labelledBy}
                aria-describedby={describedBy === '' ? undefined : describedBy}
            >
                {/* Decoration: the state is `aria-selected`; a click on it calls the list's `onToggle`, nothing here takes focus. */}
                {checkable ? <span className={`nuiget-row-check${selectable === false ? ' nuiget-row-check--off' : ''}`} aria-hidden="true" onClick={event => { event.stopPropagation(); onToggle?.(); }}>{selected && selectable !== false ? <CheckIcon size={16} /> : null}</span> : null}
                {density === 'comfortable' ? <span className="nuiget-row-icon" aria-hidden="true">{icon}</span> : null}
                <span className="nuiget-row-body" title={tooltip}>
                    <span className="nuiget-row-line">
                        <span className="nuiget-row-name" id={ids.name}>{name}</span>
                        {badges ? <span className="nuiget-row-badges" id={ids.badges}>{badges}</span> : null}
                    </span>
                    {description ? <span className="nuiget-row-description" id={ids.description}>{description}</span> : null}
                    {factsLine(authorsSpan)}
                </span>
            </div>
            {disabled ? null : (
                <div className="nuiget-row-actions" aria-hidden="true" onMouseDown={keepFocusOnOption}>
                    {busy ? <Spinner /> : actions}
                </div>
            )}
        </div>
    );
}

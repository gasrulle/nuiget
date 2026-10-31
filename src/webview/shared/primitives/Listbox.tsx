import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cssVars } from './cssVars';
import type { RowPlacement } from './Row';
import './primitives.css';

/** Row heights in pixels. They repeat `--nuiget-row-height-*`: a script cannot read a token before layout (CA-R4, `webview-tokens.test.ts`). */
const ROW_HEIGHT = { compact: 24, comfortable: 72 } as const;

/** Where a group row of the list goes; `groups.render` draws what is inside it. */
export interface GroupPlacement {
    /** Zero-based position among all items of the list, rendered or not. */
    index: number;
    /** The row that holds the list's active position. */
    active: boolean;
    /** Offset of the row from the top of the list, in pixels. */
    offset: number;
    /** Measures the row; the list has placed it on the row's wrapper already. */
    measureRef?: (element: HTMLElement | null) => void;
    /** The group's depth, 1 at the top. */
    level: number;
    expanded: boolean;
}

/** What makes a list a tree (ADR-013 Decision 8, UX-P2.1c): sections and projects as group rows of one list. */
export interface ListboxGroups<T> {
    is: (item: T) => boolean;
    /** 1 when absent; a group of level n nests under the nearest preceding group of level n−1. */
    level?: (item: T) => number;
    /** The consumer's state: the children of an expanded group follow it in `items`. */
    isExpanded: (item: T) => boolean;
    /** Enter, ArrowRight on a collapsed group, ArrowLeft on an expanded one, and a click. */
    onToggle: (item: T, expanded: boolean) => void;
    /** Text and decoration only: the list owns the treeitem, its name and its states. */
    render: (item: T, placement: GroupPlacement) => React.ReactNode;
}

/** A row's place in the tree: its depth, its parent and first child (indexes, or −1) and its position among its siblings. */
interface TreePlace {
    level: number;
    parent: number;
    firstChild: number;
    posInSet: number;
    setSize: number;
}

function treeOf<T>(items: readonly T[], groups: ListboxGroups<T>): TreePlace[] {
    const places: TreePlace[] = [];
    const open: number[] = [];
    const siblings = new Map<number, number[]>();
    items.forEach((item, index) => {
        const isGroup = groups.is(item);
        const wanted = isGroup ? groups.level?.(item) ?? 1 : Number.POSITIVE_INFINITY;
        while (open.length > 0 && places[open[open.length - 1]].level >= wanted) {
            open.pop();
        }
        const parent = open[open.length - 1] ?? -1;
        const level = isGroup ? wanted : (parent < 0 ? 1 : places[parent].level + 1);
        const set = siblings.get(parent) ?? [];
        set.push(index);
        siblings.set(parent, set);
        places.push({ level, parent, firstChild: -1, posInSet: set.length, setSize: 0 });
        if (parent >= 0 && places[parent].firstChild < 0) {
            places[parent].firstChild = index;
        }
        if (isGroup) {
            open.push(index);
        }
    });
    for (const set of siblings.values()) {
        for (const index of set) {
            places[index].setSize = set.length;
        }
    }
    return places;
}

/** The rows kept in the document above and below the view. */
const OVERSCAN = 5;

interface ListboxBaseProps<T extends { id: string }> {
    items: readonly T[];
    /** Returns a `Row` with `placement` spread into it. */
    renderRow: (item: T, placement: RowPlacement) => React.ReactNode;
    /** Given, the list is a `role="tree"` whose rows are treeitems; absent, a `role="listbox"` of options. A property of the consumer, never of the data. Memoize the object: the tree is computed again when it changes. */
    groups?: ListboxGroups<T>;
    /** The row can be focused and selected but its actions do not apply: the keys and the check mark read it here, the row draws it. */
    isDisabled?: (item: T) => boolean;
    /** One sentence that names the keys of this list, for example "Enter uninstalls. Shift+F10 opens the actions menu." It is read as the list's description. */
    hint: string;
    testId: string;
    density: 'compact' | 'comfortable';
    selectedId?: string | null;
    /**
     * Multi-selection for bulk actions. When given, the list is `aria-multiselectable="true"`, the rows in the set
     * are `aria-selected`, and `selectedId` marks the current row, the one whose details are shown, as
     * `aria-current="true"`.
     */
    selectedIds?: ReadonlySet<string>;
    /**
     * Space on the active row, Ctrl+click (Cmd+click on macOS) on a row, or a click on its check mark: the row's
     * membership in `selectedIds` is to be flipped. Not called for a disabled row.
     */
    onToggleSelected?: (item: T) => void;
    /** A click on a row. */
    onSelect?: (item: T) => void;
    /** Enter. */
    onActivate?: (item: T) => void;
    /** Ctrl+Enter, or Cmd+Enter on macOS. */
    onSecondaryActivate?: (item: T) => void;
    /** Delete, or Cmd+Backspace on macOS. */
    onDelete?: (item: T) => void;
    /** Shift+F10, the ContextMenu key (anchored below the row) or a right-click (anchored at the pointer). */
    onContextMenu?: (item: T, anchor: { x: number; y: number }) => void;
    /** The list is being revalidated: its rows stay and it is `aria-busy`. */
    busy?: boolean;
    /** What takes the place of the list when it has no items, usually an `EmptyState`. */
    empty?: React.ReactNode;
}

/** A list is named by its own label or by an element on the page, such as the title of its section. */
export type ListboxProps<T extends { id: string }> = ListboxBaseProps<T> & ({ label: string; labelledBy?: undefined } | { labelledBy: string; label?: undefined });

/**
 * A virtualized list with one tab stop: a `role="listbox"`, or with `groups` a `role="tree"` (UX-P2.1c). Arrow keys, Home and End move the
 * active row; the keys that act on a row are reported to the owner, so that everything a pointer can do with
 * the action buttons of a row is also on the keyboard. Only the rows in view are in the document, and the
 * active row always is, so focus never falls out of the list.
 */
export function Listbox<T extends { id: string }>(props: ListboxProps<T>): React.JSX.Element {
    const { items, renderRow, groups, isDisabled, hint, testId, density, selectedId = null, selectedIds, onToggleSelected, onSelect, onActivate, onSecondaryActivate, onDelete, onContextMenu, busy, empty } = props;
    const rowHeight = ROW_HEIGHT[density];
    const tree = useMemo(() => (groups === undefined ? undefined : treeOf(items, groups)), [items, groups]);
    const baseId = useId();
    const hintId = `${baseId}-hint`;
    const rootRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const emptyRef = useRef<HTMLDivElement>(null);

    // The active row is remembered by id, so that it stays with its item when the list is reordered. When the
    // item is gone, the row now at its index takes over (or the last one).
    const [activeId, setActiveId] = useState<string | null>(() => selectedId ?? items[0]?.id ?? null);
    const lastActiveIndex = useRef(0);
    let activeIndex = items.findIndex(item => item.id === activeId);
    if (activeIndex < 0 && items.length > 0) {
        activeIndex = Math.min(lastActiveIndex.current, items.length - 1);
    }
    useEffect(() => {
        lastActiveIndex.current = Math.max(activeIndex, 0);
        const id = items[activeIndex]?.id ?? null;
        if (id !== activeId) {
            setActiveId(id);
        }
    }, [activeIndex, activeId, items]);

    const rangeExtractor = useCallback((range: Range): number[] => {
        const indexes = new Set(defaultRangeExtractor(range));
        if (activeIndex >= 0 && activeIndex < range.count) {
            indexes.add(activeIndex);
        }
        return [...indexes].sort((a, b) => a - b);
    }, [activeIndex]);

    const isGroupAt = (index: number): boolean => items[index] !== undefined && groups?.is(items[index]) === true;

    const virtualizer = useVirtualizer<HTMLDivElement, HTMLElement>({
        count: items.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: index => (isGroupAt(index) ? ROW_HEIGHT.compact : rowHeight),
        overscan: OVERSCAN,
        getItemKey: index => items[index].id,
        measureElement: element => element.getBoundingClientRect().height || rowHeight,
        rangeExtractor,
    });

    // Whether focus was inside the list when this render began, that is before the document changed. Only then
    // does the list take focus back after a change: it never pulls focus in from elsewhere.
    const hadFocus = rootRef.current?.contains(document.activeElement) ?? false;
    // All the list reads of a row's markup: its `[data-index]` wrapper and the focusable element inside it. Every row fact crosses as `RowPlacement`.
    const wrapperAt = (index: number): HTMLElement | null => scrollRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`) ?? null;
    const rowFocusAt = (index: number): HTMLElement | null => wrapperAt(index)?.querySelector<HTMLElement>('[tabindex]') ?? null;


    useLayoutEffect(() => {
        if (!hadFocus) {
            return;
        }
        if (items.length === 0) {
            emptyRef.current?.focus();
            return;
        }
        const target = rowFocusAt(activeIndex);
        if (target && document.activeElement !== target) {
            target.focus({ preventScroll: true });
        }
        // `hadFocus` belongs to the render that changed the active row or the items, which is the one that matters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex, items]);

    const indexOf = (target: EventTarget): number => {
        const row = (target as HTMLElement).closest<HTMLElement>('[data-index]');
        return row ? Number(row.dataset.index) : -1;
    };

    const moveTo = (index: number): void => {
        setActiveId(items[index].id);
        virtualizer.scrollToIndex(index, { align: 'auto' });
        // A list as high as its rows inside an outer scroller cannot scroll itself, and the focus does not scroll
        // (N88): the option asks its scrollers. Optional: jsdom has no `scrollIntoView`.
        rowFocusAt(index)?.scrollIntoView?.({ block: 'nearest' });
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        const item = items[activeIndex];
        if (!item) {
            return;
        }
        const command = event.ctrlKey || event.metaKey;
        const disabled = isDisabled?.(item) === true;
        const handled = (): void => event.preventDefault();
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            handled();
            const next = activeIndex + (event.key === 'ArrowDown' ? 1 : -1);
            if (next >= 0 && next < items.length) {
                moveTo(next);
            }
        } else if (event.key === 'Home' || event.key === 'End') {
            handled();
            moveTo(event.key === 'Home' ? 0 : items.length - 1);
        } else if (tree && groups && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
            // Handled on every row, so the scroller does not pan (ADR-013 Decision 8).
            handled();
            const place = tree[activeIndex];
            const expanded = isGroupAt(activeIndex) && groups.isExpanded(item);
            if (event.key === 'ArrowRight' && isGroupAt(activeIndex)) {
                if (!expanded) {
                    groups.onToggle(item, true);
                } else if (place.firstChild >= 0) {
                    moveTo(place.firstChild);
                }
            } else if (event.key === 'ArrowLeft') {
                if (expanded) {
                    groups.onToggle(item, false);
                } else if (place.parent >= 0) {
                    moveTo(place.parent);
                }
            }
        } else if (groups && isGroupAt(activeIndex)) {
            // The keys below act on package rows; Enter is a group row's own. Space reports nothing, and does not page the scroller.
            if (event.key === 'Enter' && !command) {
                handled();
                groups.onToggle(item, !groups.isExpanded(item));
            } else if (event.key === ' ') {
                handled();
            }
        } else if (event.key === 'Enter') {
            handled();
            if (!disabled) {
                (command ? onSecondaryActivate : onActivate)?.(item);
            }
        } else if (event.key === 'Delete' || (event.key === 'Backspace' && event.metaKey)) {
            handled();
            if (!disabled) {
                onDelete?.(item);
            }
        } else if (event.key === ' ' && selectedIds !== undefined) {
            // Without a selection set Space is not handled here and bubbles (P3.2 ruling).
            handled();
            if (!disabled) {
                onToggleSelected?.(item);
            }
        } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
            handled();
            const rect = rowFocusAt(activeIndex)?.getBoundingClientRect();
            onContextMenu?.(item, { x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
        }
    };

    if (items.length === 0) {
        return (
            <div className="nuiget-listbox-root" ref={rootRef}>
                <div className="nuiget-listbox-empty" tabIndex={-1} ref={emptyRef}>{empty}</div>
            </div>
        );
    }

    return (
        <div className="nuiget-listbox-root" ref={rootRef}>
            <div
                className="nuiget-listbox"
                role={groups === undefined ? 'listbox' : 'tree'}
                ref={scrollRef}
                aria-label={props.label}
                aria-labelledby={props.labelledBy}
                aria-describedby={hintId}
                aria-busy={busy ? true : undefined}
                aria-multiselectable={selectedIds === undefined ? undefined : true}
                data-testid={testId}
                onKeyDown={handleKeyDown}
                onFocus={event => {
                    const index = indexOf(event.target);
                    if (index >= 0 && items[index]) {
                        setActiveId(items[index].id);
                    }
                }}
                onClick={event => {
                    const index = indexOf(event.target);
                    // A click on an action stays with the action: the row's focusable element is what a click on the row lands in.
                    if (index < 0 || !items[index] || !rowFocusAt(index)?.contains(event.target as Node)) {
                        return;
                    }
                    if (groups && isGroupAt(index)) {
                        groups.onToggle(items[index], !groups.isExpanded(items[index]));
                        return;
                    }
                    if (selectedIds !== undefined && (event.ctrlKey || event.metaKey)) {
                        if (isDisabled?.(items[index]) !== true) {
                            onToggleSelected?.(items[index]);
                        }
                    } else {
                        onSelect?.(items[index]);
                    }
                }}
                onContextMenu={event => {
                    const index = indexOf(event.target);
                    if (index >= 0 && items[index] && !isGroupAt(index)) {
                        event.preventDefault();
                        onContextMenu?.(items[index], { x: event.clientX, y: event.clientY });
                    }
                }}
            >
                <div className="nuiget-listbox-sizer" style={cssVars({ '--nuiget-virtual-total': `${virtualizer.getTotalSize()}px` })}>
                    {virtualizer.getVirtualItems().map(virtual => {
                        const item = items[virtual.index];
                        const disabled = isDisabled?.(item) === true;
                        const place = tree?.[virtual.index];
                        const active = virtual.index === activeIndex;
                        if (groups && place && isGroupAt(virtual.index)) {
                            const expanded = groups.isExpanded(item);
                            return (
                                <div
                                    key={item.id}
                                    className={`nuiget-row nuiget-row--${density}`}
                                    role="presentation"
                                    data-index={virtual.index}
                                    data-row-kind="group"
                                    data-level={place.level}
                                    data-testid={`group-row-${item.id.toLowerCase()}`}
                                    ref={virtualizer.measureElement}
                                    style={cssVars({ '--nuiget-virtual-offset': `${virtual.start}px` })}
                                >
                                    <div
                                        className="nuiget-row-group"
                                        role="treeitem"
                                        tabIndex={active ? 0 : -1}
                                        aria-level={place.level}
                                        aria-expanded={expanded}
                                        aria-posinset={place.posInSet}
                                        aria-setsize={place.setSize}
                                    >
                                        {groups.render(item, { index: virtual.index, active, offset: virtual.start, measureRef: virtualizer.measureElement, level: place.level, expanded })}
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <React.Fragment key={item.id}>
                                {renderRow(item, {
                                    density,
                                    index: virtual.index,
                                    setSize: place?.setSize ?? items.length,
                                    level: place?.level,
                                    posInSet: place?.posInSet,
                                    active,
                                    selected: selectedIds ? selectedIds.has(item.id) : item.id === selectedId,
                                    current: selectedIds ? item.id === selectedId : undefined,
                                    checkable: selectedIds !== undefined,
                                    disabled,
                                    onToggle: selectedIds === undefined ? undefined : () => {
                                        if (!disabled) {
                                            onToggleSelected?.(item);
                                        }
                                    },
                                    optionId: `${baseId}-option-${virtual.index}`,
                                    offset: virtual.start,
                                    measureRef: virtualizer.measureElement,
                                })}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
            <span className="nuiget-visually-hidden" id={hintId}>{hint}</span>
        </div>
    );
}

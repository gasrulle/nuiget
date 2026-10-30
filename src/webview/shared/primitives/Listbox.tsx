import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { cssVars } from './cssVars';
import type { RowPlacement } from './Row';
import './primitives.css';

/** Row heights in pixels. They repeat `--nuiget-row-height-*`: a script cannot read a token before layout (CA-R4, `webview-tokens.test.ts`). */
const ROW_HEIGHT = { compact: 24, comfortable: 78 } as const;

/** Where a group row of the list goes; `renderGroup` draws what is inside it. */
export interface GroupPlacement {
    /** Zero-based position among all items of the list, rendered or not. */
    index: number;
    /** The row that holds the list's active position. */
    active: boolean;
    /** Offset of the row from the top of the list, in pixels. */
    offset: number;
    /** Measures the row; the list has placed it on the row's wrapper already. */
    measureRef?: (element: HTMLElement | null) => void;
}

/** What can take focus inside a group row; without any the row's wrapper does. */
const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]';

interface ListboxBaseProps<T extends { id: string }> {
    items: readonly T[];
    /** Returns a `Row` with `placement` spread into it. */
    renderRow: (item: T, placement: RowPlacement) => React.ReactNode;
    /** An item that is a group row: rendered by `renderGroup`, an arrow stop, never an option. Its keys and role are UX-P2.1c's. */
    isGroup?: (item: T) => boolean;
    renderGroup?: (item: T, placement: GroupPlacement) => React.ReactNode;
    /** One sentence that names the keys of this list, for example "Enter uninstalls. Shift+F10 opens the actions menu." It is read as the list's description. */
    hint: string;
    testId: string;
    density: 'compact' | 'comfortable';
    estimateSize?: number;
    overscan?: number;
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
 * A virtualized single-selection list (`role="listbox"`) with one tab stop. Arrow keys, Home and End move the
 * active row; the keys that act on a row are reported to the owner, so that everything a pointer can do with
 * the action buttons of a row is also on the keyboard. Only the rows in view are in the document, and the
 * active row always is, so focus never falls out of the list.
 */
export function Listbox<T extends { id: string }>(props: ListboxProps<T>): React.JSX.Element {
    const { items, renderRow, isGroup, renderGroup, hint, testId, density, overscan = 5, selectedId = null, selectedIds, onToggleSelected, onSelect, onActivate, onSecondaryActivate, onDelete, onContextMenu, busy, empty } = props;
    const estimateSize = props.estimateSize ?? ROW_HEIGHT[density];
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

    const virtualizer = useVirtualizer<HTMLDivElement, HTMLElement>({
        count: items.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => estimateSize,
        overscan,
        getItemKey: index => items[index].id,
        measureElement: element => element.getBoundingClientRect().height || estimateSize,
        rangeExtractor,
    });

    // Whether focus was inside the list when this render began, that is before the document changed. Only then
    // does the list take focus back after a change: it never pulls focus in from elsewhere.
    const hadFocus = rootRef.current?.contains(document.activeElement) ?? false;
    const optionAt = (index: number): HTMLElement | null =>
        scrollRef.current?.querySelector<HTMLElement>(`[data-index="${index}"] > [role="option"]`) ?? null;

    const isGroupAt = (index: number): boolean => items[index] !== undefined && isGroup?.(items[index]) === true;
    const focusTargetAt = (index: number): HTMLElement | null => {
        if (!isGroupAt(index)) {
            return optionAt(index);
        }
        const wrapper = scrollRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`) ?? null;
        return wrapper?.querySelector<HTMLElement>(FOCUSABLE) ?? wrapper;
    };

    useLayoutEffect(() => {
        if (!hadFocus) {
            return;
        }
        if (items.length === 0) {
            emptyRef.current?.focus();
            return;
        }
        const target = focusTargetAt(activeIndex);
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
        focusTargetAt(index)?.scrollIntoView?.({ block: 'nearest' });
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        const item = items[activeIndex];
        if (!item) {
            return;
        }
        const command = event.ctrlKey || event.metaKey;
        const disabled = optionAt(activeIndex)?.getAttribute('aria-disabled') === 'true';
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
        } else if (isGroupAt(activeIndex)) {
            // A group row is an arrow stop; the keys below act on package rows.
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
            const rect = optionAt(activeIndex)?.getBoundingClientRect();
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

    const setSize = items.length;
    return (
        <div className="nuiget-listbox-root" ref={rootRef}>
            <div
                className="nuiget-listbox"
                role="listbox"
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
                    const target = event.target as HTMLElement;
                    const option = target.closest('[role="option"]');
                    const index = option ? indexOf(event.target) : -1;
                    if (index < 0 || !items[index]) {
                        return;
                    }
                    if (selectedIds !== undefined && (event.ctrlKey || event.metaKey || target.closest('.nuiget-row-check'))) {
                        if (option?.getAttribute('aria-disabled') !== 'true') {
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
                        if (isGroupAt(virtual.index)) {
                            return (
                                <div
                                    key={item.id}
                                    className="nuiget-row"
                                    role="presentation"
                                    data-index={virtual.index}
                                    data-row-kind="group"
                                    tabIndex={-1}
                                    ref={virtualizer.measureElement}
                                    style={cssVars({ '--nuiget-virtual-offset': `${virtual.start}px` })}
                                >
                                    {renderGroup?.(item, { index: virtual.index, active: virtual.index === activeIndex, offset: virtual.start, measureRef: virtualizer.measureElement })}
                                </div>
                            );
                        }
                        return (
                            <React.Fragment key={item.id}>
                                {renderRow(item, {
                                    index: virtual.index,
                                    setSize,
                                    active: virtual.index === activeIndex,
                                    selected: selectedIds ? selectedIds.has(item.id) : item.id === selectedId,
                                    current: selectedIds ? item.id === selectedId : undefined,
                                    checkable: selectedIds !== undefined,
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

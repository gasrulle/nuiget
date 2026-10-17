import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cssVars } from './cssVars';
import { focusInto, isInLayerAbove, isTopLayer, pushLayer, removeLayer, restoreFocus, tabbables, type Layer } from './layers';
import './primitives.css';

/** A point in the viewport, such as the anchor of a context menu. */
export interface PopoverPoint {
    x: number;
    y: number;
}

export interface PopoverRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** Gap between anchor and popover, and the least distance to the edge of the viewport, in CSS pixels. */
const GAP = 2;
const MARGIN = 4;

/**
 * Where a popover of `size` goes next to `anchor` in a viewport of `viewport`: below the anchor, aligned with
 * its start, unless there is more room above; moved back inside the viewport where it would cross an edge.
 */
export function placePopover(anchor: PopoverRect, size: { width: number; height: number }, viewport: { width: number; height: number }): { x: number; y: number; side: 'below' | 'above' } {
    const below = viewport.height - anchor.bottom - GAP;
    const above = anchor.top - GAP;
    const side = size.height <= below - MARGIN || below >= above ? 'below' : 'above';
    const wantedY = side === 'below' ? anchor.bottom + GAP : anchor.top - GAP - size.height;
    const y = Math.max(MARGIN, Math.min(wantedY, viewport.height - MARGIN - size.height));
    const x = Math.max(MARGIN, Math.min(anchor.left, viewport.width - MARGIN - size.width));
    return { x, y, side };
}

interface PopoverBaseProps {
    open: boolean;
    /** The element it belongs to (the button that opened it) or a point (where a context menu was asked for). */
    anchor: React.RefObject<HTMLElement | null> | PopoverPoint;
    /** Escape, a click outside, or focus that moves out. The owner sets `open` to false. */
    onClose: () => void;
    children: React.ReactNode;
    /** Where focus goes when it opens; the first tabbable element when not given. */
    initialFocus?: React.RefObject<HTMLElement | null>;
    'data-testid'?: string;
}

/** A popover is a non-modal dialog and needs a name, its own or that of an element on the page. */
export type PopoverProps = PopoverBaseProps & ({ label: string; labelledBy?: undefined } | { labelledBy: string; label?: undefined });

const isPoint = (anchor: PopoverProps['anchor']): anchor is PopoverPoint => 'x' in anchor;

/**
 * Content that floats next to its anchor on a layer of its own, for example the project picker of Multi Install.
 * It is portalled to the body and fixed in the viewport, so no parent with `overflow: hidden` clips it, and it
 * moves to stay inside the viewport. It is a non-modal dialog: focus moves into it; Escape, or Tab past its first
 * or last control, closes it and gives focus back to the anchor; a click outside closes it and leaves focus
 * where the click put it.
 */
export function Popover(props: PopoverProps): React.JSX.Element | null {
    return props.open ? <OpenPopover {...props} /> : null;
}

function OpenPopover({ anchor, onClose, children, initialFocus, label, labelledBy, 'data-testid': testId }: PopoverProps): React.JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const layer = useRef<Layer>({ element: () => ref.current }).current;
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const anchorRef = useRef(anchor);
    anchorRef.current = anchor;
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

    useLayoutEffect(() => {
        const element = ref.current;
        const anchorElement = (): HTMLElement | null => (isPoint(anchorRef.current) ? null : anchorRef.current.current);
        const opener = anchorElement() ?? document.activeElement;

        const place = (): void => {
            if (!element) {
                return;
            }
            const current = anchorRef.current;
            const anchorRect: PopoverRect = isPoint(current)
                ? { left: current.x, right: current.x, top: current.y, bottom: current.y }
                : current.current?.getBoundingClientRect() ?? { left: 0, right: 0, top: 0, bottom: 0 };
            const { width, height } = element.getBoundingClientRect();
            const { x, y } = placePopover(anchorRect, { width, height }, { width: window.innerWidth, height: window.innerHeight });
            setPosition(previous => (previous?.x === x && previous.y === y ? previous : { x, y }));
        };

        pushLayer(layer);
        place();
        if (element) {
            focusInto(element, initialFocus?.current);
        }

        // A press outside closes it; a press on the anchor is left to the anchor, which toggles.
        const onPointerDown = (event: PointerEvent): void => {
            const target = event.target as Node;
            if (isTopLayer(layer) && element && !element.contains(target) && !anchorElement()?.contains(target)) {
                onCloseRef.current();
            }
        };
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
            document.removeEventListener('pointerdown', onPointerDown, true);
            removeLayer(layer);
            restoreFocus(element, opener);
        };
        // Opening is the one moment to remember the opener and move focus; a later change of the props is not.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        const element = ref.current;
        if (!element || !isTopLayer(layer)) {
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCloseRef.current();
        } else if (event.key === 'Tab') {
            // The popover sits at the end of the body, far from its anchor in the tab order. Tab past either end
            // closes it, and focus goes back to the anchor, next to which the user continues.
            const stops = tabbables(element);
            const active = document.activeElement;
            const leaving = event.shiftKey ? active === stops[0] || active === element : active === stops[stops.length - 1] || stops.length === 0;
            if (leaving) {
                event.preventDefault();
                onCloseRef.current();
            }
        }
    };

    // Focus that moves to an element outside by other means (a script, a click on a control the pointerdown did
    // not see) closes it; focus into a layer opened from it does not, and focus on the anchor is left to the
    // anchor, which toggles.
    const onBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
        const next = event.relatedTarget;
        const current = anchorRef.current;
        const anchorElement = isPoint(current) ? null : current.current;
        if (next instanceof Node && !ref.current?.contains(next) && !isInLayerAbove(layer, next) && !anchorElement?.contains(next)) {
            onCloseRef.current();
        }
    };

    return createPortal(
        <div
            ref={ref}
            className="nuiget-popover"
            role="dialog"
            aria-label={label}
            aria-labelledby={labelledBy}
            tabIndex={-1}
            data-testid={testId}
            data-placed={position === null ? undefined : 'true'}
            style={position === null ? undefined : cssVars({ '--nuiget-popover-x': `${position.x}px`, '--nuiget-popover-y': `${position.y}px` })}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
        >
            {children}
        </div>,
        document.body,
    );
}

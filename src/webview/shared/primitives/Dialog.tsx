import React, { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';
import { CloseIcon } from './icons';
import { focusInto, isInLayerAbove, isTopLayer, pushLayer, removeLayer, restoreFocus, tabbables, type Layer } from './layers';
import './primitives.css';

export interface DialogProps {
    open: boolean;
    /** Escape, the close button, or the owner's own Cancel. The owner sets `open` to false. */
    onClose: () => void;
    /** The heading of the dialog and its accessible name. */
    title: React.ReactNode;
    /** A sentence read with the name when the dialog opens. */
    description?: React.ReactNode;
    children?: React.ReactNode;
    /** The buttons at the bottom, usually Cancel and the action. */
    footer?: React.ReactNode;
    /** `alertdialog` for a question that interrupts, such as a confirmation. */
    role?: 'dialog' | 'alertdialog';
    /** Where focus goes when the dialog opens; the first tabbable element when not given. */
    initialFocus?: React.RefObject<HTMLElement | null>;
    /** When given, the header has a close button with this name, for example "Close NuGet sources". */
    closeLabel?: string;
    'data-testid'?: string;
}

/**
 * A modal dialog (`role="dialog"`, `aria-modal`) on a layer above the page. Focus moves into it when it opens,
 * Tab and Shift+Tab stay inside it, Escape closes it, and focus returns to where it was when it closes. A dialog
 * opened from a dialog stacks on top, and only the topmost one answers. The page behind it cannot be clicked;
 * it is not dimmed, because no theme colour exists for a scrim, and the dialog is set off by its border.
 */
export function Dialog(props: DialogProps): React.JSX.Element | null {
    return props.open ? <OpenDialog {...props} /> : null;
}

function OpenDialog({ onClose, title, description, children, footer, role = 'dialog', initialFocus, closeLabel, 'data-testid': testId }: DialogProps): React.JSX.Element {
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const descriptionId = `${baseId}-description`;
    const ref = useRef<HTMLDivElement>(null);
    const layer = useRef<Layer>({ element: () => ref.current }).current;
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useLayoutEffect(() => {
        const opener = document.activeElement;
        const element = ref.current;
        pushLayer(layer);
        if (element) {
            focusInto(element, initialFocus?.current);
        }
        // Focus that lands outside the topmost dialog, by a click on the page or by a script, is taken back.
        const onFocusIn = (event: FocusEvent): void => {
            const target = event.target as Node;
            if (element && isTopLayer(layer) && !element.contains(target) && !isInLayerAbove(layer, target)) {
                focusInto(element);
            }
        };
        document.addEventListener('focusin', onFocusIn);
        return () => {
            document.removeEventListener('focusin', onFocusIn);
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
            const stops = tabbables(element);
            const first = stops[0];
            const last = stops[stops.length - 1];
            const active = document.activeElement;
            if (!first) {
                event.preventDefault();
            } else if (event.shiftKey && (active === first || active === element)) {
                event.preventDefault();
                last.focus({ preventScroll: true });
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus({ preventScroll: true });
            }
        }
    };

    return createPortal(
        <div className="nuiget-dialog-layer">
            <div
                ref={ref}
                className="nuiget-dialog"
                role={role}
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description === undefined ? undefined : descriptionId}
                tabIndex={-1}
                data-testid={testId}
                onKeyDown={onKeyDown}
            >
                <div className="nuiget-dialog-header">
                    <h2 id={titleId} className="nuiget-dialog-title">{title}</h2>
                    {closeLabel ? <IconButton label={closeLabel} onClick={() => onCloseRef.current()}><CloseIcon /></IconButton> : null}
                </div>
                {/* A div, not a p: a confirmation lists packages, and a list may not stand in a paragraph. */}
                {description === undefined ? null : <div id={descriptionId} className="nuiget-dialog-description">{description}</div>}
                {children === undefined ? null : <div className="nuiget-dialog-body">{children}</div>}
                {footer === undefined ? null : <div className="nuiget-dialog-footer">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
}

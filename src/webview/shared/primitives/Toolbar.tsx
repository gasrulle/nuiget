import React, { useLayoutEffect, useRef } from 'react';
import './primitives.css';

export interface ToolbarProps {
    /** The name of the toolbar, for example "Bulk actions". */
    label: string;
    /** Buttons and checkboxes, in the order the arrow keys visit them. */
    children: React.ReactNode;
    'data-testid'?: string;
}

const CONTROLS = 'button, input:not([type="hidden"]), select, textarea';
const TEXT_FIELD = 'input:not([type]), input[type="text"], input[type="search"], textarea';

/**
 * A row of controls (`role="toolbar"`) with one tab stop, such as the bulk actions of a list. ArrowLeft and
 * ArrowRight move between the enabled controls and wrap around, Home and End go to the first and last; in a text
 * field they move the caret, and an arrow leaves the field at the edge of the text. The
 * toolbar remembers the control that last had focus; when it is disabled or removed, the first one takes over.
 * The tab stop is kept on the controls themselves, so the controls are ordinary children: buttons that change,
 * appear or disappear do not have to know they are in a toolbar. A control with the class `nuiget-toolbar-end` is
 * pushed to the end of the row; the arrow keys still visit the controls in document order.
 */
export function Toolbar({ label, children, 'data-testid': testId }: ToolbarProps): React.JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const active = useRef<HTMLElement | null>(null);

    const all = (): HTMLElement[] => [...(ref.current?.querySelectorAll<HTMLElement>(CONTROLS) ?? [])];
    const controls = (): HTMLElement[] => all().filter(control => !(control as HTMLButtonElement).disabled);

    /**
     * One enabled control has `tabindex="0"`, every other control `-1`, disabled ones included: a control that is
     * enabled again must not come back as a second tab stop. Writes only attributes that are wrong.
     */
    const applyTabStop = (): void => {
        const enabled = controls();
        if (!active.current || !enabled.includes(active.current)) {
            active.current = enabled[0] ?? null;
        }
        for (const control of all()) {
            const wanted = control === active.current ? 0 : -1;
            if (control.tabIndex !== wanted) {
                control.tabIndex = wanted;
            }
        }
    };

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) {
            return;
        }
        applyTabStop();
        // A control that mounts later, or one that is enabled or disabled, would otherwise be a second tab stop or
        // take the only one with it.
        const observer = new MutationObserver(applyTabStop);
        observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
        return () => observer.disconnect();
        // The observer covers every later change of the children.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onFocus = (event: React.FocusEvent<HTMLDivElement>): void => {
        if (controls().includes(event.target)) {
            active.current = event.target;
            applyTabStop();
        }
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (!leavesTextField(event)) {
            return;
        }
        const enabled = controls();
        const index = enabled.indexOf(event.target as HTMLElement);
        const last = enabled.length - 1;
        const next = { ArrowRight: index >= last ? 0 : index + 1, ArrowLeft: index <= 0 ? last : index - 1, Home: 0, End: last }[event.key];
        if (next === undefined || enabled.length === 0) {
            return;
        }
        event.preventDefault();
        enabled[next].focus();
    };

    return (
        <div ref={ref} className="nuiget-toolbar" role="toolbar" aria-label={label} data-testid={testId} onFocus={onFocus} onKeyDown={onKeyDown}>
            {children}
        </div>
    );
}

/**
 * In a text field Home, End and the arrows move the caret. An arrow moves the focus only from the edge of the
 * text: ArrowLeft with the caret at the start, ArrowRight with it at the end.
 */
function leavesTextField(event: React.KeyboardEvent): boolean {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target.matches(TEXT_FIELD)) {
        return true;
    }
    const collapsed = target.selectionStart === target.selectionEnd;
    if (event.key === 'ArrowLeft') {
        return collapsed && target.selectionStart === 0;
    }
    if (event.key === 'ArrowRight') {
        return collapsed && target.selectionEnd === target.value.length;
    }
    return false;
}

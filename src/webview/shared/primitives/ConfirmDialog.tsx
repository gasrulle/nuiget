import React, { useRef } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { DialogGroups, type DialogGroup } from './DialogGroups';
import './primitives.css';

export interface ConfirmDialogProps {
    open: boolean;
    /** The question as a heading, for example "Uninstall 3 packages?". */
    title: string;
    /** What will happen in words, before the lists; whether it can be undone. */
    children?: React.ReactNode;
    /** The packages and projects affected, one list per group, rendered by the dialog (UX-P3.5). */
    groups?: ReadonlyArray<DialogGroup>;
    /** The verb of the action, for example "Uninstall". */
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void;
    /** Cancel, or Escape. */
    onCancel: () => void;
    /** The action is under way: Confirm is disabled until the owner closes the dialog. */
    busy?: boolean;
}

/**
 * A confirmation before an action that changes several things at once (interaction model §5): bulk update, bulk
 * uninstall, removing a source. It is an `alertdialog` whose message is its description, and it opens with focus
 * on Cancel, the choice that changes nothing.
 */
export function ConfirmDialog({ open, title, children, groups, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel, busy }: ConfirmDialogProps): React.JSX.Element | null {
    const cancelRef = useRef<HTMLButtonElement>(null);
    // Every rhythm is a gap, never a margin: 8 between the words and the lists (DS-GRID-2a).
    const message = (
        <div className="nuiget-dialog-message">
            {children}
            {groups === undefined ? null : <DialogGroups groups={groups} />}
        </div>
    );
    return (
        <Dialog
            open={open}
            onClose={onCancel}
            title={title}
            description={message}
            role="alertdialog"
            initialFocus={cancelRef}
            data-testid="confirm-dialog"
            footer={<>
                <Button variant="secondary" ref={cancelRef} data-testid="confirm-dialog-cancel" onClick={onCancel}>{cancelLabel}</Button>
                <Button data-testid="confirm-dialog-confirm" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
            </>}
        />
    );
}

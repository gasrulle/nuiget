import type React from 'react';
import type { PackageUpdate } from '../../../../protocol';
import { ConfirmDialog } from '../../../shared/primitives';

export interface UpdateAllDialogProps {
    open: boolean;
    updates: readonly PackageUpdate[];
    onConfirm: () => void;
    onCancel: () => void;
}

/** The confirmation of a bulk update (interaction model §5): every package with the version it goes from and to. */
export function UpdateAllDialog({ open, updates, onConfirm, onCancel }: UpdateAllDialogProps): React.JSX.Element | null {
    return (
        <ConfirmDialog
            open={open}
            title={updates.length === 1 ? 'Update 1 package?' : `Update ${updates.length} packages?`}
            confirmLabel="Update"
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            <ul className="nuiget-bulk-list">
                {updates.map(update => <li key={update.id}>{`${update.id}: ${update.installedVersion} → ${update.latestVersion}`}</li>)}
            </ul>
        </ConfirmDialog>
    );
}

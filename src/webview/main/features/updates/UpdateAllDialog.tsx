import type React from 'react';
import type { PackageUpdate } from '../../../../protocol';
import { ConfirmDialog } from '../../../shared/primitives';

export interface UpdateAllDialogProps {
    open: boolean;
    updates: readonly PackageUpdate[];
    /** In All Projects: the same updates under the name of their project. */
    groups?: ReadonlyArray<{ projectName: string; updates: readonly PackageUpdate[] }>;
    onConfirm: () => void;
    onCancel: () => void;
}

/** The confirmation of a bulk update (interaction model §5): every package with the version it goes from and to. */
export function UpdateAllDialog({ open, updates, groups, onConfirm, onCancel }: UpdateAllDialogProps): React.JSX.Element | null {
    const line = (update: PackageUpdate): string => `${update.id}: ${update.installedVersion} → ${update.latestVersion}`;
    return (
        <ConfirmDialog
            open={open}
            title={updates.length === 1 ? 'Update 1 package?' : `Update ${updates.length} packages?`}
            confirmLabel="Update"
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            {groups === undefined ? (
                <ul className="nuiget-bulk-list">
                    {updates.map(update => <li key={update.id}>{line(update)}</li>)}
                </ul>
            ) : groups.map(group => (
                <div key={group.projectName}>
                    <p className="nuiget-bulk-lead">{`In ${group.projectName}:`}</p>
                    <ul className="nuiget-bulk-list">
                        {group.updates.map(update => <li key={update.id}>{line(update)}</li>)}
                    </ul>
                </div>
            ))}
        </ConfirmDialog>
    );
}

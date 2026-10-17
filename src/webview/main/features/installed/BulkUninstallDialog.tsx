import type React from 'react';
import { ConfirmDialog } from '../../../shared/primitives';

/** The packages of one project that the user selected for uninstalling. */
export interface Removal {
    projectPath: string;
    projectName: string;
    packages: readonly string[];
}

export interface BulkUninstallDialogProps {
    open: boolean;
    removals: readonly Removal[];
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * The confirmation of a bulk uninstall (interaction model §5): it lists exactly the packages that will go, under
 * the name of their project when there are several projects.
 */
export function BulkUninstallDialog({ open, removals, onConfirm, onCancel }: BulkUninstallDialogProps): React.JSX.Element | null {
    const count = removals.reduce((sum, removal) => sum + removal.packages.length, 0);
    return (
        <ConfirmDialog
            open={open}
            title={count === 1 ? 'Uninstall 1 package?' : `Uninstall ${count} packages?`}
            confirmLabel="Uninstall"
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            {removals.map(removal => (
                <div key={removal.projectPath} className="nuiget-bulk-project">
                    <p className="nuiget-bulk-lead">{`From ${removal.projectName}:`}</p>
                    <ul className="nuiget-bulk-list">
                        {removal.packages.map(id => <li key={id}>{id}</li>)}
                    </ul>
                </div>
            ))}
        </ConfirmDialog>
    );
}

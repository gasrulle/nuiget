import type React from 'react';
import type { PackageUpdate } from '../../../../protocol';
import { Dialog } from '../../../shared/primitives';

export interface CentralUpdateDialogProps {
    /** The update of a centrally managed package the user asked for; `null` when the dialog is closed. */
    update: PackageUpdate | null;
    onClose: () => void;
}

/**
 * What updating a centrally managed package would change (interaction model §5, "CPM central change"). Until the
 * central-version editor exists (plan item P6.3) the preview is read-only: it says what would change and offers no
 * action, because the host refuses a central update (D7).
 */
export function CentralUpdateDialog({ update, onClose }: CentralUpdateDialogProps): React.JSX.Element | null {
    return (
        <Dialog
            open={update !== null}
            onClose={onClose}
            title={update ? `${update.id} is centrally managed` : ''}
            description="Its version is set in Directory.Packages.props for every project that uses it."
            data-testid="cpm-preview-dialog"
            footer={<button type="button" className="nuiget-button" onClick={onClose}>Close</button>}
        >
            {update ? (
                <p className="nuiget-bulk-lead">
                    {`Updating it to ${update.latestVersion} changes the central version from ${update.installedVersion}. Central updates are not available in this version of the 2.0 panel yet; edit Directory.Packages.props to change it.`}
                </p>
            ) : null}
        </Dialog>
    );
}

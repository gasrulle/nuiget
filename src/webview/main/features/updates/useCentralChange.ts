import { useCallback, useEffect, useState } from 'react';
import { useOpsActions } from '../../../shared/store/ops';
import { useSession } from '../../../shared/store/session';
import type { CentralUpdateRequest } from './CentralUpdateDialog';

/** The main panel's one central change: the request its `CentralUpdateDialog` shows, and what its buttons do. */
export interface CentralChange {
    /** `null` while no central change is asked. */
    request: CentralUpdateRequest | null;
    /** Opens the dialog for a change that sets a central version: a central row's update or an install the preview found a central entry for. */
    ask: (request: CentralUpdateRequest) => void;
    /** Cancel: nothing is sent. */
    close: () => void;
    /** *Update central version*: runs the request's install or update with its version, then closes. */
    confirm: () => void;
}

/**
 * The owner of the main panel's central change (N77, ADR-013): every list and the details pane ask here, and the shell
 * mounts the one `CentralUpdateDialog` on `request`. A request belongs to the project it was asked in: a change of the
 * committed project closes it. Confirm runs the operation through the ops slice, so the row is busy from the call on.
 */
export function useCentralChange(announce: (message: string) => void): CentralChange {
    const { run } = useOpsActions();
    const [request, setRequest] = useState<CentralUpdateRequest | null>(null);
    const committedProject = useSession().committed?.selectedProject;
    useEffect(() => setRequest(null), [committedProject]);

    const ask = useCallback((next: CentralUpdateRequest): void => setRequest(next), []);
    const close = useCallback((): void => setRequest(null), []);
    const confirm = (): void => {
        const change = request;
        setRequest(null);
        if (change === null) {
            return;
        }
        const { kind, projectPath, packageId, toVersion: version, sourceUrl } = change;
        const failed = (error: unknown): void => {
            announce(`${kind === 'install' ? 'Install' : 'Update'} of ${packageId} failed: ${error instanceof Error ? error.message : String(error)}`);
        };
        if (kind === 'install') {
            run('ops/install', { projectPath, packageId, version, sourceUrl }).catch(failed);
        } else {
            run('ops/update', { projectPath, packageId, version, sourceUrl }).catch(failed);
        }
    };

    return { request, ask, close, confirm };
}

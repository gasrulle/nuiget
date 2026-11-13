import type React from 'react';
import type { InstalledPackage, InstalledResult } from '../../protocol';
import { IN_PROGRESS, UNRESOLVED_HINT, shownVersion, whyNotRemovable } from '../shared/installed/rules';
import { Badge, IconButton, Row, TrashIcon, type RowPlacement } from '../shared/primitives';
import { useOps, useOpsActions } from '../shared/store/ops';
import { useRowRequests } from './rowRequests';

/** The packages of a result shown under a filter, sorted by id as the main panel's lists are (P9.10). */
export function visiblePackages(result: InstalledResult, filter: string): InstalledPackage[] {
    const needle = filter.trim().toLowerCase();
    return result.packages.filter(entry => entry.id.toLowerCase().includes(needle)).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The actions and the row of an installed package, shared by the single project's list and the All Projects tree (UX-P3.7c):
 * Enter, Delete or the row's button uninstalls from the row's own project, Ctrl+Enter opens the full view, Shift+F10 the
 * actions menu. A package that cannot be uninstalled has no button and Enter says why; a centrally managed one uninstalls
 * from this project and keeps its central entry.
 */
export function usePackageRows(announce: (message: string) => void) {
    const { isPackageBusy, active } = useOps();
    const { run } = useOpsActions();
    const { viewDetails } = useRowRequests(announce);

    /** What the row of a busy package says: the operation the store reports, from the call that asked for it on. */
    const busyStatus = (projectPath: string, packageId: string): string => {
        const id = packageId.toLowerCase();
        for (const progress of active.values()) {
            if (progress.kind !== undefined && progress.projectPaths?.includes(projectPath) && progress.packageIds?.some(other => other.toLowerCase() === id)) {
                return IN_PROGRESS[progress.kind];
            }
        }
        return 'In progress';
    };

    const uninstall = (projectPath: string, result: InstalledResult, entry: InstalledPackage): void => {
        if (isPackageBusy(projectPath, entry.id)) {
            return;
        }
        const obstacle = whyNotRemovable(entry, result);
        if (obstacle !== undefined) {
            announce(obstacle);
            return;
        }
        // The row is busy from this call on (the ops slice). The outcome, also a refusal, is announced from the
        // slice; here only a request that got no answer.
        run('ops/remove', { projectPath, packageId: entry.id }).catch((error: unknown) => {
            announce(`Uninstall of ${entry.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    const renderPackageRow = (projectPath: string, result: InstalledResult, entry: InstalledPackage, placement: RowPlacement): React.JSX.Element => {
        const busy = isPackageBusy(projectPath, entry.id);
        const unresolved = entry.declaration === 'unresolved';
        const central = entry.declaration === 'central' || entry.declaration === 'central-override';
        return (
            <Row
                {...placement}
                vscodeContext={{
                    webviewSection: 'installedRow',
                    packageId: entry.id,
                    projectPath,
                    installedVersion: entry.resolvedVersion ?? entry.version,
                    versionType: entry.versionType,
                    'nuiget.central': central,
                    'nuiget.readOnly': whyNotRemovable(entry, result) !== undefined,
                }}
                itemId={entry.id}
                name={entry.id}
                version={shownVersion(entry)}
                versionTitle={unresolved ? UNRESOLVED_HINT : undefined}
                busy={busy}
                status={busy ? busyStatus(projectPath, entry.id) : unresolved ? 'Unresolved' : undefined}
                badges={central ? <Badge label="CPM" title="Centrally managed" /> : undefined}
                actions={whyNotRemovable(entry, result) === undefined
                    ? <IconButton label={`Uninstall ${entry.id}`} tabIndex={-1} data-testid="row-action-uninstall" onClick={() => uninstall(projectPath, result, entry)}><TrashIcon /></IconButton>
                    : undefined}
            />
        );
    };

    return { uninstall, viewDetails, renderPackageRow, busyStatus };
}


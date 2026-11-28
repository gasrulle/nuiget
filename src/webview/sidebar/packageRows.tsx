import type React from 'react';
import type { InstalledPackage, InstalledResult, PackageMetadataLite } from '../../protocol';
import { DeprecationBadge } from '../shared/installed/DeprecationBadge';
import { UNRESOLVED_HINT, busyText, filterById, shownVersion, vulnerabilitySeverity, whyNotRemovable } from '../shared/installed/rules';
import { VulnerabilityBadge } from '../shared/installed/VulnerabilityBadge';
import { useAllProjects } from '../shared/store/allProjects';
import { useInstalled } from '../shared/store/installed';
import { Badge, IconButton, Row, TrashIcon, type RowPlacement } from '../shared/primitives';
import type { UninstallRequest } from '../shared/installed/uninstallConfirm';
import { useOps, useOpsActions } from '../shared/store/ops';
import { useRowRequests } from './rowRequests';

/** The packages of a result shown under a filter, sorted by id as the main panel's lists are (P9.10). */
export function visiblePackages(result: InstalledResult, filter: string): InstalledPackage[] {
    return filterById(result.packages, filter);
}

/** A project's name in a single project's list: the project file's name, extension kept, as the project selector shows it. */
export const projectFileName = (projectPath: string): string => projectPath.split(/[\\/]/).pop() ?? projectPath;

/**
 * A row's lite metadata (UX-P5.4): under All Projects the row's own project's map, else the selected project's, by lower-cased id;
 * undefined when the row's project is not the one the slice describes. Unknown shows no mark.
 */
export function useRowLite(): (projectPath: string, id: string) => PackageMetadataLite | undefined {
    const installed = useInstalled();
    const all = useAllProjects();
    return (projectPath, id) => (all.active
        ? all.metadata.get(projectPath)?.get(id.toLowerCase())
        : installed.projectPath === projectPath ? installed.metadata.get(id.toLowerCase()) : undefined);
}

/** The view's Delete confirmation, which the key asks and the row button never does (ADR-013 Decision 3, UX-P4.2b). */
export type AskUninstall = (request: UninstallRequest) => void;

/**
 * The actions and the row of an installed package, shared by the single project's list and the All Projects tree (UX-P3.7c):
 * Enter opens the package in the main panel on the row's own tab (UX-P4.2b), Delete asks before it uninstalls from the row's
 * own project, the row's button uninstalls at once, Shift+F10 opens the actions menu. A package that cannot be uninstalled has
 * no button and Delete says why; a centrally managed one uninstalls from this project and keeps its central entry.
 */
export function usePackageRows(announce: (message: string) => void, ask: AskUninstall) {
    const ops = useOps();
    const { isPackageBusy } = ops;
    const { run } = useOpsActions();
    const { viewDetails } = useRowRequests(announce);
    const liteOf = useRowLite();

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

    // The Delete key: the same guards as the button, then the view's confirmation (UX-P4.2b).
    const askUninstall = (projectPath: string, projectName: string, result: InstalledResult, entry: InstalledPackage): void => {
        if (isPackageBusy(projectPath, entry.id)) {
            return;
        }
        const obstacle = whyNotRemovable(entry, result);
        if (obstacle !== undefined) {
            announce(obstacle);
            return;
        }
        ask({ projectPath, projectName, packageId: entry.id });
    };

    const renderPackageRow = (projectPath: string, result: InstalledResult, entry: InstalledPackage, placement: RowPlacement): React.JSX.Element => {
        const busy = isPackageBusy(projectPath, entry.id);
        const unresolved = entry.declaration === 'unresolved';
        const central = entry.declaration === 'central' || entry.declaration === 'central-override';
        // The main panel's marks in its order: CPM, the severity, Deprecated (UX-P5.4); no slot when none applies.
        const lite = liteOf(projectPath, entry.id);
        const marked = central || vulnerabilitySeverity(lite) !== undefined || lite?.deprecation !== undefined;
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
                status={busy ? busyText(ops, projectPath, entry.id) : unresolved ? 'Unresolved' : undefined}
                badges={marked ? <>
                    {central ? <Badge label="CPM" title="Centrally managed" /> : null}
                    <VulnerabilityBadge lite={lite} />
                    <DeprecationBadge deprecation={lite?.deprecation} />
                </> : undefined}
                actions={whyNotRemovable(entry, result) === undefined
                    ? <IconButton label={`Uninstall ${entry.id}`} tabIndex={-1} data-testid="row-action-uninstall" onClick={() => uninstall(projectPath, result, entry)}><TrashIcon /></IconButton>
                    : undefined}
            />
        );
    };

    // The Browse row reads its operation's status through the hook (BrowseResults.tsx).
    return { uninstall, askUninstall, viewDetails, renderPackageRow, busyStatus: (projectPath: string, packageId: string): string => busyText(ops, projectPath, packageId) };
}


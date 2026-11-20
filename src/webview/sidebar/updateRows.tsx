import type React from 'react';
import type { InstalledResult, PackageUpdate } from '../../protocol';
import { busyText, isCentral, updateRowContext, updatesInOrder, whyNotDeletable, whyNotUpdatable } from '../shared/installed/rules';
import { ArrowUpIcon, Badge, IconButton, openRowMenu, Row, type RowPlacement } from '../shared/primitives';
import { useOps, useOpsActions } from '../shared/store/ops';
import type { AskUninstall } from './packageRows';
import { useRowRequests } from './rowRequests';

/**
 * The updates of a list shown under the `@updates` text, sorted by id as the main panel's lists are (MU9, P9.10); a single
 * project's first check keeps its rows in arrival order while it streams (X76, UX-P4.8b).
 */
export function visibleUpdates(updates: readonly PackageUpdate[], filter: string, streaming = false): PackageUpdate[] {
    return updatesInOrder(updates, filter, streaming);
}

const entryOf = (installed: InstalledResult | undefined, id: string) => installed?.packages.find(entry => entry.id.toLowerCase() === id.toLowerCase());

/**
 * The actions and the row of an update, shared by the single project's list and the All Projects tree (UX-P3.7d): Ctrl+Enter or
 * the row's button updates the package in the row's own project to its latest version with the row's source; Enter opens the
 * main panel on the row's own tab, Delete asks before it uninstalls (UX-P4.2b), Shift+F10 opens VS Code's actions menu. A centrally managed package opens the actions menu instead, where the host
 * confirms the central change in a modal listing the projects it reaches; a row with a `VersionOverride` updates in its project
 * alone, without a preview (N74); an unsupported project is read-only.
 */
export function useUpdateRows(announce: (message: string) => void, ask: AskUninstall) {
    const ops = useOps();
    const { isPackageBusy } = ops;
    const { run } = useOpsActions();
    const { viewDetails } = useRowRequests(announce);

    // The Delete key on an update row: busy does nothing, what cannot be uninstalled says why, else the view's confirmation (UX-P4.2b).
    const askUninstall = (projectPath: string, projectName: string, installed: InstalledResult | undefined, update: PackageUpdate): void => {
        if (isPackageBusy(projectPath, update.id, true)) {
            return;
        }
        const obstacle = whyNotDeletable(update.id, entryOf(installed, update.id), installed);
        if (obstacle !== undefined) {
            announce(obstacle);
            return;
        }
        ask({ projectPath, projectName, packageId: update.id });
    };

    const updateOne = (projectPath: string, installed: InstalledResult | undefined, update: PackageUpdate): void => {
        if (isPackageBusy(projectPath, update.id, true)) {
            return;
        }
        if (installed?.unsupported) {
            announce(`${update.id} cannot be updated: ${installed.unsupported.message}`);
            return;
        }
        const entry = entryOf(installed, update.id);
        const obstacle = entry === undefined || installed === undefined ? undefined : whyNotUpdatable(entry, installed);
        if (obstacle !== undefined) {
            announce(obstacle);
            return;
        }
        if (entry !== undefined && isCentral(entry)) {
            // The host confirms the central change in a modal; the menu is the row's, under the keyboard's focus.
            openRowMenu(document.activeElement);
            return;
        }
        run('ops/update', { projectPath, packageId: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl }).catch((error: unknown) => {
            announce(`Update of ${update.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    const renderUpdateRow = (projectPath: string, installed: InstalledResult | undefined, update: PackageUpdate, placement: RowPlacement): React.JSX.Element => {
        const busy = isPackageBusy(projectPath, update.id, true);
        const entry = entryOf(installed, update.id);
        const central = entry?.declaration === 'central' || entry?.declaration === 'central-override';
        return (
            <Row
                {...placement}
                vscodeContext={updateRowContext(update, projectPath, entry, installed)}
                itemId={update.id}
                name={update.id}
                version={update.installedVersion}
                nextVersion={update.latestVersion}
                busy={busy}
                status={busy ? busyText(ops, projectPath, update.id) : undefined}
                badges={central ? <Badge label="CPM" title={entry?.declaration === 'central-override' ? 'Centrally managed; this project overrides the version' : 'Centrally managed'} /> : undefined}
                actions={installed?.unsupported ? undefined : (
                    <IconButton label={`Update ${update.id} to ${update.latestVersion}`} tabIndex={-1} data-testid="row-action-update" onClick={() => updateOne(projectPath, installed, update)}><ArrowUpIcon /></IconButton>
                )}
            />
        );
    };

    return { updateOne, askUninstall, viewDetails, renderUpdateRow };
}

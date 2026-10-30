import { useMemo } from 'react';
import type React from 'react';
import type { InstalledPackage, InstalledResult } from '../../protocol';
import { IN_PROGRESS, UNRESOLVED_HINT, shownVersion, whyNotRemovable } from '../shared/installed/rules';
import { Badge, EmptyState, IconButton, Listbox, Row, TrashIcon } from '../shared/primitives';
import { useOps, useOpsActions } from '../shared/store/ops';
import { useRowRequests } from './rowRequests';

interface Item {
    id: string;
    entry: InstalledPackage;
}

export interface ProjectPackagesProps {
    projectPath: string;
    result: InstalledResult;
    /** Shows the packages whose id contains this text, whatever the case. */
    filter: string;
    announce: (message: string) => void;
    /** The id of the element that names the list (the section's title). */
    labelledBy: string;
    testId: string;
    busy: boolean;
    /** The selected row, kept by the section so that it outlives a collapse of the list. */
    selectedId: string | null;
    onSelectedChange: (id: string) => void;
}

/**
 * The installed packages of one project as compact rows: Enter, Delete or the row's button uninstalls from this project,
 * Ctrl+Enter opens the package in the full view, Shift+F10 asks the host for the actions menu. A package that cannot be
 * uninstalled (an unsupported project, an SDK-injected one, one declared in a props file) has no button and Enter says why;
 * a centrally managed one uninstalls from this project and keeps its central entry.
 */
export function ProjectPackages({ projectPath, result, filter, announce, labelledBy, testId, busy: revalidating, selectedId, onSelectedChange }: ProjectPackagesProps): React.JSX.Element {
    const { isPackageBusy, active } = useOps();
    const { run } = useOpsActions();
    const { menu, viewDetails } = useRowRequests(announce);
    const needle = filter.trim().toLowerCase();
    const items = useMemo<Item[]>(
        // Sorted by id, as the main panel's lists are (P9.10).
        () => result.packages.filter(entry => entry.id.toLowerCase().includes(needle)).sort((a, b) => a.id.localeCompare(b.id)).map(entry => ({ id: entry.id, entry })),
        [result, needle],
    );
    const isBusy = (packageId: string): boolean => isPackageBusy(projectPath, packageId);

    /** What the row of a busy package says: the operation the store reports, from the call that asked for it on. */
    const busyStatus = (packageId: string): string => {
        const id = packageId.toLowerCase();
        for (const progress of active.values()) {
            if (progress.kind !== undefined && progress.projectPaths?.includes(projectPath) && progress.packageIds?.some(other => other.toLowerCase() === id)) {
                return IN_PROGRESS[progress.kind];
            }
        }
        return 'In progress';
    };

    const uninstall = ({ entry }: Item): void => {
        if (isBusy(entry.id)) {
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

    const readOnly = result.unsupported !== undefined;
    let nothing = `No installed packages match "${filter.trim()}".`;
    if (result.packages.length === 0) {
        nothing = readOnly ? 'No packages to show.' : 'No packages installed.';
    }
    return (
        <Listbox
            items={items}
            labelledBy={labelledBy}
            hint={readOnly
                ? 'Read-only. Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.'
                : 'Enter or Delete uninstalls; Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.'}
            testId={testId}
            density="compact"
            selectedId={selectedId}
            busy={revalidating}
            onSelect={item => onSelectedChange(item.id)}
            onActivate={uninstall}
            onDelete={uninstall}
            onSecondaryActivate={({ entry }) => viewDetails(entry.id, entry.resolvedVersion ?? entry.version)}
            onContextMenu={({ entry }) => menu({ packageId: entry.id, installedVersion: entry.resolvedVersion ?? entry.version, context: 'installed', projectPath, versionType: entry.versionType })}
            empty={<EmptyState data-testid="sidebar-installed-empty" message={nothing} />}
            isDisabled={({ entry }) => entry.declaration === 'unresolved'}
            renderRow={(item, placement) => {
                const { entry } = item;
                const busy = isBusy(entry.id);
                const unresolved = entry.declaration === 'unresolved';
                const central = entry.declaration === 'central' || entry.declaration === 'central-override';
                return (
                    <Row
                        {...placement}
                        itemId={entry.id}
                        name={entry.id}
                        version={shownVersion(entry)}
                        versionTitle={unresolved ? UNRESOLVED_HINT : undefined}
                        density="compact"
                        busy={busy}
                        status={busy ? busyStatus(entry.id) : unresolved ? 'Unresolved' : undefined}
                        badges={central ? <Badge label="CPM" title="Centrally managed" /> : undefined}
                        actions={whyNotRemovable(entry, result) === undefined
                            ? <IconButton label={`Uninstall ${entry.id}`} tabIndex={-1} data-testid="row-action-uninstall" onClick={() => uninstall(item)}><TrashIcon /></IconButton>
                            : undefined}
                    />
                );
            }}
        />
    );
}

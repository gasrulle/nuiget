import { useMemo } from 'react';
import type React from 'react';
import type { InstalledResult, PackageUpdate } from '../../protocol';
import { IN_PROGRESS, isCentral, whyNotUpdatable } from '../shared/installed/rules';
import { ArrowUpIcon, Badge, EmptyState, IconButton, Listbox, Row } from '../shared/primitives';
import { useOps, useOpsActions } from '../shared/store/ops';
import { useRowRequests } from './rowRequests';

interface Item {
    id: string;
    update: PackageUpdate;
}

export interface ProjectUpdatesProps {
    projectPath: string;
    rows: readonly PackageUpdate[];
    /** The project's installed list: which packages are centrally managed, whether the project is unsupported. */
    installed: InstalledResult | undefined;
    /** The text after `@updates`: only updates whose id contains it are listed. */
    filter: string;
    announce: (message: string) => void;
    labelledBy: string;
    testId: string;
    busy: boolean;
    /** The empty state's sentence. */
    empty: string;
    selectedId: string | null;
    onSelectedChange: (id: string) => void;
}

/**
 * The updates of one project as compact rows: Enter or the row's button updates the package in this project to its
 * latest version with the row's source; Ctrl+Enter opens the full view, Shift+F10 the host's actions menu. A centrally
 * managed package opens the actions menu instead, where the host confirms the central change in a modal listing the
 * projects it reaches; a row with a `VersionOverride` updates in this project alone, without a preview (N74); an
 * unsupported project is read-only.
 */
export function ProjectUpdates(props: ProjectUpdatesProps): React.JSX.Element {
    const { projectPath, rows, installed, filter, announce, labelledBy, testId, busy: revalidating, empty, selectedId, onSelectedChange } = props;
    const { isPackageBusy, active } = useOps();
    const { run } = useOpsActions();
    const { menu, viewDetails } = useRowRequests(announce);
    const needle = filter.trim().toLowerCase();
    // Sorted by id, as the main panel's lists are (MU9, P9.10).
    const items = useMemo<Item[]>(() => rows.filter(update => update.id.toLowerCase().includes(needle)).sort((a, b) => a.id.localeCompare(b.id)).map(update => ({ id: update.id, update })), [rows, needle]);
    const centralIds = useMemo(() => new Set((installed?.packages ?? [])
        .filter(entry => entry.declaration === 'central' || entry.declaration === 'central-override')
        .map(entry => entry.id.toLowerCase())), [installed]);
    const unsupported = installed?.unsupported;
    const isBusy = (id: string): boolean => isPackageBusy(projectPath, id);

    const busyStatus = (packageId: string): string => {
        const id = packageId.toLowerCase();
        for (const progress of active.values()) {
            if (progress.kind !== undefined && progress.projectPaths?.includes(projectPath) && progress.packageIds?.some(other => other.toLowerCase() === id)) {
                return IN_PROGRESS[progress.kind];
            }
        }
        return 'In progress';
    };

    const openMenu = (update: PackageUpdate): void => {
        const versionType = installed?.packages.find(entry => entry.id.toLowerCase() === update.id.toLowerCase())?.versionType;
        menu({ packageId: update.id, installedVersion: update.installedVersion, latestVersion: update.latestVersion, context: 'updates', projectPath, versionType, sourceUrl: update.sourceUrl });
    };

    const updateOne = ({ update }: Item): void => {
        if (isBusy(update.id)) {
            return;
        }
        if (unsupported) {
            announce(`${update.id} cannot be updated: ${unsupported.message}`);
            return;
        }
        const entry = installed?.packages.find(other => other.id.toLowerCase() === update.id.toLowerCase());
        const obstacle = entry === undefined || installed === undefined ? undefined : whyNotUpdatable(entry, installed);
        if (obstacle !== undefined) {
            announce(obstacle);
            return;
        }
        if (entry !== undefined && isCentral(entry)) {
            openMenu(update);
            return;
        }
        run('ops/update', { projectPath, packageId: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl }).catch((error: unknown) => {
            announce(`Update of ${update.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    return (
        <Listbox
            items={items}
            labelledBy={labelledBy}
            hint="Enter updates to the latest version (a centrally managed package: opens the actions menu); Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu."
            testId={testId}
            density="compact"
            selectedId={selectedId}
            busy={revalidating}
            onSelect={item => onSelectedChange(item.id)}
            onActivate={updateOne}
            onSecondaryActivate={({ update }) => viewDetails(update.id, update.latestVersion)}
            onContextMenu={({ update }) => openMenu(update)}
            empty={<EmptyState data-testid="sidebar-updates-empty" message={empty} />}
            renderRow={(item, placement) => {
                const { update } = item;
                const busy = isBusy(update.id);
                const central = centralIds.has(update.id.toLowerCase());
                return (
                    <Row
                        {...placement}
                        itemId={update.id}
                        name={update.id}
                        version={update.installedVersion}
                        nextVersion={update.latestVersion}
                        busy={busy}
                        status={busy ? busyStatus(update.id) : undefined}
                        badges={central ? <Badge label="CPM" title={installed?.packages.find(entry => entry.id.toLowerCase() === update.id.toLowerCase())?.declaration === 'central-override' ? 'Centrally managed; this project overrides the version' : 'Centrally managed'} /> : undefined}
                        actions={unsupported ? undefined : (
                            <IconButton label={`Update ${update.id} to ${update.latestVersion}`} tabIndex={-1} data-testid="row-action-update" onClick={() => updateOne(item)}><ArrowUpIcon /></IconButton>
                        )}
                    />
                );
            }}
        />
    );
}

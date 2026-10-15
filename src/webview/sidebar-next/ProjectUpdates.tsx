import { useMemo } from 'react';
import type React from 'react';
import type { InstalledResult, PackageUpdate } from '../../protocol';
import { IN_PROGRESS } from '../shared/installed/rules';
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
 * managed package is not updated from here until the central editor exists (P6.3); an unsupported project is read-only.
 */
export function ProjectUpdates(props: ProjectUpdatesProps): React.JSX.Element {
    const { projectPath, rows, installed, filter, announce, labelledBy, testId, busy: revalidating, empty, selectedId, onSelectedChange } = props;
    const { isPackageBusy, active } = useOps();
    const { run } = useOpsActions();
    const { menu, viewDetails } = useRowRequests(announce);
    const needle = filter.trim().toLowerCase();
    const items = useMemo<Item[]>(() => rows.filter(update => update.id.toLowerCase().includes(needle)).map(update => ({ id: update.id, update })), [rows, needle]);
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

    const updateOne = ({ update }: Item): void => {
        if (isBusy(update.id)) {
            return;
        }
        if (unsupported) {
            announce(`${update.id} cannot be updated: ${unsupported.message}`);
            return;
        }
        if (centralIds.has(update.id.toLowerCase())) {
            announce(`${update.id} is centrally managed; change its version in Directory.Packages.props.`);
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
            hint="Enter updates to the latest version; Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu."
            testId={testId}
            density="compact"
            selectedId={selectedId}
            busy={revalidating}
            onSelect={item => onSelectedChange(item.id)}
            onActivate={updateOne}
            onSecondaryActivate={({ update }) => viewDetails(update.id, update.latestVersion)}
            onContextMenu={({ update }) => {
                const versionType = installed?.packages.find(entry => entry.id.toLowerCase() === update.id.toLowerCase())?.versionType;
                menu({ packageId: update.id, installedVersion: update.installedVersion, latestVersion: update.latestVersion, context: 'updates', projectPath, versionType, sourceUrl: update.sourceUrl });
            }}
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
                        version={`${update.installedVersion} → ${update.latestVersion}`}
                        density="compact"
                        busy={busy}
                        status={busy ? busyStatus(update.id) : undefined}
                        badges={central ? <Badge label="CPM" title="Centrally managed" /> : undefined}
                        actions={central || unsupported ? undefined : (
                            <IconButton label={`Update ${update.id} to ${update.latestVersion}`} tabIndex={-1} data-testid="row-action-update" onClick={() => updateOne(item)}><ArrowUpIcon /></IconButton>
                        )}
                    />
                );
            }}
        />
    );
}

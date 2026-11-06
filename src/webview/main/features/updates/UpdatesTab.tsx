import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, type PackageUpdate } from '../../../../protocol';
import { IN_PROGRESS, isCentral as isCentralRow, updateRowContext, whyNotUpdatable } from '../../../shared/installed/rules';
import { ArrowUpIcon, Badge, Banner, Button, CheckAllIcon, EmptyState, IconButton, Listbox, ProgressBar, Row, SectionHeader, Skeleton, Toolbar, type ListboxGroups } from '../../../shared/primitives';
import { packageIconSrc } from '../../../shared/packageIcon';
import { useDetails, useDetailsActions } from '../../../shared/store/details';
import { useInstalled } from '../../../shared/store/installed';
import { useBulkSelection } from '../../../shared/selection/useBulkSelection';
import { useOps, useOpsActions } from '../../../shared/store/ops';
import { useSession } from '../../../shared/store/session';
import { useUpdates } from '../../../shared/store/updates';
import type { ListView } from '../../MainShell';
import { directCount } from '../installed/InstalledProjectSection';
import { rowId } from '../installed/installedTree';
import { AllProjectsUpdates } from './AllProjectsUpdates';
import { UpdateAllDialog } from './UpdateAllDialog';
import { sentence } from './updatesTree';

/**
 * An item of the tab's one grouped list (D48): the Direct packages group row, then its updates; the list identifies its
 * items by `id` (a package's is `rowId(project, id)`, as the Installed tab's; UX-P3.1a).
 */
type Item =
    | { kind: 'group'; id: 'direct'; count: number | string }
    | { kind: 'package'; id: string; update: PackageUpdate };

const HINT = 'Space selects the package for a bulk update. Enter updates it. Shift+F10 opens the actions menu. On a group row, Enter, Left and Right expand and collapse it.';

/**
 * The Updates tab of the main panel: the updates of the selected project, newest version per package, with the bulk
 * toolbar over them. A source that could not be checked is a banner over the list, never an empty "no updates"; when no
 * row came back the banner is the cell's one message, as the error's (design-advisor, UX-P3.1b). A
 * centrally managed package is updated through the preview of the central change (`central.ask`, the shell's one
 * `CentralUpdateDialog`) and joins no bulk update (N76); a row with a `VersionOverride` updates in its project alone,
 * without a preview, and joins one (N74).
 * Nothing is removed here: a row is busy from the request on and leaves when the host's next list no longer has it.
 * In All Projects the tab is `AllProjectsUpdates`, one section per project.
 */
export function UpdatesTab(view: ListView): React.JSX.Element {
    const allMode = useSession().committed?.selectedProject === ALL_PROJECTS;
    return allMode ? <AllProjectsUpdates {...view} /> : <ProjectUpdates {...view} />;
}

function ProjectUpdates({ filter, announce, central }: ListView): React.JSX.Element {
    const { committed } = useSession();
    const updates = useUpdates();
    const installed = useInstalled();
    const { isPackageBusy, active } = useOps();
    const { run } = useOpsActions();
    const [currentId, setCurrentId] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    const [confirming, setConfirming] = useState(false);

    // The bulk set follows the project selection (`useBulkSelection`'s reset key); the central change is the shell's.
    const selection = committed?.selectedProject;
    useEffect(() => {
        setCurrentId(null);
        setConfirming(false);
    }, [selection]);

    const { projectPath, rows } = updates;
    // A selection of this tab that comes back (the tab shown again) makes its row current again.
    const detailsSelection = useDetails().selection;
    useEffect(() => {
        if (detailsSelection?.origin === 'updates' && detailsSelection.projectPath === projectPath && projectPath !== null) {
            setCurrentId(rowId(projectPath, detailsSelection.packageId));
        }
    }, [detailsSelection, projectPath]);
    const { select } = useDetailsActions();
    const centralIds = useMemo(() => new Set((installed.result?.packages ?? [])
        .filter(entry => entry.declaration === 'central' || entry.declaration === 'central-override')
        .map(entry => entry.id.toLowerCase())), [installed.result]);
    /** The CPM badge: a central or an override row. */
    const isCentral = (id: string): boolean => centralIds.has(id.toLowerCase());
    const entryOf = (id: string) => installed.result?.packages.find(entry => entry.id.toLowerCase() === id.toLowerCase());
    /** A row whose update changes the central version: it needs the preview and stays out of a bulk update. */
    const changesCentral = (id: string): boolean => {
        const entry = entryOf(id);
        return entry !== undefined && isCentralRow(entry);
    };
    /** Why a row is not updated from here (an unresolved row); `undefined` when it can be. */
    const obstacleOf = (id: string): string | undefined => {
        const entry = entryOf(id);
        return entry === undefined || installed.result === undefined ? undefined : whyNotUpdatable(entry, installed.result);
    };
    const isBusy = (id: string): boolean => projectPath !== null && isPackageBusy(projectPath, id);
    // An unsupported project (an SDK below 10 included) is read-only: its updates are shown, never applied (D13).
    const unsupported = installed.result?.unsupported;

    const needle = filter.trim().toLowerCase();
    /** A package row's id in the tree, as the Installed tab's (UX-P3.1a). */
    const keyOf = (packageId: string): string => rowId(projectPath ?? '', packageId);
    // Alphabetical by id, as 1.x listed them (MU9); the stream's rows keep their place while more arrive.
    const shown = useMemo(() => rows.filter(row => row.id.toLowerCase().includes(needle)).sort((a, b) => a.id.localeCompare(b.id)), [rows, needle]);
    // One grouped list (D48): the Direct packages group row counts the updates shown, `k of N` under a filter (DS-COPY-5).
    // Without a row to list the group row is left out: the empty sentence stands alone (the state cells are UX-P3.1b's).
    const items = useMemo<Item[]>(() => {
        if (shown.length === 0) {
            return [];
        }
        const group: Item = { kind: 'group', id: 'direct', count: directCount(rows.length, shown.length, needle !== '') };
        return collapsed.has('direct') ? [group] : [group, ...shown.map(update => ({ kind: 'package' as const, id: rowId(projectPath ?? '', update.id), update }))];
    }, [shown, rows.length, needle, collapsed, projectPath]);
    const groups = useMemo((): ListboxGroups<Item> => ({
        is: item => item.kind === 'group',
        isExpanded: item => !collapsed.has(item.id),
        onToggle: (item, expanded) => setCollapsed(previous => {
            const next = new Set(previous);
            if (expanded) {
                next.delete(item.id);
            } else {
                next.add(item.id);
            }
            return next;
        }),
        render: (item, placement) => (item.kind === 'group'
            ? <SectionHeader presentation="content" title="Direct packages" testKey="direct" expanded={placement.expanded} variant="group" count={item.count} />
            : null),
    }), [collapsed]);
    // A bulk update takes the rows shown that are neither centrally managed nor busy; the bulk set is a subset of them,
    // keyed as the rows are, and a row that leaves them leaves the set (UX-P2.1c).
    const candidates = unsupported ? [] : shown.filter(update => !changesCentral(update.id) && !isBusy(update.id));
    const candidateKey = candidates.map(update => keyOf(update.id)).join('\0');
    const candidateIds = useMemo(() => (candidateKey === '' ? [] : candidateKey.split('\0')), [candidateKey]);
    const bulk = useBulkSelection(candidateIds, selection);
    const chosen = candidates.filter(update => bulk.selected.has(keyOf(update.id)));
    const toUpdate = chosen.length > 0 ? chosen : candidates;
    const { allSelected } = bulk;

    const busyStatus = (packageId: string): string => {
        const id = packageId.toLowerCase();
        for (const progress of active.values()) {
            if (progress.kind !== undefined && progress.projectPaths?.includes(projectPath ?? '') && progress.packageIds?.some(other => other.toLowerCase() === id)) {
                return IN_PROGRESS[progress.kind];
            }
        }
        return 'In progress';
    };

    const updateOne = (update: PackageUpdate): void => {
        if (projectPath === null || isBusy(update.id) || unsupported) {
            return;
        }
        const obstacle = obstacleOf(update.id);
        if (obstacle !== undefined) {
            announce(obstacle);
            return;
        }
        const entry = entryOf(update.id);
        if (entry !== undefined && isCentralRow(entry)) {
            central.ask({ kind: 'update', projectPath, packageId: update.id, fromVersion: update.installedVersion, toVersion: update.latestVersion, sourceUrl: update.sourceUrl });
            return;
        }
        // The row is busy from this call on (ops slice); the outcome is announced from the slice.
        run('ops/update', { projectPath, packageId: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl }).catch((error: unknown) => {
            announce(`Update of ${update.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    const toggle = (update: PackageUpdate): void => {
        const key = keyOf(update.id);
        if (unsupported) {
            announce(`${update.id} cannot be updated: ${unsupported.message}`);
            return;
        }
        if (changesCentral(update.id)) {
            announce(`${update.id} is centrally managed; update it on its own to see the projects it changes`);
            return;
        }
        if (!bulk.toggle(key)) {
            announce('An operation on this package is running.');
        }
    };

    const confirm = (): void => {
        setConfirming(false);
        bulk.clear();
        if (projectPath === null || toUpdate.length === 0) {
            return;
        }
        run('ops/bulkUpdate', { projectPath, packages: toUpdate.map(update => ({ id: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl })) }).catch((error: unknown) => {
            announce(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    // The bar lies over the list area's top edge while the list loads or asks again (DS-STATE-2, UX-P3.1b).
    const loading = committed === undefined || (projectPath !== null && updates.status === 'loading');
    const bar = loading || updates.revalidating
        ? <div className="nuiget-installed-progress"><ProgressBar label={loading ? 'Loading updates' : 'Refreshing updates'} data-testid="updates-progress" /></div>
        : null;
    let body: React.ReactNode;
    if (committed === undefined) {
        body = <Skeleton density="comfortable" />;
    } else if (projectPath === null) {
        body = <EmptyState message="No .NET projects found in this workspace." />;
    } else if ((updates.status === 'error' || updates.sourcesUnavailable) && rows.length === 0) {
        // The banner above is the one message: `sourcesUnavailable` cannot tell a partial answer from none.
        body = null;
    } else if (updates.status === 'loading' && rows.length === 0) {
        body = <Skeleton density="comfortable" />;
    } else {
        const empty = rows.length > 0 ? `No update matches "${filter.trim()}".`
            // Nothing installed is not "up to date" (MU10); an unsupported project lists no packages either.
            : !unsupported && installed.result !== undefined && installed.result.packages.length === 0 ? 'No packages installed.' : 'No updates available.';
        body = (
            <Listbox
                items={items}
                groups={groups}
                label="Updates"
                hint={HINT}
                testId="updates-list"
                density="comfortable"
                busy={updates.revalidating || updates.status === 'loading'}
                selectedId={currentId}
                selectedIds={bulk.selected}
                onToggleSelected={item => {
                    if (item.kind === 'package') {
                        toggle(item.update);
                    }
                }}
                onSelect={item => {
                    if (item.kind !== 'package') {
                        return;
                    }
                    setCurrentId(item.id);
                    select({ packageId: item.update.id, version: item.update.latestVersion, sourceUrl: item.update.sourceUrl, origin: 'updates', projectPath, known: { verified: item.update.verified } });
                }}
                onActivate={item => {
                    if (item.kind === 'package') {
                        updateOne(item.update);
                    }
                }}
                // The marker names the two empty cells only: nothing installed, and no update (not a filter that matches nothing).
                empty={<EmptyState message={empty} data-testid={rows.length === 0 ? 'updates-empty' : undefined} />}
                renderRow={(item, placement) => {
                    if (item.kind !== 'package') {
                        return null;
                    }
                    const { update } = item;
                    const busy = isBusy(update.id);
                    const centrallyManaged = isCentral(update.id);
                    const src = packageIconSrc(update.iconUrl);
                    return (
                        <Row
                            {...placement}
                            vscodeContext={projectPath === null ? undefined : updateRowContext(update, projectPath, entryOf(update.id), installed.result)}
                            itemId={update.id}
                            name={update.id}
                            version={update.installedVersion}
                            nextVersion={update.latestVersion}
                            authors={update.authors}
                            verified={update.verified}
                            icon={src === undefined ? undefined : <img src={src} alt="" />}
                            busy={busy}
                            // An unsupported project's rows are read-only: muted check, and the row says so (DS-STATE-7).
                            selectable={!unsupported}
                            status={busy ? busyStatus(update.id) : unsupported ? 'Read-only' : undefined}
                            badges={<>
                                {centrallyManaged ? <Badge label="CPM" title={entryOf(update.id)?.declaration === 'central-override' ? 'Centrally managed; this project overrides the version' : 'Centrally managed'} /> : null}
                            </>}
                            actions={unsupported ? undefined : (
                                <IconButton label={`Update ${update.id} to ${update.latestVersion}`} tabIndex={-1} data-testid="row-action-update" onClick={() => updateOne(update)}><ArrowUpIcon /></IconButton>
                            )}
                        />
                    );
                }}
            />
        );
    }

    return (
        <div className="nuiget-installed nuiget-updates">
            <Toolbar label="Bulk actions" data-testid="updates-toolbar" end={<Button data-testid="update-all-button" disabled={toUpdate.length === 0} title={toUpdate.length === 0 ? 'No update in this list can join a bulk update.' : undefined} onClick={() => setConfirming(true)}>
                {chosen.length > 0 ? `Update selected (${chosen.length})` : `Update all (${candidates.length})`}
            </Button>}>
                <Button variant="secondary" icon={<CheckAllIcon />} data-testid="select-all-button" aria-pressed={allSelected} disabled={candidates.length === 0} title={candidates.length === 0 ? 'No update in this list can join a bulk update.' : undefined} onClick={bulk.selectAll}>
                    Select all
                </Button>
            </Toolbar>
            {updates.sourcesUnavailable
                ? <Banner severity="warning" data-testid="updates-unavailable-banner" action={{ label: 'Retry', onClick: updates.refresh }}>Some package sources could not be checked; the list may be incomplete.</Banner>
                : null}
            {updates.error
                ? <Banner severity="error" data-testid="updates-error" action={{ label: 'Retry', onClick: updates.refresh }}>{`Updates could not be checked: ${sentence(updates.error.message)}`}</Banner>
                : null}
            <div className="nuiget-installed-lists">{bar}{body}</div>
            <UpdateAllDialog open={confirming && toUpdate.length > 0} updates={toUpdate} onConfirm={confirm} onCancel={() => setConfirming(false)} />
        </div>
    );
}

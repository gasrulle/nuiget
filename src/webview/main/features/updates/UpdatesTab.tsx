import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, type PackageUpdate } from '../../../../protocol';
import { IN_PROGRESS, isCentral as isCentralRow, whyNotUpdatable } from '../../../shared/installed/rules';
import { ArrowUpIcon, Badge, Banner, Button, EmptyState, IconButton, Listbox, Row, Skeleton, Toolbar } from '../../../shared/primitives';
import { packageIconSrc } from '../../../shared/packageIcon';
import { useDetails, useDetailsActions } from '../../../shared/store/details';
import { useInstalled } from '../../../shared/store/installed';
import { useOps, useOpsActions } from '../../../shared/store/ops';
import { useSession } from '../../../shared/store/session';
import { useUpdates } from '../../../shared/store/updates';
import type { ListView } from '../../MainShell';
import { AllProjectsUpdates } from './AllProjectsUpdates';
import { CentralUpdateDialog, type CentralUpdateRequest } from './CentralUpdateDialog';
import { UpdateAllDialog } from './UpdateAllDialog';

/** An update as the list holds it; the list identifies its items by `id`. */
interface Item {
    id: string;
    update: PackageUpdate;
}

const HINT = 'Space selects the package for a bulk update. Enter updates it.';

/**
 * The Updates tab of the main panel: the updates of the selected project, newest version per package, with the bulk
 * toolbar over them. A source that could not be checked is a banner over the list, never an empty "no updates". A
 * centrally managed package is updated through the preview of the central change (`CentralUpdateDialog`) and joins no
 * bulk update (N76); a row with a `VersionOverride` updates in its project alone, without a preview, and joins one (N74).
 * Nothing is removed here: a row is busy from the request on and leaves when the host's next list no longer has it.
 * In All Projects the tab is `AllProjectsUpdates`, one section per project.
 */
export function UpdatesTab(view: ListView): React.JSX.Element {
    const allMode = useSession().committed?.selectedProject === ALL_PROJECTS;
    return allMode ? <AllProjectsUpdates {...view} /> : <ProjectUpdates {...view} />;
}

function ProjectUpdates({ filter, announce }: ListView): React.JSX.Element {
    const { committed } = useSession();
    const updates = useUpdates();
    const installed = useInstalled();
    const { isPackageBusy, active } = useOps();
    const { run } = useOpsActions();
    const [currentId, setCurrentId] = useState<string | null>(null);
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [confirming, setConfirming] = useState(false);
    const [central, setCentral] = useState<CentralUpdateRequest | null>(null);

    const selection = committed?.selectedProject;
    useEffect(() => {
        setCurrentId(null);
        setSelected(new Set());
        setConfirming(false);
        setCentral(null);
    }, [selection]);

    const { projectPath, rows } = updates;
    // A selection of this tab that comes back (the tab shown again) makes its row current again.
    const detailsSelection = useDetails().selection;
    useEffect(() => {
        if (detailsSelection?.origin === 'updates' && detailsSelection.projectPath === projectPath) {
            setCurrentId(detailsSelection.packageId);
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
    // Alphabetical by id, as 1.x listed them (MU9); the stream's rows keep their place while more arrive.
    const items = useMemo<Item[]>(() => rows.filter(row => row.id.toLowerCase().includes(needle)).sort((a, b) => a.id.localeCompare(b.id)).map(update => ({ id: update.id, update })), [rows, needle]);
    // A bulk update takes the rows shown that are neither centrally managed nor busy.
    const candidates = unsupported ? [] : items.filter(item => !changesCentral(item.id) && !isBusy(item.id)).map(item => item.update);
    const chosen = candidates.filter(update => selected.has(update.id));
    const toUpdate = chosen.length > 0 ? chosen : candidates;
    const allSelected = candidates.length > 0 && chosen.length === candidates.length;

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
            setCentral({ kind: 'update', projectPath, packageId: update.id, fromVersion: update.installedVersion, toVersion: update.latestVersion, sourceUrl: update.sourceUrl });
            return;
        }
        // The row is busy from this call on (ops slice); the outcome is announced from the slice.
        run('ops/update', { projectPath, packageId: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl }).catch((error: unknown) => {
            announce(`Update of ${update.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    const toggle = (update: PackageUpdate): void => {
        if (unsupported) {
            announce(`${update.id} cannot be updated: ${unsupported.message}`);
            return;
        }
        if (changesCentral(update.id)) {
            announce(`${update.id} is centrally managed; update it on its own to see the projects it changes`);
            return;
        }
        setSelected(previous => {
            const next = new Set(previous);
            if (!next.delete(update.id)) {
                next.add(update.id);
            }
            return next;
        });
    };

    const confirm = (): void => {
        setConfirming(false);
        setSelected(new Set());
        if (projectPath === null || toUpdate.length === 0) {
            return;
        }
        run('ops/bulkUpdate', { projectPath, packages: toUpdate.map(update => ({ id: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl })) }).catch((error: unknown) => {
            announce(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    let body: React.ReactNode;
    if (committed === undefined) {
        body = <Skeleton density="comfortable" />;
    } else if (projectPath === null) {
        body = <EmptyState message="No .NET projects found in this workspace." />;
    } else if (updates.status === 'error' && rows.length === 0) {
        body = null;
    } else if (updates.status === 'loading' && rows.length === 0) {
        body = <Skeleton density="comfortable" />;
    } else {
        // Empty is not unknown: with a source that could not be checked, no row does not mean no update.
        const empty = updates.sourcesUnavailable
            ? 'Updates could not be checked: no package source answered.'
            : rows.length > 0 ? `No update matches "${filter.trim()}".`
                // Nothing installed is not "up to date" (MU10); an unsupported project lists no packages either.
                : !unsupported && installed.result !== undefined && installed.result.packages.length === 0 ? 'No packages installed.' : 'No updates available.';
        body = (
            <Listbox
                items={items}
                label="Updates"
                hint={HINT}
                testId="updates-list"
                density="comfortable"
                busy={updates.revalidating || updates.status === 'loading'}
                selectedId={currentId}
                selectedIds={selected}
                onToggleSelected={item => toggle(item.update)}
                onSelect={item => {
                    setCurrentId(item.id);
                    select({ packageId: item.update.id, version: item.update.latestVersion, sourceUrl: item.update.sourceUrl, origin: 'updates', projectPath, known: { verified: item.update.verified } });
                }}
                onActivate={item => updateOne(item.update)}
                empty={<EmptyState message={empty} />}
                renderRow={(item, placement) => {
                    const { update } = item;
                    const busy = isBusy(update.id);
                    const centrallyManaged = isCentral(update.id);
                    const src = packageIconSrc(update.iconUrl);
                    return (
                        <Row
                            {...placement}
                            itemId={update.id}
                            name={update.id}
                            version={update.installedVersion}
                            nextVersion={update.latestVersion}
                            authors={update.authors}
                            verified={update.verified}
                            icon={src === undefined ? undefined : <img src={src} alt="" />}
                            busy={busy}
                            status={busy ? busyStatus(update.id) : undefined}
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
            <Toolbar label="Bulk actions" data-testid="updates-toolbar" end={<Button data-testid="update-all-button" disabled={toUpdate.length === 0} onClick={() => setConfirming(true)}>
                {chosen.length > 0 ? `Update selected (${chosen.length})` : `Update all (${candidates.length})`}
            </Button>}>
                <Button variant="secondary" data-testid="select-all-button" aria-pressed={allSelected} disabled={candidates.length === 0} onClick={() => setSelected(allSelected ? new Set() : new Set(candidates.map(update => update.id)))}>
                    Select all
                </Button>
            </Toolbar>
            {updates.sourcesUnavailable
                ? <Banner severity="warning" data-testid="updates-unavailable-banner" action={{ label: 'Retry', onClick: updates.refresh }}>Some package sources could not be checked; the list may be incomplete.</Banner>
                : null}
            {updates.error
                ? <Banner severity="error" action={{ label: 'Retry', onClick: updates.refresh }}>{`Updates could not be checked: ${updates.error.message}`}</Banner>
                : null}
            <div className="nuiget-installed-lists">{body}</div>
            <UpdateAllDialog open={confirming && toUpdate.length > 0} updates={toUpdate} onConfirm={confirm} onCancel={() => setConfirming(false)} />
            <CentralUpdateDialog
                request={central}
                onClose={() => setCentral(null)}
                onConfirm={() => {
                    const change = central;
                    setCentral(null);
                    if (change === null) {
                        return;
                    }
                    run('ops/update', { projectPath: change.projectPath, packageId: change.packageId, version: change.toVersion, sourceUrl: change.sourceUrl }).catch((error: unknown) => {
                        announce(`Update of ${change.packageId} failed: ${error instanceof Error ? error.message : String(error)}`);
                    });
                }}
            />
        </div>
    );
}

import { Fragment, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import type { InstalledResult, PackageUpdate, ProjectUpdatesChunk } from '../../../../protocol';
import { IN_PROGRESS, isCentral as isCentralRow, updateRowContext, whyNotUpdatable } from '../../../shared/installed/rules';
import { ArrowUpIcon, Badge, Banner, Button, CheckAllIcon, EmptyState, IconButton, Listbox, ProgressBar, Row, SectionHeader, Skeleton, Toolbar, type ListboxGroups } from '../../../shared/primitives';
import { packageIconSrc } from '../../../shared/packageIcon';
import { groupByFolder, PROJECT_GROUP, projectGroupIds } from '../../../shared/allProjects/folderGroups';
import { useBulkSelection } from '../../../shared/selection/useBulkSelection';
import { useAllProjects } from '../../../shared/store/allProjects';
import { useDetails, useDetailsActions } from '../../../shared/store/details';
import { useOps, useOpsActions } from '../../../shared/store/ops';
import type { ListView } from '../../MainShell';
import { directCount } from '../installed/InstalledProjectSection';
import { rowId } from '../installed/installedTree';
import { UpdateAllDialog } from './UpdateAllDialog';
import { sentence } from './updatesTree';

const HINT = 'Space selects the package for a bulk update. Enter updates it. Shift+F10 opens the actions menu. On a group row, Enter, Left and Right expand and collapse it.';

interface Section {
    projectPath: string;
    projectName: string;
    workspaceFolder?: string;
    chunk: ProjectUpdatesChunk | undefined;
    installed: InstalledResult | undefined;
}

/** An item of the tab's one tree (D48): a folder or project group row, a project's action-less sentence, or an update. */
type Item =
    | { kind: 'group'; id: string; level: number; title: string; variant: 'group' | 'level'; section?: Section }
    | { kind: 'message'; id: string; level: number; section: Section; cell: 'empty' | 'unsupported'; text: string; marker: string }
    | { kind: 'package'; id: string; section: Section; update: PackageUpdate };

const entryIn = (installed: InstalledResult | undefined, id: string) => installed?.packages.find(entry => entry.id.toLowerCase() === id.toLowerCase());
/** The CPM badge: a central or an override row. */
const isCentralIn = (installed: InstalledResult | undefined, id: string): boolean => {
    const declaration = entryIn(installed, id)?.declaration;
    return declaration === 'central' || declaration === 'central-override';
};
/** A row whose update changes the central version: it needs the preview and stays out of a bulk update (N76). */
const changesCentralIn = (installed: InstalledResult | undefined, id: string): boolean => {
    const entry = entryIn(installed, id);
    return entry !== undefined && isCentralRow(entry);
};

const NOT_COLLAPSED: ReadonlySet<string> = new Set();

/** A project's updates under the filter, alphabetical by id, as 1.x listed them (MU9). */
const rowsIn = (section: Section, needle: string): PackageUpdate[] => (section.chunk?.updates ?? []).filter(update => update.id.toLowerCase().includes(needle)).sort((a, b) => a.id.localeCompare(b.id));

/**
 * The Updates tab in All Projects (interaction model §3): one tree (D48), the tab's scroller, of every project's updates
 * under its group row, the projects under a group row per workspace folder when there are two or more, over the
 * `allProjects/updates` stream (UX-P3.1b). A project's action-less sentence (no updates, nothing installed, unsupported)
 * is a text-only leaf of its group; a project whose check failed has its banner with Retry above the tree, which owns
 * treeitems only. Rows of an unsupported project are read-only, a centrally managed package is updated through the
 * central preview (`central.ask`) and joins no bulk update (N76), a row with a `VersionOverride` updates in its project
 * alone without a preview (N74), and Update all takes the selected rows across projects (or every candidate) as one
 * `ops/bulkUpdateAllProjects`. A source that could not be checked is one banner over the tree.
 */
export function AllProjectsUpdates({ filter, announce, central }: ListView): React.JSX.Element {
    const all = useAllProjects();
    const { updates } = all;
    const { isPackageBusy, active } = useOps();
    const { run } = useOpsActions();
    const { select } = useDetailsActions();
    const [current, setCurrent] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(NOT_COLLAPSED);
    const [confirming, setConfirming] = useState(false);
    // A selection of this tab that comes back (the tab shown again) makes its row current again.
    const detailsSelection = useDetails().selection;
    useEffect(() => {
        if (detailsSelection?.origin === 'updates' && detailsSelection.projectPath !== null) {
            setCurrent(rowId(detailsSelection.projectPath, detailsSelection.packageId));
        }
    }, [detailsSelection]);

    const projects = updates.projects ?? all.projects;
    const sections = useMemo((): Section[] => (projects ?? []).map(project => ({
        projectPath: project.path,
        projectName: updates.chunks.get(project.path)?.projectName ?? project.name,
        workspaceFolder: updates.chunks.get(project.path)?.workspaceFolder ?? project.workspaceFolder,
        chunk: updates.chunks.get(project.path),
        installed: all.chunks.get(project.path)?.result,
    })), [projects, updates.chunks, all.chunks]);
    const projectGroups = useMemo(() => projectGroupIds(sections), [sections]);
    const markerOf = (section: Section): string => (projectGroups.get(section.projectPath) ?? `${PROJECT_GROUP}${section.projectPath.toLowerCase()}`).slice(PROJECT_GROUP.length);

    const needle = filter.trim().toLowerCase();
    const filtering = needle !== '';
    const rowsOf = (section: Section): PackageUpdate[] => rowsIn(section, needle);
    const candidatesOf = (section: Section): PackageUpdate[] => (section.installed?.unsupported
        ? []
        : rowsOf(section).filter(update => !changesCentralIn(section.installed, update.id) && !isPackageBusy(section.projectPath, update.id)));

    // The bulk set: a subset of the rows a bulk update may take, keyed as the rows are; a new listing clears it (UX-P2.1c).
    const candidateKey = sections.flatMap(section => candidatesOf(section).map(update => rowId(section.projectPath, update.id))).join('\0');
    const candidateIds = useMemo(() => (candidateKey === '' ? [] : candidateKey.split('\0')), [candidateKey]);
    const bulk = useBulkSelection(candidateIds, updates.projects);
    const chosenCount = bulk.count;
    const dialogGroups = sections
        .map(section => {
            const candidates = candidatesOf(section);
            const picked = chosenCount > 0 ? candidates.filter(update => bulk.selected.has(rowId(section.projectPath, update.id))) : candidates;
            return { section, projectName: section.projectName, updates: picked };
        })
        .filter(group => group.updates.length > 0);
    const total = dialogGroups.reduce((count, group) => count + group.updates.length, 0);
    const candidateTotal = candidateIds.length;

    const loading = updates.status === 'loading';
    const items = useMemo((): Item[] => {
        const list: Item[] = [];
        const project = (section: Section, level: number): void => {
            const id = projectGroups.get(section.projectPath) ?? `${PROJECT_GROUP}${section.projectPath.toLowerCase()}`;
            list.push({ kind: 'group', id, level, title: section.projectName, variant: level === 1 ? 'group' : 'level', section });
            const { chunk } = section;
            // What a project without an action has to say is a leaf of its group (DECISIONS 2026-11-01).
            const message = { kind: 'message', id: `${id}\nmessage`, level: 0, section, marker: id.slice(PROJECT_GROUP.length) } as const;
            if (collapsed.has(id) || chunk?.error !== undefined) {
                return;
            }
            if (chunk === undefined) {
                // Its group row spins while the stream runs; after it, no chunk means the updates are unknown, never none.
                if (!loading) {
                    list.push({ ...message, cell: 'empty', text: 'Updates could not be checked.' });
                }
                return;
            }
            const unsupported = section.installed?.unsupported;
            if (unsupported !== undefined) {
                list.push({ ...message, cell: 'unsupported', text: `Unsupported project: ${sentence(unsupported.message)}` });
            } else if (chunk.updates.length === 0 && !filtering) {
                // Empty is not unknown (a source could not be checked), and nothing installed is not "up to date" (MU10).
                const text = updates.sourcesUnavailable
                    ? 'Updates could not be checked.'
                    : section.installed !== undefined && section.installed.packages.length === 0 ? 'No packages installed.' : 'No updates available.';
                list.push({ ...message, cell: 'empty', text });
            }
            for (const update of rowsIn(section, needle)) {
                list.push({ kind: 'package', id: rowId(section.projectPath, update.id), section, update });
            }
        };
        const folders = groupByFolder(sections);
        if (folders.length < 2) {
            sections.forEach(section => project(section, 1));
            return list;
        }
        for (const [folder, members] of folders) {
            const id = `folder-${folder.toLowerCase()}`;
            list.push({ kind: 'group', id, level: 1, title: folder, variant: 'group' });
            if (!collapsed.has(id)) {
                members.forEach(section => project(section, 2));
            }
        }
        return list;
    }, [sections, projectGroups, collapsed, needle, filtering, updates.sourcesUnavailable, loading]);

    const groups = useMemo((): ListboxGroups<Item> => ({
        is: item => item.kind === 'group',
        isMessage: item => item.kind === 'message',
        level: item => (item.kind === 'group' ? item.level : 1),
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
        render: (item, placement) => {
            if (item.kind === 'message') {
                return <span data-testid={item.cell === 'empty' ? `updates-empty-${item.marker}` : `updates-unsupported-${item.marker}`}>{item.text}</span>;
            }
            if (item.kind !== 'group') {
                return null;
            }
            const { section } = item;
            const chunk = section?.chunk;
            const known = chunk !== undefined && chunk.error === undefined && !updates.sourcesUnavailable;
            const unsupported = section?.installed?.unsupported;
            return (
                <SectionHeader
                    presentation="content"
                    title={item.title}
                    testKey={item.id}
                    expanded={placement.expanded}
                    variant={item.variant}
                    count={known && section !== undefined ? directCount(chunk.updates.length, rowsIn(section, needle).length, filtering) : undefined}
                    busy={section !== undefined && chunk === undefined && loading}
                    badges={unsupported ? <Badge label="Unsupported" tone="warning" title={unsupported.message} /> : undefined}
                />
            );
        },
    }), [collapsed, updates.sourcesUnavailable, loading, needle, filtering]);

    const busyStatus = (projectPath: string, packageId: string): string => {
        const id = packageId.toLowerCase();
        for (const progress of active.values()) {
            if (progress.kind !== undefined && progress.projectPaths?.includes(projectPath) && progress.packageIds?.some(other => other.toLowerCase() === id)) {
                return IN_PROGRESS[progress.kind];
            }
        }
        return 'In progress';
    };

    const updateOne = (section: Section, update: PackageUpdate): void => {
        if (section.installed?.unsupported || isPackageBusy(section.projectPath, update.id)) {
            return;
        }
        const entry = entryIn(section.installed, update.id);
        const obstacle = entry === undefined || section.installed === undefined ? undefined : whyNotUpdatable(entry, section.installed);
        if (obstacle !== undefined) {
            announce(obstacle);
            return;
        }
        if (entry !== undefined && isCentralRow(entry)) {
            central.ask({ kind: 'update', projectPath: section.projectPath, packageId: update.id, fromVersion: update.installedVersion, toVersion: update.latestVersion, sourceUrl: update.sourceUrl });
            return;
        }
        run('ops/update', { projectPath: section.projectPath, packageId: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl }).catch((error: unknown) => {
            announce(`Update of ${update.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    const toggle = (section: Section, update: PackageUpdate): void => {
        if (section.installed?.unsupported) {
            announce(`${update.id} cannot be updated: ${section.installed.unsupported.message}`);
            return;
        }
        if (changesCentralIn(section.installed, update.id)) {
            announce(`${update.id} is centrally managed; update it on its own to see the projects it changes`);
            return;
        }
        if (!bulk.toggle(rowId(section.projectPath, update.id))) {
            announce('An operation on this package is running.');
        }
    };

    const confirm = (): void => {
        setConfirming(false);
        bulk.clear();
        if (dialogGroups.length === 0) {
            return;
        }
        run('ops/bulkUpdateAllProjects', {
            projectUpdates: dialogGroups.map(group => ({
                projectPath: group.section.projectPath,
                projectName: group.projectName,
                packages: group.updates.map(update => ({ id: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl })),
            })),
        }).catch((error: unknown) => {
            announce(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    const makeCurrent = (section: Section, update: PackageUpdate): void => {
        setCurrent(rowId(section.projectPath, update.id));
        select({ packageId: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl, origin: 'updates', projectPath: section.projectPath, known: { verified: update.verified } });
    };

    let body: React.ReactNode;
    if (sections.length === 0) {
        body = loading || updates.status === 'idle'
            ? <><div className="nuiget-installed-progress"><ProgressBar label="Loading updates" data-testid="updates-progress" /></div><Skeleton density="comfortable" /></>
            : <EmptyState message="No projects to list." />;
    } else {
        const firstLoad = loading && updates.chunks.size === 0;
        body = (
            <>
                {loading || updates.revalidating ? <div className="nuiget-installed-progress"><ProgressBar label={loading ? 'Loading updates' : 'Refreshing updates'} data-testid="updates-progress" /></div> : null}
                {sections.map(section => (
                    <Fragment key={section.projectPath}>
                        {section.chunk?.error !== undefined
                            ? <Banner severity="error" data-testid={`updates-error-${markerOf(section)}`} action={{ label: 'Retry', onClick: updates.refreshUpdates }}>{`Updates of ${section.projectName} could not be checked: ${sentence(section.chunk.error)}`}</Banner>
                            : null}
                    </Fragment>
                ))}
                <Listbox
                    items={items}
                    groups={groups}
                    label="Updates"
                    hint={HINT}
                    testId="updates-list"
                    density="comfortable"
                    busy={loading || updates.revalidating}
                    empty={firstLoad ? <Skeleton density="comfortable" /> : undefined}
                    selectedId={current}
                    selectedIds={bulk.selected}
                    onToggleSelected={item => {
                        if (item.kind === 'package') {
                            toggle(item.section, item.update);
                        }
                    }}
                    onSelect={item => {
                        if (item.kind === 'package') {
                            makeCurrent(item.section, item.update);
                        }
                    }}
                    onActivate={item => {
                        if (item.kind === 'package') {
                            updateOne(item.section, item.update);
                        }
                    }}
                    renderRow={(item, placement) => {
                        if (item.kind !== 'package') {
                            return null;
                        }
                        const { section, update } = item;
                        const busy = isPackageBusy(section.projectPath, update.id);
                        const src = packageIconSrc(update.iconUrl ?? updates.icons.get(update.id.toLowerCase()));
                        return (
                            <Row
                                {...placement}
                                vscodeContext={updateRowContext(update, section.projectPath, entryIn(section.installed, update.id), section.installed)}
                                itemId={update.id}
                                name={update.id}
                                version={update.installedVersion}
                                nextVersion={update.latestVersion}
                                authors={update.authors}
                                verified={update.verified}
                                icon={src === undefined ? undefined : <img src={src} alt="" />}
                                busy={busy}
                                // An unsupported project's rows are read-only: muted check, and the row says so (DS-STATE-7).
                                selectable={section.installed?.unsupported === undefined}
                                status={busy ? busyStatus(section.projectPath, update.id) : section.installed?.unsupported ? 'Read-only' : undefined}
                                badges={isCentralIn(section.installed, update.id) ? <Badge label="CPM" title={entryIn(section.installed, update.id)?.declaration === 'central-override' ? 'Centrally managed; this project overrides the version' : 'Centrally managed'} /> : undefined}
                                actions={section.installed?.unsupported ? undefined : (
                                    <IconButton label={`Update ${update.id} to ${update.latestVersion}`} tabIndex={-1} data-testid="row-action-update" onClick={() => updateOne(section, update)}><ArrowUpIcon /></IconButton>
                                )}
                            />
                        );
                    }}
                />
            </>
        );
    }

    return (
        <div className="nuiget-installed nuiget-updates">
            <Toolbar label="Bulk actions" data-testid="updates-toolbar" end={<Button data-testid="update-all-button" disabled={total === 0} title={total === 0 ? 'No update in this list can join a bulk update.' : undefined} onClick={() => setConfirming(true)}>
                {chosenCount > 0 ? `Update selected (${chosenCount})` : `Update all (${candidateTotal})`}
            </Button>}>
                <Button variant="secondary" icon={<CheckAllIcon />} data-testid="select-all-button" aria-pressed={bulk.allSelected} disabled={candidateTotal === 0} title={candidateTotal === 0 ? 'No update in this list can join a bulk update.' : undefined} onClick={bulk.selectAll}>
                    Select all
                </Button>
            </Toolbar>
            {updates.sourcesUnavailable
                ? <Banner severity="warning" data-testid="updates-unavailable-banner" action={{ label: 'Retry', onClick: updates.refreshUpdates }}>Some package sources could not be checked; the lists may be incomplete.</Banner>
                : null}
            {updates.error
                ? <Banner severity="error" data-testid="updates-error" action={{ label: 'Retry', onClick: updates.refreshUpdates }}>{`Updates could not be checked: ${sentence(updates.error.message)}`}</Banner>
                : null}
            {/* The tree is the tab's scroller (D48). */}
            <div className="nuiget-installed-lists">{body}</div>
            <UpdateAllDialog
                open={confirming && total > 0}
                updates={dialogGroups.flatMap(group => group.updates)}
                groups={dialogGroups.map(group => ({ projectName: group.projectName, updates: group.updates }))}
                onConfirm={confirm}
                onCancel={() => setConfirming(false)}
            />
        </div>
    );
}

import { useEffect, useId, useState } from 'react';
import type React from 'react';
import type { InstalledResult, PackageUpdate, ProjectUpdatesChunk } from '../../../../protocol';
import { IN_PROGRESS, isCentral as isCentralRow, whyNotUpdatable } from '../../../shared/installed/rules';
import { ArrowUpIcon, Badge, Banner, EmptyState, IconButton, Listbox, Row, SectionHeader, Skeleton, Toolbar } from '../../../shared/primitives';
import { packageIconSrc } from '../../../shared/packageIcon';
import { useAllProjects } from '../../../shared/store/allProjects';
import { useDetailsActions } from '../../../shared/store/details';
import { useOps, useOpsActions } from '../../../shared/store/ops';
import type { ListView } from '../../MainShell';
import { FolderGroups } from '../../../shared/allProjects/folderGroups';
import { CentralUpdateDialog, type CentralUpdateRequest } from './CentralUpdateDialog';
import { UpdateAllDialog } from './UpdateAllDialog';

const HINT = 'Enter updates the package. Space selects it for Update all.';

interface Section {
    projectPath: string;
    projectName: string;
    workspaceFolder?: string;
    chunk: ProjectUpdatesChunk | undefined;
    installed: InstalledResult | undefined;
}

interface Item {
    id: string;
    update: PackageUpdate;
}

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

interface ProjectUpdatesSectionProps {
    section: Section;
    level: 2 | 3;
    rows: readonly PackageUpdate[];
    loading: boolean;
    sourcesUnavailable: boolean;
    filtered: boolean;
    selected: ReadonlySet<string>;
    currentId: string | null;
    revalidating: boolean;
    onRetry: () => void;
    onToggle: (update: PackageUpdate) => void;
    onCurrent: (update: PackageUpdate) => void;
    onUpdate: (update: PackageUpdate) => void;
}

function ProjectUpdatesSection(props: ProjectUpdatesSectionProps): React.JSX.Element {
    const { section, level, rows, loading, sourcesUnavailable, filtered, selected, currentId, revalidating, onRetry, onToggle, onCurrent, onUpdate } = props;
    const { isPackageBusy, active } = useOps();
    const [expanded, setExpanded] = useState(true);
    // The icons the stream sends after the project chunks; a row's own `iconUrl` comes first.
    const { icons } = useAllProjects().updates;
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const contentId = `${baseId}-content`;
    const unsupported = section.installed?.unsupported;
    const known = section.chunk !== undefined && section.chunk.error === undefined;

    const busyStatus = (packageId: string): string => {
        const id = packageId.toLowerCase();
        for (const progress of active.values()) {
            if (progress.kind !== undefined && progress.projectPaths?.includes(section.projectPath) && progress.packageIds?.some(other => other.toLowerCase() === id)) {
                return IN_PROGRESS[progress.kind];
            }
        }
        return 'In progress';
    };

    let content: React.ReactNode;
    if (section.chunk === undefined) {
        content = loading ? <Skeleton density="comfortable" /> : <EmptyState message="Updates could not be checked." />;
    } else if (section.chunk.error !== undefined) {
        content = <Banner severity="error" action={{ label: 'Retry', onClick: onRetry }}>{`Updates of ${section.projectName} could not be checked: ${section.chunk.error}`}</Banner>;
    } else {
        let empty = 'No updates available.';
        if (sourcesUnavailable && section.chunk.updates.length === 0) {
            empty = 'Updates could not be checked.';
        } else if (filtered && section.chunk.updates.length > 0) {
            empty = 'No update matches the filter.';
        }
        content = (
            <>
                {unsupported ? <Banner severity="warning">{`Unsupported project: ${unsupported.message}`}</Banner> : null}
                <Listbox<Item>
                    items={rows.map(update => ({ id: update.id, update }))}
                    labelledBy={titleId}
                    hint={HINT}
                    testId={`updates-list-${section.projectName.toLowerCase()}`}
                    density="comfortable"
                    busy={revalidating}
                    selectedId={currentId}
                    selectedIds={selected}
                    onToggleSelected={item => onToggle(item.update)}
                    onSelect={item => onCurrent(item.update)}
                    onActivate={item => onUpdate(item.update)}
                    empty={<EmptyState message={empty} />}
                    renderRow={(item, placement) => {
                        const { update } = item;
                        const busy = isPackageBusy(section.projectPath, update.id);
                        const central = isCentralIn(section.installed, update.id);
                        const src = packageIconSrc(update.iconUrl ?? icons.get(update.id.toLowerCase()));
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
                                density="comfortable"
                                busy={busy}
                                status={busy ? busyStatus(update.id) : undefined}
                                badges={central ? <Badge label="CPM" title={entryIn(section.installed, update.id)?.declaration === 'central-override' ? 'Centrally managed; this project overrides the version' : 'Centrally managed'} /> : undefined}
                                actions={unsupported ? undefined : (
                                    <IconButton label={`Update ${update.id} to ${update.latestVersion}`} tabIndex={-1} data-testid="row-action-update" onClick={() => onUpdate(update)}><ArrowUpIcon /></IconButton>
                                )}
                            />
                        );
                    }}
                />
            </>
        );
    }

    return (
        <section className="nuiget-installed-project nuiget-installed-project--grouped">
            <SectionHeader
                title={section.projectName}
                titleId={titleId}
                expanded={expanded}
                onToggle={() => setExpanded(value => !value)}
                contentId={contentId}
                testKey={`updates-${section.projectName.toLowerCase()}`}
                level={level}
                count={known && !sourcesUnavailable ? section.chunk?.updates.length : undefined}
                busy={loading && section.chunk === undefined}
                actions={unsupported ? <Badge label="Unsupported" tone="warning" title={unsupported.message} /> : undefined}
            />
            <div id={contentId} hidden={!expanded} className="nuiget-installed-project-content">{content}</div>
        </section>
    );
}

/**
 * The Updates tab in All Projects (interaction model §3): one section per project under its workspace folder, over the
 * `allProjects/updates` stream. Rows of an unsupported project are read-only, a centrally managed package is updated
 * through the central preview (`CentralUpdateDialog`) and joins no bulk update (N76), a row with a `VersionOverride` updates in its project alone without a preview (N74), and Update all takes the selected rows across projects (or every candidate) as one
 * `ops/bulkUpdateAllProjects`. A source that could not be checked is one banner over every section.
 */
export function AllProjectsUpdates({ filter, announce }: ListView): React.JSX.Element {
    const all = useAllProjects();
    const { updates } = all;
    const { isPackageBusy } = useOps();
    const { run } = useOpsActions();
    const { select } = useDetailsActions();
    const [selected, setSelected] = useState<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
    const [current, setCurrent] = useState<{ projectPath: string; id: string } | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [central, setCentral] = useState<CentralUpdateRequest | null>(null);

    // A new listing starts with nothing selected.
    const listedProjects = updates.projects;
    useEffect(() => setSelected(new Map()), [listedProjects]);

    const projects = updates.projects ?? all.projects ?? [];
    const sections: Section[] = projects.map(project => ({
        projectPath: project.path,
        projectName: updates.chunks.get(project.path)?.projectName ?? project.name,
        workspaceFolder: updates.chunks.get(project.path)?.workspaceFolder ?? project.workspaceFolder,
        chunk: updates.chunks.get(project.path),
        installed: all.chunks.get(project.path)?.result,
    }));
    const needle = filter.trim().toLowerCase();
    // Alphabetical by id, as 1.x listed them (MU9).
    const rowsOf = (section: Section): PackageUpdate[] => (section.chunk?.updates ?? []).filter(update => update.id.toLowerCase().includes(needle)).sort((a, b) => a.id.localeCompare(b.id));
    const candidatesOf = (section: Section): PackageUpdate[] => (section.installed?.unsupported
        ? []
        : rowsOf(section).filter(update => !changesCentralIn(section.installed, update.id) && !isPackageBusy(section.projectPath, update.id)));

    const chosenCount = sections.reduce((count, section) => count + candidatesOf(section).filter(update => selected.get(section.projectPath)?.has(update.id)).length, 0);
    const groups = sections
        .map(section => {
            const candidates = candidatesOf(section);
            const picked = chosenCount > 0 ? candidates.filter(update => selected.get(section.projectPath)?.has(update.id)) : candidates;
            return { section, projectName: section.projectName, updates: picked };
        })
        .filter(group => group.updates.length > 0);
    const total = groups.reduce((count, group) => count + group.updates.length, 0);
    const candidateTotal = sections.reduce((count, section) => count + candidatesOf(section).length, 0);
    const allSelected = candidateTotal > 0 && chosenCount === candidateTotal;

    const updateOne = (section: Section, update: PackageUpdate): void => {
        if (section.installed?.unsupported || isPackageBusy(section.projectPath, update.id)) {
            return;
        }
        const entry = section.installed?.packages.find(other => other.id.toLowerCase() === update.id.toLowerCase());
        const obstacle = entry === undefined || section.installed === undefined ? undefined : whyNotUpdatable(entry, section.installed);
        if (obstacle !== undefined) {
            announce(obstacle);
            return;
        }
        if (entry !== undefined && isCentralRow(entry)) {
            setCentral({ kind: 'update', projectPath: section.projectPath, packageId: update.id, fromVersion: update.installedVersion, toVersion: update.latestVersion, sourceUrl: update.sourceUrl });
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
        setSelected(previous => {
            const next = new Map(previous);
            const set = new Set(next.get(section.projectPath));
            if (!set.delete(update.id)) {
                set.add(update.id);
            }
            next.set(section.projectPath, set);
            return next;
        });
    };

    const selectAll = (): void => {
        setSelected(allSelected ? new Map() : new Map(sections.map(section => [section.projectPath, new Set(candidatesOf(section).map(update => update.id))])));
    };

    const confirm = (): void => {
        setConfirming(false);
        setSelected(new Map());
        if (groups.length === 0) {
            return;
        }
        run('ops/bulkUpdateAllProjects', {
            projectUpdates: groups.map(group => ({
                projectPath: group.section.projectPath,
                projectName: group.projectName,
                packages: group.updates.map(update => ({ id: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl })),
            })),
        }).catch((error: unknown) => {
            announce(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    const loading = updates.status === 'loading' || updates.revalidating;
    let body: React.ReactNode;
    if (sections.length === 0) {
        body = updates.status === 'loading' || updates.status === 'idle' ? <Skeleton density="comfortable" /> : <EmptyState message="No projects to list." />;
    } else {
        body = (
            <FolderGroups
                items={sections}
                render={(section, level) => (
                    <ProjectUpdatesSection
                        key={section.projectPath}
                        section={section}
                        level={level}
                        rows={rowsOf(section)}
                        loading={loading}
                        sourcesUnavailable={updates.sourcesUnavailable}
                        filtered={needle.length > 0}
                        selected={selected.get(section.projectPath) ?? new Set()}
                        currentId={current?.projectPath === section.projectPath ? current.id : null}
                        revalidating={updates.revalidating}
                        onRetry={updates.refreshUpdates}
                        onToggle={update => toggle(section, update)}
                        onCurrent={update => {
                            setCurrent({ projectPath: section.projectPath, id: update.id });
                            select({ packageId: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl, origin: 'updates', projectPath: section.projectPath });
                        }}
                        onUpdate={update => updateOne(section, update)}
                    />
                )}
            />
        );
    }

    return (
        <div className="nuiget-installed nuiget-installed--all nuiget-updates">
            <Toolbar label="Bulk actions">
                <button type="button" className="nuiget-button nuiget-button--secondary" data-testid="select-all-button" aria-pressed={allSelected} disabled={candidateTotal === 0} onClick={selectAll}>
                    Select all
                </button>
                <button type="button" className="nuiget-button" data-testid="update-all-button" disabled={total === 0} onClick={() => setConfirming(true)}>
                    {chosenCount > 0 ? `Update selected (${chosenCount})` : `Update all (${candidateTotal})`}
                </button>
            </Toolbar>
            {updates.sourcesUnavailable
                ? <Banner severity="warning" data-testid="updates-unavailable-banner" action={{ label: 'Retry', onClick: updates.refreshUpdates }}>Some package sources could not be checked; the lists may be incomplete.</Banner>
                : null}
            {updates.error
                ? <Banner severity="error" action={{ label: 'Retry', onClick: updates.refreshUpdates }}>{`Updates could not be checked: ${updates.error.message}`}</Banner>
                : null}
            <div className="nuiget-installed-lists">{body}</div>
            <UpdateAllDialog
                open={confirming && total > 0}
                updates={groups.flatMap(group => group.updates)}
                groups={groups.map(group => ({ projectName: group.projectName, updates: group.updates }))}
                onConfirm={confirm}
                onCancel={() => setConfirming(false)}
            />
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

import { Fragment, useCallback, useId, useMemo, useState } from 'react';
import type React from 'react';
import type { InstalledResult, PackageUpdate, ProjectUpdatesChunk } from '../../protocol';
import { groupByFolder, PROJECT_GROUP, projectGroupIds } from '../shared/allProjects/folderGroups';
import { directCount } from '../shared/counts';
import { updateCandidates } from '../shared/installed/rules';
import { ArrowUpIcon, Banner, cssVars, EmptyState, IconButton, Listbox, ProgressBar, SectionHeader, Skeleton, type ListboxGroups } from '../shared/primitives';
import { useAllProjects } from '../shared/store/allProjects';
import { useInstalled } from '../shared/store/installed';
import { useOps, useOpsActions } from '../shared/store/ops';
import { useSession } from '../shared/store/session';
import { useUpdates } from '../shared/store/updates';
import { sentence } from '../shared/updates/sentence';
import { UpdateAllDialog } from '../shared/updates/UpdateAllDialog';
import { ProjectUpdates } from './ProjectUpdates';
import { useUpdateRows, visibleUpdates } from './updateRows';

export interface UpdatesSectionProps {
    /** Something to say to a screen reader that no outcome of an operation says. */
    announce: (message: string) => void;
    /** The text after `@updates`: only updates whose id contains it are listed. */
    filter?: string;
    /** Whether the section is open; the sidebar keeps it with the view's state. When absent, the section keeps its own. */
    expanded?: boolean;
    onToggle?: () => void;
    /** The section's share of the height while both sections are open, a number of parts, for example `"60"` against `"40"`. */
    share?: string;
}

/** The empty sentence of one project's list. A check that could not be made is its banner alone, never an empty list (UX-P3.10). */
function emptyMessage(total: number, filter: string): string {
    return total > 0 && filter.length > 0 ? `No updates match "${filter}".` : 'No updates available.';
}

type TreeItem =
    | { kind: 'group'; id: string; level: number; title: string; chunk?: ProjectUpdatesChunk }
    | { kind: 'message'; id: string; cell: 'empty' | 'unsupported'; marker: string; text: string }
    | { kind: 'package'; id: string; chunk: ProjectUpdatesChunk; installed: InstalledResult | undefined; update: PackageUpdate };

/** The Updates tree's group ids carry a prefix: under All Projects the Installed tree's are in the same document (UX-P3.7d). */
const UPDATES_PROJECT = `updates-${PROJECT_GROUP}`;

interface AllProjectsUpdatesTreeProps {
    chunks: ProjectUpdatesChunk[];
    installedOf: (projectPath: string) => InstalledResult | undefined;
    filter: string;
    sourcesUnavailable: boolean;
    announce: (message: string) => void;
    revalidating: boolean;
    labelledBy: string;
}

/**
 * All Projects as one compact tree (D48, UX-P3.7d), the twin of the Installed pane's: a folder row per workspace folder when there
 * are several, a project row under it with its count, the project's updates under that; a project without an update to list says
 * why in a message leaf, with the main panel's words. A row updates its own project.
 */
function AllProjectsUpdatesTree({ chunks, installedOf, filter, sourcesUnavailable, announce, revalidating, labelledBy }: AllProjectsUpdatesTreeProps): React.JSX.Element {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const { updateOne, viewDetails, renderUpdateRow } = useUpdateRows(announce);

    const groupIds = useMemo(() => projectGroupIds(chunks), [chunks]);
    const items = useMemo((): TreeItem[] => {
        const list: TreeItem[] = [];
        const project = (chunk: ProjectUpdatesChunk, level: number): void => {
            const id = `updates-${groupIds.get(chunk.projectPath) ?? `${PROJECT_GROUP}${chunk.projectPath.toLowerCase()}`}`;
            const marker = id.slice(UPDATES_PROJECT.length);
            list.push({ kind: 'group', id, level, title: chunk.projectName, chunk });
            // A project whose check failed has its banner above the tree and no leaf.
            if (chunk.error !== undefined || collapsed.has(id)) {
                return;
            }
            const installed = installedOf(chunk.projectPath);
            if (installed?.unsupported !== undefined) {
                list.push({ kind: 'message', id: `${id}\nmessage`, cell: 'unsupported', marker, text: `Unsupported project: ${sentence(installed.unsupported.message)}` });
            } else if (chunk.updates.length === 0 && filter.trim() === '') {
                const text = sourcesUnavailable
                    ? 'Updates could not be checked.'
                    : installed !== undefined && installed.packages.length === 0 ? 'No packages installed.' : 'No updates available.';
                list.push({ kind: 'message', id: `${id}\nmessage`, cell: 'empty', marker, text });
            }
            for (const update of visibleUpdates(chunk.updates, filter)) {
                list.push({ kind: 'package', id: `${chunk.projectPath}\n${update.id}`, chunk, installed, update });
            }
        };
        const folders = groupByFolder(chunks);
        if (folders.length < 2) {
            chunks.forEach(chunk => project(chunk, 1));
            return list;
        }
        for (const [folder, members] of folders) {
            const id = `updates-folder-${folder.toLowerCase()}`;
            list.push({ kind: 'group', id, level: 1, title: folder });
            if (!collapsed.has(id)) {
                members.forEach(chunk => project(chunk, 2));
            }
        }
        return list;
    }, [chunks, collapsed, filter, groupIds, installedOf, sourcesUnavailable]);

    const groups = useMemo((): ListboxGroups<TreeItem> => ({
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
                return <span data-testid={item.cell === 'empty' ? `sidebar-updates-empty-${item.marker}` : `sidebar-updates-unsupported-${item.marker}`}>{item.text}</span>;
            }
            if (item.kind !== 'group') {
                return null;
            }
            const { chunk } = item;
            return (
                <SectionHeader
                    presentation="content"
                    title={item.title}
                    // `section-header-updates-project-<name>`, §8 (the group row's id, spelled out for the hook lint).
                    testKey={chunk !== undefined ? `updates-project-${item.id.slice(UPDATES_PROJECT.length)}` : item.id}
                    expanded={placement.expanded}
                    variant="level"
                    count={chunk !== undefined && chunk.error === undefined && !sourcesUnavailable ? chunk.updates.length : undefined}
                />
            );
        },
    }), [collapsed, sourcesUnavailable]);

    return (
        <Listbox
            items={items}
            groups={groups}
            labelledBy={labelledBy}
            hint="Enter updates to the latest version in the row's project (a centrally managed package: opens the actions menu); Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu."
            testId="sidebar-updates-list"
            density="compact"
            selectedId={selectedId}
            busy={revalidating}
            onSelect={item => setSelectedId(item.id)}
            onActivate={item => {
                if (item.kind === 'package') {
                    updateOne(item.chunk.projectPath, item.installed, item.update);
                }
            }}
            onSecondaryActivate={item => {
                if (item.kind === 'package') {
                    viewDetails(item.update.id, item.update.latestVersion);
                }
            }}
            renderRow={(item, placement) => (item.kind === 'package' ? renderUpdateRow(item.chunk.projectPath, item.installed, item.update, placement) : null)}
        />
    );
}

/**
 * The Updates section of the sidebar: one compact row per update of the selected project (`ProjectUpdates`), or in All
 * Projects one heading and list per project over the `allProjects` slice's updates stream, under a caption per workspace
 * folder when there are several. A row updates its own project. A source that could not be checked is a banner, never
 * "no updates".
 */
export function UpdatesSection({ announce, filter = '', expanded: controlled, onToggle, share }: UpdatesSectionProps): React.JSX.Element {
    const updates = useUpdates();
    const installed = useInstalled();
    const all = useAllProjects();
    const { session } = useSession();
    const [own, setOwn] = useState(true);
    const expanded = controlled ?? own;
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const contentId = `${baseId}-content`;
    const { projectPath, rows } = updates;
    const { isPackageBusy } = useOps();
    const { run } = useOpsActions();
    const [confirming, setConfirming] = useState(false);
    const installedChunks = all.chunks;
    const installedOf = useCallback((path: string) => installedChunks.get(path)?.result, [installedChunks]);

    // The total once the list is settled; the header shows no badge at 0 and `k of N` while a filter is on (DS-COPY-5, SB13; UX-P3.7b).
    let count: number | undefined;
    let shown = 0;
    const needle = filter.trim().toLowerCase();
    const shownOf = (list: ReadonlyArray<{ id: string }>): number => list.filter(entry => entry.id.toLowerCase().includes(needle)).length;
    let busy = updates.status === 'loading' || updates.revalidating;
    let content: React.ReactNode;
    // What Update all takes, per project (one group outside All Projects).
    let groups: Array<{ projectPath: string; projectName: string; updates: PackageUpdate[] }> = [];
    if (all.active) {
        const stream = all.updates;
        busy = stream.status === 'loading' || stream.revalidating;
        const chunks = (stream.projects ?? []).map(project => stream.chunks.get(project.path)).filter((chunk): chunk is ProjectUpdatesChunk => chunk !== undefined);
        const projectGroups = projectGroupIds(chunks);
        groups = chunks
            .filter(chunk => chunk.error === undefined)
            .map(chunk => ({ projectPath: chunk.projectPath, projectName: chunk.projectName, updates: updateCandidates(visibleUpdates(chunk.updates, filter), installedOf(chunk.projectPath), id => isPackageBusy(chunk.projectPath, id)) }))
            .filter(group => group.updates.length > 0);
        if (stream.status === 'ready' && !stream.sourcesUnavailable && chunks.every(chunk => chunk.error === undefined)) {
            count = chunks.reduce((sum, chunk) => sum + chunk.updates.length, 0);
            shown = chunks.reduce((sum, chunk) => sum + shownOf(chunk.updates), 0);
        }
        content = (
            <>
                {stream.sourcesUnavailable
                    ? <Banner severity="warning" data-testid="sidebar-updates-unavailable" action={{ label: 'Retry', onClick: stream.refreshUpdates }}>Some package sources could not be checked.</Banner>
                    : null}
                {stream.error ? <Banner severity="error" data-testid="sidebar-updates-error" action={{ label: 'Retry', onClick: stream.refreshUpdates }}>{`Updates could not be checked: ${sentence(stream.error.message)}`}</Banner> : null}
                {chunks.filter(chunk => chunk.error !== undefined).map(chunk => (
                    <Fragment key={chunk.projectPath}>
                        <Banner severity="error" data-testid={`sidebar-updates-error-${(projectGroups.get(chunk.projectPath) ?? `${PROJECT_GROUP}${chunk.projectPath.toLowerCase()}`).slice(PROJECT_GROUP.length)}`} action={{ label: 'Retry', onClick: stream.refreshUpdates }}>{`Updates of ${chunk.projectName} could not be checked: ${sentence(chunk.error ?? 'unknown error')}`}</Banner>
                    </Fragment>
                ))}
                {chunks.length === 0
                    ? (stream.status !== 'error' ? <Skeleton density="compact" /> : null)
                    : <AllProjectsUpdatesTree chunks={chunks} installedOf={installedOf} filter={filter} sourcesUnavailable={stream.sourcesUnavailable} announce={announce} revalidating={stream.revalidating} labelledBy={titleId} />}
            </>
        );
    } else if (projectPath === null) {
        content = session === undefined
            ? <Skeleton density="compact" />
            : <EmptyState data-testid="sidebar-updates-empty" message="No .NET projects found in this workspace." />;
    } else if (rows.length === 0 && updates.status === 'loading') {
        content = <Skeleton density="compact" />;
    } else {
        if (updates.status === 'ready' && !updates.sourcesUnavailable) {
            count = rows.length;
            shown = shownOf(rows);
        }
        const single = updateCandidates(visibleUpdates(rows, filter), installed.result, id => isPackageBusy(projectPath, id));
        groups = single.length > 0 ? [{ projectPath, projectName: '', updates: single }] : [];
        // A check that could not be made, or failed, with nothing to list: its banner is the one message (UX-P3.10 follow-up 1, F1).
        const bannerAlone = rows.length === 0 && (updates.sourcesUnavailable || updates.error !== undefined);
        const unsupported = installed.result?.unsupported;
        content = (
            <>
                {unsupported !== undefined
                    ? <Banner severity="warning" data-testid="sidebar-updates-unsupported">{`Unsupported project: ${sentence(unsupported.message)}`}</Banner>
                    : null}
                {updates.sourcesUnavailable
                    ? <Banner severity="warning" data-testid="sidebar-updates-unavailable" action={{ label: 'Retry', onClick: updates.refresh }}>Some package sources could not be checked.</Banner>
                    : null}
                {updates.error
                    ? <Banner severity="error" data-testid="sidebar-updates-error" action={{ label: 'Retry', onClick: updates.refresh }}>{`Updates could not be checked: ${sentence(updates.error.message)}`}</Banner>
                    : null}
                {bannerAlone ? null : <ProjectUpdates
                    projectPath={projectPath}
                    rows={rows}
                    installed={installed.result}
                    filter={filter}
                    announce={announce}
                    labelledBy={titleId}
                    testId="sidebar-updates-list"
                    busy={updates.revalidating}
                    empty={emptyMessage(rows.length, filter.trim())}
                    selectedId={selectedId}
                    onSelectedChange={setSelectedId}
                />}
            </>
        );
    }

    const candidates = groups.flatMap(group => group.updates);
    // The pane loads or revalidates: its 2 px bar over the list's top edge, as the Installed pane's (DS-STATE-2, UX-P3.10).
    const loadingFirst = all.active ? all.updates.status === 'loading' : updates.status === 'loading';
    const confirm = (): void => {
        setConfirming(false);
        const failed = (error: unknown): void => announce(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
        if (all.active) {
            run('ops/bulkUpdateAllProjects', {
                projectUpdates: groups.map(group => ({
                    projectPath: group.projectPath,
                    projectName: group.projectName,
                    packages: group.updates.map(update => ({ id: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl })),
                })),
            }).catch(failed);
        } else if (groups.length === 1) {
            run('ops/bulkUpdate', { projectPath: groups[0].projectPath, packages: groups[0].updates.map(update => ({ id: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl })) }).catch(failed);
        }
    };

    return (
        <section className={share ? 'nuiget-sidebar-section nuiget-sidebar-section--shared' : 'nuiget-sidebar-section'} style={share ? cssVars({ '--nuiget-sidebar-share': share }) : undefined}>
            <SectionHeader
                title="Updates"
                titleId={titleId}
                contentId={contentId}
                testKey="updates"
                variant="pane"
                expanded={expanded}
                onToggle={onToggle ?? (() => setOwn(previous => !previous))}
                count={count === undefined ? undefined : needle !== '' ? directCount(count, shown, true) : count > 0 ? count : undefined}
                busy={busy}
                actions={count !== undefined && count > 0 && (all.active || installed.result?.unsupported === undefined) ? (
                    <IconButton label={`Update all (${candidates.length})`} data-testid="sidebar-update-all-button" disabled={candidates.length === 0} onClick={() => setConfirming(true)}>
                        <ArrowUpIcon />
                    </IconButton>
                ) : undefined}
            />
            {expanded ? (
                <div className="nuiget-sidebar-section-content" id={contentId}>
                    {busy ? <div className="nuiget-sidebar-progress"><ProgressBar label={loadingFirst ? 'Loading updates' : 'Refreshing updates'} data-testid="sidebar-updates-progress" /></div> : null}
                    {content}
                </div>
            ) : null}
            <UpdateAllDialog
                open={confirming && candidates.length > 0}
                updates={candidates}
                groups={all.active ? groups.map(group => ({ projectName: group.projectName, updates: group.updates })) : undefined}
                onConfirm={confirm}
                onCancel={() => setConfirming(false)}
            />
        </section>
    );
}

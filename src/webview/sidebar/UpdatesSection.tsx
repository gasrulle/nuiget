import { useId, useState } from 'react';
import type React from 'react';
import type { InstalledResult, PackageUpdate, ProjectUpdatesChunk } from '../../protocol';
import { groupByFolder } from '../shared/allProjects/folderGroups';
import { isCentral, whyNotUpdatable } from '../shared/installed/rules';
import { ArrowUpIcon, Banner, ConfirmDialog, cssVars, EmptyState, IconButton, SectionHeader, Skeleton } from '../shared/primitives';
import { useAllProjects } from '../shared/store/allProjects';
import { useInstalled } from '../shared/store/installed';
import { useOps, useOpsActions } from '../shared/store/ops';
import { useSession } from '../shared/store/session';
import { useUpdates } from '../shared/store/updates';
import { ProjectUpdates } from './ProjectUpdates';

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

function emptyMessage(sourcesUnavailable: boolean, total: number, filter: string): string {
    if (sourcesUnavailable && total === 0) {
        return 'Updates could not be checked.';
    }
    return total > 0 && filter.length > 0 ? `No updates match "${filter}".` : 'No updates available.';
}

/**
 * The updates of a shown list that Update all takes: the package is installed there, can be updated (a supported,
 * resolved reference), is not set centrally (a `central` row goes through its preview, N76; a `central-override` row
 * joins, N74) and is not busy.
 */
function updateCandidates(updates: readonly PackageUpdate[], installed: InstalledResult | undefined, filter: string, isBusy: (id: string) => boolean): PackageUpdate[] {
    if (installed === undefined) {
        return [];
    }
    const needle = filter.trim().toLowerCase();
    return updates
        .filter(update => update.id.toLowerCase().includes(needle))
        .filter(update => {
            const entry = installed.packages.find(candidate => candidate.id.toLowerCase() === update.id.toLowerCase());
            return entry !== undefined && whyNotUpdatable(entry, installed) === undefined && !isCentral(entry) && !isBusy(update.id);
        })
        .sort((a, b) => a.id.localeCompare(b.id));
}

const updateLine = (update: PackageUpdate): string => `${update.id}: ${update.installedVersion} → ${update.latestVersion}`;

interface ProjectSectionProps {
    chunk: ProjectUpdatesChunk;
    installed: InstalledResult | undefined;
    filter: string;
    sourcesUnavailable: boolean;
    announce: (message: string) => void;
    revalidating: boolean;
    onRetry: () => void;
}

/** One project of All Projects: its heading and its updates, or its error with Retry. */
function ProjectSection({ chunk, installed, filter, sourcesUnavailable, announce, revalidating, onRetry }: ProjectSectionProps): React.JSX.Element {
    const [expanded, setExpanded] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const contentId = `${baseId}-content`;
    const name = chunk.projectName.toLowerCase();
    const content = chunk.error !== undefined
        ? <Banner severity="error" action={{ label: 'Retry', onClick: onRetry }}>{`Updates of ${chunk.projectName} could not be checked: ${chunk.error}`}</Banner>
        : (
            <ProjectUpdates
                projectPath={chunk.projectPath}
                rows={chunk.updates}
                installed={installed}
                filter={filter}
                announce={announce}
                labelledBy={titleId}
                testId={`sidebar-updates-list-${name}`}
                busy={revalidating}
                empty={emptyMessage(sourcesUnavailable, chunk.updates.length, filter.trim())}
                selectedId={selectedId}
                onSelectedChange={setSelectedId}
            />
        );
    return (
        <div className="nuiget-sidebar-project">
            <SectionHeader
                title={chunk.projectName}
                titleId={titleId}
                contentId={contentId}
                testKey={`updates-${name}`}
                tooltip={chunk.projectPath}
                level={3}
                expanded={expanded}
                onToggle={() => setExpanded(previous => !previous)}
                count={chunk.error === undefined && !sourcesUnavailable ? chunk.updates.length : undefined}
            />
            {expanded ? <div id={contentId}>{content}</div> : null}
        </div>
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

    let count: number | undefined;
    let busy = updates.status === 'loading' || updates.revalidating;
    let content: React.ReactNode;
    // What Update all takes, per project (one group outside All Projects).
    let groups: Array<{ projectPath: string; projectName: string; updates: PackageUpdate[] }> = [];
    if (all.active) {
        const stream = all.updates;
        busy = stream.status === 'loading' || stream.revalidating;
        const chunks = (stream.projects ?? []).map(project => stream.chunks.get(project.path)).filter((chunk): chunk is ProjectUpdatesChunk => chunk !== undefined);
        groups = chunks
            .filter(chunk => chunk.error === undefined)
            .map(chunk => ({ projectPath: chunk.projectPath, projectName: chunk.projectName, updates: updateCandidates(chunk.updates, all.chunks.get(chunk.projectPath)?.result, filter, id => isPackageBusy(chunk.projectPath, id)) }))
            .filter(group => group.updates.length > 0);
        if (stream.status === 'ready' && !stream.sourcesUnavailable && chunks.every(chunk => chunk.error === undefined)) {
            count = chunks.reduce((sum, chunk) => sum + chunk.updates.length, 0);
        }
        const render = (chunk: ProjectUpdatesChunk) => (
            <ProjectSection key={chunk.projectPath} chunk={chunk} installed={all.chunks.get(chunk.projectPath)?.result} filter={filter} sourcesUnavailable={stream.sourcesUnavailable} announce={announce} revalidating={stream.revalidating} onRetry={stream.refreshUpdates} />
        );
        const folders = groupByFolder(chunks);
        content = (
            <>
                {stream.sourcesUnavailable
                    ? <Banner severity="warning" data-testid="sidebar-updates-unavailable" action={{ label: 'Retry', onClick: stream.refreshUpdates }}>Some package sources could not be checked.</Banner>
                    : null}
                {stream.error ? <Banner severity="error" action={{ label: 'Retry', onClick: stream.refreshUpdates }}>{`Updates could not be checked: ${stream.error.message}`}</Banner> : null}
                {chunks.length === 0 && stream.status !== 'error' ? <Skeleton density="compact" /> : null}
                {folders.length > 1
                    ? folders.map(([folder, members]) => (
                        <div key={folder} className="nuiget-sidebar-folder">
                            <p className="nuiget-sidebar-folder-caption">{folder}</p>
                            {members.map(render)}
                        </div>
                    ))
                    : chunks.map(render)}
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
        }
        const single = updateCandidates(rows, installed.result, filter, id => isPackageBusy(projectPath, id));
        groups = single.length > 0 ? [{ projectPath, projectName: '', updates: single }] : [];
        content = (
            <>
                {updates.sourcesUnavailable
                    ? <Banner severity="warning" data-testid="sidebar-updates-unavailable" action={{ label: 'Retry', onClick: updates.refresh }}>Some package sources could not be checked.</Banner>
                    : null}
                {updates.error
                    ? <Banner severity="error" action={{ label: 'Retry', onClick: updates.refresh }}>{`Updates could not be checked: ${updates.error.message}`}</Banner>
                    : null}
                <ProjectUpdates
                    projectPath={projectPath}
                    rows={rows}
                    installed={installed.result}
                    filter={filter}
                    announce={announce}
                    labelledBy={titleId}
                    testId="sidebar-updates-list"
                    busy={updates.revalidating}
                    empty={emptyMessage(updates.sourcesUnavailable, rows.length, filter.trim())}
                    selectedId={selectedId}
                    onSelectedChange={setSelectedId}
                />
            </>
        );
    }

    const candidates = groups.flatMap(group => group.updates);
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
                count={count}
                busy={busy}
                actions={count !== undefined && count > 0 && (all.active || installed.result?.unsupported === undefined) ? (
                    <IconButton label={`Update all (${candidates.length})`} data-testid="sidebar-update-all-button" disabled={candidates.length === 0} onClick={() => setConfirming(true)}>
                        <ArrowUpIcon />
                    </IconButton>
                ) : undefined}
            />
            {expanded ? <div className="nuiget-sidebar-section-content" id={contentId}>{content}</div> : null}
            <ConfirmDialog
                open={confirming && candidates.length > 0}
                title={candidates.length === 1 ? 'Update 1 package?' : `Update ${candidates.length} packages?`}
                confirmLabel="Update"
                onCancel={() => setConfirming(false)}
                onConfirm={confirm}
            >
                {all.active ? groups.map(group => (
                    <div key={group.projectPath}>
                        <p className="nuiget-sidebar-bulk-lead">{`In ${group.projectName}:`}</p>
                        <ul className="nuiget-sidebar-bulk-list">
                            {group.updates.map(update => <li key={update.id}>{updateLine(update)}</li>)}
                        </ul>
                    </div>
                )) : (
                    <ul className="nuiget-sidebar-bulk-list">
                        {candidates.map(update => <li key={update.id}>{updateLine(update)}</li>)}
                    </ul>
                )}
            </ConfirmDialog>
        </section>
    );
}

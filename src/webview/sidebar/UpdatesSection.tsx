import { useId, useState } from 'react';
import type React from 'react';
import type { InstalledResult, ProjectUpdatesChunk } from '../../protocol';
import { groupByFolder } from '../shared/allProjects/folderGroups';
import { Banner, cssVars, EmptyState, SectionHeader, Skeleton } from '../shared/primitives';
import { useAllProjects } from '../shared/store/allProjects';
import { useInstalled } from '../shared/store/installed';
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

    let count: number | undefined;
    let busy = updates.status === 'loading' || updates.revalidating;
    let content: React.ReactNode;
    if (all.active) {
        const stream = all.updates;
        busy = stream.status === 'loading' || stream.revalidating;
        const chunks = (stream.projects ?? []).map(project => stream.chunks.get(project.path)).filter((chunk): chunk is ProjectUpdatesChunk => chunk !== undefined);
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

    return (
        <section className={share ? 'nuiget-sidebar-section nuiget-sidebar-section--shared' : 'nuiget-sidebar-section'} style={share ? cssVars({ '--nuiget-sidebar-share': share }) : undefined}>
            <SectionHeader
                title="Updates"
                titleId={titleId}
                contentId={contentId}
                testKey="updates"
                expanded={expanded}
                onToggle={onToggle ?? (() => setOwn(previous => !previous))}
                count={count}
                busy={busy}
            />
            {expanded ? <div className="nuiget-sidebar-section-content" id={contentId}>{content}</div> : null}
        </section>
    );
}

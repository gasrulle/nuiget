import { useId, useState } from 'react';
import type React from 'react';
import type { ProjectInstalledChunk } from '../../protocol';
import { groupByFolder } from '../shared/allProjects/folderGroups';
import { Badge, Banner, cssVars, EmptyState, SectionHeader, Skeleton } from '../shared/primitives';
import { useAllProjects } from '../shared/store/allProjects';
import { useInstalled } from '../shared/store/installed';
import { useSession } from '../shared/store/session';
import { ProjectPackages } from './ProjectPackages';

export { shownVersion, whyNotRemovable } from '../shared/installed/rules';

export interface InstalledSectionProps {
    /** Shows the packages whose id contains this text, whatever the case. */
    filter: string;
    /** Something to say to a screen reader that no outcome of an operation says. */
    announce: (message: string) => void;
    /** Whether the section is open; the sidebar keeps it with the view's state. When absent, the section keeps its own. */
    expanded?: boolean;
    onToggle?: () => void;
    /** The section's share of the height while both sections are open, a number of parts, for example `"40"` against `"60"`. */
    share?: string;
}

interface ProjectSectionProps {
    chunk: ProjectInstalledChunk;
    filter: string;
    announce: (message: string) => void;
    revalidating: boolean;
    onRetry: () => void;
}

/** One project of All Projects: its heading, then its list, an unsupported banner (read-only rows) or its error. */
function ProjectSection({ chunk, filter, announce, revalidating, onRetry }: ProjectSectionProps): React.JSX.Element {
    const [expanded, setExpanded] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const contentId = `${baseId}-content`;
    const name = chunk.projectName.toLowerCase();
    const { result } = chunk;
    let content: React.ReactNode;
    if (result === undefined) {
        content = <Banner severity="error" action={{ label: 'Retry', onClick: onRetry }}>{`Installed packages of ${chunk.projectName} could not be loaded: ${chunk.error ?? 'unknown error'}`}</Banner>;
    } else {
        content = (
            <>
                {result.unsupported ? <Banner severity="warning">{`Unsupported project: ${result.unsupported.message}`}</Banner> : null}
                {result.unsupported === undefined || result.packages.length > 0
                    ? <ProjectPackages projectPath={chunk.projectPath} result={result} filter={filter} announce={announce} labelledBy={titleId} testId={`sidebar-installed-list-${name}`} busy={revalidating} selectedId={selectedId} onSelectedChange={setSelectedId} />
                    : null}
            </>
        );
    }
    return (
        <div className="nuiget-sidebar-project">
            <SectionHeader
                title={chunk.projectName}
                titleId={titleId}
                contentId={contentId}
                testKey={`project-${name}`}
                level={3}
                expanded={expanded}
                onToggle={() => setExpanded(previous => !previous)}
                count={result === undefined || (result.unsupported !== undefined && result.packages.length === 0) ? undefined : result.packages.length}
            />
            {expanded ? <div id={contentId}>{content}</div> : null}
        </div>
    );
}

/**
 * The Installed section of the sidebar: the packages of the selected project, one row each (`ProjectPackages`), or in
 * All Projects one heading and list per project over the `allProjects` slice, under a caption per workspace folder when
 * there are several. A row acts on its own project. The list is asked for again by the store when the host says it
 * changed, with the rows left in place meanwhile.
 */
export function InstalledSection({ filter, announce, expanded: controlled, onToggle, share }: InstalledSectionProps): React.JSX.Element {
    const installed = useInstalled();
    const all = useAllProjects();
    const { session } = useSession();
    const [own, setOwn] = useState(true);
    const expanded = controlled ?? own;
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const contentId = `${baseId}-content`;
    const { projectPath, result } = installed;

    let count: number | undefined;
    let content: React.ReactNode;
    if (all.active) {
        const chunks = (all.projects ?? []).map(project => all.chunks.get(project.path)).filter((chunk): chunk is ProjectInstalledChunk => chunk !== undefined);
        count = chunks.reduce((sum, chunk) => sum + (chunk.result?.packages.length ?? 0), 0);
        if (chunks.length === 0) {
            content = all.status === 'error'
                ? <Banner severity="error" action={{ label: 'Retry', onClick: all.refresh }}>{`The projects could not be listed: ${all.error?.message ?? 'unknown error'}`}</Banner>
                : <Skeleton density="compact" />;
        } else {
            const folders = groupByFolder(chunks);
            const render = (chunk: ProjectInstalledChunk) => <ProjectSection key={chunk.projectPath} chunk={chunk} filter={filter} announce={announce} revalidating={all.revalidating} onRetry={all.refresh} />;
            content = folders.length > 1
                ? folders.map(([folder, members]) => (
                    <div key={folder} className="nuiget-sidebar-folder">
                        <p className="nuiget-sidebar-folder-caption">{folder}</p>
                        {members.map(render)}
                    </div>
                ))
                : chunks.map(render);
        }
    } else if (projectPath === null) {
        content = session === undefined
            ? <Skeleton density="compact" />
            : <EmptyState data-testid="sidebar-installed-empty" message="No .NET projects found in this workspace." />;
    } else if (result === undefined) {
        // An error is shown by the banner above the section; there is nothing to list.
        content = installed.status === 'error' ? null : <Skeleton density="compact" />;
    } else {
        count = result.packages.length;
        content = <ProjectPackages projectPath={projectPath} result={result} filter={filter} announce={announce} labelledBy={titleId} testId="sidebar-installed-list" busy={installed.revalidating} selectedId={selectedId} onSelectedChange={setSelectedId} />;
    }

    return (
        <section className={share ? 'nuiget-sidebar-section nuiget-sidebar-section--shared' : 'nuiget-sidebar-section'} style={share ? cssVars({ '--nuiget-sidebar-share': share }) : undefined}>
            <SectionHeader
                title="Installed"
                titleId={titleId}
                contentId={contentId}
                testKey="installed"
                expanded={expanded}
                onToggle={onToggle ?? (() => setOwn(previous => !previous))}
                count={count}
                busy={all.active ? all.status === 'loading' || all.revalidating : installed.status === 'loading' || installed.revalidating}
                actions={!all.active && result?.fidelity === 'provisional'
                    ? <span className="nuiget-sidebar-fidelity" title="Versions come from the project files; a full evaluation is pending." data-testid="sidebar-installed-provisional"><Badge label="provisional" tone="info" /></span>
                    : undefined}
            />
            {expanded ? <div className="nuiget-sidebar-section-content" id={contentId}>{content}</div> : null}
        </section>
    );
}

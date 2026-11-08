import { Fragment, useId, useMemo, useState } from 'react';
import type React from 'react';
import type { InstalledPackage, InstalledResult, ProjectInstalledChunk } from '../../protocol';
import { groupByFolder, PROJECT_GROUP, projectGroupIds } from '../shared/allProjects/folderGroups';
import { directCount } from '../shared/counts';
import { Badge, Banner, cssVars, EmptyState, Listbox, SectionHeader, Skeleton, type ListboxGroups } from '../shared/primitives';
import { useAllProjects } from '../shared/store/allProjects';
import { useInstalled } from '../shared/store/installed';
import { useSession } from '../shared/store/session';
import { usePackageRows, visiblePackages } from './packageRows';
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

type TreeItem =
    | { kind: 'group'; id: string; level: number; title: string; chunk?: ProjectInstalledChunk }
    | { kind: 'message'; id: string; cell: 'empty' | 'unsupported'; marker: string; text: string }
    | { kind: 'package'; id: string; chunk: ProjectInstalledChunk; result: InstalledResult; entry: InstalledPackage };

interface AllProjectsTreeProps {
    chunks: ProjectInstalledChunk[];
    filter: string;
    announce: (message: string) => void;
    revalidating: boolean;
    labelledBy: string;
    onRetry: () => void;
}

/**
 * All Projects as one compact tree (D48, UX-P3.7c): a folder row per workspace folder when there are several, a project row under
 * it, the project's packages under that; an empty or unsupported project says so in a message leaf. A row acts on its own project.
 */
function AllProjectsTree({ chunks, filter, announce, revalidating, labelledBy, onRetry }: AllProjectsTreeProps): React.JSX.Element {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const { uninstall, viewDetails, renderPackageRow } = usePackageRows(announce);

    // Unique though a project's name is not (two App.csproj in two folders), as the main panel's tree (UX-P3.7c).
    const groupIds = useMemo(() => projectGroupIds(chunks), [chunks]);
    const items = useMemo((): TreeItem[] => {
        const list: TreeItem[] = [];
        const project = (chunk: ProjectInstalledChunk, level: number): void => {
            const id = groupIds.get(chunk.projectPath) ?? `${PROJECT_GROUP}${chunk.projectPath.toLowerCase()}`;
            const marker = id.slice(PROJECT_GROUP.length);
            list.push({ kind: 'group', id, level, title: chunk.projectName, chunk });
            const { result } = chunk;
            if (result === undefined || collapsed.has(id)) {
                return;
            }
            if (result.unsupported !== undefined) {
                list.push({ kind: 'message', id: `${id}\nmessage`, cell: 'unsupported', marker, text: `Unsupported project: ${result.unsupported.message}` });
            } else if (result.packages.length === 0 && filter.trim() === '') {
                list.push({ kind: 'message', id: `${id}\nmessage`, cell: 'empty', marker, text: 'No packages installed.' });
            }
            for (const entry of visiblePackages(result, filter)) {
                list.push({ kind: 'package', id: `${chunk.projectPath}\n${entry.id}`, chunk, result, entry });
            }
        };
        const folders = groupByFolder(chunks);
        if (folders.length < 2) {
            chunks.forEach(chunk => project(chunk, 1));
            return list;
        }
        for (const [folder, members] of folders) {
            const id = `folder-${folder.toLowerCase()}`;
            list.push({ kind: 'group', id, level: 1, title: folder });
            if (!collapsed.has(id)) {
                members.forEach(chunk => project(chunk, 2));
            }
        }
        return list;
    }, [chunks, collapsed, filter, groupIds]);

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
                return <span data-testid={item.cell === 'empty' ? `sidebar-installed-empty-${item.marker}` : `sidebar-installed-unsupported-${item.marker}`}>{item.text}</span>;
            }
            if (item.kind !== 'group') {
                return null;
            }
            const result = item.chunk?.result;
            const name = item.id.slice(PROJECT_GROUP.length);
            return (
                <SectionHeader
                    presentation="content"
                    title={item.title}
                    // `section-header-project-<name>`, §8 (the same id as the group row's, spelled out for the hook lint).
                    testKey={item.chunk !== undefined ? `project-${name}` : item.id}
                    expanded={placement.expanded}
                    variant="level"
                    count={result === undefined || (result.unsupported !== undefined && result.packages.length === 0) ? undefined : result.packages.length}
                    // SB10 (UX-P3.7b): a provisional project says so under All Projects too (interaction model §4).
                    badges={result?.fidelity === 'provisional'
                        ? <span className="nuiget-sidebar-fidelity" title="Versions come from the project files; a full evaluation is pending." data-testid={`sidebar-installed-provisional-${name}`}><Badge label="provisional" tone="info" /></span>
                        : undefined}
                />
            );
        },
    }), [collapsed]);

    const act = (item: TreeItem): void => {
        if (item.kind === 'package') {
            uninstall(item.chunk.projectPath, item.result, item.entry);
        }
    };
    return (
        <>
            {chunks.filter(chunk => chunk.result === undefined).map(chunk => (
                <Fragment key={chunk.projectPath}>
                    <Banner severity="error" data-testid={`sidebar-installed-error-${chunk.projectName.toLowerCase()}`} action={{ label: 'Retry', onClick: onRetry }}>{`Installed packages of ${chunk.projectName} could not be loaded: ${chunk.error ?? 'unknown error'}`}</Banner>
                </Fragment>
            ))}
            <Listbox
                items={items}
                groups={groups}
                labelledBy={labelledBy}
                hint="Enter or Delete uninstalls from the row's project; Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu."
                testId="sidebar-installed-list"
                density="compact"
                selectedId={selectedId}
                busy={revalidating}
                onSelect={item => setSelectedId(item.id)}
                onActivate={act}
                onDelete={act}
                onSecondaryActivate={item => {
                    if (item.kind === 'package') {
                        viewDetails(item.entry.id, item.entry.resolvedVersion ?? item.entry.version);
                    }
                }}
                isDisabled={item => item.kind === 'package' && item.entry.declaration === 'unresolved'}
                renderRow={(item, placement) => (item.kind === 'package' ? renderPackageRow(item.chunk.projectPath, item.result, item.entry, placement) : null)}
            />
        </>
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

    // The header's count (DS-COPY-5, SB13; UX-P3.7b): the total, no badge at 0, `k of N` while a filter is on, "0 of N" included.
    const needle = filter.trim().toLowerCase();
    const shownOf = (packages: ReadonlyArray<{ id: string }>): number => packages.filter(entry => entry.id.toLowerCase().includes(needle)).length;
    const headerCount = (total: number, shown: number): number | string | undefined => (needle !== '' ? directCount(total, shown, true) : total > 0 ? total : undefined);
    let count: number | string | undefined;
    let content: React.ReactNode;
    if (all.active) {
        const chunks = (all.projects ?? []).map(project => all.chunks.get(project.path)).filter((chunk): chunk is ProjectInstalledChunk => chunk !== undefined);
        // Only a settled stream counts: no partial total beside the spinner (SB13).
        count = all.status !== 'ready' ? undefined : headerCount(
            chunks.reduce((sum, chunk) => sum + (chunk.result?.packages.length ?? 0), 0),
            chunks.reduce((sum, chunk) => sum + shownOf(chunk.result?.packages ?? []), 0),
        );
        if (chunks.length === 0) {
            content = all.status === 'error'
                ? <Banner severity="error" action={{ label: 'Retry', onClick: all.refresh }}>{`The projects could not be listed: ${all.error?.message ?? 'unknown error'}`}</Banner>
                : <Skeleton density="compact" />;
        } else {
            content = <AllProjectsTree chunks={chunks} filter={filter} announce={announce} revalidating={all.revalidating} labelledBy={titleId} onRetry={all.refresh} />;
        }
    } else if (projectPath === null) {
        content = session === undefined
            ? <Skeleton density="compact" />
            : <EmptyState data-testid="sidebar-installed-empty" message="No .NET projects found in this workspace." />;
    } else if (result === undefined) {
        // An error is shown by the banner above the section; there is nothing to list.
        content = installed.status === 'error' ? null : <Skeleton density="compact" />;
    } else {
        count = headerCount(result.packages.length, shownOf(result.packages));
        content = <ProjectPackages projectPath={projectPath} result={result} filter={filter} announce={announce} labelledBy={titleId} testId="sidebar-installed-list" busy={installed.revalidating} selectedId={selectedId} onSelectedChange={setSelectedId} />;
    }

    return (
        <section className={share ? 'nuiget-sidebar-section nuiget-sidebar-section--shared' : 'nuiget-sidebar-section'} style={share ? cssVars({ '--nuiget-sidebar-share': share }) : undefined}>
            <SectionHeader
                title="Installed"
                titleId={titleId}
                contentId={contentId}
                testKey="installed"
                variant="pane"
                expanded={expanded}
                onToggle={onToggle ?? (() => setOwn(previous => !previous))}
                count={count}
                busy={all.active ? all.status === 'loading' || all.revalidating : installed.status === 'loading' || installed.revalidating}
                badges={!all.active && result?.fidelity === 'provisional'
                    ? <span className="nuiget-sidebar-fidelity" title="Versions come from the project files; a full evaluation is pending." data-testid="sidebar-installed-provisional"><Badge label="provisional" tone="info" /></span>
                    : undefined}
            />
            {expanded ? <div className="nuiget-sidebar-section-content" id={contentId}>{content}</div> : null}
        </section>
    );
}

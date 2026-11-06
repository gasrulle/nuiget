import { Fragment, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, type InstalledPackage, type InstalledResult, type PackageMetadataLite } from '../../../../protocol';
import { whyNotRemovable } from '../../../shared/installed/rules';
import { Banner, Button, CheckAllIcon, EmptyState, Listbox, ProgressBar, SectionHeader, Skeleton, Toolbar, type ListboxGroups } from '../../../shared/primitives';
import { useBulkSelection } from '../../../shared/selection/useBulkSelection';
import { useAllProjects } from '../../../shared/store/allProjects';
import { useDetails, useDetailsActions } from '../../../shared/store/details';
import { useInstalled } from '../../../shared/store/installed';
import { useOps, useOpsActions } from '../../../shared/store/ops';
import { useProjects } from '../../../shared/store/projects';
import { useSession } from '../../../shared/store/session';
import { metadataKey, useTransitive } from '../../../shared/store/transitive';
import type { ListView } from '../../MainShell';
import { groupByFolder, PROJECT_GROUP, projectGroupIds } from '../../../shared/allProjects/folderGroups';
import { BulkUninstallDialog, type Removal } from './BulkUninstallDialog';
import { directCount, InstalledRow, statusBadges, visibleRows } from './InstalledProjectSection';
import { parseRowId, rowId, type Section, type TreeItem } from './installedTree';
import { transitiveGroupContent, transitiveRow, transitiveTree } from './TransitiveSection';
import { allProjectsTransitiveGroupContent, allProjectsTransitiveTree } from './AllProjectsTransitiveSection';

const NO_METADATA: ReadonlyMap<string, PackageMetadataLite> = new Map();
const NOT_COLLAPSED: ReadonlySet<string> = new Set();

const HINT = 'Space selects the package for a bulk action. Enter shows its details. Delete uninstalls it. Shift+F10 opens the actions menu. On a group row, Enter, Left and Right expand and collapse it.';

const nameOf = (projectPath: string): string => projectPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? projectPath;

/** A reason from the host as the end of a sentence with one full stop (DS-COPY-3). */
const sentence = (text: string): string => `${text.replace(/\.+$/, '')}.`;

/**
 * The Installed tab of the main panel: one tree (D48), the tab's scroller, of the selected project's packages under its
 * group row, or under a group row per project in All Projects, then the Transitive group, with the bulk toolbar over it. A
 * group's status is on its row; messages sit above the tree, which owns treeitems only, but for an action-less
 * sentence of a project under All Projects, a text-only leaf of its group. The
 * current row (`aria-current`) is the one whose details are shown; the rows selected for a bulk action are
 * `aria-selected`. Nothing is removed from a list here: a row is busy from the request on (ops slice) and leaves
 * when the host's next list no longer has it.
 */
export function InstalledTab({ filter, vulnerableOnly, announce }: ListView): React.JSX.Element {
    const { committed } = useSession();
    const installed = useInstalled();
    const transitive = useTransitive();
    const all = useAllProjects();
    const { projects } = useProjects();
    const { isPackageBusy } = useOps();
    const { run } = useOpsActions();
    const { select } = useDetailsActions();
    // The current row, as its id in the tree.
    const [current, setCurrent] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(NOT_COLLAPSED);
    const [transitiveOpen, setTransitiveOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const selection = committed?.selectedProject;
    const allMode = selection === ALL_PROJECTS;
    // Another selection starts with nothing selected and no dialog.
    useEffect(() => {
        setCurrent(null);
        setTransitiveOpen(false);
        setConfirming(false);
    }, [selection]);
    const sections = useMemo((): Section[] => {
        if (allMode) {
            const listed: ReadonlyArray<{ name: string; path: string; workspaceFolder?: string }> = all.projects ?? [...all.chunks.values()].map(chunk => ({ name: chunk.projectName, path: chunk.projectPath, workspaceFolder: chunk.workspaceFolder }));
            return listed.map(project => {
                const chunk = all.chunks.get(project.path);
                return {
                    projectPath: project.path,
                    projectName: chunk?.projectName ?? project.name,
                    workspaceFolder: chunk?.workspaceFolder ?? project.workspaceFolder,
                    result: chunk?.result,
                    status: chunk ? 'ready' : all.status,
                    error: chunk?.error ?? (chunk === undefined && all.error ? all.error.message : undefined),
                    metadata: all.metadata.get(project.path) ?? NO_METADATA,
                    revalidating: all.revalidating,
                    onRetry: all.refresh,
                };
            });
        } else if (installed.projectPath !== null) {
            const projectPath = installed.projectPath;
            return [{
                projectPath,
                projectName: projects?.find(project => project.path === projectPath)?.name ?? nameOf(projectPath),
                result: installed.result,
                status: installed.status,
                error: installed.error?.message,
                metadata: installed.metadata,
                revalidating: installed.revalidating,
                onRetry: installed.refresh,
            }];
        }
        return [];
    }, [allMode, all.projects, all.chunks, all.metadata, all.status, all.error, all.revalidating, all.refresh, installed.projectPath, installed.result, installed.status, installed.error, installed.metadata, installed.revalidating, installed.refresh, projects]);

    /** The rows a bulk action may take: shown under the filter, removable, not busy. */
    const removable = (section: Section): string[] => (section.result === undefined ? [] : visibleRows(section.result, section.metadata, filter, vulnerableOnly).items
        .filter(({ entry }) => whyNotRemovable(entry, section.result as InstalledResult) === undefined && !isPackageBusy(section.projectPath, entry.id))
        .map(item => item.id));

    // The rows a bulk action may take, as a list whose identity changes with its content.
    const candidateKey = sections.flatMap(section => removable(section).map(id => rowId(section.projectPath, id))).join('\0');
    const candidates = useMemo(() => (candidateKey === '' ? [] : candidateKey.split('\0')), [candidateKey]);
    const bulk = useBulkSelection(candidates, selection);
    const removals: Removal[] = sections.flatMap(section => {
        const packages = candidates.filter(id => bulk.selected.has(id)).map(parseRowId).filter(chosen => chosen.projectPath === section.projectPath).map(chosen => chosen.packageId);
        return packages.length > 0 ? [{ projectPath: section.projectPath, projectName: section.projectName, packages }] : [];
    });
    const { count, allSelected } = bulk;
    const candidateCount = candidates.length;

    const toggle = (section: Section, entry: InstalledPackage): void => {
        const obstacle = section.result === undefined ? undefined : whyNotRemovable(entry, section.result);
        if (obstacle !== undefined) {
            announce(obstacle);
            return;
        }
        if (!bulk.toggle(rowId(section.projectPath, entry.id))) {
            announce('An operation on this package is running.');
        }
    };

    const selectAll = (): void => bulk.selectAll();

    const uninstall = (section: Section, entry: InstalledPackage): void => {
        if (section.result === undefined || isPackageBusy(section.projectPath, entry.id)) {
            return;
        }
        const obstacle = whyNotRemovable(entry, section.result);
        if (obstacle !== undefined) {
            announce(obstacle);
            return;
        }
        run('ops/remove', { projectPath: section.projectPath, packageId: entry.id }).catch((error: unknown) => {
            announce(`Uninstall of ${entry.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    const confirm = (): void => {
        setConfirming(false);
        // The outcome is announced from the ops slice; here only a request that got no answer.
        const failed = (error: unknown): void => announce(`Uninstall failed: ${error instanceof Error ? error.message : String(error)}`);
        if (allMode) {
            run('ops/bulkRemoveAllProjects', { projectRemovals: removals.map(removal => ({ ...removal, packages: [...removal.packages] })) }).catch(failed);
        } else if (removals[0] !== undefined) {
            run('ops/bulkRemove', { projectPath: removals[0].projectPath, packages: [...removals[0].packages] }).catch(failed);
        }
        bulk.clear();
    };

    // The details pane follows the row the user made current.
    const makeCurrent = (section: Section, entry: InstalledPackage): void => {
        setCurrent(rowId(section.projectPath, entry.id));
        select({ packageId: entry.id, version: entry.resolvedVersion ?? entry.version, origin: 'installed', projectPath: section.projectPath, known: { verified: section.metadata.get(entry.id.toLowerCase())?.verified } });
    };

    // A transitive row made current: the details show the read-only transitive view.
    const makeTransitiveCurrent = (item: Extract<TreeItem, { kind: 'transitive' }>): void => {
        setCurrent(item.id);
        select({ packageId: item.entry.id, version: item.entry.version, origin: 'transitive', projectPath: item.scope.projectPath });
    };

    // A project's group row id, unique though a project's name is not; its suffix names the project's markers.
    const projectGroups = useMemo((): ReadonlyMap<string, string> => (allMode ? projectGroupIds(sections) : new Map()), [allMode, sections]);
    const markerOf = (section: Section): string => (projectGroups.get(section.projectPath) ?? section.projectPath).slice(PROJECT_GROUP.length);

    const transitiveExpanded = transitiveOpen && (allMode ? all.transitive.enabled : transitive.enabled);
    const transitivePart = useMemo(
        () => (allMode ? allProjectsTransitiveTree(all, transitiveExpanded, projectPaths => { run('ops/restore', { projectPaths }).catch(() => undefined); }) : transitiveTree(transitive, transitiveExpanded, collapsed)),
        [allMode, all, transitive, transitiveExpanded, collapsed, run],
    );

    const items = useMemo((): TreeItem[] => {
        const list: TreeItem[] = [];
        const packagesOf = (section: Section, groupId: string): void => {
            if (section.result === undefined || collapsed.has(groupId)) {
                return;
            }
            const { result } = section;
            if (allMode) {
                // What a project without an action has to say is a leaf of its group (DECISIONS 2026-11-01).
                const message = { kind: 'message', id: `${groupId}\nmessage`, level: 0, section, marker: groupId.slice(PROJECT_GROUP.length) } as const;
                if (result.unsupported !== undefined) {
                    list.push({ ...message, cell: 'unsupported', text: `Unsupported project: ${sentence(result.unsupported.message)}` });
                } else if (result.packages.length === 0 && filter.trim() === '' && !vulnerableOnly) {
                    list.push({ ...message, cell: 'empty', text: 'No packages installed.' });
                }
            }
            for (const item of visibleRows(result, section.metadata, filter, vulnerableOnly).items) {
                list.push({ kind: 'package', id: rowId(section.projectPath, item.id), section, result, entry: item.entry });
            }
        };
        if (!allMode) {
            const section = sections[0];
            // A project without a result lists nothing: the bar and the skeleton, or the error banner, stand alone (UX-P2.8b).
            if (section !== undefined && section.result === undefined) {
                return list;
            }
            if (section?.result !== undefined) {
                const { result, metadata } = section;
                const shown = visibleRows(result, metadata, filter, vulnerableOnly);
                const nothing = result.unsupported !== undefined && result.packages.length === 0;
                const count = nothing ? undefined : directCount(result.packages.length, shown.items.length, (filter.trim() !== '' || vulnerableOnly) && !(vulnerableOnly && metadata.size === 0));
                list.push({ kind: 'group', id: 'direct', level: 1, title: 'Direct packages', count, section, variant: 'group' });
                packagesOf(section, 'direct');
            }
            list.push(...transitivePart.items);
            return list;
        }
        const project = (section: Section, level: number): void => {
            const id = projectGroups.get(section.projectPath) ?? `${PROJECT_GROUP}${section.projectPath.toLowerCase()}`;
            list.push({ kind: 'group', id, level, title: section.projectName, section, variant: level === 1 ? 'group' : 'level' });
            packagesOf(section, id);
        };
        const folders = groupByFolder(sections);
        if (folders.length < 2) {
            sections.forEach(section => project(section, 1));
            list.push(...transitivePart.items);
            return list;
        }
        for (const [folder, members] of folders) {
            const id = `folder-${folder.toLowerCase()}`;
            list.push({ kind: 'group', id, level: 1, title: folder, variant: 'group' });
            if (!collapsed.has(id)) {
                members.forEach(section => project(section, 2));
            }
        }
        list.push(...transitivePart.items);
        return list;
    }, [allMode, sections, projectGroups, collapsed, filter, vulnerableOnly, transitivePart.items]);

    // A selection of this tab that comes back (the tab shown again) makes its row current again.
    const detailsSelection = useDetails().selection;
    useEffect(() => {
        if (detailsSelection?.origin === 'installed' && detailsSelection.projectPath !== null) {
            setCurrent(rowId(detailsSelection.projectPath, detailsSelection.packageId));
        } else if (detailsSelection?.origin === 'transitive') {
            const key = metadataKey(detailsSelection.packageId, detailsSelection.version);
            setCurrent(previous => {
                const isTransitive = (item: TreeItem | undefined): boolean => item?.kind === 'transitive' && item.key === key;
                return isTransitive(items.find(item => item.id === previous)) ? previous : items.find(isTransitive)?.id ?? previous;
            });
        }
    }, [detailsSelection, items]);

    const { enableTransitive: enableAllTransitive } = all;
    const { enable: enableTransitive } = transitive;
    const groups = useMemo((): ListboxGroups<TreeItem> => ({
        is: item => item.kind === 'group',
        isMessage: item => item.kind === 'message',
        level: item => (item.kind === 'group' ? item.level : 1),
        isExpanded: item => (item.id === 'transitive' ? transitiveExpanded : !collapsed.has(item.id)),
        onToggle: (item, expanded) => {
            if (item.id === 'transitive') {
                if (expanded) {
                    if (allMode) {
                        enableAllTransitive();
                    } else {
                        enableTransitive();
                    }
                }
                setTransitiveOpen(expanded);
                return;
            }
            setCollapsed(previous => {
                const next = new Set(previous);
                if (expanded) {
                    next.delete(item.id);
                } else {
                    next.add(item.id);
                }
                return next;
            });
        },
        render: (item, placement) => {
            if (item.kind === 'message') {
                return <span data-testid={item.cell === 'empty' ? `installed-empty-${item.marker}` : `installed-unsupported-${item.marker}`}>{item.text}</span>;
            }
            if (item.kind !== 'group') {
                return null;
            }
            if (item.id === 'transitive' || item.id.startsWith('transitive-')) {
                return allMode ? allProjectsTransitiveGroupContent(item, placement, all) : transitiveGroupContent(item, placement, transitive);
            }
            const { section } = item;
            const result = section?.result;
            const counted = allMode && result !== undefined && !(result.unsupported !== undefined && result.packages.length === 0);
            return (
                <SectionHeader
                    presentation="content"
                    title={item.title}
                    testKey={item.id}
                    expanded={placement.expanded}
                    variant={item.variant}
                    count={item.count ?? (counted ? result.packages.length : undefined)}
                    busy={allMode && section !== undefined && section.result === undefined && section.error === undefined}
                    badges={statusBadges(result, allMode ? item.id.slice(PROJECT_GROUP.length) : undefined)}
                />
            );
        },
    }), [allMode, all, collapsed, enableAllTransitive, enableTransitive, transitive, transitiveExpanded]);

    let body: React.ReactNode;
    if (sections.length === 0) {
        body = committed === undefined || (allMode && all.status === 'loading')
            ? <><div className="nuiget-installed-progress"><ProgressBar label="Loading installed packages" data-testid="installed-progress" /></div><Skeleton density="comfortable" /></>
            : <EmptyState message={allMode ? 'No projects to list.' : 'No .NET projects found in this workspace.'} />;
    } else {
        const single = allMode ? undefined : sections[0];
        const shown = single?.result === undefined ? undefined : visibleRows(single.result, single.metadata, filter, vulnerableOnly);
        const listed = single?.result !== undefined && (single.result.unsupported === undefined || single.result.packages.length > 0);
        const open = !collapsed.has('direct');
        const failed = (section: Section): boolean => section.status === 'error' || section.error !== undefined;
        const firstLoad = single !== undefined ? single.result === undefined && !failed(single) : all.status === 'loading';
        const revalidating = sections.some(section => section.revalidating);
        body = (
            <>
                {firstLoad || revalidating ? <div className="nuiget-installed-progress"><ProgressBar label={firstLoad ? 'Loading installed packages' : 'Refreshing installed packages'} data-testid="installed-progress" /></div> : null}
                {sections.map(section => (
                    <Fragment key={section.projectPath}>
                        {!allMode && section.result?.unsupported ? <Banner severity="warning" data-testid="installed-unsupported">{`Unsupported project: ${sentence(section.result.unsupported.message)}`}</Banner> : null}
                        {failed(section) ? <Banner severity="error" data-testid={allMode ? `installed-error-${markerOf(section)}` : 'installed-error'} action={{ label: 'Retry', onClick: section.onRetry }}>{`Installed packages of ${section.projectName} could not be loaded: ${sentence(section.error ?? 'unknown error')}`}</Banner> : null}
                    </Fragment>
                ))}
                {open && listed && shown?.items.length === 0 ? <EmptyState message={shown.empty} data-testid="installed-empty" /> : null}
                {transitivePart.message}
                <Listbox
                    items={items}
                    groups={groups}
                    label="Installed packages"
                    hint={HINT}
                    testId="installed-list"
                    density="comfortable"
                    busy={revalidating}
                    empty={firstLoad ? <Skeleton density="comfortable" /> : undefined}
                    selectedId={current}
                    selectedIds={bulk.selected}
                    isDisabled={item => item.kind === 'package' && item.entry.declaration === 'unresolved'}
                    onToggleSelected={item => {
                        if (item.kind === 'package') {
                            toggle(item.section, item.entry);
                        } else if (item.kind === 'transitive') {
                            announce('Transitive packages cannot be selected: they come with the packages that require them.');
                        }
                    }}
                    onSelect={item => {
                        if (item.kind === 'package') {
                            makeCurrent(item.section, item.entry);
                        } else if (item.kind === 'transitive') {
                            makeTransitiveCurrent(item);
                        }
                    }}
                    onActivate={item => {
                        if (item.kind === 'package') {
                            makeCurrent(item.section, item.entry);
                        } else if (item.kind === 'transitive') {
                            makeTransitiveCurrent(item);
                        }
                    }}
                    onDelete={item => {
                        if (item.kind === 'package') {
                            uninstall(item.section, item.entry);
                        } else if (item.kind === 'transitive') {
                            announce('Transitive packages cannot be uninstalled: uninstall the package that requires them.');
                        }
                    }}
                    renderRow={(item, placement) => {
                        if (item.kind === 'package') {
                            return <InstalledRow placement={placement} projectPath={item.section.projectPath} entry={item.entry} result={item.result} metadata={item.section.metadata} onUninstall={entry => uninstall(item.section, entry)} />;
                        }
                        return item.kind === 'transitive' ? transitiveRow(item.entry, (allMode ? all.transitive.metadata : transitive.metadata).get(item.key), placement, item.scope.projectPath ?? ALL_PROJECTS, item.badges) : null;
                    }}
                />
            </>
        );
    }

    return (
        <div className="nuiget-installed">
            <Toolbar label="Bulk actions" data-testid="installed-toolbar" end={<Button data-testid="uninstall-selected-button" disabled={count === 0} title={count === 0 ? 'Select packages to uninstall them together.' : undefined} onClick={() => setConfirming(true)}>
                {`Uninstall selected (${count})`}
            </Button>}>
                <Button variant="secondary" icon={<CheckAllIcon />} data-testid="select-all-button" aria-pressed={allSelected} disabled={candidateCount === 0} title={candidateCount === 0 ? 'No package in this list can join a bulk action.' : undefined} onClick={selectAll}>
                    Select all
                </Button>
            </Toolbar>
            {/* The tree is the tab's scroller (D48, UX-P2.1e). */}
            <div className="nuiget-installed-lists">
                {body}
            </div>
            <BulkUninstallDialog open={confirming && count > 0} removals={removals} onConfirm={confirm} onCancel={() => setConfirming(false)} />
        </div>
    );
}

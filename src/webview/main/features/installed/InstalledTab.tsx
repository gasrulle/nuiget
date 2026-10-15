import { useEffect, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, type InstalledPackage, type InstalledResult, type PackageMetadataLite } from '../../../../protocol';
import { whyNotRemovable } from '../../../shared/installed/rules';
import { EmptyState, Skeleton, Toolbar } from '../../../shared/primitives';
import { useAllProjects } from '../../../shared/store/allProjects';
import { useDetailsActions } from '../../../shared/store/details';
import { useInstalled } from '../../../shared/store/installed';
import { useOps, useOpsActions } from '../../../shared/store/ops';
import { useProjects } from '../../../shared/store/projects';
import { useSession } from '../../../shared/store/session';
import type { ListView } from '../../MainShell';
import { FolderGroups } from '../all-projects/folderGroups';
import { BulkUninstallDialog, type Removal } from './BulkUninstallDialog';
import { InstalledProjectSection, visibleRows } from './InstalledProjectSection';
import { TransitiveSection } from './TransitiveSection';
import { AllProjectsTransitiveSection } from './AllProjectsTransitiveSection';

/** What a section of the tab shows: one project's list, from the installed slice or from an All Projects chunk. */
interface Section {
    projectPath: string;
    projectName: string;
    /** The workspace folder of the project, in All Projects. */
    workspaceFolder?: string;
    result: InstalledResult | undefined;
    status: 'idle' | 'loading' | 'ready' | 'error';
    error: string | undefined;
    metadata: ReadonlyMap<string, PackageMetadataLite>;
    revalidating: boolean;
    onRetry: () => void;
}

const NO_METADATA: ReadonlyMap<string, PackageMetadataLite> = new Map();
const NOTHING: ReadonlySet<string> = new Set();
const nameOf = (projectPath: string): string => projectPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? projectPath;

/**
 * The Installed tab of the main panel: the packages of the selected project, or one section per project in All
 * Projects, with the bulk toolbar over them and, for a single project, the transitive packages under them. The
 * current row (`aria-current`) is the one whose details are shown; the rows selected for a bulk action are
 * `aria-selected`. Nothing is removed from a list here: a row is busy from the request on (ops slice) and leaves
 * when the host's next list no longer has it.
 */
export function InstalledTab({ filter, vulnerableOnly, announce }: ListView): React.JSX.Element {
    const { committed } = useSession();
    const installed = useInstalled();
    const all = useAllProjects();
    const { projects } = useProjects();
    const { isPackageBusy } = useOps();
    const { run } = useOpsActions();
    const { select } = useDetailsActions();
    const [current, setCurrent] = useState<{ projectPath: string; id: string } | null>(null);
    // Selected for a bulk action, by project path exactly as the host sent it.
    const [bulk, setBulk] = useState<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
    const [confirming, setConfirming] = useState(false);

    const selection = committed?.selectedProject;
    const allMode = selection === ALL_PROJECTS;
    // Another selection starts with nothing selected and no dialog.
    useEffect(() => {
        setCurrent(null);
        setBulk(new Map());
        setConfirming(false);
    }, [selection]);

    let sections: Section[] = [];
    if (allMode) {
        const listed: ReadonlyArray<{ name: string; path: string; workspaceFolder?: string }> = all.projects ?? [...all.chunks.values()].map(chunk => ({ name: chunk.projectName, path: chunk.projectPath, workspaceFolder: chunk.workspaceFolder }));
        sections = listed.map(project => {
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
        sections = [{
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

    /** The rows a bulk action may take: shown under the filter, removable, not busy. */
    const removable = (section: Section): string[] => (section.result === undefined ? [] : visibleRows(section.result, section.metadata, filter, vulnerableOnly).items
        .filter(({ entry }) => whyNotRemovable(entry, section.result as InstalledResult) === undefined && !isPackageBusy(section.projectPath, entry.id))
        .map(item => item.id));

    const removals: Removal[] = sections.flatMap(section => {
        const chosen = bulk.get(section.projectPath);
        // A package that left the list is no longer selected.
        const present = new Set(section.result?.packages.map(entry => entry.id));
        const packages = chosen ? [...chosen].filter(id => present.has(id)) : [];
        return packages.length > 0 ? [{ projectPath: section.projectPath, projectName: section.projectName, packages }] : [];
    });
    const count = removals.reduce((sum, removal) => sum + removal.packages.length, 0);
    const candidates = sections.map(section => [section.projectPath, removable(section)] as const);
    const candidateCount = candidates.reduce((sum, [, ids]) => sum + ids.length, 0);
    const allSelected = candidateCount > 0 && candidates.every(([projectPath, ids]) => ids.every(id => bulk.get(projectPath)?.has(id)));

    const toggle = (section: Section, entry: InstalledPackage): void => {
        const obstacle = section.result === undefined ? undefined : whyNotRemovable(entry, section.result);
        if (obstacle !== undefined) {
            announce(obstacle);
            return;
        }
        setBulk(previous => {
            const ids = new Set(previous.get(section.projectPath));
            if (!ids.delete(entry.id)) {
                ids.add(entry.id);
            }
            return new Map(previous).set(section.projectPath, ids);
        });
    };

    const selectAll = (): void => {
        setBulk(allSelected ? new Map() : new Map(candidates.map(([projectPath, ids]) => [projectPath, new Set(ids)])));
    };

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
        setBulk(previous => {
            const next = new Map(previous);
            for (const removal of removals) {
                const left = new Set(next.get(removal.projectPath));
                removal.packages.forEach(id => left.delete(id));
                next.set(removal.projectPath, left);
            }
            return next;
        });
        // The outcome is announced from the ops slice; here only a request that got no answer.
        const failed = (error: unknown): void => announce(`Uninstall failed: ${error instanceof Error ? error.message : String(error)}`);
        if (allMode) {
            run('ops/bulkRemoveAllProjects', { projectRemovals: removals.map(removal => ({ ...removal, packages: [...removal.packages] })) }).catch(failed);
        } else if (removals[0] !== undefined) {
            run('ops/bulkRemove', { projectPath: removals[0].projectPath, packages: [...removals[0].packages] }).catch(failed);
        }
    };

    let body: React.ReactNode;
    if (sections.length === 0) {
        body = committed === undefined || (allMode && all.status === 'loading')
            ? <Skeleton density="comfortable" />
            : <EmptyState message={allMode ? 'No projects to list.' : 'No .NET projects found in this workspace.'} />;
    } else {
        const renderSection = (section: Section, level: 2 | 3) => (
            <InstalledProjectSection
                level={level}
                key={section.projectPath}
                {...section}
                filter={filter}
                vulnerableOnly={vulnerableOnly}
                selected={bulk.get(section.projectPath) ?? NOTHING}
                currentId={current?.projectPath === section.projectPath ? current.id : null}
                onToggle={entry => toggle(section, entry)}
                onCurrent={id => {
                    setCurrent({ projectPath: section.projectPath, id });
                    // The details pane follows the row the user made current.
                    const entry = section.result?.packages.find(candidate => candidate.id === id);
                    if (entry !== undefined) {
                        select({ packageId: entry.id, version: entry.resolvedVersion ?? entry.version, origin: 'installed', projectPath: section.projectPath });
                    }
                }}
                onUninstall={entry => uninstall(section, entry)}
                grouped={allMode}
            />
        );
        body = allMode ? <FolderGroups items={sections} render={renderSection} /> : sections.map(section => renderSection(section, 2));
    }

    return (
        <div className={allMode ? 'nuiget-installed nuiget-installed--all' : 'nuiget-installed'}>
            <Toolbar label="Bulk actions">
                <button type="button" className="nuiget-button nuiget-button--secondary" data-testid="select-all-button" aria-pressed={allSelected} disabled={candidateCount === 0} onClick={selectAll}>
                    Select all
                </button>
                <button type="button" className="nuiget-button" data-testid="uninstall-selected-button" disabled={count === 0} onClick={() => setConfirming(true)}>
                    {`Uninstall selected (${count})`}
                </button>
            </Toolbar>
            <div className="nuiget-installed-lists">{body}</div>
            {allMode ? <AllProjectsTransitiveSection /> : <TransitiveSection />}
            <BulkUninstallDialog open={confirming && count > 0} removals={removals} onConfirm={confirm} onCancel={() => setConfirming(false)} />
        </div>
    );
}

/**
 * UpdatesTab Component
 *
 * Renders the Updates tab content: toolbar with select-all/update-all,
 * virtualized package list with update checkboxes, and details panel.
 *
 * Owns: selectedUpdates, updatingAll, updatesVirtualizer, deferred updates list.
 * Receives: packagesWithUpdates, installedPackages, selectedPackage, etc. as props.
 *
 * Exposed via forwardRef/useImperativeHandle:
 *   - handleMessage(message): handles 'bulkUpdateResult'
 *   - focusAndSelectFirst(): focuses list and selects first item
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import React, { forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type {
    InstalledPackage,
    LRUMap,
    PackageMetadata,
    PackageSearchResult,
    PackageUpdate,
    Project,
    ProjectUpdates,
    VsCodeApi,
} from '../types';
import { getPackageId } from '../types';
import { MemoizedPackageDetailsPanel } from './PackageDetailsPanel';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface UpdatesTabProps {
    // Data
    packagesWithUpdates: PackageUpdate[];
    loadingUpdates: boolean;
    installedPackages: InstalledPackage[];
    selectedPackage: PackageSearchResult | InstalledPackage | null;
    selectedProject: string;
    selectedSource: string;
    includePrerelease: boolean;
    splitPosition: number;
    defaultPackageIcon: string;

    // "Load All Projects" mode
    loadAllProjects: boolean;
    allProjectsUpdates: ProjectUpdates[];
    loadingAllProjectsUpdates: boolean;
    onLoadAllChange: (checked: boolean) => void;
    projects: Project[];

    // Shared state for details panel
    packageMetadata: PackageMetadata | null;
    loadingMetadata: boolean;
    loadingVersions: boolean;
    packageVersions: string[];
    selectedVersion: string;
    detailsTab: 'details' | 'readme';
    loadingReadme: boolean;
    sanitizedReadmeHtml: string;
    expandedDeps: Set<string>;

    // Callbacks from parent
    onSelectPackage: (pkg: InstalledPackage, options: {
        selectedVersionValue: string;
        metadataVersion: string;
        initialVersions: string[];
    }) => void;
    clearSelection: () => void;
    onInstall: (packageId: string, version: string) => void;
    onRemove: (packageId: string) => void;
    onDetailsTabChange: (tab: 'details' | 'readme') => void;
    onVersionChange: (version: string) => void;
    onToggleDep: (key: string) => void;
    onReadmeAttemptedChange: (attempted: boolean) => void;
    onMetadataChange: (metadata: PackageMetadata | null) => void;
    onLoadingMetadataChange: (loading: boolean) => void;
    onSetSelectedPackage: (pkg: PackageSearchResult | InstalledPackage | null) => void;
    onSetSelectedTransitivePackage: (pkg: null) => void;
    onSetSelectedVersion: (version: string) => void;
    setSplitPosition: (pos: number) => void;
    handleSashReset: () => void;
    handleSashDragEnd: (pos: number) => void;

    // Keyboard handler factory
    createPackageListKeyHandler: <T extends { id: string }>(
        packages: T[],
        getCurrentId: () => string | null,
        triggerClick: (pkg: T) => void,
        options?: {
            onAction?: (pkg: T) => void;
            onDelete?: (pkg: T) => void;
            onToggle?: (pkg: T) => void;
            onLeftArrow?: () => void;
            onRightArrow?: () => void;
            onExitTop?: () => void;
            scrollToIndex?: (index: number) => void;
        }
    ) => (e: React.KeyboardEvent<HTMLDivElement>) => void;

    // Refs & dependencies
    metadataCache: React.RefObject<LRUMap<string, PackageMetadata>>;
    vscode: VsCodeApi;

    // External refs
    updatesTabRef: React.RefObject<HTMLButtonElement | null>;
    MemoizedDraggableSash: React.MemoExoticComponent<React.FC<{
        onDrag: (pos: number) => void;
        onReset: () => void;
        onDragEnd?: (pos: number) => void;
    }>>;
}

export interface UpdatesTabHandle {
    handleMessage: (message: { type: string;[key: string]: unknown }) => void;
    focusAndSelectFirst: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

const ESTIMATED_ITEM_HEIGHT = 66;

const UpdatesTab = forwardRef<UpdatesTabHandle, UpdatesTabProps>((props, ref) => {
    const {
        packagesWithUpdates,
        loadingUpdates,
        installedPackages,
        selectedPackage,
        selectedProject,
        selectedSource,
        includePrerelease,
        splitPosition,
        defaultPackageIcon,
        loadAllProjects,
        allProjectsUpdates,
        loadingAllProjectsUpdates,
        onLoadAllChange,
        projects,
        packageMetadata,
        loadingMetadata,
        loadingVersions,
        packageVersions,
        selectedVersion,
        detailsTab,
        loadingReadme,
        sanitizedReadmeHtml,
        expandedDeps,
        onSelectPackage,
        clearSelection,
        onInstall,
        onRemove,
        onDetailsTabChange,
        onVersionChange,
        onToggleDep,
        onReadmeAttemptedChange,
        onMetadataChange,
        onLoadingMetadataChange,
        onSetSelectedPackage,
        onSetSelectedTransitivePackage,
        onSetSelectedVersion,
        setSplitPosition,
        handleSashReset,
        handleSashDragEnd,
        createPackageListKeyHandler,
        metadataCache,
        vscode,
        updatesTabRef,
        MemoizedDraggableSash,
    } = props;

    // ─── Local state ─────────────────────────────────────────────────────────
    const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(new Set());
    const [updatingAll, setUpdatingAll] = useState(false);

    // ─── Refs ────────────────────────────────────────────────────────────────
    const updatesScrollRef = useRef<HTMLDivElement>(null);
    const updatesListRef = useRef<HTMLDivElement>(null);

    // ─── Effects ─────────────────────────────────────────────────────────────
    // Reset selections when packages change (e.g., project switch) or load-all mode changes
    useEffect(() => {
        setSelectedUpdates(new Set());
    }, [packagesWithUpdates, allProjectsUpdates, loadAllProjects]);

    // ─── Derived data ────────────────────────────────────────────────────────
    const sortedPackagesWithUpdates = useMemo(() =>
        [...packagesWithUpdates].sort((a, b) => a.id.localeCompare(b.id)),
        [packagesWithUpdates]
    );
    const deferredPackagesWithUpdates = useDeferredValue(sortedPackagesWithUpdates);
    const isUpdatesStale = sortedPackagesWithUpdates !== deferredPackagesWithUpdates;

    // Type for flattened list items: either a project header or a package update
    type FlattenedItem =
        | { type: 'header'; projectPath: string; projectName: string; updateCount: number }
        | { type: 'package'; projectPath: string; id: string; installedVersion: string; latestVersion: string };

    // Flatten allProjectsUpdates into a single list for virtualization
    const flattenedAllProjectsUpdates = useMemo((): FlattenedItem[] => {
        if (!loadAllProjects) { return []; }
        const items: FlattenedItem[] = [];
        for (const project of allProjectsUpdates) {
            // Add project header
            items.push({
                type: 'header',
                projectPath: project.projectPath,
                projectName: project.projectName,
                updateCount: project.updates.length
            });
            // Add sorted package updates
            const sortedUpdates = [...project.updates].sort((a, b) => a.id.localeCompare(b.id));
            for (const update of sortedUpdates) {
                items.push({
                    type: 'package',
                    projectPath: project.projectPath,
                    ...update
                });
            }
        }
        return items;
    }, [loadAllProjects, allProjectsUpdates]);

    const deferredFlattenedItems = useDeferredValue(flattenedAllProjectsUpdates);
    const isAllProjectsStale = flattenedAllProjectsUpdates !== deferredFlattenedItems;

    // Total package count for multi-project mode
    const allProjectsPackageCount = useMemo(() => {
        return allProjectsUpdates.reduce((sum, pu) => sum + pu.updates.length, 0);
    }, [allProjectsUpdates]);

    // ─── Virtualizer ─────────────────────────────────────────────────────────
    // Use different virtualizer counts based on mode
    const virtualizerCount = loadAllProjects
        ? deferredFlattenedItems.length
        : deferredPackagesWithUpdates.length;

    const HEADER_HEIGHT = 40;
    const updatesVirtualizer = useVirtualizer({
        count: virtualizerCount,
        getScrollElement: () => updatesScrollRef.current,
        estimateSize: (index) => {
            if (loadAllProjects && deferredFlattenedItems[index]?.type === 'header') {
                return HEADER_HEIGHT;
            }
            return ESTIMATED_ITEM_HEIGHT;
        },
        overscan: 5,
    });

    // ─── Callbacks ───────────────────────────────────────────────────────────
    // In multi-project mode, keys are "projectPath::packageId"
    const handleToggleUpdateSelection = useCallback((key: string) => {
        setSelectedUpdates(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    }, []);

    const handleToggleSelectAll = useCallback(() => {
        if (loadAllProjects) {
            // Multi-project mode: use composite keys
            if (selectedUpdates.size === allProjectsPackageCount) {
                setSelectedUpdates(new Set());
            } else {
                const allKeys = new Set<string>();
                for (const project of allProjectsUpdates) {
                    for (const update of project.updates) {
                        allKeys.add(`${project.projectPath}::${update.id}`);
                    }
                }
                setSelectedUpdates(allKeys);
            }
        } else {
            // Single project mode
            if (selectedUpdates.size === packagesWithUpdates.length) {
                setSelectedUpdates(new Set());
            } else {
                setSelectedUpdates(new Set(packagesWithUpdates.map(p => p.id)));
            }
        }
    }, [loadAllProjects, selectedUpdates.size, allProjectsPackageCount, allProjectsUpdates, packagesWithUpdates]);

    const handleUpdateAll = useCallback(() => {
        if (selectedUpdates.size === 0) {
            return;
        }

        if (loadAllProjects) {
            // Multi-project mode: group packages by project
            const projectUpdatesMap = new Map<string, { projectPath: string; projectName: string; packages: { id: string; version: string }[] }>();

            for (const key of selectedUpdates) {
                const [projectPath, packageId] = key.split('::');
                // Find the project and package
                const project = allProjectsUpdates.find(p => p.projectPath === projectPath);
                const update = project?.updates.find(u => u.id === packageId);
                if (project && update) {
                    if (!projectUpdatesMap.has(projectPath)) {
                        projectUpdatesMap.set(projectPath, {
                            projectPath,
                            projectName: project.projectName,
                            packages: []
                        });
                    }
                    projectUpdatesMap.get(projectPath)!.packages.push({
                        id: update.id,
                        version: update.latestVersion
                    });
                }
            }

            setUpdatingAll(true);
            vscode.postMessage({
                type: 'bulkUpdateAllProjects',
                projectUpdates: Array.from(projectUpdatesMap.values())
            });
        } else {
            // Single project mode
            if (!selectedProject) { return; }
            const packagesToUpdate = packagesWithUpdates
                .filter(p => selectedUpdates.has(p.id))
                .map(p => ({ id: p.id, version: p.latestVersion }));

            setUpdatingAll(true);
            vscode.postMessage({
                type: 'bulkUpdatePackages',
                projectPath: selectedProject,
                packages: packagesToUpdate
            });
        }
    }, [loadAllProjects, selectedProject, selectedUpdates, packagesWithUpdates, allProjectsUpdates, vscode]);

    // ─── Imperative handle ───────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        handleMessage(message: { type: string;[key: string]: unknown }) {
            switch (message.type) {
                case 'bulkUpdateResult':
                    setUpdatingAll(false);
                    setSelectedUpdates(new Set());
                    break;
                case 'bulkUpdateAllProjectsResult':
                    setUpdatingAll(false);
                    setSelectedUpdates(new Set());
                    break;
            }
        },
        focusAndSelectFirst() {
            updatesListRef.current?.focus({ preventScroll: true });
            if (deferredPackagesWithUpdates.length > 0) {
                if (!selectedPackage || !deferredPackagesWithUpdates.find(p => p.id === selectedPackage.id)) {
                    const firstPkg = deferredPackagesWithUpdates[0];
                    const installedPkg = { id: firstPkg.id, version: firstPkg.installedVersion } as InstalledPackage;
                    onSetSelectedPackage(installedPkg);
                    onSetSelectedTransitivePackage(null);
                    onSetSelectedVersion(firstPkg.latestVersion);
                    onDetailsTabChange('details');
                }
            }
        },
    }));

    // ─── Render ──────────────────────────────────────────────────────────────
    // Determine which loading state to show
    const isLoading = loadAllProjects ? loadingAllProjectsUpdates : loadingUpdates;
    // Determine which empty state to show
    const hasNoUpdates = loadAllProjects
        ? allProjectsUpdates.length === 0
        : packagesWithUpdates.length === 0;
    // Determine correct "all selected" state
    const totalSelectableCount = loadAllProjects ? allProjectsPackageCount : packagesWithUpdates.length;
    const allSelected = selectedUpdates.size === totalSelectableCount && totalSelectableCount > 0;

    return (
        <div className="content browse-content">
            <div className="split-panel">
                <div ref={updatesScrollRef} className="package-list-panel" style={{ width: `${splitPosition}%` }}>
                    {/* Load All checkbox - shown when multiple projects exist */}
                    {projects.length > 1 && (
                        <div className="load-all-toolbar">
                            <label className="load-all-checkbox">
                                <input
                                    type="checkbox"
                                    checked={loadAllProjects}
                                    onChange={(e) => onLoadAllChange(e.target.checked)}
                                    disabled={isLoading || updatingAll}
                                />
                                Load all projects
                            </label>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="loading-spinner-container" aria-busy="true" aria-label="Checking for updates">
                            <div className="loading-spinner"></div>
                            <p>{loadAllProjects ? 'Checking updates for all projects...' : 'Checking for updates...'}</p>
                        </div>
                    ) : hasNoUpdates ? (
                        <p className="empty-state">
                            {loadAllProjects
                                ? 'All packages are up to date across all projects'
                                : installedPackages.length === 0
                                    ? 'No packages installed'
                                    : 'All packages are up to date'}
                        </p>
                    ) : (
                        <>
                            <div className="updates-toolbar">
                                <button
                                    className="btn-link"
                                    onClick={handleToggleSelectAll}
                                    disabled={updatingAll}
                                >
                                    {allSelected ? 'Deselect all' : 'Select all'}
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleUpdateAll}
                                    disabled={selectedUpdates.size === 0 || updatingAll}
                                >
                                    {updatingAll ? 'Updating...' : `Update All (${selectedUpdates.size})`}
                                </button>
                            </div>

                            {loadAllProjects ? (
                                /* Multi-project mode: render flattened list with project headers */
                                <div
                                    ref={updatesListRef}
                                    className={`package-list${isAllProjectsStale ? ' stale' : ''}`}
                                    tabIndex={0}
                                    style={{ height: `${updatesVirtualizer.getTotalSize()}px`, position: 'relative' }}
                                >
                                    {updatesVirtualizer.getVirtualItems().map(virtualRow => {
                                        const item = deferredFlattenedItems[virtualRow.index];

                                        if (item.type === 'header') {
                                            return (
                                                <div
                                                    key={`header-${item.projectPath}`}
                                                    data-index={virtualRow.index}
                                                    ref={updatesVirtualizer.measureElement}
                                                    className="project-group-header"
                                                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                                                >
                                                    <span className="project-name">{item.projectName}</span>
                                                    <span className="project-update-count">{item.updateCount} update{item.updateCount !== 1 ? 's' : ''}</span>
                                                </div>
                                            );
                                        }

                                        // Package item
                                        const compositeKey = `${item.projectPath}::${item.id}`;
                                        return (
                                            <div
                                                key={compositeKey}
                                                data-index={virtualRow.index}
                                                ref={updatesVirtualizer.measureElement}
                                                className="package-item package-item-minimal"
                                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="update-checkbox"
                                                    checked={selectedUpdates.has(compositeKey)}
                                                    onChange={() => handleToggleUpdateSelection(compositeKey)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    disabled={updatingAll}
                                                />
                                                <div className="package-info">
                                                    <div className="package-name">{item.id}</div>
                                                    <div className="package-meta">
                                                        <span className="package-version">v{item.installedVersion}</span>
                                                        <span className="package-update-arrow">→</span>
                                                        <span className="package-version package-version-new">v{item.latestVersion}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* Single-project mode: existing render logic */
                                <div
                                    ref={updatesListRef}
                                    className={`package-list${isUpdatesStale ? ' stale' : ''}`}
                                    tabIndex={0}
                                    onKeyDown={createPackageListKeyHandler(
                                        deferredPackagesWithUpdates,
                                        () => selectedPackage ? getPackageId(selectedPackage) : null,
                                        (pkg) => {
                                            const installedPkg = { id: pkg.id, version: pkg.installedVersion } as InstalledPackage;
                                            onSelectPackage(installedPkg, {
                                                selectedVersionValue: pkg.latestVersion,
                                                metadataVersion: pkg.latestVersion,
                                                initialVersions: [pkg.latestVersion, pkg.installedVersion],
                                            });
                                        },
                                        {
                                            onAction: (pkg) => onInstall(pkg.id, pkg.latestVersion),
                                            onToggle: (pkg) => handleToggleUpdateSelection(pkg.id),
                                            onLeftArrow: () => detailsTab === 'readme' && onDetailsTabChange('details'),
                                            onRightArrow: () => detailsTab === 'details' && onDetailsTabChange('readme'),
                                            onExitTop: () => {
                                                clearSelection();
                                                updatesTabRef.current?.focus();
                                            },
                                            scrollToIndex: (i) => updatesVirtualizer.scrollToIndex(i, { align: 'auto' })
                                        }
                                    )}
                                    style={{ height: `${updatesVirtualizer.getTotalSize()}px`, position: 'relative' }}
                                >
                                    {updatesVirtualizer.getVirtualItems().map(virtualRow => {
                                        const pkg = deferredPackagesWithUpdates[virtualRow.index];
                                        return (
                                            <div
                                                key={pkg.id}
                                                data-index={virtualRow.index}
                                                ref={updatesVirtualizer.measureElement}
                                                className={`package-item ${selectedPackage && getPackageId(selectedPackage).toLowerCase() === pkg.id.toLowerCase() ? 'selected' : ''}`}
                                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                                                onClick={() => {
                                                    const installedPkg = { id: pkg.id, version: pkg.installedVersion } as InstalledPackage;
                                                    onSelectPackage(installedPkg, {
                                                        selectedVersionValue: pkg.latestVersion,
                                                        metadataVersion: pkg.latestVersion,
                                                        initialVersions: [pkg.latestVersion, pkg.installedVersion],
                                                    });
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="update-checkbox"
                                                    checked={selectedUpdates.has(pkg.id)}
                                                    onChange={() => handleToggleUpdateSelection(pkg.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    disabled={updatingAll}
                                                />
                                                <div className="package-icon">
                                                    {pkg.iconUrl ? (
                                                        <img src={pkg.iconUrl} alt="" onError={(e) => { (e.target as HTMLImageElement).src = defaultPackageIcon; }} />
                                                    ) : (
                                                        <img src={defaultPackageIcon} alt="" />
                                                    )}
                                                </div>
                                                <div className="package-info">
                                                    <div className="package-name">{pkg.id}</div>
                                                    <div className="package-meta">
                                                        <span className="package-version">v{pkg.installedVersion}</span>
                                                        <span className="package-update-arrow">→</span>
                                                        <span className="package-version package-version-new">v{pkg.latestVersion}</span>
                                                    </div>
                                                    {pkg.authors && (
                                                        <div className="package-authors">
                                                            {pkg.verified && (
                                                                <span className="verified-badge" title="The ID prefix of this package has been reserved by its owner on nuget.org">✓</span>
                                                            )}
                                                            {pkg.authors}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <MemoizedDraggableSash
                    onDrag={setSplitPosition}
                    onReset={handleSashReset}
                    onDragEnd={handleSashDragEnd}
                />

                <div className="package-details-panel" style={{ width: `${100 - splitPosition}%` }}>
                    <MemoizedPackageDetailsPanel
                        selectedPackage={selectedPackage}
                        packageMetadata={packageMetadata}
                        loadingMetadata={loadingMetadata}
                        loadingVersions={loadingVersions}
                        packageVersions={packageVersions}
                        selectedVersion={selectedVersion}
                        installedPackages={installedPackages}
                        detailsTab={detailsTab}
                        loadingReadme={loadingReadme}
                        sanitizedReadmeHtml={sanitizedReadmeHtml}
                        expandedDeps={expandedDeps}
                        selectedProject={selectedProject}
                        includePrerelease={includePrerelease}
                        selectedSource={selectedSource}
                        onInstall={onInstall}
                        onRemove={onRemove}
                        onVersionChange={onVersionChange}
                        onDetailsTabChange={onDetailsTabChange}
                        onToggleDep={onToggleDep}
                        onReadmeAttemptedChange={onReadmeAttemptedChange}
                        onMetadataChange={onMetadataChange}
                        onLoadingMetadataChange={onLoadingMetadataChange}
                        metadataCache={metadataCache}
                        vscode={vscode}
                    />
                </div>
            </div>
        </div>
    );
});

UpdatesTab.displayName = 'UpdatesTab';

export const MemoizedUpdatesTab = React.memo(UpdatesTab);

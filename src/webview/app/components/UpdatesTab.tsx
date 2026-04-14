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
import { ArrowRightIcon, CheckAllIcon, ChevronDownIcon, ChevronRightIcon, CollapseAllIcon, ExpandAllIcon, VerifiedIcon } from '../icons';
import type {
    InstalledPackage,
    LRUMap,
    PackageMetadata,
    PackageSearchResult,
    PackageUpdate,
    ProjectUpdates,
    VsCodeApi,
} from '../types';
import { getPackageId } from '../types';
import { MemoizedPackageDetailsPanel } from './PackageDetailsPanel';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface UpdatesTabProps {
    // External filter from unified search bar (text after @updates prefix)
    externalFilter: string;

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
    isAllProjects: boolean;
    allProjectsUpdates: ProjectUpdates[];
    loadingAllProjectsUpdates: boolean;

    // Active project path (set when clicking a package in all-projects mode)
    activeProjectPath: string;
    onActiveProjectPathChange: (path: string) => void;

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
        externalFilter = '',
        packagesWithUpdates,
        loadingUpdates,
        installedPackages,
        selectedPackage,
        selectedProject,
        selectedSource,
        includePrerelease,
        splitPosition,
        defaultPackageIcon,
        isAllProjects,
        allProjectsUpdates,
        loadingAllProjectsUpdates,
        activeProjectPath,
        onActiveProjectPathChange,
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
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

    // ─── Refs ────────────────────────────────────────────────────────────────
    const updatesScrollRef = useRef<HTMLDivElement>(null);
    const updatesListRef = useRef<HTMLDivElement>(null);

    // ─── Effects ─────────────────────────────────────────────────────────────
    // Reset selections when packages change (e.g., project switch) or load-all mode changes
    useEffect(() => {
        setSelectedUpdates(new Set());
    }, [packagesWithUpdates, allProjectsUpdates, isAllProjects]);

    // Initialize all projects as expanded when data arrives
    useEffect(() => {
        if (allProjectsUpdates.length > 0) {
            setExpandedProjects(new Set(allProjectsUpdates.map(p => p.projectPath)));
        }
    }, [allProjectsUpdates]);

    // ─── Derived data ────────────────────────────────────────────────────────
    const sortedPackagesWithUpdates = useMemo(() => {
        const sorted = [...packagesWithUpdates].sort((a, b) => a.id.localeCompare(b.id));
        if (!externalFilter.trim()) { return sorted; }
        const lower = externalFilter.trim().toLowerCase();
        return sorted.filter(p => p.id.toLowerCase().includes(lower));
    }, [packagesWithUpdates, externalFilter]);
    const deferredPackagesWithUpdates = useDeferredValue(sortedPackagesWithUpdates);
    const isUpdatesStale = sortedPackagesWithUpdates !== deferredPackagesWithUpdates;

    // Type for flattened list items: either a project header or a package update
    type FlattenedItem =
        | { type: 'header'; projectPath: string; projectName: string; updateCount: number }
        | { type: 'package'; projectPath: string; id: string; installedVersion: string; latestVersion: string; iconUrl?: string };

    // Flatten allProjectsUpdates into a single list for virtualization
    const flattenedAllProjectsUpdates = useMemo((): FlattenedItem[] => {
        if (!isAllProjects) { return []; }
        const lower = externalFilter.trim().toLowerCase();
        const items: FlattenedItem[] = [];
        const sortedProjects = [...allProjectsUpdates].sort((a, b) => {
            if (a.projectPath === selectedProject) { return -1; }
            if (b.projectPath === selectedProject) { return 1; }
            return a.projectName.localeCompare(b.projectName);
        });
        for (const project of sortedProjects) {
            const filteredUpdates = lower
                ? project.updates.filter(u => u.id.toLowerCase().includes(lower))
                : project.updates;
            if (filteredUpdates.length === 0) { continue; }
            // Add project header
            items.push({
                type: 'header',
                projectPath: project.projectPath,
                projectName: project.projectName,
                updateCount: filteredUpdates.length
            });
            // Only add package items if project is expanded
            if (expandedProjects.has(project.projectPath)) {
                const sortedUpdates = [...filteredUpdates].sort((a, b) => a.id.localeCompare(b.id));
                for (const update of sortedUpdates) {
                    items.push({
                        type: 'package',
                        projectPath: project.projectPath,
                        ...update
                    });
                }
            }
        }
        return items;
    }, [isAllProjects, allProjectsUpdates, expandedProjects, selectedProject, externalFilter]);

    const deferredFlattenedItems = useDeferredValue(flattenedAllProjectsUpdates);
    const isAllProjectsStale = flattenedAllProjectsUpdates !== deferredFlattenedItems;

    // Total package count for multi-project mode
    const allProjectsPackageCount = useMemo(() => {
        return allProjectsUpdates.reduce((sum, pu) => sum + pu.updates.length, 0);
    }, [allProjectsUpdates]);

    // ─── Virtualizer ─────────────────────────────────────────────────────────
    // Use different virtualizer counts based on mode
    const virtualizerCount = isAllProjects
        ? deferredFlattenedItems.length
        : deferredPackagesWithUpdates.length;

    const HEADER_HEIGHT = 40;
    const updatesVirtualizer = useVirtualizer({
        count: virtualizerCount,
        getScrollElement: () => updatesScrollRef.current,
        estimateSize: (index) => {
            if (isAllProjects && deferredFlattenedItems[index]?.type === 'header') {
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
        if (isAllProjects) {
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
    }, [isAllProjects, selectedUpdates.size, allProjectsPackageCount, allProjectsUpdates, packagesWithUpdates]);

    const handleUpdateAll = useCallback(() => {
        if (selectedUpdates.size === 0) {
            return;
        }

        if (isAllProjects) {
            // Multi-project mode: group packages by project
            const projectUpdatesMap = new Map<string, { projectPath: string; projectName: string; packages: { id: string; version: string; sourceUrl?: string }[] }>();

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
                    const entry = projectUpdatesMap.get(projectPath);
                    if (entry) {
                        entry.packages.push({
                            id: update.id,
                            version: update.latestVersion,
                            sourceUrl: update.sourceUrl
                        });
                    }
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
                .map(p => ({ id: p.id, version: p.latestVersion, sourceUrl: p.sourceUrl }));

            setUpdatingAll(true);
            vscode.postMessage({
                type: 'bulkUpdatePackages',
                projectPath: selectedProject,
                packages: packagesToUpdate
            });
        }
    }, [isAllProjects, selectedProject, selectedUpdates, packagesWithUpdates, allProjectsUpdates, vscode]);

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
    const isLoading = isAllProjects ? loadingAllProjectsUpdates : loadingUpdates;
    // Determine which empty state to show
    const hasNoUpdates = isAllProjects
        ? allProjectsUpdates.length === 0
        : packagesWithUpdates.length === 0;
    // Progressive: updates are streaming in (loading but have partial results)
    const isStreaming = isLoading && !hasNoUpdates && !isAllProjects;
    // Determine correct "all selected" state
    const totalSelectableCount = isAllProjects ? allProjectsPackageCount : packagesWithUpdates.length;
    const allSelected = selectedUpdates.size === totalSelectableCount && totalSelectableCount > 0;

    return (
        <div className="content browse-content" data-testid="updates-tab">
            <div className="split-panel">
                <div ref={updatesScrollRef} className="package-list-panel" style={{ width: `${splitPosition}%` }}>
                    {isLoading && !isStreaming ? (
                        <>
                            <div className="updates-toolbar">
                                <div className="toolbar-actions-left">
                                    <button
                                        className="toolbar-icon-btn"
                                        disabled
                                        title="Select all"
                                        aria-label="Select all"
                                    >
                                        <CheckAllIcon size={16} />
                                    </button>
                                    {isAllProjects && (
                                        <>
                                            <span className="toolbar-separator" />
                                            <button className="toolbar-icon-btn" disabled title="Collapse all" aria-label="Collapse all">
                                                <CollapseAllIcon size={16} />
                                            </button>
                                            <button className="toolbar-icon-btn" disabled title="Expand all" aria-label="Expand all">
                                                <ExpandAllIcon size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                                <button className="btn btn-primary" disabled>
                                    Update All (0)
                                </button>
                            </div>
                            <div className="loading-spinner-container" aria-busy="true" aria-label="Checking for updates">
                                <div className="loading-spinner"></div>
                                <p>{isAllProjects ? 'Checking updates for all projects...' : 'Checking for updates...'}</p>
                            </div>
                        </>
                    ) : hasNoUpdates ? (
                        <>
                            <div className="updates-toolbar">
                                <div className="toolbar-actions-left">
                                    <button
                                        className="toolbar-icon-btn"
                                        disabled
                                        title="Select all"
                                        aria-label="Select all"
                                    >
                                        <CheckAllIcon size={16} />
                                    </button>
                                    {isAllProjects && (
                                        <>
                                            <span className="toolbar-separator" />
                                            <button className="toolbar-icon-btn" disabled title="Collapse all" aria-label="Collapse all">
                                                <CollapseAllIcon size={16} />
                                            </button>
                                            <button className="toolbar-icon-btn" disabled title="Expand all" aria-label="Expand all">
                                                <ExpandAllIcon size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                                <button className="btn btn-primary" disabled>
                                    Update All (0)
                                </button>
                            </div>
                            <p className="empty-state">
                                {isAllProjects
                                    ? 'All packages are up to date across all projects'
                                    : installedPackages.length === 0
                                        ? 'No packages installed'
                                        : 'All packages are up to date'}
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="updates-toolbar">
                                <div className="toolbar-actions-left">
                                    <button
                                        className={`toolbar-icon-btn${allSelected ? ' active' : ''}`}
                                        data-testid="select-all-button"
                                        onClick={handleToggleSelectAll}
                                        disabled={updatingAll}
                                        title={allSelected ? 'Deselect all' : 'Select all'}
                                        aria-label={allSelected ? 'Deselect all' : 'Select all'}
                                    >
                                        <CheckAllIcon size={16} />
                                    </button>
                                    {isAllProjects && allProjectsUpdates.length > 0 && (
                                        <>
                                            <span className="toolbar-separator" />
                                            <button
                                                className="toolbar-icon-btn"
                                                onClick={() => setExpandedProjects(new Set())}
                                                disabled={updatingAll}
                                                title="Collapse all"
                                                aria-label="Collapse all"
                                            >
                                                <CollapseAllIcon size={16} />
                                            </button>
                                            <button
                                                className="toolbar-icon-btn"
                                                onClick={() => setExpandedProjects(new Set(allProjectsUpdates.map(p => p.projectPath)))}
                                                disabled={updatingAll}
                                                title="Expand all"
                                                aria-label="Expand all"
                                            >
                                                <ExpandAllIcon size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                                <button
                                    className="btn btn-primary"
                                    data-testid="update-all-button"
                                    onClick={handleUpdateAll}
                                    disabled={selectedUpdates.size === 0 || updatingAll}
                                >
                                    {updatingAll ? 'Updating...' : `Update All (${selectedUpdates.size})`}
                                </button>
                            </div>

                            {isAllProjects ? (
                                /* Multi-project mode: render flattened list with project headers */
                                <div
                                    ref={updatesListRef}
                                    className={`package-list${isAllProjectsStale ? ' stale' : ''}`}
                                    tabIndex={0}
                                    style={{ height: `${updatesVirtualizer.getTotalSize()}px`, position: 'relative' }}
                                >
                                    {updatesVirtualizer.getVirtualItems().map(virtualRow => {
                                        const item = deferredFlattenedItems[virtualRow.index];
                                        if (!item) { return null; }

                                        if (item.type === 'header') {
                                            const isExpanded = expandedProjects.has(item.projectPath);
                                            return (
                                                <button
                                                    key={`header-${item.projectPath}`}
                                                    data-index={virtualRow.index}
                                                    ref={updatesVirtualizer.measureElement}
                                                    className="direct-packages-header project-section-header"
                                                    onClick={() => setExpandedProjects(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(item.projectPath)) {
                                                            next.delete(item.projectPath);
                                                        } else {
                                                            next.add(item.projectPath);
                                                        }
                                                        return next;
                                                    })}
                                                    aria-expanded={isExpanded}
                                                    title={item.projectPath}
                                                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                                                >
                                                    <span className="direct-packages-arrow">{isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}</span>
                                                    <span className="direct-packages-title">
                                                        {item.projectName}
                                                        {!isExpanded && <span className="direct-packages-count">({item.updateCount} update{item.updateCount !== 1 ? 's' : ''})</span>}
                                                    </span>
                                                </button>
                                            );
                                        }

                                        // Package item
                                        const compositeKey = `${item.projectPath}::${item.id}`;
                                        return (
                                            <div
                                                key={compositeKey}
                                                data-index={virtualRow.index}
                                                ref={updatesVirtualizer.measureElement}
                                                className={`package-item${selectedPackage && getPackageId(selectedPackage).toLowerCase() === item.id.toLowerCase() ? ' selected' : ''}`}
                                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                                                onClick={() => {
                                                    const installedPkg = { id: item.id, version: item.installedVersion } as InstalledPackage;
                                                    onActiveProjectPathChange(item.projectPath);
                                                    onSelectPackage(installedPkg, {
                                                        selectedVersionValue: item.latestVersion,
                                                        metadataVersion: item.latestVersion,
                                                        initialVersions: [item.latestVersion, item.installedVersion],
                                                    });
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="update-checkbox"
                                                    checked={selectedUpdates.has(compositeKey)}
                                                    onChange={() => handleToggleUpdateSelection(compositeKey)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    disabled={updatingAll}
                                                />
                                                <div className="package-icon">
                                                    {item.iconUrl ? (
                                                        <img src={item.iconUrl} alt="" onError={(e) => { (e.target as HTMLImageElement).src = defaultPackageIcon; }} />
                                                    ) : (
                                                        <img src={defaultPackageIcon} alt="" />
                                                    )}
                                                </div>
                                                <div className="package-info">
                                                    <div className="package-name">{item.id}</div>
                                                    <div className="package-meta">
                                                        <span className="package-version">v{item.installedVersion}</span>
                                                        <span className="package-update-arrow"><ArrowRightIcon size={12} /></span>
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
                                            onActiveProjectPathChange('');
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
                                                    onActiveProjectPathChange('');
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
                                                        <span className="package-update-arrow"><ArrowRightIcon size={12} /></span>
                                                        <span className="package-version package-version-new">v{pkg.latestVersion}</span>
                                                    </div>
                                                    {pkg.authors && (
                                                        <div className="package-authors">
                                                            {pkg.verified && (
                                                                <span className="verified-badge" title="The ID prefix of this package has been reserved by its owner on nuget.org"><VerifiedIcon size={14} /></span>
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
                            {isStreaming && (
                                <div className="streaming-indicator" aria-busy="true" aria-label="Checking for more updates">
                                    <div className="loading-spinner loading-spinner-small"></div>
                                    <span>Checking for more updates...</span>
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
                        activeProjectPath={activeProjectPath}
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

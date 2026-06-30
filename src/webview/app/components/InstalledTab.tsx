/**
 * InstalledTab Component
 *
 * Renders the Installed tab content: filter bar, collapsible direct packages
 * list with bulk uninstall, transitive packages per-framework sections, and
 * details panel (transitive details or shared PackageDetailsPanel).
 *
 * Owns: directPackagesExpanded, selectedUninstalls,
 *       uninstallingAll, transitive* state, restoringProject.
 * Receives: installedPackages, loadingInstalled, selectedPackage, etc. as props.
 *
 * Always-mounted with display:none when not active (preserves internal state).
 *
 * Exposed via forwardRef/useImperativeHandle:
 *   - handleMessage(message): handles transitivePackages, transitiveMetadata,
 *     restoreProjectResult, bulkRemoveResult, bulkRemoveConfirmed
 *   - resetTransitiveState(refetch): resets transitive state, optionally refetches
 *   - focusAndSelectFirst(): focuses list and selects first item
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import React, { forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { CheckAllIcon, ChevronDownIcon, ChevronRightIcon, CollapseAllIcon, ExpandAllIcon, RulerIcon, SyncIcon, VerifiedIcon, WarningIcon } from '../icons';
import type {
    AllProjectsTransitiveRow,
    InstalledPackage,
    LRUMap,
    PackageMetadata,
    PackageSearchResult,
    ProjectInstalled,
    SelectedTransitivePackage,
    TransitiveFrameworkSection,
    TransitivePackage,
    VsCodeApi,
    VulnerabilitySeverity,
    WebviewMessage
} from '../types';
import { getPackageId } from '../types';
import { groupOriginsByProject } from '../utils/groupOriginsByProject';
import { MemoizedPackageDetailsPanel } from './PackageDetailsPanel';

const ESTIMATED_ITEM_HEIGHT = 66; // padding (12*2) + icon (32) + gaps
const HEADER_HEIGHT = 40; // project group header height in all-projects mode

/**
 * Loading-state skeleton rows that match the installed-package row height. Replaces the
 * centered spinner so there is no spinner→list layout shift and loading feels faster.
 */
function PackageListSkeleton({ rows = 8, label }: { rows?: number; label: string }) {
    return (
        <div className="package-list-skeleton" role="status" aria-busy="true" aria-label={label}>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="skeleton-row">
                    <div className="skeleton-icon" />
                    <div className="skeleton-lines">
                        <div className="skeleton-line skeleton-line-title" />
                        <div className="skeleton-line skeleton-line-sub" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface InstalledTabProps {
    // Tab visibility
    activeTab: string;

    // Data
    installedPackages: InstalledPackage[];
    loadingInstalled: boolean;
    selectedPackage: PackageSearchResult | InstalledPackage | null;
    selectedTransitivePackage: SelectedTransitivePackage | null;
    selectedProject: string;
    splitPosition: number;
    defaultPackageIcon: string;
    includePrerelease: boolean;
    selectedSource: string;

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
    onSelectDirectPackage: (pkg: InstalledPackage, options: {
        selectedVersionValue: string;
        metadataVersion: string;
        initialVersions: string[];
    }) => void;
    onSelectTransitivePackage: (pkg: TransitivePackage, origins?: import('../types').AllProjectsTransitiveOrigin[]) => void;
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
    onSetSelectedTransitivePackage: (pkg: SelectedTransitivePackage | null) => void;
    onSetSelectedVersion: (version: string) => void;
    setSplitPosition: (pos: number) => void;
    handleSashReset: () => void;
    handleSashDragEnd: (pos: number) => void;

    // External filter (from unified search bar in App.tsx)
    externalFilter: string;
    externalFilterMode: 'plain' | 'vulnerable';

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

    // Hover prefetch
    onRowMouseEnter?: (packageId: string, version?: string) => void;
    onRowMouseLeave?: () => void;

    // External refs
    installedTabRef: React.RefObject<HTMLButtonElement | null>;
    MemoizedDraggableSash: React.MemoExoticComponent<React.FC<{
        onDrag: (pos: number) => void;
        onReset: () => void;
        onDragEnd?: (pos: number) => void;
    }>>;

    // All-projects mode
    isAllProjects: boolean;
    allProjectsInstalled: ProjectInstalled[];
    loadingAllProjectsInstalled: boolean;

    // Active project path (set when clicking a package in all-projects mode)
    activeProjectPath: string;
    onActiveProjectPathChange: (path: string) => void;

    // All-projects transitive (aggregated from App.tsx state)
    allProjectsTransitiveRows: AllProjectsTransitiveRow[];
    loadingAllProjectsTransitive: boolean;
    allProjectsTransitiveErrored: Array<{ projectPath: string; projectName: string; errorKind?: string; missing?: boolean }>;
    restoringProjectsBatch: boolean;
    onAllProjectsTransitiveExpandedChange: (expanded: boolean) => void;
    onRestoreProjectsBatch: (projectPaths: string[]) => void;
}

// ─── Handle ──────────────────────────────────────────────────────────────────

export interface InstalledTabHandle {
    /** Handle installed-tab-specific messages */
    handleMessage: (message: WebviewMessage) => void;
    /** Reset transitive state (optionally refetch) — called after install/update/remove */
    resetTransitiveState: (refetch?: boolean, forceRestore?: boolean) => void;
    /** Focus the installed list and select first item */
    focusAndSelectFirst: () => void;
}

// ─── Shared package row content (icon + badges + version + authors) ──────────

function PackageRowContent({ pkg, defaultPackageIcon }: { pkg: InstalledPackage; defaultPackageIcon: string }) {
    return (
        <>
            <div className="package-icon">
                {pkg.iconUrl ? (
                    <img src={pkg.iconUrl} alt="" onError={(e) => { (e.target as HTMLImageElement).src = defaultPackageIcon; }} />
                ) : (
                    <img src={defaultPackageIcon} alt="" />
                )}
            </div>
            <div className="package-info">
                <div className="package-name">
                    {pkg.id}
                    {pkg.isImplicit && (
                        <span className="implicit-badge" title="SDK-managed package - not directly referenced in project file">SDK</span>
                    )}
                    {pkg.versionType === 'floating' && (
                        <span className="floating-badge" title="This package uses a floating version pattern"><SyncIcon size={12} /></span>
                    )}
                    {pkg.versionType === 'range' && (
                        <span className="floating-badge" title="This package uses a version range"><RulerIcon size={12} /></span>
                    )}
                    {pkg.vulnerabilities && pkg.vulnerabilities.length > 0 && (
                        <span
                            className={`vulnerability-badge vuln-${pkg.vulnerabilities.reduce<VulnerabilitySeverity>((max, v) => {
                                const order = { Low: 0, Moderate: 1, High: 2, Critical: 3 };
                                return order[v.severity] > order[max] ? v.severity : max;
                            }, 'Low')}`}
                            title={`${pkg.vulnerabilities.length} known vulnerabilit${pkg.vulnerabilities.length > 1 ? 'ies' : 'y'}`}
                        >
                            <WarningIcon size={12} />
                        </span>
                    )}
                </div>
                <div className="package-meta">
                    {pkg.isAlwaysLatest ? (
                        <span className="package-version" title="This package always gets the latest version">
                            * (always latest{pkg.resolvedVersion ? `: ${pkg.resolvedVersion}` : ''})
                        </span>
                    ) : pkg.versionType === 'floating' || pkg.versionType === 'range' ? (
                        <span className="package-version">
                            {pkg.version}
                            {pkg.resolvedVersion ? (
                                <span className="resolved-version"> ({pkg.resolvedVersion})</span>
                            ) : (
                                <span className="resolved-version resolved-unknown"> (run restore)</span>
                            )}
                        </span>
                    ) : (
                        <span className="package-version">v{pkg.version}</span>
                    )}
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
        </>
    );
}

// ─── Component ───────────────────────────────────────────────────────────────

const InstalledTab = forwardRef<InstalledTabHandle, InstalledTabProps>(function InstalledTab(props, ref) {
    const {
        activeTab,
        installedPackages,
        loadingInstalled,
        selectedPackage,
        selectedTransitivePackage,
        selectedProject,
        splitPosition,
        defaultPackageIcon,
        includePrerelease,
        selectedSource,
        packageMetadata,
        loadingMetadata,
        loadingVersions,
        packageVersions,
        selectedVersion,
        detailsTab,
        loadingReadme,
        sanitizedReadmeHtml,
        expandedDeps,
        onSelectDirectPackage,
        onSelectTransitivePackage,
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
        externalFilter = '',
        externalFilterMode = 'plain',
        createPackageListKeyHandler,
        metadataCache,
        vscode,
        onRowMouseEnter,
        onRowMouseLeave,
        installedTabRef,
        MemoizedDraggableSash,
        isAllProjects,
        allProjectsInstalled,
        loadingAllProjectsInstalled,
        activeProjectPath,
        onActiveProjectPathChange,
        allProjectsTransitiveRows,
        loadingAllProjectsTransitive,
        allProjectsTransitiveErrored,
        restoringProjectsBatch,
        onAllProjectsTransitiveExpandedChange,
        onRestoreProjectsBatch,
    } = props;

    // ─── Internal state ──────────────────────────────────────────────────────

    // Direct packages section state (default expanded)
    const [directPackagesExpanded, setDirectPackagesExpanded] = useState(true);

    // Bulk uninstall state
    const [selectedUninstalls, setSelectedUninstalls] = useState<Set<string>>(new Set());
    // Ref mirror of selectedUninstalls for synchronous reads in callbacks.
    // React 19 runs setState updaters asynchronously/batched, so reading
    // state via closure after setState may return stale values. The ref is
    // updated synchronously each render and used in handleUninstallSelected.
    const selectedUninstallsRef = useRef<Set<string>>(selectedUninstalls);
    selectedUninstallsRef.current = selectedUninstalls;
    const [uninstallingAll, setUninstallingAll] = useState(false);

    // All-projects installed mode state
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
    const [selectedUninstallsAllProjects, setSelectedUninstallsAllProjects] = useState<Set<string>>(new Set());
    const selectedUninstallsAllProjectsRef = useRef<Set<string>>(selectedUninstallsAllProjects);
    selectedUninstallsAllProjectsRef.current = selectedUninstallsAllProjects;

    // Transitive packages section state (multi-framework support)
    const [transitiveFrameworks, setTransitiveFrameworks] = useState<TransitiveFrameworkSection[]>([]);
    const [transitiveExpandedFrameworks, setTransitiveExpandedFrameworks] = useState<Set<string>>(new Set());
    const [transitiveLoadingMetadata, setTransitiveLoadingMetadata] = useState<Set<string>>(new Set());
    // Ref mirror of transitiveLoadingMetadata for synchronous reads.
    // React 19 runs setState updaters asynchronously/batched, so reading
    // state via closure after setState returns stale values. The ref is
    // updated synchronously and used to compute what to fetch, while the
    // state drives UI rendering.
    const transitiveLoadingMetadataRef = useRef<Set<string>>(new Set());
    const [loadingTransitive, setLoadingTransitive] = useState(false);
    const [transitiveDataSourceAvailable, setTransitiveDataSourceAvailable] = useState<boolean | null>(null);
    const [restoringProject, setRestoringProject] = useState(false);

    // All-projects transitive section state (collapsed by default; lazy-loaded on expand)
    const [allProjectsTransitiveExpanded, setAllProjectsTransitiveExpanded] = useState(false);

    // Ref for the installed package list container
    const installedListRef = useRef<HTMLDivElement>(null);
    // Scroll container ref for the virtualizer (the package-list-panel div)
    const installedScrollRef = useRef<HTMLDivElement>(null);

    // ─── Derived state ───────────────────────────────────────────────────────

    const sortedInstalledPackages = useMemo(() =>
        [...installedPackages].sort((a, b) => a.id.localeCompare(b.id)),
        [installedPackages]
    );

    // Installed tab: client-side filter by package ID (case-insensitive contains)
    // Uses external filter/mode from the unified search bar in App.tsx
    const filteredInstalledPackages = useMemo(() => {
        let base = sortedInstalledPackages;
        if (externalFilterMode === 'vulnerable') {
            base = base.filter(pkg => pkg.vulnerabilities && pkg.vulnerabilities.length > 0);
        }
        if (!externalFilter) { return base; }
        const lower = externalFilter.toLowerCase();
        return base.filter(pkg => pkg.id.toLowerCase().includes(lower));
    }, [sortedInstalledPackages, externalFilter, externalFilterMode]);

    // React 19: Deferred value for non-blocking UI during heavy list updates
    const deferredInstalledPackages = useDeferredValue(filteredInstalledPackages);
    const isInstalledStale = filteredInstalledPackages !== deferredInstalledPackages;

    // ─── All-projects installed flattening ────────────────────────────────

    type FlattenedInstalledItem =
        | { type: 'folderHeader'; folder: string }
        | { type: 'header'; projectPath: string; projectName: string; packageCount: number; error?: string }
        | ({ type: 'package'; projectPath: string } & InstalledPackage);

    const flattenedAllProjectsInstalled = useMemo((): FlattenedInstalledItem[] => {
        if (!isAllProjects) { return []; }
        const q = externalFilter.toLowerCase();
        const items: FlattenedInstalledItem[] = [];
        const sortedProjects = [...allProjectsInstalled].sort((a, b) => {
            if (a.projectPath === selectedProject) { return -1; }
            if (b.projectPath === selectedProject) { return 1; }
            return a.projectName.localeCompare(b.projectName);
        });
        // Multi-root grouping: when projects span 2+ workspace folders, inject folder headers.
        const distinctFolders = new Set(
            sortedProjects.map(p => p.workspaceFolder).filter((f): f is string => !!f)
        );
        const groupByFolder = distinctFolders.size > 1;
        const renderProject = (project: ProjectInstalled) => {
            let base = project.packages;
            if (externalFilterMode === 'vulnerable') {
                base = base.filter(p => p.vulnerabilities && p.vulnerabilities.length > 0);
            }
            const filtered = q
                ? base.filter(p => p.id.toLowerCase().includes(q))
                : base;
            items.push({
                type: 'header',
                projectPath: project.projectPath,
                projectName: project.projectName,
                packageCount: filtered.length,
                // Plan 10 (I4): surface per-project enumeration errors inline.
                error: project.error,
            });
            if (expandedProjects.has(project.projectPath)) {
                const sorted = [...filtered].sort((a, b) => a.id.localeCompare(b.id));
                for (const pkg of sorted) {
                    items.push({ type: 'package', projectPath: project.projectPath, ...pkg });
                }
            }
        };
        if (groupByFolder) {
            // Group projects by workspace folder; sort folder names alphabetically,
            // but project order within each folder preserves the existing ordering
            // (selected project pinned first, then alphabetical).
            const byFolder = new Map<string, ProjectInstalled[]>();
            const unfoldered: ProjectInstalled[] = [];
            for (const p of sortedProjects) {
                if (p.workspaceFolder) {
                    const arr = byFolder.get(p.workspaceFolder);
                    if (arr) { arr.push(p); }
                    else { byFolder.set(p.workspaceFolder, [p]); }
                } else {
                    unfoldered.push(p);
                }
            }
            const folderNames = [...byFolder.keys()].sort((a, b) => a.localeCompare(b));
            for (const folder of folderNames) {
                items.push({ type: 'folderHeader', folder });
                for (const project of byFolder.get(folder) ?? []) { renderProject(project); }
            }
            if (unfoldered.length > 0) {
                items.push({ type: 'folderHeader', folder: '(other)' });
                for (const project of unfoldered) { renderProject(project); }
            }
        } else {
            for (const project of sortedProjects) { renderProject(project); }
        }
        return items;
    }, [isAllProjects, allProjectsInstalled, expandedProjects, externalFilter, externalFilterMode, selectedProject]);

    const deferredFlattenedInstalled = useDeferredValue(flattenedAllProjectsInstalled);
    const isAllProjectsInstalledStale = flattenedAllProjectsInstalled !== deferredFlattenedInstalled;

    // Total uninstallable packages across all projects (non-implicit)
    const allProjectsUninstallableCount = useMemo(() => {
        if (!isAllProjects) { return 0; }
        let count = 0;
        for (const project of allProjectsInstalled) {
            count += project.packages.filter(p => !p.isImplicit).length;
        }
        return count;
    }, [isAllProjects, allProjectsInstalled]);

    // Virtualizer for direct packages list (same pattern as BrowseTab)
    const installedVirtualizerCount = isAllProjects
        ? deferredFlattenedInstalled.length
        : deferredInstalledPackages.length;
    const installedVirtualizer = useVirtualizer({
        count: installedVirtualizerCount,
        getScrollElement: () => installedScrollRef.current,
        estimateSize: (index) => {
            if (isAllProjects) {
                const t = deferredFlattenedInstalled[index]?.type;
                if (t === 'header') { return HEADER_HEIGHT; }
                if (t === 'folderHeader') { return HEADER_HEIGHT; }
            }
            return ESTIMATED_ITEM_HEIGHT;
        },
        overscan: 5,
    });

    // Packages that can be uninstalled (not implicit/transitive) — scoped to filtered list
    const uninstallablePackages = useMemo(() =>
        filteredInstalledPackages.filter(p => !p.isImplicit),
        [filteredInstalledPackages]
    );

    // Count of selected packages that are currently visible (not hidden by filter)
    const visibleSelectedCount = useMemo(() => {
        let count = 0;
        for (const pkg of uninstallablePackages) {
            if (selectedUninstalls.has(pkg.id)) { count++; }
        }
        return count;
    }, [uninstallablePackages, selectedUninstalls]);

    // ─── Callbacks ───────────────────────────────────────────────────────────

    const handleToggleUninstallSelection = useCallback((packageId: string) => {
        setSelectedUninstalls(prev => {
            const newSet = new Set(prev);
            if (newSet.has(packageId)) {
                newSet.delete(packageId);
            } else {
                newSet.add(packageId);
            }
            return newSet;
        });
    }, []);

    // React 19: Use memoized uninstallablePackages instead of filtering on every call
    const handleToggleSelectAllInstalled = useCallback(() => {
        if (visibleSelectedCount === uninstallablePackages.length && uninstallablePackages.length > 0) {
            // All visible uninstallable selected, deselect all visible
            setSelectedUninstalls(prev => {
                const newSet = new Set(prev);
                for (const p of uninstallablePackages) { newSet.delete(p.id); }
                return newSet;
            });
        } else {
            // Select all visible uninstallable (preserve selections for hidden packages)
            setSelectedUninstalls(prev => {
                const newSet = new Set(prev);
                for (const p of uninstallablePackages) { newSet.add(p.id); }
                return newSet;
            });
        }
    }, [visibleSelectedCount, uninstallablePackages]);

    const handleUninstallSelected = useCallback(() => {
        // Read from ref to guarantee latest selections (avoids React 19 stale closure)
        const currentSelections = selectedUninstallsRef.current;
        if (!selectedProject || currentSelections.size === 0) {
            return;
        }
        const packagesToRemove = installedPackages
            .filter(p => currentSelections.has(p.id) && !p.isImplicit)
            .map(p => p.id);

        if (packagesToRemove.length === 0) {
            return;
        }

        // Request confirmation from extension (shows VS Code dialog with dependency warning)
        vscode.postMessage({
            type: 'confirmBulkRemove',
            projectPath: selectedProject,
            packages: packagesToRemove
        });
    }, [selectedProject, installedPackages, vscode]);

    // ─── All-Projects Mode Callbacks ─────────────────────────────────────────

    // Initialize expanded projects when all-projects data arrives
    useEffect(() => {
        if (allProjectsInstalled.length > 0) {
            setExpandedProjects(new Set(allProjectsInstalled.map(p => p.projectPath)));
        }
    }, [allProjectsInstalled]);

    // Reset selections when all-projects mode changes
    useEffect(() => {
        setSelectedUninstallsAllProjects(new Set());
    }, [allProjectsInstalled, isAllProjects]);

    const handleToggleProject = useCallback((projectPath: string) => {
        setExpandedProjects(prev => {
            const next = new Set(prev);
            if (next.has(projectPath)) {
                next.delete(projectPath);
            } else {
                next.add(projectPath);
            }
            return next;
        });
    }, []);

    const handleToggleUninstallAllProjects = useCallback((compositeKey: string) => {
        setSelectedUninstallsAllProjects(prev => {
            const next = new Set(prev);
            if (next.has(compositeKey)) {
                next.delete(compositeKey);
            } else {
                next.add(compositeKey);
            }
            return next;
        });
    }, []);

    const handleToggleSelectAllAllProjects = useCallback(() => {
        // Collect all uninstallable composite keys across all projects
        const allKeys: string[] = [];
        for (const project of allProjectsInstalled) {
            for (const pkg of project.packages) {
                if (!pkg.isImplicit) {
                    allKeys.push(`${project.projectPath}::${pkg.id}`);
                }
            }
        }

        if (selectedUninstallsAllProjects.size === allKeys.length && allKeys.length > 0) {
            // All selected -> deselect all
            setSelectedUninstallsAllProjects(new Set());
        } else {
            // Select all
            setSelectedUninstallsAllProjects(new Set(allKeys));
        }
    }, [allProjectsInstalled, selectedUninstallsAllProjects]);

    const handleUninstallSelectedAllProjects = useCallback(() => {
        const currentSelections = selectedUninstallsAllProjectsRef.current;
        if (currentSelections.size === 0) { return; }

        // Group selected packages by project
        const projectMap = new Map<string, { projectPath: string; projectName: string; packages: string[] }>();
        for (const compositeKey of currentSelections) {
            const separatorIndex = compositeKey.indexOf('::');
            if (separatorIndex === -1) { continue; }
            const projectPath = compositeKey.substring(0, separatorIndex);
            const packageId = compositeKey.substring(separatorIndex + 2);

            let entry = projectMap.get(projectPath);
            if (!entry) {
                const project = allProjectsInstalled.find(p => p.projectPath === projectPath);
                entry = {
                    projectPath,
                    projectName: project?.projectName ?? projectPath,
                    packages: []
                };
                projectMap.set(projectPath, entry);
            }
            entry.packages.push(packageId);
        }

        const projectRemovals = [...projectMap.values()];
        if (projectRemovals.length === 0) { return; }

        vscode.postMessage({
            type: 'confirmBulkRemoveAllProjects',
            projectRemovals
        });
    }, [allProjectsInstalled, vscode]);

    // Handle expanding/collapsing individual framework sections (lazy load metadata on first expand)
    const handleToggleTransitiveFramework = useCallback((targetFramework: string) => {
        const isCurrentlyExpanded = transitiveExpandedFrameworks.has(targetFramework);

        if (!isCurrentlyExpanded && selectedProject) {
            // Expanding - check if we need to load metadata
            const framework = transitiveFrameworks.find(f => f.targetFramework === targetFramework);
            if (framework && !framework.metadataLoaded) {
                // Check ref synchronously — React 19 defers setState updaters,
                // so we cannot rely on reading values assigned inside an updater.
                if (!transitiveLoadingMetadataRef.current.has(targetFramework)) {
                    transitiveLoadingMetadataRef.current.add(targetFramework);
                    setTransitiveLoadingMetadata(new Set(transitiveLoadingMetadataRef.current));
                    vscode.postMessage({
                        type: 'getTransitiveMetadata',
                        targetFramework: targetFramework,
                        packages: framework.packages,
                        projectPath: selectedProject
                    });
                }
            }
        }

        setTransitiveExpandedFrameworks(prev => {
            const next = new Set(prev);
            if (isCurrentlyExpanded) {
                next.delete(targetFramework);
            } else {
                next.add(targetFramework);
            }
            return next;
        });

        // Clear selected transitive package when collapsing
        if (isCurrentlyExpanded) {
            onSetSelectedTransitivePackage(null);
        }
    }, [transitiveExpandedFrameworks, selectedProject, transitiveFrameworks, onSetSelectedTransitivePackage, vscode]);

    const handleLoadTransitiveFrameworks = useCallback(() => {
        if (!selectedProject || loadingTransitive) { return; }
        if (transitiveDataSourceAvailable === null) {
            setLoadingTransitive(true);
            vscode.postMessage({
                type: 'getTransitivePackages',
                projectPath: selectedProject
            });
        }
    }, [selectedProject, loadingTransitive, transitiveDataSourceAvailable, vscode]);

    // Handle restoring project to generate project.assets.json
    const handleRestoreProject = useCallback(() => {
        if (!selectedProject) { return; }
        setRestoringProject(true);
        vscode.postMessage({
            type: 'restoreProject',
            projectPath: selectedProject
        });
    }, [selectedProject, vscode]);

    // ─── Internal reset helper ───────────────────────────────────────────────

    const doResetTransitiveState = useCallback((refetch: boolean, forceRestore?: boolean) => {
        setTransitiveFrameworks([]);
        setTransitiveExpandedFrameworks(new Set());
        transitiveLoadingMetadataRef.current = new Set();
        setTransitiveLoadingMetadata(new Set());
        setTransitiveDataSourceAvailable(null);
        if (refetch && selectedProject) {
            setLoadingTransitive(true);
            vscode.postMessage({
                type: 'getTransitivePackages',
                projectPath: selectedProject,
                ...(forceRestore ? { forceRestore: true } : {})
            });
        } else {
            // Ensure loadingTransitive is cleared when not refetching,
            // otherwise it can get stuck at true if a reset races with
            // an in-flight getTransitivePackages request whose response
            // arrives with a stale projectPath.
            setLoadingTransitive(false);
        }
    }, [selectedProject, vscode]);

    // ─── Effects ─────────────────────────────────────────────────────────────

    // Auto-refetch transitive frameworks when state is reset (after package install/update/remove)
    useEffect(() => {
        if (!isAllProjects && transitiveDataSourceAvailable === null && selectedProject && !loadingTransitive && transitiveFrameworks.length === 0) {
            // Only auto-fetch if we have expanded frameworks (meaning user had the section open)
            if (transitiveExpandedFrameworks.size > 0) {
                setLoadingTransitive(true);
                vscode.postMessage({
                    type: 'getTransitivePackages',
                    projectPath: selectedProject
                });
            }
        }
    }, [isAllProjects, transitiveDataSourceAvailable, selectedProject, loadingTransitive, transitiveFrameworks.length, transitiveExpandedFrameworks.size, vscode]);

    // Prefetch transitive packages in background after direct packages are loaded
    const TRANSITIVE_PREFETCH_DELAY_MS = 500;
    useEffect(() => {
        if (!isAllProjects && selectedProject && !loadingInstalled && installedPackages.length >= 0 && transitiveDataSourceAvailable === null && !loadingTransitive) {
            // Direct packages finished loading - defer transitive fetch to reduce network
            // pressure during metadata/update fetching (runs concurrently with those)
            const timer = setTimeout(() => {
                setLoadingTransitive(true);
                vscode.postMessage({
                    type: 'getTransitivePackages',
                    projectPath: selectedProject
                });
            }, TRANSITIVE_PREFETCH_DELAY_MS);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [isAllProjects, selectedProject, loadingInstalled, installedPackages.length, transitiveDataSourceAvailable, loadingTransitive, vscode]);

    // Prefetch transitive metadata in background after framework list loads
    // This enables instant expansion of transitive sections without loading delay
    // NOTE: transitiveLoadingMetadata is intentionally NOT in deps to avoid circular re-execution.
    // We use the functional update form of setTransitiveLoadingMetadata to read current state.
    useEffect(() => {
        if (!selectedProject || transitiveFrameworks.length === 0) {
            return;
        }

        // Use ref for synchronous check — React 19 defers setState updaters,
        // so the old pattern of assigning a local variable inside an updater
        // and reading it after setState would always yield the initial value.
        const frameworksToFetch = transitiveFrameworks.filter(f =>
            !f.metadataLoaded && !transitiveLoadingMetadataRef.current.has(f.targetFramework)
        );

        if (frameworksToFetch.length === 0) { return; }

        // Mark as loading in ref (synchronous) and state (for UI)
        for (const f of frameworksToFetch) {
            transitiveLoadingMetadataRef.current.add(f.targetFramework);
        }
        setTransitiveLoadingMetadata(new Set(transitiveLoadingMetadataRef.current));

        // Trigger metadata fetch for each framework (backend handles rate limiting)
        for (const framework of frameworksToFetch) {
            vscode.postMessage({
                type: 'getTransitiveMetadata',
                targetFramework: framework.targetFramework,
                packages: framework.packages,
                projectPath: selectedProject
            });
        }
    }, [selectedProject, transitiveFrameworks, vscode]);

    // ─── Imperative handle ───────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
        handleMessage: (message: WebviewMessage) => {
            switch (message.type) {
                case 'transitivePackages':
                    if (message.projectPath === selectedProject) {
                        const frameworks = message.frameworks || [];
                        setTransitiveFrameworks(frameworks);
                        setTransitiveDataSourceAvailable(message.dataSourceAvailable);
                        setLoadingTransitive(false);
                        // Otherwise sections stay collapsed - user expands manually, metadata loads on expand
                    }
                    break;
                case 'transitiveMetadata':
                    if (message.projectPath === selectedProject) {
                        // Update packages with metadata for the specific framework
                        setTransitiveFrameworks(prev => prev.map(f =>
                            f.targetFramework === message.targetFramework
                                ? { ...f, packages: message.packages, metadataLoaded: true }
                                : f
                        ));
                        transitiveLoadingMetadataRef.current.delete(message.targetFramework);
                        setTransitiveLoadingMetadata(new Set(transitiveLoadingMetadataRef.current));
                    }
                    break;
                case 'restoreProjectResult':
                    if (message.projectPath === selectedProject) {
                        setRestoringProject(false);
                        if (message.success) {
                            // Auto-refresh transitive packages after restore
                            setLoadingTransitive(true);
                            vscode.postMessage({
                                type: 'getTransitivePackages',
                                projectPath: selectedProject
                            });
                        }
                    }
                    break;
                case 'bulkRemoveResult':
                    setUninstallingAll(false);
                    setSelectedUninstalls(new Set());
                    // Transitive reset is handled by resetTransitiveState called from App
                    break;
                case 'bulkRemoveConfirmed':
                    // User confirmed the bulk remove, start the operation
                    setUninstallingAll(true);
                    break;
                case 'bulkRemoveAllProjectsConfirmed':
                    // User confirmed the bulk remove across all projects
                    setUninstallingAll(true);
                    break;
                case 'bulkRemoveAllProjectsResult':
                    setUninstallingAll(false);
                    setSelectedUninstallsAllProjects(new Set());
                    break;
            }
        },
        resetTransitiveState: (refetch?: boolean, forceRestore?: boolean) => {
            doResetTransitiveState(refetch ?? false, forceRestore);
        },
        focusAndSelectFirst: () => {
            if (installedListRef.current) {
                installedListRef.current.focus({ preventScroll: true });
            }
            if (deferredInstalledPackages.length > 0) {
                const firstPkg = deferredInstalledPackages[0];
                // If nothing selected yet or selected isn't in the list, select the first
                if (!selectedPackage || !deferredInstalledPackages.find(p => getPackageId(p) === getPackageId(selectedPackage))) {
                    onSetSelectedPackage(firstPkg);
                    onSetSelectedTransitivePackage(null);
                    onSetSelectedVersion(firstPkg.version);
                    onDetailsTabChange('details');
                }
            }
        },
    }));

    // ─── Render ──────────────────────────────────────────────────────────────

    /** Toggle all-projects transitive section. Notifies parent (which fetches lazily). */
    const handleToggleAllProjectsTransitive = useCallback(() => {
        const next = !allProjectsTransitiveExpanded;
        setAllProjectsTransitiveExpanded(next);
        onAllProjectsTransitiveExpandedChange(next);
    }, [allProjectsTransitiveExpanded, onAllProjectsTransitiveExpandedChange]);

    /** Filter all-projects transitive rows by external filter (id substring, case-insensitive). */
    const filteredAllProjectsTransitiveRows = useMemo(() => {
        if (!externalFilter) { return allProjectsTransitiveRows; }
        const needle = externalFilter.toLowerCase();
        return allProjectsTransitiveRows.filter(row =>
            row.id.toLowerCase().includes(needle)
        );
    }, [allProjectsTransitiveRows, externalFilter]);

    // Reset all-projects transitive expanded state when switching out of all-projects mode
    useEffect(() => {
        if (!isAllProjects && allProjectsTransitiveExpanded) {
            setAllProjectsTransitiveExpanded(false);
        }
    }, [isAllProjects, allProjectsTransitiveExpanded]);

    // Memoize details panel content (PackageDetailsPanel or transitive details)
    const detailsPanelContent = useMemo(() => {
        if (selectedTransitivePackage) {
            const hasOrigins = !!selectedTransitivePackage.origins && selectedTransitivePackage.origins.length > 0;

            return (
                <div className="package-details">
                    <div className="details-header">
                        <h3>{selectedTransitivePackage.id}</h3>
                        <span className="sdk-badge">Transitive</span>
                    </div>
                    <div className="details-content">
                        <div className="detail-row">
                            <span className="detail-label">Version:</span>
                            <span className="detail-value">{selectedTransitivePackage.version}</span>
                        </div>
                        {selectedTransitivePackage.authors && (
                            <div className="detail-row">
                                <span className="detail-label">Authors:</span>
                                <span className="detail-value">
                                    {selectedTransitivePackage.verified && (
                                        <span className="verified-badge" title="The ID prefix of this package has been reserved by its owner on nuget.org"><VerifiedIcon size={14} /></span>
                                    )}
                                    {selectedTransitivePackage.authors}
                                </span>
                            </div>
                        )}
                        <div className="detail-row required-by-section">
                            <span className="detail-label">Required by:</span>
                            <div className="required-by-list">
                                {hasOrigins ? (
                                    // All-projects mode — one block per project (origins of the
                                    // same project collapsed), with merged TFM badges + roots.
                                    groupOriginsByProject(selectedTransitivePackage.origins ?? []).map((group) => (
                                        <div key={group.projectPath} className="required-by-project">
                                            <div className="required-by-project-header">
                                                <span className="required-by-project-name" title={group.projectPath}>{group.projectName}</span>
                                                <div className="tfm-badges">
                                                    {group.frameworks.map(tfm => (
                                                        <span key={tfm} className="tfm-badge">{tfm}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="required-by-chain-list">
                                                {group.roots.length === 0 ? (
                                                    <span className="required-by-implicit" title="Could not trace this package back to a top-level dependency">No traceable top-level package</span>
                                                ) : (
                                                    group.roots.map((rootPkg) => (
                                                        <div key={rootPkg} className="required-by-item">
                                                            {rootPkg}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    // Single-project mode — original render
                                    (() => {
                                        const allChains = selectedTransitivePackage.fullChain || selectedTransitivePackage.requiredByChain;
                                        const rootPackages = new Set<string>();
                                        for (const chain of allChains) {
                                            rootPackages.add(chain.split(' → ')[0]);
                                        }
                                        if (rootPackages.size === 0) {
                                            return <span className="required-by-implicit" title="Could not trace this package back to a top-level dependency">No traceable top-level package</span>;
                                        }
                                        return Array.from(rootPackages).map((rootPkg) => (
                                            <div key={rootPkg} className="required-by-item">
                                                {rootPkg}
                                            </div>
                                        ));
                                    })()
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // No transitive selected — show standard details panel
        return (
            <MemoizedPackageDetailsPanel
                selectedPackage={selectedPackage}
                selectedVersion={selectedVersion}
                packageVersions={packageVersions}
                loadingVersions={loadingVersions}
                packageMetadata={packageMetadata}
                loadingMetadata={loadingMetadata}
                detailsTab={detailsTab}
                loadingReadme={loadingReadme}
                sanitizedReadmeHtml={sanitizedReadmeHtml}
                expandedDeps={expandedDeps}
                installedPackages={installedPackages}
                selectedProject={selectedProject}
                includePrerelease={includePrerelease}
                selectedSource={selectedSource}
                activeProjectPath={activeProjectPath}
                allProjectsInstalled={allProjectsInstalled}
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
        );
    }, [
        selectedTransitivePackage,
        selectedPackage,
        selectedVersion,
        packageVersions,
        loadingVersions,
        packageMetadata,
        loadingMetadata,
        detailsTab,
        loadingReadme,
        sanitizedReadmeHtml,
        expandedDeps,
        installedPackages,
        onInstall,
        onRemove,
        onVersionChange,
        onDetailsTabChange,
        onToggleDep,
        onReadmeAttemptedChange,
        onMetadataChange,
        onLoadingMetadataChange,
        metadataCache,
        vscode,
        selectedProject,
        includePrerelease,
        selectedSource,
        activeProjectPath,
        allProjectsInstalled,
    ]);

    return (
        <div className="content browse-content" data-testid="installed-tab" style={{ display: activeTab === 'installed' ? '' : 'none' }}>
            <div className="split-panel">
                <div ref={installedScrollRef} className="package-list-panel" style={{ width: `${splitPosition}%` }}>
                    {!isAllProjects && loadingInstalled ? (
                        <PackageListSkeleton label="Loading installed packages" />
                    ) : !isAllProjects && installedPackages.length === 0 ? (
                        <p className="empty-state">No packages installed</p>
                    ) : (
                        <div className="direct-packages-section">
                            {/* Unified toolbar — same position for single-project and all-projects modes */}
                            <div className="updates-toolbar">
                                <div className="toolbar-actions-left">
                                    {isAllProjects ? (
                                        <>
                                            <button
                                                className={`toolbar-icon-btn${selectedUninstallsAllProjects.size === allProjectsUninstallableCount && allProjectsUninstallableCount > 0 ? ' active' : ''}`}
                                                onClick={handleToggleSelectAllAllProjects}
                                                disabled={loadingAllProjectsInstalled || uninstallingAll || allProjectsUninstallableCount === 0}
                                                title={selectedUninstallsAllProjects.size === allProjectsUninstallableCount && allProjectsUninstallableCount > 0 ? 'Deselect all' : 'Select all'}
                                                aria-label={selectedUninstallsAllProjects.size === allProjectsUninstallableCount && allProjectsUninstallableCount > 0 ? 'Deselect all' : 'Select all'}
                                            >
                                                <CheckAllIcon size={16} />
                                            </button>
                                            <span className="toolbar-separator" />
                                            <button
                                                className="toolbar-icon-btn"
                                                onClick={() => setExpandedProjects(new Set())}
                                                disabled={loadingAllProjectsInstalled || uninstallingAll}
                                                title="Collapse all"
                                                aria-label="Collapse all"
                                            >
                                                <CollapseAllIcon size={16} />
                                            </button>
                                            <button
                                                className="toolbar-icon-btn"
                                                onClick={() => setExpandedProjects(new Set(allProjectsInstalled.map(p => p.projectPath)))}
                                                disabled={loadingAllProjectsInstalled || uninstallingAll}
                                                title="Expand all"
                                                aria-label="Expand all"
                                            >
                                                <ExpandAllIcon size={16} />
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            className={`toolbar-icon-btn${visibleSelectedCount === uninstallablePackages.length && uninstallablePackages.length > 0 ? ' active' : ''}`}
                                            onClick={handleToggleSelectAllInstalled}
                                            disabled={uninstallingAll || uninstallablePackages.length === 0}
                                            title={visibleSelectedCount === uninstallablePackages.length && uninstallablePackages.length > 0 ? 'Deselect all' : 'Select all'}
                                            aria-label={visibleSelectedCount === uninstallablePackages.length && uninstallablePackages.length > 0 ? 'Deselect all' : 'Select all'}
                                        >
                                            <CheckAllIcon size={16} />
                                        </button>
                                    )}
                                    {!isAllProjects && (
                                        <>
                                            <span className="toolbar-separator" />
                                            <button
                                                className="toolbar-icon-btn"
                                                onClick={() => { setDirectPackagesExpanded(false); setTransitiveExpandedFrameworks(new Set()); }}
                                                disabled={uninstallingAll}
                                                title="Collapse all"
                                                aria-label="Collapse all"
                                            >
                                                <CollapseAllIcon size={16} />
                                            </button>
                                            <button
                                                className="toolbar-icon-btn"
                                                onClick={() => { setDirectPackagesExpanded(true); setTransitiveExpandedFrameworks(new Set(transitiveFrameworks.map(f => f.targetFramework))); }}
                                                disabled={uninstallingAll}
                                                title="Expand all"
                                                aria-label="Expand all"
                                            >
                                                <ExpandAllIcon size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                                {isAllProjects ? (
                                    <button
                                        className="btn btn-danger"
                                        data-testid="uninstall-selected-button"
                                        onClick={handleUninstallSelectedAllProjects}
                                        disabled={loadingAllProjectsInstalled || selectedUninstallsAllProjects.size === 0 || uninstallingAll}
                                    >
                                        {uninstallingAll ? 'Uninstalling...' : `Uninstall Selected (${selectedUninstallsAllProjects.size})`}
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-danger"
                                        data-testid="uninstall-selected-button"
                                        onClick={handleUninstallSelected}
                                        disabled={visibleSelectedCount === 0 || uninstallingAll}
                                    >
                                        {uninstallingAll ? 'Uninstalling...' : `Uninstall Selected (${visibleSelectedCount})`}
                                    </button>
                                )}
                            </div>
                            {isAllProjects ? (
                                <div className="direct-packages-content">
                                    {loadingAllProjectsInstalled && allProjectsInstalled.length === 0 ? (
                                        // Plan 10 fix (B1): only show the full-screen spinner while the
                                        // streamed response has produced zero rows. Once the first
                                        // `allProjectsInstalledProjectFound` chunk lands we render the
                                        // (partial) list immediately so users see progressive results
                                        // instead of a spinner that masks the whole stream.
                                        <PackageListSkeleton label="Loading installed packages for all projects" />
                                    ) : allProjectsInstalled.length === 0 ? (
                                        <p className="empty-state">No installed packages found across projects</p>
                                    ) : (
                                        <>
                                            {loadingAllProjectsInstalled && (
                                                // Inline indicator visible while streaming continues
                                                // after the first project arrives.
                                                <div
                                                    className="streaming-indicator"
                                                    role="status"
                                                    aria-live="polite"
                                                    aria-label="Still loading remaining projects"
                                                >
                                                    <span className="loading-spinner loading-spinner-small" aria-hidden="true"></span>
                                                    <span>Loading remaining projects…</span>
                                                </div>
                                            )}
                                            <div
                                                ref={installedListRef}
                                                className={`package-list${isAllProjectsInstalledStale ? ' stale' : ''}`}
                                                tabIndex={0}
                                                style={{ height: `${installedVirtualizer.getTotalSize()}px`, position: 'relative' }}
                                            >
                                                {installedVirtualizer.getVirtualItems().map(virtualRow => {
                                                    const item = deferredFlattenedInstalled[virtualRow.index];
                                                    if (!item) { return null; }

                                                    if (item.type === 'folderHeader') {
                                                        return (
                                                            <div
                                                                key={`folder-${item.folder}`}
                                                                data-index={virtualRow.index}
                                                                ref={installedVirtualizer.measureElement}
                                                                className="all-projects-folder-header"
                                                                style={{
                                                                    position: 'absolute',
                                                                    top: 0,
                                                                    left: 0,
                                                                    width: '100%',
                                                                    transform: `translateY(${virtualRow.start}px)`,
                                                                }}
                                                            >
                                                                <span className="all-projects-folder-name">{item.folder}</span>
                                                            </div>
                                                        );
                                                    }

                                                    if (item.type === 'header') {
                                                        const isExpanded = expandedProjects.has(item.projectPath);
                                                        return (
                                                            <button
                                                                key={`header-${item.projectPath}`}
                                                                data-index={virtualRow.index}
                                                                ref={installedVirtualizer.measureElement}
                                                                className={`direct-packages-header project-section-header${item.error ? ' project-section-header-error' : ''}`}
                                                                onClick={() => handleToggleProject(item.projectPath)}
                                                                aria-expanded={isExpanded}
                                                                title={item.error ? `${item.projectPath}\n\nError: ${item.error}` : item.projectPath}
                                                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                                                            >
                                                                <span className="direct-packages-arrow">{isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}</span>
                                                                <span className="direct-packages-title">
                                                                    {item.projectName}
                                                                    {!isExpanded && <span className="direct-packages-count">({item.packageCount})</span>}
                                                                    {item.error && <span className="project-section-header-error-label" role="status"> — failed to load: {item.error}</span>}
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
                                                            ref={installedVirtualizer.measureElement}
                                                            className={`package-item${selectedPackage && getPackageId(selectedPackage).toLowerCase() === item.id.toLowerCase() ? ' selected' : ''}`}
                                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                                                            onClick={() => {
                                                                onActiveProjectPathChange(item.projectPath);
                                                                onSelectDirectPackage(item, {
                                                                    selectedVersionValue: item.version,
                                                                    metadataVersion: item.resolvedVersion || item.version,
                                                                    initialVersions: [item.version],
                                                                });
                                                            }}
                                                            onMouseEnter={onRowMouseEnter ? () => onRowMouseEnter(item.id, item.resolvedVersion || item.version) : undefined}
                                                            onMouseLeave={onRowMouseLeave}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="update-checkbox"
                                                                checked={selectedUninstallsAllProjects.has(compositeKey)}
                                                                onChange={() => handleToggleUninstallAllProjects(compositeKey)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                disabled={uninstallingAll || item.isImplicit}
                                                                title={item.isImplicit ? 'Implicit/transitive package - cannot be uninstalled directly' : undefined}
                                                            />
                                                            <PackageRowContent pkg={item} defaultPackageIcon={defaultPackageIcon} />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {externalFilter.trim() && deferredFlattenedInstalled.filter(i => i.type === 'package').length === 0 && (
                                                <div className="installed-filter-empty">
                                                    No packages match &lsquo;{externalFilter.trim()}&rsquo;
                                                </div>
                                            )}
                                            {!externalFilter.trim() && externalFilterMode === 'vulnerable' && deferredFlattenedInstalled.filter(i => i.type === 'package').length === 0 && (
                                                <div className="installed-filter-empty">
                                                    No vulnerable packages found
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <button
                                        className="direct-packages-header"
                                        onClick={() => setDirectPackagesExpanded(!directPackagesExpanded)}
                                        aria-expanded={directPackagesExpanded}
                                    >
                                        <span className="direct-packages-arrow">{directPackagesExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}</span>
                                        <span className="direct-packages-title">
                                            Direct packages
                                            <span className="direct-packages-count">
                                                {externalFilter.trim()
                                                    ? `(${filteredInstalledPackages.length} of ${installedPackages.length})`
                                                    : `(${installedPackages.length})`}
                                            </span>
                                        </span>
                                    </button>
                                    {directPackagesExpanded && (
                                        <div className="direct-packages-content">
                                            <div
                                                ref={installedListRef}
                                                className={`package-list${isInstalledStale ? ' stale' : ''}`}
                                                tabIndex={0}
                                                onKeyDown={createPackageListKeyHandler(
                                                    deferredInstalledPackages,
                                                    () => selectedPackage ? getPackageId(selectedPackage) : null,
                                                    (pkg) => {
                                                        onActiveProjectPathChange('');
                                                        onSelectDirectPackage(pkg, {
                                                            selectedVersionValue: pkg.version,
                                                            metadataVersion: pkg.resolvedVersion || pkg.version,
                                                            initialVersions: [pkg.version],
                                                        });
                                                    },
                                                    {
                                                        onDelete: (pkg) => !pkg.isImplicit && onRemove(pkg.id),
                                                        onToggle: (pkg) => !pkg.isImplicit && handleToggleUninstallSelection(pkg.id),
                                                        onLeftArrow: () => detailsTab === 'readme' && onDetailsTabChange('details'),
                                                        onRightArrow: () => detailsTab === 'details' && onDetailsTabChange('readme'),
                                                        onExitTop: () => {
                                                            clearSelection();
                                                            installedTabRef.current?.focus();
                                                        },
                                                        scrollToIndex: (i: number) => installedVirtualizer.scrollToIndex(i, { align: 'auto' })
                                                    }
                                                )}
                                                style={{ height: `${installedVirtualizer.getTotalSize()}px`, position: 'relative' }}
                                            >
                                                {installedVirtualizer.getVirtualItems().map(virtualRow => {
                                                    const pkg = deferredInstalledPackages[virtualRow.index];
                                                    return (
                                                        <div
                                                            key={pkg.id}
                                                            data-index={virtualRow.index}
                                                            ref={installedVirtualizer.measureElement}
                                                            className={`package-item ${selectedPackage && getPackageId(selectedPackage).toLowerCase() === pkg.id.toLowerCase() ? 'selected' : ''}`}
                                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                                                            onClick={() => {
                                                                onActiveProjectPathChange('');
                                                                onSelectDirectPackage(pkg, {
                                                                    selectedVersionValue: pkg.version,
                                                                    metadataVersion: pkg.resolvedVersion || pkg.version,
                                                                    initialVersions: [pkg.version],
                                                                });
                                                            }}
                                                            onMouseEnter={onRowMouseEnter ? () => onRowMouseEnter(pkg.id, pkg.resolvedVersion || pkg.version) : undefined}
                                                            onMouseLeave={onRowMouseLeave}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="update-checkbox"
                                                                checked={selectedUninstalls.has(pkg.id)}
                                                                onChange={() => handleToggleUninstallSelection(pkg.id)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                disabled={uninstallingAll || pkg.isImplicit}
                                                                title={pkg.isImplicit ? 'Implicit/transitive package - cannot be uninstalled directly' : undefined}
                                                            />
                                                            <PackageRowContent pkg={pkg} defaultPackageIcon={defaultPackageIcon} />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {externalFilter.trim() && deferredInstalledPackages.length === 0 && (
                                                <div className="installed-filter-empty">
                                                    No packages match &lsquo;{externalFilter.trim()}&rsquo;
                                                </div>
                                            )}
                                            {!externalFilter.trim() && externalFilterMode === 'vulnerable' && deferredInstalledPackages.length === 0 && (
                                                <div className="installed-filter-empty">
                                                    No vulnerable packages found
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Transitive packages sections - one per target framework (hidden in all-projects mode) */}
                    {!isAllProjects && (
                        <div className="transitive-sections">
                            {/* Show loading state or no data source message at top level */}
                            {loadingTransitive ? (
                                <div className="transitive-loading">
                                    <div className="loading-spinner"></div>
                                    <span>Loading transitive packages...</span>
                                </div>
                            ) : transitiveDataSourceAvailable === false ? (
                                <div className="transitive-no-lockfile">
                                    <div className="no-lockfile-icon"><WarningIcon size={32} /></div>
                                    <div className="no-lockfile-message">
                                        <strong>No dependency data available</strong>
                                        <p>Restore the project to see transitive package dependencies.</p>
                                    </div>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleRestoreProject}
                                        disabled={restoringProject}
                                        title="dotnet restore"
                                    >
                                        {restoringProject ? 'Restoring...' : 'Restore Project'}
                                    </button>
                                </div>
                            ) : transitiveDataSourceAvailable === null ? (
                                /* Haven't loaded yet - show a button to load */
                                <div className="transitive-section">
                                    <button
                                        className="transitive-header"
                                        onClick={handleLoadTransitiveFrameworks}
                                    >
                                        <span className="transitive-arrow"><ChevronRightIcon size={14} /></span>
                                        <span className="transitive-title">Transitive packages</span>
                                    </button>
                                </div>
                            ) : transitiveFrameworks.length === 0 ? (
                                <div className="transitive-section">
                                    <div className="transitive-header transitive-header-disabled">
                                        <span className="transitive-arrow"><ChevronRightIcon size={14} /></span>
                                        <span className="transitive-title">Transitive packages <span className="transitive-count">(0)</span></span>
                                    </div>
                                </div>
                            ) : (
                                /* Render each framework as a collapsible section */
                                transitiveFrameworks.map((framework, _index) => {
                                    const isExpanded = transitiveExpandedFrameworks.has(framework.targetFramework);
                                    const isLoadingMetadata = transitiveLoadingMetadata.has(framework.targetFramework);
                                    return (
                                        <div key={framework.targetFramework} className="transitive-section">
                                            <button
                                                className="transitive-header"
                                                onClick={() => handleToggleTransitiveFramework(framework.targetFramework)}
                                                aria-expanded={isExpanded}
                                            >
                                                <span className="transitive-arrow">{isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}</span>
                                                <span className="transitive-title">
                                                    Transitive packages
                                                    <span className="transitive-count">({framework.packages.length})</span>
                                                </span>
                                                <span className="transitive-framework">{framework.targetFramework}</span>
                                            </button>

                                            {isExpanded && (
                                                <div className="transitive-content">
                                                    {isLoadingMetadata ? (
                                                        <div className="transitive-loading">
                                                            <div className="loading-spinner"></div>
                                                            <span>Loading package details...</span>
                                                        </div>
                                                    ) : framework.packages.length === 0 ? (
                                                        <p className="transitive-empty">No transitive packages found</p>
                                                    ) : (
                                                        <div
                                                            className="transitive-list"
                                                            tabIndex={0}
                                                            onKeyDown={createPackageListKeyHandler(
                                                                framework.packages,
                                                                () => selectedTransitivePackage?.id || null,
                                                                (pkg) => {
                                                                    onSelectTransitivePackage(pkg);
                                                                }
                                                            )}
                                                        >
                                                            {framework.packages.map(pkg => (
                                                                <div
                                                                    key={pkg.id}
                                                                    className={`transitive-package-item ${selectedTransitivePackage?.id === pkg.id ? 'selected' : ''}`}
                                                                    onClick={() => {
                                                                        onSelectTransitivePackage(pkg);
                                                                    }}
                                                                >
                                                                    <div className="package-icon package-icon-small">
                                                                        {pkg.iconUrl ? (
                                                                            <img src={pkg.iconUrl} alt="" onError={(e) => { (e.target as HTMLImageElement).src = defaultPackageIcon; }} />
                                                                        ) : (
                                                                            <img src={defaultPackageIcon} alt="" />
                                                                        )}
                                                                    </div>
                                                                    <div className="package-info">
                                                                        <div className="package-name">{pkg.id}</div>
                                                                        <div className="package-meta">
                                                                            <span className="package-version">v{pkg.version}</span>
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
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                    {/* All-projects transitive packages section — single aggregated view */}
                    {isAllProjects && (
                        <div className="transitive-sections">
                            {allProjectsTransitiveErrored.length > 0 && allProjectsTransitiveExpanded && (
                                <div className="transitive-no-lockfile" style={{ marginBottom: 8 }}>
                                    <div className="no-lockfile-icon"><WarningIcon size={32} /></div>
                                    <div className="no-lockfile-message">
                                        <strong>Some projects need restore</strong>
                                        <p>{allProjectsTransitiveErrored.length} project(s) lack dependency data. Restore to see their transitive packages.</p>
                                    </div>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => onRestoreProjectsBatch(allProjectsTransitiveErrored.map(e => e.projectPath))}
                                        disabled={restoringProjectsBatch}
                                        title="dotnet restore for missing/errored projects"
                                    >
                                        {restoringProjectsBatch ? 'Restoring...' : `Restore ${allProjectsTransitiveErrored.length} project(s)`}
                                    </button>
                                </div>
                            )}
                            <div className="transitive-section">
                                <button
                                    className="transitive-header"
                                    onClick={handleToggleAllProjectsTransitive}
                                    aria-expanded={allProjectsTransitiveExpanded}
                                >
                                    <span className="transitive-arrow">
                                        {allProjectsTransitiveExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                                    </span>
                                    <span className="transitive-title">
                                        Transitive packages
                                        {allProjectsTransitiveExpanded && loadingAllProjectsTransitive && filteredAllProjectsTransitiveRows.length === 0 ? (
                                            // Lazy-loaded on first expand — show a loading hint, not a misleading "(0)".
                                            <span className="transitive-count" aria-label="loading">…</span>
                                        ) : (allProjectsTransitiveExpanded || filteredAllProjectsTransitiveRows.length > 0) ? (
                                            <span className="transitive-count">({filteredAllProjectsTransitiveRows.length})</span>
                                        ) : null}
                                    </span>
                                </button>
                                {allProjectsTransitiveExpanded && (
                                    <div className="transitive-content">
                                        {loadingAllProjectsTransitive && filteredAllProjectsTransitiveRows.length === 0 ? (
                                            <div className="transitive-loading">
                                                <div className="loading-spinner"></div>
                                                <span>Loading transitive packages…</span>
                                            </div>
                                        ) : filteredAllProjectsTransitiveRows.length === 0 ? (
                                            <p className="transitive-empty">
                                                {externalFilter ? 'No matching transitive packages.' : 'No transitive packages found.'}
                                            </p>
                                        ) : (
                                            <div
                                                className="transitive-list"
                                                tabIndex={0}
                                            >
                                                {filteredAllProjectsTransitiveRows.map(row => {
                                                    const rowKey = `${row.id.toLowerCase()}@${row.versionNormalized}`;
                                                    const isSelected = !!selectedTransitivePackage
                                                        && selectedTransitivePackage.id.toLowerCase() === row.id.toLowerCase()
                                                        && (selectedTransitivePackage.version ?? '').trim().toLowerCase() === row.versionNormalized;
                                                    const firstOrigin = row.origins[0];
                                                    const projectCount = new Set(row.origins.map(o => o.projectPath)).size;
                                                    return (
                                                        <div
                                                            key={rowKey}
                                                            className={`transitive-package-item ${isSelected ? 'selected' : ''}`}
                                                            onClick={() => {
                                                                onSelectTransitivePackage({
                                                                    id: row.id,
                                                                    version: row.version,
                                                                    requiredByChain: firstOrigin?.requiredByChain ?? [],
                                                                    fullChain: firstOrigin?.fullChain,
                                                                    iconUrl: row.iconUrl,
                                                                    verified: row.verified,
                                                                    authors: row.authors,
                                                                }, row.origins);
                                                            }}
                                                        >
                                                            <div className="package-icon package-icon-small">
                                                                {row.iconUrl ? (
                                                                    <img src={row.iconUrl} alt="" onError={(e) => { (e.target as HTMLImageElement).src = defaultPackageIcon; }} />
                                                                ) : (
                                                                    <img src={defaultPackageIcon} alt="" />
                                                                )}
                                                            </div>
                                                            <div className="package-info">
                                                                <div className="package-name">{row.id}</div>
                                                                <div className="package-meta">
                                                                    <span className="package-version">v{row.version}</span>
                                                                    {projectCount > 0 && (
                                                                        <span className="package-project-count"> · {projectCount} project{projectCount === 1 ? '' : 's'}</span>
                                                                    )}
                                                                </div>
                                                                {row.authors && (
                                                                    <div className="package-authors">
                                                                        {row.verified && (
                                                                            <span className="verified-badge" title="The ID prefix of this package has been reserved by its owner on nuget.org"><VerifiedIcon size={14} /></span>
                                                                        )}
                                                                        {row.authors}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <MemoizedDraggableSash
                    onDrag={setSplitPosition}
                    onReset={handleSashReset}
                    onDragEnd={handleSashDragEnd}
                />
                <div className="package-details-panel" style={{ width: `${100 - splitPosition}%` }}>
                    {detailsPanelContent}
                </div>
            </div>
        </div>
    );
});

export const MemoizedInstalledTab = React.memo(InstalledTab);

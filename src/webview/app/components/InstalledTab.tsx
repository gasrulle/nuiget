/**
 * InstalledTab Component
 *
 * Renders the Installed tab content: filter bar, collapsible direct packages
 * list with bulk uninstall, transitive packages per-framework sections, and
 * details panel (transitive details or shared PackageDetailsPanel).
 *
 * Owns: installedFilterQuery, directPackagesExpanded, selectedUninstalls,
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

import React, { forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type {
    InstalledPackage,
    LRUMap,
    PackageMetadata,
    PackageSearchResult,
    TransitiveFrameworkSection,
    TransitivePackage,
    VsCodeApi,
} from '../types';
import { getPackageId } from '../types';
import { MemoizedPackageDetailsPanel } from './PackageDetailsPanel';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface InstalledTabProps {
    // Tab visibility
    activeTab: string;

    // Data
    installedPackages: InstalledPackage[];
    loadingInstalled: boolean;
    selectedPackage: PackageSearchResult | InstalledPackage | null;
    selectedTransitivePackage: TransitivePackage | null;
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
    onSelectTransitivePackage: (pkg: TransitivePackage) => void;
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
    onSetSelectedTransitivePackage: (pkg: TransitivePackage | null) => void;
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
    installedTabRef: React.RefObject<HTMLButtonElement | null>;
    MemoizedDraggableSash: React.MemoExoticComponent<React.FC<{
        onDrag: (pos: number) => void;
        onReset: () => void;
        onDragEnd?: (pos: number) => void;
    }>>;
}

// ─── Handle ──────────────────────────────────────────────────────────────────

export interface InstalledTabHandle {
    /** Handle installed-tab-specific messages */
    handleMessage: (message: any) => void;
    /** Reset transitive state (optionally refetch) — called after install/update/remove */
    resetTransitiveState: (refetch?: boolean) => void;
    /** Focus the installed list and select first item */
    focusAndSelectFirst: () => void;
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
        createPackageListKeyHandler,
        metadataCache,
        vscode,
        installedTabRef,
        MemoizedDraggableSash,
    } = props;

    // ─── Internal state ──────────────────────────────────────────────────────

    // Installed tab local filter (client-side only, no HTTP calls)
    const [installedFilterQuery, setInstalledFilterQuery] = useState('');
    const installedFilterInputRef = useRef<HTMLInputElement>(null);

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

    // Ref for the installed package list container
    const installedListRef = useRef<HTMLDivElement>(null);

    // ─── Derived state ───────────────────────────────────────────────────────

    const sortedInstalledPackages = useMemo(() =>
        [...installedPackages].sort((a, b) => a.id.localeCompare(b.id)),
        [installedPackages]
    );

    // Installed tab: client-side filter by package ID (case-insensitive contains)
    const filteredInstalledPackages = useMemo(() => {
        const q = installedFilterQuery.trim().toLowerCase();
        if (!q) { return sortedInstalledPackages; }
        return sortedInstalledPackages.filter(pkg => pkg.id.toLowerCase().includes(q));
    }, [sortedInstalledPackages, installedFilterQuery]);

    // React 19: Deferred value for non-blocking UI during heavy list updates
    const deferredInstalledPackages = useDeferredValue(filteredInstalledPackages);
    const isInstalledStale = filteredInstalledPackages !== deferredInstalledPackages;

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

    const doResetTransitiveState = useCallback((refetch: boolean) => {
        setTransitiveFrameworks([]);
        setTransitiveExpandedFrameworks(new Set());
        transitiveLoadingMetadataRef.current = new Set();
        setTransitiveLoadingMetadata(new Set());
        setTransitiveDataSourceAvailable(null);
        if (refetch && selectedProject) {
            setLoadingTransitive(true);
            vscode.postMessage({
                type: 'getTransitivePackages',
                projectPath: selectedProject
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
        if (transitiveDataSourceAvailable === null && selectedProject && !loadingTransitive && transitiveFrameworks.length === 0) {
            // Only auto-fetch if we have expanded frameworks (meaning user had the section open)
            if (transitiveExpandedFrameworks.size > 0) {
                setLoadingTransitive(true);
                vscode.postMessage({
                    type: 'getTransitivePackages',
                    projectPath: selectedProject
                });
            }
        }
    }, [transitiveDataSourceAvailable, selectedProject, loadingTransitive, transitiveFrameworks.length, transitiveExpandedFrameworks.size, vscode]);

    // Prefetch transitive packages in background after direct packages are loaded
    useEffect(() => {
        if (selectedProject && !loadingInstalled && installedPackages.length >= 0 && transitiveDataSourceAvailable === null && !loadingTransitive) {
            // Direct packages finished loading - defer transitive fetch to reduce network
            // pressure during metadata/update fetching (runs concurrently with those)
            const timer = setTimeout(() => {
                setLoadingTransitive(true);
                vscode.postMessage({
                    type: 'getTransitivePackages',
                    projectPath: selectedProject
                });
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [selectedProject, loadingInstalled, installedPackages.length, transitiveDataSourceAvailable, loadingTransitive, vscode]);

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
        handleMessage: (message: any) => {
            switch (message.type) {
                case 'transitivePackages':
                    if (message.projectPath === selectedProject) {
                        const frameworks = message.frameworks || [];
                        setTransitiveFrameworks(frameworks);
                        setTransitiveDataSourceAvailable(message.dataSourceAvailable);
                        setLoadingTransitive(false);
                        // Sections stay collapsed - user expands manually, metadata loads on expand
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
            }
        },
        resetTransitiveState: (refetch?: boolean) => {
            doResetTransitiveState(refetch ?? false);
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

    // Memoize details panel content (PackageDetailsPanel or transitive details)
    const detailsPanelContent = useMemo(() => {
        if (selectedTransitivePackage) {
            // Get unique root packages (first in chain)
            const allChains = selectedTransitivePackage.fullChain || selectedTransitivePackage.requiredByChain;
            const rootPackages = new Set<string>();
            for (const chain of allChains) {
                rootPackages.add(chain.split(' → ')[0]);
            }

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
                                        <span className="verified-badge" title="The ID prefix of this package has been reserved by its owner on nuget.org">✓</span>
                                    )}
                                    {selectedTransitivePackage.authors}
                                </span>
                            </div>
                        )}
                        <div className="detail-row required-by-section">
                            <span className="detail-label">Required by:</span>
                            <div className="required-by-list">
                                {selectedTransitivePackage.requiredByChain.length === 0 ? (
                                    <span className="detail-value">Unknown</span>
                                ) : (
                                    Array.from(rootPackages).map((rootPkg) => (
                                        <div key={rootPkg} className="required-by-item">
                                            {rootPkg}
                                        </div>
                                    ))
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
    ]);

    return (
        <div className="content browse-content" style={{ display: activeTab === 'installed' ? '' : 'none' }}>
            <div className="split-panel">
                <div className="package-list-panel" style={{ width: `${splitPosition}%` }}>
                    {loadingInstalled ? (
                        <div className="loading-spinner-container" aria-busy="true" aria-label="Loading installed packages">
                            <div className="loading-spinner"></div>
                            <p>Loading installed packages...</p>
                        </div>
                    ) : installedPackages.length === 0 ? (
                        <p className="empty-state">No packages installed</p>
                    ) : (
                        <div className="direct-packages-section">
                            {/* Installed tab local filter */}
                            <div className="installed-filter-bar">
                                <input
                                    ref={installedFilterInputRef}
                                    type="text"
                                    className="installed-filter-input"
                                    placeholder="Filter packages..."
                                    value={installedFilterQuery}
                                    onChange={(e) => setInstalledFilterQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                            e.preventDefault();
                                            if (installedFilterQuery) {
                                                setInstalledFilterQuery('');
                                            } else {
                                                installedFilterInputRef.current?.blur();
                                            }
                                        } else if (e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            installedListRef.current?.focus();
                                        }
                                    }}
                                    aria-label="Filter installed packages"
                                />
                                {installedFilterQuery && (
                                    <button
                                        className="installed-filter-clear"
                                        onClick={() => {
                                            setInstalledFilterQuery('');
                                            installedFilterInputRef.current?.focus();
                                        }}
                                        title="Clear filter"
                                        aria-label="Clear filter"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                            <button
                                className="direct-packages-header"
                                onClick={() => setDirectPackagesExpanded(!directPackagesExpanded)}
                                aria-expanded={directPackagesExpanded}
                            >
                                <span className="direct-packages-arrow">{directPackagesExpanded ? '▼' : '▶'}</span>
                                <span className="direct-packages-title">
                                    Direct packages
                                    <span className="direct-packages-count">
                                        {installedFilterQuery.trim()
                                            ? `(${filteredInstalledPackages.length} of ${installedPackages.length})`
                                            : `(${installedPackages.length})`}
                                    </span>
                                </span>
                            </button>
                            {directPackagesExpanded && (
                                <div className="direct-packages-content">
                                    <div className="updates-toolbar">
                                        <button
                                            className="btn-link"
                                            onClick={handleToggleSelectAllInstalled}
                                            disabled={uninstallingAll || uninstallablePackages.length === 0}
                                        >
                                            {visibleSelectedCount === uninstallablePackages.length && uninstallablePackages.length > 0 ? 'Deselect all' : 'Select all'}
                                        </button>
                                        <button
                                            className="btn btn-danger"
                                            onClick={handleUninstallSelected}
                                            disabled={visibleSelectedCount === 0 || uninstallingAll}
                                        >
                                            {uninstallingAll ? 'Uninstalling...' : `Uninstall Selected (${visibleSelectedCount})`}
                                        </button>
                                    </div>
                                    <div
                                        ref={installedListRef}
                                        className={`package-list${isInstalledStale ? ' stale' : ''}`}
                                        tabIndex={0}
                                        onKeyDown={createPackageListKeyHandler(
                                            deferredInstalledPackages,
                                            () => selectedPackage ? getPackageId(selectedPackage) : null,
                                            (pkg) => {
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
                                                }
                                            }
                                        )}
                                    >
                                        {deferredInstalledPackages.map(pkg => (
                                            <div
                                                key={pkg.id}
                                                className={`package-item ${selectedPackage && getPackageId(selectedPackage).toLowerCase() === pkg.id.toLowerCase() ? 'selected' : ''}`}
                                                onClick={() => {
                                                    onSelectDirectPackage(pkg, {
                                                        selectedVersionValue: pkg.version,
                                                        metadataVersion: pkg.resolvedVersion || pkg.version,
                                                        initialVersions: [pkg.version],
                                                    });
                                                }}
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
                                                            <span className="floating-badge" title="This package uses a floating version pattern">🔄</span>
                                                        )}
                                                        {pkg.versionType === 'range' && (
                                                            <span className="floating-badge" title="This package uses a version range">📏</span>
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
                                                                <span className="verified-badge" title="The ID prefix of this package has been reserved by its owner on nuget.org">✓</span>
                                                            )}
                                                            {pkg.authors}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {installedFilterQuery.trim() && deferredInstalledPackages.length === 0 && (
                                            <div className="installed-filter-empty">
                                                No packages match &lsquo;{installedFilterQuery.trim()}&rsquo;
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Transitive packages sections - one per target framework */}
                    <div className="transitive-sections">
                        {/* Show loading state or no data source message at top level */}
                        {loadingTransitive ? (
                            <div className="transitive-loading">
                                <div className="loading-spinner"></div>
                                <span>Loading transitive packages...</span>
                            </div>
                        ) : transitiveDataSourceAvailable === false ? (
                            <div className="transitive-no-lockfile">
                                <div className="no-lockfile-icon">⚠</div>
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
                                    <span className="transitive-arrow">▶</span>
                                    <span className="transitive-title">Transitive packages</span>
                                </button>
                            </div>
                        ) : transitiveFrameworks.length === 0 ? (
                            <div className="transitive-section">
                                <div className="transitive-header transitive-header-disabled">
                                    <span className="transitive-arrow">▶</span>
                                    <span className="transitive-title">Transitive packages <span className="transitive-count">(0)</span></span>
                                </div>
                            </div>
                        ) : (
                            /* Render each framework as a collapsible section */
                            transitiveFrameworks.map((framework, index) => {
                                const isExpanded = transitiveExpandedFrameworks.has(framework.targetFramework);
                                const isLoadingMetadata = transitiveLoadingMetadata.has(framework.targetFramework);
                                return (
                                    <div key={framework.targetFramework} className="transitive-section">
                                        <button
                                            className="transitive-header"
                                            onClick={() => handleToggleTransitiveFramework(framework.targetFramework)}
                                            aria-expanded={isExpanded}
                                        >
                                            <span className="transitive-arrow">{isExpanded ? '▼' : '▶'}</span>
                                            <span className="transitive-title">
                                                Transitive packages
                                                <span className="transitive-count">({framework.packages.length})</span>
                                            </span>
                                            <span className="transitive-framework">{framework.targetFramework}</span>
                                            {index === 0 && (
                                                <span
                                                    className="transitive-refresh-btn"
                                                    title="Restore project and refresh transitive packages"
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (selectedProject && !loadingTransitive) {
                                                            setLoadingTransitive(true);
                                                            vscode.postMessage({
                                                                type: 'getTransitivePackages',
                                                                projectPath: selectedProject,
                                                                forceRestore: true
                                                            });
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            if (selectedProject && !loadingTransitive) {
                                                                setLoadingTransitive(true);
                                                                vscode.postMessage({
                                                                    type: 'getTransitivePackages',
                                                                    projectPath: selectedProject,
                                                                    forceRestore: true
                                                                });
                                                            }
                                                        }
                                                    }}
                                                    aria-label="Restore project and refresh transitive packages"
                                                    aria-disabled={loadingTransitive}
                                                >
                                                    ↻
                                                </span>
                                            )}
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
                                                                                <span className="verified-badge" title="The ID prefix of this package has been reserved by its owner on nuget.org">✓</span>
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

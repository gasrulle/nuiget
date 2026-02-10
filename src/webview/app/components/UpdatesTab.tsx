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

import React, { forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MemoizedPackageDetailsPanel } from './PackageDetailsPanel';
import type {
    InstalledPackage,
    LRUMap,
    PackageMetadata,
    PackageSearchResult,
    PackageUpdate,
    VsCodeApi,
} from '../types';
import { getPackageId } from '../types';

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
    handleMessage: (message: { type: string; [key: string]: unknown }) => void;
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
    // Reset selections when packages change (e.g., project switch)
    useEffect(() => {
        setSelectedUpdates(new Set());
    }, [packagesWithUpdates]);

    // ─── Derived data ────────────────────────────────────────────────────────
    const sortedPackagesWithUpdates = useMemo(() =>
        [...packagesWithUpdates].sort((a, b) => a.id.localeCompare(b.id)),
        [packagesWithUpdates]
    );
    const deferredPackagesWithUpdates = useDeferredValue(sortedPackagesWithUpdates);
    const isUpdatesStale = sortedPackagesWithUpdates !== deferredPackagesWithUpdates;

    // ─── Virtualizer ─────────────────────────────────────────────────────────
    const updatesVirtualizer = useVirtualizer({
        count: deferredPackagesWithUpdates.length,
        getScrollElement: () => updatesScrollRef.current,
        estimateSize: () => ESTIMATED_ITEM_HEIGHT,
        overscan: 5,
    });

    // ─── Callbacks ───────────────────────────────────────────────────────────
    const handleToggleUpdateSelection = useCallback((packageId: string) => {
        setSelectedUpdates(prev => {
            const newSet = new Set(prev);
            if (newSet.has(packageId)) {
                newSet.delete(packageId);
            } else {
                newSet.add(packageId);
            }
            return newSet;
        });
    }, []);

    const handleToggleSelectAll = useCallback(() => {
        if (selectedUpdates.size === packagesWithUpdates.length) {
            setSelectedUpdates(new Set());
        } else {
            setSelectedUpdates(new Set(packagesWithUpdates.map(p => p.id)));
        }
    }, [selectedUpdates.size, packagesWithUpdates]);

    const handleUpdateAll = useCallback(() => {
        if (!selectedProject || selectedUpdates.size === 0) {
            return;
        }
        const packagesToUpdate = packagesWithUpdates
            .filter(p => selectedUpdates.has(p.id))
            .map(p => ({ id: p.id, version: p.latestVersion }));

        setUpdatingAll(true);
        vscode.postMessage({
            type: 'bulkUpdatePackages',
            projectPath: selectedProject,
            packages: packagesToUpdate
        });
    }, [selectedProject, selectedUpdates, packagesWithUpdates, vscode]);

    // ─── Imperative handle ───────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        handleMessage(message: { type: string; [key: string]: unknown }) {
            switch (message.type) {
                case 'bulkUpdateResult':
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
    return (
        <div className="content browse-content">
            <div className="split-panel">
                <div ref={updatesScrollRef} className="package-list-panel" style={{ width: `${splitPosition}%` }}>
                    {loadingUpdates ? (
                        <div className="loading-spinner-container" aria-busy="true" aria-label="Checking for updates">
                            <div className="loading-spinner"></div>
                            <p>Checking for updates...</p>
                        </div>
                    ) : packagesWithUpdates.length === 0 ? (
                        <p className="empty-state">
                            {installedPackages.length === 0
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
                                    {selectedUpdates.size === packagesWithUpdates.length ? 'Deselect all' : 'Select all'}
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleUpdateAll}
                                    disabled={selectedUpdates.size === 0 || updatingAll}
                                >
                                    {updatingAll ? 'Updating...' : `Update All (${selectedUpdates.size})`}
                                </button>
                            </div>
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

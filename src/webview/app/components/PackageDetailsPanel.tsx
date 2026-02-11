/**
 * PackageDetailsPanel Component
 *
 * Extracted from App.tsx's `detailsPanelContent` useMemo.
 * Renders the right-side details panel showing package metadata,
 * version selector, install/update/uninstall buttons, dependencies,
 * and readme content.
 *
 * Wrapped in React.memo to prevent re-renders when unrelated state changes.
 */

import React from 'react';
import type {
    InstalledPackage,
    LRUMap,
    PackageMetadata,
    PackageSearchResult,
    VsCodeApi,
} from '../types';
import { decodeHtmlEntities, getPackageId, isSearchResult } from '../types';

export interface PackageDetailsPanelProps {
    selectedPackage: PackageSearchResult | InstalledPackage | null;
    packageMetadata: PackageMetadata | null;
    loadingMetadata: boolean;
    loadingVersions: boolean;
    packageVersions: string[];
    selectedVersion: string;
    installedPackages: InstalledPackage[];
    detailsTab: 'details' | 'readme';
    loadingReadme: boolean;
    sanitizedReadmeHtml: string;
    expandedDeps: Set<string>;
    selectedProject: string;
    includePrerelease: boolean;
    selectedSource: string;

    // Callbacks
    onInstall: (packageId: string, version: string) => void;
    onRemove: (packageId: string) => void;
    onVersionChange: (newVersion: string) => void;
    onDetailsTabChange: (tab: 'details' | 'readme') => void;
    onToggleDep: (key: string) => void;
    onReadmeAttemptedChange: (attempted: boolean) => void;
    onMetadataChange: (metadata: PackageMetadata | null) => void;
    onLoadingMetadataChange: (loading: boolean) => void;

    // Dependencies
    metadataCache: React.RefObject<LRUMap<string, PackageMetadata>>;
    vscode: VsCodeApi;
}

const PackageDetailsPanel: React.FC<PackageDetailsPanelProps> = ({
    selectedPackage,
    packageMetadata,
    loadingMetadata,
    loadingVersions,
    packageVersions,
    selectedVersion,
    installedPackages,
    detailsTab,
    loadingReadme,
    sanitizedReadmeHtml,
    expandedDeps,
    selectedSource,
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
}) => {
    if (!selectedPackage) {
        return <p className="empty-state">Select a package to view details</p>;
    }

    const packageId = getPackageId(selectedPackage);
    const installedPkg = installedPackages.find(p => p.id.toLowerCase() === packageId.toLowerCase());
    const isInstalled = !!installedPkg;
    const searchResult = isSearchResult(selectedPackage) ? selectedPackage : null;

    // Check if this is a floating or range version (cannot be updated from UI)
    const isFloatingOrRange = installedPkg?.versionType === 'floating' || installedPkg?.versionType === 'range';

    // Compute button text: Install (not installed), Update (newer), Downgrade (older)
    let buttonText = 'Install';
    if (isInstalled) {
        if (loadingVersions || packageVersions.length === 0) {
            // Versions not yet available - stable fallback to prevent flicker
            buttonText = 'Update';
        } else {
            // Use resolved version for floating versions (e.g., "10.*" → "10.2.0")
            const compareVersion = installedPkg?.resolvedVersion || installedPkg?.version;
            const selectedIndex = packageVersions.indexOf(selectedVersion);
            const installedIndex = packageVersions.indexOf(compareVersion || '');

            if (selectedIndex === -1 || installedIndex === -1) {
                // Version not in list (e.g., prerelease installed but checkbox unchecked)
                // Fall back to numeric comparison
                const parseVersionParts = (version: string): number[] => {
                    const baseVersion = version.split('-')[0]; // Strip prerelease suffix
                    return baseVersion.split('.').map(part => parseInt(part, 10) || 0);
                };
                const compareVersionsNumeric = (a: string, b: string): number => {
                    const partsA = parseVersionParts(a);
                    const partsB = parseVersionParts(b);
                    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                        const partA = partsA[i] || 0;
                        const partB = partsB[i] || 0;
                        if (partA > partB) return 1;
                        if (partA < partB) return -1;
                    }
                    return 0;
                };
                const cmp = compareVersionsNumeric(selectedVersion, compareVersion || '');
                if (cmp > 0) {
                    buttonText = 'Update';    // Selected is newer
                } else if (cmp < 0) {
                    buttonText = 'Downgrade'; // Selected is older
                } else {
                    buttonText = 'Update';    // Same base version
                }
            } else if (selectedIndex < installedIndex) {
                buttonText = 'Update';      // Selected is newer (lower index = newer)
            } else if (selectedIndex > installedIndex) {
                buttonText = 'Downgrade';   // Selected is older (higher index = older)
            } else {
                buttonText = 'Update';      // Same version (button will be disabled anyway)
            }
        }
    }

    return (
        <div className="package-details">
            <div className="details-header">
                <h3>{packageId}</h3>
                <div className="details-actions">
                    {isInstalled && (
                        <div className="installed-version-row">
                            <label>Installed:</label>
                            {isFloatingOrRange ? (
                                <div className="floating-version-info">
                                    <span className="floating-version-badge">
                                        {installedPkg.versionType === 'floating' ? '🔄 Floating' : '📏 Range'}
                                    </span>
                                    <span className="floating-version-pattern">{installedPkg.version}</span>
                                    {installedPkg.resolvedVersion && (
                                        <span className="floating-version-resolved">→ {installedPkg.resolvedVersion}</span>
                                    )}
                                </div>
                            ) : (
                                <select className="version-selector" disabled>
                                    <option>{installedPkg.version}</option>
                                </select>
                            )}
                            <button
                                className="btn btn-danger"
                                onClick={() => onRemove(packageId)}
                                disabled={installedPkg?.isImplicit}
                                title={installedPkg?.isImplicit ? 'Implicit/transitive package - cannot be uninstalled directly' : undefined}
                            >
                                Uninstall
                            </button>
                        </div>
                    )}
                    {/* Show version selector and update/install button */}
                    <div className="details-version-row">
                        <label>Version:</label>
                        {loadingVersions ? (
                            <select className="version-selector" disabled>
                                <option>Loading...</option>
                            </select>
                        ) : (
                            <select
                                value={selectedVersion}
                                onChange={(e) => {
                                    const newVersion = (e.target as HTMLSelectElement).value;
                                    onVersionChange(newVersion);
                                    onReadmeAttemptedChange(false);
                                    // Check frontend cache for metadata
                                    const metadataCacheKey = `${packageId.toLowerCase()}@${newVersion.toLowerCase()}|${selectedSource === 'all' ? '' : selectedSource}`;
                                    const cachedMetadata = metadataCache.current.get(metadataCacheKey);
                                    if (cachedMetadata) {
                                        onMetadataChange(cachedMetadata);
                                        onLoadingMetadataChange(false);
                                    } else {
                                        onLoadingMetadataChange(true);
                                        onMetadataChange(null);
                                        vscode.postMessage({
                                            type: 'getPackageMetadata',
                                            packageId: packageId,
                                            version: newVersion,
                                            source: selectedSource === 'all' ? undefined : selectedSource
                                        });
                                    }
                                }}
                                className="version-selector"
                                disabled={isFloatingOrRange}
                                title={isFloatingOrRange ? 'Version selection disabled for floating/range versions' : undefined}
                            >
                                {packageVersions.map(v => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                        )}
                        <button
                            className="btn btn-primary"
                            onClick={() => onInstall(packageId, selectedVersion)}
                            disabled={isFloatingOrRange || (isInstalled && selectedVersion === installedPkg?.version)}
                            title={
                                isFloatingOrRange
                                    ? 'Updates disabled for floating/range versions - edit .csproj directly'
                                    : (isInstalled && selectedVersion === installedPkg?.version ? 'Already at this version' : undefined)
                            }
                        >
                            {buttonText}
                        </button>
                    </div>
                    {/* Info message for floating/range versions */}
                    {isFloatingOrRange && isInstalled && (
                        <div className="floating-version-notice">
                            <span className="info-icon">ℹ️</span>
                            <span>To change this version, edit the .csproj file directly.</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="details-tabs">
                <button
                    className={detailsTab === 'details' ? 'details-tab active' : 'details-tab'}
                    onClick={() => onDetailsTabChange('details')}
                >
                    Package Details
                </button>
                <button
                    className={detailsTab === 'readme' ? 'details-tab active' : 'details-tab'}
                    onClick={() => onDetailsTabChange('readme')}
                >
                    Readme
                </button>
            </div>

            <div className="details-content">
                {loadingMetadata ? (
                    <p className="empty-state">Loading package details...</p>
                ) : detailsTab === 'details' ? (
                    <div className="details-info">
                        <div className="details-row">
                            <label>Description:</label>
                            <span>{decodeHtmlEntities(packageMetadata?.description || searchResult?.description || 'No description available')}</span>
                        </div>
                        <div className="details-row">
                            <label>Version:</label>
                            <span>{selectedVersion}</span>
                        </div>
                        <div className="details-row">
                            <label>Author(s):</label>
                            <span>{packageMetadata?.authors || searchResult?.authors || 'Unknown'}</span>
                        </div>
                        {packageMetadata?.license && (
                            <div className="details-row">
                                <label>License:</label>
                                <span>{packageMetadata.license}</span>
                            </div>
                        )}
                        {packageMetadata?.licenseUrl && !packageMetadata.license && (
                            <div className="details-row">
                                <label>License:</label>
                                <a href={packageMetadata.licenseUrl} className="details-link">View License</a>
                            </div>
                        )}
                        {(searchResult?.totalDownloads || packageMetadata?.totalDownloads) && (
                            <div className="details-row">
                                <label>Downloads:</label>
                                <span>{(searchResult?.totalDownloads || packageMetadata?.totalDownloads)?.toLocaleString()}</span>
                            </div>
                        )}
                        {packageMetadata?.published && (
                            <div className="details-row">
                                <label>Date Published:</label>
                                <span>{new Date(packageMetadata.published).toISOString().slice(0, 10)}</span>
                            </div>
                        )}
                        {packageMetadata?.projectUrl && (
                            <div className="details-row">
                                <label>Project URL:</label>
                                <a href={packageMetadata.projectUrl} className="details-link">{packageMetadata.projectUrl}</a>
                            </div>
                        )}
                        {(selectedSource === 'all' || selectedSource.includes('nuget.org')) && (
                            <div className="details-row">
                                <label>Report Abuse:</label>
                                <a href={`https://www.nuget.org/packages/${packageId}/${selectedVersion}/ReportAbuse`} className="details-link">Report this package</a>
                            </div>
                        )}

                        {packageMetadata?.dependencies && packageMetadata.dependencies.length > 0 && (
                            <div className="dependencies-section">
                                <label>Dependencies:</label>
                                <div className="dependencies-tree">
                                    {packageMetadata.dependencies.map((group, idx) => {
                                        const key = `${idx}-${group.targetFramework}`;
                                        return (
                                            <div key={idx} className="dependency-group">
                                                <div
                                                    className="dependency-group-header"
                                                    onClick={() => onToggleDep(key)}
                                                >
                                                    <span className="expand-icon">
                                                        {expandedDeps.has(key) ? '▼' : '▶'}
                                                    </span>
                                                    <span className="framework-name">{group.targetFramework || 'All Frameworks'}</span>
                                                    <span className="dep-count">({group.dependencies?.length || 0})</span>
                                                </div>
                                                {expandedDeps.has(key) && (
                                                    <div className="dependency-list">
                                                        {!group.dependencies || group.dependencies.length === 0 ? (
                                                            <div className="no-deps">No dependencies</div>
                                                        ) : (
                                                            group.dependencies.map((dep, depIdx) => (
                                                                <div key={depIdx} className="dependency-item">
                                                                    <span className="dep-name">{dep.id}</span>
                                                                    <span className="dep-version">{dep.versionRange}</span>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="readme-content">
                        {loadingReadme ? (
                            <p className="empty-state">Loading readme from package...</p>
                        ) : sanitizedReadmeHtml ? (
                            <div
                                className="readme-rendered"
                                dangerouslySetInnerHTML={{ __html: sanitizedReadmeHtml }}
                            />
                        ) : (
                            <p className="empty-state">No readme available for this package</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export const MemoizedPackageDetailsPanel = React.memo(PackageDetailsPanel);

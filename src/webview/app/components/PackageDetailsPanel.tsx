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

import React, { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, ChevronDownIcon, ChevronRightIcon, InfoIcon, RulerIcon, SyncIcon, VerifiedIcon, WarningIcon } from '../icons';
import type {
    InstalledPackage,
    LRUMap,
    PackageMetadata,
    PackageSearchResult,
    Project,
    ProjectInstalled,
    VsCodeApi,
} from '../types';
import { compareVersions, decodeHtmlEntities, getPackageId, isSearchResult } from '../types';

function formatPackageSize(bytes: number): string {
    if (bytes < 1024) { return `${bytes} B`; }
    if (bytes < 1048576) { return `${(bytes / 1024).toFixed(1)} KB`; }
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

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

    // Multi-install (optional — only needed on Browse tab)
    projects?: Project[];
    allProjectsInstalled?: ProjectInstalled[];

    // Callbacks
    onInstall: (packageId: string, version: string) => void;
    onMultiInstall?: (packageId: string, version: string, projectPaths: string[]) => void;
    onMultiInstallOpen?: () => void;
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
    selectedProject,
    selectedSource,
    projects = [],
    allProjectsInstalled = [],
    onInstall,
    onMultiInstall,
    onMultiInstallOpen,
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
    // Multi-install state
    const [multiInstallOpen, setMultiInstallOpen] = useState(false);
    const [selectedInstallProjects, setSelectedInstallProjects] = useState<Set<string>>(new Set());
    const multiInstallRef = useRef<HTMLDivElement>(null);

    // Reset multi-install state when selected package changes
    useEffect(() => {
        setSelectedInstallProjects(new Set());
        setMultiInstallOpen(false);
    }, [selectedPackage]);

    // Close dropdown on Escape key
    useEffect(() => {
        if (!multiInstallOpen) { return; }
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setMultiInstallOpen(false);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [multiInstallOpen]);

    if (!selectedPackage) {
        return <p className="empty-state">Select a package to view details</p>;
    }

    const packageId = getPackageId(selectedPackage);
    const installedPkg = installedPackages.find(p => p.id.toLowerCase() === packageId.toLowerCase());
    const isInstalled = !!installedPkg;
    const searchResult = isSearchResult(selectedPackage) ? selectedPackage : null;

    // Check if this is a floating or range version (cannot be updated from UI)
    const isFloatingOrRange = installedPkg?.versionType === 'floating' || installedPkg?.versionType === 'range';

    // Build a map of project paths → installed version for this package
    const projectPackageVersions = new Map<string, string>();
    for (const pi of allProjectsInstalled) {
        const pkg = pi.packages.find(p => p.id.toLowerCase() === packageId.toLowerCase());
        if (pkg) {
            projectPackageVersions.set(pi.projectPath, pkg.resolvedVersion || pkg.version);
        }
    }

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
                const cmp = compareVersions(selectedVersion, compareVersion || '');
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
                                        {installedPkg.versionType === 'floating' ? <><SyncIcon size={12} className="inline-icon" /> Floating</> : <><RulerIcon size={12} className="inline-icon" /> Range</>}
                                    </span>
                                    <span className="floating-version-pattern">{installedPkg.version}</span>
                                    {installedPkg.resolvedVersion && (
                                        <span className="floating-version-resolved"><ArrowRightIcon size={12} className="inline-icon" /> {installedPkg.resolvedVersion}</span>
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
                                title={installedPkg?.isImplicit ? 'Implicit/transitive package - cannot be uninstalled directly' : 'Uninstall (Del)'}
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
                                    : (isInstalled && selectedVersion === installedPkg?.version ? 'Already at this version' : `${buttonText} (Ctrl+Enter)`)
                            }
                        >
                            {buttonText}
                        </button>
                    </div>
                    {/* Info message for floating/range versions */}
                    {isFloatingOrRange && isInstalled && (
                        <div className="floating-version-notice">
                            <span className="info-icon"><InfoIcon size={14} /></span>
                            <span>To change this version, edit the .csproj file directly.</span>
                        </div>
                    )}
                    {/* Multi Install - only shown when multiple projects exist and package is not installed in current project */}
                    {projects.length > 1 && onMultiInstall && !isInstalled && (
                        <div className="multi-install-row" ref={multiInstallRef}>
                            <button
                                className={`btn btn-secondary multi-install-btn${multiInstallOpen ? ' open' : ''}`}
                                onClick={() => {
                                    if (!multiInstallOpen && onMultiInstallOpen) { onMultiInstallOpen(); }
                                    setMultiInstallOpen(prev => !prev);
                                }}
                                title="Install this package to multiple projects"
                            >
                                Multi Install <ChevronDownIcon size={12} className={`multi-install-chevron${multiInstallOpen ? ' open' : ''}`} />
                            </button>
                            {multiInstallOpen && (
                                <>
                                    <div className="multi-install-backdrop" onClick={() => setMultiInstallOpen(false)} />
                                    <div className="multi-install-dropdown">
                                        <div className="multi-install-list">
                                            {[...projects]
                                                .sort((a, b) => {
                                                    if (a.path === selectedProject) { return -1; }
                                                    if (b.path === selectedProject) { return 1; }
                                                    return a.name.localeCompare(b.name);
                                                })
                                                .map(project => {
                                                    const installedVersion = projectPackageVersions.get(project.path);
                                                    const sameVersionInstalled = installedVersion !== undefined && installedVersion === selectedVersion;
                                                    const differentVersionInstalled = installedVersion !== undefined && installedVersion !== selectedVersion;
                                                    const isChecked = selectedInstallProjects.has(project.path);
                                                    const fileName = project.path.split(/[\\/]/).pop() || project.name;
                                                    return (
                                                        <label
                                                            key={project.path}
                                                            className={`multi-install-project${sameVersionInstalled ? ' installed' : ''}`}
                                                            title={project.path}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                disabled={sameVersionInstalled}
                                                                onChange={() => {
                                                                    setSelectedInstallProjects(prev => {
                                                                        const next = new Set(prev);
                                                                        if (next.has(project.path)) {
                                                                            next.delete(project.path);
                                                                        } else {
                                                                            next.add(project.path);
                                                                        }
                                                                        return next;
                                                                    });
                                                                }}
                                                            />
                                                            <span className="multi-install-project-name">{fileName}</span>
                                                            {sameVersionInstalled && <span className="multi-install-installed-badge">(v{installedVersion})</span>}
                                                            {differentVersionInstalled && <span className="multi-install-version-badge">(v{installedVersion})</span>}
                                                        </label>
                                                    );
                                                })}
                                        </div>
                                        <div className="multi-install-action">
                                            <button
                                                className="btn btn-primary multi-install-action-btn"
                                                disabled={selectedInstallProjects.size === 0}
                                                onClick={() => {
                                                    onMultiInstall(packageId, selectedVersion, [...selectedInstallProjects]);
                                                    setMultiInstallOpen(false);
                                                    setSelectedInstallProjects(new Set());
                                                }}
                                            >
                                                {selectedInstallProjects.size > 0
                                                    ? `Install to ${selectedInstallProjects.size} project${selectedInstallProjects.size !== 1 ? 's' : ''}`
                                                    : 'Select projects'}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
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
                {detailsTab === 'readme' ? (
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
                ) : loadingMetadata ? (
                    <p className="empty-state">Loading package details...</p>
                ) : (
                    <div className="details-info">
                        {packageMetadata?.offline && (
                            <div className="offline-indicator" title="Metadata loaded from local NuGet cache (source unavailable)">
                                <InfoIcon size={14} /> Offline — loaded from local cache
                            </div>
                        )}
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
                            <span>
                                {searchResult?.verified && (
                                    <span className="verified-badge" title="The ID prefix of this package has been reserved by its owner on nuget.org"><VerifiedIcon size={14} /></span>
                                )}
                                {packageMetadata?.authors || searchResult?.authors || 'Unknown'}
                            </span>
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
                        {packageMetadata?.packageSize !== undefined && packageMetadata.packageSize > 0 && (
                            <div className="details-row">
                                <label>Package Size:</label>
                                <span>{formatPackageSize(packageMetadata.packageSize)}</span>
                            </div>
                        )}
                        {(() => {
                            const vulns = packageMetadata?.vulnerabilities || (selectedPackage && 'vulnerabilities' in selectedPackage ? selectedPackage.vulnerabilities : undefined);
                            if (!vulns || vulns.length === 0) { return null; }
                            return (
                                <div className="details-row vulnerabilities-row">
                                    <label>Vulnerabilities:</label>
                                    <div className="vulnerability-list">
                                        {vulns.map((v, i) => (
                                            <div key={i} className={`vulnerability-item vuln-${v.severity}`}>
                                                <WarningIcon size={14} />
                                                <span className="vuln-severity">{v.severity}</span>
                                                <a href={v.advisoryUrl} className="details-link vuln-link">Advisory</a>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
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
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-expanded={expandedDeps.has(key)}
                                                    onClick={() => onToggleDep(key)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleDep(key); } }}
                                                >
                                                    <span className="expand-icon">
                                                        {expandedDeps.has(key) ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
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
                )}
            </div>
        </div>
    );
};

export const MemoizedPackageDetailsPanel = React.memo(PackageDetailsPanel);

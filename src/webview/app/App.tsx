import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import './App.css';
import type { BrowseTabHandle } from './components/BrowseTab';
import { MemoizedBrowseTab } from './components/BrowseTab';
import { MemoizedDraggableSash } from './components/DraggableSash';
import type { InstalledTabHandle } from './components/InstalledTab';
import { MemoizedInstalledTab } from './components/InstalledTab';
import { MemoizedPackageDetailsPanel } from './components/PackageDetailsPanel';
import type { SourceSettingsOverlayHandle } from './components/SourceSettingsOverlay';
import { MemoizedSourceSettingsOverlay } from './components/SourceSettingsOverlay';
import type { UpdatesTabHandle } from './components/UpdatesTab';
import { MemoizedUpdatesTab } from './components/UpdatesTab';
import { usePackageSelection } from './hooks/usePackageSelection';
import { SettingsGearIcon, WarningIcon } from './icons';
import { renderMarkdownToHtml } from './markdownSetup';
import type { AppState, FailedSource, InstalledPackage, NuGetSource, PackageMetadata, PackageSearchResult, PackageUpdate, Project, ProjectInstalled, ProjectUpdates, TransitivePackage } from './types';
import { LRUMap, getPackageId } from './types';

// Get the default package icon URL from the root element data attribute
const defaultPackageIcon = document.getElementById('root')?.dataset.packageIcon || '';
// Get initial tab from HTML (set when opened from context menu)
const htmlInitialTab = document.getElementById('root')?.dataset.initialTab as 'browse' | 'installed' | 'updates' | '' | undefined;

declare const acquireVsCodeApi: () => {
    postMessage: (msg: unknown) => void;
    getState: () => AppState | undefined;
    setState: (state: AppState) => void;
};

const vscode = acquireVsCodeApi();
const savedState = vscode.getState();

export const App: React.FC = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>(savedState?.selectedProject || '');
    const [installedPackages, setInstalledPackages] = useState<InstalledPackage[]>([]);
    const [sources, setSources] = useState<NuGetSource[]>([]);
    const [failedSources, setFailedSources] = useState<FailedSource[]>([]);
    const [selectedSource, setSelectedSource] = useState<string>(savedState?.selectedSource || '');
    const [activeTab, setActiveTab] = useState<'browse' | 'installed' | 'updates'>(htmlInitialTab || savedState?.activeTab || 'browse');
    // React 19: Transition for tab switching to keep UI responsive
    const [isTabPending, startTabTransition] = useTransition();
    const [loadingInstalled, setLoadingInstalled] = useState(false);
    const [selectedPackage, setSelectedPackage] = useState<PackageSearchResult | InstalledPackage | null>(null);
    const [selectedVersion, setSelectedVersion] = useState<string>('');
    const [packageVersions, setPackageVersions] = useState<string[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [packageMetadata, setPackageMetadata] = useState<PackageMetadata | null>(null);
    const [loadingMetadata, setLoadingMetadata] = useState(false);
    const [detailsTab, setDetailsTab] = useState<'details' | 'readme'>('details');
    const [expandedDeps, setExpandedDeps] = useState<Set<string>>(new Set());
    const [includePrerelease, setIncludePrerelease] = useState<boolean>(savedState?.includePrerelease || false);
    const [recentSearches, setRecentSearches] = useState<string[]>(savedState?.recentSearches || []);
    // Search debounce settings from extension
    const [searchDebounceMode, setSearchDebounceMode] = useState<'quicksearch' | 'full' | 'off'>('quicksearch');
    const [recentSearchesLimit, setRecentSearchesLimit] = useState<number>(5);
    const recentSearchesLimitRef = useRef<number>(5);
    const [packagesWithUpdates, setPackagesWithUpdates] = useState<PackageUpdate[]>([]);
    const [updateCount, setUpdateCount] = useState<number>(0);
    const [loadingUpdates, setLoadingUpdates] = useState(false);
    // "Load All Projects" mode for Updates tab
    const [loadAllProjects, setLoadAllProjects] = useState(false);
    const [allProjectsUpdates, setAllProjectsUpdates] = useState<ProjectUpdates[]>([]);
    const [loadingAllProjectsUpdates, setLoadingAllProjectsUpdates] = useState(false);
    // "Load All Projects" mode for Installed tab
    const [loadAllProjectsInstalled, setLoadAllProjectsInstalled] = useState(false);
    const [allProjectsInstalled, setAllProjectsInstalled] = useState<ProjectInstalled[]>([]);
    const [loadingAllProjectsInstalled, setLoadingAllProjectsInstalled] = useState(false);
    // Dedicated per-project installed data for Multi Install dropdown (not cleared on tab switch)
    const [multiInstallProjectData, setMultiInstallProjectData] = useState<ProjectInstalled[]>([]);
    const [loadingReadme, setLoadingReadme] = useState(false);
    const [readmeAttempted, setReadmeAttempted] = useState(false);
    const [showSourceSettings, setShowSourceSettings] = useState(false);
    const [togglingSource, setTogglingSource] = useState<string | null>(null);
    const [configFiles, setConfigFiles] = useState<{ label: string; path: string }[]>([]);
    const [selectedConfigFile, setSelectedConfigFile] = useState<string>('');
    const [isWindows, setIsWindows] = useState(true);
    const [removingSource, setRemovingSource] = useState<string | null>(null);
    const sourceSettingsRef = useRef<SourceSettingsOverlayHandle>(null);

    // Split panel position state (35% default, range 20-80%)
    const [splitPosition, setSplitPosition] = useState(35);

    const [selectedTransitivePackage, setSelectedTransitivePackage] = useState<TransitivePackage | null>(null);


    // Track if settings have been loaded from extension
    const settingsLoadedRef = useRef(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);

    // Pending navigation from sidebar "View Package Details" — auto-select when search results arrive
    const pendingNavigationRef = useRef<{ packageId: string; version?: string } | null>(null);

    // Persist state when it changes
    useEffect(() => {
        vscode.setState({
            selectedProject,
            selectedSource,
            activeTab,
            searchQuery: '',
            includePrerelease,
            recentSearches
        });
    }, [selectedProject, selectedSource, activeTab, includePrerelease, recentSearches]);

    // Use ref to track latest selectedProject for message handler
    const selectedProjectRef = useRef(selectedProject);
    useEffect(() => {
        selectedProjectRef.current = selectedProject;
    }, [selectedProject]);

    // Use ref to track latest selectedPackage for message handler
    const selectedPackageRef = useRef(selectedPackage);
    useEffect(() => {
        selectedPackageRef.current = selectedPackage;
    }, [selectedPackage]);

    // Use ref to track latest activeTab for message handler
    const activeTabRef = useRef(activeTab);
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    // Use ref to track latest selectedSource for message handler
    const selectedSourceRef = useRef(selectedSource);
    useEffect(() => {
        selectedSourceRef.current = selectedSource;
        // Pre-warm service index when source changes
        vscode.postMessage({
            type: 'prewarmSource',
            sourceUrl: selectedSource
        });
    }, [selectedSource]);

    // Use ref to track latest selectedVersion for message handler
    const selectedVersionRef = useRef(selectedVersion);
    useEffect(() => {
        selectedVersionRef.current = selectedVersion;
    }, [selectedVersion]);

    // Use ref to track latest packageVersions for message handler (to detect if user changed from latest)
    const packageVersionsRef = useRef(packageVersions);
    useEffect(() => {
        packageVersionsRef.current = packageVersions;
    }, [packageVersions]);

    // Use ref to track latest includePrerelease for message handler
    const includePrereleaseRef = useRef(includePrerelease);
    // Flag to skip saveSettings when prerelease was synced from backend (prevents echo loop)
    const skipSaveRef = useRef(false);
    // Flags to skip saveSettings when source/project were synced from backend (prevents echo loop)
    const skipSourceSaveRef = useRef(false);
    const skipProjectSaveRef = useRef(false);
    useEffect(() => {
        includePrereleaseRef.current = includePrerelease;
    }, [includePrerelease]);

    // Keep recentSearchesLimit ref in sync with state
    useEffect(() => {
        recentSearchesLimitRef.current = recentSearchesLimit;
    }, [recentSearchesLimit]);

    // Track if installed tab has been visited (to skip refetch on first visit, use prefetched data)
    // NOTE: Currently does not reset when installedPackages changes. If dependent functionality changes
    // and stale data becomes an issue after install/uninstall, consider resetting this ref on installedPackages change.
    const hasVisitedInstalledTabRef = useRef(false);

    // Frontend cache for package versions to avoid "Loading" flash on re-selection
    // Key: "packageId|source|prerelease" -> versions array
    // Uses LRU eviction to prevent unbounded memory growth (max 200 entries)
    const versionsCache = useRef<LRUMap<string, string[]>>(new LRUMap(200));


    // Frontend cache for package metadata to avoid "Loading" flash on re-selection
    // Key: "packageId@version|source" -> metadata object
    // Uses LRU eviction to prevent unbounded memory growth (max 100 entries)
    const metadataCache = useRef<LRUMap<string, PackageMetadata>>(new LRUMap(100));



    // Refs for tab buttons to enable focus transfer when switching tabs
    const browseTabRef = useRef<HTMLButtonElement>(null);
    const installedTabRef = useRef<HTMLButtonElement>(null);
    const updatesTabRef = useRef<HTMLButtonElement>(null);

    // Component refs for tab message routing
    const browseTabCompRef = useRef<BrowseTabHandle>(null);
    const installedTabCompRef = useRef<InstalledTabHandle>(null);
    const updatesTabCompRef = useRef<UpdatesTabHandle>(null);

    // Package selection hook - consolidates selection logic across all tabs
    const { selectDirectPackage, selectTransitivePackage, clearSelection } = usePackageSelection<PackageSearchResult | InstalledPackage>({
        setSelectedPackage,
        setSelectedTransitivePackage,
        setSelectedVersion,
        setDetailsTab,
        setExpandedDeps,
        setPackageVersions,
        setLoadingVersions,
        setPackageMetadata,
        setLoadingMetadata,
        versionsCache,
        metadataCache,
        selectedSource,
        includePrerelease,
        selectedPackage,
        vscode,
    });

    // Auto-focus the active tab on initial mount
    useEffect(() => {
        if (htmlInitialTab === 'installed') {
            installedTabRef.current?.focus();
        } else if (htmlInitialTab === 'updates') {
            updatesTabRef.current?.focus();
        } else {
            browseTabRef.current?.focus();
        }
    }, []);

    const handleMessage = useCallback((event: MessageEvent) => {
        const message = event.data;

        // Helper to sort projects alphabetically (same logic as sortedProjects memo)
        const getSortedProjects = (projectList: Project[]) => {
            return [...projectList].sort((a, b) => a.name.localeCompare(b.name));
        };

        switch (message.type) {
            case 'projects':
                setProjects(message.projects);
                // If a specific project was requested (from context menu), select it
                if (message.selectProjectPath) {
                    const matchingProject = message.projects.find(
                        (p: Project) => p.path === message.selectProjectPath
                    );
                    if (matchingProject) {
                        setSelectedProject(matchingProject.path);
                    } else if (message.projects.length > 0 && !selectedProjectRef.current) {
                        // Select first from sorted list
                        const sorted = getSortedProjects(message.projects);
                        setSelectedProject(sorted[0].path);
                    }
                } else if (message.projects.length > 0 && !selectedProjectRef.current) {
                    // Select first from sorted list
                    const sorted = getSortedProjects(message.projects);
                    setSelectedProject(sorted[0].path);
                }
                break;
            case 'selectProject':
                // Handle selecting a project after panel is already open
                if (message.projectPath) {
                    setSelectedProject(message.projectPath);
                }
                // Switch to initial tab if specified (e.g., 'installed' from context menu)
                if (message.initialTab) {
                    startTabTransition(() => {
                        setActiveTab(message.initialTab as 'browse' | 'installed' | 'updates');
                    });
                    // Focus the correct tab to move focus ring from Browse
                    requestAnimationFrame(() => {
                        if (message.initialTab === 'installed') {
                            installedTabRef.current?.focus();
                        } else if (message.initialTab === 'updates') {
                            updatesTabRef.current?.focus();
                        } else {
                            browseTabRef.current?.focus();
                        }
                    });
                }
                break;
            case 'installedPackages':
                if (message.projectPath === selectedProjectRef.current) {
                    setInstalledPackages(message.packages);
                    setLoadingInstalled(false);
                }
                break;
            case 'transitivePackages':
            case 'transitiveMetadata':
            case 'restoreProjectResult':
            case 'bulkRemoveConfirmed':
                installedTabCompRef.current?.handleMessage(message);
                break;
            case 'searchResults':
            case 'autocompleteResults':
            case 'restoreSearchQuery':
                browseTabCompRef.current?.handleMessage(message);
                // Auto-select package after navigateToPackage triggered a search
                if (message.type === 'searchResults' && pendingNavigationRef.current) {
                    const nav = pendingNavigationRef.current;
                    pendingNavigationRef.current = null;
                    const results = message.results as PackageSearchResult[];
                    const match = results.find(
                        (p: PackageSearchResult) => p.id.toLowerCase() === nav.packageId.toLowerCase()
                    );
                    if (match) {
                        const version = nav.version || match.version;
                        selectDirectPackage(match, {
                            selectedVersionValue: version,
                            metadataVersion: version,
                            initialVersions: match.versions || []
                        });
                    }
                }
                break;
            case 'sources':
                setSources(message.sources);
                setTogglingSource(null); // Clear toggling state after sources update
                if (message.failedSources) {
                    setFailedSources(message.failedSources);
                }
                // If the currently selected source was disabled, reset to 'all'
                if (message.disabledSourceUrl && selectedSourceRef.current === message.disabledSourceUrl) {
                    setSelectedSource('all');
                }
                // If a source was removed and it was selected, reset to 'all'
                if (message.removedSourceName) {
                    if (message.removedSourceUrl && selectedSourceRef.current === message.removedSourceUrl) {
                        setSelectedSource('all');
                    }
                    setRemovingSource(null);
                }
                // Don't set default here - let settings handler do it
                break;
            case 'sourceConnectivityUpdate':
                // Update failed sources after background connectivity test completes
                if (message.failedSources) {
                    setFailedSources(message.failedSources);
                }
                break;
            case 'configFiles':
                setConfigFiles(message.configFiles);
                // Default to first config file (user-level)
                if (message.configFiles.length > 0 && !selectedConfigFile) {
                    setSelectedConfigFile(message.configFiles[0].path);
                }
                break;
            case 'addSourceResult':
                sourceSettingsRef.current?.handleAddSourceResult(message.success, message.error);
                break;
            case 'installResult':
            case 'updateResult':
            case 'removeResult':
                if (message.success && message.projectPath === selectedProjectRef.current) {
                    vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                    installedTabCompRef.current?.resetTransitiveState(true);
                }
                break;
            case 'bulkUpdateResult':
                updatesTabCompRef.current?.handleMessage(message);
                if (message.projectPath === selectedProjectRef.current) {
                    vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                    installedTabCompRef.current?.resetTransitiveState(true);
                }
                break;
            case 'bulkRemoveResult':
                installedTabCompRef.current?.handleMessage(message);
                if (message.projectPath === selectedProjectRef.current) {
                    vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                    installedTabCompRef.current?.resetTransitiveState(true);
                }
                break;
            case 'bulkInstallResult':
                {
                    const bulkResults = message.results as { projectPath: string; projectName: string; success: boolean }[];
                    const bulkPackageId = message.packageId as string;
                    const bulkVersion = message.version as string;
                    // Optimistically update multi-install data for immediate UI feedback
                    if (bulkResults?.length > 0 && bulkVersion) {
                        setMultiInstallProjectData(prev => {
                            const updated = prev.map(p => ({ ...p, packages: [...p.packages] }));
                            for (const result of bulkResults) {
                                if (!result.success) { continue; }
                                let entry = updated.find(p => p.projectPath === result.projectPath);
                                if (!entry) {
                                    entry = { projectPath: result.projectPath, projectName: result.projectName, packages: [] };
                                    updated.push(entry);
                                }
                                const pkgIdx = entry.packages.findIndex(pkg => pkg.id.toLowerCase() === bulkPackageId.toLowerCase());
                                if (pkgIdx >= 0) {
                                    entry.packages[pkgIdx] = { ...entry.packages[pkgIdx], version: bulkVersion, resolvedVersion: bulkVersion };
                                } else {
                                    entry.packages.push({ id: bulkPackageId, version: bulkVersion, resolvedVersion: bulkVersion });
                                }
                            }
                            return updated;
                        });
                    }
                    // Also re-fetch for full accuracy
                    vscode.postMessage({ type: 'checkAllProjectsInstalled', context: 'multiInstall' });
                    // Refresh current project's installed packages
                    if (bulkResults?.some(r => r.success && r.projectPath === selectedProjectRef.current)) {
                        vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                        installedTabCompRef.current?.resetTransitiveState(true);
                    }
                }
                break;
            case 'refresh':
                vscode.postMessage({ type: 'getProjects' });
                if (selectedProjectRef.current) {
                    vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                }
                break;
            case 'packageVersions':
                // First try browse tab (handles quicksearch expansion and Ctrl+Enter)
                if (browseTabCompRef.current?.handleMessage(message)) {
                    break;
                }
                // Update versions for the selected package
                if (selectedPackageRef.current && message.packageId === selectedPackageRef.current.id) {
                    setPackageVersions(message.versions);
                    // Cache the versions in frontend cache
                    if (message.versions.length > 0) {
                        const cacheKey = `${message.packageId.toLowerCase()}|${selectedSourceRef.current === 'all' ? '' : selectedSourceRef.current}|${includePrereleaseRef.current}`;
                        versionsCache.current.set(cacheKey, message.versions);
                    }
                    // Determine the correct version to select based on the current tab
                    if (message.versions.length > 0) {
                        if (activeTabRef.current === 'installed' && selectedPackageRef.current) {
                            // Installed tab: prefer the installed version if it's in the list
                            const installedVersion = (selectedPackageRef.current as InstalledPackage).resolvedVersion
                                || (selectedPackageRef.current as InstalledPackage).version;
                            if (installedVersion && message.versions.includes(installedVersion)) {
                                setSelectedVersion(installedVersion);
                            } else {
                                setSelectedVersion(message.versions[0]);
                            }
                        } else {
                            const wasOnLatest = packageVersionsRef.current.length === 0
                                || selectedVersionRef.current === packageVersionsRef.current[0];
                            if (wasOnLatest) {
                                setSelectedVersion(message.versions[0]);
                            } else if (!message.versions.includes(selectedVersionRef.current)) {
                                setSelectedVersion(message.versions[0]);
                            }
                        }
                    }
                    setLoadingVersions(false);
                }
                break;
            case 'packageMetadata':
                // Update metadata for the selected package
                if (selectedPackageRef.current && message.packageId === selectedPackageRef.current.id) {
                    setPackageMetadata(message.metadata);
                    // Cache the metadata
                    if (message.metadata) {
                        const cacheKey = `${message.packageId.toLowerCase()}@${message.version || message.metadata.version}|${selectedSourceRef.current === 'all' ? '' : selectedSourceRef.current}`;
                        metadataCache.current.set(cacheKey, message.metadata);
                    }
                    setLoadingMetadata(false);
                }
                break;
            case 'packageUpdates':
                // Update packages with available updates
                if (message.projectPath === selectedProjectRef.current) {
                    setPackagesWithUpdates(message.updates);
                    setUpdateCount(message.updates.length);
                    setLoadingUpdates(false);
                }
                break;
            case 'allProjectsUpdates':
                // All projects updates loaded
                {
                    const projectUpdates = message.projectUpdates as ProjectUpdates[];
                    setAllProjectsUpdates(projectUpdates);
                    // Calculate total update count across all projects
                    const totalCount = projectUpdates.reduce((sum, pu) => sum + pu.updates.length, 0);
                    setUpdateCount(totalCount);
                    setLoadingAllProjectsUpdates(false);
                }
                break;
            case 'bulkUpdateAllProjectsResult':
                // Forward to UpdatesTab for state reset
                updatesTabCompRef.current?.handleMessage(message);
                // Re-fetch all projects updates to refresh the list and badge
                setLoadingAllProjectsUpdates(true);
                setAllProjectsUpdates([]);
                vscode.postMessage({
                    type: 'checkAllProjectsUpdates',
                    includePrerelease: includePrereleaseRef.current
                });
                break;
            case 'allProjectsInstalled':
                // All projects installed packages loaded
                {
                    const projectInstalled = message.projectInstalled as ProjectInstalled[];
                    if (message.context === 'multiInstall') {
                        setMultiInstallProjectData(projectInstalled);
                    } else {
                        setAllProjectsInstalled(projectInstalled);
                        setLoadingAllProjectsInstalled(false);
                        // Also update multi-install data so it stays fresh
                        setMultiInstallProjectData(projectInstalled);
                    }
                }
                break;
            case 'bulkRemoveAllProjectsConfirmed':
                // Forward to InstalledTab for state
                installedTabCompRef.current?.handleMessage(message);
                break;
            case 'bulkRemoveAllProjectsResult':
                // Forward to InstalledTab for state reset
                installedTabCompRef.current?.handleMessage(message);
                // Re-fetch all projects installed to refresh the list
                setLoadingAllProjectsInstalled(true);
                setAllProjectsInstalled([]);
                vscode.postMessage({ type: 'checkAllProjectsInstalled' });
                break;
            case 'settings':
                // Restore persisted settings
                settingsLoadedRef.current = true;
                setSettingsLoaded(true);
                if (message.includePrerelease !== undefined) {
                    setIncludePrerelease(message.includePrerelease);
                }
                if (message.selectedSource) {
                    setSelectedSource(message.selectedSource);
                } else if (!selectedSourceRef.current) {
                    // No saved source, default to 'all'
                    setSelectedSource('all');
                }
                if (message.recentSearches && message.recentSearches.length > 0) {
                    setRecentSearches(message.recentSearches);
                }
                if (message.isWindows !== undefined) {
                    setIsWindows(message.isWindows);
                }
                if (message.searchDebounceMode) {
                    setSearchDebounceMode(message.searchDebounceMode);
                }
                if (message.recentSearchesLimit !== undefined) {
                    setRecentSearchesLimit(message.recentSearchesLimit);
                    // Trim existing recent searches if limit decreased
                    if (message.recentSearchesLimit === 0) {
                        setRecentSearches([]);
                    } else {
                        setRecentSearches(prev => prev.slice(0, message.recentSearchesLimit));
                    }
                }
                break;
            case 'prereleaseChanged':
                // Synced from sidebar — update state but skip re-saving to backend
                if (message.includePrerelease !== undefined) {
                    skipSaveRef.current = true;
                    setIncludePrerelease(message.includePrerelease);
                }
                break;
            case 'sourceChanged':
                // Synced from sidebar — update state but skip re-saving to backend
                if (message.selectedSource !== undefined) {
                    skipSourceSaveRef.current = true;
                    setSelectedSource(message.selectedSource);
                }
                break;
            case 'projectChanged':
                // Synced from sidebar — update state but skip re-saving to backend
                if (message.projectPath !== undefined) {
                    skipProjectSaveRef.current = true;
                    setSelectedProject(message.projectPath);
                }
                break;
            case 'settingsChanged':
                // Handle live configuration changes from VS Code settings
                if (message.searchDebounceMode) {
                    setSearchDebounceMode(message.searchDebounceMode);
                }
                if (message.recentSearchesLimit !== undefined) {
                    setRecentSearchesLimit(message.recentSearchesLimit);
                    // Trim existing recent searches if limit decreased
                    if (message.recentSearchesLimit === 0) {
                        setRecentSearches([]);
                    } else {
                        setRecentSearches(prev => prev.slice(0, message.recentSearchesLimit));
                    }
                }
                break;
            case 'packageReadme':
                // Handle lazy-loaded README from nupkg
                if (selectedPackageRef.current && message.packageId === selectedPackageRef.current.id) {
                    setLoadingReadme(false);
                    if (message.readme) {
                        setPackageMetadata(prev => {
                            if (prev) return { ...prev, readme: message.readme };
                            // packageMetadata may be null — create minimal object for readme
                            return {
                                id: message.packageId,
                                version: selectedVersionRef.current || '',
                                description: '',
                                authors: '',
                                dependencies: [],
                                readme: message.readme
                            };
                        });
                    }
                }
                break;
            case 'splitPosition':
                // Restore persisted split position (cross-workspace)
                if (message.position !== undefined) {
                    setSplitPosition(message.position);
                }
                break;
            case 'openSourceSettings':
                // Triggered from sidebar "Manage NuGet Sources…" — open source settings overlay
                setShowSourceSettings(true);
                vscode.postMessage({ type: 'getConfigFiles' });
                break;
            case 'navigateToPackage':
                // Triggered from sidebar "View Package Details" — switch to Browse tab and search for the package
                if (message.packageId) {
                    pendingNavigationRef.current = { packageId: message.packageId, version: message.version };
                    startTabTransition(() => {
                        setActiveTab('browse');
                    });
                    // Use a short timeout to ensure BrowseTab has mounted after tab switch
                    // requestAnimationFrame alone isn't enough since useTransition defers the update
                    setTimeout(() => {
                        browseTabRef.current?.focus();
                        browseTabCompRef.current?.navigateToPackage(message.packageId);
                    }, 50);
                }
                break;
        }
    }, []);

    useEffect(() => {
        // Request initial data
        vscode.postMessage({ type: 'getProjects' });
        vscode.postMessage({ type: 'getSources' });
        vscode.postMessage({ type: 'getSettings' });
        vscode.postMessage({ type: 'getSplitPosition' });

        // Handle messages from extension
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [handleMessage]);

    useEffect(() => {
        if (selectedProject) {
            setLoadingInstalled(true);
            setInstalledPackages([]);
            vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProject });
            setSelectedPackage(null);
            // Reset installed tab visit tracking when project changes
            hasVisitedInstalledTabRef.current = false;
            // Reset transitive packages state when project changes
            installedTabCompRef.current?.resetTransitiveState(false);
            setSelectedTransitivePackage(null);
        }
    }, [selectedProject]);

    // Refresh installed packages when switching to installed tab (skip first visit to use prefetched data)
    useEffect(() => {
        if (activeTab === 'installed' && selectedProject) {
            if (hasVisitedInstalledTabRef.current) {
                // Subsequent visit - refetch to pick up changes
                setLoadingInstalled(true);
                vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProject });
            } else {
                // First visit - mark as visited, use prefetched data
                hasVisitedInstalledTabRef.current = true;
            }
        }
    }, [activeTab, selectedProject]);

    // Save includePrerelease setting when it changes (only after settings loaded)
    useEffect(() => {
        if (settingsLoadedRef.current) {
            if (skipSaveRef.current) {
                skipSaveRef.current = false;
                return;
            }
            vscode.postMessage({ type: 'saveSettings', includePrerelease });
        }
    }, [includePrerelease]);

    // Reload package versions when includePrerelease changes and a package is selected
    useEffect(() => {
        if (settingsLoadedRef.current && selectedPackage) {
            const packageId = getPackageId(selectedPackage);
            if (packageId) {
                setLoadingVersions(true);
                vscode.postMessage({
                    type: 'getPackageVersions',
                    packageId: packageId,
                    source: selectedSource === 'all' ? undefined : selectedSource,
                    includePrerelease: includePrerelease,
                    take: 20
                });
            }
        }
    }, [includePrerelease]);

    // Save selectedSource setting when it changes (only after settings loaded)
    useEffect(() => {
        if (settingsLoadedRef.current && selectedSource) {
            if (skipSourceSaveRef.current) {
                skipSourceSaveRef.current = false;
                return;
            }
            vscode.postMessage({ type: 'saveSettings', selectedSource });
        }
    }, [selectedSource]);

    // Save selectedProject to workspaceState when it changes (only after settings loaded)
    useEffect(() => {
        if (settingsLoadedRef.current && selectedProject) {
            if (skipProjectSaveRef.current) {
                skipProjectSaveRef.current = false;
                return;
            }
            vscode.postMessage({ type: 'saveSettings', selectedProject });
        }
    }, [selectedProject]);

    // Save recentSearches when it changes (only after settings loaded)
    useEffect(() => {
        if (settingsLoadedRef.current) {
            vscode.postMessage({ type: 'saveSettings', recentSearches });
        }
    }, [recentSearches]);

    // Check for package updates when project, packages, or prerelease setting changes (for badge count)
    // Wait for settings to be loaded to ensure includePrerelease has the persisted value
    useEffect(() => {
        if (settingsLoaded && selectedProject && installedPackages.length > 0) {
            setLoadingUpdates(true);
            setPackagesWithUpdates([]);
            vscode.postMessage({
                type: 'checkPackageUpdates',
                projectPath: selectedProject,
                installedPackages: installedPackages,
                includePrerelease: includePrerelease
            });
        } else if (settingsLoaded && selectedProject && installedPackages.length === 0) {
            // Clear updates when all packages are uninstalled
            setPackagesWithUpdates([]);
            setUpdateCount(0);
        }
    }, [settingsLoaded, selectedProject, installedPackages, includePrerelease]);

    // Update selectedVersion when packagesWithUpdates changes and a package is selected on Updates tab
    // This ensures the version dropdown reflects the new latestVersion after prerelease checkbox toggle
    useEffect(() => {
        if (activeTab === 'updates' && selectedPackage && packagesWithUpdates.length > 0) {
            const packageId = getPackageId(selectedPackage);
            const updatedPkg = packagesWithUpdates.find(p => p.id.toLowerCase() === packageId.toLowerCase());
            if (updatedPkg && updatedPkg.latestVersion !== selectedVersion) {
                setSelectedVersion(updatedPkg.latestVersion);
            }
        }
    }, [packagesWithUpdates]);

    // Reset "Load All Projects" mode when switching away from Updates tab
    useEffect(() => {
        if (activeTab !== 'updates' && loadAllProjects) {
            setLoadAllProjects(false);
            setAllProjectsUpdates([]);
            setLoadingAllProjectsUpdates(false);
        }
    }, [activeTab]);

    // Reset "Load All Projects" mode for Installed tab when switching away
    useEffect(() => {
        if (activeTab !== 'installed' && loadAllProjectsInstalled) {
            setLoadAllProjectsInstalled(false);
            setAllProjectsInstalled([]);
            setLoadingAllProjectsInstalled(false);
        }
    }, [activeTab]);

    // Callback to handle Load All checkbox change
    const handleLoadAllChange = useCallback((checked: boolean) => {
        setLoadAllProjects(checked);
        if (checked) {
            // Start loading all projects
            setLoadingAllProjectsUpdates(true);
            setAllProjectsUpdates([]);
            vscode.postMessage({
                type: 'checkAllProjectsUpdates',
                includePrerelease: includePrerelease
            });
        } else {
            // Switch back to single project mode
            setAllProjectsUpdates([]);
            setLoadingAllProjectsUpdates(false);
            // Re-fetch single project updates
            if (selectedProject && installedPackages.length > 0) {
                setLoadingUpdates(true);
                vscode.postMessage({
                    type: 'checkPackageUpdates',
                    projectPath: selectedProject,
                    installedPackages: installedPackages,
                    includePrerelease: includePrerelease
                });
            }
        }
    }, [includePrerelease, selectedProject, installedPackages]);

    // Callback to handle Load All Installed checkbox change
    const handleLoadAllInstalledChange = useCallback((checked: boolean) => {
        setLoadAllProjectsInstalled(checked);
        if (checked) {
            // Start loading all projects installed packages
            setLoadingAllProjectsInstalled(true);
            setAllProjectsInstalled([]);
            vscode.postMessage({ type: 'checkAllProjectsInstalled' });
        } else {
            // Switch back to single project mode
            setAllProjectsInstalled([]);
            setLoadingAllProjectsInstalled(false);
        }
    }, []);

    // Reset readme attempted state when a new package is selected
    useEffect(() => {
        setReadmeAttempted(false);
    }, [selectedPackage]);

    // Lazy load README from nupkg when readme tab is clicked and no readme available
    useEffect(() => {
        if (
            detailsTab === 'readme' &&
            selectedPackage &&
            !loadingReadme &&
            !readmeAttempted
        ) {
            // Already have readme loaded
            if (packageMetadata?.readme) return;
            // In normal mode, wait for packageMetadata to load first
            if (!packageMetadata) return;

            const pkgId = packageMetadata?.id || getPackageId(selectedPackage);
            const version = packageMetadata?.version || selectedVersionRef.current;
            if (!version) return;

            // Mark as attempted so we don't retry
            setReadmeAttempted(true);
            setLoadingReadme(true);
            // Request README extraction from nupkg
            vscode.postMessage({
                type: 'fetchReadmeFromPackage',
                packageId: pkgId,
                version: version,
                source: selectedSource === 'all' ? undefined : selectedSource
            });
        }
    }, [detailsTab, selectedPackage, packageMetadata, loadingReadme, readmeAttempted, selectedSource]);

    // Handle copy button clicks in README code blocks using event delegation
    useEffect(() => {
        const handleCopyClick = async (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const headerBtn = target.closest('.code-header-btn') as HTMLElement | null;
            if (headerBtn) {
                const wrapper = headerBtn.closest('.code-block-wrapper');
                const codeElement = wrapper?.querySelector('code');
                if (codeElement) {
                    try {
                        await navigator.clipboard.writeText(codeElement.textContent || '');
                        headerBtn.classList.add('copied');
                        setTimeout(() => {
                            headerBtn.classList.remove('copied');
                        }, 2000);
                    } catch {
                        // Fallback: flash error state briefly
                        headerBtn.classList.add('error');
                        setTimeout(() => {
                            headerBtn.classList.remove('error');
                        }, 2000);
                    }
                }
            }
        };

        document.addEventListener('click', handleCopyClick);
        return () => document.removeEventListener('click', handleCopyClick);
    }, []);

    // Memoize enabled sources to avoid recalculation on every render
    const enabledSources = useMemo(() =>
        sources.filter(s => s.enabled),
        [sources]
    );

    // Sort projects alphabetically
    const sortedProjects = useMemo(() => {
        return [...projects].sort((a, b) => a.name.localeCompare(b.name));
    }, [projects]);

    // Memoize sanitized README HTML to avoid re-sanitizing on every render
    const sanitizedReadmeHtml = useMemo(() => {
        if (!packageMetadata?.readme) return '';
        return renderMarkdownToHtml(packageMetadata.readme);
    }, [packageMetadata?.readme]);

    const handleSashReset = useCallback(() => setSplitPosition(35), []);
    const handleSashDragEnd = useCallback((pos: number) => {
        vscode.postMessage({ type: 'saveSplitPosition', position: pos });
    }, []);

    const handleToggleDep = useCallback((key: string) => {
        setExpandedDeps(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }, []);

    const handleInstall = useCallback((packageId: string, version: string) => {
        if (!selectedProject) {
            return;
        }
        vscode.postMessage({
            type: 'installPackage',
            projectPath: selectedProject,
            packageId,
            version
        });
    }, [selectedProject]);

    const handleMultiInstall = useCallback((packageId: string, version: string, projectPaths: string[]) => {
        if (projectPaths.length === 0) { return; }
        vscode.postMessage({
            type: 'bulkInstall',
            packageId,
            version,
            projectPaths
        });
    }, []);

    const handleMultiInstallOpen = useCallback(() => {
        // Fetch per-project installed data for the Multi Install dropdown
        vscode.postMessage({ type: 'checkAllProjectsInstalled', context: 'multiInstall' });
    }, []);

    const handleRemove = useCallback((packageId: string) => {
        if (!selectedProject) {
            return;
        }
        vscode.postMessage({
            type: 'removePackage',
            projectPath: selectedProject,
            packageId
        });
    }, [selectedProject]);

    // Refresh installed packages (called from InstalledTab refresh button)
    const handleRefreshAll = useCallback(() => {
        const project = selectedProjectRef.current;
        if (!project) { return; }
        setLoadingInstalled(true);
        vscode.postMessage({ type: 'getInstalledPackages', projectPath: project });
    }, [vscode]);

    // Keyboard navigation handler for package lists - returns a keydown handler
    // packages: array to navigate, getCurrentId: get currently selected id, triggerClick: function to call on selection
    // Optional: onAction is called when Ctrl+Enter is pressed on current selection (for install/update)
    // Optional: onDelete is called when Delete is pressed on current selection (for uninstall)
    // Optional: onToggle is called when Space is pressed on current selection (for checkbox toggle)
    // Optional: onLeftArrow/onRightArrow for switching details/readme tabs
    const createPackageListKeyHandler = useCallback(<T extends { id: string }>(
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
        }
    ) => {
        return (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (packages.length === 0) {
                return;
            }

            const currentId = getCurrentId();
            const currentIndex = currentId
                ? packages.findIndex(p => p.id.toLowerCase() === currentId.toLowerCase())
                : -1;

            // Handle action keys on current selection (Ctrl+Enter for install/update)
            if (e.key === 'Enter' && e.ctrlKey && options?.onAction && currentIndex >= 0) {
                e.preventDefault();
                options.onAction(packages[currentIndex]);
                return;
            }
            if (e.key === 'Delete' && options?.onDelete && currentIndex >= 0) {
                e.preventDefault();
                options.onDelete(packages[currentIndex]);
                return;
            }
            // Handle Space for checkbox toggle
            if (e.key === ' ' && options?.onToggle && currentIndex >= 0) {
                e.preventDefault();
                options.onToggle(packages[currentIndex]);
                return;
            }
            // Handle Left/Right arrow for details/readme tab switching
            if (e.key === 'ArrowLeft' && options?.onLeftArrow && currentIndex >= 0) {
                e.preventDefault();
                options.onLeftArrow();
                return;
            }
            if (e.key === 'ArrowRight' && options?.onRightArrow && currentIndex >= 0) {
                e.preventDefault();
                options.onRightArrow();
                return;
            }

            let newIndex = currentIndex;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                newIndex = currentIndex < packages.length - 1 ? currentIndex + 1 : currentIndex;
                // If nothing selected, select first item
                if (currentIndex === -1) {
                    newIndex = 0;
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                // If at first item and onExitTop is provided, exit to parent (tab button)
                if (currentIndex === 0 && options?.onExitTop) {
                    options.onExitTop();
                    return;
                }
                newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
                // If nothing selected, select first item
                if (currentIndex === -1) {
                    newIndex = 0;
                }
            } else if (e.key === 'Home') {
                e.preventDefault();
                newIndex = 0;
            } else if (e.key === 'End') {
                e.preventDefault();
                newIndex = packages.length - 1;
            } else {
                return; // Not a navigation key
            }

            if (newIndex !== currentIndex && newIndex >= 0 && newIndex < packages.length) {
                // Store container reference before async operation
                const container = e.currentTarget;
                // Track if this is the first selection (for scroll behavior)
                const isFirstSelection = currentIndex === -1 && newIndex === 0;
                triggerClick(packages[newIndex]);
                // Scroll into view after state update, but NOT when selecting first item
                // (to avoid hiding the header/buttons above the list)
                if (!isFirstSelection) {
                    requestAnimationFrame(() => {
                        const selectedElement = container.querySelector('.package-item.selected, .transitive-package-item.selected');
                        selectedElement?.scrollIntoView({ block: 'nearest' });
                    });
                }
            }
        };
    }, []);

    return (
        <div className="app">
            <div className="header">
                <h2>Manage NuGet packages</h2>
                <div className="header-selectors">
                    <label className="preview-checkbox">
                        <input
                            type="checkbox"
                            checked={includePrerelease}
                            onChange={(e) => setIncludePrerelease((e.target as HTMLInputElement).checked)}
                        />
                        Include prerelease
                    </label>
                    {sortedProjects.length > 0 ? (
                        <select
                            value={selectedProject}
                            onChange={(e) => setSelectedProject((e.target as HTMLSelectElement).value)}
                            className="project-selector"
                            disabled={activeTab === 'updates' && loadAllProjects}
                            title={activeTab === 'updates' && loadAllProjects ? 'Disabled while "Load all projects" is checked' : undefined}
                        >
                            {sortedProjects.map(p => (
                                <option key={p.path} value={p.path}>{p.name}</option>
                            ))}
                        </select>
                    ) : (
                        <span className="no-projects">No .NET projects found</span>
                    )}
                    <div className="source-selector-wrapper">
                        <select
                            value={selectedSource}
                            onChange={(e) => setSelectedSource((e.target as HTMLSelectElement).value)}
                            className="source-selector"
                        >
                            <option value="all">All Sources</option>
                            {enabledSources.map(s => {
                                const isFailed = failedSources.some(f => f.url === s.url);
                                return (
                                    <option key={s.url} value={s.url}>
                                        {isFailed ? '⚠ ' : ''}{s.name}
                                    </option>
                                );
                            })}
                        </select>
                        <button
                            className="source-settings-btn"
                            title="Manage NuGet sources"
                            onClick={() => {
                                setShowSourceSettings(true);
                                vscode.postMessage({ type: 'getConfigFiles' });
                            }}
                        >
                            <SettingsGearIcon size={16} />
                        </button>
                        {failedSources.length > 0 && (
                            <span
                                className="source-warning-indicator"
                                title={`${failedSources.length} source(s) unreachable. Click to refresh.`}
                                onClick={() => vscode.postMessage({ type: 'refreshSources' })}
                            >
                                <WarningIcon size={16} />
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Source Settings Overlay */}
            {showSourceSettings && (
                <MemoizedSourceSettingsOverlay
                    ref={sourceSettingsRef}
                    sources={sources}
                    configFiles={configFiles}
                    selectedConfigFile={selectedConfigFile}
                    onSelectedConfigFileChange={setSelectedConfigFile}
                    isWindows={isWindows}
                    togglingSource={togglingSource}
                    removingSource={removingSource}
                    vscode={vscode}
                    onClose={() => setShowSourceSettings(false)}
                    onToggleSource={(source) => {
                        setTogglingSource(source.name);
                        vscode.postMessage(source.enabled
                            ? { type: 'disableSource', sourceName: source.name, sourceUrl: source.url }
                            : { type: 'enableSource', sourceName: source.name });
                    }}
                    onRemoveSource={(name, configFile) => {
                        setRemovingSource(name);
                        vscode.postMessage({ type: 'removeSource', sourceName: name, configFile });
                    }}
                />
            )}

            <div className="tabs">
                <button
                    ref={browseTabRef}
                    className={`tab ${activeTab === 'browse' ? 'active' : ''} ${isTabPending ? 'pending' : ''}`}
                    onClick={() => {
                        startTabTransition(() => {
                            setActiveTab('browse');
                            setSelectedPackage(null);
                            setSelectedTransitivePackage(null);
                        });
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            // Navigate to search input
                            browseTabCompRef.current?.focusSearchInput();
                        } else if (e.key === 'ArrowRight') {
                            e.preventDefault();
                            startTabTransition(() => {
                                setActiveTab('installed');
                                setSelectedPackage(null);
                                setSelectedTransitivePackage(null);
                            });
                            // Focus the new tab after state update
                            requestAnimationFrame(() => {
                                installedTabRef.current?.focus();
                            });
                        }
                    }}
                >
                    Browse
                </button>
                <button
                    ref={installedTabRef}
                    className={`tab ${activeTab === 'installed' ? 'active' : ''} ${isTabPending ? 'pending' : ''}`}
                    onClick={() => {
                        startTabTransition(() => {
                            setActiveTab('installed');
                            setSelectedPackage(null);
                            setSelectedTransitivePackage(null);
                        });
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            installedTabCompRef.current?.focusAndSelectFirst();
                        } else if (e.key === 'ArrowLeft') {
                            e.preventDefault();
                            startTabTransition(() => {
                                setActiveTab('browse');
                                setSelectedPackage(null);
                                setSelectedTransitivePackage(null);
                            });
                            requestAnimationFrame(() => {
                                browseTabRef.current?.focus();
                            });
                        } else if (e.key === 'ArrowRight') {
                            e.preventDefault();
                            startTabTransition(() => {
                                setActiveTab('updates');
                                setSelectedPackage(null);
                                setSelectedTransitivePackage(null);
                            });
                            requestAnimationFrame(() => {
                                updatesTabRef.current?.focus();
                            });
                        }
                    }}
                >
                    Installed
                </button>
                <button
                    ref={updatesTabRef}
                    className={`tab ${activeTab === 'updates' ? 'active' : ''} ${isTabPending ? 'pending' : ''}`}
                    onClick={() => {
                        startTabTransition(() => {
                            setActiveTab('updates');
                            setSelectedPackage(null);
                            setSelectedTransitivePackage(null);
                        });
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            updatesTabCompRef.current?.focusAndSelectFirst();
                        } else if (e.key === 'ArrowLeft') {
                            e.preventDefault();
                            startTabTransition(() => {
                                setActiveTab('installed');
                                setSelectedPackage(null);
                                setSelectedTransitivePackage(null);
                            });
                            requestAnimationFrame(() => {
                                installedTabRef.current?.focus();
                            });
                        }
                    }}
                >
                    Updates
                    {updateCount > 0 && <span className="tab-badge">{updateCount}</span>}
                </button>
            </div>

            <MemoizedBrowseTab
                ref={browseTabCompRef}
                activeTab={activeTab}
                selectedPackage={selectedPackage}
                selectedVersion={selectedVersion}
                detailsTab={detailsTab}
                includePrerelease={includePrerelease}
                selectedSource={selectedSource}
                enabledSources={enabledSources}
                selectedProject={selectedProject}
                recentSearches={recentSearches}
                recentSearchesLimit={recentSearchesLimit}
                searchDebounceMode={searchDebounceMode}
                splitPosition={splitPosition}
                defaultPackageIcon={defaultPackageIcon}
                detailsPanelContent={
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
                        projects={projects}
                        allProjectsInstalled={multiInstallProjectData}
                        onInstall={handleInstall}
                        onMultiInstall={handleMultiInstall}
                        onMultiInstallOpen={handleMultiInstallOpen}
                        onRemove={handleRemove}
                        onVersionChange={setSelectedVersion}
                        onDetailsTabChange={setDetailsTab}
                        onToggleDep={handleToggleDep}
                        onReadmeAttemptedChange={setReadmeAttempted}
                        onMetadataChange={setPackageMetadata}
                        onLoadingMetadataChange={setLoadingMetadata}
                        metadataCache={metadataCache}
                        vscode={vscode}
                    />
                }
                versionsCache={versionsCache}
                onSelectPackage={selectDirectPackage}
                clearSelection={clearSelection}
                onInstall={handleInstall}
                onSetSelectedPackage={setSelectedPackage}
                onSetSelectedTransitivePackage={setSelectedTransitivePackage}
                onSetSelectedVersion={setSelectedVersion}
                onSetRecentSearches={setRecentSearches}
                onDetailsTabChange={setDetailsTab}
                setSplitPosition={setSplitPosition}
                handleSashReset={handleSashReset}
                handleSashDragEnd={handleSashDragEnd}
                createPackageListKeyHandler={createPackageListKeyHandler}
                vscode={vscode}
                browseTabRef={browseTabRef}
                MemoizedDraggableSash={MemoizedDraggableSash}
            />

            <MemoizedInstalledTab
                ref={installedTabCompRef}
                activeTab={activeTab}
                installedPackages={installedPackages}
                loadingInstalled={loadingInstalled}
                selectedPackage={selectedPackage}
                selectedTransitivePackage={selectedTransitivePackage}
                selectedProject={selectedProject}
                splitPosition={splitPosition}
                defaultPackageIcon={defaultPackageIcon}
                includePrerelease={includePrerelease}
                selectedSource={selectedSource}
                packageMetadata={packageMetadata}
                loadingMetadata={loadingMetadata}
                loadingVersions={loadingVersions}
                packageVersions={packageVersions}
                selectedVersion={selectedVersion}
                detailsTab={detailsTab}
                loadingReadme={loadingReadme}
                sanitizedReadmeHtml={sanitizedReadmeHtml}
                expandedDeps={expandedDeps}
                onSelectDirectPackage={selectDirectPackage}
                onSelectTransitivePackage={selectTransitivePackage}
                onRefreshAll={handleRefreshAll}
                clearSelection={clearSelection}
                onInstall={handleInstall}
                onRemove={handleRemove}
                onDetailsTabChange={setDetailsTab}
                onVersionChange={setSelectedVersion}
                onToggleDep={handleToggleDep}
                onReadmeAttemptedChange={setReadmeAttempted}
                onMetadataChange={setPackageMetadata}
                onLoadingMetadataChange={setLoadingMetadata}
                onSetSelectedPackage={setSelectedPackage}
                onSetSelectedTransitivePackage={setSelectedTransitivePackage}
                onSetSelectedVersion={setSelectedVersion}
                setSplitPosition={setSplitPosition}
                handleSashReset={handleSashReset}
                handleSashDragEnd={handleSashDragEnd}
                createPackageListKeyHandler={createPackageListKeyHandler}
                metadataCache={metadataCache}
                vscode={vscode}
                installedTabRef={installedTabRef}
                MemoizedDraggableSash={MemoizedDraggableSash}
                loadAllProjectsInstalled={loadAllProjectsInstalled}
                allProjectsInstalled={allProjectsInstalled}
                loadingAllProjectsInstalled={loadingAllProjectsInstalled}
                onLoadAllInstalledChange={handleLoadAllInstalledChange}
                projects={projects}
            />

            {activeTab === 'updates' && (
                <MemoizedUpdatesTab
                    ref={updatesTabCompRef}
                    packagesWithUpdates={packagesWithUpdates}
                    loadingUpdates={loadingUpdates}
                    installedPackages={installedPackages}
                    selectedPackage={selectedPackage}
                    selectedProject={selectedProject}
                    selectedSource={selectedSource}
                    includePrerelease={includePrerelease}
                    splitPosition={splitPosition}
                    defaultPackageIcon={defaultPackageIcon}
                    packageMetadata={packageMetadata}
                    loadingMetadata={loadingMetadata}
                    loadingVersions={loadingVersions}
                    packageVersions={packageVersions}
                    selectedVersion={selectedVersion}
                    detailsTab={detailsTab}
                    loadingReadme={loadingReadme}
                    sanitizedReadmeHtml={sanitizedReadmeHtml}
                    expandedDeps={expandedDeps}
                    loadAllProjects={loadAllProjects}
                    allProjectsUpdates={allProjectsUpdates}
                    loadingAllProjectsUpdates={loadingAllProjectsUpdates}
                    onLoadAllChange={handleLoadAllChange}
                    projects={projects}
                    onSelectPackage={selectDirectPackage}
                    clearSelection={clearSelection}
                    onInstall={handleInstall}
                    onRemove={handleRemove}
                    onDetailsTabChange={setDetailsTab}
                    onVersionChange={setSelectedVersion}
                    onToggleDep={handleToggleDep}
                    onReadmeAttemptedChange={setReadmeAttempted}
                    onMetadataChange={setPackageMetadata}
                    onLoadingMetadataChange={setLoadingMetadata}
                    onSetSelectedPackage={setSelectedPackage}
                    onSetSelectedTransitivePackage={setSelectedTransitivePackage}
                    onSetSelectedVersion={setSelectedVersion}
                    setSplitPosition={setSplitPosition}
                    handleSashReset={handleSashReset}
                    handleSashDragEnd={handleSashDragEnd}
                    createPackageListKeyHandler={createPackageListKeyHandler}
                    metadataCache={metadataCache}
                    vscode={vscode}
                    updatesTabRef={updatesTabRef}
                    MemoizedDraggableSash={MemoizedDraggableSash}
                />
            )}
        </div>
    );
};

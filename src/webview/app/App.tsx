import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import './App.css';
import { MemoizedDraggableSash } from './components/DraggableSash';
import type { InstalledTabHandle } from './components/InstalledTab';
import { MemoizedInstalledTab } from './components/InstalledTab';
import { MemoizedPackageDetailsPanel } from './components/PackageDetailsPanel';
import type { SourceSettingsOverlayHandle } from './components/SourceSettingsOverlay';
import { MemoizedSourceSettingsOverlay } from './components/SourceSettingsOverlay';
import type { UpdatesTabHandle } from './components/UpdatesTab';
import { MemoizedUpdatesTab } from './components/UpdatesTab';
import { usePackageSelection } from './hooks/usePackageSelection';
import { useHoverPrefetch } from './hooks/useHoverPrefetch';
import { ClearAllIcon, CloudDownloadIcon, FilterIcon, LoadingIcon, SettingsGearIcon, SyncIcon, VerifiedIcon, WarningIcon } from './icons';
import { renderMarkdownToHtml } from './markdownSetup';
import type { AllProjectsTransitiveRow, AppState, FailedSource, InstalledPackage, NuGetSource, PackageMetadata, PackageSearchResult, PackageUpdate, Project, ProjectInstalled, ProjectUpdates, QuickSearchSourceResult, SelectedTransitivePackage, TabType, TransitiveFrameworkSection, VulnerabilitySeverity } from './types';
import { ALL_PROJECTS_SENTINEL, LRUMap, getPackageId } from './types';
import { FILTER_PREFIXES, parseSearchQuery } from './utils/parseSearchQuery';

// Get the default package icon URL from the root element data attribute
const defaultPackageIcon = document.getElementById('root')?.dataset.packageIcon || '';
// Get initial tab from HTML (set when opened from context menu)
const htmlInitialTab = document.getElementById('root')?.dataset.initialTab as TabType | '' | undefined;

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
    const [activeTab, setActiveTab] = useState<TabType>(() => {
        const raw: string | undefined = htmlInitialTab || savedState?.activeTab;
        // Migrate legacy 'browse' tab to 'installed'
        if (!raw || raw === 'browse') { return 'installed'; }
        return raw as TabType;
    });
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
    const [restoreEnabled, setRestoreEnabled] = useState<boolean>(savedState?.restoreEnabled ?? true);
    const [recentSearches, setRecentSearches] = useState<string[]>(savedState?.recentSearches || []);
    // Search debounce settings from extension
    const [searchDebounceMode, setSearchDebounceMode] = useState<'quicksearch' | 'full' | 'off'>('quicksearch');
    const [recentSearchesLimit, setRecentSearchesLimit] = useState<number>(5);
    const recentSearchesLimitRef = useRef<number>(5);
    const [packagesWithUpdates, setPackagesWithUpdates] = useState<PackageUpdate[]>([]);
    const [updateCount, setUpdateCount] = useState<number>(0);
    const streamedUpdateIdsRef = useRef(new Set<string>());
    const [loadingUpdates, setLoadingUpdates] = useState(false);
    // "All Projects" mode data (driven by selectedProject === ALL_PROJECTS_SENTINEL)
    const [allProjectsUpdates, setAllProjectsUpdates] = useState<ProjectUpdates[]>([]);
    const [loadingAllProjectsUpdates, setLoadingAllProjectsUpdates] = useState(false);
    const [allProjectsInstalled, setAllProjectsInstalled] = useState<ProjectInstalled[]>([]);
    const [loadingAllProjectsInstalled, setLoadingAllProjectsInstalled] = useState(false);
    // Derived: is "All Projects" currently selected?
    const isAllProjects = selectedProject === ALL_PROJECTS_SENTINEL;
    // When a package is selected from an all-projects list, this holds the specific project path
    const [activeProjectPath, setActiveProjectPath] = useState<string>('');
    const activeProjectPathRef = useRef('');
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

    const [selectedTransitivePackage, setSelectedTransitivePackage] = useState<SelectedTransitivePackage | null>(null);

    // --- Unified search bar state (lifted from BrowseTab) ---
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PackageSearchResult[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showQuickSearch, setShowQuickSearch] = useState(false);
    const [quickSearchSuggestions, setQuickSearchSuggestions] = useState<QuickSearchSourceResult[]>([]);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
    const [expandedQuickSearchIndex, setExpandedQuickSearchIndex] = useState<number | null>(null);
    const [quickSearchVersions, setQuickSearchVersions] = useState<string[]>([]);
    const [selectedQuickVersionIndex, setSelectedQuickVersionIndex] = useState(0);
    const [quickSearchLoading, setQuickSearchLoading] = useState(false);
    const [quickVersionsLoading, setQuickVersionsLoading] = useState(false);
    const [quickVersionsError, setQuickVersionsError] = useState<string | null>(null);
    const isKeyboardNavigationRef = useRef(false);
    const [isKeyboardNavActive, setIsKeyboardNavActive] = useState(false);
    const [showSearchHistory, setShowSearchHistory] = useState(false);
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [filterDropdownIndex, setFilterDropdownIndex] = useState(0);
    const [filterButtonTriggered, setFilterButtonTriggered] = useState(false);

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
            restoreEnabled,
            recentSearches
        });
    }, [selectedProject, selectedSource, activeTab, includePrerelease, restoreEnabled, recentSearches]);

    // Use ref to track latest selectedProject for message handler
    const selectedProjectRef = useRef(selectedProject);
    useEffect(() => {
        selectedProjectRef.current = selectedProject;
    }, [selectedProject]);

    // Sync activeProjectPath ref
    useEffect(() => {
        activeProjectPathRef.current = activeProjectPath;
    }, [activeProjectPath]);

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
    // Flag to skip saveSettings when restoreEnabled was synced from sidebar (prevents echo loop)
    const skipRestoreSaveRef = useRef(false);
    // Flags to skip saveSettings when source/project were synced from backend (prevents echo loop)
    const skipSourceSaveRef = useRef(false);
    const skipProjectSaveRef = useRef(false);
    // Skip next checkPackageUpdates effect fire when we already know the update outcome (optimistic)
    const skipNextUpdateCheckRef = useRef(false);
    // Debounce rapid refresh messages from sidebar operations
    const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    // Clean up debounce timer on unmount
    useEffect(() => () => { if (refreshDebounceRef.current) { clearTimeout(refreshDebounceRef.current); } }, []);
    /**
     * Plan 10 — active requestId for the streamed `installed`-context all-projects-installed query.
     * Chunks tagged with a different (older) requestId are discarded as stale.
     */
    const installedStreamRequestIdRef = useRef<string>('');
    const requestStreamedAllProjectsInstalled = useCallback(() => {
        const requestId = `apinst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        installedStreamRequestIdRef.current = requestId;
        vscode.postMessage({ type: 'checkAllProjectsInstalled', requestId });
    }, []);
    /** Plan 10 Stage B: separate request id for the multiInstall context (independent abort lifetime). */
    const multiInstallStreamRequestIdRef = useRef<string>('');
    const requestStreamedMultiInstall = useCallback(() => {
        const requestId = `apinst-mi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        multiInstallStreamRequestIdRef.current = requestId;
        vscode.postMessage({ type: 'checkAllProjectsInstalled', requestId, context: 'multiInstall' });
    }, []);

    /**
     * All-projects transitive aggregation state.
     * Slots are keyed by projectPath. Streamed via `getAllProjectsTransitive` →
     * `allProjectsTransitiveStart` → N×`allProjectsTransitiveProjectFound` →
     * `allProjectsTransitiveComplete`. Stale `requestId` discarded.
     * Aggregation produces `allProjectsTransitiveRows` (deduped by id@version).
     */
    type ProjectTransitiveSlot = {
        projectName: string;
        workspaceFolder?: string;
        frameworks: TransitiveFrameworkSection[];
        dataSourceAvailable: boolean;
        errorKind?: 'parse-failed' | 'fs-error' | 'unknown';
        // True once the backend has emitted a ProjectFound chunk for this slot.
        // Start placeholders set this to false; only `received` slots count toward
        // the "missing data / restore" banner — otherwise in-flight projects look
        // like errors during streaming.
        received?: boolean;
    };
    const [allProjectsTransitive, setAllProjectsTransitive] = useState<Record<string, ProjectTransitiveSlot>>({});
    const [loadingAllProjectsTransitive, setLoadingAllProjectsTransitive] = useState(false);
    const [allProjectsTransitiveLoaded, setAllProjectsTransitiveLoaded] = useState(false);
    const allProjectsTransitiveRequestIdRef = useRef<string>('');
    /** Mirror of the InstalledTab's all-projects transitive expand state. */
    const allProjectsTransitiveExpandedRef = useRef(false);
    /** Idempotency guard for restoreProjectsBatch — disables button while batch is in flight. */
    const [restoringProjectsBatch, setRestoringProjectsBatch] = useState(false);
    const restoreProjectsBatchRequestIdRef = useRef<string>('');

    const requestStreamedAllProjectsTransitive = useCallback(() => {
        // Cancel any in-flight stream first
        if (allProjectsTransitiveRequestIdRef.current) {
            vscode.postMessage({ type: 'cancelAllProjectsTransitive', requestId: allProjectsTransitiveRequestIdRef.current });
        }
        const requestId = `aptrans-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        allProjectsTransitiveRequestIdRef.current = requestId;
        setLoadingAllProjectsTransitive(true);
        setAllProjectsTransitiveLoaded(false);
        setAllProjectsTransitive({});
        vscode.postMessage({ type: 'getAllProjectsTransitive', requestId });
    }, []);

    const cancelAllProjectsTransitive = useCallback(() => {
        if (allProjectsTransitiveRequestIdRef.current) {
            vscode.postMessage({ type: 'cancelAllProjectsTransitive', requestId: allProjectsTransitiveRequestIdRef.current });
        }
        allProjectsTransitiveRequestIdRef.current = '';
        setLoadingAllProjectsTransitive(false);
    }, []);

    /**
     * Called by InstalledTab when the all-projects transitive section is expanded
     * or collapsed. Lazy-loads on first expand. Collapse never aborts an in-flight
     * stream (per spec — keep result for re-expansion).
     */
    const handleAllProjectsTransitiveExpandedChange = useCallback((expanded: boolean) => {
        allProjectsTransitiveExpandedRef.current = expanded;
        if (expanded && !allProjectsTransitiveLoaded && !loadingAllProjectsTransitive) {
            requestStreamedAllProjectsTransitive();
        }
    }, [allProjectsTransitiveLoaded, loadingAllProjectsTransitive, requestStreamedAllProjectsTransitive]);

    const handleRestoreProjectsBatch = useCallback((projectPaths: string[]) => {
        if (projectPaths.length === 0 || restoringProjectsBatch) { return; }
        const requestId = `aprestore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        restoreProjectsBatchRequestIdRef.current = requestId;
        setRestoringProjectsBatch(true);
        vscode.postMessage({ type: 'restoreProjectsBatch', requestId, projectPaths });
    }, [restoringProjectsBatch]);
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
    const installedTabRef = useRef<HTMLButtonElement>(null);
    const updatesTabRef = useRef<HTMLButtonElement>(null);

    // Component refs for tab message routing
    const installedTabCompRef = useRef<InstalledTabHandle>(null);
    const updatesTabCompRef = useRef<UpdatesTabHandle>(null);

    // --- Unified search bar refs ---
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchInputFocusedRef = useRef(false);
    const browseScrollRef = useRef<HTMLDivElement>(null);
    const browseListRef = useRef<HTMLDivElement>(null);
    const expandingQuickSearchPackageRef = useRef<{ packageId: string; sourceUrl: string } | null>(null);
    const pendingQuickInstallRef = useRef<{ packageId: string; sourceUrl: string } | null>(null);
    const skipQuickSearchRef = useRef(false);
    const quickSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fullSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recentSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSearchParamsRef = useRef<{ query: string; source: string; prerelease: boolean }>({ query: '', source: '', prerelease: false });
    const enabledSourcesRef = useRef<NuGetSource[]>([]);
    const searchQueryRef = useRef('');
    const lastActiveTabRef = useRef<TabType>('installed');

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

    // Hover prefetch — prefetches metadata + versions on row hover (150ms debounce, 4-concurrent backend cap)
    const hoverPrefetch = useHoverPrefetch({
        versionsCache,
        metadataCache,
        selectedSourceRef,
        includePrereleaseRef,
        postMessage: (msg) => vscode.postMessage(msg),
    });

    // Auto-focus the active tab on initial mount
    useEffect(() => {
        if (htmlInitialTab === 'updates') {
            updatesTabRef.current?.focus();
        } else {
            installedTabRef.current?.focus();
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
                    if (message.selectProjectPath === ALL_PROJECTS_SENTINEL && message.projects.length > 1) {
                        // Restore all-projects mode from persisted state
                        setSelectedProject(ALL_PROJECTS_SENTINEL);
                    } else {
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
                    }
                } else if (selectedProjectRef.current === ALL_PROJECTS_SENTINEL) {
                    // Auto-downgrade: sentinel saved but only 1 project → select it
                    if (message.projects.length <= 1) {
                        const sorted = getSortedProjects(message.projects);
                        if (sorted.length > 0) {
                            setSelectedProject(sorted[0].path);
                        }
                    }
                    // else: sentinel is valid (>1 project), keep it
                } else if (message.projects.length > 0 && !selectedProjectRef.current) {
                    // Select first from sorted list
                    const sorted = getSortedProjects(message.projects);
                    setSelectedProject(sorted[0].path);
                } else if (message.projects.length > 0 && selectedProjectRef.current) {
                    // Verify saved project still exists, fallback to first
                    const exists = message.projects.some((p: Project) => p.path === selectedProjectRef.current);
                    if (!exists) {
                        const sorted = getSortedProjects(message.projects);
                        setSelectedProject(sorted[0].path);
                    }
                }
                break;
            case 'selectProject':
                // Handle selecting a project after panel is already open
                if (message.projectPath) {
                    setSelectedProject(message.projectPath);
                }
                // Switch to initial tab if specified (e.g., 'installed' from context menu)
                if (message.initialTab) {
                    const tab = (message.initialTab === 'browse' ? 'installed' : message.initialTab) as TabType;
                    startTabTransition(() => {
                        setActiveTab(tab);
                    });
                    requestAnimationFrame(() => {
                        if (tab === 'updates') {
                            updatesTabRef.current?.focus();
                        } else {
                            installedTabRef.current?.focus();
                        }
                    });
                }
                break;
            case 'installedPackages':
                if (message.projectPath === selectedProjectRef.current) {
                    setInstalledPackages(prev => {
                        const incoming = message.packages;
                        if (prev.length !== incoming.length) { return incoming; }
                        const prevKey = prev.map((p: { id: string; version: string }) => `${p.id}@${p.version}`).join('|');
                        const newKey = incoming.map((p: { id: string; version: string }) => `${p.id}@${p.version}`).join('|');
                        return prevKey === newKey ? prev : incoming;
                    });
                    setLoadingInstalled(false);
                }
                break;
            case 'installedPackagesMetadata':
                // Phase 2: merge enriched metadata into existing packages
                if (message.projectPath === selectedProjectRef.current) {
                    setInstalledPackages(prev => {
                        const enriched = message.packages as Array<Partial<InstalledPackage> & { id: string }>;
                        const metaMap = new Map(enriched.map(p => [p.id.toLowerCase(), p]));
                        let changed = false;
                        const result = prev.map(pkg => {
                            const meta = metaMap.get(pkg.id.toLowerCase());
                            if (!meta) { return pkg; }
                            const patchEntries = Object.entries(meta).filter(([key, value]) => key !== 'id' && value !== undefined);
                            if (patchEntries.length === 0) { return pkg; }
                            const hasChanges = patchEntries.some(([key, value]) => pkg[key as keyof InstalledPackage] !== value);
                            if (!hasChanges) { return pkg; }
                            changed = true;
                            return { ...pkg, ...Object.fromEntries(patchEntries) };
                        });
                        if (changed) {
                            skipNextUpdateCheckRef.current = true;
                        }
                        return changed ? result : prev;
                    });
                }
                break;
            case 'transitivePackages':
            case 'transitiveMetadata':
            case 'restoreProjectResult':
            case 'bulkRemoveConfirmed':
                installedTabCompRef.current?.handleMessage(message);
                break;
            case 'searchResults':
                setSearchResults(message.results);
                setSearchLoading(false);
                // Auto-select package after navigateToPackage triggered a search
                if (pendingNavigationRef.current) {
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
            case 'searchResultsMetadata':
                // Phase 2 of two-phase CLI search: merge enriched metadata into existing results
                if (message.query === searchQueryRef.current) {
                    setSearchResults(prev => {
                        const enriched = message.results as PackageSearchResult[];
                        const metaMap = new Map(enriched.map(r => [r.id.toLowerCase(), r]));
                        let changed = false;
                        const merged = prev.map(pkg => {
                            const match = metaMap.get(pkg.id.toLowerCase());
                            if (match && (match.iconUrl !== pkg.iconUrl || match.verified !== pkg.verified || match.authors !== pkg.authors || (match.description && match.description !== pkg.description))) {
                                changed = true;
                                return { ...pkg, iconUrl: match.iconUrl ?? pkg.iconUrl, verified: match.verified ?? pkg.verified, authors: match.authors || pkg.authors, description: match.description || pkg.description };
                            }
                            return pkg;
                        });
                        return changed ? merged : prev;
                    });
                }
                break;
            case 'autocompleteResults':
                setQuickSearchSuggestions(message.groupedResults || []);
                setQuickSearchLoading(false);
                break;
            case 'restoreSearchQuery':
                if (message.query) {
                    setSearchQuery(message.query);
                    setSearchLoading(true);
                    vscode.postMessage({
                        type: 'searchPackages',
                        query: message.query,
                        source: selectedSourceRef.current === 'all' ? undefined : selectedSourceRef.current,
                        includePrerelease: includePrereleaseRef.current,
                        take: 100
                    });
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
                if (message.success) {
                    const opPkgIdMain = (message.packageId as string)?.toLowerCase();
                    const opVerMain = (message.version as string) || '';
                    const opProjPathMain = message.projectPath as string | undefined;
                    if (selectedProjectRef.current === ALL_PROJECTS_SENTINEL) {
                        // All-projects mode: optimistically mutate, then re-fetch authoritative
                        if (opPkgIdMain && opProjPathMain && (message.type === 'installResult' || message.type === 'updateResult') && opVerMain) {
                            setAllProjectsInstalled(prev => {
                                const updated = prev.map(pi => {
                                    if (pi.projectPath !== opProjPathMain) { return pi; }
                                    if (message.type === 'updateResult') {
                                        return { ...pi, packages: pi.packages.map(p =>
                                            p.id.toLowerCase() === opPkgIdMain
                                                ? { ...p, version: opVerMain, resolvedVersion: opVerMain }
                                                : p
                                        ) };
                                    }
                                    if (pi.packages.some(p => p.id.toLowerCase() === opPkgIdMain)) { return pi; }
                                    return { ...pi, packages: [...pi.packages, { id: message.packageId as string, version: opVerMain, resolvedVersion: opVerMain } as InstalledPackage] };
                                });
                                return updated;
                            });
                            if (message.type === 'installResult') {
                                setInstalledPackages(prev => prev.some(p => p.id.toLowerCase() === opPkgIdMain) ? prev : [...prev, { id: message.packageId as string, version: opVerMain, resolvedVersion: opVerMain } as InstalledPackage]);
                            }
                        }
                        skipNextUpdateCheckRef.current = true;
                        setLoadingAllProjectsUpdates(true);
                        vscode.postMessage({
                            type: 'checkAllProjectsUpdates',
                            includePrerelease: includePrereleaseRef.current
                        });
                        setLoadingAllProjectsInstalled(true);
                        requestStreamedAllProjectsInstalled();
                    } else if (message.projectPath === selectedProjectRef.current) {
                        // Single-project mode: optimistic mutation + re-fetch
                        if (opPkgIdMain && (message.type === 'updateResult' || message.type === 'removeResult')) {
                            setPackagesWithUpdates(prev => {
                                const filtered = prev.filter(p => p.id.toLowerCase() !== opPkgIdMain);
                                setUpdateCount(filtered.length);
                                return filtered;
                            });
                        }
                        if (opPkgIdMain && opVerMain && message.type === 'installResult') {
                            setInstalledPackages(prev => prev.some(p => p.id.toLowerCase() === opPkgIdMain) ? prev : [...prev, { id: message.packageId as string, version: opVerMain, resolvedVersion: opVerMain } as InstalledPackage]);
                        } else if (opPkgIdMain && opVerMain && message.type === 'updateResult') {
                            setInstalledPackages(prev => prev.map(p =>
                                p.id.toLowerCase() === opPkgIdMain
                                    ? { ...p, version: opVerMain, resolvedVersion: opVerMain }
                                    : p
                            ));
                        }
                        skipNextUpdateCheckRef.current = true;
                        vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                        installedTabCompRef.current?.resetTransitiveState(true);
                    }
                }
                break;
            case 'bulkUpdateResult':
                updatesTabCompRef.current?.handleMessage(message);
                if (message.projectPath === selectedProjectRef.current) {
                    // Optimistically clear updates, keeping only failed packages
                    const failedUpdateIds = (message.failedPackageIds as string[] | undefined) || [];
                    if (failedUpdateIds.length > 0) {
                        const failedSet = new Set(failedUpdateIds.map(id => id.toLowerCase()));
                        setPackagesWithUpdates(prev => {
                            const remaining = prev.filter(p => failedSet.has(p.id.toLowerCase()));
                            setUpdateCount(remaining.length);
                            return remaining;
                        });
                    } else {
                        setPackagesWithUpdates([]);
                        streamedUpdateIdsRef.current.clear();
                        setUpdateCount(0);
                    }
                    skipNextUpdateCheckRef.current = true;
                    vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                    installedTabCompRef.current?.resetTransitiveState(true);
                }
                break;
            case 'bulkRemoveResult':
                installedTabCompRef.current?.handleMessage(message);
                if (message.projectPath === selectedProjectRef.current) {
                    // Optimistically remove deleted packages from updates list
                    const failedRemoveIds = (message.failedPackageIds as string[] | undefined) || [];
                    if (failedRemoveIds.length > 0) {
                        const failedRemoveSet = new Set(failedRemoveIds.map(id => id.toLowerCase()));
                        setPackagesWithUpdates(prev => {
                            // Keep updates only for packages that failed to remove (still installed)
                            const remaining = prev.filter(p => failedRemoveSet.has(p.id.toLowerCase()));
                            setUpdateCount(remaining.length);
                            return remaining;
                        });
                    } else {
                        setPackagesWithUpdates([]);
                        streamedUpdateIdsRef.current.clear();
                        setUpdateCount(0);
                    }
                    skipNextUpdateCheckRef.current = true;
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
                    requestStreamedMultiInstall();
                    // Refresh current project's installed packages
                    if (bulkResults?.some(r => r.success && r.projectPath === selectedProjectRef.current)) {
                        vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                        installedTabCompRef.current?.resetTransitiveState(true);
                    }
                }
                break;
            case 'refresh':
                // Debounce rapid refresh messages (e.g., multiple sidebar operations in quick succession)
                if (refreshDebounceRef.current) { clearTimeout(refreshDebounceRef.current); }
                refreshDebounceRef.current = setTimeout(() => {
                    vscode.postMessage({ type: 'getProjects' });
                    if (selectedProjectRef.current === ALL_PROJECTS_SENTINEL) {
                        // All-projects mode: re-fetch all-projects data (not getInstalledPackages with sentinel)
                        setLoadingAllProjectsUpdates(true);
                        vscode.postMessage({
                            type: 'checkAllProjectsUpdates',
                            includePrerelease: includePrereleaseRef.current
                        });
                        setLoadingAllProjectsInstalled(true);
                        requestStreamedAllProjectsInstalled();
                        // Transitive: refresh if currently expanded; else cancel any in-flight
                        // stream and clear so next expand re-fetches. (Without cancel, late chunks
                        // from a prior expand can repopulate the cleared map and leave it stuck.)
                        if (allProjectsTransitiveExpandedRef.current) {
                            requestStreamedAllProjectsTransitive();
                        } else {
                            cancelAllProjectsTransitive();
                            setAllProjectsTransitiveLoaded(false);
                            setAllProjectsTransitive({});
                        }
                    } else if (selectedProjectRef.current) {
                        vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                    }
                }, 300);
                break;
            case 'refreshScoped':
                // Scoped refresh from sidebar operation: re-fetch installed packages but skip
                // the expensive full checkPackageUpdates (sidebar already did a scoped check)
                if (refreshDebounceRef.current) { clearTimeout(refreshDebounceRef.current); }
                refreshDebounceRef.current = setTimeout(() => {
                    // Skip the automatic update check that fires when installedPackages changes —
                    // the sidebar's checkUpdatesInBackground(force, skipMainPanelNotify=true, scope)
                    // already performed a scoped version check for the affected packages.
                    skipNextUpdateCheckRef.current = true;
                    if (selectedProjectRef.current === ALL_PROJECTS_SENTINEL) {
                        // All-projects mode: optimistically update allProjectsUpdates using the
                        // operation data instead of re-fetching (sidebar's checkUpdatesInBackground
                        // already does a full re-check — avoid duplicate source resolution).
                        const op = message.operation as { type: string; packageId?: string; packageIds?: string[]; projectPath?: string } | undefined;
                        const opIds = op ? [...(op.packageIds || []), ...(op.packageId ? [op.packageId] : [])] : [];
                        if (opIds.length > 0) {
                            const idsLower = new Set(opIds.map(id => id.toLowerCase()));
                            setAllProjectsUpdates(prev => {
                                const updated = prev.map(pu => {
                                    // For project-scoped ops, only filter that project's updates
                                    if (op?.projectPath && pu.projectPath !== op.projectPath) { return pu; }
                                    return { ...pu, updates: pu.updates.filter(u => !idsLower.has(u.id.toLowerCase())) };
                                }).filter(pu => pu.updates.length > 0);
                                return updated;
                            });
                        }
                        // Re-fetch installed data (cheap — just reads .csproj files)
                        setLoadingAllProjectsInstalled(true);
                        requestStreamedAllProjectsInstalled();
                        // Transitive: invalidate. Re-fetch if expanded; else cancel any in-flight
                        // stream and clear so next expand re-fetches.
                        if (allProjectsTransitiveExpandedRef.current) {
                            requestStreamedAllProjectsTransitive();
                        } else {
                            cancelAllProjectsTransitive();
                            setAllProjectsTransitiveLoaded(false);
                            setAllProjectsTransitive({});
                        }
                    } else if (selectedProjectRef.current) {
                        vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                    }
                }, 300);
                break;
            case 'packageVersions':
                // Handle quicksearch version expansion
                if (expandingQuickSearchPackageRef.current &&
                    message.packageId === expandingQuickSearchPackageRef.current.packageId) {
                    expandingQuickSearchPackageRef.current = null;
                    setQuickSearchVersions(message.versions || []);
                    setQuickVersionsLoading(false);
                    setSelectedQuickVersionIndex(0);
                    break;
                }
                // Handle pending quick install (Ctrl+Enter)
                if (pendingQuickInstallRef.current &&
                    message.packageId === pendingQuickInstallRef.current.packageId) {
                    const pending = pendingQuickInstallRef.current;
                    pendingQuickInstallRef.current = null;
                    const versions = message.versions as string[];
                    if (versions && versions.length > 0 && selectedProjectRef.current) {
                        vscode.postMessage({
                            type: 'installPackage',
                            projectPath: selectedProjectRef.current,
                            packageId: pending.packageId,
                            version: versions[0],
                            source: pending.sourceUrl || undefined
                        });
                        setShowQuickSearch(false);
                        setQuickSearchSuggestions([]);
                    }
                    break;
                }
                // Update versions for the selected package
                if (selectedPackageRef.current && message.packageId === selectedPackageRef.current.id) {
                    setPackageVersions(message.versions);
                    // Cache the versions in frontend cache (use echoed request context, not current refs,
                    // to avoid cache key mismatch if user changed source/prerelease between request and response)
                    if (message.versions.length > 0) {
                        const echoedSource = message.source === 'all' || !message.source ? '' : message.source;
                        const cacheKey = `${message.packageId.toLowerCase()}|${echoedSource}|${message.includePrerelease ?? includePrereleaseRef.current}`;
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
                    // Cache the metadata (use echoed source from response, not current ref,
                    // to avoid cache key mismatch if user changed source between request and response)
                    if (message.metadata) {
                        const echoedSource = message.source === 'all' || !message.source ? '' : message.source;
                        const cacheKey = `${message.packageId.toLowerCase()}@${message.version || message.metadata.version}|${echoedSource}`;
                        metadataCache.current.set(cacheKey, message.metadata);
                    }
                    setLoadingMetadata(false);
                }
                break;
            case 'packageVersionsPrefetched':
                {
                    const key = `${(message.packageId as string).toLowerCase()}|${(!message.source || message.source === 'all') ? '' : message.source}|${!!message.includePrerelease}`;
                    hoverPrefetch.pendingVersions.current.delete(key);
                    if (!message.dropped && Array.isArray(message.versions) && message.versions.length > 0) {
                        versionsCache.current.set(key, message.versions);
                    }
                }
                break;
            case 'packageMetadataPrefetched':
                {
                    const echoedSource = (!message.source || message.source === 'all') ? '' : message.source;
                    const key = `${(message.packageId as string).toLowerCase()}@${message.version}|${echoedSource}`;
                    hoverPrefetch.pendingMetadata.current.delete(key);
                    if (!message.dropped && message.metadata) {
                        metadataCache.current.set(key, message.metadata);
                    }
                }
                break;
            case 'packageUpdateFound':
                // Progressive streaming: a single update was found during checkPackageUpdates.
                // Use ref-tracked IDs to guard both state updates identically,
                // preventing count inflation on deduplication.
                if (message.projectPath === selectedProjectRef.current) {
                    const update = message.update as PackageUpdate;
                    if (!streamedUpdateIdsRef.current.has(update.id)) {
                        streamedUpdateIdsRef.current.add(update.id);
                        setPackagesWithUpdates(prev => [...prev, update]);
                        setUpdateCount(prev => prev + 1);
                    }
                }
                break;
            case 'packageUpdates':
                // Final authoritative result: replace progressive updates with complete data
                if (message.projectPath === selectedProjectRef.current) {
                    streamedUpdateIdsRef.current.clear();
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
                {
                    // Optimistically clear updates, keeping only failed packages across projects
                    const perProjectFailed = (message.perProjectFailedIds as { projectPath: string; failedPackageIds: string[] }[] | undefined) || [];
                    setAllProjectsUpdates(prev => {
                        let next: typeof prev;
                        if (perProjectFailed.length > 0) {
                            next = prev.map(pu => {
                                const projectFailed = perProjectFailed.find(pf => pf.projectPath === pu.projectPath);
                                if (!projectFailed) { return { ...pu, updates: [] }; }
                                const failedSet = new Set(projectFailed.failedPackageIds.map(id => id.toLowerCase()));
                                return { ...pu, updates: pu.updates.filter(u => failedSet.has(u.id.toLowerCase())) };
                            }).filter(pu => pu.updates.length > 0);
                        } else {
                            next = [];
                        }
                        const totalCount = next.reduce((sum, pu) => sum + pu.updates.length, 0);
                        setUpdateCount(totalCount);
                        return next;
                    });
                    setLoadingAllProjectsUpdates(false);
                    // Don't re-request checkAllProjectsUpdates — optimistic state is sufficient.
                    // Background check (10-min timer) or manual refresh will reconcile if needed.
                    // Refresh installed packages so the visible row's version flips after the
                    // bulk operation. Plan 10 fix (B2): in all-projects mode the legacy
                    // single-project `getInstalledPackages` request was silently rejected
                    // by the backend (sentinel is not a real path), leaving stale rows
                    // until the next file-watcher tick. Use the streamed all-projects
                    // path so rows refresh deterministically and with progressive paint.
                    if (selectedProjectRef.current === ALL_PROJECTS_SENTINEL) {
                        setLoadingAllProjectsInstalled(true);
                        requestStreamedAllProjectsInstalled();
                    } else if (selectedProjectRef.current) {
                        skipNextUpdateCheckRef.current = true;
                        vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                        installedTabCompRef.current?.resetTransitiveState(true);
                    }
                }
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
            case 'allProjectsInstalledMetadata':
                // Phase 2: merge enriched metadata into all-projects installed
                {
                    const enrichedProjects = message.projectInstalled as ProjectInstalled[];
                    const enrichedMap = new Map<string, Map<string, Partial<InstalledPackage> & { id: string }>>();
                    for (const proj of enrichedProjects) {
                        const pkgMap = new Map(proj.packages.map(p => [p.id.toLowerCase(), p as Partial<InstalledPackage> & { id: string }]));
                        enrichedMap.set(proj.projectPath, pkgMap);
                    }
                    const mergeMetadata = (prev: ProjectInstalled[]) => {
                        let changed = false;
                        const result = prev.map(proj => {
                            const pkgMap = enrichedMap.get(proj.projectPath);
                            if (!pkgMap) { return proj; }
                            let projChanged = false;
                            const pkgs = proj.packages.map(pkg => {
                                const meta = pkgMap.get(pkg.id.toLowerCase());
                                if (!meta) { return pkg; }
                                const patchEntries = Object.entries(meta).filter(([key, value]) => key !== 'id' && value !== undefined);
                                if (patchEntries.length === 0) { return pkg; }
                                const hasChanges = patchEntries.some(([key, value]) => pkg[key as keyof InstalledPackage] !== value);
                                if (!hasChanges) { return pkg; }
                                projChanged = true;
                                return { ...pkg, ...Object.fromEntries(patchEntries) };
                            });
                            if (!projChanged) { return proj; }
                            changed = true;
                            return { ...proj, packages: pkgs };
                        });
                        return changed ? result : prev;
                    };
                    if (message.context === 'multiInstall') {
                        setMultiInstallProjectData(mergeMetadata);
                    } else {
                        setAllProjectsInstalled(mergeMetadata);
                        setMultiInstallProjectData(mergeMetadata);
                    }
                }
                break;
            case 'allProjectsInstalledStart':
                {
                    // Plan 10 Stage A/B: streams `installed` and `multiInstall` contexts.
                    const isMulti = message.context === 'multiInstall';
                    const expectedReq = isMulti ? multiInstallStreamRequestIdRef.current : installedStreamRequestIdRef.current;
                    if (message.requestId !== expectedReq) { break; }
                    const projects = (message.projects || []) as { projectPath: string; projectName: string; workspaceFolder?: string }[];
                    const provisional: ProjectInstalled[] = projects.map(p => ({
                        projectPath: p.projectPath,
                        projectName: p.projectName,
                        workspaceFolder: p.workspaceFolder,
                        packages: [],
                    }));
                    if (isMulti) {
                        setMultiInstallProjectData(provisional);
                    } else {
                        setAllProjectsInstalled(provisional);
                        setLoadingAllProjectsInstalled(true);
                    }
                }
                break;
            case 'allProjectsInstalledProjectFound':
                {
                    const isMulti = message.context === 'multiInstall';
                    const expectedReq = isMulti ? multiInstallStreamRequestIdRef.current : installedStreamRequestIdRef.current;
                    if (message.requestId !== expectedReq) { break; }
                    const projectPath = message.projectPath as string;
                    const projectName = (message.projectName as string | undefined) ?? projectPath;
                    const workspaceFolder = message.workspaceFolder as string | undefined;
                    const installed = (message.installed as InstalledPackage[] | undefined) ?? [];
                    // Plan 10 (I4): backend may report a per-project failure via `error`.
                    // Thread it through so the UI can render an inline error row.
                    const error = message.error as string | undefined;
                    const upsert = (prev: ProjectInstalled[]) => {
                        const idx = prev.findIndex(p => p.projectPath === projectPath);
                        // Preserve workspaceFolder set in Start chunk if ProjectFound omits it.
                        const existing = idx === -1 ? undefined : prev[idx];
                        const slot: ProjectInstalled = {
                            projectPath,
                            projectName,
                            workspaceFolder: workspaceFolder ?? existing?.workspaceFolder,
                            packages: installed,
                            error,
                        };
                        if (idx === -1) { return [...prev, slot]; }
                        const next = prev.slice();
                        next[idx] = slot;
                        return next;
                    };
                    if (isMulti) {
                        setMultiInstallProjectData(upsert);
                    } else {
                        setAllProjectsInstalled(upsert);
                    }
                }
                break;
            case 'allProjectsInstalledProjectMetadata':
                {
                    const isMulti = message.context === 'multiInstall';
                    const expectedReq = isMulti ? multiInstallStreamRequestIdRef.current : installedStreamRequestIdRef.current;
                    if (message.requestId !== expectedReq) { break; }
                    const projectPath = message.projectPath as string;
                    const enriched = (message.installed as Array<Partial<InstalledPackage> & { id: string }> | undefined) ?? [];
                    if (enriched.length === 0) { break; }
                    const enrichedById = new Map(enriched.map(p => [p.id.toLowerCase(), p]));
                    const merger = (prev: ProjectInstalled[]) => {
                        const idx = prev.findIndex(p => p.projectPath === projectPath);
                        if (idx === -1) { return prev; }
                        const proj = prev[idx];
                        let projChanged = false;
                        const pkgs = proj.packages.map(pkg => {
                            const meta = enrichedById.get(pkg.id.toLowerCase());
                            if (!meta) { return pkg; }
                            const patchEntries = Object.entries(meta).filter(([key, value]) => key !== 'id' && value !== undefined);
                            if (patchEntries.length === 0) { return pkg; }
                            const hasChanges = patchEntries.some(([key, value]) => pkg[key as keyof InstalledPackage] !== value);
                            if (!hasChanges) { return pkg; }
                            projChanged = true;
                            return { ...pkg, ...Object.fromEntries(patchEntries) };
                        });
                        if (!projChanged) { return prev; }
                        const next = prev.slice();
                        next[idx] = { ...proj, packages: pkgs };
                        return next;
                    };
                    if (isMulti) {
                        setMultiInstallProjectData(merger);
                    } else {
                        setAllProjectsInstalled(merger);
                        // Mirror to multiInstall snapshot (legacy parity for the installed-context stream)
                        setMultiInstallProjectData(merger);
                    }
                }
                break;
            case 'allProjectsInstalledComplete':
                {
                    const isMulti = message.context === 'multiInstall';
                    const expectedReq = isMulti ? multiInstallStreamRequestIdRef.current : installedStreamRequestIdRef.current;
                    if (message.requestId !== expectedReq) { break; }
                    const seen = new Set<string>((message.projectPaths || []) as string[]);
                    if (isMulti) {
                        setMultiInstallProjectData(prev => prev.filter(p => seen.has(p.projectPath)));
                    } else {
                        setAllProjectsInstalled(prev => {
                            const pruned = prev.filter(p => seen.has(p.projectPath));
                            // Mirror to multi-install snapshot (legacy parity)
                            setMultiInstallProjectData(pruned);
                            return pruned;
                        });
                        setLoadingAllProjectsInstalled(false);
                    }
                }
                break;
            case 'allProjectsTransitiveStart':
                if (message.requestId !== allProjectsTransitiveRequestIdRef.current) { break; }
                {
                    // Initialize empty slots for each project so the UI can show "loading" rows.
                    const slots: Record<string, ProjectTransitiveSlot> = {};
                    for (const p of (message.projects || [])) {
                        slots[p.projectPath] = {
                            projectName: p.projectName,
                            workspaceFolder: p.workspaceFolder,
                            frameworks: [],
                            dataSourceAvailable: false,
                            received: false,
                        };
                    }
                    setAllProjectsTransitive(slots);
                }
                break;
            case 'allProjectsTransitiveProjectFound':
                if (message.requestId !== allProjectsTransitiveRequestIdRef.current) { break; }
                setAllProjectsTransitive(prev => ({
                    ...prev,
                    [message.projectPath]: {
                        projectName: message.projectName,
                        workspaceFolder: message.workspaceFolder,
                        frameworks: message.frameworks || [],
                        dataSourceAvailable: !!message.dataSourceAvailable,
                        errorKind: message.errorKind,
                        received: true,
                    },
                }));
                break;
            case 'allProjectsTransitiveMetadata':
                if (message.requestId !== allProjectsTransitiveRequestIdRef.current) { break; }
                {
                    // Build lookup keyed by lowerId@versionNorm
                    const metaMap = new Map<string, { iconUrl?: string; verified?: boolean; authors?: string }>();
                    for (const m of (message.metadata || [])) {
                        const key = `${m.id.toLowerCase()}@${(m.version ?? '').trim().toLowerCase()}`;
                        metaMap.set(key, { iconUrl: m.iconUrl, verified: m.verified, authors: m.authors });
                    }
                    setAllProjectsTransitive(prev => {
                        const next: Record<string, ProjectTransitiveSlot> = {};
                        for (const [path, slot] of Object.entries(prev)) {
                            const newFrameworks = slot.frameworks.map(fw => ({
                                ...fw,
                                packages: fw.packages.map(pkg => {
                                    const key = `${pkg.id.toLowerCase()}@${(pkg.version ?? '').trim().toLowerCase()}`;
                                    const meta = metaMap.get(key);
                                    if (!meta) { return pkg; }
                                    return {
                                        ...pkg,
                                        iconUrl: pkg.iconUrl || meta.iconUrl,
                                        verified: pkg.verified ?? meta.verified,
                                        authors: pkg.authors || meta.authors,
                                    };
                                }),
                            }));
                            next[path] = { ...slot, frameworks: newFrameworks };
                        }
                        return next;
                    });
                }
                break;
            case 'allProjectsTransitiveComplete':
                if (message.requestId !== allProjectsTransitiveRequestIdRef.current) { break; }
                {
                    const seen = new Set<string>((message.projectPaths || []) as string[]);
                    let prunedSlots: Record<string, ProjectTransitiveSlot> = {};
                    setAllProjectsTransitive(prev => {
                        const next: Record<string, ProjectTransitiveSlot> = {};
                        for (const [path, slot] of Object.entries(prev)) {
                            if (seen.has(path)) { next[path] = slot; }
                        }
                        prunedSlots = next;
                        return next;
                    });
                    setLoadingAllProjectsTransitive(false);
                    setAllProjectsTransitiveLoaded(true);

                    // Request enrichment metadata (icons/verified/authors) for the unique
                    // (id, version) pairs aggregated across all projects. The backend
                    // dispatches this lazily — single-source-of-truth for icon resolution.
                    const uniq = new Map<string, { id: string; version: string }>();
                    for (const slot of Object.values(prunedSlots)) {
                        if (!slot.dataSourceAvailable) { continue; }
                        for (const fw of slot.frameworks) {
                            for (const pkg of fw.packages) {
                                const key = `${pkg.id.toLowerCase()}@${(pkg.version ?? '').trim().toLowerCase()}`;
                                if (!uniq.has(key)) {
                                    uniq.set(key, { id: pkg.id, version: pkg.version });
                                }
                            }
                        }
                    }
                    if (uniq.size > 0) {
                        vscode.postMessage({
                            type: 'getAllProjectsTransitiveMetadata',
                            requestId: message.requestId,
                            packages: Array.from(uniq.values()),
                        });
                    }
                }
                break;
            case 'restoreProjectsBatchResult':
                if (message.requestId !== restoreProjectsBatchRequestIdRef.current) { break; }
                setRestoringProjectsBatch(false);
                restoreProjectsBatchRequestIdRef.current = '';
                // After a batch restore, the assets.json files are fresh — reload transitives if expanded.
                if (allProjectsTransitiveExpandedRef.current) {
                    requestStreamedAllProjectsTransitive();
                }
                // Forward result to InstalledTab in case it needs to show per-project status
                installedTabCompRef.current?.handleMessage(message);
                break;
            case 'allProjectsIcons':
                // Progressive icon enrichment for all-projects updates (installed icons arrive inline)
                {
                    const iconMap = message.iconMap as Record<string, string>;
                    setAllProjectsUpdates(prev => prev.map(pu => ({
                        ...pu,
                        updates: pu.updates.map(u => {
                            const url = iconMap[`${u.id}@${u.installedVersion}`];
                            return url ? { ...u, iconUrl: url } : u;
                        }),
                    })));
                }
                break;
            case 'bulkRemoveAllProjectsConfirmed':
                // Forward to InstalledTab for state
                installedTabCompRef.current?.handleMessage(message);
                break;
            case 'bulkRemoveAllProjectsResult':
                // Forward to InstalledTab for state reset
                installedTabCompRef.current?.handleMessage(message);
                // Optimistic: removed packages can't have updates — clear update state
                setAllProjectsUpdates(prev => {
                    // Keep updates only for projects/packages that weren't affected
                    const perProjectFailed = (message.perProjectFailedIds as { projectPath: string; failedPackageIds: string[] }[] | undefined) || [];
                    // If we have failure info, keep updates for failed packages
                    if (perProjectFailed.length > 0) {
                        return prev; // Don't clear — failed removals mean packages are still installed
                    }
                    return []; // All removals succeeded — clear all updates
                });
                // Still re-fetch all projects installed since transitive deps changed
                setLoadingAllProjectsInstalled(true);
                setAllProjectsInstalled([]);
                requestStreamedAllProjectsInstalled();
                // Refresh current project installed for transitive accuracy
                // (skip when in all-projects mode — the streamed re-fetch above covers it
                // and the backend rejects the sentinel)
                if (selectedProjectRef.current && selectedProjectRef.current !== ALL_PROJECTS_SENTINEL) {
                    skipNextUpdateCheckRef.current = true;
                    vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                    installedTabCompRef.current?.resetTransitiveState(true);
                }
                break;
            case 'settings':
                // Restore persisted settings
                settingsLoadedRef.current = true;
                setSettingsLoaded(true);
                if (message.includePrerelease !== undefined) {
                    setIncludePrerelease(message.includePrerelease);
                }
                if (message.restoreEnabled !== undefined) {
                    setRestoreEnabled(message.restoreEnabled);
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
            case 'restoreChanged':
                // Synced from sidebar (or the main panel itself) — update state but skip re-saving
                if (message.restoreEnabled !== undefined) {
                    skipRestoreSaveRef.current = true;
                    setRestoreEnabled(message.restoreEnabled);
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
                            if (prev) { return { ...prev, readme: message.readme }; }
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
                // Triggered from sidebar "View Package Details" — fill search bar and search
                if (message.packageId) {
                    pendingNavigationRef.current = { packageId: message.packageId, version: message.version };
                    skipQuickSearchRef.current = true;
                    setSearchQuery(message.packageId);
                    setSearchLoading(true);
                    setShowQuickSearch(false);
                    setQuickSearchSuggestions([]);
                    setShowSearchHistory(false);
                    setSelectedPackage(null);
                    setSelectedTransitivePackage(null);
                    const sourcesToSearch = selectedSourceRef.current === 'all'
                        ? enabledSourcesRef.current.map(s => s.url)
                        : [selectedSourceRef.current];
                    vscode.postMessage({
                        type: 'searchPackages',
                        query: message.packageId,
                        sources: sourcesToSearch,
                        includePrerelease: includePrereleaseRef.current,
                        take: 1,
                        exactMatch: true
                    });
                    // Blur search input to prevent quick search dropdown from appearing
                    searchInputRef.current?.blur();
                }
                break;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional: uses useRef mirrors for all state (see ARCHITECTURE.md stale closures pattern)
    }, []);

    useEffect(() => {
        // Handshake: signal panel→webview render readiness BEFORE first data requests.
        vscode.postMessage({ type: 'webviewReady' });
        // Request initial data
        vscode.postMessage({ type: 'getProjects' });
        vscode.postMessage({ type: 'getSources' });
        vscode.postMessage({ type: 'getSettings' });
        vscode.postMessage({ type: 'getSplitPosition' });

        // Handle messages from extension
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [handleMessage]);

    // Plan 01 perf: ack the first useful render once installed data lands.
    const firstRenderSentRef = useRef(false);
    useEffect(() => {
        if (firstRenderSentRef.current) { return; }
        if (installedPackages.length > 0) {
            firstRenderSentRef.current = true;
            vscode.postMessage({ type: 'firstUsefulRender', source: 'installedPackages' });
        } else if (allProjectsInstalled.length > 0) {
            firstRenderSentRef.current = true;
            vscode.postMessage({ type: 'firstUsefulRender', source: 'allProjectsInstalled' });
        }
    }, [installedPackages, allProjectsInstalled]);

    useEffect(() => {
        // Clear active project path on any project switch
        setActiveProjectPath('');

        if (selectedProject === ALL_PROJECTS_SENTINEL) {
            // "All Projects" selected — clear single-project data and fetch all-projects data
            setInstalledPackages([]);
            setPackagesWithUpdates([]);
            streamedUpdateIdsRef.current.clear();
            setUpdateCount(0);
            setSelectedPackage(null);
            setSelectedTransitivePackage(null);
            hasVisitedInstalledTabRef.current = false;
            installedTabCompRef.current?.resetTransitiveState(false);
            skipNextUpdateCheckRef.current = false;
            // Reset single-project loading flags — prevents stuck spinners when
            // stale responses are discarded by projectPath guards after rapid switching
            setLoadingInstalled(false);
            setLoadingUpdates(false);
            // Trigger all-projects fetches
            setLoadingAllProjectsUpdates(true);
            setAllProjectsUpdates([]);
            vscode.postMessage({
                type: 'checkAllProjectsUpdates',
                includePrerelease: includePrereleaseRef.current
            });
            setLoadingAllProjectsInstalled(true);
            setAllProjectsInstalled([]);
            requestStreamedAllProjectsInstalled();
            // Reset transitive state — section is collapsed by default; data lazy-loads on expand.
            allProjectsTransitiveExpandedRef.current = false;
            cancelAllProjectsTransitive();
            setAllProjectsTransitive({});
            setAllProjectsTransitiveLoaded(false);
        } else if (selectedProject) {
            // Single project selected — clear all-projects data and fetch single-project data
            setAllProjectsUpdates([]);
            setAllProjectsInstalled([]);
            setLoadingAllProjectsUpdates(false);
            setLoadingAllProjectsInstalled(false);
            // Cancel and clear all-projects transitive state on switch out of all-projects mode
            allProjectsTransitiveExpandedRef.current = false;
            cancelAllProjectsTransitive();
            setAllProjectsTransitive({});
            setAllProjectsTransitiveLoaded(false);
            // Reset stale single-project updates loading from a previous project
            setLoadingUpdates(false);
            setLoadingInstalled(true);
            setInstalledPackages([]);
            vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProject });
            setSelectedPackage(null);
            // Reset installed tab visit tracking when project changes
            hasVisitedInstalledTabRef.current = false;
            // Reset transitive packages state when project changes
            installedTabCompRef.current?.resetTransitiveState(false);
            setSelectedTransitivePackage(null);
            // Clear any pending skip flag so project switch doesn't suppress the
            // else-if branch in checkPackageUpdates effect that clears stale updates
            skipNextUpdateCheckRef.current = false;
        }
    }, [selectedProject, requestStreamedAllProjectsInstalled, cancelAllProjectsTransitive]);

    /**
     * Aggregation: dedupe transitive packages across all projects by `(lowerId, normalizedVersion)`.
     * Each row collects per-project origins, with origins keyed by `(projectPath, chainHash)`.
     * Frameworks are merged per-origin and per-row (deduped). Sorted alphabetically by id.
     */
    const allProjectsTransitiveRows = useMemo<AllProjectsTransitiveRow[]>(() => {
        const rowMap = new Map<string, AllProjectsTransitiveRow>();
        for (const [projectPath, slot] of Object.entries(allProjectsTransitive)) {
            if (!slot.dataSourceAvailable) { continue; }
            for (const fwSection of slot.frameworks) {
                for (const pkg of fwSection.packages) {
                    const lowerId = pkg.id.toLowerCase();
                    const versionNorm = (pkg.version ?? '').trim().toLowerCase();
                    const rowKey = `${lowerId}@${versionNorm}`;
                    let row = rowMap.get(rowKey);
                    if (!row) {
                        row = {
                            id: pkg.id,
                            version: pkg.version,
                            versionNormalized: versionNorm,
                            iconUrl: pkg.iconUrl,
                            verified: pkg.verified,
                            authors: pkg.authors,
                            origins: [],
                            frameworks: [],
                        };
                        rowMap.set(rowKey, row);
                    } else {
                        if (!row.iconUrl && pkg.iconUrl) { row.iconUrl = pkg.iconUrl; }
                        if (row.verified === undefined && pkg.verified !== undefined) { row.verified = pkg.verified; }
                        if (!row.authors && pkg.authors) { row.authors = pkg.authors; }
                    }
                    const chainHash = (pkg.requiredByChain || []).join('→');
                    let origin = row.origins.find(o => o.projectPath === projectPath && o.chainHash === chainHash);
                    if (!origin) {
                        origin = {
                            projectPath,
                            projectName: slot.projectName,
                            workspaceFolder: slot.workspaceFolder,
                            frameworks: [],
                            requiredByChain: pkg.requiredByChain || [],
                            fullChain: pkg.fullChain,
                            chainHash,
                        };
                        row.origins.push(origin);
                    }
                    if (!origin.frameworks.includes(fwSection.targetFramework)) {
                        origin.frameworks.push(fwSection.targetFramework);
                    }
                    if (!row.frameworks.includes(fwSection.targetFramework)) {
                        row.frameworks.push(fwSection.targetFramework);
                    }
                }
            }
        }
        return Array.from(rowMap.values()).sort((a, b) => a.id.toLowerCase().localeCompare(b.id.toLowerCase()));
    }, [allProjectsTransitive]);

    /**
     * Errored/missing-data projects derived from slots — surfaces "Restore" banner candidates.
     * Only counts slots that have actually `received` a chunk from the backend. In-flight
     * placeholders (`received=false`) are ignored to avoid false positives during streaming.
     */
    const allProjectsTransitiveErrored = useMemo(() => {
        const out: Array<{ projectPath: string; projectName: string; errorKind?: string; missing?: boolean }> = [];
        for (const [projectPath, slot] of Object.entries(allProjectsTransitive)) {
            if (!slot.received) { continue; }
            if (!slot.dataSourceAvailable) {
                out.push({ projectPath, projectName: slot.projectName, missing: true });
            } else if (slot.errorKind) {
                out.push({ projectPath, projectName: slot.projectName, errorKind: slot.errorKind });
            }
        }
        return out;
    }, [allProjectsTransitive]);

    /**
     * Selection re-resolution: when the aggregation refreshes (mid-stream or post-restore),
     * re-bind the selected transitive package to fresh row data, or clear the selection if
     * its row has disappeared. Only emits a new selection object when the relevant fields
     * actually change — prevents details-panel re-render churn while the stream emits
     * per-project chunks.
     */
    useEffect(() => {
        setSelectedTransitivePackage(prev => {
            if (!prev?.origins) { return prev; }
            const lowerId = prev.id.toLowerCase();
            const versionNorm = (prev.version ?? '').trim().toLowerCase();
            const row = allProjectsTransitiveRows.find(r =>
                r.id.toLowerCase() === lowerId && r.versionNormalized === versionNorm
            );
            if (!row) { return null; }
            // Stable equality check — same row, same origins (by reference), same metadata.
            // Aggregation rebuilds origins arrays per chunk; identity changes when content does.
            const sameOrigins = prev.origins === row.origins
                || (prev.origins.length === row.origins.length
                    && prev.origins.every((o, i) => {
                        const r = row.origins[i];
                        return r && o.projectPath === r.projectPath && o.chainHash === r.chainHash;
                    }));
            if (sameOrigins
                && prev.iconUrl === row.iconUrl
                && prev.verified === row.verified
                && prev.authors === row.authors
                && prev.version === row.version) {
                return prev;
            }
            const firstOrigin = row.origins[0];
            return {
                id: row.id,
                version: row.version,
                requiredByChain: firstOrigin?.requiredByChain ?? [],
                fullChain: firstOrigin?.fullChain,
                iconUrl: row.iconUrl,
                verified: row.verified,
                authors: row.authors,
                origins: row.origins,
            };
        });
    }, [allProjectsTransitiveRows]);

    // Refresh installed packages when switching to installed tab (skip first visit to use prefetched data)
    // Track first visit to installed tab (skip re-fetch; prefetched data is used).
    // Subsequent visits no longer re-fetch because the file watcher and cross-panel
    // sync keep installedPackages current via retainContextWhenHidden.
    useEffect(() => {
        if (activeTab === 'installed' && selectedProject && selectedProject !== ALL_PROJECTS_SENTINEL) {
            if (!hasVisitedInstalledTabRef.current) {
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

    // Save restoreEnabled setting when it changes (only after settings loaded)
    useEffect(() => {
        if (settingsLoadedRef.current) {
            if (skipRestoreSaveRef.current) {
                skipRestoreSaveRef.current = false;
                return;
            }
            vscode.postMessage({ type: 'saveSettings', restoreEnabled });
        }
    }, [restoreEnabled]);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional: selectedPackage/selectedSource read via refs, only triggers on includePrerelease change
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
        // Skip when "All Projects" is selected — all-projects fetch handles updates
        if (selectedProject === ALL_PROJECTS_SENTINEL) { return; }
        // Skip update check when we already know the outcome (optimistic update just happened)
        if (skipNextUpdateCheckRef.current) {
            skipNextUpdateCheckRef.current = false;
            return;
        }
        if (settingsLoaded && selectedProject && installedPackages.length > 0) {
            setLoadingUpdates(true);
            setPackagesWithUpdates([]);
            streamedUpdateIdsRef.current.clear();
            vscode.postMessage({
                type: 'checkPackageUpdates',
                projectPath: selectedProject,
                installedPackages: installedPackages,
                includePrerelease: includePrerelease
            });
        } else if (settingsLoaded && selectedProject && installedPackages.length === 0) {
            // Clear updates when all packages are uninstalled
            setPackagesWithUpdates([]);
            streamedUpdateIdsRef.current.clear();
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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional: reads activeTab/selectedPackage/selectedVersion without re-triggering on their changes
    }, [packagesWithUpdates]);

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
            if (packageMetadata?.readme) { return; }
            // In normal mode, wait for packageMetadata to load first
            if (!packageMetadata) { return; }

            const pkgId = packageMetadata?.id || getPackageId(selectedPackage);
            const version = packageMetadata?.version || selectedVersionRef.current;
            if (!version) { return; }

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

    // --- Unified search: derived values ---

    const searchMode = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);
    const searchModeRef = useRef(searchMode);
    useEffect(() => { searchModeRef.current = searchMode; }, [searchMode]);

    // Sync searchQueryRef for useCallback([]) handlers
    useEffect(() => { searchQueryRef.current = searchQuery; }, [searchQuery]);

    const filterText = searchMode.filterText;
    const filterMode: 'plain' | 'vulnerable' = searchMode.mode === 'vulnerable' ? 'vulnerable' : 'plain';

    const flatSuggestions = useMemo(() =>
        quickSearchSuggestions.flatMap(s => s.packageIds),
        [quickSearchSuggestions]
    );

    const matchingFilters = useMemo(() => {
        // Filter button always shows all prefixes regardless of search query
        if (showFilterDropdown && filterButtonTriggered) {
            return [...FILTER_PREFIXES];
        }
        const query = searchQuery.trim().toLowerCase();
        if (!query.startsWith('@')) { return []; }
        const isExactMatch = FILTER_PREFIXES.some(p => query === p || query.startsWith(p + ' '));
        if (isExactMatch) { return []; }
        return FILTER_PREFIXES.filter(p => p.startsWith(query));
    }, [searchQuery, showFilterDropdown, filterButtonTriggered]);

    const deferredSearchQuery = useDeferredValue(searchQuery);
    const isSearchStale = searchQuery !== deferredSearchQuery;

    const browseVirtualizer = useVirtualizer({
        count: searchResults.length,
        getScrollElement: () => browseScrollRef.current,
        estimateSize: () => 66,
        overscan: 5,
    });

    // --- Unified search: effects ---

    // Track lastActiveTab for clear-to-last-tab behavior
    useEffect(() => {
        lastActiveTabRef.current = activeTab;
    }, [activeTab]);

    // Force-activate corresponding tab when using @-prefix filters
    useEffect(() => {
        if (searchMode.mode === 'installed' || searchMode.mode === 'vulnerable') {
            if (activeTab !== 'installed') {
                startTabTransition(() => { setActiveTab('installed'); });
            }
        } else if (searchMode.mode === 'updates') {
            if (activeTab !== 'updates') {
                startTabTransition(() => { setActiveTab('updates'); });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Only react to searchMode changes, not activeTab
    }, [searchMode.mode]);

    // Reset quicksearch when leaving browse mode
    useEffect(() => {
        if (searchMode.mode !== 'browse') {
            setShowQuickSearch(false);
            setQuickSearchSuggestions([]);
            setQuickSearchLoading(false);
        }
    }, [searchMode.mode]);

    // Auto-show @-prefix dropdown when matchingFilters become available (e.g., user types '@')
    useEffect(() => {
        if (matchingFilters.length > 0 && !showFilterDropdown && searchQuery.trim().startsWith('@')) {
            setShowFilterDropdown(true);
            setFilterDropdownIndex(0);
        } else if (matchingFilters.length === 0 && showFilterDropdown && !filterButtonTriggered) {
            setShowFilterDropdown(false);
        }
    }, [matchingFilters, searchQuery, showFilterDropdown, filterButtonTriggered]);

    // Reset selection when suggestions become empty
    useEffect(() => {
        if (quickSearchSuggestions.length === 0) {
            setSelectedSuggestionIndex(-1);
        }
    }, [quickSearchSuggestions]);

    // Quick search (autocomplete) debounce - 150ms
    useEffect(() => {
        if (skipQuickSearchRef.current) {
            skipQuickSearchRef.current = false;
            return;
        }

        if (searchDebounceMode !== 'quicksearch') {
            setQuickSearchSuggestions([]);
            setShowQuickSearch(false);
            setQuickSearchLoading(false);
            return;
        }

        // Skip autocomplete when typing a filter prefix (e.g., @installed, @updates)
        const trimmedQuery = deferredSearchQuery.trim();
        if (searchMode.mode === 'browse' && trimmedQuery.length >= 2 && !trimmedQuery.startsWith('@') && searchInputFocusedRef.current) {
            if (quickSearchTimeoutRef.current) {
                clearTimeout(quickSearchTimeoutRef.current);
            }

            setShowSearchHistory(false);
            setShowQuickSearch(true);
            setQuickSearchLoading(true);

            quickSearchTimeoutRef.current = setTimeout(() => {
                const sourcesToSearch = selectedSourceRef.current === 'all'
                    ? enabledSourcesRef.current.map(s => ({ name: s.name, url: s.url }))
                    : enabledSourcesRef.current
                        .filter(s => s.url === selectedSourceRef.current)
                        .map(s => ({ name: s.name, url: s.url }));

                vscode.postMessage({
                    type: 'autocompletePackages',
                    query: deferredSearchQuery.trim(),
                    sources: sourcesToSearch,
                    includePrerelease: includePrerelease,
                    take: 5
                });
            }, 150);
        } else {
            setQuickSearchSuggestions([]);
            setShowQuickSearch(false);
            setQuickSearchLoading(false);
        }

        return () => {
            if (quickSearchTimeoutRef.current) {
                clearTimeout(quickSearchTimeoutRef.current);
            }
        };
    }, [searchMode.mode, deferredSearchQuery, selectedSource, includePrerelease, searchDebounceMode]);

    // Full search debounce - 300ms
    useEffect(() => {
        if (searchDebounceMode !== 'full') {
            return;
        }

        // Skip full search when typing a filter prefix (e.g., @installed, @updates)
        const trimmedFullQuery = searchQuery.trim();
        if (searchMode.mode === 'browse' && trimmedFullQuery.length >= 2 && !trimmedFullQuery.startsWith('@')) {
            if (fullSearchTimeoutRef.current) {
                clearTimeout(fullSearchTimeoutRef.current);
            }

            fullSearchTimeoutRef.current = setTimeout(() => {
                const sourcesToSearch = selectedSourceRef.current === 'all'
                    ? enabledSourcesRef.current.map(s => s.url)
                    : [selectedSourceRef.current];

                setSearchLoading(true);
                setSearchResults([]);
                setSelectedPackage(null);

                vscode.postMessage({
                    type: 'searchPackages',
                    query: searchQuery.trim(),
                    sources: sourcesToSearch,
                    includePrerelease: includePrerelease
                });
            }, 300);
        }

        return () => {
            if (fullSearchTimeoutRef.current) {
                clearTimeout(fullSearchTimeoutRef.current);
            }
        };
    }, [searchMode.mode, searchQuery, selectedSource, includePrerelease, searchDebounceMode]);

    // Recent search tracking
    useEffect(() => {
        if (searchMode.mode === 'browse' && searchQuery) {
            const queryChanged = searchQuery !== lastSearchParamsRef.current.query;

            if (queryChanged) {
                lastSearchParamsRef.current = { query: searchQuery, source: selectedSource, prerelease: includePrerelease };
            }

            if (queryChanged && searchDebounceMode === 'full' && recentSearchesLimitRef.current > 0) {
                if (recentSearchTimeoutRef.current) {
                    clearTimeout(recentSearchTimeoutRef.current);
                }
                recentSearchTimeoutRef.current = setTimeout(() => {
                    const trimmedQuery = searchQuery.trim();
                    if (trimmedQuery && recentSearchesLimitRef.current > 0) {
                        setRecentSearches(prev => {
                            const filtered = prev.filter(s => s.toLowerCase() !== trimmedQuery.toLowerCase());
                            return [trimmedQuery, ...filtered].slice(0, recentSearchesLimitRef.current);
                        });
                    }
                }, 2000);
            }
        }
        return () => {
            if (recentSearchTimeoutRef.current) {
                clearTimeout(recentSearchTimeoutRef.current);
            }
        };
    }, [searchMode.mode, searchQuery, selectedSource, includePrerelease, searchDebounceMode]);

    // Clean up search timeouts on unmount
    useEffect(() => () => {
        if (quickSearchTimeoutRef.current) { clearTimeout(quickSearchTimeoutRef.current); }
        if (fullSearchTimeoutRef.current) { clearTimeout(fullSearchTimeoutRef.current); }
        if (recentSearchTimeoutRef.current) { clearTimeout(recentSearchTimeoutRef.current); }
    }, []);

    // --- Unified search: callbacks ---

    const handleSearch = useCallback((addToRecent: boolean = false) => {
        const query = searchQueryRef.current;
        if (query.trim()) {
            setSearchLoading(true);
            setSelectedPackage(null);
            setSelectedTransitivePackage(null);
            setShowSearchHistory(false);
            setShowQuickSearch(false);
            setQuickSearchSuggestions([]);
            if (addToRecent && recentSearchesLimitRef.current > 0) {
                const trimmedQuery = query.trim();
                setRecentSearches(prev => {
                    const filtered = prev.filter(s => s.toLowerCase() !== trimmedQuery.toLowerCase());
                    return [trimmedQuery, ...filtered].slice(0, recentSearchesLimitRef.current);
                });
            }
            const sourcesToSearch = selectedSourceRef.current === 'all'
                ? enabledSourcesRef.current.map(s => s.url)
                : [selectedSourceRef.current];
            vscode.postMessage({
                type: 'searchPackages',
                query: query,
                sources: sourcesToSearch,
                includePrerelease: includePrereleaseRef.current
            });
        }
    }, []);

    const selectQuickSearchItem = useCallback((packageId: string) => {
        skipQuickSearchRef.current = true;
        setSearchQuery(packageId);
        setShowQuickSearch(false);
        setQuickSearchSuggestions([]);
        setQuickSearchLoading(false);
        setSelectedSuggestionIndex(-1);
        setSearchLoading(true);
        setSelectedPackage(null);
        setSelectedTransitivePackage(null);
        const sourcesToSearch = selectedSourceRef.current === 'all'
            ? enabledSourcesRef.current.map(s => s.url)
            : [selectedSourceRef.current];
        vscode.postMessage({
            type: 'searchPackages',
            query: packageId,
            sources: sourcesToSearch,
            includePrerelease: includePrereleaseRef.current
        });
        if (recentSearchesLimitRef.current > 0) {
            setRecentSearches(prev => {
                const filtered = prev.filter(s => s.toLowerCase() !== packageId.toLowerCase());
                return [packageId, ...filtered].slice(0, recentSearchesLimitRef.current);
            });
        }
    }, []);

    const getSourceForFlatIndex = useCallback((flatIndex: number): string => {
        let currentIndex = 0;
        for (const sourceResult of quickSearchSuggestions) {
            if (flatIndex < currentIndex + sourceResult.packageIds.length) {
                return sourceResult.sourceUrl;
            }
            currentIndex += sourceResult.packageIds.length;
        }
        return selectedSourceRef.current === 'all' ? '' : selectedSourceRef.current;
    }, [quickSearchSuggestions]);

    const expandQuickSearchItem = useCallback((flatIndex: number, packageId: string) => {
        const sourceUrl = getSourceForFlatIndex(flatIndex);
        const cacheKey = `${packageId.toLowerCase()}|${sourceUrl}|${includePrereleaseRef.current}`;
        const cached = versionsCache.current.get(cacheKey);
        if (cached && cached.length > 0) {
            setExpandedQuickSearchIndex(flatIndex);
            setQuickSearchVersions(cached.slice(0, 5));
            setSelectedQuickVersionIndex(0);
            setQuickVersionsError(null);
            setQuickVersionsLoading(false);
            return;
        }

        setExpandedQuickSearchIndex(flatIndex);
        setQuickSearchVersions([]);
        setSelectedQuickVersionIndex(0);
        setQuickVersionsLoading(true);
        setQuickVersionsError(null);
        expandingQuickSearchPackageRef.current = { packageId, sourceUrl };

        vscode.postMessage({
            type: 'getPackageVersions',
            packageId,
            source: sourceUrl || undefined,
            includePrerelease: includePrereleaseRef.current,
            take: 5
        });
    }, [getSourceForFlatIndex]);

    const collapseQuickSearchVersions = useCallback(() => {
        setExpandedQuickSearchIndex(null);
        setQuickSearchVersions([]);
        setSelectedQuickVersionIndex(0);
        setQuickVersionsLoading(false);
        setQuickVersionsError(null);
        expandingQuickSearchPackageRef.current = null;
    }, []);

    const installFromQuickSearch = useCallback((packageId: string, version: string) => {
        if (!selectedProjectRef.current) { return; }
        setShowQuickSearch(false);
        setQuickSearchSuggestions([]);
        setQuickSearchLoading(false);
        setSelectedSuggestionIndex(-1);
        collapseQuickSearchVersions();

        if (recentSearchesLimitRef.current > 0) {
            setRecentSearches(prev => {
                const filtered = prev.filter(s => s.toLowerCase() !== packageId.toLowerCase());
                return [packageId, ...filtered].slice(0, recentSearchesLimitRef.current);
            });
        }

        vscode.postMessage({
            type: 'installPackage',
            projectPath: selectedProjectRef.current,
            packageId,
            version
        });
    }, [collapseQuickSearchVersions]);

    const selectRecentSearchItem = useCallback((search: string) => {
        skipQuickSearchRef.current = true;
        setSearchQuery(search);
        setShowSearchHistory(false);
        setShowQuickSearch(false);
        setSelectedSuggestionIndex(-1);
        setSearchLoading(true);
        setSelectedPackage(null);
        setSelectedTransitivePackage(null);
        const sourcesToSearch = selectedSourceRef.current === 'all'
            ? enabledSourcesRef.current.map(s => s.url)
            : [selectedSourceRef.current];
        vscode.postMessage({
            type: 'searchPackages',
            query: search,
            sources: sourcesToSearch,
            includePrerelease: includePrereleaseRef.current
        });
    }, []);

    const selectFilter = useCallback((prefix: string) => {
        setSearchQuery(prefix + ' ');
        setShowFilterDropdown(false);
        setFilterButtonTriggered(false);
        setFilterDropdownIndex(0);
        searchInputRef.current?.focus();
    }, []);

    const handleClearSearch = useCallback(() => {
        setSearchQuery('');
        setSearchResults([]);
        setSearchLoading(false);
        setShowQuickSearch(false);
        setQuickSearchSuggestions([]);
        setShowSearchHistory(false);
        setShowFilterDropdown(false);
        setSelectedPackage(null);
        setSelectedTransitivePackage(null);
        // Return to last active tab
        startTabTransition(() => {
            setActiveTab(lastActiveTabRef.current);
        });
        searchInputRef.current?.focus();
    }, [startTabTransition]);

    // Compute vulnerability count and highest severity from installed packages
    const { vulnPackageCount, highestVulnSeverity } = useMemo(() => {
        const severityOrder: Record<VulnerabilitySeverity, number> = { Low: 0, Moderate: 1, High: 2, Critical: 3 };
        let count = 0;
        let highest: VulnerabilitySeverity = 'Low';
        for (const pkg of installedPackages) {
            if (pkg.vulnerabilities && pkg.vulnerabilities.length > 0) {
                count++;
                for (const v of pkg.vulnerabilities) {
                    if (severityOrder[v.severity] > severityOrder[highest]) {
                        highest = v.severity;
                    }
                }
            }
        }
        return { vulnPackageCount: count, highestVulnSeverity: highest };
    }, [installedPackages]);

    // Memoize enabled sources to avoid recalculation on every render
    const enabledSources = useMemo(() =>
        sources.filter(s => s.enabled),
        [sources]
    );
    // Sync enabledSourcesRef for useCallback([]) handlers
    useEffect(() => { enabledSourcesRef.current = enabledSources; }, [enabledSources]);

    // Sort projects alphabetically
    const sortedProjects = useMemo(() => {
        return [...projects].sort((a, b) => a.name.localeCompare(b.name));
    }, [projects]);

    // Memoize sanitized README HTML to avoid re-sanitizing on every render
    const sanitizedReadmeHtml = useMemo(() => {
        if (!packageMetadata?.readme) { return ''; }
        return renderMarkdownToHtml(packageMetadata.readme);
    }, [packageMetadata?.readme]);

    const handleSashReset = useCallback(() => setSplitPosition(35), []);
    const handleSashDragEnd = useCallback((pos: number) => {
        vscode.postMessage({ type: 'saveSplitPosition', position: pos });
    }, []);

    const handleToggleDep = useCallback((key: string) => {
        setExpandedDeps(prev => {
            const next = new Set(prev);
            if (next.has(key)) { next.delete(key); } else { next.add(key); }
            return next;
        });
    }, []);

    const handleInstall = useCallback((packageId: string, version: string) => {
        const projectPath = activeProjectPathRef.current || selectedProjectRef.current;
        if (!projectPath || projectPath === ALL_PROJECTS_SENTINEL) {
            return;
        }
        vscode.postMessage({
            type: 'installPackage',
            projectPath,
            packageId,
            version
        });
    }, []);

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
        requestStreamedMultiInstall();
    }, [requestStreamedMultiInstall]);

    const handleRemove = useCallback((packageId: string) => {
        const projectPath = activeProjectPathRef.current || selectedProjectRef.current;
        if (!projectPath || projectPath === ALL_PROJECTS_SENTINEL) {
            return;
        }
        vscode.postMessage({
            type: 'removePackage',
            projectPath,
            packageId
        });
    }, []);

    // Full refresh: clear all caches and re-fetch everything (header refresh button)
    const handleFullRefresh = useCallback(() => {
        const project = selectedProjectRef.current;
        if (!project) { return; }
        setLoadingInstalled(true);
        // Clear frontend caches so stale data isn't served
        versionsCache.current.clear();
        metadataCache.current.clear();
        // Tell backend to clear all server-side caches and re-send everything
        vscode.postMessage({ type: 'fullRefresh' });
    }, []);

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

            let newIndex: number;

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

    const browseDetailsPanelContent = useMemo(() => (
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
    ), [selectedPackage, packageMetadata, loadingMetadata, loadingVersions, packageVersions,
        selectedVersion, installedPackages, detailsTab, loadingReadme, sanitizedReadmeHtml,
        expandedDeps, selectedProject, includePrerelease, selectedSource, projects,
        multiInstallProjectData, handleInstall, handleMultiInstall, handleMultiInstallOpen,
        handleRemove, handleToggleDep]);

    return (
        <div className="app" data-testid="nuiget-app">
            <div className="header">
                <h2>Manage NuGet packages</h2>
                <div className="header-selectors">
                    <label className="preview-checkbox">
                        <input
                            type="checkbox"
                            checked={restoreEnabled}
                            onChange={(e) => setRestoreEnabled((e.target as HTMLInputElement).checked)}
                        />
                        Restore after operations
                    </label>
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
                            data-testid="project-selector"
                        >
                            {sortedProjects.length > 1 && (
                                <option key={ALL_PROJECTS_SENTINEL} value={ALL_PROJECTS_SENTINEL}>
                                    All Projects ({sortedProjects.length})
                                </option>
                            )}
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
                            data-testid="source-selector"
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
                            aria-label="Manage NuGet sources"
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
                                role="button"
                                tabIndex={0}
                                title={`${failedSources.length} source(s) unreachable. Click to refresh.`}
                                aria-label={`${failedSources.length} source(s) unreachable. Click to refresh.`}
                                onClick={() => vscode.postMessage({ type: 'refreshSources' })}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vscode.postMessage({ type: 'refreshSources' }); } }}
                            >
                                <WarningIcon size={16} />
                            </span>
                        )}
                    </div>
                    <button
                        className="header-refresh-btn"
                        title="Refresh all"
                        aria-label="Refresh all"
                        disabled={loadingInstalled}
                        onClick={handleFullRefresh}
                    >
                        {loadingInstalled ? <LoadingIcon size={16} /> : <SyncIcon size={16} />}
                    </button>
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

            {/* Unified Search Bar */}
            <div className="search-container" role="search" aria-label="Search NuGet packages">
                <div className="search-wrapper">
                    <input
                        ref={searchInputRef}
                        type="text"
                        data-testid="search-input"
                        placeholder="Search packages... (@installed, @updates, @vulnerable)"
                        value={searchQuery}
                        onChange={(e) => {
                            const newValue = (e.target as HTMLInputElement).value;
                            if (expandedQuickSearchIndex !== null) {
                                collapseQuickSearchVersions();
                            }
                            setSearchQuery(newValue);
                            if (newValue.trim()) {
                                setSelectedSuggestionIndex(-1);
                                isKeyboardNavigationRef.current = false;
                            }
                            if (!newValue.trim() && recentSearchesLimit > 0) {
                                setShowSearchHistory(true);
                                setShowQuickSearch(false);
                                setSelectedSuggestionIndex(-1);
                            } else if (!newValue.trim()) {
                                setShowSearchHistory(false);
                            }
                            setShowFilterDropdown(false);
                            setFilterButtonTriggered(false);
                        }}
                        onKeyDown={(e) => {
                            // @-prefix dropdown navigation
                            if (showFilterDropdown && matchingFilters.length > 0) {
                                if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setFilterDropdownIndex(prev => prev < matchingFilters.length - 1 ? prev + 1 : prev);
                                } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setFilterDropdownIndex(prev => prev > 0 ? prev - 1 : 0);
                                } else if (e.key === 'Enter' || e.key === 'Tab') {
                                    e.preventDefault();
                                    selectFilter(matchingFilters[filterDropdownIndex]);
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    handleClearSearch();
                                }
                                return;
                            }

                            // Version expansion mode navigation
                            if (showQuickSearch && expandedQuickSearchIndex !== null) {
                                if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    if (quickSearchVersions.length > 0) {
                                        setSelectedQuickVersionIndex(prev =>
                                            prev < quickSearchVersions.length - 1 ? prev + 1 : prev
                                        );
                                    }
                                } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    if (quickSearchVersions.length > 0) {
                                        setSelectedQuickVersionIndex(prev => prev > 0 ? prev - 1 : 0);
                                    }
                                } else if (e.key === 'ArrowLeft') {
                                    e.preventDefault();
                                    collapseQuickSearchVersions();
                                } else if (e.key === 'ArrowRight') {
                                    if (quickVersionsError && flatSuggestions[expandedQuickSearchIndex]) {
                                        e.preventDefault();
                                        expandQuickSearchItem(expandedQuickSearchIndex, flatSuggestions[expandedQuickSearchIndex]);
                                    }
                                } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (quickSearchVersions.length > 0 && flatSuggestions[expandedQuickSearchIndex]) {
                                        installFromQuickSearch(
                                            flatSuggestions[expandedQuickSearchIndex],
                                            quickSearchVersions[selectedQuickVersionIndex]
                                        );
                                    }
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setShowSearchHistory(false);
                                    setShowQuickSearch(false);
                                    setSelectedSuggestionIndex(-1);
                                    collapseQuickSearchVersions();
                                }
                                return;
                            }

                            // Normal quicksearch/history navigation
                            if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                if (showSearchHistory && recentSearches.length > 0) {
                                    setSelectedSuggestionIndex(prev =>
                                        prev < recentSearches.length - 1 ? prev + 1 : prev
                                    );
                                    isKeyboardNavigationRef.current = true;
                                    setIsKeyboardNavActive(true);
                                } else if (showQuickSearch && flatSuggestions.length > 0) {
                                    setSelectedSuggestionIndex(prev =>
                                        prev < flatSuggestions.length - 1 ? prev + 1 : prev
                                    );
                                    isKeyboardNavigationRef.current = true;
                                    setIsKeyboardNavActive(true);
                                } else if (searchMode.mode !== 'browse') {
                                    // Focus the active tab's list
                                    if (activeTabRef.current === 'installed') {
                                        installedTabCompRef.current?.focusAndSelectFirst();
                                    } else if (activeTabRef.current === 'updates') {
                                        updatesTabCompRef.current?.focusAndSelectFirst();
                                    }
                                } else if (searchResults.length > 0) {
                                    browseListRef.current?.focus({ preventScroll: true });
                                    const currentPkg = selectedPackageRef.current;
                                    if (!currentPkg || !searchResults.find(p => getPackageId(p) === getPackageId(currentPkg))) {
                                        const firstPkg = searchResults[0];
                                        setSelectedPackage(firstPkg);
                                        setSelectedTransitivePackage(null);
                                        setSelectedVersion(firstPkg.version);
                                        setDetailsTab('details');
                                    }
                                }
                            } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                if (showSearchHistory && recentSearches.length > 0) {
                                    setSelectedSuggestionIndex(prev => prev > -1 ? prev - 1 : -1);
                                    isKeyboardNavigationRef.current = true;
                                    setIsKeyboardNavActive(true);
                                } else if (showQuickSearch && flatSuggestions.length > 0) {
                                    setSelectedSuggestionIndex(prev => prev > -1 ? prev - 1 : -1);
                                    isKeyboardNavigationRef.current = true;
                                    setIsKeyboardNavActive(true);
                                }
                            } else if (e.key === 'ArrowRight') {
                                if (showQuickSearch && selectedSuggestionIndex >= 0 && flatSuggestions[selectedSuggestionIndex]) {
                                    e.preventDefault();
                                    expandQuickSearchItem(selectedSuggestionIndex, flatSuggestions[selectedSuggestionIndex]);
                                }
                            } else if (e.ctrlKey && e.key === 'Enter') {
                                if (showQuickSearch && selectedSuggestionIndex >= 0 && flatSuggestions[selectedSuggestionIndex]) {
                                    e.preventDefault();
                                    const packageId = flatSuggestions[selectedSuggestionIndex];
                                    const sourceUrl = getSourceForFlatIndex(selectedSuggestionIndex);
                                    const cacheKey = `${packageId.toLowerCase()}|${sourceUrl}|${includePrereleaseRef.current}`;
                                    const cached = versionsCache.current.get(cacheKey);
                                    if (cached && cached.length > 0 && selectedProjectRef.current) {
                                        setShowQuickSearch(false);
                                        setQuickSearchSuggestions([]);
                                        setQuickSearchLoading(false);
                                        setSelectedSuggestionIndex(-1);
                                        if (recentSearchesLimitRef.current > 0) {
                                            setRecentSearches(prev => {
                                                const filtered = prev.filter(s => s.toLowerCase() !== packageId.toLowerCase());
                                                return [packageId, ...filtered].slice(0, recentSearchesLimitRef.current);
                                            });
                                        }
                                        vscode.postMessage({
                                            type: 'installPackage',
                                            projectPath: selectedProjectRef.current,
                                            packageId,
                                            version: cached[0]
                                        });
                                    } else {
                                        pendingQuickInstallRef.current = { packageId, sourceUrl };
                                        vscode.postMessage({
                                            type: 'getPackageVersions',
                                            packageId,
                                            source: sourceUrl || undefined,
                                            includePrerelease: includePrereleaseRef.current,
                                            take: 1
                                        });
                                    }
                                }
                            } else if (e.key === 'Enter') {
                                if (showSearchHistory && isKeyboardNavigationRef.current && selectedSuggestionIndex >= 0 && recentSearches[selectedSuggestionIndex]) {
                                    e.preventDefault();
                                    selectRecentSearchItem(recentSearches[selectedSuggestionIndex]);
                                } else if (showQuickSearch && isKeyboardNavigationRef.current && selectedSuggestionIndex >= 0 && flatSuggestions[selectedSuggestionIndex]) {
                                    e.preventDefault();
                                    selectQuickSearchItem(flatSuggestions[selectedSuggestionIndex]);
                                } else if (searchMode.mode === 'browse' || searchQueryRef.current.trim().length >= 2) {
                                    handleSearch(true);
                                }
                            } else if (e.key === 'Escape') {
                                if (showSearchHistory || showQuickSearch) {
                                    setShowSearchHistory(false);
                                    setShowQuickSearch(false);
                                    setSelectedSuggestionIndex(-1);
                                } else if (searchQuery) {
                                    handleClearSearch();
                                }
                            }
                        }}
                        onFocus={() => {
                            searchInputFocusedRef.current = true;
                            if (!searchQuery.trim() && recentSearchesLimit > 0 && searchMode.mode === 'default') {
                                setShowSearchHistory(true);
                                setSelectedSuggestionIndex(-1);
                            }
                        }}
                        onBlur={() => {
                            searchInputFocusedRef.current = false;
                            setTimeout(() => {
                                setShowSearchHistory(false);
                                setShowQuickSearch(false);
                                setShowFilterDropdown(false);
                                setFilterButtonTriggered(false);
                            }, 150);
                        }}
                        className="search-input"
                    />
                    <button
                        className={`search-clear-btn${searchQuery ? '' : ' disabled'}`}
                        onClick={() => {
                            if (!searchQuery) { return; }
                            handleClearSearch();
                        }}
                        aria-label="Clear search"
                        tabIndex={-1}
                    >
                        <ClearAllIcon size={16} />
                    </button>
                    <button
                        className="search-filter-btn"
                        aria-label="Filter packages"
                        tabIndex={-1}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            setFilterButtonTriggered(true);
                            setShowFilterDropdown(prev => !prev);
                            setFilterDropdownIndex(0);
                            setShowSearchHistory(false);
                            setShowQuickSearch(false);
                        }}
                    >
                        <FilterIcon size={16} />
                    </button>
                </div>
                {/* @-prefix filter dropdown */}
                {showFilterDropdown && matchingFilters.length > 0 && (
                    <div className="filter-dropdown">
                        {matchingFilters.map((prefix, idx) => (
                            <div
                                key={prefix}
                                className={`filter-dropdown-item${idx === filterDropdownIndex ? ' selected' : ''}`}
                                onMouseEnter={() => setFilterDropdownIndex(idx)}
                                onMouseDown={(e) => { e.preventDefault(); selectFilter(prefix); }}
                            >
                                {prefix}
                            </div>
                        ))}
                    </div>
                )}
                {/* Recent searches dropdown */}
                {showSearchHistory && !searchQuery.trim() && recentSearches.length > 0 && (
                    <div className={`search-history-dropdown${isKeyboardNavActive ? ' keyboard-nav' : ''}`} onMouseLeave={() => setSelectedSuggestionIndex(-1)}>
                        <div className="search-history-header">Recent Searches</div>
                        {recentSearches.map((search, idx) => {
                            const isSelected = idx === selectedSuggestionIndex;
                            return (
                                <div
                                    key={idx}
                                    className={`search-history-item${isSelected ? ' selected' : ''}`}
                                    ref={el => {
                                        if (isSelected && el) {
                                            el.scrollIntoView({ block: 'nearest' });
                                        }
                                    }}
                                    onMouseEnter={() => {
                                        setIsKeyboardNavActive(false);
                                        isKeyboardNavigationRef.current = false;
                                        setSelectedSuggestionIndex(idx);
                                    }}
                                    onMouseDown={() => selectRecentSearchItem(search)}
                                >
                                    <span className="search-history-icon">🕒</span>
                                    <span className="search-history-text">{search}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
                {/* Quick search suggestions dropdown */}
                {showQuickSearch && searchQuery.trim().length >= 2 && (quickSearchLoading || quickSearchSuggestions.some(g => g.packageIds.length > 0) || expandedQuickSearchIndex !== null) && (
                    <div className={`search-history-dropdown${isKeyboardNavActive ? ' keyboard-nav' : ''}`} onMouseLeave={() => setSelectedSuggestionIndex(-1)}>
                        {expandedQuickSearchIndex !== null ? (
                            <>
                                <div className="quick-search-version-header">
                                    <span
                                        className="quick-search-back-hint"
                                        title="Back to results (←)"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            collapseQuickSearchVersions();
                                        }}
                                    >‹</span>
                                    <span className="quick-search-package-name">{flatSuggestions[expandedQuickSearchIndex]}</span>
                                </div>
                                {quickVersionsLoading ? (
                                    <div className="search-history-item quick-search-loading">
                                        <span className="search-history-icon"><LoadingIcon size={14} /></span>
                                        <span className="search-history-text">Loading versions...</span>
                                    </div>
                                ) : quickVersionsError ? (
                                    <div className="search-history-item quick-search-error">
                                        <span className="search-history-text">{quickVersionsError}. Press → to retry.</span>
                                    </div>
                                ) : quickSearchVersions.length > 0 ? (
                                    quickSearchVersions.map((version, idx) => {
                                        const isVersionSelected = idx === selectedQuickVersionIndex;
                                        return (
                                            <div
                                                key={version}
                                                className={`search-history-item quick-search-version-item${isVersionSelected ? ' selected' : ''}`}
                                                ref={el => {
                                                    if (isVersionSelected && el) {
                                                        el.scrollIntoView({ block: 'nearest' });
                                                    }
                                                }}
                                                onMouseEnter={() => {
                                                    setIsKeyboardNavActive(false);
                                                    isKeyboardNavigationRef.current = false;
                                                    setSelectedQuickVersionIndex(idx);
                                                }}
                                                onMouseDown={() => installFromQuickSearch(flatSuggestions[expandedQuickSearchIndex], version)}
                                            >
                                                <span className="search-history-text">{version}</span>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="search-history-item quick-search-error">
                                        <span className="search-history-text">No versions available</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            quickSearchLoading && quickSearchSuggestions.length === 0 ? (
                                <div className="search-history-item quick-search-loading">
                                    <span className="search-history-icon"><LoadingIcon size={14} /></span>
                                    <span className="search-history-text">Loading...</span>
                                </div>
                            ) : (
                                (() => {
                                    let flatIndex = 0;
                                    return quickSearchSuggestions.map((sourceResult) => (
                                        <div key={sourceResult.sourceUrl}>
                                            {quickSearchSuggestions.length > 1 && (
                                                <div className="quick-search-source-divider">
                                                    {sourceResult.sourceName}
                                                </div>
                                            )}
                                            {sourceResult.packageIds.map((packageId) => {
                                                const currentFlatIndex = flatIndex++;
                                                const isSuggestionSelected = currentFlatIndex === selectedSuggestionIndex;
                                                return (
                                                    <div
                                                        key={`${sourceResult.sourceUrl}-${packageId}`}
                                                        className={`search-history-item quick-search-item${isSuggestionSelected ? ' selected' : ''}`}
                                                        ref={el => {
                                                            if (isSuggestionSelected && el) {
                                                                el.scrollIntoView({ block: 'nearest' });
                                                            }
                                                        }}
                                                        onMouseEnter={() => {
                                                            setIsKeyboardNavActive(false);
                                                            isKeyboardNavigationRef.current = false;
                                                            setSelectedSuggestionIndex(currentFlatIndex);
                                                        }}
                                                        onMouseDown={() => selectQuickSearchItem(packageId)}
                                                    >
                                                        <span className="search-history-text">{packageId}</span>
                                                        <span
                                                            className="quick-search-expand-hint"
                                                            title="Show versions (→)"
                                                            onMouseDown={(e2) => {
                                                                e2.preventDefault();
                                                                e2.stopPropagation();
                                                                expandQuickSearchItem(currentFlatIndex, packageId);
                                                            }}
                                                        >›</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ));
                                })()
                            )
                        )}
                    </div>
                )}
            </div>

            {/* Tabs — hidden when showing browse search results */}
            {searchMode.mode !== 'browse' && (
                <div className="tabs" data-testid="tab-bar">
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
                            } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                searchInputRef.current?.focus();
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
                        {installedPackages.length > 0 && <span className="tab-badge">{installedPackages.length}</span>}
                        {vulnPackageCount > 0 && (
                            <span
                                className={`tab-badge-vuln vuln-${highestVulnSeverity}`}
                                title={`${vulnPackageCount} package${vulnPackageCount > 1 ? 's' : ''} with known vulnerabilities`}
                            >
                                <WarningIcon size={12} />
                                {vulnPackageCount}
                            </span>
                        )}
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
                            } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                searchInputRef.current?.focus();
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
            )}

            {/* Browse search results — shown when in browse mode */}
            {searchMode.mode === 'browse' && (
                <div className="content browse-content">
                    <div className="split-panel">
                        <div ref={browseScrollRef} className="package-list-panel" style={{ width: `${splitPosition}%` }}>
                            {searchLoading ? (
                                <div className="loading-spinner-container" aria-busy="true" aria-label="Searching packages">
                                    <div className="loading-spinner"></div>
                                    <p>Searching...</p>
                                </div>
                            ) : searchResults.length === 0 ? (
                                <p className="empty-state">
                                    {searchQuery.trim() ? 'No packages found' : 'Search for packages above'}
                                </p>
                            ) : (
                                <div
                                    ref={browseListRef}
                                    className={`package-list${isSearchStale ? ' stale' : ''}`}
                                    tabIndex={0}
                                    onKeyDown={createPackageListKeyHandler(
                                        searchResults,
                                        () => selectedPackage ? getPackageId(selectedPackage) : null,
                                        (pkg) => {
                                            selectDirectPackage(pkg, {
                                                selectedVersionValue: pkg.version,
                                                metadataVersion: pkg.version,
                                                initialVersions: [pkg.version],
                                            });
                                        },
                                        {
                                            onAction: () => { if (selectedPackage) { handleInstall(getPackageId(selectedPackage), selectedVersion || (selectedPackage as PackageSearchResult).version); } },
                                            onLeftArrow: () => detailsTab === 'readme' && setDetailsTab('details'),
                                            onRightArrow: () => detailsTab === 'details' && setDetailsTab('readme'),
                                            onExitTop: () => {
                                                clearSelection();
                                                searchInputRef.current?.focus();
                                            },
                                        }
                                    )}
                                    style={{ height: `${browseVirtualizer.getTotalSize()}px`, position: 'relative' }}
                                >
                                    {browseVirtualizer.getVirtualItems().map(virtualRow => {
                                        const pkg = searchResults[virtualRow.index];
                                        return (
                                            <div
                                                key={pkg.id}
                                                data-index={virtualRow.index}
                                                ref={browseVirtualizer.measureElement}
                                                className={`package-item ${selectedPackage && getPackageId(selectedPackage).toLowerCase() === pkg.id.toLowerCase() ? 'selected' : ''}`}
                                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                                                onClick={() => {
                                                    selectDirectPackage(pkg, {
                                                        selectedVersionValue: pkg.version,
                                                        metadataVersion: pkg.version,
                                                        initialVersions: [pkg.version],
                                                    });
                                                }}
                                                onMouseEnter={() => hoverPrefetch.onMouseEnterRow(pkg.id, pkg.version)}
                                                onMouseLeave={hoverPrefetch.onMouseLeaveRow}
                                            >
                                                <div className="package-icon">
                                                    {pkg.iconUrl ? (
                                                        <img src={pkg.iconUrl} alt="" onError={(ev) => { (ev.target as HTMLImageElement).src = defaultPackageIcon; }} />
                                                    ) : (
                                                        <img src={defaultPackageIcon} alt="" />
                                                    )}
                                                </div>
                                                <div className="package-info">
                                                    <div className="package-name">{pkg.id}</div>
                                                    <div className="package-meta">
                                                        <span className="package-version">v{pkg.version}</span>
                                                        {pkg.totalDownloads && (
                                                            <span className="package-downloads">
                                                                <CloudDownloadIcon size={12} className="inline-icon" /> {pkg.totalDownloads.toLocaleString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="package-authors">
                                                        {pkg.verified && (
                                                            <span className="verified-badge" title="The ID prefix of this package has been reserved by its owner on nuget.org"><VerifiedIcon size={14} /></span>
                                                        )}
                                                        {pkg.authors}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <MemoizedDraggableSash
                            onDrag={setSplitPosition}
                            onReset={handleSashReset}
                            onDragEnd={handleSashDragEnd}
                        />

                        <div className="package-details-panel" style={{ width: `${100 - splitPosition}%` }}>
                            {browseDetailsPanelContent}
                        </div>
                    </div>
                </div>
            )}

            {searchMode.mode !== 'browse' && (
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
                    externalFilter={filterText}
                    externalFilterMode={filterMode}
                    onSelectDirectPackage={selectDirectPackage}
                    onSelectTransitivePackage={selectTransitivePackage}
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
                    onRowMouseEnter={hoverPrefetch.onMouseEnterRow}
                    onRowMouseLeave={hoverPrefetch.onMouseLeaveRow}
                    installedTabRef={installedTabRef}
                    MemoizedDraggableSash={MemoizedDraggableSash}
                    isAllProjects={isAllProjects}
                    allProjectsInstalled={allProjectsInstalled}
                    loadingAllProjectsInstalled={loadingAllProjectsInstalled}
                    activeProjectPath={activeProjectPath}
                    onActiveProjectPathChange={setActiveProjectPath}
                    allProjectsTransitiveRows={allProjectsTransitiveRows}
                    loadingAllProjectsTransitive={loadingAllProjectsTransitive}
                    allProjectsTransitiveErrored={allProjectsTransitiveErrored}
                    restoringProjectsBatch={restoringProjectsBatch}
                    onAllProjectsTransitiveExpandedChange={handleAllProjectsTransitiveExpandedChange}
                    onRestoreProjectsBatch={handleRestoreProjectsBatch}
                />
            )}

            {activeTab === 'updates' && searchMode.mode !== 'browse' && (
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
                    externalFilter={filterText}
                    isAllProjects={isAllProjects}
                    allProjectsUpdates={allProjectsUpdates}
                    loadingAllProjectsUpdates={loadingAllProjectsUpdates}
                    activeProjectPath={activeProjectPath}
                    onActiveProjectPathChange={setActiveProjectPath}
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
                    onRowMouseEnter={hoverPrefetch.onMouseEnterRow}
                    onRowMouseLeave={hoverPrefetch.onMouseLeaveRow}
                    updatesTabRef={updatesTabRef}
                    MemoizedDraggableSash={MemoizedDraggableSash}
                />
            )}
        </div>
    );
};

/**
 * SidebarApp — Main React component for the nUIget sidebar panel.
 *
 * A compact, single-column package manager UI optimized for the VS Code sidebar.
 * Always uses lite mode backend for maximum speed.
 *
 * Layout:
 *   [Search/Filter Input]
 *   [Status: project name]
 *   ▶ BROWSE (search results)
 *   ▶ INSTALLED (installed packages)
 *   ▶ UPDATES (packages with available updates)
 *
 * Source/Project/Prerelease are controlled via title bar commands (QuickPick).
 * Package actions use hover buttons + context menus (QuickPick in backend).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PackageRow } from './components/PackageRow';
import { SectionHeader } from './components/SectionHeader';
import './SidebarApp.css';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Project { name: string; path: string; }
interface NuGetSource { name: string; url: string; enabled: boolean; }

interface PackageSearchResult {
    id: string;
    version: string;
    description: string;
    authors: string;
    totalDownloads?: number;
    versions: string[];
    iconUrl?: string;
    verified?: boolean;
}

interface InstalledPackage {
    id: string;
    version: string;
    resolvedVersion?: string;
    versionType?: string;
    iconUrl?: string;
    verified?: boolean;
    authors?: string;
    isImplicit?: boolean;
}

interface PackageUpdateMinimal {
    id: string;
    installedVersion: string;
    latestVersion: string;
}

interface ProjectUpdates {
    projectPath: string;
    projectName: string;
    updates: PackageUpdateMinimal[];
}

// ─── VS Code API ─────────────────────────────────────────────────────────────

declare function acquireVsCodeApi(): {
    postMessage: (msg: unknown) => void;
    getState: () => Record<string, unknown> | undefined;
    setState: (state: Record<string, unknown>) => void;
};

const vscode = acquireVsCodeApi();

// ─── Component ───────────────────────────────────────────────────────────────

export const SidebarApp: React.FC = () => {
    // ─── State ───────────────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PackageSearchResult[]>([]);
    const [installedPackages, setInstalledPackages] = useState<InstalledPackage[]>([]);
    const [packageUpdates, setPackageUpdates] = useState<PackageUpdateMinimal[]>([]);
    const [allProjectsUpdates, setAllProjectsUpdates] = useState<ProjectUpdates[]>([]);
    const [backgroundInstalledCount, setBackgroundInstalledCount] = useState(0);

    const [expandedSection, setExpandedSection] = useState<'browse' | 'installed' | 'updates' | null>(null);
    const [sources, setSources] = useState<NuGetSource[]>([]);
    const [selectedSource, setSelectedSource] = useState('all');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedProjectName, setSelectedProjectName] = useState('');
    const [projects, setProjects] = useState<Project[]>([]);
    const [includePrerelease, setIncludePrerelease] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    const [loadingSearch, setLoadingSearch] = useState(false);
    const [loadingInstalled, setLoadingInstalled] = useState(false);
    const [loadingUpdates, setLoadingUpdates] = useState(false);
    const [loadingAllUpdates, setLoadingAllUpdates] = useState(false);
    const [loadAllProjects, setLoadAllProjects] = useState(false);

    const [showRecentSearches, setShowRecentSearches] = useState(false);
    const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

    // ─── Refs (for message handler closure) ──────────────────────────────────
    const selectedProjectRef = useRef(selectedProject);
    const selectedSourceRef = useRef(selectedSource);
    const includePrereleaseRef = useRef(includePrerelease);
    const installedPackagesRef = useRef(installedPackages);
    const expandedSectionRef = useRef(expandedSection);
    const loadAllProjectsRef = useRef(loadAllProjects);
    const selectedPackageIdRef = useRef(selectedPackageId);
    const packageUpdatesRef = useRef(packageUpdates);
    const allProjectsUpdatesRef = useRef(allProjectsUpdates);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const browseListRef = useRef<HTMLDivElement>(null);
    const installedListRef = useRef<HTMLDivElement>(null);
    const updatesListRef = useRef<HTMLDivElement>(null);

    // Keep refs in sync
    useEffect(() => { selectedProjectRef.current = selectedProject; }, [selectedProject]);
    useEffect(() => { selectedSourceRef.current = selectedSource; }, [selectedSource]);
    useEffect(() => { includePrereleaseRef.current = includePrerelease; }, [includePrerelease]);
    useEffect(() => { installedPackagesRef.current = installedPackages; }, [installedPackages]);
    useEffect(() => { expandedSectionRef.current = expandedSection; }, [expandedSection]);
    useEffect(() => { loadAllProjectsRef.current = loadAllProjects; }, [loadAllProjects]);
    useEffect(() => { selectedPackageIdRef.current = selectedPackageId; }, [selectedPackageId]);
    useEffect(() => { packageUpdatesRef.current = packageUpdates; }, [packageUpdates]);
    useEffect(() => { allProjectsUpdatesRef.current = allProjectsUpdates; }, [allProjectsUpdates]);

    // ─── Message Handler ─────────────────────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMessage = useCallback((message: any) => {
        switch (message.type) {
            case 'state':
                if (message.selectedSource) setSelectedSource(message.selectedSource);
                if (message.selectedProject) {
                    setSelectedProject(message.selectedProject);
                    // Derive name from path
                    const name = message.selectedProject.split(/[\\/]/).pop()?.replace(/\.(csproj|fsproj|vbproj)$/, '') || '';
                    setSelectedProjectName(name);
                }
                if (message.includePrerelease !== undefined) setIncludePrerelease(message.includePrerelease);
                if (message.recentSearches) setRecentSearches(message.recentSearches);
                break;
            case 'projects':
                setProjects(message.projects || []);
                // Auto-select first project if none selected
                if (!selectedProjectRef.current && message.projects?.length > 0) {
                    const first = message.projects[0];
                    setSelectedProject(first.path);
                    setSelectedProjectName(first.name.replace(/\.(csproj|fsproj|vbproj)$/, ''));
                }
                break;
            case 'sources':
                setSources(message.sources || []);
                break;
            case 'searchResults':
                setSearchResults(message.results || []);
                setLoadingSearch(false);
                setSelectedPackageId(null);
                break;
            case 'installedPackages':
                {
                    const pkgs = (message.packages || []) as InstalledPackage[];
                    setInstalledPackages(pkgs);
                    setLoadingInstalled(false);
                    // Clear background count once real data is loaded
                    setBackgroundInstalledCount(0);
                    // Auto-check for updates if Updates section is watching
                    // Skip if background data already covers the selected project
                    const bgProjectData = allProjectsUpdatesRef.current.find(
                        pu => pu.projectPath === selectedProjectRef.current
                    );
                    if (bgProjectData) {
                        setPackageUpdates(bgProjectData.updates);
                        setLoadingUpdates(false);
                    } else if (pkgs.length > 0) {
                        vscode.postMessage({
                            type: 'checkPackageUpdates',
                            installedPackages: pkgs,
                            includePrerelease: includePrereleaseRef.current,
                            projectPath: selectedProjectRef.current
                        });
                        setLoadingUpdates(true);
                    } else {
                        setPackageUpdates([]);
                    }
                }
                break;
            case 'packageUpdatesMinimal':
                setPackageUpdates(message.updates || []);
                setLoadingUpdates(false);
                break;
            case 'allProjectsUpdates':
                setAllProjectsUpdates(message.projectUpdates || []);
                setLoadingAllUpdates(false);
                break;
            case 'installedCountUpdate':
                setBackgroundInstalledCount(message.count || 0);
                break;
            case 'installResult':
            case 'updateResult':
            case 'removeResult':
            case 'bulkUpdateResult':
            case 'bulkUpdateAllProjectsResult':
                // Invalidate background data — it's now stale after mutation
                // Update both state AND ref synchronously to prevent stale reads
                setAllProjectsUpdates([]);
                allProjectsUpdatesRef.current = [];
                // Refresh installed packages after any mutation
                if (selectedProjectRef.current) {
                    vscode.postMessage({
                        type: 'getInstalledPackages',
                        projectPath: selectedProjectRef.current
                    });
                    setLoadingInstalled(true);
                }
                // If in loadAllProjects mode, also refresh that
                if (loadAllProjectsRef.current) {
                    vscode.postMessage({
                        type: 'checkAllProjectsUpdates',
                        includePrerelease: includePrereleaseRef.current
                    });
                    setLoadingAllUpdates(true);
                }
                break;
            case 'sourceChanged':
                setSelectedSource(message.source);
                setSearchResults([]);
                break;
            case 'projectChanged':
                setSelectedProject(message.projectPath);
                setSelectedProjectName((message.projectName || '').replace(/\.(csproj|fsproj|vbproj)$/, ''));
                // Clear and refetch
                setInstalledPackages([]);
                setPackageUpdates([]);
                setAllProjectsUpdates([]);
                setSelectedPackageId(null);
                vscode.postMessage({
                    type: 'getInstalledPackages',
                    projectPath: message.projectPath
                });
                setLoadingInstalled(true);
                break;
            case 'prereleaseChanged':
                setIncludePrerelease(message.includePrerelease);
                // Re-check updates with new prerelease setting
                if (installedPackagesRef.current.length > 0 && selectedProjectRef.current) {
                    vscode.postMessage({
                        type: 'checkPackageUpdates',
                        installedPackages: installedPackagesRef.current,
                        includePrerelease: message.includePrerelease,
                        projectPath: selectedProjectRef.current
                    });
                    setLoadingUpdates(true);
                }
                break;
            case 'recentSearches':
                setRecentSearches(message.searches || []);
                break;
            // Actions delegated back from context menu QuickPick
            case 'doInstall':
                vscode.postMessage({
                    type: 'installPackage',
                    projectPath: message.projectPath,
                    packageId: message.packageId,
                    version: message.version
                });
                break;
            case 'doUpdate':
                vscode.postMessage({
                    type: 'updatePackage',
                    projectPath: message.projectPath,
                    packageId: message.packageId,
                    version: message.version
                });
                break;
            case 'doRemove':
                vscode.postMessage({
                    type: 'removePackage',
                    projectPath: message.projectPath,
                    packageId: message.packageId
                });
                break;
        }
    }, []);

    // Single event listener using ref pattern
    const handleMessageRef = useRef(handleMessage);
    handleMessageRef.current = handleMessage;

    useEffect(() => {
        const listener = (event: MessageEvent) => handleMessageRef.current(event.data);
        window.addEventListener('message', listener);
        // Signal ready
        vscode.postMessage({ type: 'ready' });
        return () => window.removeEventListener('message', listener);
    }, []);

    // ─── Auto-fetch installed when section expands or project changes ────────
    useEffect(() => {
        if (selectedProject && (expandedSection === 'installed' || expandedSection === 'updates')) {
            // When expanding Updates, check if background data already covers this project
            if (expandedSection === 'updates' && packageUpdates.length === 0 && !loadingUpdates) {
                const bgProjectData = allProjectsUpdates.find(pu => pu.projectPath === selectedProject);
                if (bgProjectData) {
                    setPackageUpdates(bgProjectData.updates);
                    // Still fetch installed for the Installed section if not loaded yet
                    if (installedPackages.length === 0 && !loadingInstalled) {
                        vscode.postMessage({
                            type: 'getInstalledPackages',
                            projectPath: selectedProject
                        });
                        setLoadingInstalled(true);
                    }
                    return;
                }
            }
            if (installedPackages.length === 0 && !loadingInstalled) {
                vscode.postMessage({
                    type: 'getInstalledPackages',
                    projectPath: selectedProject
                });
                setLoadingInstalled(true);
            }
        }
    }, [expandedSection, selectedProject, installedPackages.length, loadingInstalled, packageUpdates.length, loadingUpdates, allProjectsUpdates]);

    // ─── Load all projects updates ──────────────────────────────────────────
    useEffect(() => {
        if (loadAllProjects && expandedSection === 'updates') {
            vscode.postMessage({
                type: 'checkAllProjectsUpdates',
                includePrerelease
            });
            setLoadingAllUpdates(true);
        }
    }, [loadAllProjects, expandedSection, includePrerelease]);

    // ─── Search / Filter ─────────────────────────────────────────────────────

    const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && (expandedSectionRef.current === 'browse' || expandedSectionRef.current === null)) {
            const query = (e.target as HTMLInputElement).value.trim();
            if (!query) return;
            // Auto-expand Browse if all sections are collapsed
            if (expandedSectionRef.current === null) {
                setExpandedSection('browse');
                expandedSectionRef.current = 'browse';
            }
            setShowRecentSearches(false);
            setLoadingSearch(true);

            const sourcesToSearch = selectedSourceRef.current === 'all'
                ? undefined
                : [selectedSourceRef.current];

            vscode.postMessage({
                type: 'searchPackages',
                query,
                sources: sourcesToSearch,
                includePrerelease: includePrereleaseRef.current
            });
        }
        if (e.key === 'Escape') {
            setShowRecentSearches(false);
        }
        // ArrowDown from search → focus into the active section's list
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const section = expandedSectionRef.current;
            if (section === 'browse') browseListRef.current?.focus();
            else if (section === 'installed') installedListRef.current?.focus();
            else if (section === 'updates') updatesListRef.current?.focus();
        }
    }, []);

    const handleSearchFocus = useCallback(() => {
        if ((expandedSectionRef.current === 'browse' || expandedSectionRef.current === null) && !searchInputRef.current?.value) {
            setShowRecentSearches(true);
        }
    }, []);

    const handleSearchBlur = useCallback(() => {
        // Delay to allow click on recent search items
        setTimeout(() => setShowRecentSearches(false), 200);
    }, []);

    const handleRecentSearchClick = useCallback((query: string) => {
        setSearchQuery(query);
        setShowRecentSearches(false);
        setLoadingSearch(true);
        // Auto-expand Browse if all sections are collapsed
        if (expandedSectionRef.current === null) {
            setExpandedSection('browse');
            expandedSectionRef.current = 'browse';
        }

        const sourcesToSearch = selectedSourceRef.current === 'all'
            ? undefined
            : [selectedSourceRef.current];

        vscode.postMessage({
            type: 'searchPackages',
            query,
            sources: sourcesToSearch,
            includePrerelease: includePrereleaseRef.current
        });
    }, []);

    const handleClearRecentSearches = useCallback(() => {
        vscode.postMessage({ type: 'clearRecentSearches' });
        setShowRecentSearches(false);
    }, []);

    // Client-side filter for Installed / Updates
    const filteredInstalled = useMemo(() => {
        if (!searchQuery || expandedSection === 'browse') return installedPackages;
        const q = searchQuery.toLowerCase();
        return installedPackages.filter(p =>
            p.id.toLowerCase().includes(q) ||
            (p.authors && p.authors.toLowerCase().includes(q))
        );
    }, [installedPackages, searchQuery, expandedSection]);

    const filteredUpdates = useMemo(() => {
        if (!searchQuery || expandedSection === 'browse') return packageUpdates;
        const q = searchQuery.toLowerCase();
        return packageUpdates.filter(p => p.id.toLowerCase().includes(q));
    }, [packageUpdates, searchQuery, expandedSection]);

    // Map installed packages by ID for quick lookup in Browse
    const installedMap = useMemo(() => {
        const map = new Map<string, InstalledPackage>();
        for (const pkg of installedPackages) {
            map.set(pkg.id.toLowerCase(), pkg);
        }
        return map;
    }, [installedPackages]);

    // Total update count for badge
    const totalUpdateCount = allProjectsUpdates.length > 0
        ? allProjectsUpdates.reduce((sum, pu) => sum + pu.updates.length, 0)
        : packageUpdates.length;

    // ─── Section Toggle ──────────────────────────────────────────────────────

    const toggleSection = useCallback((section: 'browse' | 'installed' | 'updates') => {
        setExpandedSection(prev => prev === section ? null : section);
        setSelectedPackageId(null);
        setSearchQuery('');
    }, []);

    // ─── Keyboard Navigation ─────────────────────────────────────────────────

    /**
     * Factory for keyboard handlers on package list containers.
     * Matches the main panel's createPackageListKeyHandler pattern:
     *   ArrowDown/Up  — navigate rows
     *   Home/End      — first/last row
     *   Enter         — primary action on focused row
     *   Ctrl+Enter    — explicit install/update action
     *   Delete        — uninstall
     */
    const createSidebarKeyHandler = useCallback(<T extends { id: string }>(
        packages: T[],
        getId: (item: T) => string,
        options?: {
            onAction?: (item: T) => void;
            onDelete?: (item: T) => void;
        }
    ) => {
        return (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (packages.length === 0) return;

            const currentId = selectedPackageIdRef.current;
            const currentIndex = currentId
                ? packages.findIndex(p => getId(p).toLowerCase() === currentId.toLowerCase())
                : -1;

            // Ctrl+Enter → install/update action
            if (e.key === 'Enter' && e.ctrlKey && options?.onAction && currentIndex >= 0) {
                e.preventDefault();
                options.onAction(packages[currentIndex]);
                return;
            }
            // Enter → primary action (sidebar has no detail panel to "select into")
            if (e.key === 'Enter' && !e.ctrlKey && options?.onAction && currentIndex >= 0) {
                e.preventDefault();
                options.onAction(packages[currentIndex]);
                return;
            }
            // Delete → uninstall
            if (e.key === 'Delete' && options?.onDelete && currentIndex >= 0) {
                e.preventDefault();
                options.onDelete(packages[currentIndex]);
                return;
            }

            let newIndex = currentIndex;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                newIndex = currentIndex < packages.length - 1 ? currentIndex + 1 : currentIndex;
                if (currentIndex === -1) newIndex = 0;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentIndex <= 0) {
                    // Exit to search input
                    setSelectedPackageId(null);
                    searchInputRef.current?.focus();
                    return;
                }
                newIndex = currentIndex - 1;
            } else if (e.key === 'Home') {
                e.preventDefault();
                newIndex = 0;
            } else if (e.key === 'End') {
                e.preventDefault();
                newIndex = packages.length - 1;
            } else {
                return;
            }

            if (newIndex !== currentIndex && newIndex >= 0 && newIndex < packages.length) {
                const newId = getId(packages[newIndex]);
                setSelectedPackageId(newId);
                // Scroll into view
                requestAnimationFrame(() => {
                    const container = e.currentTarget;
                    const el = container.querySelector(`[data-package-id="${CSS.escape(packages[newIndex].id)}"]`);
                    el?.scrollIntoView({ block: 'nearest' });
                });
            }
        };
    }, []);

    // ─── Package Actions ─────────────────────────────────────────────────────

    const handleBrowsePrimaryAction = useCallback((packageId: string) => {
        if (!selectedProjectRef.current) return;
        const installed = installedPackagesRef.current.find(
            p => p.id.toLowerCase() === packageId.toLowerCase()
        );
        if (installed) {
            // Uninstall
            vscode.postMessage({
                type: 'removePackage',
                projectPath: selectedProjectRef.current,
                packageId
            });
        } else {
            // Install latest
            vscode.postMessage({
                type: 'installPackage',
                projectPath: selectedProjectRef.current,
                packageId
            });
        }
    }, []);

    const handleInstalledPrimaryAction = useCallback((packageId: string) => {
        if (!selectedProjectRef.current) return;
        vscode.postMessage({
            type: 'removePackage',
            projectPath: selectedProjectRef.current,
            packageId
        });
    }, []);

    const handleUpdatesPrimaryAction = useCallback((packageId: string) => {
        if (!selectedProjectRef.current) return;
        const update = packageUpdatesRef.current.find(
            u => u.id.toLowerCase() === packageId.toLowerCase()
        );
        if (update) {
            vscode.postMessage({
                type: 'updatePackage',
                projectPath: selectedProjectRef.current,
                packageId,
                version: update.latestVersion
            });
        }
    }, []);

    // All projects update primary action
    const handleAllProjectsUpdatePrimaryAction = useCallback((packageId: string) => {
        // Find which project has this update
        for (const pu of allProjectsUpdatesRef.current) {
            const update = pu.updates.find(
                u => u.id.toLowerCase() === packageId.toLowerCase()
            );
            if (update) {
                vscode.postMessage({
                    type: 'updatePackage',
                    projectPath: pu.projectPath,
                    packageId,
                    version: update.latestVersion
                });
                return;
            }
        }
    }, []);

    const handleContextMenu = useCallback((packageId: string, _e: React.MouseEvent, context: 'browse' | 'installed' | 'updates', projectPath?: string) => {
        // Select the right-clicked item so it's visually highlighted
        setSelectedPackageId(packageId);
        const installed = installedPackagesRef.current.find(
            p => p.id.toLowerCase() === packageId.toLowerCase()
        );

        let latestVersion: string | undefined;
        if (context === 'updates') {
            const update = packageUpdatesRef.current.find(u => u.id.toLowerCase() === packageId.toLowerCase());
            latestVersion = update?.latestVersion;
        }

        vscode.postMessage({
            type: 'showContextMenu',
            packageId,
            installedVersion: installed?.resolvedVersion || installed?.version,
            latestVersion,
            context,
            projectPath: projectPath || selectedProjectRef.current
        });
    }, []);

    // Update All button
    const handleUpdateAll = useCallback(() => {
        if (!selectedProjectRef.current) return;

        if (loadAllProjectsRef.current) {
            // Bulk update all projects
            const projectUpdatesPayload = allProjectsUpdatesRef.current.map(pu => ({
                projectPath: pu.projectPath,
                projectName: pu.projectName,
                packages: pu.updates.map(u => ({ id: u.id, version: u.latestVersion }))
            }));
            vscode.postMessage({
                type: 'bulkUpdateAllProjects',
                projectUpdates: projectUpdatesPayload
            });
        } else {
            // Bulk update current project
            const packages = packageUpdatesRef.current.map(u => ({ id: u.id, version: u.latestVersion }));
            vscode.postMessage({
                type: 'bulkUpdatePackages',
                packages,
                projectPath: selectedProjectRef.current
            });
        }
    }, []);

    // ─── Placeholder text ────────────────────────────────────────────────────
    const placeholderText = expandedSection === 'browse' || expandedSection === null
        ? 'Search NuGet packages...'
        : 'Filter packages...';

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="sidebar-app">
            {/* Search / Filter Input */}
            <div className="sidebar-search-container">
                <input
                    ref={searchInputRef}
                    type="text"
                    className="sidebar-search"
                    placeholder={placeholderText}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={handleSearchFocus}
                    onBlur={handleSearchBlur}
                    spellCheck={false}
                    autoComplete="off"
                />
                {/* Recent Searches Dropdown */}
                {showRecentSearches && recentSearches.length > 0 && (
                    <div className="recent-searches">
                        <div className="recent-searches-header">
                            <span>Recent searches</span>
                            <button className="recent-searches-clear" onClick={handleClearRecentSearches}>
                                Clear
                            </button>
                        </div>
                        {recentSearches.map((query) => (
                            <div
                                key={query}
                                className="recent-search-item"
                                onClick={() => handleRecentSearchClick(query)}
                            >
                                <span className="recent-search-icon">⏱</span>
                                <span>{query}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* No project selected welcome */}
            {!selectedProject && projects.length === 0 && (
                <div className="sidebar-welcome">
                    <p>No .NET projects found in this workspace.</p>
                </div>
            )}

            {!selectedProject && projects.length > 0 && (
                <div className="sidebar-welcome">
                    <p>Select a project to get started.</p>
                    <p>Use the <strong>$(project)</strong> button in the title bar.</p>
                </div>
            )}

            {/* ─── Browse Section ─────────────────────────────────────────── */}
            <SectionHeader
                title="Browse"
                expanded={expandedSection === 'browse'}
                count={searchResults.length}
                loading={loadingSearch}
                onToggle={() => toggleSection('browse')}
            />
            {expandedSection === 'browse' && (
                <div
                    className="section-content"
                    role="listbox"
                    tabIndex={0}
                    ref={browseListRef}
                    onKeyDown={createSidebarKeyHandler(
                        searchResults,
                        (pkg) => pkg.id,
                        {
                            onAction: (pkg) => {
                                // Enter in Browse: only install if not already installed
                                const inst = installedMap.get(pkg.id.toLowerCase());
                                if (!inst) handleBrowsePrimaryAction(pkg.id);
                            },
                            onDelete: (pkg) => {
                                // Delete in Browse: uninstall if installed
                                const inst = installedMap.get(pkg.id.toLowerCase());
                                if (inst) handleBrowsePrimaryAction(pkg.id);
                            }
                        }
                    )}
                >
                    {!loadingSearch && searchResults.length === 0 && (
                        <div className="sidebar-empty">
                            {searchQuery ? 'No packages found.' : 'Type a search query and press Enter.'}
                        </div>
                    )}
                    {searchResults.map((pkg) => {
                        const installed = installedMap.get(pkg.id.toLowerCase());
                        return (
                            <PackageRow
                                key={pkg.id}
                                packageId={pkg.id}
                                version={pkg.version}
                                description={pkg.description}
                                authors={pkg.authors}
                                installedVersion={installed?.resolvedVersion || installed?.version}
                                context="browse"
                                selected={selectedPackageId === pkg.id}
                                onPrimaryAction={handleBrowsePrimaryAction}
                                onContextMenu={(id, e) => handleContextMenu(id, e, 'browse')}
                                onClick={(id) => setSelectedPackageId(id)}
                            />
                        );
                    })}
                </div>
            )}

            {/* ─── Installed Section ──────────────────────────────────────── */}
            <SectionHeader
                title="Installed"
                expanded={expandedSection === 'installed'}
                count={installedPackages.length || backgroundInstalledCount}
                loading={loadingInstalled}
                onToggle={() => toggleSection('installed')}
            />
            {expandedSection === 'installed' && (
                <div
                    className="section-content"
                    role="listbox"
                    tabIndex={0}
                    ref={installedListRef}
                    onKeyDown={createSidebarKeyHandler(
                        filteredInstalled,
                        (pkg) => pkg.id,
                        {
                            onDelete: (pkg) => handleInstalledPrimaryAction(pkg.id)
                        }
                    )}
                >
                    {!loadingInstalled && filteredInstalled.length === 0 && (
                        <div className="sidebar-empty">
                            {searchQuery ? 'No matching packages.' : selectedProject ? 'No packages installed.' : 'Select a project first.'}
                        </div>
                    )}
                    {filteredInstalled.map((pkg) => (
                        <PackageRow
                            key={pkg.id}
                            packageId={pkg.id}
                            version={pkg.version}
                            installedVersion={pkg.resolvedVersion || pkg.version}
                            context="installed"
                            selected={selectedPackageId === pkg.id}
                            onPrimaryAction={handleInstalledPrimaryAction}
                            onContextMenu={(id, e) => handleContextMenu(id, e, 'installed')}
                            onClick={(id) => setSelectedPackageId(id)}
                        />
                    ))}
                </div>
            )}

            {/* ─── Updates Section ────────────────────────────────────────── */}
            <SectionHeader
                title="Updates"
                expanded={expandedSection === 'updates'}
                count={totalUpdateCount}
                loading={loadingUpdates || loadingAllUpdates}
                onToggle={() => toggleSection('updates')}
                actions={totalUpdateCount > 0 ? (
                    <button
                        className="section-action-btn"
                        onClick={handleUpdateAll}
                        title="Update all packages"
                    >
                        ⬆
                    </button>
                ) : undefined}
            />
            {expandedSection === 'updates' && (
                <div className="section-content">
                    {/* Load All Projects toggle */}
                    <div className="updates-toolbar">
                        <button
                            className="link-btn"
                            onClick={() => setLoadAllProjects(prev => !prev)}
                        >
                            {loadAllProjects ? 'Show current project' : 'Load all projects'}
                        </button>
                        {totalUpdateCount > 0 && (
                            <button className="link-btn" onClick={handleUpdateAll}>
                                Update All ({totalUpdateCount})
                            </button>
                        )}
                    </div>

                    {/* Single project updates */}
                    {!loadAllProjects && (
                        <div
                            role="listbox"
                            tabIndex={0}
                            ref={updatesListRef}
                            onKeyDown={createSidebarKeyHandler(
                                filteredUpdates,
                                (pkg) => pkg.id,
                                {
                                    onAction: (pkg) => handleUpdatesPrimaryAction(pkg.id)
                                }
                            )}
                        >
                            {!loadingUpdates && filteredUpdates.length === 0 && (
                                <div className="sidebar-empty">
                                    {selectedProject ? 'All packages are up to date.' : 'Select a project first.'}
                                </div>
                            )}
                            {filteredUpdates.map((pkg) => (
                                <PackageRow
                                    key={pkg.id}
                                    packageId={pkg.id}
                                    version={pkg.installedVersion}
                                    latestVersion={pkg.latestVersion}
                                    installedVersion={pkg.installedVersion}
                                    context="updates"
                                    selected={selectedPackageId === pkg.id}
                                    onPrimaryAction={handleUpdatesPrimaryAction}
                                    onContextMenu={(id, e) => handleContextMenu(id, e, 'updates')}
                                    onClick={(id) => setSelectedPackageId(id)}
                                />
                            ))}
                        </div>
                    )}

                    {/* All projects updates — flat list with project headers */}
                    {loadAllProjects && (
                        <div
                            role="listbox"
                            tabIndex={0}
                            ref={updatesListRef}
                            onKeyDown={(() => {
                                // Flatten all-projects updates into a single navigable list
                                const flatItems = allProjectsUpdates.flatMap(pu =>
                                    pu.updates.map(u => ({ ...u, id: u.id, projectPath: pu.projectPath }))
                                );
                                return createSidebarKeyHandler(
                                    flatItems,
                                    (item) => `${item.projectPath}::${item.id}`,
                                    {
                                        onAction: (item) => handleAllProjectsUpdatePrimaryAction(item.id)
                                    }
                                );
                            })()}
                        >
                            {!loadingAllUpdates && allProjectsUpdates.length === 0 && (
                                <div className="sidebar-empty">All projects are up to date.</div>
                            )}
                            {allProjectsUpdates.map((pu) => (
                                <div key={pu.projectPath}>
                                    <div className="project-group-header" title={pu.projectPath}>
                                        {pu.projectName} ({pu.updates.length})
                                    </div>
                                    {pu.updates.map((pkg) => (
                                        <PackageRow
                                            key={`${pu.projectPath}::${pkg.id}`}
                                            packageId={pkg.id}
                                            version={pkg.installedVersion}
                                            latestVersion={pkg.latestVersion}
                                            installedVersion={pkg.installedVersion}
                                            context="updates"
                                            selected={selectedPackageId === `${pu.projectPath}::${pkg.id}`}
                                            onPrimaryAction={handleAllProjectsUpdatePrimaryAction}
                                            onContextMenu={(id, e) => handleContextMenu(id, e, 'updates', pu.projectPath)}
                                            onClick={() => setSelectedPackageId(`${pu.projectPath}::${pkg.id}`)}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * SidebarApp — Main React component for the nUIget sidebar panel.
 *
 * Extensions-view-inspired search UX:
 *   - Empty search → Installed + Updates sections (collapsible accordion)
 *   - Plain text + Enter → NuGet browse results (flat list, sections hidden)
 *   - @installed <query> → filtered installed packages (sections hidden)
 *   - @updates <query> → filtered updates (sections hidden)
 *   - Typing "@" → dropdown of available filters (@installed, @updates)
 *
 * Source/Project/Prerelease are controlled via title bar commands (QuickPick).
 * Package actions use hover buttons + context menus (QuickPick in backend).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AllProjectsIcon, ArrowUpIcon, ClearAllIcon, SingleProjectIcon } from '../app/icons';
import type { InstalledPackage, NuGetSource, PackageSearchResult, PackageUpdateMinimal, Project, ProjectInstalled, ProjectUpdates } from '../app/types';
import { PackageRow } from './components/PackageRow';
import { SectionHeader } from './components/SectionHeader';
import './SidebarApp.css';

// ─── VS Code API ─────────────────────────────────────────────────────────────

declare function acquireVsCodeApi(): {
    postMessage: (msg: unknown) => void;
    getState: () => Record<string, unknown> | undefined;
    setState: (state: Record<string, unknown>) => void;
};

const vscode = acquireVsCodeApi();

// ─── Search Mode Parser ─────────────────────────────────────────────────────

type SearchMode = 'default' | 'browse' | 'installed' | 'updates';

interface ParsedQuery {
    mode: SearchMode;
    filterText: string;
}

const FILTER_PREFIXES = ['@installed', '@updates'] as const;

function parseSearchQuery(query: string): ParsedQuery {
    const trimmed = query.trim();
    if (!trimmed) { return { mode: 'default', filterText: '' }; }

    const lower = trimmed.toLowerCase();
    for (const prefix of FILTER_PREFIXES) {
        if (lower === prefix || lower.startsWith(prefix + ' ')) {
            const filterText = trimmed.slice(prefix.length).trim();
            const mode = prefix.slice(1) as 'installed' | 'updates';
            return { mode, filterText };
        }
    }

    return { mode: 'browse', filterText: trimmed };
}

// ─── Component ───────────────────────────────────────────────────────────────

export const SidebarApp: React.FC = () => {
    // ─── State ───────────────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PackageSearchResult[]>([]);
    const [installedPackages, setInstalledPackages] = useState<InstalledPackage[]>([]);
    const [packageUpdates, setPackageUpdates] = useState<PackageUpdateMinimal[]>([]);
    const [allProjectsUpdates, setAllProjectsUpdates] = useState<ProjectUpdates[]>([]);
    const [backgroundInstalledCount, setBackgroundInstalledCount] = useState(0);

    // Accordion state for default mode (only 'installed' | 'updates' | null)
    const [expandedSection, setExpandedSection] = useState<'installed' | 'updates' | null>(null);
    const [, setSources] = useState<NuGetSource[]>([]);
    const [selectedSource, setSelectedSource] = useState('all');
    const [selectedProject, setSelectedProject] = useState('');
    const [, setSelectedProjectName] = useState('');
    const [projects, setProjects] = useState<Project[]>([]);
    const [includePrerelease, setIncludePrerelease] = useState(false);

    const [loadingSearch, setLoadingSearch] = useState(false);
    const [loadingInstalled, setLoadingInstalled] = useState(false);
    const [loadingUpdates, setLoadingUpdates] = useState(false);
    const [loadingAllUpdates, setLoadingAllUpdates] = useState(false);
    const [loadAllProjects, setLoadAllProjects] = useState(false);

    // All-projects installed mode state
    const [loadAllProjectsInstalled, setLoadAllProjectsInstalled] = useState(false);
    const [allProjectsInstalled, setAllProjectsInstalled] = useState<ProjectInstalled[]>([]);
    const [loadingAllInstalled, setLoadingAllInstalled] = useState(false);

    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [filterDropdownIndex, setFilterDropdownIndex] = useState(-1);
    const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

    // ─── Derived search mode ─────────────────────────────────────────────────
    const { mode: searchMode, filterText } = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

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
    const searchModeRef = useRef(searchMode);
    const loadAllProjectsInstalledRef = useRef(loadAllProjectsInstalled);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const browseListRef = useRef<HTMLDivElement>(null);
    const installedListRef = useRef<HTMLDivElement>(null);
    const updatesListRef = useRef<HTMLDivElement>(null);
    const filterDropdownRef = useRef<HTMLDivElement>(null);
    const browseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    useEffect(() => { searchModeRef.current = searchMode; }, [searchMode]);
    useEffect(() => { loadAllProjectsInstalledRef.current = loadAllProjectsInstalled; }, [loadAllProjectsInstalled]);

    // ─── @-prefix dropdown logic ─────────────────────────────────────────────
    const matchingFilters = useMemo(() => {
        const trimmed = searchQuery.trim().toLowerCase();
        // Show dropdown when text starts with @ but is not yet a complete valid prefix
        if (!trimmed.startsWith('@')) { return []; }
        // If already a complete prefix (possibly with filter text), don't show dropdown
        for (const prefix of FILTER_PREFIXES) {
            if (trimmed === prefix || trimmed.startsWith(prefix + ' ')) { return []; }
        }
        // Filter the available prefixes by what the user has typed so far
        return FILTER_PREFIXES.filter(p => p.startsWith(trimmed));
    }, [searchQuery]);

    // Show/hide the filter dropdown
    useEffect(() => {
        if (matchingFilters.length > 0) {
            setShowFilterDropdown(true);
            setFilterDropdownIndex(0);
        } else {
            setShowFilterDropdown(false);
            setFilterDropdownIndex(-1);
        }
    }, [matchingFilters]);

    const selectFilter = useCallback((filter: string) => {
        setSearchQuery(filter + ' ');
        setShowFilterDropdown(false);
        setFilterDropdownIndex(-1);
        searchInputRef.current?.focus();
    }, []);

    // ─── Message Handler ─────────────────────────────────────────────────────


    const handleMessage = useCallback((message: any) => {
        switch (message.type) {
            case 'focusSearch':
                // Focus search input when sidebar becomes visible (like native sidebar panels)
                setTimeout(() => searchInputRef.current?.focus(), 50);
                break;
            case 'state':
                if (message.selectedSource) { setSelectedSource(message.selectedSource); }
                if (message.selectedProject) {
                    setSelectedProject(message.selectedProject);
                    const name = message.selectedProject.split(/[\\/]/).pop()?.replace(/\.(csproj|fsproj|vbproj)$/, '') || '';
                    setSelectedProjectName(name);
                }
                if (message.includePrerelease !== undefined) { setIncludePrerelease(message.includePrerelease); }
                break;
            case 'projects':
                setProjects(message.projects || []);
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
                    setBackgroundInstalledCount(0);
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
            case 'allProjectsInstalled':
                setAllProjectsInstalled(message.projectInstalled || []);
                setLoadingAllInstalled(false);
                break;
            case 'installedCountUpdate':
                setBackgroundInstalledCount(message.count || 0);
                break;
            case 'forceRefresh':
                setPackageUpdates([]);
                packageUpdatesRef.current = [];
                setAllProjectsUpdates([]);
                allProjectsUpdatesRef.current = [];
                if (selectedProjectRef.current) {
                    vscode.postMessage({
                        type: 'getInstalledPackages',
                        projectPath: selectedProjectRef.current
                    });
                    setLoadingInstalled(true);
                }
                break;
            case 'installResult':
            case 'updateResult':
            case 'removeResult':
            case 'bulkUpdateResult':
            case 'bulkUpdateAllProjectsResult':
            case 'bulkRemoveResult':
            case 'bulkRemoveAllProjectsResult':
                setAllProjectsUpdates([]);
                allProjectsUpdatesRef.current = [];
                setPackageUpdates([]);
                packageUpdatesRef.current = [];
                if (selectedProjectRef.current) {
                    vscode.postMessage({
                        type: 'getInstalledPackages',
                        projectPath: selectedProjectRef.current
                    });
                    setLoadingInstalled(true);
                }
                if (loadAllProjectsRef.current) {
                    vscode.postMessage({
                        type: 'checkAllProjectsUpdates',
                        includePrerelease: includePrereleaseRef.current
                    });
                    setLoadingAllUpdates(true);
                }
                if (loadAllProjectsInstalledRef.current) {
                    setAllProjectsInstalled([]);
                    vscode.postMessage({ type: 'checkAllProjectsInstalled' });
                    setLoadingAllInstalled(true);
                }
                break;
            case 'sourceChanged':
                if (message.source !== selectedSourceRef.current) {
                    setSelectedSource(message.source);
                    setSearchResults([]);
                }
                break;
            case 'projectChanged':
                if (message.projectPath !== selectedProjectRef.current) {
                    setSelectedProject(message.projectPath);
                    setSelectedProjectName((message.projectName || '').replace(/\.(csproj|fsproj|vbproj)$/, ''));
                    setInstalledPackages([]);
                    setPackageUpdates([]);
                    setAllProjectsUpdates([]);
                    setAllProjectsInstalled([]);
                    setSelectedPackageId(null);
                    // Reset "load all projects" toggles so icons don't show stale state
                    setLoadAllProjects(false);
                    setLoadAllProjectsInstalled(false);
                    vscode.postMessage({
                        type: 'getInstalledPackages',
                        projectPath: message.projectPath
                    });
                    setLoadingInstalled(true);
                }
                break;
            case 'prereleaseChanged':
                setIncludePrerelease(message.includePrerelease);
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
        vscode.postMessage({ type: 'ready' });
        // Auto-focus search input on initial mount (like native sidebar panels)
        setTimeout(() => searchInputRef.current?.focus(), 100);
        return () => window.removeEventListener('message', listener);
    }, []);

    // ─── Auto-fetch installed when needed ────────────────────────────────────
    // In default mode: fetch when Installed or Updates section is expanded
    // In @installed/@updates mode: fetch if not already loaded
    useEffect(() => {
        if (!selectedProject) { return; }

        const needsInstalled = (
            (searchMode === 'default' && (expandedSection === 'installed' || expandedSection === 'updates')) ||
            searchMode === 'installed' ||
            searchMode === 'updates'
        );

        if (needsInstalled && installedPackages.length === 0 && !loadingInstalled) {
            // When entering updates mode, check if background data already covers this project
            if ((searchMode === 'updates' || expandedSection === 'updates') && packageUpdates.length === 0 && !loadingUpdates) {
                const bgProjectData = allProjectsUpdates.find(pu => pu.projectPath === selectedProject);
                if (bgProjectData) {
                    setPackageUpdates(bgProjectData.updates);
                    setLoadingUpdates(false);
                }
            }
            vscode.postMessage({
                type: 'getInstalledPackages',
                projectPath: selectedProject
            });
            setLoadingInstalled(true);
        }
    }, [searchMode, expandedSection, selectedProject, installedPackages.length, loadingInstalled, packageUpdates.length, loadingUpdates, allProjectsUpdates]);

    // ─── Load all projects updates ──────────────────────────────────────────
    useEffect(() => {
        if (loadAllProjects && (searchMode === 'updates' || (searchMode === 'default' && expandedSection === 'updates'))) {
            vscode.postMessage({
                type: 'checkAllProjectsUpdates',
                includePrerelease
            });
            setLoadingAllUpdates(true);
        }
    }, [loadAllProjects, searchMode, expandedSection, includePrerelease]);

    // ─── Load all projects installed ────────────────────────────────────────
    useEffect(() => {
        if (loadAllProjectsInstalled && (searchMode === 'installed' || (searchMode === 'default' && expandedSection === 'installed'))) {
            vscode.postMessage({ type: 'checkAllProjectsInstalled' });
            setLoadingAllInstalled(true);
        }
    }, [loadAllProjectsInstalled, searchMode, expandedSection]);

    // ─── Search Handlers ─────────────────────────────────────────────────────

    const dispatchBrowseSearch = useCallback((query: string) => {
        if (!query.trim() || query.trim().length < 2) { return; }
        setLoadingSearch(true);
        const sourcesToSearch = selectedSourceRef.current === 'all'
            ? undefined
            : [selectedSourceRef.current];
        vscode.postMessage({
            type: 'searchPackages',
            query: query.trim(),
            sources: sourcesToSearch,
            includePrerelease: includePrereleaseRef.current
        });
    }, []);

    // ─── Debounced browse search (150ms) ─────────────────────────────────────
    useEffect(() => {
        if (browseDebounceRef.current) {
            clearTimeout(browseDebounceRef.current);
            browseDebounceRef.current = null;
        }
        if (searchMode === 'browse' && filterText.length >= 2) {
            browseDebounceRef.current = setTimeout(() => {
                dispatchBrowseSearch(filterText);
                browseDebounceRef.current = null;
            }, 300);
        }
        return () => {
            if (browseDebounceRef.current) {
                clearTimeout(browseDebounceRef.current);
                browseDebounceRef.current = null;
            }
        };
    }, [searchQuery, searchMode, filterText, dispatchBrowseSearch]);

    const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        // @-prefix dropdown keyboard navigation
        if (showFilterDropdown && matchingFilters.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFilterDropdownIndex(prev => Math.min(prev + 1, matchingFilters.length - 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFilterDropdownIndex(prev => Math.max(prev - 1, 0));
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const idx = filterDropdownIndex >= 0 ? filterDropdownIndex : 0;
                selectFilter(matchingFilters[idx]);
                return;
            }
            if (e.key === 'Escape') {
                setShowFilterDropdown(false);
                return;
            }
        }

        if (e.key === 'Enter') {
            const parsed = parseSearchQuery((e.target as HTMLInputElement).value);
            if (parsed.mode === 'browse' && parsed.filterText.length >= 2) {
                // Clear pending debounce to avoid duplicate search
                if (browseDebounceRef.current) {
                    clearTimeout(browseDebounceRef.current);
                    browseDebounceRef.current = null;
                }
                dispatchBrowseSearch(parsed.filterText);
            }
            // For @installed/@updates, filtering is already live — Enter is a no-op
        }

        if (e.key === 'Escape') {
            if (searchQuery) {
                setSearchQuery('');
                setSearchResults([]);
            }
        }

        // ArrowDown from search → focus into the visible list
        if (e.key === 'ArrowDown' && !showFilterDropdown) {
            e.preventDefault();
            const mode = searchModeRef.current;
            if (mode === 'browse') { browseListRef.current?.focus(); }
            else if (mode === 'installed') { installedListRef.current?.focus(); }
            else if (mode === 'updates') { updatesListRef.current?.focus(); }
            else {
                // Default mode — focus the expanded section's list
                const section = expandedSectionRef.current;
                if (section === 'installed') { installedListRef.current?.focus(); }
                else if (section === 'updates') { updatesListRef.current?.focus(); }
            }
        }
    }, [showFilterDropdown, matchingFilters, filterDropdownIndex, selectFilter, dispatchBrowseSearch, searchQuery]);

    // Close dropdown on blur (with delay for click events)
    const handleSearchBlur = useCallback(() => {
        setTimeout(() => setShowFilterDropdown(false), 200);
    }, []);

    // Client-side filter for Installed / Updates
    const filteredInstalled = useMemo(() => {
        const q = (searchMode === 'installed' ? filterText : searchQuery).toLowerCase();
        if (!q) { return installedPackages; }
        return installedPackages.filter(p =>
            p.id.toLowerCase().includes(q) ||
            (p.authors && p.authors.toLowerCase().includes(q))
        );
    }, [installedPackages, searchQuery, searchMode, filterText]);

    const filteredUpdates = useMemo(() => {
        const q = (searchMode === 'updates' ? filterText : searchQuery).toLowerCase();
        if (!q) { return packageUpdates; }
        return packageUpdates.filter(p => p.id.toLowerCase().includes(q));
    }, [packageUpdates, searchQuery, searchMode, filterText]);

    // Map installed packages by ID for quick lookup in Browse
    const installedMap = useMemo(() => {
        const map = new Map<string, InstalledPackage>();
        for (const pkg of installedPackages) {
            map.set(pkg.id.toLowerCase(), pkg);
        }
        return map;
    }, [installedPackages]);

    // Total update count for badge
    const totalUpdateCount = loadAllProjects && allProjectsUpdates.length > 0
        ? allProjectsUpdates.reduce((sum, pu) => sum + pu.updates.length, 0)
        : packageUpdates.length > 0
            ? packageUpdates.length
            : allProjectsUpdates.find(pu => pu.projectPath === selectedProject)?.updates.length ?? 0;

    // ─── Section Toggle (default mode only) ──────────────────────────────────

    const toggleSection = useCallback((section: 'installed' | 'updates') => {
        setExpandedSection(prev => prev === section ? null : section);
        setSelectedPackageId(null);
    }, []);

    // ─── Keyboard Navigation ─────────────────────────────────────────────────

    const createSidebarKeyHandler = useCallback(<T extends { id: string }>(
        packages: T[],
        getId: (item: T) => string,
        options?: {
            onAction?: (item: T) => void;
            onDelete?: (item: T) => void;
        }
    ) => {
        return (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (packages.length === 0) { return; }

            const currentId = selectedPackageIdRef.current;
            const currentIndex = currentId
                ? packages.findIndex(p => getId(p).toLowerCase() === currentId.toLowerCase())
                : -1;

            if (e.key === 'Enter' && e.ctrlKey && options?.onAction && currentIndex >= 0) {
                e.preventDefault();
                options.onAction(packages[currentIndex]);
                return;
            }
            if (e.key === 'Enter' && !e.ctrlKey && options?.onAction && currentIndex >= 0) {
                e.preventDefault();
                options.onAction(packages[currentIndex]);
                return;
            }
            if (e.key === 'Delete' && options?.onDelete && currentIndex >= 0) {
                e.preventDefault();
                options.onDelete(packages[currentIndex]);
                return;
            }

            let newIndex = currentIndex;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                newIndex = currentIndex < packages.length - 1 ? currentIndex + 1 : currentIndex;
                if (currentIndex === -1) { newIndex = 0; }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentIndex <= 0) {
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
        if (!selectedProjectRef.current) { return; }
        const installed = installedPackagesRef.current.find(
            p => p.id.toLowerCase() === packageId.toLowerCase()
        );
        if (installed) {
            vscode.postMessage({
                type: 'removePackage',
                projectPath: selectedProjectRef.current,
                packageId
            });
        } else {
            vscode.postMessage({
                type: 'installPackage',
                projectPath: selectedProjectRef.current,
                packageId
            });
        }
    }, []);

    const handleInstalledPrimaryAction = useCallback((packageId: string) => {
        if (!selectedProjectRef.current) { return; }
        vscode.postMessage({
            type: 'removePackage',
            projectPath: selectedProjectRef.current,
            packageId
        });
    }, []);

    const handleUpdatesPrimaryAction = useCallback((packageId: string) => {
        if (!selectedProjectRef.current) { return; }
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

    const handleAllProjectsUpdatePrimaryAction = useCallback((packageId: string) => {
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
            versionType: installed?.versionType,
            context,
            projectPath: projectPath || selectedProjectRef.current
        });
    }, []);

    const handleUpdateAll = useCallback(() => {
        if (!selectedProjectRef.current) { return; }

        if (loadAllProjectsRef.current) {
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
            let packages = packageUpdatesRef.current.map(u => ({ id: u.id, version: u.latestVersion }));
            if (packages.length === 0) {
                const projectUpdate = allProjectsUpdatesRef.current.find(
                    pu => pu.projectPath === selectedProjectRef.current
                );
                if (projectUpdate) {
                    packages = projectUpdate.updates.map(u => ({ id: u.id, version: u.latestVersion }));
                }
            }
            vscode.postMessage({
                type: 'bulkUpdatePackages',
                packages,
                projectPath: selectedProjectRef.current
            });
        }
    }, []);

    // ─── Render Helpers ──────────────────────────────────────────────────────

    const renderBrowseResults = () => (
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
                        const inst = installedMap.get(pkg.id.toLowerCase());
                        if (!inst) { handleBrowsePrimaryAction(pkg.id); }
                    },
                    onDelete: (pkg) => {
                        const inst = installedMap.get(pkg.id.toLowerCase());
                        if (inst) { handleBrowsePrimaryAction(pkg.id); }
                    }
                }
            )}
        >
            {!loadingSearch && searchResults.length === 0 && (
                <div className="sidebar-empty">
                    {filterText.length >= 2 ? 'No packages found.' : 'Type to search NuGet packages...'}
                </div>
            )}
            {loadingSearch && searchResults.length === 0 && (
                <div className="sidebar-empty">Searching...</div>
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
    );

    const renderInstalledList = () => (
        <div className="section-content">
            {/* Single project installed */}
            {!loadAllProjectsInstalled && (
                <div
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
                            {filterText || searchQuery ? 'No matching packages.' : selectedProject ? 'No packages installed.' : 'Select a project first.'}
                        </div>
                    )}
                    {loadingInstalled && filteredInstalled.length === 0 && (
                        <div className="sidebar-empty">Loading...</div>
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

            {/* All projects installed — flat list with project headers */}
            {loadAllProjectsInstalled && (
                <div
                    role="listbox"
                    tabIndex={0}
                    ref={installedListRef}
                >
                    {!loadingAllInstalled && allProjectsInstalled.length === 0 && (
                        <div className="sidebar-empty">No installed packages found.</div>
                    )}
                    {loadingAllInstalled && allProjectsInstalled.length === 0 && (
                        <div className="sidebar-empty">Loading all projects...</div>
                    )}
                    {[...allProjectsInstalled]
                        .sort((a, b) => {
                            if (a.projectPath === selectedProject) { return -1; }
                            if (b.projectPath === selectedProject) { return 1; }
                            return a.projectName.localeCompare(b.projectName);
                        })
                        .map((pi) => {
                            const q = filterText.toLowerCase();
                            const filtered = q
                                ? pi.packages.filter(p => p.id.toLowerCase().includes(q))
                                : pi.packages;
                            if (filtered.length === 0 && q) { return null; }
                            return (
                                <div key={pi.projectPath}>
                                    <div className="project-group-header" title={pi.projectPath}>
                                        {pi.projectName} ({filtered.length})
                                    </div>
                                    {filtered.map((pkg) => (
                                        <PackageRow
                                            key={`${pi.projectPath}::${pkg.id}`}
                                            packageId={pkg.id}
                                            version={pkg.version}
                                            installedVersion={pkg.resolvedVersion || pkg.version}
                                            context="installed"
                                            selected={selectedPackageId === `${pi.projectPath}::${pkg.id}`}
                                            onPrimaryAction={handleInstalledPrimaryAction}
                                            onContextMenu={(id, e) => handleContextMenu(id, e, 'installed')}
                                            onClick={() => setSelectedPackageId(`${pi.projectPath}::${pkg.id}`)}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                </div>
            )}
        </div>
    );

    const renderUpdatesList = () => (
        <div className="section-content">

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
                    {loadingUpdates && filteredUpdates.length === 0 && (
                        <div className="sidebar-empty">Checking for updates...</div>
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
                    {loadingAllUpdates && allProjectsUpdates.length === 0 && (
                        <div className="sidebar-empty">Checking all projects...</div>
                    )}
                    {[...allProjectsUpdates]
                        .sort((a, b) => {
                            if (a.projectPath === selectedProject) { return -1; }
                            if (b.projectPath === selectedProject) { return 1; }
                            return a.projectName.localeCompare(b.projectName);
                        })
                        .map((pu) => (
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
    );

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="sidebar-app">
            {/* Search Input */}
            <div className="sidebar-search-container" role="search">
                <div className="sidebar-search-wrapper">
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="sidebar-search"
                        placeholder="Search NuGet packages"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        onBlur={handleSearchBlur}
                        spellCheck={false}
                        autoComplete="off"
                        role="searchbox"
                        aria-label="Search NuGet packages"
                    />
                    {searchQuery && (
                        <button
                            className="sidebar-search-clear"
                            onClick={() => { setSearchQuery(''); setSearchResults([]); searchInputRef.current?.focus(); }}
                            aria-label="Clear search"
                            tabIndex={-1}
                        >
                            <ClearAllIcon size={16} />
                        </button>
                    )}
                </div>
                {/* @-prefix filter dropdown */}
                {showFilterDropdown && matchingFilters.length > 0 && (
                    <div className="filter-dropdown" ref={filterDropdownRef} role="listbox">
                        {matchingFilters.map((filter, index) => (
                            <div
                                key={filter}
                                className={`filter-dropdown-item${index === filterDropdownIndex ? ' active' : ''}`}
                                onMouseDown={(e) => { e.preventDefault(); selectFilter(filter); }}
                                onMouseEnter={() => setFilterDropdownIndex(index)}
                                role="option"
                                aria-selected={index === filterDropdownIndex}
                            >
                                <span className="filter-dropdown-prefix">@</span>
                                <span>{filter.slice(1)}</span>
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
                    <p>Use the project picker button in the title bar.</p>
                </div>
            )}

            {/* ─── Browse Mode (plain text search) ────────────────────── */}
            {searchMode === 'browse' && renderBrowseResults()}

            {/* ─── @installed Mode ─────────────────────────────────────── */}
            {searchMode === 'installed' && renderInstalledList()}

            {/* ─── @updates Mode ───────────────────────────────────────── */}
            {searchMode === 'updates' && renderUpdatesList()}

            {/* ─── Default Mode (sections) ─────────────────────────────── */}
            {searchMode === 'default' && (
                <>
                    {/* Installed Section */}
                    <SectionHeader
                        title="Installed"
                        expanded={expandedSection === 'installed'}
                        count={loadAllProjectsInstalled
                            ? allProjectsInstalled.reduce((sum, pi) => sum + pi.packages.length, 0)
                            : (installedPackages.length || backgroundInstalledCount)}
                        loading={loadingInstalled || loadingAllInstalled}
                        onToggle={() => toggleSection('installed')}
                        actions={projects.length > 1 ? (
                            <button
                                className="section-action-btn"
                                onClick={() => { setLoadAllProjectsInstalled(prev => !prev); setExpandedSection('installed'); }}
                                title={loadAllProjectsInstalled ? 'Show single project' : 'Load all projects'}
                                aria-label={loadAllProjectsInstalled ? 'Show single project' : 'Load all projects'}
                            >
                                {loadAllProjectsInstalled ? (
                                    <AllProjectsIcon size={16} />
                                ) : (
                                    <SingleProjectIcon size={16} />
                                )}
                            </button>
                        ) : undefined}
                    />
                    {expandedSection === 'installed' && renderInstalledList()}

                    {/* Updates Section */}
                    <SectionHeader
                        title="Updates"
                        expanded={expandedSection === 'updates'}
                        count={totalUpdateCount}
                        loading={loadingUpdates || loadingAllUpdates}
                        onToggle={() => toggleSection('updates')}
                        actions={
                            <>
                                <button
                                    className="section-action-btn"
                                    onClick={() => { setLoadAllProjects(prev => !prev); setExpandedSection('updates'); }}
                                    title={loadAllProjects ? 'Show single project' : 'Load all projects'}
                                    aria-label={loadAllProjects ? 'Show single project' : 'Load all projects'}
                                >
                                    {loadAllProjects ? (
                                        <AllProjectsIcon size={16} />
                                    ) : (
                                        <SingleProjectIcon size={16} />
                                    )}
                                </button>
                                {totalUpdateCount > 0 && (
                                    <button
                                        className="section-action-btn"
                                        onClick={handleUpdateAll}
                                        title={`Update all packages (${totalUpdateCount})`}
                                        aria-label={`Update all packages (${totalUpdateCount})`}
                                    >
                                        <ArrowUpIcon size={16} />
                                    </button>
                                )}
                            </>
                        }
                    />
                    {expandedSection === 'updates' && renderUpdatesList()}
                </>
            )}
        </div>
    );
};

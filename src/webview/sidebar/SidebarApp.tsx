/**
 * SidebarApp — Main React component for the nUIget sidebar panel.
 *
 * Extensions-view-inspired search UX:
 *   - Empty search → Installed + Updates sections (independently collapsible with draggable split)
 *   - Plain text + Enter → NuGet browse results (flat list, sections hidden)
 *   - @installed <query> → filtered installed packages (sections hidden)
 *   - @updates <query> → filtered updates (sections hidden)
 *   - Typing "@" → dropdown of available filters (@installed, @updates)
 *
 * Source/Project/Prerelease are controlled via title bar commands (QuickPick).
 * Package actions use hover buttons + context menus (QuickPick in backend).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MemoizedDraggableSash } from '../app/components/DraggableSash';
import { ArrowUpIcon, ChevronRightIcon, ClearAllIcon, FilterIcon } from '../app/icons';
import type { InstalledPackage, NuGetSource, PackageSearchResult, PackageUpdateMinimal, Project, ProjectInstalled, ProjectUpdates, WebviewMessage } from '../app/types';
import { ALL_PROJECTS_SENTINEL } from '../app/types';
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

    // Independent section expand/collapse — both can be open (VS Code native style)
    const [installedExpanded, setInstalledExpanded] = useState(true);
    const [updatesExpanded, setUpdatesExpanded] = useState(true);
    const [sectionSplit, setSectionSplit] = useState(50);
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

    // All-projects installed mode state
    const [allProjectsInstalled, setAllProjectsInstalled] = useState<ProjectInstalled[]>([]);
    const [loadingAllInstalled, setLoadingAllInstalled] = useState(false);

    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [filterDropdownIndex, setFilterDropdownIndex] = useState(-1);
    const [filterButtonTriggered, setFilterButtonTriggered] = useState(false);
    const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

    // Collapsible project groups in all-projects mode (separate per section)
    const [collapsedInstalledProjects, setCollapsedInstalledProjects] = useState<Set<string>>(new Set());
    const [collapsedUpdatesProjects, setCollapsedUpdatesProjects] = useState<Set<string>>(new Set());

    // ─── Derived "All Projects" mode ─────────────────────────────────────────
    const isAllProjects = selectedProject === ALL_PROJECTS_SENTINEL;

    // ─── Derived search mode ─────────────────────────────────────────────────
    const { mode: searchMode, filterText } = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

    // ─── Refs (for message handler closure) ──────────────────────────────────
    const selectedProjectRef = useRef(selectedProject);
    const selectedSourceRef = useRef(selectedSource);
    const includePrereleaseRef = useRef(includePrerelease);
    const installedPackagesRef = useRef(installedPackages);
    const installedExpandedRef = useRef(installedExpanded);
    const updatesExpandedRef = useRef(updatesExpanded);
    const isAllProjectsRef = useRef(isAllProjects);
    const selectedPackageIdRef = useRef(selectedPackageId);
    const packageUpdatesRef = useRef(packageUpdates);
    const allProjectsUpdatesRef = useRef(allProjectsUpdates);
    const allProjectsInstalledRef = useRef(allProjectsInstalled);
    const searchResultsRef = useRef(searchResults);
    const searchModeRef = useRef(searchMode);
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
    useEffect(() => { installedExpandedRef.current = installedExpanded; }, [installedExpanded]);
    useEffect(() => { updatesExpandedRef.current = updatesExpanded; }, [updatesExpanded]);
    useEffect(() => { isAllProjectsRef.current = isAllProjects; }, [isAllProjects]);
    useEffect(() => { selectedPackageIdRef.current = selectedPackageId; }, [selectedPackageId]);
    useEffect(() => { packageUpdatesRef.current = packageUpdates; }, [packageUpdates]);
    useEffect(() => { allProjectsUpdatesRef.current = allProjectsUpdates; }, [allProjectsUpdates]);
    useEffect(() => { allProjectsInstalledRef.current = allProjectsInstalled; }, [allProjectsInstalled]);
    useEffect(() => { searchResultsRef.current = searchResults; }, [searchResults]);
    useEffect(() => { searchModeRef.current = searchMode; }, [searchMode]);

    // ─── @-prefix dropdown logic ─────────────────────────────────────────────
    const matchingFilters = useMemo(() => {
        // Filter button shows all available prefixes
        if (filterButtonTriggered) { return [...FILTER_PREFIXES]; }
        const trimmed = searchQuery.trim().toLowerCase();
        // Show dropdown when text starts with @ but is not yet a complete valid prefix
        if (!trimmed.startsWith('@')) { return []; }
        // If already a complete prefix (possibly with filter text), don't show dropdown
        for (const prefix of FILTER_PREFIXES) {
            if (trimmed === prefix || trimmed.startsWith(prefix + ' ')) { return []; }
        }
        // Filter the available prefixes by what the user has typed so far
        return FILTER_PREFIXES.filter(p => p.startsWith(trimmed));
    }, [searchQuery, filterButtonTriggered]);

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
        setFilterButtonTriggered(false);
        searchInputRef.current?.focus();
    }, []);

    // ─── Message Handler ─────────────────────────────────────────────────────


    const handleMessage = useCallback((message: WebviewMessage) => {
        switch (message.type) {
            case 'focusSearch':
                // Focus search input when sidebar becomes visible (like native sidebar panels)
                setTimeout(() => searchInputRef.current?.focus(), 50);
                break;
            case 'treeIndent':
                if (message.value !== undefined) { document.documentElement.style.setProperty('--tree-indent', `${message.value}px`); }
                break;
            case 'state':
                if (message.selectedSource) { setSelectedSource(message.selectedSource); }
                if (message.selectedProject) {
                    const projectChanged = message.selectedProject !== selectedProjectRef.current;
                    // Clear stale data when project changed (e.g. sidebar re-shown after backend project change)
                    if (projectChanged) {
                        setInstalledPackages([]);
                        setPackageUpdates([]);
                        setAllProjectsUpdates([]);
                        setAllProjectsInstalled([]);
                        // Re-fetch for all-projects mode since effects won't re-trigger
                        if (message.selectedProject === ALL_PROJECTS_SENTINEL) {
                            if (installedExpandedRef.current || searchModeRef.current === 'installed') {
                                vscode.postMessage({ type: 'checkAllProjectsInstalled' });
                                setLoadingAllInstalled(true);
                            }
                            if (updatesExpandedRef.current || searchModeRef.current === 'updates') {
                                vscode.postMessage({ type: 'checkAllProjectsUpdates', includePrerelease: includePrereleaseRef.current });
                                setLoadingAllUpdates(true);
                            }
                        }
                    }
                    setSelectedProject(message.selectedProject);
                    // Immediately sync ref so the 'projects' handler's auto-select guard
                    // sees the correct value (useEffect ref sync is deferred after paint)
                    selectedProjectRef.current = message.selectedProject;
                    const name = message.selectedProject.split(/[\\/]/).pop()?.replace(/\.(csproj|fsproj|vbproj)$/, '') || '';
                    setSelectedProjectName(name);
                }
                if (message.includePrerelease !== undefined) { setIncludePrerelease(message.includePrerelease); }
                if (message.sectionSplit !== undefined) { setSectionSplit(message.sectionSplit); }
                if (message.treeIndent !== undefined) {
                    document.documentElement.style.setProperty('--tree-indent', `${message.treeIndent}px`);
                }
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
                    // Discard stale response if project changed while request was in-flight
                    if (message.projectPath && message.projectPath !== selectedProjectRef.current) { break; }
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
                // Discard stale response if project changed while request was in-flight
                if (message.projectPath && message.projectPath !== selectedProjectRef.current) { break; }
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
                if (selectedProjectRef.current === ALL_PROJECTS_SENTINEL) {
                    if (installedExpandedRef.current || searchModeRef.current === 'installed') {
                        setAllProjectsInstalled([]);
                        allProjectsInstalledRef.current = [];
                        vscode.postMessage({ type: 'checkAllProjectsInstalled' });
                        setLoadingAllInstalled(true);
                    }
                    if (updatesExpandedRef.current || searchModeRef.current === 'updates') {
                        vscode.postMessage({ type: 'checkAllProjectsUpdates', includePrerelease: includePrereleaseRef.current });
                        setLoadingAllUpdates(true);
                    }
                } else if (selectedProjectRef.current) {
                    vscode.postMessage({
                        type: 'getInstalledPackages',
                        projectPath: selectedProjectRef.current
                    });
                    setLoadingInstalled(true);
                }
                break;
            case 'packageChanged':
                {
                    // Operation-aware notification from main panel via sidebar backend
                    // Surgically update state instead of clearing everything and re-fetching
                    const op = message.operation as { type: string; packageId?: string; projectPath?: string } | undefined;
                    const opPkgId = op?.packageId?.toLowerCase();
                    if (opPkgId && (op?.type === 'update' || op?.type === 'remove')) {
                        setPackageUpdates(prev => { const f = prev.filter(p => p.id.toLowerCase() !== opPkgId); packageUpdatesRef.current = f; return f; });
                        setAllProjectsUpdates(prev => {
                            const updated = prev.map(pu => ({ ...pu, updates: pu.updates.filter(u => u.id.toLowerCase() !== opPkgId) })).filter(pu => pu.updates.length > 0);
                            allProjectsUpdatesRef.current = updated;
                            return updated;
                        });
                    }
                    // Re-fetch installed packages for transitive accuracy (lightweight — just .csproj parse)
                    if (selectedProjectRef.current && selectedProjectRef.current !== ALL_PROJECTS_SENTINEL) {
                        vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                        setLoadingInstalled(true);
                    }
                }
                break;
            case 'installResult':
            case 'updateResult':
            case 'removeResult':
                {
                    // Single operation result from sidebar's own operations
                    // Only update optimistically if the operation succeeded
                    if (message.success) {
                        const opPkgId = (message.packageId as string)?.toLowerCase();
                        if (opPkgId && (message.type === 'updateResult' || message.type === 'removeResult')) {
                            setPackageUpdates(prev => { const f = prev.filter(p => p.id.toLowerCase() !== opPkgId); packageUpdatesRef.current = f; return f; });
                            setAllProjectsUpdates(prev => {
                                const updated = prev.map(pu => ({ ...pu, updates: pu.updates.filter(u => u.id.toLowerCase() !== opPkgId) })).filter(pu => pu.updates.length > 0);
                                allProjectsUpdatesRef.current = updated;
                                return updated;
                            });
                        }
                        if (selectedProjectRef.current && selectedProjectRef.current !== ALL_PROJECTS_SENTINEL) {
                            vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                            setLoadingInstalled(true);
                        } else if (selectedProjectRef.current === ALL_PROJECTS_SENTINEL && opPkgId) {
                            const opProjectPath = message.projectPath as string | undefined;
                            // In all-projects mode, optimistically update installedPackages so
                            // browse rows reflect the install/remove immediately (icon change).
                            if (message.type === 'installResult') {
                                setInstalledPackages(prev => {
                                    if (prev.some(p => p.id.toLowerCase() === opPkgId)) { return prev; }
                                    const searchPkg = searchResultsRef.current.find(p => p.id.toLowerCase() === opPkgId);
                                    const ver = searchPkg?.version || '';
                                    return [...prev, { id: message.packageId as string, version: ver, resolvedVersion: ver }];
                                });
                                // Also update allProjectsInstalled for the specific project
                                if (opProjectPath) {
                                    setAllProjectsInstalled(prev => {
                                        const searchPkg = searchResultsRef.current.find(p => p.id.toLowerCase() === opPkgId);
                                        const ver = searchPkg?.version || '';
                                        const updated = prev.map(pi => {
                                            if (pi.projectPath !== opProjectPath) { return pi; }
                                            if (pi.packages.some(p => p.id.toLowerCase() === opPkgId)) { return pi; }
                                            return { ...pi, packages: [...pi.packages, { id: message.packageId as string, version: ver, resolvedVersion: ver }] };
                                        });
                                        allProjectsInstalledRef.current = updated;
                                        return updated;
                                    });
                                }
                            } else if (message.type === 'removeResult') {
                                // Remove from allProjectsInstalled for the specific project
                                if (opProjectPath) {
                                    setAllProjectsInstalled(prev => {
                                        const updated = prev.map(pi => {
                                            if (pi.projectPath !== opProjectPath) { return pi; }
                                            return { ...pi, packages: pi.packages.filter(p => p.id.toLowerCase() !== opPkgId) };
                                        });
                                        allProjectsInstalledRef.current = updated;
                                        return updated;
                                    });
                                }
                                // Also check if the package is still installed in any project
                                // If not, remove from the flat installedPackages too
                                setInstalledPackages(prev => prev.filter(p => p.id.toLowerCase() !== opPkgId));
                            }
                        }
                    }
                }
                break;
            case 'bulkUpdateResult':
                {
                    // Optimistically clear updates, keeping only failed packages
                    const failedIds = (message.failedPackageIds as string[] | undefined) || [];
                    const failedSet = new Set(failedIds.map(id => id.toLowerCase()));
                    if (failedIds.length > 0) {
                        setPackageUpdates(prev => { const f = prev.filter(p => failedSet.has(p.id.toLowerCase())); packageUpdatesRef.current = f; return f; });
                        setAllProjectsUpdates(prev => {
                            const projPath = message.projectPath as string;
                            const updated = prev.map(pu => {
                                if (pu.projectPath !== projPath) { return pu; }
                                return { ...pu, updates: pu.updates.filter(u => failedSet.has(u.id.toLowerCase())) };
                            }).filter(pu => pu.updates.length > 0);
                            allProjectsUpdatesRef.current = updated;
                            return updated;
                        });
                    } else {
                        setPackageUpdates([]); packageUpdatesRef.current = [];
                        setAllProjectsUpdates(prev => {
                            const projPath = message.projectPath as string;
                            const updated = prev.map(pu => {
                                if (pu.projectPath !== projPath) { return pu; }
                                return { ...pu, updates: [] };
                            }).filter(pu => pu.updates.length > 0);
                            allProjectsUpdatesRef.current = updated;
                            return updated;
                        });
                    }
                    if (selectedProjectRef.current && selectedProjectRef.current !== ALL_PROJECTS_SENTINEL) {
                        vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                        setLoadingInstalled(true);
                    }
                }
                break;
            case 'bulkUpdateAllProjectsResult':
                {
                    // Optimistically clear all project updates, respecting per-project failures
                    const perProjectFailed = (message.perProjectFailedIds as { projectPath: string; failedPackageIds: string[] }[] | undefined) || [];
                    setAllProjectsUpdates(prev => {
                        const updated = prev.map(pu => {
                            const projectFailed = perProjectFailed.find(pf => pf.projectPath === pu.projectPath);
                            if (!projectFailed) { return { ...pu, updates: [] }; }
                            const failedSet = new Set(projectFailed.failedPackageIds.map(id => id.toLowerCase()));
                            return { ...pu, updates: pu.updates.filter(u => failedSet.has(u.id.toLowerCase())) };
                        }).filter(pu => pu.updates.length > 0);
                        allProjectsUpdatesRef.current = updated;
                        return updated;
                    });
                    setPackageUpdates([]); packageUpdatesRef.current = [];
                    if (selectedProjectRef.current && selectedProjectRef.current !== ALL_PROJECTS_SENTINEL) {
                        vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                        setLoadingInstalled(true);
                    }
                }
                break;
            case 'bulkRemoveResult':
            case 'bulkRemoveAllProjectsResult':
                // Removed packages can't have updates — clear update state
                setPackageUpdates([]); packageUpdatesRef.current = [];
                setAllProjectsUpdates([]); allProjectsUpdatesRef.current = [];
                if (selectedProjectRef.current && selectedProjectRef.current !== ALL_PROJECTS_SENTINEL) {
                    vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                    setLoadingInstalled(true);
                }
                if (isAllProjectsRef.current) {
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
                // Always clear and re-fetch — no same-project guard. This allows
                // re-selecting the current project as a manual refresh, and avoids
                // stale data when title and webview state disagree.
                setSelectedProject(message.projectPath);
                selectedProjectRef.current = message.projectPath;
                setSelectedProjectName((message.projectName || '').replace(/\.(csproj|fsproj|vbproj)$/, ''));
                setInstalledPackages([]);
                setPackageUpdates([]);
                setAllProjectsUpdates([]);
                setAllProjectsInstalled([]);
                setSelectedPackageId(null);
                // Reset all loading flags — prevents stuck spinners when stale
                // responses are discarded by projectPath guards after rapid switching
                setLoadingInstalled(false);
                setLoadingUpdates(false);
                setLoadingAllUpdates(false);
                setLoadingAllInstalled(false);
                // Fetch appropriate data based on mode
                if (message.projectPath === ALL_PROJECTS_SENTINEL) {
                    if (installedExpandedRef.current || searchModeRef.current === 'installed') {
                        vscode.postMessage({ type: 'checkAllProjectsInstalled' });
                        setLoadingAllInstalled(true);
                    }
                    if (updatesExpandedRef.current || searchModeRef.current === 'updates') {
                        vscode.postMessage({ type: 'checkAllProjectsUpdates', includePrerelease: includePrereleaseRef.current });
                        setLoadingAllUpdates(true);
                    }
                } else {
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
                    version: message.version,
                    sourceUrl: message.sourceUrl
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
        if (!selectedProject || selectedProject === ALL_PROJECTS_SENTINEL) { return; }

        const needsInstalled = (
            (searchMode === 'default' && (installedExpanded || updatesExpanded)) ||
            searchMode === 'installed' ||
            searchMode === 'updates'
        );

        if (needsInstalled && installedPackages.length === 0 && !loadingInstalled) {
            // When entering updates mode, check if background data already covers this project
            if ((searchMode === 'updates' || updatesExpanded) && packageUpdates.length === 0 && !loadingUpdates) {
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
    }, [searchMode, installedExpanded, updatesExpanded, selectedProject, installedPackages.length, loadingInstalled, packageUpdates.length, loadingUpdates, allProjectsUpdates]);

    // ─── Load all projects updates ──────────────────────────────────────────
    useEffect(() => {
        if (isAllProjects && (searchMode === 'updates' || (searchMode === 'default' && updatesExpanded))) {
            vscode.postMessage({
                type: 'checkAllProjectsUpdates',
                includePrerelease
            });
            setLoadingAllUpdates(true);
        }
    }, [isAllProjects, searchMode, updatesExpanded, includePrerelease]);

    // ─── Load all projects installed ────────────────────────────────────────
    useEffect(() => {
        if (isAllProjects && (searchMode === 'installed' || (searchMode === 'default' && installedExpanded))) {
            vscode.postMessage({ type: 'checkAllProjectsInstalled' });
            setLoadingAllInstalled(true);
        }
    }, [isAllProjects, searchMode, installedExpanded]);

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
                setFilterButtonTriggered(false);
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
                // Default mode — focus the first expanded section's list
                if (installedExpandedRef.current) { installedListRef.current?.focus(); }
                else if (updatesExpandedRef.current) { updatesListRef.current?.focus(); }
            }
        }
    }, [showFilterDropdown, matchingFilters, filterDropdownIndex, selectFilter, dispatchBrowseSearch, searchQuery]);

    // Close dropdown on blur (with delay for click events)
    const handleSearchBlur = useCallback(() => {
        setTimeout(() => { setShowFilterDropdown(false); setFilterButtonTriggered(false); }, 200);
    }, []);

    // Client-side filter for Installed / Updates
    const filteredInstalled = useMemo(() => {
        const q = (searchMode === 'installed' ? filterText : searchQuery).toLowerCase();
        const sorted = [...installedPackages].sort((a, b) => a.id.localeCompare(b.id));
        if (!q) { return sorted; }
        return sorted.filter(p =>
            p.id.toLowerCase().includes(q) ||
            (p.authors && p.authors.toLowerCase().includes(q))
        );
    }, [installedPackages, searchQuery, searchMode, filterText]);

    const filteredUpdates = useMemo(() => {
        const q = (searchMode === 'updates' ? filterText : searchQuery).toLowerCase();
        const sorted = [...packageUpdates].sort((a, b) => a.id.localeCompare(b.id));
        if (!q) { return sorted; }
        return sorted.filter(p => p.id.toLowerCase().includes(q));
    }, [packageUpdates, searchQuery, searchMode, filterText]);

    // Map installed packages by ID for quick lookup in Browse
    const installedMap = useMemo(() => {
        const map = new Map<string, InstalledPackage>();
        if (isAllProjects) {
            // In all-projects mode, aggregate from allProjectsInstalled
            for (const pi of allProjectsInstalled) {
                for (const pkg of pi.packages) {
                    const key = pkg.id.toLowerCase();
                    if (!map.has(key)) {
                        map.set(key, { id: pkg.id, version: pkg.version, resolvedVersion: pkg.resolvedVersion });
                    }
                }
            }
        }
        // Also include single-project installedPackages (used for optimistic updates)
        for (const pkg of installedPackages) {
            const key = pkg.id.toLowerCase();
            if (!map.has(key)) {
                map.set(key, pkg);
            }
        }
        return map;
    }, [installedPackages, isAllProjects, allProjectsInstalled]);

    // Map packageId → list of project names where it's installed (for browse tooltip in all-projects mode)
    const packageProjectsMap = useMemo(() => {
        const map = new Map<string, string[]>();
        if (!isAllProjects) { return map; }
        for (const pi of allProjectsInstalled) {
            const projName = pi.projectName.replace(/\.(csproj|fsproj|vbproj)$/, '');
            for (const pkg of pi.packages) {
                const key = pkg.id.toLowerCase();
                const list = map.get(key);
                if (list) { list.push(projName); }
                else { map.set(key, [projName]); }
            }
        }
        return map;
    }, [isAllProjects, allProjectsInstalled]);

    // Total update count for badge
    const totalUpdateCount = isAllProjects && allProjectsUpdates.length > 0
        ? allProjectsUpdates.reduce((sum, pu) => sum + pu.updates.length, 0)
        : packageUpdates.length > 0
            ? packageUpdates.length
            : allProjectsUpdates.find(pu => pu.projectPath === selectedProject)?.updates.length ?? 0;

    // ─── Section Toggle (default mode only) ──────────────────────────────────

    const toggleInstalled = useCallback(() => {
        setInstalledExpanded(prev => !prev);
        setSelectedPackageId(null);
    }, []);

    const toggleUpdates = useCallback(() => {
        setUpdatesExpanded(prev => !prev);
        setSelectedPackageId(null);
    }, []);

    const handleSectionSashDrag = useCallback((pos: number) => setSectionSplit(pos), []);
    const handleSectionSashDragEnd = useCallback((pos: number) => {
        vscode.postMessage({ type: 'saveSectionSplit', position: pos });
    }, []);
    const handleSectionSashReset = useCallback(() => {
        setSectionSplit(50);
        vscode.postMessage({ type: 'saveSectionSplit', position: 50 });
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

    // ─── Project Group Collapse (all-projects tree view) ─────────────────────
    const toggleInstalledProjectCollapse = useCallback((projectPath: string) => {
        setCollapsedInstalledProjects(prev => {
            const next = new Set(prev);
            if (next.has(projectPath)) { next.delete(projectPath); } else { next.add(projectPath); }
            return next;
        });
    }, []);
    const toggleUpdatesProjectCollapse = useCallback((projectPath: string) => {
        setCollapsedUpdatesProjects(prev => {
            const next = new Set(prev);
            if (next.has(projectPath)) { next.delete(projectPath); } else { next.add(projectPath); }
            return next;
        });
    }, []);

    // ─── Package Actions ─────────────────────────────────────────────────────

    const handleBrowsePrimaryAction = useCallback((packageId: string) => {
        if (!selectedProjectRef.current) { return; }
        const pkgLower = packageId.toLowerCase();

        // Check if installed — in all-projects mode, also check allProjectsInstalled
        let isInstalled = installedPackagesRef.current.some(p => p.id.toLowerCase() === pkgLower);
        if (!isInstalled && isAllProjectsRef.current) {
            isInstalled = allProjectsInstalledRef.current.some(
                pi => pi.packages.some(p => p.id.toLowerCase() === pkgLower)
            );
        }

        if (isInstalled) {
            if (selectedProjectRef.current === ALL_PROJECTS_SENTINEL) {
                // Find which projects have this package and ask backend to show picker
                const projectPaths = allProjectsInstalledRef.current
                    .filter(pi => pi.packages.some(p => p.id.toLowerCase() === pkgLower))
                    .map(pi => pi.projectPath);
                if (projectPaths.length === 0) { return; }
                vscode.postMessage({
                    type: 'pickProjectForRemove',
                    packageId,
                    projectPaths
                });
            } else {
                vscode.postMessage({
                    type: 'removePackage',
                    projectPath: selectedProjectRef.current,
                    packageId
                });
            }
        } else {
            const searchPkg = searchResultsRef.current.find(
                p => p.id.toLowerCase() === pkgLower
            );
            if (selectedProjectRef.current === ALL_PROJECTS_SENTINEL) {
                // In all-projects mode, ask the backend to show a project picker
                vscode.postMessage({
                    type: 'pickProjectForInstall',
                    packageId,
                    version: searchPkg?.version
                });
            } else {
                vscode.postMessage({
                    type: 'installPackage',
                    projectPath: selectedProjectRef.current,
                    packageId,
                    version: searchPkg?.version
                });
            }
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
                version: update.latestVersion,
                sourceUrl: update.sourceUrl
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
                    version: update.latestVersion,
                    sourceUrl: update.sourceUrl
                });
                return;
            }
        }
    }, []);

    const handleContextMenu = useCallback((packageId: string, _e: React.MouseEvent, context: 'browse' | 'installed' | 'updates', projectPath?: string) => {
        setSelectedPackageId(packageId);
        const pkgLower = packageId.toLowerCase();
        let installed = installedPackagesRef.current.find(
            p => p.id.toLowerCase() === pkgLower
        );

        // In all-projects mode, also check allProjectsInstalled for browse context
        let installedProjects: Array<{ projectPath: string; projectName: string; version: string }> | undefined;
        if (isAllProjectsRef.current && context === 'browse') {
            const matches: Array<{ projectPath: string; projectName: string; version: string }> = [];
            for (const pi of allProjectsInstalledRef.current) {
                const match = pi.packages.find(p => p.id.toLowerCase() === pkgLower);
                if (match) {
                    matches.push({
                        projectPath: pi.projectPath,
                        projectName: pi.projectName,
                        version: match.resolvedVersion || match.version
                    });
                    if (!installed) {
                        installed = { id: match.id, version: match.version, resolvedVersion: match.resolvedVersion };
                    }
                }
            }
            if (matches.length > 0) { installedProjects = matches; }
        }

        let latestVersion: string | undefined;
        let sourceUrl: string | undefined;
        if (context === 'updates') {
            const update = packageUpdatesRef.current.find(u => u.id.toLowerCase() === pkgLower);
            latestVersion = update?.latestVersion;
            sourceUrl = update?.sourceUrl;
        }

        vscode.postMessage({
            type: 'showContextMenu',
            packageId,
            installedVersion: installed?.resolvedVersion || installed?.version,
            latestVersion,
            sourceUrl,
            versionType: installed?.versionType,
            context,
            projectPath: projectPath || selectedProjectRef.current,
            installedProjects
        });
    }, []);

    const handleUpdateAll = useCallback(() => {
        if (!selectedProjectRef.current) { return; }

        if (isAllProjectsRef.current) {
            const projectUpdatesPayload = allProjectsUpdatesRef.current.map(pu => ({
                projectPath: pu.projectPath,
                projectName: pu.projectName,
                packages: pu.updates.map(u => ({ id: u.id, version: u.latestVersion, sourceUrl: u.sourceUrl }))
            }));
            vscode.postMessage({
                type: 'bulkUpdateAllProjects',
                projectUpdates: projectUpdatesPayload
            });
        } else {
            let packages = packageUpdatesRef.current.map(u => ({ id: u.id, version: u.latestVersion, sourceUrl: u.sourceUrl }));
            if (packages.length === 0) {
                const projectUpdate = allProjectsUpdatesRef.current.find(
                    pu => pu.projectPath === selectedProjectRef.current
                );
                if (projectUpdate) {
                    packages = projectUpdate.updates.map(u => ({ id: u.id, version: u.latestVersion, sourceUrl: u.sourceUrl }));
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
                const projectNames = packageProjectsMap.get(pkg.id.toLowerCase());
                const tooltip = installed && projectNames?.length
                    ? `Uninstall from: ${projectNames.join(', ')}`
                    : undefined;
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
                        actionTooltip={tooltip}
                    />
                );
            })}
        </div>
    );

    const renderInstalledList = () => (
        <div className="section-content">
            {/* Single project installed */}
            {!isAllProjects && (
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
            {isAllProjects && (
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
                            const sorted = [...filtered].sort((a, b) => a.id.localeCompare(b.id));
                            const isCollapsed = collapsedInstalledProjects.has(pi.projectPath);
                            return (
                                <div key={pi.projectPath} role="treeitem" aria-expanded={!isCollapsed}>
                                    <div
                                        className="project-group-header"
                                        title={pi.projectPath}
                                        onClick={() => toggleInstalledProjectCollapse(pi.projectPath)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                toggleInstalledProjectCollapse(pi.projectPath);
                                            }
                                        }}
                                        role="button"
                                        tabIndex={0}
                                        aria-expanded={!isCollapsed}
                                    >
                                        <span className={`project-group-chevron${isCollapsed ? '' : ' expanded'}`}>
                                            <ChevronRightIcon size={16} />
                                        </span>
                                        <span className="project-group-name">{pi.projectName}</span>
                                        {isCollapsed && <span className="project-group-count">{sorted.length}</span>}
                                    </div>
                                    {!isCollapsed && sorted.map((pkg) => (
                                        <PackageRow
                                            key={`${pi.projectPath}::${pkg.id}`}
                                            packageId={pkg.id}
                                            version={pkg.version}
                                            installedVersion={pkg.resolvedVersion || pkg.version}
                                            context="installed"
                                            selected={selectedPackageId === `${pi.projectPath}::${pkg.id}`}
                                            onPrimaryAction={(id) => {
                                                vscode.postMessage({
                                                    type: 'removePackage',
                                                    projectPath: pi.projectPath,
                                                    packageId: id
                                                });
                                            }}
                                            onContextMenu={(id, e) => handleContextMenu(id, e, 'installed', pi.projectPath)}
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
            {!isAllProjects && (
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
            {isAllProjects && (
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
                        .map((pu) => {
                            const isCollapsed = collapsedUpdatesProjects.has(pu.projectPath);
                            const sortedUpdates = [...pu.updates].sort((a, b) => a.id.localeCompare(b.id));
                            return (
                                <div key={pu.projectPath} role="treeitem" aria-expanded={!isCollapsed}>
                                    <div
                                        className="project-group-header"
                                        title={pu.projectPath}
                                        onClick={() => toggleUpdatesProjectCollapse(pu.projectPath)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                toggleUpdatesProjectCollapse(pu.projectPath);
                                            }
                                        }}
                                        role="button"
                                        tabIndex={0}
                                        aria-expanded={!isCollapsed}
                                    >
                                        <span className={`project-group-chevron${isCollapsed ? '' : ' expanded'}`}>
                                            <ChevronRightIcon size={16} />
                                        </span>
                                        <span className="project-group-name">{pu.projectName}</span>
                                        {isCollapsed && <span className="project-group-count">{pu.updates.length}</span>}
                                    </div>
                                    {!isCollapsed && sortedUpdates.map((pkg) => (
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
                            );
                        })}
                </div>
            )}
        </div>
    );

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="sidebar-app">
            {/* VS Code-style indeterminate progress bar — above search, at top of view */}
            <div className={`sidebar-progress-container${loadingSearch || loadingInstalled || loadingUpdates || loadingAllUpdates || loadingAllInstalled ? ' active' : ''}`}
                role="progressbar" aria-label="Searching">
                <div className="progress-bit" />
            </div>
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
                    <button
                        className={`sidebar-search-clear${searchQuery ? '' : ' disabled'}`}
                        onClick={() => { if (!searchQuery) { return; } setSearchQuery(''); setSearchResults([]); searchInputRef.current?.focus(); }}
                        aria-label="Clear search"
                        tabIndex={-1}
                    >
                        <ClearAllIcon size={16} />
                    </button>
                    <button
                        className="sidebar-filter-btn"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            if (showFilterDropdown && filterButtonTriggered) {
                                setShowFilterDropdown(false);
                                setFilterButtonTriggered(false);
                            } else {
                                setFilterButtonTriggered(true);
                                setShowFilterDropdown(true);
                                setFilterDropdownIndex(0);
                            }
                            searchInputRef.current?.focus();
                        }}
                        aria-label="Filter"
                        title="Filter"
                        tabIndex={-1}
                    >
                        <FilterIcon size={16} />
                    </button>
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
                <div className="sidebar-sections-container">
                    {/* Installed Section */}
                    <div
                        className={`sidebar-section${!installedExpanded ? ' collapsed' : ''}`}
                        style={installedExpanded
                            ? (updatesExpanded ? { flex: `0 0 ${sectionSplit}%` } : { flex: 1 })
                            : undefined}
                    >
                        <SectionHeader
                            title="Installed"
                            expanded={installedExpanded}
                            count={isAllProjects
                                ? allProjectsInstalled.reduce((sum, pi) => sum + pi.packages.length, 0)
                                : (installedPackages.length || backgroundInstalledCount)}
                            loading={loadingInstalled || loadingAllInstalled}
                            onToggle={toggleInstalled}
                        />
                        {installedExpanded && renderInstalledList()}
                    </div>

                    {/* Draggable sash between sections (visible only when both expanded) */}
                    {installedExpanded && updatesExpanded && (
                        <MemoizedDraggableSash
                            orientation="vertical"
                            onDrag={handleSectionSashDrag}
                            onDragEnd={handleSectionSashDragEnd}
                            onReset={handleSectionSashReset}
                        />
                    )}

                    {/* Updates Section */}
                    <div
                        className={`sidebar-section${!updatesExpanded ? ' collapsed' : ''}`}
                        style={updatesExpanded
                            ? { flex: 1 }
                            : undefined}
                    >
                        <SectionHeader
                            title="Updates"
                            expanded={updatesExpanded}
                            count={totalUpdateCount}
                            loading={loadingUpdates || loadingAllUpdates}
                            onToggle={toggleUpdates}
                            actions={totalUpdateCount > 0 ? (
                                <button
                                    className="section-action-btn"
                                    onClick={handleUpdateAll}
                                    title={`Update all packages (${totalUpdateCount})`}
                                    aria-label={`Update all packages (${totalUpdateCount})`}
                                >
                                    <ArrowUpIcon size={16} />
                                </button>
                            ) : undefined}
                        />
                        {updatesExpanded && renderUpdatesList()}
                    </div>
                </div>
            )}
        </div>
    );
};

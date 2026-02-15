import { useVirtualizer } from '@tanstack/react-virtual';
import React, { forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
    type InstalledPackage,
    type NuGetSource,
    type PackageSearchResult,
    type QuickSearchSourceResult,
    type TransitivePackage,
    type VsCodeApi,
    LRUMap,
    getPackageId,
} from '../types';

export interface BrowseTabProps {
    // Active tab (for conditional effects and display)
    activeTab: 'browse' | 'installed' | 'updates';

    // Shared state (read)
    selectedPackage: PackageSearchResult | InstalledPackage | null;
    selectedVersion: string;
    detailsTab: 'details' | 'readme';

    // Configuration
    includePrerelease: boolean;
    selectedSource: string;
    enabledSources: NuGetSource[];
    selectedProject: string;
    recentSearches: string[];
    recentSearchesLimit: number;
    searchDebounceMode: 'quicksearch' | 'full' | 'off';
    splitPosition: number;
    defaultPackageIcon: string;

    // Details panel (rendered by parent, reused here)
    detailsPanelContent: React.ReactNode;

    // Shared cache
    versionsCache: React.MutableRefObject<LRUMap<string, string[]>>;

    // Selection callbacks (from usePackageSelection hook)
    onSelectPackage: (pkg: PackageSearchResult | InstalledPackage, options: { selectedVersionValue: string; metadataVersion: string; initialVersions: string[] }) => void;
    clearSelection: () => void;

    // Action callbacks
    onInstall: (id: string, version: string) => void;

    // State setters for shared state
    onSetSelectedPackage: React.Dispatch<React.SetStateAction<PackageSearchResult | InstalledPackage | null>>;
    onSetSelectedTransitivePackage: React.Dispatch<React.SetStateAction<TransitivePackage | null>>;
    onSetSelectedVersion: React.Dispatch<React.SetStateAction<string>>;
    onSetRecentSearches: React.Dispatch<React.SetStateAction<string[]>>;
    onDetailsTabChange: React.Dispatch<React.SetStateAction<'details' | 'readme'>>;
    setSplitPosition: React.Dispatch<React.SetStateAction<number>>;
    handleSashReset: () => void;
    handleSashDragEnd: (pos: number) => void;

    // Key handler factory
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

    // VS Code API
    vscode: VsCodeApi;

    // Ref for browse tab button (focus management)
    browseTabRef: React.RefObject<HTMLButtonElement | null>;

    // Component slots
    MemoizedDraggableSash: React.ComponentType<{
        onDrag: (newPosition: number) => void;
        onReset: () => void;
        onDragEnd?: (finalPosition: number) => void;
    }>;
}

export interface BrowseTabHandle {
    /** Handle a message from the extension. Returns true if the message was consumed. */
    handleMessage: (message: any) => boolean;
    /** Focus the search input (for keyboard navigation from tab button) */
    focusSearchInput: () => void;
}

const ESTIMATED_ITEM_HEIGHT = 66; // padding (12*2) + icon (32) + gaps

const BrowseTab = forwardRef<BrowseTabHandle, BrowseTabProps>(function BrowseTab(props, ref) {
    const {
        activeTab,
        selectedPackage, selectedVersion, detailsTab,
        includePrerelease, selectedSource, enabledSources, selectedProject,
        recentSearches, recentSearchesLimit, searchDebounceMode,
        splitPosition, defaultPackageIcon,
        detailsPanelContent,
        versionsCache,
        onSelectPackage, clearSelection,
        onInstall,
        onSetSelectedPackage, onSetSelectedTransitivePackage, onSetSelectedVersion,
        onSetRecentSearches, onDetailsTabChange, setSplitPosition,
        handleSashReset, handleSashDragEnd,
        createPackageListKeyHandler,
        vscode,
        browseTabRef,
        MemoizedDraggableSash,
    } = props;

    // --- Internal state ---
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PackageSearchResult[]>([]);
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const isSearchStale = searchQuery !== deferredSearchQuery;
    const [loading, setLoading] = useState(false);
    const [showSearchHistory, setShowSearchHistory] = useState(false);
    const [quickSearchSuggestions, setQuickSearchSuggestions] = useState<QuickSearchSourceResult[]>([]);
    const [showQuickSearch, setShowQuickSearch] = useState(false);
    const [quickSearchLoading, setQuickSearchLoading] = useState(false);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
    const isKeyboardNavigationRef = useRef(false);
    const [isKeyboardNavActive, setIsKeyboardNavActive] = useState(false);
    const [expandedQuickSearchIndex, setExpandedQuickSearchIndex] = useState<number | null>(null);
    const [quickSearchVersions, setQuickSearchVersions] = useState<string[]>([]);
    const [selectedQuickVersionIndex, setSelectedQuickVersionIndex] = useState(0);
    const [quickVersionsLoading, setQuickVersionsLoading] = useState(false);
    const [quickVersionsError, setQuickVersionsError] = useState<string | null>(null);

    // --- Internal refs ---
    const searchInputRef = useRef<HTMLInputElement>(null);
    const browseListRef = useRef<HTMLDivElement>(null);
    const browseScrollRef = useRef<HTMLDivElement>(null);
    const searchInputFocusedRef = useRef(false);
    const expandingQuickSearchPackageRef = useRef<{ packageId: string; sourceUrl: string } | null>(null);
    const pendingQuickInstallRef = useRef<{ packageId: string; sourceUrl: string } | null>(null);
    const skipQuickSearchRef = useRef(false);
    const quickSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fullSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recentSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSearchParamsRef = useRef<{ query: string; source: string; prerelease: boolean }>({ query: '', source: '', prerelease: false });
    // Mirror recentSearchesLimit prop in ref to avoid re-creating callbacks
    const recentSearchesLimitRef = useRef(recentSearchesLimit);
    // Mirror enabledSources prop in ref to avoid re-triggering search debounce effects
    const enabledSourcesRef = useRef(enabledSources);

    // --- Derived values ---
    const flatSuggestions = useMemo(() =>
        quickSearchSuggestions.flatMap(s => s.packageIds),
        [quickSearchSuggestions]
    );

    const browseVirtualizer = useVirtualizer({
        count: searchResults.length,
        getScrollElement: () => browseScrollRef.current,
        estimateSize: () => ESTIMATED_ITEM_HEIGHT,
        overscan: 5,
    });

    // --- Ref sync effects ---
    useEffect(() => {
        recentSearchesLimitRef.current = recentSearchesLimit;
    }, [recentSearchesLimit]);

    useEffect(() => {
        enabledSourcesRef.current = enabledSources;
    }, [enabledSources]);

    // --- Imperative handle ---
    useImperativeHandle(ref, () => ({
        handleMessage(message: any): boolean {
            switch (message.type) {
                case 'searchResults':
                    if (!message.query || message.query.trim().toLowerCase() === searchQuery.trim().toLowerCase()) {
                        setSearchResults(message.results);
                        setLoading(false);
                    }
                    return true;

                case 'autocompleteResults':
                    if (message.query && message.query.trim().toLowerCase() === searchQuery.trim().toLowerCase()) {
                        setQuickSearchSuggestions(message.groupedResults || []);
                        setQuickSearchLoading(false);
                    }
                    return true;

                case 'restoreSearchQuery':
                    if (message.query) {
                        setLoading(true);
                        vscode.postMessage({
                            type: 'searchPackages',
                            query: message.query,
                            sources: [],
                            includePrerelease: false
                        });
                    }
                    return true;

                case 'packageVersions':
                    // Check if this is for quicksearch expansion
                    if (expandingQuickSearchPackageRef.current &&
                        message.packageId.toLowerCase() === expandingQuickSearchPackageRef.current.packageId.toLowerCase()) {
                        if (message.versions && message.versions.length > 0) {
                            setQuickSearchVersions(message.versions.slice(0, 5));
                            setSelectedQuickVersionIndex(0);
                            setQuickVersionsError(null);
                            // Cache the versions
                            const cacheKey = `${message.packageId.toLowerCase()}|${expandingQuickSearchPackageRef.current.sourceUrl}|${includePrerelease}`;
                            versionsCache.current.set(cacheKey, message.versions);
                        } else {
                            setQuickVersionsError('No versions available');
                        }
                        setQuickVersionsLoading(false);
                        expandingQuickSearchPackageRef.current = null;
                        return true; // consumed
                    }
                    // Check if this is for Ctrl+Enter quick install
                    if (pendingQuickInstallRef.current &&
                        message.packageId.toLowerCase() === pendingQuickInstallRef.current.packageId.toLowerCase()) {
                        const packageId = pendingQuickInstallRef.current.packageId;
                        pendingQuickInstallRef.current = null;
                        if (message.versions && message.versions.length > 0 && selectedProject) {
                            const latestVersion = message.versions[0];
                            setShowQuickSearch(false);
                            setQuickSearchSuggestions([]);
                            setQuickSearchLoading(false);
                            setSelectedSuggestionIndex(-1);
                            if (recentSearchesLimitRef.current > 0) {
                                onSetRecentSearches(prev => {
                                    const filtered = prev.filter(s => s.toLowerCase() !== packageId.toLowerCase());
                                    return [packageId, ...filtered].slice(0, recentSearchesLimitRef.current);
                                });
                            }
                            vscode.postMessage({
                                type: 'installPackage',
                                projectPath: selectedProject,
                                packageId: packageId,
                                version: latestVersion
                            });
                        }
                        return true; // consumed
                    }
                    return false; // not consumed — let parent handle shared version update

                default:
                    return false;
            }
        },
        focusSearchInput() {
            searchInputRef.current?.focus();
        },
    }));

    // --- Clear quick search when leaving browse tab ---
    useEffect(() => {
        if (activeTab !== 'browse') {
            setShowQuickSearch(false);
            setQuickSearchSuggestions([]);
            setQuickSearchLoading(false);
        }
    }, [activeTab]);

    // --- Reset selection when suggestions become empty ---
    useEffect(() => {
        if (quickSearchSuggestions.length === 0) {
            setSelectedSuggestionIndex(-1);
        }
    }, [quickSearchSuggestions]);

    // --- Quick search (autocomplete) debounce - 150ms ---
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

        if (activeTab === 'browse' && deferredSearchQuery.trim().length >= 2 && searchInputFocusedRef.current) {
            if (quickSearchTimeoutRef.current) {
                clearTimeout(quickSearchTimeoutRef.current);
            }

            setShowSearchHistory(false);
            setShowQuickSearch(true);
            setQuickSearchLoading(true);

            quickSearchTimeoutRef.current = setTimeout(() => {
                const sourcesToSearch = selectedSource === 'all'
                    ? enabledSourcesRef.current.map(s => ({ name: s.name, url: s.url }))
                    : enabledSourcesRef.current
                        .filter(s => s.url === selectedSource)
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
    }, [activeTab, deferredSearchQuery, selectedSource, includePrerelease, searchDebounceMode]);

    // --- Full search debounce - 300ms ---
    useEffect(() => {
        if (searchDebounceMode !== 'full') {
            return;
        }

        if (activeTab === 'browse' && searchQuery.trim().length >= 2) {
            if (fullSearchTimeoutRef.current) {
                clearTimeout(fullSearchTimeoutRef.current);
            }

            fullSearchTimeoutRef.current = setTimeout(() => {
                const sourcesToSearch = selectedSource === 'all'
                    ? enabledSourcesRef.current.map(s => s.url)
                    : [selectedSource];

                setLoading(true);
                setSearchResults([]);
                onSetSelectedPackage(null);

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
    }, [activeTab, searchQuery, selectedSource, includePrerelease, searchDebounceMode]);

    // --- Recent search tracking ---
    useEffect(() => {
        if (activeTab === 'browse' && searchQuery) {
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
                        onSetRecentSearches(prev => {
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
    }, [activeTab, searchQuery, selectedSource, includePrerelease, searchDebounceMode]);

    // --- Callbacks ---

    const handleSearch = useCallback((addToRecent: boolean = false) => {
        if (searchQuery.trim()) {
            setLoading(true);
            onSetSelectedPackage(null);
            onSetSelectedTransitivePackage(null);
            setShowSearchHistory(false);
            setShowQuickSearch(false);
            setQuickSearchSuggestions([]);
            if (addToRecent && recentSearchesLimitRef.current > 0) {
                const trimmedQuery = searchQuery.trim();
                onSetRecentSearches(prev => {
                    const filtered = prev.filter(s => s.toLowerCase() !== trimmedQuery.toLowerCase());
                    return [trimmedQuery, ...filtered].slice(0, recentSearchesLimitRef.current);
                });
            }
            const sourcesToSearch = selectedSource === 'all'
                ? enabledSources.map(s => s.url)
                : [selectedSource];
            vscode.postMessage({
                type: 'searchPackages',
                query: searchQuery,
                sources: sourcesToSearch,
                includePrerelease: includePrerelease
            });
        }
    }, [searchQuery, selectedSource, enabledSources, includePrerelease]);

    const selectQuickSearchItem = useCallback((packageId: string) => {
        skipQuickSearchRef.current = true;
        setSearchQuery(packageId);
        setShowQuickSearch(false);
        setQuickSearchSuggestions([]);
        setQuickSearchLoading(false);
        setSelectedSuggestionIndex(-1);
        setLoading(true);
        onSetSelectedPackage(null);
        onSetSelectedTransitivePackage(null);
        const sourcesToSearch = selectedSource === 'all'
            ? enabledSources.map(s => s.url)
            : [selectedSource];
        vscode.postMessage({
            type: 'searchPackages',
            query: packageId,
            sources: sourcesToSearch,
            includePrerelease: includePrerelease
        });
        if (recentSearchesLimitRef.current > 0) {
            onSetRecentSearches(prev => {
                const filtered = prev.filter(s => s.toLowerCase() !== packageId.toLowerCase());
                return [packageId, ...filtered].slice(0, recentSearchesLimitRef.current);
            });
        }
    }, [selectedSource, enabledSources, includePrerelease]);

    const getSourceForFlatIndex = useCallback((flatIndex: number): string => {
        let currentIndex = 0;
        for (const sourceResult of quickSearchSuggestions) {
            if (flatIndex < currentIndex + sourceResult.packageIds.length) {
                return sourceResult.sourceUrl;
            }
            currentIndex += sourceResult.packageIds.length;
        }
        return selectedSource === 'all' ? '' : selectedSource;
    }, [quickSearchSuggestions, selectedSource]);

    const expandQuickSearchItem = useCallback((flatIndex: number, packageId: string) => {
        const sourceUrl = getSourceForFlatIndex(flatIndex);
        const cacheKey = `${packageId.toLowerCase()}|${sourceUrl}|${includePrerelease}`;
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
            includePrerelease: includePrerelease,
            take: 5
        });
    }, [getSourceForFlatIndex, includePrerelease]);

    const collapseQuickSearchVersions = useCallback(() => {
        setExpandedQuickSearchIndex(null);
        setQuickSearchVersions([]);
        setSelectedQuickVersionIndex(0);
        setQuickVersionsLoading(false);
        setQuickVersionsError(null);
        expandingQuickSearchPackageRef.current = null;
    }, []);

    const installFromQuickSearch = useCallback((packageId: string, version: string) => {
        if (!selectedProject) { return; }
        setShowQuickSearch(false);
        setQuickSearchSuggestions([]);
        setQuickSearchLoading(false);
        setSelectedSuggestionIndex(-1);
        collapseQuickSearchVersions();

        if (recentSearchesLimitRef.current > 0) {
            onSetRecentSearches(prev => {
                const filtered = prev.filter(s => s.toLowerCase() !== packageId.toLowerCase());
                return [packageId, ...filtered].slice(0, recentSearchesLimitRef.current);
            });
        }

        vscode.postMessage({
            type: 'installPackage',
            projectPath: selectedProject,
            packageId,
            version
        });
    }, [selectedProject, collapseQuickSearchVersions]);

    const selectRecentSearchItem = useCallback((search: string) => {
        skipQuickSearchRef.current = true;
        setSearchQuery(search);
        setShowSearchHistory(false);
        setShowQuickSearch(false);
        setSelectedSuggestionIndex(-1);
        setLoading(true);
        onSetSelectedPackage(null);
        onSetSelectedTransitivePackage(null);
        const sourcesToSearch = selectedSource === 'all'
            ? enabledSources.map(s => s.url)
            : [selectedSource];
        vscode.postMessage({
            type: 'searchPackages',
            query: search,
            sources: sourcesToSearch,
            includePrerelease: includePrerelease
        });
    }, [selectedSource, enabledSources, includePrerelease]);

    // --- Render ---
    return (
        <div className="content browse-content" style={{ display: activeTab === 'browse' ? undefined : 'none' }}>
            <div className="search-bar" role="search">
                <div className="search-input-wrapper">
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search packages..."
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
                        }}
                        onKeyDown={(e) => {
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

                                    const cacheKey = `${packageId.toLowerCase()}|${sourceUrl}|${includePrerelease}`;
                                    const cached = versionsCache.current.get(cacheKey);
                                    if (cached && cached.length > 0 && selectedProject) {
                                        const latestVersion = cached[0];
                                        setShowQuickSearch(false);
                                        setQuickSearchSuggestions([]);
                                        setQuickSearchLoading(false);
                                        setSelectedSuggestionIndex(-1);
                                        if (recentSearchesLimitRef.current > 0) {
                                            onSetRecentSearches(prev => {
                                                const filtered = prev.filter(s => s.toLowerCase() !== packageId.toLowerCase());
                                                return [packageId, ...filtered].slice(0, recentSearchesLimitRef.current);
                                            });
                                        }
                                        vscode.postMessage({
                                            type: 'installPackage',
                                            projectPath: selectedProject,
                                            packageId: packageId,
                                            version: latestVersion
                                        });
                                    } else {
                                        pendingQuickInstallRef.current = { packageId, sourceUrl };
                                        vscode.postMessage({
                                            type: 'getPackageVersions',
                                            packageId,
                                            source: sourceUrl || undefined,
                                            includePrerelease: includePrerelease,
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
                                } else {
                                    handleSearch(true);
                                }
                            } else if (e.key === 'Escape') {
                                setShowSearchHistory(false);
                                setShowQuickSearch(false);
                                setSelectedSuggestionIndex(-1);
                            }

                            // Navigation to/from search box when no dropdown is visible
                            const noDropdownVisible = !showSearchHistory && !showQuickSearch;
                            if (noDropdownVisible && e.key === 'ArrowUp') {
                                e.preventDefault();
                                browseTabRef.current?.focus();
                            } else if (noDropdownVisible && e.key === 'ArrowDown' && searchResults.length > 0) {
                                e.preventDefault();
                                browseListRef.current?.focus({ preventScroll: true });
                                if (!selectedPackage || !searchResults.find(p => getPackageId(p) === getPackageId(selectedPackage))) {
                                    const firstPkg = searchResults[0];
                                    onSetSelectedPackage(firstPkg);
                                    onSetSelectedTransitivePackage(null);
                                    onSetSelectedVersion(firstPkg.version);
                                    onDetailsTabChange('details');
                                }
                            }
                        }}
                        onFocus={() => {
                            searchInputFocusedRef.current = true;
                            if (!searchQuery.trim() && recentSearchesLimit > 0) {
                                setShowSearchHistory(true);
                                setSelectedSuggestionIndex(-1);
                            }
                        }}
                        onBlur={() => {
                            searchInputFocusedRef.current = false;
                            setTimeout(() => {
                                setShowSearchHistory(false);
                                setShowQuickSearch(false);
                            }, 150);
                        }}
                        className="search-input"
                    />
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
                            {/* Version selection mode */}
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
                                            <span className="search-history-icon">⏳</span>
                                            <span className="search-history-text">Loading versions...</span>
                                        </div>
                                    ) : quickVersionsError ? (
                                        <div className="search-history-item quick-search-error">
                                            <span className="search-history-text">{quickVersionsError}. Press → to retry.</span>
                                        </div>
                                    ) : quickSearchVersions.length > 0 ? (
                                        quickSearchVersions.map((version, idx) => {
                                            const isSelected = idx === selectedQuickVersionIndex;
                                            return (
                                                <div
                                                    key={version}
                                                    className={`search-history-item quick-search-version-item${isSelected ? ' selected' : ''}`}
                                                    ref={el => {
                                                        if (isSelected && el) {
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
                                /* Package list mode */
                                quickSearchLoading && quickSearchSuggestions.length === 0 ? (
                                    <div className="search-history-item quick-search-loading">
                                        <span className="search-history-icon">⏳</span>
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
                                                    const isSelected = currentFlatIndex === selectedSuggestionIndex;
                                                    return (
                                                        <div
                                                            key={`${sourceResult.sourceUrl}-${packageId}`}
                                                            className={`search-history-item quick-search-item${isSelected ? ' selected' : ''}`}
                                                            ref={el => {
                                                                if (isSelected && el) {
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
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
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
                <button className="btn btn-primary" onClick={() => handleSearch(true)} disabled={loading}>
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </div>

            <div className="split-panel">
                <div ref={browseScrollRef} className="package-list-panel" style={{ width: `${splitPosition}%` }}>
                    {loading ? (
                        <div className="loading-spinner-container" aria-busy="true" aria-label="Searching packages">
                            <div className="loading-spinner"></div>
                            <p>Searching...</p>
                        </div>
                    ) : searchResults.length === 0 ? (
                        <p className="empty-state">
                            Search for packages above
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
                                    onSelectPackage(pkg, {
                                        selectedVersionValue: pkg.version,
                                        metadataVersion: pkg.version,
                                        initialVersions: [pkg.version],
                                    });
                                },
                                {
                                    onAction: () => onInstall(getPackageId(selectedPackage!), selectedVersion || (selectedPackage as PackageSearchResult).version),
                                    onLeftArrow: () => detailsTab === 'readme' && onDetailsTabChange('details'),
                                    onRightArrow: () => detailsTab === 'details' && onDetailsTabChange('readme'),
                                    onExitTop: () => {
                                        clearSelection();
                                        searchInputRef.current?.focus();
                                    },
                                    scrollToIndex: (i) => browseVirtualizer.scrollToIndex(i, { align: 'auto' })
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
                                            onSelectPackage(pkg, {
                                                selectedVersionValue: pkg.version,
                                                metadataVersion: pkg.version,
                                                initialVersions: [pkg.version],
                                            });
                                        }}
                                    >
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
                                                <span className="package-version">v{pkg.version}</span>
                                                {pkg.totalDownloads && (
                                                    <span className="package-downloads">
                                                        ⬇ {pkg.totalDownloads.toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="package-authors">
                                                {pkg.verified && (
                                                    <span className="verified-badge" title="The ID prefix of this package has been reserved by its owner on nuget.org">✓</span>
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
                    {detailsPanelContent}
                </div>
            </div>
        </div>
    );
});

export const MemoizedBrowseTab = React.memo(BrowseTab);

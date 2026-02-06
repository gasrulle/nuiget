import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import fsharp from 'highlight.js/lib/languages/fsharp';
import ini from 'highlight.js/lib/languages/ini';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import './App.css';
import { usePackageSelection } from './hooks/usePackageSelection';

// Register highlight.js languages
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('fsharp', fsharp);
hljs.registerLanguage('fs', fsharp);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('ps1', powershell);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('css', css);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('docker', dockerfile);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('toml', ini);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('text', plaintext);

// Configure marked with syntax highlighting
marked.use(
    markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            // ignoreIllegals: true prevents exceptions on malformed code in README content
            return hljs.highlight(code, { language, ignoreIllegals: true }).value;
        }
    })
);

// Get the default package icon URL from the root element data attribute
const defaultPackageIcon = document.getElementById('root')?.dataset.packageIcon || '';
// Get initial tab from HTML (set when opened from context menu)
const htmlInitialTab = document.getElementById('root')?.dataset.initialTab as 'browse' | 'installed' | 'updates' | '' | undefined;

// Decode HTML entities (e.g., &lt; &gt; &amp;) in package descriptions
function decodeHtmlEntities(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

// DraggableSash component for resizable split panels
interface DraggableSashProps {
    onDrag: (newPosition: number) => void;
    onReset: () => void;
    onDragEnd?: (finalPosition: number) => void;
}

function DraggableSash({ onDrag, onReset, onDragEnd }: DraggableSashProps) {
    const sashRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    // Track cleanup function for document event listeners
    const cleanupRef = useRef<(() => void) | null>(null);

    // Cleanup on unmount to prevent event listener leaks
    useEffect(() => {
        return () => {
            // If unmounted during drag, clean up document listeners
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
        };
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const container = sashRef.current?.parentElement;
            if (!container) {
                return;
            }

            const containerRect = container.getBoundingClientRect();
            const newPosition = ((moveEvent.clientX - containerRect.left) / containerRect.width) * 100;
            // Clamp to 20-80% range
            const clampedPosition = Math.max(20, Math.min(80, newPosition));
            onDrag(clampedPosition);
            // Store last position for onDragEnd
            (handleMouseMove as any).lastPosition = clampedPosition;
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            // Call onDragEnd with final position if provided
            if (onDragEnd && (handleMouseMove as any).lastPosition !== undefined) {
                onDragEnd((handleMouseMove as any).lastPosition);
            }
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            cleanupRef.current = null;
        };

        // Store cleanup function for potential unmount during drag
        cleanupRef.current = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [onDrag]);

    return (
        <div
            ref={sashRef}
            className={`sash${isDragging ? ' dragging' : ''}`}
            onMouseDown={handleMouseDown}
            onDoubleClick={onReset}
            title="Drag to resize. Double-click to reset."
        />
    );
}

// Language display names for code block labels
const languageDisplayNames: Record<string, string> = {
    'csharp': 'C#',
    'cs': 'C#',
    'fsharp': 'F#',
    'fs': 'F#',
    'xml': 'XML',
    'html': 'HTML',
    'json': 'JSON',
    'bash': 'Bash',
    'shell': 'Shell',
    'powershell': 'PowerShell',
    'ps1': 'PowerShell',
    'sql': 'SQL',
    'yaml': 'YAML',
    'yml': 'YAML',
    'plaintext': 'Text',
    'text': 'Text',
    'javascript': 'JavaScript',
    'js': 'JavaScript',
    'typescript': 'TypeScript',
    'ts': 'TypeScript',
    'css': 'CSS',
    'dockerfile': 'Dockerfile',
    'docker': 'Docker',
    'markdown': 'Markdown',
    'md': 'Markdown',
    'ini': 'INI',
    'toml': 'TOML'
};

// Custom renderer to add unified header button with copy icon and language label to code blocks
const renderer = new marked.Renderer();
const originalCodeRenderer = renderer.code.bind(renderer);

// GitHub Octicon SVGs (MIT licensed)
const COPY_ICON_SVG = `<svg class="copy-icon" aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>`;
const CHECK_ICON_SVG = `<svg class="check-icon" aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>`;

renderer.code = function (code: { text: string; lang?: string; escaped?: boolean; type?: string; raw?: string }) {
    const lang = code.lang || '';
    const displayLang = languageDisplayNames[lang.toLowerCase()] || lang.toUpperCase() || 'Code';
    const html = originalCodeRenderer(code as Parameters<typeof originalCodeRenderer>[0]);

    // Unified header button with copy/check icons and language label
    const headerBtn = `<button class="code-header-btn" title="Copy to clipboard" aria-label="Copy ${displayLang} code to clipboard">${COPY_ICON_SVG}${CHECK_ICON_SVG}<span class="code-lang-label">${displayLang}</span></button>`;
    return `<div class="code-block-wrapper">${headerBtn}${html}</div>`;
};

marked.use({ renderer });

// Configure marked for safe rendering
marked.setOptions({
    breaks: true,
    gfm: true
});

// Known domains that support HTTPS - upgrade http:// to https:// for these
const httpsUpgradeDomains = [
    'img.shields.io',
    'shields.io',
    'github.com',
    'raw.githubusercontent.com',
    'user-images.githubusercontent.com',
    'avatars.githubusercontent.com',
    'camo.githubusercontent.com',
    'badge.fury.io',
    'travis-ci.org',
    'travis-ci.com',
    'ci.appveyor.com',
    'codecov.io',
    'coveralls.io',
    'david-dm.org',
    'snyk.io',
    'api.codacy.com',
    'sonarcloud.io',
    'img.badgesize.io',
    'badgen.net',
    'flat.badgen.net'
];

/**
 * Upgrade http:// URLs to https:// for known-safe domains
 * This fixes broken images in READMEs that use http:// for domains that support https://
 */
function upgradeHttpToHttps(markdown: string): string {
    const pattern = new RegExp(
        `http://(?:www\\.)?(${httpsUpgradeDomains.map(d => d.replace(/\./g, '\\.')).join('|')})`,
        'gi'
    );
    return markdown.replace(pattern, 'https://$1');
}

/**
 * LRU (Least Recently Used) Map with maximum size limit.
 * Automatically evicts oldest entries when capacity is reached.
 * Uses Map's insertion order (ES6+ guarantees iteration order = insertion order).
 */
class LRUMap<K, V> {
    private map: Map<K, V>;
    private readonly maxSize: number;

    constructor(maxSize: number = 100) {
        this.map = new Map();
        this.maxSize = maxSize;
    }

    get(key: K): V | undefined {
        const value = this.map.get(key);
        if (value !== undefined) {
            // Move to end (most recently used) by re-inserting
            this.map.delete(key);
            this.map.set(key, value);
        }
        return value;
    }

    set(key: K, value: V): void {
        // If key exists, delete it first to update insertion order
        if (this.map.has(key)) {
            this.map.delete(key);
        }
        // Evict oldest entries if at capacity
        while (this.map.size >= this.maxSize) {
            const oldestKey = this.map.keys().next().value;
            if (oldestKey !== undefined) {
                this.map.delete(oldestKey);
            }
        }
        this.map.set(key, value);
    }

    has(key: K): boolean {
        return this.map.has(key);
    }

    clear(): void {
        this.map.clear();
    }

    get size(): number {
        return this.map.size;
    }
}

interface Project {
    name: string;
    path: string;
}

/**
 * Version specification types for NuGet packages
 */
type VersionType = 'floating' | 'range' | 'exact' | 'standard';

interface InstalledPackage {
    id: string;
    /** The version as specified in the csproj (may be floating like "10.*" or range like "[1.0,2.0)") */
    version: string;
    /** The actual resolved version from lock file (e.g., "10.2.0") */
    resolvedVersion?: string;
    /** Type of version specification */
    versionType?: VersionType;
    /** For floating versions: the prefix (e.g., "10" from "10.*") */
    floatingPrefix?: string;
    /** For pure wildcards (*) that always get the latest version */
    isAlwaysLatest?: boolean;
    /** Implicit/transitive packages that cannot be uninstalled */
    isImplicit?: boolean;
    iconUrl?: string;
    verified?: boolean;
    authors?: string;
}

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

/**
 * Result from grouped quick search - one entry per source
 */
interface QuickSearchSourceResult {
    sourceName: string;
    sourceUrl: string;
    packageIds: string[];
}

interface NuGetSource {
    name: string;
    url: string;
    enabled: boolean;
    configFile?: string;
}

interface FailedSource {
    url: string;
    error: string;
}

interface PackageDependency {
    id: string;
    versionRange: string;
}

interface PackageDependencyGroup {
    targetFramework: string;
    dependencies: PackageDependency[];
}

interface PackageMetadata {
    id: string;
    version: string;
    description: string;
    authors: string;
    license?: string;
    licenseUrl?: string;
    projectUrl?: string;
    totalDownloads?: number;
    published?: string;
    dependencies: PackageDependencyGroup[];
    readme?: string;
}

interface PackageUpdate {
    id: string;
    installedVersion: string;
    latestVersion: string;
    iconUrl?: string;
    verified?: boolean;
    authors?: string;
}

interface TransitivePackage {
    id: string;
    version: string;
    /** Chain of packages that require this package (up to 5 levels) */
    requiredByChain: string[];
    /** Full chain for tooltip if truncated */
    fullChain?: string[];
    iconUrl?: string;
    verified?: boolean;
    authors?: string;
}

interface TransitiveFrameworkSection {
    targetFramework: string;
    packages: TransitivePackage[];
    /** Whether metadata (icons, verified, authors) has been loaded */
    metadataLoaded?: boolean;
}

interface AppState {
    selectedProject: string;
    selectedSource: string;
    activeTab: 'browse' | 'installed' | 'updates';
    searchQuery: string;
    includePrerelease: boolean;
    recentSearches: string[];
}

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
    const [searchResults, setSearchResults] = useState<PackageSearchResult[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    // React 19: Deferred search query for non-blocking UI during search operations
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const isSearchStale = searchQuery !== deferredSearchQuery;
    const [sources, setSources] = useState<NuGetSource[]>([]);
    const [failedSources, setFailedSources] = useState<FailedSource[]>([]);
    const [selectedSource, setSelectedSource] = useState<string>(savedState?.selectedSource || '');
    const [activeTab, setActiveTab] = useState<'browse' | 'installed' | 'updates'>(htmlInitialTab || savedState?.activeTab || 'browse');
    // React 19: Transition for tab switching to keep UI responsive
    const [isTabPending, startTabTransition] = useTransition();
    const [loading, setLoading] = useState(false);
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
    const [showSearchHistory, setShowSearchHistory] = useState(false);
    // Quick search (autocomplete) state - grouped by source
    const [quickSearchSuggestions, setQuickSearchSuggestions] = useState<QuickSearchSourceResult[]>([]);
    const [showQuickSearch, setShowQuickSearch] = useState(false);
    const [quickSearchLoading, setQuickSearchLoading] = useState(false);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
    // Track if selection was made by keyboard (vs mouse hover) - only keyboard selection affects Enter
    const isKeyboardNavigationRef = useRef(false);
    // State to track keyboard navigation for CSS class (suppresses :hover when keyboard is active)
    const [isKeyboardNavActive, setIsKeyboardNavActive] = useState(false);
    // Quick search version expansion state (for direct install from quicksearch)
    const [expandedQuickSearchIndex, setExpandedQuickSearchIndex] = useState<number | null>(null);
    const [quickSearchVersions, setQuickSearchVersions] = useState<string[]>([]);
    const [selectedQuickVersionIndex, setSelectedQuickVersionIndex] = useState(0);
    const [quickVersionsLoading, setQuickVersionsLoading] = useState(false);
    const [quickVersionsError, setQuickVersionsError] = useState<string | null>(null);
    // Track if search input is focused to prevent spurious quick search on tab switch
    const searchInputFocusedRef = useRef(false);
    // Search debounce settings from extension
    const [searchDebounceMode, setSearchDebounceMode] = useState<'quicksearch' | 'full' | 'off'>('quicksearch');
    const [recentSearchesLimit, setRecentSearchesLimit] = useState<number>(5);
    const recentSearchesLimitRef = useRef<number>(5);
    const [packagesWithUpdates, setPackagesWithUpdates] = useState<PackageUpdate[]>([]);
    const [updateCount, setUpdateCount] = useState<number>(0);
    const [loadingUpdates, setLoadingUpdates] = useState(false);
    const [loadingReadme, setLoadingReadme] = useState(false);
    const [readmeAttempted, setReadmeAttempted] = useState(false);
    const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(new Set());
    const [updatingAll, setUpdatingAll] = useState(false);
    const [selectedUninstalls, setSelectedUninstalls] = useState<Set<string>>(new Set());
    const [uninstallingAll, setUninstallingAll] = useState(false);
    const [showSourceSettings, setShowSourceSettings] = useState(false);
    const [togglingSource, setTogglingSource] = useState<string | null>(null);
    const [showAddSourcePanel, setShowAddSourcePanel] = useState(false);
    const [configFiles, setConfigFiles] = useState<{ label: string; path: string }[]>([]);
    const [selectedConfigFile, setSelectedConfigFile] = useState<string>('');
    const [addSourceUrl, setAddSourceUrl] = useState('');
    const [addSourceName, setAddSourceName] = useState('');
    const [addSourceUsername, setAddSourceUsername] = useState('');
    const [addSourcePassword, setAddSourcePassword] = useState('');
    const [storeEncrypted, setStoreEncrypted] = useState(true);
    const [isWindows, setIsWindows] = useState(true);
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
    const [addSourceError, setAddSourceError] = useState<string | null>(null);
    const [addingSource, setAddingSource] = useState(false);
    const [removingSource, setRemovingSource] = useState<string | null>(null);
    const [confirmRemoveSource, setConfirmRemoveSource] = useState<{ name: string; configFile?: string } | null>(null);

    // Split panel position state (35% default, range 20-80%)
    const [splitPosition, setSplitPosition] = useState(35);

    // Transitive packages section state (multi-framework support)
    const [transitiveFrameworks, setTransitiveFrameworks] = useState<TransitiveFrameworkSection[]>([]);
    const [transitiveExpandedFrameworks, setTransitiveExpandedFrameworks] = useState<Set<string>>(new Set());
    const [transitiveLoadingMetadata, setTransitiveLoadingMetadata] = useState<Set<string>>(new Set());
    const [loadingTransitive, setLoadingTransitive] = useState(false);
    const [transitiveDataSourceAvailable, setTransitiveDataSourceAvailable] = useState<boolean | null>(null);
    const [restoringProject, setRestoringProject] = useState(false);
    const [selectedTransitivePackage, setSelectedTransitivePackage] = useState<TransitivePackage | null>(null);

    // Direct packages section state (default expanded)
    const [directPackagesExpanded, setDirectPackagesExpanded] = useState(true);

    // Track if settings have been loaded from extension
    const settingsLoadedRef = useRef(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);

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
    useEffect(() => {
        includePrereleaseRef.current = includePrerelease;
    }, [includePrerelease]);

    // Keep recentSearchesLimit ref in sync with state
    useEffect(() => {
        recentSearchesLimitRef.current = recentSearchesLimit;
    }, [recentSearchesLimit]);

    // Use ref to track latest searchQuery for message handler
    const searchQueryRef = useRef(searchQuery);
    useEffect(() => {
        searchQueryRef.current = searchQuery;
    }, [searchQuery]);

    // Track if installed tab has been visited (to skip refetch on first visit, use prefetched data)
    // NOTE: Currently does not reset when installedPackages changes. If dependent functionality changes
    // and stale data becomes an issue after install/uninstall, consider resetting this ref on installedPackages change.
    const hasVisitedInstalledTabRef = useRef(false);

    // Frontend cache for package versions to avoid "Loading" flash on re-selection
    // Key: "packageId|source|prerelease" -> versions array
    // Uses LRU eviction to prevent unbounded memory growth (max 200 entries)
    const versionsCache = useRef<LRUMap<string, string[]>>(new LRUMap(200));

    // Track which package is being expanded in quicksearch for version selection
    const expandingQuickSearchPackageRef = useRef<{ packageId: string; sourceUrl: string } | null>(null);
    // Pending quick install: when Ctrl+Enter is pressed, we request versions and then install the latest
    const pendingQuickInstallRef = useRef<{ packageId: string; sourceUrl: string } | null>(null);

    // Frontend cache for package metadata to avoid "Loading" flash on re-selection
    // Key: "packageId@version|source" -> metadata object
    // Uses LRU eviction to prevent unbounded memory growth (max 100 entries)
    const metadataCache = useRef<LRUMap<string, PackageMetadata>>(new LRUMap(100));

    // Refs for package list divs to enable focus from tab buttons
    const browseListRef = useRef<HTMLDivElement>(null);
    const installedListRef = useRef<HTMLDivElement>(null);
    const updatesListRef = useRef<HTMLDivElement>(null);

    // Ref for search input to enable focus from tab button navigation
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Refs for tab buttons to enable focus transfer when switching tabs
    const browseTabRef = useRef<HTMLButtonElement>(null);
    const installedTabRef = useRef<HTMLButtonElement>(null);
    const updatesTabRef = useRef<HTMLButtonElement>(null);

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

        // Helper to sort projects (same logic as sortedProjects memo)
        const getSortedProjects = (projectList: Project[]) => {
            const isTestProject = (name: string) => /test/i.test(name);
            return [...projectList].sort((a, b) => {
                const aIsTest = isTestProject(a.name);
                const bIsTest = isTestProject(b.name);
                if (aIsTest && !bIsTest) { return 1; }
                if (!aIsTest && bIsTest) { return -1; }
                return a.name.localeCompare(b.name);
            });
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
                if (message.projectPath === selectedProjectRef.current) {
                    const frameworks = message.frameworks || [];
                    setTransitiveFrameworks(frameworks);
                    setTransitiveDataSourceAvailable(message.dataSourceAvailable);
                    setLoadingTransitive(false);
                    // Sections stay collapsed - user expands manually, metadata loads on expand
                }
                break;
            case 'transitiveMetadata':
                if (message.projectPath === selectedProjectRef.current) {
                    // Update packages with metadata for the specific framework
                    setTransitiveFrameworks(prev => prev.map(f =>
                        f.targetFramework === message.targetFramework
                            ? { ...f, packages: message.packages, metadataLoaded: true }
                            : f
                    ));
                    setTransitiveLoadingMetadata(prev => {
                        const next = new Set(prev);
                        next.delete(message.targetFramework);
                        return next;
                    });
                }
                break;
            case 'restoreProjectResult':
                if (message.projectPath === selectedProjectRef.current) {
                    setRestoringProject(false);
                    if (message.success) {
                        // Auto-refresh transitive packages after restore
                        setLoadingTransitive(true);
                        vscode.postMessage({
                            type: 'getTransitivePackages',
                            projectPath: selectedProjectRef.current
                        });
                    }
                }
                break;
            case 'searchResults':
                // Only update if this is for the current search query
                if (!message.query || message.query.trim().toLowerCase() === searchQueryRef.current.trim().toLowerCase()) {
                    setSearchResults(message.results);
                    setLoading(false);
                }
                break;
            case 'autocompleteResults':
                // Only update if this is for the current search query
                if (message.query && message.query.trim().toLowerCase() === searchQueryRef.current.trim().toLowerCase()) {
                    setQuickSearchSuggestions(message.groupedResults || []);
                    setQuickSearchLoading(false);
                }
                break;
            case 'restoreSearchQuery':
                // Trigger fresh search when panel reopens, but keep search box empty
                if (message.query) {
                    setLoading(true);
                    // Trigger search with all sources
                    vscode.postMessage({
                        type: 'searchPackages',
                        query: message.query,
                        sources: [],
                        includePrerelease: false
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
                    const removedSource = sources.find(s => s.name === message.removedSourceName);
                    if (removedSource && selectedSourceRef.current === removedSource.url) {
                        setSelectedSource('all');
                    }
                    setRemovingSource(null);
                    setConfirmRemoveSource(null);
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
                setAddingSource(false);
                if (message.success) {
                    // Clear form and close panel
                    setAddSourceUrl('');
                    setAddSourceName('');
                    setAddSourceUsername('');
                    setAddSourcePassword('');
                    setStoreEncrypted(isWindows);
                    setAddSourceError(null);
                    setShowAdvancedOptions(false);
                    setShowAddSourcePanel(false);
                } else {
                    setAddSourceError(message.error || 'Failed to add source.');
                }
                break;
            case 'installResult':
            case 'updateResult':
            case 'removeResult':
                if (message.success && message.projectPath === selectedProjectRef.current) {
                    vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                    // Clear and refetch transitive packages since dependencies may have changed
                    setTransitiveFrameworks([]);
                    setTransitiveExpandedFrameworks(new Set());
                    setTransitiveLoadingMetadata(new Set());
                    setTransitiveDataSourceAvailable(null);
                    setLoadingTransitive(true);
                    vscode.postMessage({ type: 'getTransitivePackages', projectPath: selectedProjectRef.current });
                }
                break;
            case 'bulkUpdateResult':
                setUpdatingAll(false);
                setSelectedUpdates(new Set());
                if (message.projectPath === selectedProjectRef.current) {
                    vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                    // Clear and refetch transitive packages since dependencies may have changed
                    setTransitiveFrameworks([]);
                    setTransitiveExpandedFrameworks(new Set());
                    setTransitiveLoadingMetadata(new Set());
                    setTransitiveDataSourceAvailable(null);
                    setLoadingTransitive(true);
                    vscode.postMessage({ type: 'getTransitivePackages', projectPath: selectedProjectRef.current });
                }
                break;
            case 'bulkRemoveResult':
                setUninstallingAll(false);
                setSelectedUninstalls(new Set());
                if (message.projectPath === selectedProjectRef.current) {
                    vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                    // Clear and refetch transitive packages since dependencies may have changed
                    setTransitiveFrameworks([]);
                    setTransitiveExpandedFrameworks(new Set());
                    setTransitiveLoadingMetadata(new Set());
                    setTransitiveDataSourceAvailable(null);
                    setLoadingTransitive(true);
                    vscode.postMessage({ type: 'getTransitivePackages', projectPath: selectedProjectRef.current });
                }
                break;
            case 'bulkRemoveConfirmed':
                // User confirmed the bulk remove, start the operation
                setUninstallingAll(true);
                break;
            case 'refresh':
                vscode.postMessage({ type: 'getProjects' });
                if (selectedProjectRef.current) {
                    vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProjectRef.current });
                }
                break;
            case 'packageVersions':
                // Check if this is for quicksearch expansion
                if (expandingQuickSearchPackageRef.current &&
                    message.packageId.toLowerCase() === expandingQuickSearchPackageRef.current.packageId.toLowerCase()) {
                    if (message.versions && message.versions.length > 0) {
                        setQuickSearchVersions(message.versions.slice(0, 5));
                        setSelectedQuickVersionIndex(0);
                        setQuickVersionsError(null);
                        // Cache the versions
                        const cacheKey = `${message.packageId.toLowerCase()}|${expandingQuickSearchPackageRef.current.sourceUrl}|${includePrereleaseRef.current}`;
                        versionsCache.current.set(cacheKey, message.versions);
                    } else {
                        setQuickVersionsError('No versions available');
                    }
                    setQuickVersionsLoading(false);
                    expandingQuickSearchPackageRef.current = null;
                    break;
                }
                // Check if this is for Ctrl+Enter quick install
                if (pendingQuickInstallRef.current &&
                    message.packageId.toLowerCase() === pendingQuickInstallRef.current.packageId.toLowerCase()) {
                    const packageId = pendingQuickInstallRef.current.packageId;
                    pendingQuickInstallRef.current = null;
                    if (message.versions && message.versions.length > 0 && selectedProjectRef.current) {
                        const latestVersion = message.versions[0];
                        // Close quicksearch
                        setShowQuickSearch(false);
                        setQuickSearchSuggestions([]);
                        setQuickSearchLoading(false);
                        setSelectedSuggestionIndex(-1);
                        // Add to recent searches (if feature is enabled)
                        if (recentSearchesLimitRef.current > 0) {
                            setRecentSearches(prev => {
                                const filtered = prev.filter(s => s.toLowerCase() !== packageId.toLowerCase());
                                return [packageId, ...filtered].slice(0, recentSearchesLimitRef.current);
                            });
                        }
                        // Install the package
                        vscode.postMessage({
                            type: 'installPackage',
                            projectPath: selectedProjectRef.current,
                            packageId: packageId,
                            version: latestVersion
                        });
                    }
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
                                // Installed prerelease not in list (prerelease unchecked), fall back to latest stable
                                setSelectedVersion(message.versions[0]);
                            }
                        } else {
                            // Browse/Updates tabs: auto-select latest unless user manually picked a non-latest version
                            const wasOnLatest = packageVersionsRef.current.length === 0
                                || selectedVersionRef.current === packageVersionsRef.current[0];
                            if (wasOnLatest) {
                                // User was on latest (or no prior versions) → auto-update to new latest
                                setSelectedVersion(message.versions[0]);
                            } else if (!message.versions.includes(selectedVersionRef.current)) {
                                // User's manual selection is not in the new list → fall back to latest
                                setSelectedVersion(message.versions[0]);
                            }
                            // Otherwise: user's manual selection is still valid → keep it
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
                    // Default storeEncrypted to true only on Windows
                    setStoreEncrypted(message.isWindows);
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
                        setPackageMetadata(prev => prev ? { ...prev, readme: message.readme } : prev);
                    }
                }
                break;
            case 'splitPosition':
                // Restore persisted split position (cross-workspace)
                if (message.position !== undefined) {
                    setSplitPosition(message.position);
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
            vscode.postMessage({ type: 'getInstalledPackages', projectPath: selectedProject });
            setSelectedPackage(null);
            // Reset installed tab visit tracking when project changes
            hasVisitedInstalledTabRef.current = false;
            // Reset transitive packages state when project changes
            setTransitiveFrameworks([]);
            setTransitiveExpandedFrameworks(new Set());
            setTransitiveLoadingMetadata(new Set());
            setTransitiveDataSourceAvailable(null);
            setSelectedTransitivePackage(null);
        }
    }, [selectedProject]);

    // Prefetch transitive packages in background after direct packages are loaded
    useEffect(() => {
        if (selectedProject && !loadingInstalled && installedPackages.length >= 0 && transitiveDataSourceAvailable === null && !loadingTransitive) {
            // Direct packages finished loading - now fetch transitive packages in background
            setLoadingTransitive(true);
            vscode.postMessage({
                type: 'getTransitivePackages',
                projectPath: selectedProject
            });
        }
    }, [selectedProject, loadingInstalled, installedPackages.length, transitiveDataSourceAvailable, loadingTransitive]);

    // Prefetch transitive metadata in background after framework list loads
    // This enables instant expansion of transitive sections without loading delay
    useEffect(() => {
        if (!selectedProject || transitiveFrameworks.length === 0) {
            return;
        }

        // Find frameworks that need prefetching (not loaded and not currently loading)
        const frameworksToPrefetch = transitiveFrameworks.filter(f =>
            !f.metadataLoaded && !transitiveLoadingMetadata.has(f.targetFramework)
        );

        if (frameworksToPrefetch.length === 0) {
            return;
        }

        // Mark all as loading and trigger prefetch for each framework
        const newLoadingSet = new Set(transitiveLoadingMetadata);
        for (const framework of frameworksToPrefetch) {
            newLoadingSet.add(framework.targetFramework);
        }
        setTransitiveLoadingMetadata(newLoadingSet);

        // Trigger metadata fetch for each framework (backend handles rate limiting)
        for (const framework of frameworksToPrefetch) {
            vscode.postMessage({
                type: 'getTransitiveMetadata',
                targetFramework: framework.targetFramework,
                packages: framework.packages,
                projectPath: selectedProject
            });
        }
    }, [selectedProject, transitiveFrameworks, transitiveLoadingMetadata]);

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
            vscode.postMessage({ type: 'saveSettings', selectedSource });
        }
    }, [selectedSource]);

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
            setSelectedUpdates(new Set());
            setSelectedUninstalls(new Set());
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
            setSelectedUpdates(new Set());
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

    // Reset readme attempted state when a new package is selected
    useEffect(() => {
        setReadmeAttempted(false);
    }, [selectedPackage]);

    // Lazy load README from nupkg when readme tab is clicked and no readme available
    useEffect(() => {
        if (
            detailsTab === 'readme' &&
            selectedPackage &&
            packageMetadata &&
            !packageMetadata.readme &&
            !loadingReadme &&
            !readmeAttempted
        ) {
            // Mark as attempted so we don't retry
            setReadmeAttempted(true);
            setLoadingReadme(true);
            // Request README extraction from nupkg
            vscode.postMessage({
                type: 'fetchReadmeFromPackage',
                packageId: packageMetadata.id,
                version: packageMetadata.version,
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

    // Sort projects alphabetically, with test projects at the end
    const sortedProjects = useMemo(() => {
        const isTestProject = (name: string) => /test/i.test(name);
        return [...projects].sort((a, b) => {
            const aIsTest = isTestProject(a.name);
            const bIsTest = isTestProject(b.name);
            if (aIsTest && !bIsTest) { return 1; }
            if (!aIsTest && bIsTest) { return -1; }
            return a.name.localeCompare(b.name);
        });
    }, [projects]);

    // Flatten quick search suggestions for keyboard navigation
    const flatSuggestions = useMemo(() =>
        quickSearchSuggestions.flatMap(s => s.packageIds),
        [quickSearchSuggestions]
    );

    // React 19: Memoized sorted lists to avoid inline .sort() on every render
    const sortedInstalledPackages = useMemo(() =>
        [...installedPackages].sort((a, b) => a.id.localeCompare(b.id)),
        [installedPackages]
    );
    // React 19: Deferred value for non-blocking UI during heavy list updates
    const deferredInstalledPackages = useDeferredValue(sortedInstalledPackages);
    const isInstalledStale = sortedInstalledPackages !== deferredInstalledPackages;

    const sortedPackagesWithUpdates = useMemo(() =>
        [...packagesWithUpdates].sort((a, b) => a.id.localeCompare(b.id)),
        [packagesWithUpdates]
    );
    // React 19: Deferred value for non-blocking UI during heavy list updates
    const deferredPackagesWithUpdates = useDeferredValue(sortedPackagesWithUpdates);
    const isUpdatesStale = sortedPackagesWithUpdates !== deferredPackagesWithUpdates;

    // Packages that can be uninstalled (not implicit/transitive)
    const uninstallablePackages = useMemo(() =>
        installedPackages.filter(p => !p.isImplicit),
        [installedPackages]
    );

    // Reset selection when suggestions become empty
    useEffect(() => {
        if (quickSearchSuggestions.length === 0) {
            setSelectedSuggestionIndex(-1);
        }
    }, [quickSearchSuggestions]);

    // Debounce timer refs
    const recentSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const quickSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fullSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSearchParamsRef = useRef<{ query: string; source: string; prerelease: boolean }>({ query: '', source: '', prerelease: false });
    // Skip quick search when a suggestion was just selected
    const skipQuickSearchRef = useRef(false);
    // Ref for enabledSources to avoid re-triggering search when sources are enabled/disabled
    const enabledSourcesRef = useRef(enabledSources);
    useEffect(() => {
        enabledSourcesRef.current = enabledSources;
    }, [enabledSources]);

    // Quick search (autocomplete) debounce - 150ms, only when mode is 'quicksearch'
    // React 19: Uses deferredSearchQuery for API calls to prevent blocking during typing
    useEffect(() => {
        // Skip if a suggestion was just selected
        if (skipQuickSearchRef.current) {
            skipQuickSearchRef.current = false;
            return;
        }

        if (searchDebounceMode !== 'quicksearch') {
            // Mode is not quicksearch, ensure dropdown is hidden
            setQuickSearchSuggestions([]);
            setShowQuickSearch(false);
            setQuickSearchLoading(false);
            return;
        }

        if (activeTab === 'browse' && deferredSearchQuery.trim().length >= 2 && searchInputFocusedRef.current) {
            // Clear previous timeout
            if (quickSearchTimeoutRef.current) {
                clearTimeout(quickSearchTimeoutRef.current);
            }

            // Show quick search dropdown and start loading indicator
            // IMPORTANT: Hide search history when showing quick search - they are mutually exclusive
            setShowSearchHistory(false);
            setShowQuickSearch(true);
            setQuickSearchLoading(true);

            // Debounce autocomplete
            quickSearchTimeoutRef.current = setTimeout(() => {
                // Get sources to search (use ref to avoid triggering on source enable/disable)
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
            }, 150); // 150ms debounce for quicksearch
        } else {
            // Clear suggestions and hide dropdown when query is too short
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

    // Full search debounce - only when mode is 'full'
    useEffect(() => {
        if (searchDebounceMode !== 'full') {
            return;
        }

        if (activeTab === 'browse' && searchQuery.trim().length >= 2) {
            // Clear previous timeout
            if (fullSearchTimeoutRef.current) {
                clearTimeout(fullSearchTimeoutRef.current);
            }

            // Debounce full search
            fullSearchTimeoutRef.current = setTimeout(() => {
                // Trigger full search (use ref to avoid triggering on source enable/disable)
                const sourcesToSearch = selectedSource === 'all'
                    ? enabledSourcesRef.current.map(s => s.url)
                    : [selectedSource];

                setLoading(true);
                setSearchResults([]);
                setSelectedPackage(null);
                setPackageMetadata(null);

                vscode.postMessage({
                    type: 'searchPackages',
                    query: searchQuery.trim(),
                    sources: sourcesToSearch,
                    includePrerelease: includePrerelease
                });
            }, 300); // 300ms debounce for full search
        }

        return () => {
            if (fullSearchTimeoutRef.current) {
                clearTimeout(fullSearchTimeoutRef.current);
            }
        };
    }, [activeTab, searchQuery, selectedSource, includePrerelease, searchDebounceMode]);

    useEffect(() => {
        if (activeTab === 'browse' && searchQuery) {
            // Check what changed
            const queryChanged = searchQuery !== lastSearchParamsRef.current.query;

            // Track params for when full search is manually triggered
            if (queryChanged) {
                lastSearchParamsRef.current = { query: searchQuery, source: selectedSource, prerelease: includePrerelease };
            }

            // Add to recent searches after 2 seconds of no input (only in 'full' mode)
            // In 'quicksearch' and 'off' modes, recent searches are only added on explicit actions
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
    }, [activeTab, searchQuery, selectedSource, includePrerelease, searchDebounceMode]);

    const handleSearch = useCallback((addToRecent: boolean = false) => {
        if (searchQuery.trim()) {
            setLoading(true);
            setSelectedPackage(null);
            setSelectedTransitivePackage(null); // Clear transitive selection when searching
            setShowSearchHistory(false);
            setShowQuickSearch(false); // Hide quick search dropdown
            setQuickSearchSuggestions([]); // Clear suggestions
            // Add to recent searches only when explicitly requested (Enter key or button click)
            if (addToRecent && recentSearchesLimitRef.current > 0) {
                const trimmedQuery = searchQuery.trim();
                setRecentSearches(prev => {
                    const filtered = prev.filter(s => s.toLowerCase() !== trimmedQuery.toLowerCase());
                    return [trimmedQuery, ...filtered].slice(0, recentSearchesLimitRef.current);
                });
            }
            // If 'all' is selected, send all enabled source URLs; otherwise send the single selected source
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

    // Select a package from quick search suggestions
    const selectQuickSearchItem = useCallback((packageId: string) => {
        // Prevent quick search from re-triggering
        skipQuickSearchRef.current = true;
        setSearchQuery(packageId);
        setShowQuickSearch(false);
        setQuickSearchSuggestions([]);
        setQuickSearchLoading(false);
        setSelectedSuggestionIndex(-1);
        // Start full search loading immediately
        setLoading(true);
        setSelectedPackage(null);
        setSelectedTransitivePackage(null);
        // Trigger full search for the selected package
        const sourcesToSearch = selectedSource === 'all'
            ? enabledSources.map(s => s.url)
            : [selectedSource];
        vscode.postMessage({
            type: 'searchPackages',
            query: packageId,
            sources: sourcesToSearch,
            includePrerelease: includePrerelease
        });
        // Add to recent searches (if feature is enabled)
        if (recentSearchesLimitRef.current > 0) {
            setRecentSearches(prev => {
                const filtered = prev.filter(s => s.toLowerCase() !== packageId.toLowerCase());
                return [packageId, ...filtered].slice(0, recentSearchesLimitRef.current);
            });
        }
    }, [selectedSource, enabledSources, includePrerelease]);

    // Get source URL for a flat index in quicksearch suggestions
    const getSourceForFlatIndex = useCallback((flatIndex: number): string => {
        let currentIndex = 0;
        for (const sourceResult of quickSearchSuggestions) {
            if (flatIndex < currentIndex + sourceResult.packageIds.length) {
                return sourceResult.sourceUrl;
            }
            currentIndex += sourceResult.packageIds.length;
        }
        // Fallback to selected source
        return selectedSource === 'all' ? '' : selectedSource;
    }, [quickSearchSuggestions, selectedSource]);

    // Expand a quicksearch item to show versions for direct install
    const expandQuickSearchItem = useCallback((flatIndex: number, packageId: string) => {
        const sourceUrl = getSourceForFlatIndex(flatIndex);

        // Check cache first
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

        // Fetch versions from backend
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

    // Collapse quicksearch version expansion (go back to package list)
    const collapseQuickSearchVersions = useCallback(() => {
        setExpandedQuickSearchIndex(null);
        setQuickSearchVersions([]);
        setSelectedQuickVersionIndex(0);
        setQuickVersionsLoading(false);
        setQuickVersionsError(null);
        expandingQuickSearchPackageRef.current = null;
    }, []);

    // Install a package directly from quicksearch
    const installFromQuickSearch = useCallback((packageId: string, version: string) => {
        if (!selectedProject) {
            return;
        }
        // Close quicksearch
        setShowQuickSearch(false);
        setQuickSearchSuggestions([]);
        setQuickSearchLoading(false);
        setSelectedSuggestionIndex(-1);
        collapseQuickSearchVersions();

        // Add to recent searches (if feature is enabled)
        if (recentSearchesLimitRef.current > 0) {
            setRecentSearches(prev => {
                const filtered = prev.filter(s => s.toLowerCase() !== packageId.toLowerCase());
                return [packageId, ...filtered].slice(0, recentSearchesLimitRef.current);
            });
        }

        // Install the package
        vscode.postMessage({
            type: 'installPackage',
            projectPath: selectedProject,
            packageId,
            version
        });
    }, [selectedProject, collapseQuickSearchVersions]);

    // Select a recent search item
    const selectRecentSearchItem = useCallback((search: string) => {
        // Prevent quick search from triggering
        skipQuickSearchRef.current = true;
        setSearchQuery(search);
        setShowSearchHistory(false);
        setShowQuickSearch(false);
        setSelectedSuggestionIndex(-1);
        setLoading(true);
        setSelectedPackage(null);
        setSelectedTransitivePackage(null);
        // Trigger full search
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

    const isSearchResult = (pkg: PackageSearchResult | InstalledPackage | null): pkg is PackageSearchResult => {
        return pkg !== null && 'description' in pkg;
    };

    const getPackageId = (pkg: PackageSearchResult | InstalledPackage | null): string => {
        return pkg?.id || '';
    };

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
            // All selected, deselect all
            setSelectedUpdates(new Set());
        } else {
            // Select all
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
    }, [selectedProject, selectedUpdates, packagesWithUpdates]);

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
        if (selectedUninstalls.size === uninstallablePackages.length && uninstallablePackages.length > 0) {
            // All uninstallable selected, deselect all
            setSelectedUninstalls(new Set());
        } else {
            // Select all uninstallable
            setSelectedUninstalls(new Set(uninstallablePackages.map(p => p.id)));
        }
    }, [selectedUninstalls.size, uninstallablePackages]);

    const handleUninstallSelected = useCallback(() => {
        if (!selectedProject || selectedUninstalls.size === 0) {
            return;
        }
        const packagesToRemove = installedPackages
            .filter(p => selectedUninstalls.has(p.id) && !p.isImplicit)
            .map(p => p.id);

        // Request confirmation from extension (shows VS Code dialog with dependency warning)
        vscode.postMessage({
            type: 'confirmBulkRemove',
            projectPath: selectedProject,
            packages: packagesToRemove
        });
    }, [selectedProject, selectedUninstalls, installedPackages]);

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
    }, [transitiveDataSourceAvailable, selectedProject, loadingTransitive, transitiveFrameworks.length, transitiveExpandedFrameworks.size]);

    // Handle expanding/collapsing individual framework sections (lazy load metadata on first expand)
    const handleToggleTransitiveFramework = useCallback((targetFramework: string) => {
        const isCurrentlyExpanded = transitiveExpandedFrameworks.has(targetFramework);

        if (!isCurrentlyExpanded && selectedProject) {
            // Expanding - check if we need to load metadata
            const framework = transitiveFrameworks.find(f => f.targetFramework === targetFramework);
            if (framework && !framework.metadataLoaded && !transitiveLoadingMetadata.has(targetFramework)) {
                // Load metadata for this framework's packages
                setTransitiveLoadingMetadata(prev => new Set(prev).add(targetFramework));
                vscode.postMessage({
                    type: 'getTransitiveMetadata',
                    targetFramework: targetFramework,
                    packages: framework.packages,
                    projectPath: selectedProject
                });
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
            setSelectedTransitivePackage(null);
        }
    }, [transitiveExpandedFrameworks, selectedProject, transitiveFrameworks, transitiveLoadingMetadata]);

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

    // Handle loading all transitive frameworks (called once when first expanding the area)
    const handleLoadTransitiveFrameworks = useCallback(() => {
        if (!selectedProject || loadingTransitive) { return; }
        if (transitiveDataSourceAvailable === null) {
            setLoadingTransitive(true);
            vscode.postMessage({
                type: 'getTransitivePackages',
                projectPath: selectedProject
            });
        }
    }, [selectedProject, loadingTransitive, transitiveDataSourceAvailable]);

    // Handle restoring project to generate project.assets.json
    const handleRestoreProject = useCallback(() => {
        if (!selectedProject) { return; }
        setRestoringProject(true);
        vscode.postMessage({
            type: 'restoreProject',
            projectPath: selectedProject
        });
    }, [selectedProject]);

    // Shared package details panel renderer
    const renderPackageDetailsPanel = () => {
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
                                    onClick={() => handleRemove(packageId)}
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
                                        setSelectedVersion(newVersion);
                                        setReadmeAttempted(false);
                                        // Check frontend cache for metadata
                                        const metadataCacheKey = `${packageId.toLowerCase()}@${newVersion.toLowerCase()}|${selectedSource === 'all' ? '' : selectedSource}`;
                                        const cachedMetadata = metadataCache.current.get(metadataCacheKey);
                                        if (cachedMetadata) {
                                            setPackageMetadata(cachedMetadata);
                                            setLoadingMetadata(false);
                                        } else {
                                            setLoadingMetadata(true);
                                            setPackageMetadata(null);
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
                                onClick={() => handleInstall(packageId, selectedVersion)}
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
                        onClick={() => setDetailsTab('details')}
                    >
                        Package Details
                    </button>
                    <button
                        className={detailsTab === 'readme' ? 'details-tab active' : 'details-tab'}
                        onClick={() => setDetailsTab('readme')}
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
                            <div className="details-row">
                                <label>Report Abuse:</label>
                                <a href={`https://www.nuget.org/packages/${packageId}/${selectedVersion}/ReportAbuse`} className="details-link">Report this package</a>
                            </div>

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
                                                        onClick={() => {
                                                            const newExpanded = new Set(expandedDeps);
                                                            if (newExpanded.has(key)) {
                                                                newExpanded.delete(key);
                                                            } else {
                                                                newExpanded.add(key);
                                                            }
                                                            setExpandedDeps(newExpanded);
                                                        }}
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
                            ) : packageMetadata?.readme ? (
                                <div
                                    className="readme-rendered"
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(upgradeHttpToHttps(packageMetadata.readme)) as string, { ADD_TAGS: ['button'], ADD_ATTR: ['aria-label'] }) }}
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
                                        {isFailed ? '⚠️ ' : ''}{s.name}
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
                            ⚙️
                        </button>
                        {failedSources.length > 0 && (
                            <span
                                className="source-warning-indicator"
                                title={`${failedSources.length} source(s) unreachable. Click to refresh.`}
                                onClick={() => vscode.postMessage({ type: 'refreshSources' })}
                            >
                                ⚠️
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Source Settings Overlay */}
            {showSourceSettings && (
                <div className="source-settings-overlay" onClick={() => {
                    setShowSourceSettings(false);
                    setShowAddSourcePanel(false);
                    setConfirmRemoveSource(null);
                }}>
                    <div className="source-settings-modal" onClick={(e) => e.stopPropagation()}>
                        {/* Main Panel */}
                        <div className={`source-settings-main ${showAddSourcePanel ? 'slide-out' : ''}`}>
                            <div className="source-settings-header">
                                <h3>NuGet Sources</h3>
                                <button className="source-settings-close" onClick={() => {
                                    setShowSourceSettings(false);
                                    setShowAddSourcePanel(false);
                                    setConfirmRemoveSource(null);
                                }}>✕</button>
                            </div>
                            <div className="source-settings-content">
                                {sources.length === 0 ? (
                                    <p className="empty-state">No NuGet sources configured.</p>
                                ) : (
                                    sources.map(source => (
                                        <div key={source.url} className="source-settings-item">
                                            <label className="source-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={source.enabled}
                                                    disabled={togglingSource === source.name || removingSource === source.name}
                                                    onChange={() => {
                                                        setTogglingSource(source.name);
                                                        if (source.enabled) {
                                                            vscode.postMessage({
                                                                type: 'disableSource',
                                                                sourceName: source.name,
                                                                sourceUrl: source.url
                                                            });
                                                        } else {
                                                            vscode.postMessage({
                                                                type: 'enableSource',
                                                                sourceName: source.name
                                                            });
                                                        }
                                                    }}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                            <div className="source-info">
                                                <span className={`source-name ${!source.enabled ? 'disabled' : ''}`}>
                                                    {source.name}
                                                    {togglingSource === source.name && <span className="toggling-indicator"> ⏳</span>}
                                                    {removingSource === source.name && <span className="toggling-indicator"> ⏳</span>}
                                                </span>
                                                <span className="source-url">{source.url}</span>
                                            </div>
                                            <button
                                                className="source-remove-btn"
                                                title="Remove from nearest config file"
                                                disabled={removingSource === source.name}
                                                onClick={() => setConfirmRemoveSource({ name: source.name, configFile: source.configFile })}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="source-settings-footer">
                                <button
                                    className="btn btn-secondary add-source-btn"
                                    onClick={() => {
                                        setShowAddSourcePanel(true);
                                        setAddSourceError(null);
                                    }}
                                >
                                    + Add Source
                                </button>
                                <span className="source-settings-hint">Sources from all configs. Remove deletes from nearest config.</span>
                            </div>
                        </div>

                        {/* Add Source Panel (slides in) */}
                        <div className={`source-add-panel ${showAddSourcePanel ? 'slide-in' : ''}`}>
                            <div className="source-settings-header">
                                <button
                                    className="source-back-btn"
                                    onClick={() => {
                                        setShowAddSourcePanel(false);
                                        setAddSourceError(null);
                                    }}
                                >
                                    ← Back
                                </button>
                                <h3>Add New Source</h3>
                                <div style={{ width: '60px' }}></div>
                            </div>
                            <div className="source-add-content">
                                {configFiles.length > 0 && (
                                    <div className="form-group">
                                        <label>Add to config:</label>
                                        <select
                                            value={selectedConfigFile}
                                            onChange={(e) => setSelectedConfigFile((e.target as HTMLSelectElement).value)}
                                            className="config-select"
                                        >
                                            {configFiles.map(cf => (
                                                <option key={cf.path} value={cf.path}>{cf.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div className="form-group">
                                    <label>URL *</label>
                                    <div className="input-with-warning">
                                        <input
                                            type="text"
                                            value={addSourceUrl}
                                            onChange={(e) => {
                                                setAddSourceUrl((e.target as HTMLInputElement).value);
                                                setAddSourceError(null);
                                            }}
                                            placeholder="https://api.nuget.org/v3/index.json"
                                            className={addSourceError ? 'input-error' : ''}
                                        />
                                        {addSourceUrl.startsWith('http://') && (
                                            <span className="http-warning" title="HTTP connections are insecure. HTTPS is recommended.">⚠️</span>
                                        )}
                                    </div>
                                    {addSourceError && (
                                        <span className="error-message">{addSourceError}</span>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label>Name (optional)</label>
                                    <input
                                        type="text"
                                        value={addSourceName}
                                        onChange={(e) => setAddSourceName((e.target as HTMLInputElement).value)}
                                        placeholder="Auto-generated from URL if empty"
                                    />
                                </div>
                                <div className="advanced-section">
                                    <button
                                        className="advanced-toggle"
                                        onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                                    >
                                        {showAdvancedOptions ? '▼' : '▶'} Advanced
                                    </button>
                                    {showAdvancedOptions && (
                                        <div className="advanced-content">
                                            <div className="form-group">
                                                <label>Username</label>
                                                <input
                                                    type="text"
                                                    value={addSourceUsername}
                                                    onChange={(e) => setAddSourceUsername((e.target as HTMLInputElement).value)}
                                                    placeholder="Optional"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Password</label>
                                                <input
                                                    type="password"
                                                    value={addSourcePassword}
                                                    onChange={(e) => setAddSourcePassword((e.target as HTMLInputElement).value)}
                                                    placeholder="Optional - supports %ENV_VAR% syntax"
                                                />
                                            </div>
                                            {addSourcePassword && (
                                                <div className="form-group">
                                                    <label className="preview-checkbox" title={isWindows ? 'Encrypt password using Windows DPAPI (same machine/user only)' : 'Password encryption is only available on Windows'}>
                                                        <input
                                                            type="checkbox"
                                                            checked={storeEncrypted}
                                                            onChange={(e) => setStoreEncrypted((e.target as HTMLInputElement).checked)}
                                                            disabled={!isWindows}
                                                        />
                                                        Store encrypted {!isWindows && '(Windows only)'}
                                                    </label>
                                                    {!storeEncrypted && isWindows && (
                                                        <span className="warning-text">⚠️ Password will be stored in clear text</span>
                                                    )}
                                                </div>
                                            )}
                                            <div className="security-info">
                                                <a href="https://learn.microsoft.com/en-us/nuget/consume-packages/consuming-packages-authenticated-feeds#security-best-practices-for-managing-credentials" target="_blank" rel="noopener noreferrer">Security best practices for credentials →</a>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="source-add-footer">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setShowAddSourcePanel(false);
                                        setAddSourceUrl('');
                                        setAddSourceName('');
                                        setAddSourceUsername('');
                                        setAddSourcePassword('');
                                        setStoreEncrypted(isWindows);
                                        setAddSourceError(null);
                                        setShowAdvancedOptions(false);
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    disabled={!addSourceUrl.trim() || addingSource}
                                    onClick={() => {
                                        setAddingSource(true);
                                        setAddSourceError(null);
                                        vscode.postMessage({
                                            type: 'addSource',
                                            url: addSourceUrl.trim(),
                                            name: addSourceName.trim() || undefined,
                                            username: addSourceUsername.trim() || undefined,
                                            password: addSourcePassword || undefined,
                                            configFile: selectedConfigFile || undefined,
                                            allowInsecure: addSourceUrl.startsWith('http://'),
                                            storeEncrypted: addSourcePassword ? storeEncrypted : undefined
                                        });
                                    }}
                                >
                                    {addingSource ? 'Adding...' : 'Add Source'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Remove Source Dialog */}
            {confirmRemoveSource && (
                <div className="source-settings-overlay" onClick={() => setConfirmRemoveSource(null)}>
                    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-dialog-header">
                            <h3>Remove Source</h3>
                        </div>
                        <div className="confirm-dialog-content">
                            <p>Are you sure you want to remove the source "{confirmRemoveSource.name}"?</p>
                            <p className="confirm-warning">This action cannot be undone.</p>
                        </div>
                        <div className="confirm-dialog-footer">
                            <button className="btn btn-secondary" onClick={() => setConfirmRemoveSource(null)}>
                                Cancel
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={() => {
                                    setRemovingSource(confirmRemoveSource.name);
                                    vscode.postMessage({
                                        type: 'removeSource',
                                        sourceName: confirmRemoveSource.name,
                                        configFile: confirmRemoveSource.configFile
                                    });
                                }}
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
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
                            // Navigate to search input (triggers onFocus which may show history)
                            searchInputRef.current?.focus();
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
                        // Clear quick search state when leaving browse tab
                        setShowQuickSearch(false);
                        setQuickSearchSuggestions([]);
                        setQuickSearchLoading(false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' && installedPackages.length > 0) {
                            e.preventDefault();
                            installedListRef.current?.focus({ preventScroll: true });
                            // If no package selected or selected not in list, select first (use deferred for consistency with render)
                            if (!selectedPackage || !deferredInstalledPackages.find(p => getPackageId(p) === getPackageId(selectedPackage))) {
                                const firstPkg = deferredInstalledPackages[0];
                                setSelectedPackage(firstPkg);
                                setSelectedTransitivePackage(null);
                                setSelectedVersion(firstPkg.version);
                                setDetailsTab('details');
                            }
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
                        // Clear quick search state when leaving browse tab
                        setShowQuickSearch(false);
                        setQuickSearchSuggestions([]);
                        setQuickSearchLoading(false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' && packagesWithUpdates.length > 0) {
                            e.preventDefault();
                            updatesListRef.current?.focus({ preventScroll: true });
                            // If no package selected or selected not in list, select first (use deferred for consistency with render)
                            if (!selectedPackage || !deferredPackagesWithUpdates.find(p => p.id === selectedPackage.id)) {
                                const firstPkg = deferredPackagesWithUpdates[0];
                                const installedPkg = { id: firstPkg.id, version: firstPkg.installedVersion };
                                setSelectedPackage(installedPkg);
                                setSelectedTransitivePackage(null);
                                setSelectedVersion(firstPkg.latestVersion);
                                setDetailsTab('details');
                            }
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

            {activeTab === 'browse' && (
                <div className="content browse-content">
                    <div className="search-bar" role="search">
                        <div className="search-input-wrapper">
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Search packages..."
                                value={searchQuery}
                                onChange={(e) => {
                                    const newValue = (e.target as HTMLInputElement).value;
                                    // Collapse version expansion when user types
                                    if (expandedQuickSearchIndex !== null) {
                                        collapseQuickSearchVersions();
                                    }
                                    setSearchQuery(newValue);
                                    // Reset selection index when user types (so Enter uses typed text)
                                    if (newValue.trim()) {
                                        setSelectedSuggestionIndex(-1);
                                        isKeyboardNavigationRef.current = false;
                                    }
                                    // Show recent searches when text is cleared (if feature is enabled)
                                    if (!newValue.trim() && recentSearchesLimit > 0) {
                                        setShowSearchHistory(true);
                                        setShowQuickSearch(false);
                                        setSelectedSuggestionIndex(-1); // Reset selection
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
                                            // Retry fetch if there was an error
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
                                        // Expand versions for selected quicksearch item
                                        if (showQuickSearch && selectedSuggestionIndex >= 0 && flatSuggestions[selectedSuggestionIndex]) {
                                            e.preventDefault();
                                            expandQuickSearchItem(selectedSuggestionIndex, flatSuggestions[selectedSuggestionIndex]);
                                        }
                                    } else if (e.ctrlKey && e.key === 'Enter') {
                                        // Ctrl+Enter: Quick install latest version
                                        if (showQuickSearch && selectedSuggestionIndex >= 0 && flatSuggestions[selectedSuggestionIndex]) {
                                            e.preventDefault();
                                            const packageId = flatSuggestions[selectedSuggestionIndex];
                                            const sourceUrl = getSourceForFlatIndex(selectedSuggestionIndex);

                                            // Check cache first
                                            const cacheKey = `${packageId.toLowerCase()}|${sourceUrl}|${includePrerelease}`;
                                            const cached = versionsCache.current.get(cacheKey);
                                            if (cached && cached.length > 0 && selectedProject) {
                                                // Use cached version - install immediately
                                                const latestVersion = cached[0];
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
                                                    projectPath: selectedProject,
                                                    packageId: packageId,
                                                    version: latestVersion
                                                });
                                            } else {
                                                // Request versions and install when they arrive
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
                                        // Only use selectedSuggestionIndex if it was set by keyboard navigation (not mouse hover)
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
                                    // (dropdowns use arrow keys for their own navigation)
                                    const noDropdownVisible = !showSearchHistory && !showQuickSearch;
                                    if (noDropdownVisible && e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        browseTabRef.current?.focus();
                                    } else if (noDropdownVisible && e.key === 'ArrowDown' && searchResults.length > 0) {
                                        e.preventDefault();
                                        browseListRef.current?.focus({ preventScroll: true });
                                        // If no package selected, select the first one
                                        if (!selectedPackage || !searchResults.find(p => getPackageId(p) === getPackageId(selectedPackage))) {
                                            const firstPkg = searchResults[0];
                                            setSelectedPackage(firstPkg);
                                            setSelectedTransitivePackage(null);
                                            setSelectedVersion(firstPkg.version);
                                            setDetailsTab('details');
                                        }
                                    }
                                }}
                                onFocus={() => {
                                    searchInputFocusedRef.current = true;
                                    // Show recent searches only when query is empty and feature is enabled
                                    if (!searchQuery.trim() && recentSearchesLimit > 0) {
                                        setShowSearchHistory(true);
                                        setSelectedSuggestionIndex(-1); // Reset selection when showing
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
                            {/* Recent searches dropdown - shown when focused and query is empty */}
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
                            {/* Quick search suggestions dropdown - shown when typing */}
                            {showQuickSearch && searchQuery.trim().length >= 2 && (quickSearchLoading || quickSearchSuggestions.some(g => g.packageIds.length > 0) || expandedQuickSearchIndex !== null) && (
                                <div className={`search-history-dropdown${isKeyboardNavActive ? ' keyboard-nav' : ''}`} onMouseLeave={() => setSelectedSuggestionIndex(-1)}>
                                    {/* Version selection mode */}
                                    {expandedQuickSearchIndex !== null ? (
                                        <>
                                            <div className="quick-search-version-header">
                                                <span
                                                    className="quick-search-back-hint"
                                                    title="Back to results [←]"
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
                                                        {/* Show source divider only if multiple sources have results */}
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
                                                                        title="Show versions [→]"
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
                        <div className="package-list-panel" style={{ width: `${splitPosition}%` }}>
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
                                            selectDirectPackage(pkg, {
                                                selectedVersionValue: pkg.version,
                                                metadataVersion: pkg.version,
                                                initialVersions: [pkg.version],
                                            });
                                        },
                                        {
                                            onAction: () => handleInstall(getPackageId(selectedPackage!), selectedVersion || (selectedPackage as PackageSearchResult).version),
                                            onLeftArrow: () => detailsTab === 'readme' && setDetailsTab('details'),
                                            onRightArrow: () => detailsTab === 'details' && setDetailsTab('readme'),
                                            onExitTop: () => {
                                                clearSelection();
                                                searchInputRef.current?.focus();
                                            }
                                        }
                                    )}
                                >
                                    {searchResults.map(pkg => (
                                        <div
                                            key={pkg.id}
                                            className={`package-item ${selectedPackage && getPackageId(selectedPackage).toLowerCase() === pkg.id.toLowerCase() ? 'selected' : ''}`}
                                            onClick={() => {
                                                selectDirectPackage(pkg, {
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
                                    ))}
                                </div>
                            )}
                        </div>

                        <DraggableSash
                            onDrag={setSplitPosition}
                            onReset={() => setSplitPosition(35)}
                            onDragEnd={(pos) => vscode.postMessage({ type: 'saveSplitPosition', position: pos })}
                        />

                        <div className="package-details-panel" style={{ width: `${100 - splitPosition}%` }}>
                            {renderPackageDetailsPanel()}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'installed' && (
                <div className="content browse-content">
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
                                    <button
                                        className="direct-packages-header"
                                        onClick={() => setDirectPackagesExpanded(!directPackagesExpanded)}
                                        aria-expanded={directPackagesExpanded}
                                    >
                                        <span className="direct-packages-arrow">{directPackagesExpanded ? '▼' : '▶'}</span>
                                        <span className="direct-packages-title">
                                            Direct packages
                                            <span className="direct-packages-count">({installedPackages.length})</span>
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
                                                    {selectedUninstalls.size === uninstallablePackages.length && uninstallablePackages.length > 0 ? 'Deselect all' : 'Select all'}
                                                </button>
                                                <button
                                                    className="btn btn-danger"
                                                    onClick={handleUninstallSelected}
                                                    disabled={selectedUninstalls.size === 0 || uninstallingAll}
                                                >
                                                    {uninstallingAll ? 'Uninstalling...' : `Uninstall Selected (${selectedUninstalls.size})`}
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
                                                        selectDirectPackage(pkg, {
                                                            selectedVersionValue: pkg.version,
                                                            metadataVersion: pkg.resolvedVersion || pkg.version,
                                                            initialVersions: [pkg.version],
                                                        });
                                                    },
                                                    {
                                                        onDelete: (pkg) => !pkg.isImplicit && handleRemove(pkg.id),
                                                        onToggle: (pkg) => !pkg.isImplicit && handleToggleUninstallSelection(pkg.id),
                                                        onLeftArrow: () => detailsTab === 'readme' && setDetailsTab('details'),
                                                        onRightArrow: () => detailsTab === 'details' && setDetailsTab('readme'),
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
                                                            selectDirectPackage(pkg, {
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
                                        <div className="no-lockfile-icon">�</div>
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
                                                                        selectTransitivePackage(pkg);
                                                                    }
                                                                )}
                                                            >
                                                                {framework.packages.map(pkg => (
                                                                    <div
                                                                        key={pkg.id}
                                                                        className={`transitive-package-item ${selectedTransitivePackage?.id === pkg.id ? 'selected' : ''}`}
                                                                        onClick={() => {
                                                                            selectTransitivePackage(pkg);
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

                        <DraggableSash
                            onDrag={setSplitPosition}
                            onReset={() => setSplitPosition(35)}
                            onDragEnd={(pos) => vscode.postMessage({ type: 'saveSplitPosition', position: pos })}
                        />

                        <div className="package-details-panel" style={{ width: `${100 - splitPosition}%` }}>
                            {selectedTransitivePackage ? (
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
                                                    (() => {
                                                        // Get unique root packages (first in chain)
                                                        const allChains = selectedTransitivePackage.fullChain || selectedTransitivePackage.requiredByChain;
                                                        const rootPackages = new Set<string>();

                                                        for (const chain of allChains) {
                                                            rootPackages.add(chain.split(' → ')[0]);
                                                        }

                                                        return Array.from(rootPackages).map((rootPkg) => (
                                                            <div key={rootPkg} className="required-by-item">
                                                                {rootPkg}
                                                            </div>
                                                        ));
                                                    })()
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : renderPackageDetailsPanel()}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'updates' && (
                <div className="content browse-content">
                    <div className="split-panel">
                        <div className="package-list-panel" style={{ width: `${splitPosition}%` }}>
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
                                                // Create synthetic package for details panel
                                                const installedPkg = { id: pkg.id, version: pkg.installedVersion } as InstalledPackage;
                                                selectDirectPackage(installedPkg, {
                                                    selectedVersionValue: pkg.latestVersion,
                                                    metadataVersion: pkg.latestVersion,
                                                    initialVersions: [pkg.latestVersion, pkg.installedVersion],
                                                });
                                            },
                                            {
                                                onAction: (pkg) => handleInstall(pkg.id, pkg.latestVersion),
                                                onToggle: (pkg) => handleToggleUpdateSelection(pkg.id),
                                                onLeftArrow: () => detailsTab === 'readme' && setDetailsTab('details'),
                                                onRightArrow: () => detailsTab === 'details' && setDetailsTab('readme'),
                                                onExitTop: () => {
                                                    clearSelection();
                                                    updatesTabRef.current?.focus();
                                                }
                                            }
                                        )}
                                    >
                                        {deferredPackagesWithUpdates.map(pkg => (
                                            <div
                                                key={pkg.id}
                                                className={`package-item ${selectedPackage && getPackageId(selectedPackage).toLowerCase() === pkg.id.toLowerCase() ? 'selected' : ''}`}
                                                onClick={() => {
                                                    // Create synthetic package for details panel
                                                    const installedPkg = { id: pkg.id, version: pkg.installedVersion } as InstalledPackage;
                                                    selectDirectPackage(installedPkg, {
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
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        <DraggableSash
                            onDrag={setSplitPosition}
                            onReset={() => setSplitPosition(35)}
                            onDragEnd={(pos) => vscode.postMessage({ type: 'saveSplitPosition', position: pos })}
                        />

                        <div className="package-details-panel" style={{ width: `${100 - splitPosition}%` }}>
                            {renderPackageDetailsPanel()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

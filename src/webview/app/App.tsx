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
import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import './App.css';
import { usePackageSelection } from './hooks/usePackageSelection';
import type { BrowseTabHandle } from './components/BrowseTab';
import type { InstalledTabHandle } from './components/InstalledTab';
import type { UpdatesTabHandle } from './components/UpdatesTab';
import { MemoizedBrowseTab } from './components/BrowseTab';
import { MemoizedInstalledTab } from './components/InstalledTab';
import { MemoizedUpdatesTab } from './components/UpdatesTab';
import { MemoizedPackageDetailsPanel } from './components/PackageDetailsPanel';
import type { InstalledPackage, PackageSearchResult, PackageMetadata, TransitivePackage, NuGetSource, FailedSource, Project, PackageUpdate, AppState } from './types';
import { LRUMap, isSearchResult, getPackageId, decodeHtmlEntities } from './types';

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

const MemoizedDraggableSash = React.memo(DraggableSash);

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
    const [loadingReadme, setLoadingReadme] = useState(false);
    const [readmeAttempted, setReadmeAttempted] = useState(false);
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

    const [selectedTransitivePackage, setSelectedTransitivePackage] = useState<TransitivePackage | null>(null);


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
            case 'transitiveMetadata':
            case 'restoreProjectResult':
            case 'bulkRemoveConfirmed':
                installedTabCompRef.current?.handleMessage(message);
                break;
            case 'searchResults':
            case 'autocompleteResults':
            case 'restoreSearchQuery':
                browseTabCompRef.current?.handleMessage(message);
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

    // Memoize sanitized README HTML to avoid re-sanitizing on every render
    const sanitizedReadmeHtml = useMemo(() => {
        if (!packageMetadata?.readme) return '';
        return DOMPurify.sanitize(
            marked.parse(upgradeHttpToHttps(packageMetadata.readme)) as string,
            { ADD_TAGS: ['button'], ADD_ATTR: ['aria-label'] }
        );
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
                        onInstall={handleInstall}
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

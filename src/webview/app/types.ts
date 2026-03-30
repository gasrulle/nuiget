/**
 * Shared types for the nUIget webview application.
 * Extracted from App.tsx to enable component decomposition.
 */

// ─── Data Models ─────────────────────────────────────────────────────────────

export interface Project {
    name: string;
    path: string;
}

/**
 * Version specification types for NuGet packages
 */
export type VersionType = 'floating' | 'range' | 'exact' | 'standard';

/**
 * Vulnerability severity levels matching NuGet V3 API integer values
 */
export type VulnerabilitySeverity = 'Low' | 'Moderate' | 'High' | 'Critical';

/**
 * Known vulnerability for a package version
 */
export interface PackageVulnerability {
    advisoryUrl: string;
    severity: VulnerabilitySeverity;
}

export interface InstalledPackage {
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
    vulnerabilities?: PackageVulnerability[];
}

export interface PackageSearchResult {
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
export interface QuickSearchSourceResult {
    sourceName: string;
    sourceUrl: string;
    packageIds: string[];
}

export interface NuGetSource {
    name: string;
    url: string;
    enabled: boolean;
    configFile?: string;
}

export interface FailedSource {
    url: string;
    error: string;
}

export interface PackageDependency {
    id: string;
    versionRange: string;
}

export interface PackageDependencyGroup {
    targetFramework: string;
    dependencies: PackageDependency[];
}

export interface PackageMetadata {
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
    packageSize?: number;
    vulnerabilities?: PackageVulnerability[];
    offline?: boolean;
}

export interface PackageUpdate {
    id: string;
    installedVersion: string;
    latestVersion: string;
    iconUrl?: string;
    verified?: boolean;
    authors?: string;
    sourceUrl?: string;
}

/**
 * Minimal package update info (without metadata) for fast "load all" mode
 */
export interface PackageUpdateMinimal {
    id: string;
    installedVersion: string;
    latestVersion: string;
    sourceUrl?: string;
}

/**
 * Updates for a single project in "load all" mode
 */
export interface ProjectUpdates {
    projectPath: string;
    projectName: string;
    updates: PackageUpdateMinimal[];
}

/**
 * Installed packages for a single project in "load all" mode (minimal data for performance)
 */
export interface ProjectInstalled {
    projectPath: string;
    projectName: string;
    packages: InstalledPackageMinimal[];
}

/**
 * Minimal installed package data for all-projects mode (no icons, authors, or version spec details)
 */
export interface InstalledPackageMinimal {
    id: string;
    version: string;
    resolvedVersion?: string;
    isImplicit?: boolean;
}

export interface TransitivePackage {
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

export interface TransitiveFrameworkSection {
    targetFramework: string;
    packages: TransitivePackage[];
    /** Whether metadata (icons, verified, authors) has been loaded */
    metadataLoaded?: boolean;
}

/** Tab type for the main panel (Browse tab removed — search is now unified) */
export type TabType = 'installed' | 'updates';

export interface AppState {
    selectedProject: string;
    selectedSource: string;
    activeTab: TabType;
    searchQuery: string;
    includePrerelease: boolean;
    recentSearches: string[];
    loadAllProjects?: boolean;
}

// ─── VS Code API ─────────────────────────────────────────────────────────────

/**
 * Incoming message from the extension host to the webview.
 * Messages are dispatched via postMessage and are inherently untyped — field
 * names and shapes vary by `type`. A full discriminated union would be ideal
 * but requires enumerating 50+ message shapes; the index signature provides
 * a practical middle ground that eliminates bare `any` on public interfaces.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WebviewMessage = { type: string } & Record<string, any>;

export interface VsCodeApi {
    postMessage: (msg: unknown) => void;
    getState: () => AppState | undefined;
    setState: (state: AppState) => void;
}

// ─── LRU Cache ───────────────────────────────────────────────────────────────

/**
 * LRU (Least Recently Used) Map with maximum size limit.
 * Automatically evicts oldest entries when capacity is reached.
 * Uses Map's insertion order (ES6+ guarantees iteration order = insertion order).
 */
export class LRUMap<K, V> {
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

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Type guard: checks if a package is a PackageSearchResult (has `description` field)
 */
export function isSearchResult(pkg: PackageSearchResult | InstalledPackage | null): pkg is PackageSearchResult {
    return pkg !== null && 'description' in pkg;
}

/**
 * Compare two version strings numerically (ignoring prerelease suffixes).
 * Returns: positive if a > b, negative if a < b, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
    const partsA = a.split('-')[0].split('.').map(p => parseInt(p, 10) || 0);
    const partsB = b.split('-')[0].split('.').map(p => parseInt(p, 10) || 0);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const partA = partsA[i] || 0;
        const partB = partsB[i] || 0;
        if (partA !== partB) { return partA - partB; }
    }
    return 0;
}

/**
 * Extract package ID from either PackageSearchResult or InstalledPackage
 */
export function getPackageId(pkg: PackageSearchResult | InstalledPackage | null): string {
    return pkg?.id || '';
}

/**
 * Decode HTML entities (e.g., &lt; &gt; &amp;) in package descriptions
 */
export function decodeHtmlEntities(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

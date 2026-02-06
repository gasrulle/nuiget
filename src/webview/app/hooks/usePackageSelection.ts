/**
 * usePackageSelection Hook
 *
 * Consolidates package selection logic across Browse, Installed, and Updates tabs.
 * Handles:
 * - Setting selected package state
 * - Clearing transitive selection (mutually exclusive)
 * - Fetching/caching versions and metadata
 * - Early-exit guard for already-selected packages
 *
 * Key differences by tab:
 * - Browse: Uses pkg.version for metadata
 * - Installed: Uses pkg.resolvedVersion || pkg.version for floating versions (e.g., "10.*" → "10.2.0")
 * - Updates: Creates synthetic package, shows both latestVersion and installedVersion as initial versions
 */

import { RefObject, useCallback } from 'react';

// LRU Map type (defined in App.tsx, passed via ref)
interface LRUMapLike<K, V> {
    get(key: K): V | undefined;
    set(key: K, value: V): void;
}

/**
 * Package metadata returned from extension
 */
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
    dependencies: { targetFramework: string; dependencies: { id: string; versionRange: string }[] }[];
    readme?: string;
}

/**
 * Transitive package type
 */
interface TransitivePackage {
    id: string;
    version: string;
    requiredByChain: string[];
    fullChain?: string[];
    iconUrl?: string;
    verified?: boolean;
    authors?: string;
}

/**
 * Options for selecting a direct package
 */
export interface SelectPackageOptions {
    /**
     * The version to display in the selectedVersion state
     * For Browse: pkg.version
     * For Installed: pkg.version (the csproj version)
     * For Updates: pkg.latestVersion
     */
    selectedVersionValue: string;

    /**
     * The version to use for metadata lookup
     * For Browse: pkg.version
     * For Installed: pkg.resolvedVersion || pkg.version (handles floating versions)
     * For Updates: pkg.latestVersion
     */
    metadataVersion: string;

    /**
     * Initial versions to show in dropdown before full list loads
     * For Browse: [pkg.version]
     * For Installed: [pkg.version]
     * For Updates: [pkg.latestVersion, pkg.installedVersion]
     */
    initialVersions: string[];
}

/**
 * VS Code API interface for posting messages
 */
interface VsCodeApi {
    postMessage: (msg: unknown) => void;
}

/**
 * Dependencies required by the hook
 */
export interface UsePackageSelectionDeps<T extends { id: string }> {
    // State setters
    setSelectedPackage: (pkg: T | null) => void;
    setSelectedTransitivePackage: (pkg: TransitivePackage | null) => void;
    setSelectedVersion: (version: string) => void;
    setDetailsTab: (tab: 'details' | 'readme') => void;
    setExpandedDeps: (deps: Set<string>) => void;
    setPackageVersions: (versions: string[]) => void;
    setLoadingVersions: (loading: boolean) => void;
    setPackageMetadata: (metadata: PackageMetadata | null) => void;
    setLoadingMetadata: (loading: boolean) => void;

    // Cache refs
    versionsCache: RefObject<LRUMapLike<string, string[]>>;
    metadataCache: RefObject<LRUMapLike<string, PackageMetadata>>;

    // Current state (for cache key building)
    selectedSource: string;
    includePrerelease: boolean;

    // Current selected package (for early-exit guard)
    selectedPackage: { id: string } | null;

    // VS Code API
    vscode: VsCodeApi;
}

/**
 * Get package ID helper (handles both PackageSearchResult.id and InstalledPackage.id)
 */
function getPackageId(pkg: { id: string }): string {
    return pkg.id;
}

/**
 * Hook that provides unified package selection functions
 */
export function usePackageSelection<T extends { id: string }>(
    deps: UsePackageSelectionDeps<T>
) {
    const {
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
    } = deps;

    /**
     * Build cache key for versions lookup
     */
    const buildVersionsCacheKey = useCallback((packageId: string): string => {
        const source = selectedSource === 'all' ? '' : selectedSource;
        return `${packageId.toLowerCase()}|${source}|${includePrerelease}`;
    }, [selectedSource, includePrerelease]);

    /**
     * Build cache key for metadata lookup
     */
    const buildMetadataCacheKey = useCallback((packageId: string, version: string): string => {
        const source = selectedSource === 'all' ? '' : selectedSource;
        return `${packageId.toLowerCase()}@${version.toLowerCase()}|${source}`;
    }, [selectedSource]);

    /**
     * Select a direct package (from Browse, Installed, or Updates tab)
     * Sets all related state and fetches versions/metadata as needed.
     *
     * @param pkg - The package to select
     * @param options - Version options for display and metadata lookup
     * @param skipIfSelected - If true, skip selection if package is already selected (default: true)
     * @returns true if selection was performed, false if skipped (already selected)
     */
    const selectDirectPackage = useCallback((
        pkg: T,
        options: SelectPackageOptions,
        skipIfSelected: boolean = true
    ): boolean => {
        // Early-exit guard: skip if already selected (consistent behavior for keyboard and click)
        if (skipIfSelected && selectedPackage && getPackageId(selectedPackage).toLowerCase() === getPackageId(pkg).toLowerCase()) {
            return false;
        }

        // Set package and clear transitive (mutually exclusive)
        setSelectedPackage(pkg);
        setSelectedTransitivePackage(null);
        setSelectedVersion(options.selectedVersionValue);
        setDetailsTab('details');
        setExpandedDeps(new Set());

        // Versions: check cache first
        const versionsCacheKey = buildVersionsCacheKey(pkg.id);
        const cachedVersions = versionsCache.current?.get(versionsCacheKey);
        if (cachedVersions) {
            setPackageVersions(cachedVersions);
            setLoadingVersions(false);
        } else {
            setPackageVersions(options.initialVersions);
            setLoadingVersions(true);
            vscode.postMessage({
                type: 'getPackageVersions',
                packageId: pkg.id,
                source: selectedSource === 'all' ? undefined : selectedSource,
                includePrerelease: includePrerelease,
                take: 20
            });
        }

        // Metadata: check cache first
        const metadataCacheKey = buildMetadataCacheKey(pkg.id, options.metadataVersion);
        const cachedMetadata = metadataCache.current?.get(metadataCacheKey);
        if (cachedMetadata) {
            setPackageMetadata(cachedMetadata);
            setLoadingMetadata(false);
        } else {
            setPackageMetadata(null);
            setLoadingMetadata(true);
            vscode.postMessage({
                type: 'getPackageMetadata',
                packageId: pkg.id,
                version: options.metadataVersion,
                source: selectedSource === 'all' ? undefined : selectedSource
            });
        }

        return true;
    }, [
        selectedPackage,
        setSelectedPackage,
        setSelectedTransitivePackage,
        setSelectedVersion,
        setDetailsTab,
        setExpandedDeps,
        setPackageVersions,
        setLoadingVersions,
        setPackageMetadata,
        setLoadingMetadata,
        buildVersionsCacheKey,
        buildMetadataCacheKey,
        versionsCache,
        metadataCache,
        selectedSource,
        includePrerelease,
        vscode,
    ]);

    /**
     * Select a transitive package (from Installed tab transitive section)
     * Clears direct package selection (mutually exclusive).
     */
    const selectTransitivePackage = useCallback((pkg: TransitivePackage): void => {
        setSelectedTransitivePackage(pkg);
        setSelectedPackage(null);
    }, [setSelectedTransitivePackage, setSelectedPackage]);

    /**
     * Clear all package selections (both direct and transitive)
     * Used when switching tabs, searching, pressing Escape, etc.
     */
    const clearSelection = useCallback((): void => {
        setSelectedPackage(null);
        setSelectedTransitivePackage(null);
    }, [setSelectedPackage, setSelectedTransitivePackage]);

    return {
        selectDirectPackage,
        selectTransitivePackage,
        clearSelection,
    };
}

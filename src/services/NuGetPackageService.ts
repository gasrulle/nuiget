import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { http2Client, isRedirectStatus, resolveRedirect } from './Http2Client';
import type { FetchResult } from './NuGetTypes';
import {
    InstalledPackage, NuGetRegistrationEntry, NuGetRegistrationPage,
    NuGetSearchEntry, NuGetSearchResponse, NuGetSource,
    PackageDependency, PackageDependencyGroup,
    PackageMetadata, PackageSearchResult, PackageVulnerability,
    QuickSearchSourceResult, ServiceEndpoints, TransitivePackage,
    VulnerabilitySeverity
} from './NuGetTypes';
import {
    batchedPromiseAll, execWithTimeout,
    isNewerVersion,
    isVersionInRange, LRUMap
} from './NuGetUtils';
import { CACHE_TTL, cacheKeys, workspaceCache } from './WorkspaceCache';

const readFileAsync = promisify(fs.readFile);

/**
 * Infrastructure dependencies injected by NuGetService (the facade).
 * These are methods that live in NuGetService because they depend on
 * service index caching, credential management, and HTTP session pooling.
 */
export interface PackageServiceDeps {
    discoverServiceEndpoints: (sourceUrl: string) => Promise<ServiceEndpoints>;
    getAuthHeader: (sourceUrl: string) => Promise<string | undefined>;
    fetchJson: <T>(url: string, authHeader?: string) => Promise<T | null>;
    fetchJsonWithDetails: <T>(url: string, authHeader?: string, timeoutMs?: number) => Promise<FetchResult<T>>;
    fetchJsonWithCompression: <T>(url: string, authHeader?: string) => Promise<T | null>;
    fetchText: (url: string, authHeader?: string) => Promise<string | undefined>;
    downloadFile: (url: string, destPath: string) => Promise<boolean>;
    getSources: () => Promise<NuGetSource[]>;
    isLocalSource: (sourceUrl: string) => boolean;
    filterHealthySources: (sourceUrls: string[]) => string[];
    getFailedEndpointCacheTTL: () => number;
    getFailedEndpointCache: () => Map<string, number>;
    getHttpRequestTimeout: () => number;
    getMaxDownloadSize: () => number;
    getMaxResponseSize: () => number;
    sanitizeForLogging: (text: string) => string;
}

export class NuGetPackageService {
    // LRU cache for package metadata (key: packageId@version, max 200 entries)
    private metadataCache: LRUMap<string, PackageMetadata> = new LRUMap(200);
    // LRU cache for resolved icon URLs (key: packageId@version, max 500 entries)
    private iconUrlCache: LRUMap<string, string> = new LRUMap(500);
    // LRU cache for package versions (key: packageId@source@prerelease@take, max 200 entries)
    private versionsCache: LRUMap<string, string[]> = new LRUMap(200);
    // LRU cache for verified status (key: packageId, max 300 entries)
    private verifiedStatusCache: LRUMap<string, { verified: boolean; authors?: string; description?: string }> = new LRUMap(300);
    // LRU cache for search results (max 100 entries)
    private searchResultsCache: LRUMap<string, PackageSearchResult[]> = new LRUMap(100);
    // LRU cache for autocomplete results (key: query@source@prerelease, max 50 entries)
    private autocompleteCache: LRUMap<string, { data: string[]; timestamp: number }> = new LRUMap(50);
    // Autocomplete cache TTL: 30 seconds
    private static readonly AUTOCOMPLETE_CACHE_TTL = 30000;
    // In-memory vulnerability data: Map<lowercasePackageId, Array<{severity, url, versions}>>
    private vulnerabilityData: Map<string, { severity: number; url: string; versions: string }[]> = new Map();
    // Timestamp of last vulnerability data fetch
    private vulnerabilityDataTimestamp: number = 0;
    // Vulnerability data TTL: 1 hour
    private static readonly VULNERABILITY_CACHE_TTL = 3600000;
    // Cached global-packages folder path (resolved once via dotnet CLI)
    private _globalPackagesFolder: string | null = null;
    // Circuit breaker for icon resolution per source — skip sources after N consecutive misses
    private iconSourceMissCount: Map<string, number> = new Map();
    private static readonly ICON_SOURCE_MISS_THRESHOLD = 5;

    private readonly _deps: PackageServiceDeps;

    constructor(deps: PackageServiceDeps) {
        this._deps = deps;
    }

    /**
     * Clear all package-related caches.
     * Called by NuGetService.clearSourceErrors().
     */
    clearCaches(): void {
        this.iconSourceMissCount.clear();
        this.vulnerabilityData.clear();
        this.vulnerabilityDataTimestamp = 0;
    }

    /**
     * Clear all cached package version data (in-memory LRU + workspace persistent cache).
     */
    clearVersionsCache(): void {
        this.versionsCache.clear();
        workspaceCache.clearByPrefix('versions:');
    }

    // ── Vulnerability data ──────────────────────────────────────────────

    /**
     * Fetch and cache vulnerability data from all enabled sources.
     * Downloads vulnerability index + page files, builds an in-memory lookup map.
     * Data is cached for 1 hour (VULNERABILITY_CACHE_TTL).
     */
    private async fetchVulnerabilityData(): Promise<void> {
        // Return cached data if still fresh
        if (this.vulnerabilityData.size > 0 && (Date.now() - this.vulnerabilityDataTimestamp) < NuGetPackageService.VULNERABILITY_CACHE_TTL) {
            return;
        }

        const allSources = await this._deps.getSources();
        const enabledSources = allSources.filter(s => s.enabled && !this._deps.isLocalSource(s.url));

        const newData = new Map<string, { severity: number; url: string; versions: string }[]>();

        for (const source of enabledSources) {
            try {
                const endpoints = await this._deps.discoverServiceEndpoints(source.url);
                if (!endpoints.vulnerabilityInfoUrl) { continue; }

                const authHeader = await this._deps.getAuthHeader(source.url);
                // Fetch vulnerability index (array of page references)
                const index = await this._deps.fetchJsonWithCompression<{ '@name': string; '@id': string; '@updated': string }[]>(
                    endpoints.vulnerabilityInfoUrl, authHeader
                );
                if (!Array.isArray(index) || index.length === 0) { continue; }

                // Fetch each vulnerability page and merge into lookup
                for (const page of index) {
                    if (!page['@id']) { continue; }
                    try {
                        const pageData = await this._deps.fetchJsonWithCompression<Record<string, { severity: number; url: string; versions: string }[]>>(
                            page['@id'], authHeader
                        );
                        if (!pageData || typeof pageData !== 'object') {
                            console.warn(`[NuGet] Vulnerability page returned no data: ${page['@id']}`);
                            continue;
                        }

                        for (const [pkgId, vulns] of Object.entries(pageData)) {
                            if (!Array.isArray(vulns)) { continue; }
                            const lowerPkgId = pkgId.toLowerCase();
                            const existing = newData.get(lowerPkgId) || [];
                            for (const v of vulns) {
                                if (v && typeof v.severity === 'number' && v.url && v.versions) {
                                    existing.push({ severity: v.severity, url: v.url, versions: v.versions });
                                }
                            }
                            if (existing.length > 0) {
                                newData.set(lowerPkgId, existing);
                            }
                        }
                    } catch {
                        // Skip individual page failures
                    }
                }
            } catch {
                // Skip source failures — vulnerability data is best-effort
            }
        }

        this.vulnerabilityData = newData;
        this.vulnerabilityDataTimestamp = Date.now();
    }

    /**
     * Map NuGet vulnerability severity integer to named severity.
     */
    private static mapSeverity(severity: number): VulnerabilitySeverity {
        switch (severity) {
            case 0: return 'Low';
            case 1: return 'Moderate';
            case 2: return 'High';
            case 3: return 'Critical';
            default: return 'Low';
        }
    }

    /**
     * Look up known vulnerabilities for a specific package version.
     */
    private getVulnerabilities(packageId: string, version: string): PackageVulnerability[] {
        const vulns = this.vulnerabilityData.get(packageId.toLowerCase());
        if (!vulns || vulns.length === 0) { return []; }

        const matches: PackageVulnerability[] = [];
        for (const v of vulns) {
            if (isVersionInRange(version, v.versions)) {
                matches.push({
                    advisoryUrl: v.url,
                    severity: NuGetPackageService.mapSeverity(v.severity)
                });
            }
        }
        return matches;
    }

    // ── Package size ────────────────────────────────────────────────────

    /**
     * Get the download size of a package (in bytes) via HEAD request to the flat container nupkg URL.
     * Returns -1 if size cannot be determined.
     */
    async getPackageSize(packageId: string, version: string, sourceUrl?: string): Promise<number> {
        try {
            const source = sourceUrl || 'https://api.nuget.org/v3/index.json';
            const endpoints = await this._deps.discoverServiceEndpoints(source);
            if (!endpoints.packageBaseAddress) { return -1; }

            const baseUrl = endpoints.packageBaseAddress.replace(/\/$/, '');
            const nupkgUrl = `${baseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}/${packageId.toLowerCase()}.${version.toLowerCase()}.nupkg`;
            const authHeader = await this._deps.getAuthHeader(source);
            return await http2Client.headRequestContentLength(nupkgUrl, authHeader);
        } catch {
            return -1;
        }
    }

    // ── Installed package metadata enrichment ───────────────────────────

    /**
     * Fetch icon URLs, verified status, and authors for installed packages from NuGet API or custom sources.
     * Uses NuGet search API for verified status and authors.
     * Batches requests to limit concurrent network operations.
     */
    async fetchInstalledPackageMetadata(packages: InstalledPackage[]): Promise<void> {
        // Get all enabled sources for fallback
        const allSources = await this._deps.getSources();
        const enabledSources = allSources.filter(s => s.enabled);

        await batchedPromiseAll(packages, async (pkg) => {
            let foundMetadata = false;

            // Use resolved version for icon fetching if available (for floating/range versions)
            const versionForIcon = pkg.resolvedVersion || pkg.version;

            // Single search API call: gets verified, authors, AND iconUrl
            const { verified, authors, iconUrl } = await this.getPackageSearchMetadata(pkg.id, versionForIcon);
            if (iconUrl) {
                pkg.iconUrl = iconUrl;
            }
            if (verified !== undefined) {
                pkg.verified = verified;
                foundMetadata = true;
            }
            if (authors) {
                pkg.authors = authors;
                foundMetadata = true;
            }

            // If search API didn't return an icon, fall back to resolveIconUrl (custom sources)
            if (!pkg.iconUrl) {
                const fallbackIcon = await this.resolveIconUrl(pkg.id, versionForIcon, enabledSources);
                if (fallbackIcon) {
                    pkg.iconUrl = fallbackIcon;
                }
            }

            // If not found on nuget.org, try custom sources for authors
            if (!foundMetadata) {
                for (const source of enabledSources) {
                    if (source.url.includes('nuget.org')) { continue; } // Already tried

                    try {
                        const endpoints = await this._deps.discoverServiceEndpoints(source.url);

                        // Try to get authors from search API
                        if (endpoints.searchQueryService) {
                            const customAuthHeader = await this._deps.getAuthHeader(source.url);
                            const customSearchUrl = `${endpoints.searchQueryService}?q=packageid:${encodeURIComponent(pkg.id)}&take=1&prerelease=true`;
                            const customData = await this._deps.fetchJson<NuGetSearchResponse>(customSearchUrl, customAuthHeader);
                            const customPackages: NuGetSearchEntry[] = customData?.data || customData?.Data || (Array.isArray(customData) ? customData : []);

                            if (customPackages.length > 0) {
                                const result = customPackages[0];
                                if (result.id?.toLowerCase() === pkg.id.toLowerCase() || result.Id?.toLowerCase() === pkg.id.toLowerCase()) {
                                    const authors = result.authors || result.Authors;
                                    if (authors) {
                                        pkg.authors = Array.isArray(authors) ? authors.join(', ') : authors;
                                    }
                                    break; // Found
                                }
                            }
                        }
                    } catch {
                        // Silently fail for individual sources
                    }
                }
            }
        }, 16); // Sliding-window concurrency (was 8 batch-then-wait)

        // Enrich with vulnerability data (best-effort, non-blocking)
        try {
            await this.fetchVulnerabilityData();
            for (const pkg of packages) {
                const version = pkg.resolvedVersion || pkg.version;
                const vulns = this.getVulnerabilities(pkg.id, version);
                if (vulns.length > 0) {
                    pkg.vulnerabilities = vulns;
                }
            }
        } catch {
            // Vulnerability enrichment is best-effort — don't fail the whole flow
        }
    }

    // ── Autocomplete ────────────────────────────────────────────────────

    /**
     * Autocomplete package IDs for quick search (typeahead).
     * Uses the NuGet Autocomplete API which returns only package ID strings - much lighter than full search.
     */
    async autocompletePackageId(
        query: string,
        sources?: string[],
        includePrerelease?: boolean,
        take: number = 5
    ): Promise<string[]> {
        if (!query || query.trim().length < 2) {
            return [];
        }

        const trimmedQuery = query.trim();
        const validSources = sources?.filter(s => s && s.trim() && !this._deps.isLocalSource(s)) || [];

        const isMultipleSources = validSources.length > 1 || validSources.length === 0;
        const nugetOrgUrl = 'https://api.nuget.org/v3/index.json';
        const sourcesToSearch = isMultipleSources
            ? [nugetOrgUrl, ...validSources.filter(s => !s.includes('nuget.org'))]
            : validSources;

        const uniqueSources = [...new Set(sourcesToSearch)];

        const sourceKey = isMultipleSources ? 'all' : uniqueSources[0] || 'nuget.org';
        const cacheKey = `${trimmedQuery.toLowerCase()}|${sourceKey}|${includePrerelease ? 'pre' : 'stable'}|${take}`;

        // Check cache (30-second TTL)
        const cached = this.autocompleteCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < NuGetPackageService.AUTOCOMPLETE_CACHE_TTL) {
            return cached.data;
        }

        // Query all sources in parallel
        const fetchPromises = uniqueSources.map(async (sourceUrl): Promise<string[]> => {
            try {
                const endpoints = await this._deps.discoverServiceEndpoints(sourceUrl);

                // Try Autocomplete API first (lightweight, returns just IDs)
                if (endpoints.searchAutocompleteService) {
                    const params = new URLSearchParams({
                        q: trimmedQuery,
                        take: take.toString(),
                        semVerLevel: '2.0.0'
                    });
                    if (includePrerelease) {
                        params.set('prerelease', 'true');
                    }

                    const autocompleteUrl = `${endpoints.searchAutocompleteService}?${params.toString()}`;
                    const authHeader = await this._deps.getAuthHeader(sourceUrl);
                    const result = await this._deps.fetchJson<{ data: string[]; totalHits?: number }>(autocompleteUrl, authHeader);

                    if (result?.data && Array.isArray(result.data)) {
                        return result.data;
                    }
                }

                // Fall back to Search API (heavier, but many private feeds lack autocomplete)
                if (endpoints.searchQueryService) {
                    const params = new URLSearchParams({
                        q: trimmedQuery,
                        take: take.toString(),
                        semVerLevel: '2.0.0'
                    });
                    if (includePrerelease) {
                        params.set('prerelease', 'true');
                    }

                    const searchUrl = `${endpoints.searchQueryService}?${params.toString()}`;
                    const authHeader = await this._deps.getAuthHeader(sourceUrl);
                    const result = await this._deps.fetchJson<{ data: Array<{ id: string }> }>(searchUrl, authHeader);

                    if (result?.data && Array.isArray(result.data)) {
                        return result.data.map(pkg => pkg.id);
                    }
                }
            } catch {
                // Silently fail for individual sources
            }
            return [];
        });

        // Wait for all sources with a 2s timeout cap
        let results: PromiseSettledResult<string[]>[];
        if (isMultipleSources && uniqueSources.length > 1) {
            const settled: (string[] | null)[] = new Array(fetchPromises.length).fill(null);
            const wrappedPromises = fetchPromises.map((p, i) =>
                p.then(value => { settled[i] = value; return value; })
                    .catch(() => { settled[i] = []; return [] as string[]; })
            );

            const allDone = Promise.all(wrappedPromises);
            const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 2000));
            const raceResult = await Promise.race([allDone, timeout]);

            if (raceResult !== null) {
                results = raceResult.map(v => ({ status: 'fulfilled' as const, value: v }));
            } else {
                results = settled.map(v =>
                    v !== null
                        ? { status: 'fulfilled' as const, value: v }
                        : { status: 'fulfilled' as const, value: [] as string[] }
                );
            }
        } else {
            results = await Promise.allSettled(fetchPromises);
        }

        // Merge results: nuget.org first, then custom sources
        const allResults: string[] = [];
        const seenIds = new Set<string>();

        for (const result of results) {
            if (result.status === 'fulfilled') {
                for (const packageId of result.value) {
                    const lowerId = packageId.toLowerCase();
                    if (!seenIds.has(lowerId)) {
                        seenIds.add(lowerId);
                        allResults.push(packageId);
                    }
                }
            }
        }

        // Sort by relevance (exact prefix match first, then alphabetically)
        const lowerQuery = trimmedQuery.toLowerCase();
        allResults.sort((a, b) => {
            const aLower = a.toLowerCase();
            const bLower = b.toLowerCase();
            const aStartsWith = aLower.startsWith(lowerQuery);
            const bStartsWith = bLower.startsWith(lowerQuery);
            if (aStartsWith && !bStartsWith) {
                return -1;
            }
            if (!aStartsWith && bStartsWith) {
                return 1;
            }
            return aLower.localeCompare(bLower);
        });

        const finalResults = allResults.slice(0, take);
        this.autocompleteCache.set(cacheKey, { data: finalResults, timestamp: Date.now() });

        return finalResults;
    }

    // ── Quick search ────────────────────────────────────────────────────

    /**
     * Grouped quick search - returns results grouped by source.
     * Uses Autocomplete API for nuget.org (fast), Search API for other sources.
     */
    async quickSearchGrouped(
        query: string,
        sources: Array<{ name: string; url: string }>,
        includePrerelease?: boolean,
        take: number = 5
    ): Promise<QuickSearchSourceResult[]> {
        if (!query || query.trim().length < 2) {
            return [];
        }

        const trimmedQuery = query.trim();

        // Filter out local sources
        const validSources = sources.filter(s => s.url && !this._deps.isLocalSource(s.url));

        if (validSources.length === 0) {
            // Default to nuget.org if no sources
            validSources.push({ name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json' });
        }

        // Separate nuget.org from other sources
        const isNugetOrg = (url: string) => url.includes('api.nuget.org') || url.includes('nuget.org/v3');
        const nugetOrgSources = validSources.filter(s => isNugetOrg(s.url));
        const otherSources = validSources.filter(s => !isNugetOrg(s.url));

        // Create fetch promises for all sources in parallel
        const fetchPromises: Promise<QuickSearchSourceResult | null>[] = [];

        // nuget.org uses Autocomplete API (fast, lightweight)
        if (nugetOrgSources.length > 0) {
            fetchPromises.push(this.quickSearchNugetOrg(trimmedQuery, includePrerelease, take));
        }

        // Other sources use Search API
        for (const source of otherSources) {
            fetchPromises.push(this.quickSearchSource(source.url, source.name, trimmedQuery, includePrerelease, take));
        }

        // Execute all in parallel
        const results = await Promise.all(fetchPromises);

        const groupedResults: QuickSearchSourceResult[] = [];
        for (const result of results) {
            if (result && result.packageIds.length > 0) {
                groupedResults.push(result);
            }
        }

        return groupedResults;
    }

    /**
     * Quick search nuget.org using Autocomplete API
     */
    private async quickSearchNugetOrg(
        query: string,
        includePrerelease?: boolean,
        take: number = 5
    ): Promise<QuickSearchSourceResult | null> {
        try {
            const nugetOrgUrl = 'https://api.nuget.org/v3/index.json';
            const endpoints = await this._deps.discoverServiceEndpoints(nugetOrgUrl);

            if (!endpoints.searchAutocompleteService) {
                return null;
            }

            const params = new URLSearchParams({
                q: query,
                take: take.toString(),
                semVerLevel: '2.0.0'
            });
            if (includePrerelease) {
                params.set('prerelease', 'true');
            }

            const autocompleteUrl = `${endpoints.searchAutocompleteService}?${params.toString()}`;
            const result = await this._deps.fetchJson<{ data: string[]; totalHits?: number }>(autocompleteUrl);

            if (result?.data && Array.isArray(result.data)) {
                return {
                    sourceName: 'nuget.org',
                    sourceUrl: nugetOrgUrl,
                    packageIds: result.data
                };
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Quick search a single source using Search API
     */
    private async quickSearchSource(
        sourceUrl: string,
        sourceName: string,
        query: string,
        includePrerelease?: boolean,
        take: number = 5
    ): Promise<QuickSearchSourceResult | null> {
        try {
            const endpoints = await this._deps.discoverServiceEndpoints(sourceUrl);

            if (!endpoints.searchQueryService) {
                return null;
            }

            const params = new URLSearchParams({
                q: query,
                take: take.toString(),
                semVerLevel: '2.0.0'
            });
            if (includePrerelease) {
                params.set('prerelease', 'true');
            }

            // Try with auth header
            const authHeader = await this._deps.getAuthHeader(sourceUrl);

            const searchUrl = `${endpoints.searchQueryService}?${params.toString()}`;
            const result = await this._deps.fetchJson<{ data: Array<{ id: string }> }>(searchUrl, authHeader);

            if (result?.data && Array.isArray(result.data)) {
                const packageIds = result.data.map(pkg => pkg.id).slice(0, take);

                return {
                    sourceName: sourceName,
                    sourceUrl: sourceUrl,
                    packageIds: packageIds
                };
            }

            return null;
        } catch {
            return null;
        }
    }

    // ── Search packages ─────────────────────────────────────────────────

    /**
     * Search for packages via the NuGet Search API (nuget.org only).
     * Returns null if the API is not available (triggers CLI fallback).
     */
    private async searchPackagesViaApi(
        query: string,
        includePrerelease: boolean,
        liteMode: boolean,
        take: number,
        exactMatch: boolean
    ): Promise<PackageSearchResult[] | null> {
        try {
            const nugetOrgUrl = 'https://api.nuget.org/v3/index.json';
            const endpoints = await this._deps.discoverServiceEndpoints(nugetOrgUrl);
            if (!endpoints.searchQueryService) {
                return null;
            }

            const searchQuery = exactMatch ? `packageid:${query}` : query;
            const params = new URLSearchParams({
                q: searchQuery,
                take: take.toString(),
                semVerLevel: '2.0.0'
            });
            if (includePrerelease) {
                params.set('prerelease', 'true');
            }

            const searchUrl = `${endpoints.searchQueryService}?${params.toString()}`;
            const data = await this._deps.fetchJson<{
                totalHits?: number;
                data: Array<{
                    id: string;
                    version: string;
                    description?: string;
                    authors?: string | string[];
                    totalDownloads?: number;
                    verified?: boolean;
                    iconUrl?: string;
                }>;
            }>(searchUrl);

            if (!data?.data || !Array.isArray(data.data)) {
                return null;
            }

            // Transform results
            const packages: PackageSearchResult[] = [];
            for (const item of data.data) {
                if (!item.id || !item.version) {
                    continue;
                }

                // Normalize authors to string
                const authors = Array.isArray(item.authors)
                    ? item.authors.join(', ')
                    : (item.authors || '');

                const pkg: PackageSearchResult = {
                    id: item.id,
                    version: item.version,
                    versions: [],
                    verified: liteMode ? undefined : item.verified,
                    description: '',
                    authors: liteMode ? '' : authors,
                    totalDownloads: item.totalDownloads,
                };

                // Try to resolve icon URL from flat container (version-specific, no HEAD needed)
                // The search API's iconUrl field confirms an icon exists in the package
                if (item.iconUrl && !item.version.includes('*') && !item.version.includes('[') && !item.version.includes('(')) {
                    const lowerId = item.id.toLowerCase();
                    const lowerVersion = item.version.toLowerCase();
                    const flatContainerUrl = `https://api.nuget.org/v3-flatcontainer/${lowerId}/${lowerVersion}/icon`;
                    pkg.iconUrl = flatContainerUrl;

                    // Pre-populate icon cache
                    if (!liteMode) {
                        const iconCacheKey = cacheKeys.iconExists(item.id, item.version);
                        this.iconUrlCache.set(iconCacheKey, flatContainerUrl);
                    }
                }

                // Pre-populate verified status cache
                if (!liteMode) {
                    const statusCacheKey = cacheKeys.verifiedStatus(item.id);
                    const cacheValue = {
                        verified: item.verified === true,
                        authors: authors || undefined,
                        description: item.description
                    };
                    this.verifiedStatusCache.set(statusCacheKey, cacheValue);
                }

                packages.push(pkg);
            }

            return packages;
        } catch {
            return null; // Signal caller to fall back to CLI
        }
    }

    /**
     * Search for packages using API or CLI fallback.
     */
    async searchPackages(query: string, sources?: string[], includePrerelease?: boolean, liteMode?: boolean, take?: number, exactMatch?: boolean): Promise<PackageSearchResult[]> {
        try {
            const searchCacheKey = cacheKeys.searchResults(query, sources || [], includePrerelease ?? false) + (liteMode ? ':lite' : '') + (take ? `:take${take}` : '') + (exactMatch ? ':exact' : '');

            // Check in-memory cache
            const memoryCached = this.searchResultsCache.get(searchCacheKey);
            if (memoryCached) {
                return memoryCached;
            }

            // Check workspace cache
            const workspaceCached = workspaceCache.get<PackageSearchResult[]>(searchCacheKey);
            if (workspaceCached) {
                return workspaceCached;
            }

            let sourceArg = '';

            const validSources = sources?.filter(s => s && s.trim()) || [];

            // Filter out unhealthy sources before CLI call
            const healthySources = validSources.length > 0 ? this._deps.filterHealthySources(validSources) : [];

            // Check if we're effectively using only nuget.org → can use API instead of CLI
            const isNugetOrg = (url: string) => url.includes('api.nuget.org') || url.includes('nuget.org/v3');
            let isSingleNugetOrgSource = false;
            if (validSources.length === 1 && isNugetOrg(validSources[0])) {
                isSingleNugetOrgSource = true;
            } else if (validSources.length === 0) {
                const configuredSources = await this._deps.getSources();
                const remoteSources = configuredSources.filter(s => s.enabled && !this._deps.isLocalSource(s.url));
                isSingleNugetOrgSource = remoteSources.length === 1 && isNugetOrg(remoteSources[0].url);
            }

            if (isSingleNugetOrgSource) {
                const config = vscode.workspace.getConfiguration('nuiget');
                const searchResultLimit = take ?? config.get<number>('searchResultLimit', 20);

                const apiResults = await this.searchPackagesViaApi(
                    query, includePrerelease ?? false, liteMode ?? false, searchResultLimit, exactMatch ?? false);
                if (apiResults !== null) {
                    // Cache and return
                    if (apiResults.length > 0) {
                        this.searchResultsCache.set(searchCacheKey, apiResults);
                        workspaceCache.set(searchCacheKey, apiResults, CACHE_TTL.SEARCH_RESULTS);
                    }
                    return apiResults;
                }
            }

            // Build source argument for CLI
            if (healthySources.length > 0) {
                sourceArg = healthySources.map(s => `--source "${s}"`).join(' ');
            }

            const prereleaseArg = includePrerelease ? '--prerelease' : '';

            const config = vscode.workspace.getConfiguration('nuiget');
            const searchResultLimit = take ?? config.get<number>('searchResultLimit', 20);
            const exactMatchArg = exactMatch ? '--exact-match' : '';

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const command = `dotnet package search "${query}" ${sourceArg} ${prereleaseArg} ${exactMatchArg} --take ${searchResultLimit}`;
            const { stdout } = await execWithTimeout(command, { cwd: workspaceFolder });

            // Parse CLI output
            const packages: PackageSearchResult[] = [];
            const lines = stdout.split('\n');
            const seenIds = new Set<string>();

            for (const line of lines) {
                // Skip header lines and separators
                if (line.includes('---')) {
                    continue;
                }

                const parts = line.split('|').map(p => p.trim()).filter(p => p);
                if (parts.length >= 2) {
                    const packageId = parts[0];
                    const version = parts[1];

                    // Skip header row
                    if (packageId === 'Package ID' || !packageId || !version) {
                        continue;
                    }

                    // Deduplicate
                    if (seenIds.has(packageId)) {
                        continue;
                    }

                    const owners = parts[2] || '';
                    const downloads = parts[3] ? parseInt(parts[3].replace(/[^\d]/g, ''), 10) : undefined;

                    packages.push({
                        id: packageId,
                        version: version,
                        versions: [],
                        description: '',
                        authors: liteMode ? '' : owners,
                        totalDownloads: downloads,
                    });

                    seenIds.add(packageId);
                }
            }

            // Enrich with metadata if not in lite mode
            if (!liteMode) {
                // Pre-fetch enabled sources for icon resolution
                const allSources = await this._deps.getSources();
                const enabledSources = allSources.filter(s => s.enabled);

                await batchedPromiseAll(packages, async (pkg) => {
                    // Single API call for verified/authors/iconUrl
                    const { verified, authors, iconUrl } = await this.getPackageSearchMetadata(pkg.id, pkg.version);
                    let foundMetadata = false;
                    if (iconUrl) {
                        pkg.iconUrl = iconUrl;
                    }
                    if (verified !== undefined) {
                        pkg.verified = verified;
                        foundMetadata = true;
                    }

                    if (authors) {
                        pkg.authors = authors;
                        foundMetadata = true;
                    }

                    // Try to fill description from verified status cache
                    if (!pkg.description) {
                        const statusCacheKey = cacheKeys.verifiedStatus(pkg.id);
                        const cached = this.verifiedStatusCache.get(statusCacheKey);
                        if (cached?.description) {
                            pkg.description = cached.description;
                            foundMetadata = true;
                        }
                    }

                    // Fallback icon resolution from custom sources
                    if (!pkg.iconUrl) {
                        const fallbackIcon = await this.resolveIconUrl(pkg.id, pkg.version, enabledSources);
                        if (fallbackIcon) {
                            pkg.iconUrl = fallbackIcon;
                        }
                    }

                    // Try custom sources for metadata
                    if (!foundMetadata) {
                        for (const source of enabledSources) {
                            if (source.url.includes('nuget.org')) { continue; }

                            const failedAt = this._deps.getFailedEndpointCache().get(source.url);
                            if (failedAt && (Date.now() - failedAt) < this._deps.getFailedEndpointCacheTTL()) {
                                continue;
                            }

                            try {
                                const endpoints = await this._deps.discoverServiceEndpoints(source.url);
                                if (endpoints.searchQueryService) {
                                    const customAuthHeader = await this._deps.getAuthHeader(source.url);
                                    const customSearchUrl = `${endpoints.searchQueryService}?q=packageid:${encodeURIComponent(pkg.id)}&take=1&prerelease=true`;
                                    const customData = await this._deps.fetchJson<NuGetSearchResponse>(customSearchUrl, customAuthHeader);
                                    const customPackages: NuGetSearchEntry[] = customData?.data || customData?.Data || (Array.isArray(customData) ? customData : []);

                                    if (customPackages.length > 0) {
                                        const result = customPackages[0];
                                        if (result.id?.toLowerCase() === pkg.id.toLowerCase() || result.Id?.toLowerCase() === pkg.id.toLowerCase()) {
                                            const customAuthors = result.authors || result.Authors;
                                            if (customAuthors) {
                                                pkg.authors = Array.isArray(customAuthors) ? customAuthors.join(', ') : customAuthors;
                                            }
                                            const desc = result.description || result.Description || result.summary || result.Summary;
                                            if (desc && !pkg.description) {
                                                pkg.description = desc;
                                            }
                                            const cacheValue = {
                                                verified: false,
                                                authors: pkg.authors,
                                                description: pkg.description
                                            };
                                            const statusCacheKey = cacheKeys.verifiedStatus(pkg.id);
                                            this.verifiedStatusCache.set(statusCacheKey, cacheValue);
                                            break;
                                        }
                                    }
                                }
                            } catch {
                                // Silently skip failed custom sources
                            }
                        }
                    }
                }, 16);
            }

            // Cache results
            if (packages.length > 0) {
                this.searchResultsCache.set(searchCacheKey, packages);
                workspaceCache.set(searchCacheKey, packages, CACHE_TTL.SEARCH_RESULTS);
            }

            return packages;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to search packages: ${error}`);
            return [];
        }
    }

    // ── Icon URL resolution ─────────────────────────────────────────────

    /**
     * Resolve the icon URL for a package, trying nuget.org first for speed,
     * then falling back to custom sources via discovered endpoints.
     */
    private async resolveIconUrl(
        packageId: string,
        version: string,
        enabledSources?: Array<{ url: string }>
    ): Promise<string | undefined> {
        // Skip wildcard/range versions
        if (version.includes('*') || version.includes('[') || version.includes('(')) {
            return undefined;
        }

        const cacheKey = cacheKeys.iconExists(packageId, version);

        // Check in-memory cache first (fastest)
        const memoryCached = this.iconUrlCache.get(cacheKey);
        if (memoryCached !== undefined) {
            return memoryCached || undefined; // empty string → undefined
        }

        // Check workspace cache (persists across panel closes)
        const workspaceCached = workspaceCache.get<string>(cacheKey);
        if (workspaceCached !== undefined) {
            this.iconUrlCache.set(cacheKey, workspaceCached);
            return workspaceCached || undefined;
        }

        const lowerId = packageId.toLowerCase();
        const lowerVersion = version.toLowerCase();

        // 1. Try nuget.org flat container first (fast path — HTTP/2 multiplexed HEAD)
        const nugetOrgUrl = `https://api.nuget.org/v3-flatcontainer/${lowerId}/${lowerVersion}/icon`;
        const nugetOrgExists = await this.checkUrlExists(nugetOrgUrl);
        if (nugetOrgExists) {
            this.iconUrlCache.set(cacheKey, nugetOrgUrl);
            workspaceCache.set(cacheKey, nugetOrgUrl, CACHE_TTL.ICON_EXISTS);
            return nugetOrgUrl;
        }

        // 2. Try custom sources via discovered packageBaseAddress
        if (enabledSources) {
            for (const source of enabledSources) {
                if (source.url.includes('nuget.org') || this._deps.isLocalSource(source.url)) {
                    continue;
                }

                // Circuit breaker: skip sources that consistently have no icons
                const missCount = this.iconSourceMissCount.get(source.url) || 0;
                if (missCount >= NuGetPackageService.ICON_SOURCE_MISS_THRESHOLD) {
                    continue;
                }

                try {
                    const endpoints = await this._deps.discoverServiceEndpoints(source.url);
                    if (endpoints.packageBaseAddress) {
                        const customIconUrl = `${endpoints.packageBaseAddress.replace(/\/$/, '')}/${lowerId}/${lowerVersion}/icon`;
                        const authHeader = await this._deps.getAuthHeader(source.url);
                        const customExists = await this.checkUrlExists(customIconUrl, authHeader);
                        if (customExists) {
                            this.iconSourceMissCount.delete(source.url);
                            this.iconUrlCache.set(cacheKey, customIconUrl);
                            workspaceCache.set(cacheKey, customIconUrl, CACHE_TTL.ICON_EXISTS);
                            return customIconUrl;
                        } else {
                            this.iconSourceMissCount.set(source.url, missCount + 1);
                        }
                    }
                } catch {
                    // Silently skip failed sources
                }
            }
        }

        // 3. No icon found — cache as empty string with 24h TTL
        this.iconUrlCache.set(cacheKey, '');
        workspaceCache.set(cacheKey, '', 24 * 60 * 60 * 1000);
        return undefined;
    }

    /**
     * Check if a URL exists (returns 200) - raw HTTP check, no caching
     */
    private async checkUrlExists(url: string, authHeader?: string): Promise<boolean> {
        if (url.includes('.nuget.org')) {
            const statusCode = await http2Client.headRequest(url);
            if (isRedirectStatus(statusCode)) {
                return this.checkUrlExistsHttp1(url);
            }
            return statusCode === 200;
        }
        return this.checkUrlExistsHttp1(url, authHeader);
    }

    /**
     * HTTP/1.1 URL check with redirect handling
     */
    private checkUrlExistsHttp1(url: string, authHeader?: string, maxRedirects: number = 5): Promise<boolean> {
        return new Promise((resolve) => {
            if (maxRedirects <= 0) {
                resolve(false);
                return;
            }
            const client = url.startsWith('https://') ? https : http;
            const headers: Record<string, string> = {};
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }
            const req = client.request(url, { method: 'HEAD', headers }, (res) => {
                // Handle redirects (with SSRF protection)
                const redirect = resolveRedirect(res.statusCode, res.headers.location, url, authHeader);
                if (redirect) {
                    this.checkUrlExistsHttp1(redirect.redirectUrl, redirect.forwardAuth, maxRedirects - 1).then(resolve);
                    return;
                }
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(5000, () => {
                req.destroy();
                resolve(false);
            });
            req.end();
        });
    }

    // ── Package versions ────────────────────────────────────────────────

    /**
     * Get package versions, optionally from a specific source.
     */
    async getPackageVersions(packageId: string, source?: string, includePrerelease?: boolean, take: number = 20): Promise<string[]> {
        try {
            if (!source || source === 'all') {
                const allSources = await this._deps.getSources();
                const enabledSources = allSources.filter(s => s.enabled);

                if (take <= 1) {
                    // For update checks (take=1), race for speed
                    const result = await this.raceForFirstResult(
                        enabledSources.map(src =>
                            this.getPackageVersionsFromSource(packageId, src.url, includePrerelease, take)
                                .catch(() => [] as string[])
                        ),
                        (versions) => versions.length > 0
                    );
                    return result;
                }

                // For version listing (take > 1), collect from ALL sources and merge.
                const allResults = await Promise.all(
                    enabledSources.map(src =>
                        this.getPackageVersionsFromSource(packageId, src.url, includePrerelease, take)
                            .catch(() => [] as string[])
                    )
                );

                const merged = new Set<string>();
                for (const versions of allResults) {
                    for (const v of versions) {
                        merged.add(v);
                    }
                }
                const sorted = [...merged].sort((a, b) => {
                    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) * -1;
                });
                return sorted.slice(0, take);
            }

            const result = await this.getPackageVersionsFromSource(packageId, source, includePrerelease, take);
            return result;
        } catch (error) {
            console.error(`[NuGet] Failed to fetch versions for ${packageId}:`, error);
            return [];
        }
    }

    /**
     * Like getPackageVersions but also returns the URL of the source that provided the result.
     */
    async getPackageVersionsWithSource(packageId: string, includePrerelease?: boolean): Promise<{ versions: string[]; sourceUrl?: string }> {
        try {
            const allSources = await this._deps.getSources();
            const enabledSources = allSources.filter(s => s.enabled);

            const { result, winnerIndex } = await this.raceForFirstResultWithIndex(
                enabledSources.map(src =>
                    this.getPackageVersionsFromSource(packageId, src.url, includePrerelease, 1)
                        .catch(() => [] as string[])
                ),
                (versions) => versions.length > 0
            );
            return {
                versions: result,
                sourceUrl: winnerIndex >= 0 ? enabledSources[winnerIndex].url : undefined
            };
        } catch (error) {
            console.error(`[NuGet] Failed to fetch versions with source for ${packageId}:`, error);
            return { versions: [] };
        }
    }

    /**
     * Race multiple promises and resolve with first result that matches predicate.
     */
    private raceForFirstResult<T>(
        promises: Promise<T>[],
        predicate: (result: T) => boolean,
        defaultValue: T = [] as unknown as T
    ): Promise<T> {
        return new Promise((resolve) => {
            let resolved = false;
            let completed = 0;
            const results: T[] = [];

            if (promises.length === 0) {
                resolve(defaultValue);
                return;
            }

            promises.forEach((promise, index) => {
                promise.then((result) => {
                    if (resolved) {
                        return;
                    }

                    if (predicate(result)) {
                        resolved = true;
                        resolve(result);
                        return;
                    }

                    results[index] = result;
                    completed++;

                    if (completed === promises.length) {
                        resolve(results.find(predicate) ?? defaultValue);
                    }
                }).catch(() => {
                    if (resolved) {
                        return;
                    }
                    completed++;
                    if (completed === promises.length && !resolved) {
                        resolve(results.find(predicate) ?? defaultValue);
                    }
                });
            });
        });
    }

    /**
     * Race multiple promises and resolve with the first result matching predicate,
     * also returning the index of the winning promise (for source tracking).
     */
    private raceForFirstResultWithIndex<T>(
        promises: Promise<T>[],
        predicate: (result: T) => boolean,
        defaultValue: T = [] as unknown as T
    ): Promise<{ result: T; winnerIndex: number }> {
        return new Promise((resolve) => {
            let resolved = false;
            let completed = 0;
            const results: T[] = [];

            if (promises.length === 0) {
                resolve({ result: defaultValue, winnerIndex: -1 });
                return;
            }

            promises.forEach((promise, index) => {
                promise.then((result) => {
                    if (resolved) {
                        return;
                    }

                    if (predicate(result)) {
                        resolved = true;
                        resolve({ result, winnerIndex: index });
                        return;
                    }

                    results[index] = result;
                    completed++;

                    if (completed === promises.length) {
                        const fallbackIndex = results.findIndex(predicate);
                        resolve({
                            result: fallbackIndex >= 0 ? results[fallbackIndex] : defaultValue,
                            winnerIndex: fallbackIndex
                        });
                    }
                }).catch(() => {
                    if (resolved) {
                        return;
                    }
                    completed++;
                    if (completed === promises.length && !resolved) {
                        const fallbackIndex = results.findIndex(predicate);
                        resolve({
                            result: fallbackIndex >= 0 ? results[fallbackIndex] : defaultValue,
                            winnerIndex: fallbackIndex
                        });
                    }
                });
            });
        });
    }

    private async getPackageVersionsFromSource(packageId: string, source: string, includePrerelease?: boolean, take: number = 20): Promise<string[]> {
        try {
            if (this._deps.isLocalSource(source)) {
                return [];
            }

            const memoryCacheKey = cacheKeys.versions(packageId, source, includePrerelease ?? false, take);

            const memoryCached = this.versionsCache.get(memoryCacheKey);
            if (memoryCached) {
                return memoryCached;
            }

            const workspaceCached = workspaceCache.get<string[]>(memoryCacheKey);
            if (workspaceCached) {
                this.versionsCache.set(memoryCacheKey, workspaceCached);
                return workspaceCached;
            }

            const endpoints = await this._deps.discoverServiceEndpoints(source);
            if (!endpoints.packageBaseAddress && !endpoints.searchQueryService) {
                return [];
            }

            const baseUrl = endpoints.packageBaseAddress?.replace(/\/$/, '');
            if (!baseUrl) {
                return [];
            }
            const searchUrl = endpoints.searchQueryService;

            const authHeader = await this._deps.getAuthHeader(source);

            // Try flat container first
            const url = `${baseUrl}/${packageId.toLowerCase()}/index.json`;
            const versions = await this._deps.fetchJson<{ versions: string[] }>(url, authHeader);

            // If flat container fails, try search API (better for Nexus/ProGet)
            if ((!versions || !versions.versions) && searchUrl) {
                const searchResult = await this._deps.fetchJson<{
                    data: Array<{
                        id: string;
                        version: string;
                        versions: Array<{ version: string; '@id': string }>;
                    }>;
                }>(`${searchUrl}?q=packageid:${encodeURIComponent(packageId)}&take=1&prerelease=${includePrerelease ?? false}`, authHeader);

                if (searchResult?.data?.[0]?.versions) {
                    const pkgVersions = searchResult.data[0].versions.map(v => v.version);

                    let allVersions = pkgVersions;
                    if (!includePrerelease) {
                        allVersions = allVersions.filter(v => !v.includes('-'));
                    }
                    const result = [...allVersions].reverse().slice(0, take);

                    if (result.length > 0) {
                        this.versionsCache.set(memoryCacheKey, result);
                        workspaceCache.set(memoryCacheKey, result, CACHE_TTL.VERSIONS);
                    }

                    return result;
                }
            }

            if (!versions || !versions.versions) {
                return [];
            }

            let allVersions = versions.versions;

            if (!includePrerelease) {
                allVersions = allVersions.filter(v => !v.includes('-'));
            }

            const result = [...allVersions].reverse().slice(0, take);

            if (result.length > 0) {
                this.versionsCache.set(memoryCacheKey, result);
                workspaceCache.set(memoryCacheKey, result, CACHE_TTL.VERSIONS);
            }

            return result;
        } catch (error) {
            console.error(`[NuGet] Failed to fetch versions for ${packageId} from source:`, error);
            return [];
        }
    }

    // ── Offline metadata ────────────────────────────────────────────────

    /**
     * Resolve the NuGet global-packages folder path via dotnet CLI.
     * Cached after first successful resolution.
     */
    private async resolveGlobalPackagesFolder(): Promise<string | null> {
        if (this._globalPackagesFolder) { return this._globalPackagesFolder; }
        try {
            const { stdout } = await execWithTimeout('dotnet nuget locals global-packages --list', { timeout: 10000 });
            const match = stdout.match(/global-packages:\s*(.+)/i);
            if (match) {
                const folder = match[1].trim().replace(/[\\/]+$/, '');
                if (fs.existsSync(folder)) {
                    this._globalPackagesFolder = folder;
                    return folder;
                }
            }
        } catch {
            // CLI not available — try default path
        }
        const defaultFolder = path.join(os.homedir(), '.nuget', 'packages');
        if (fs.existsSync(defaultFolder)) {
            this._globalPackagesFolder = defaultFolder;
            return defaultFolder;
        }
        return null;
    }

    /**
     * Get package metadata from the local NuGet global-packages cache (offline fallback).
     */
    private async getOfflineMetadata(packageId: string, version: string): Promise<PackageMetadata | null> {
        try {
            const globalFolder = await this.resolveGlobalPackagesFolder();
            if (!globalFolder) { return null; }

            const lowerId = packageId.toLowerCase();
            const lowerVersion = version.toLowerCase();
            const nuspecPath = path.join(globalFolder, lowerId, lowerVersion, `${lowerId}.nuspec`);

            if (!fs.existsSync(nuspecPath)) { return null; }

            const nuspecContent = await readFileAsync(nuspecPath, 'utf8');

            const getTag = (tag: string): string | undefined => {
                const match = nuspecContent.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
                return match ? match[1].trim() : undefined;
            };

            const id = getTag('id') || packageId;
            const ver = getTag('version') || version;
            const description = getTag('description') || '';
            const authors = getTag('authors') || '';
            const licenseUrl = getTag('licenseUrl');
            const projectUrl = getTag('projectUrl');

            const dependencies: PackageDependencyGroup[] = [];
            const groupRegex = /<group\s+targetFramework="([^"]*)"[^>]*>([\s\S]*?)<\/group>/gi;
            let groupMatch: RegExpExecArray | null;

            const parseDeps = (xml: string): PackageDependency[] => {
                const deps: PackageDependency[] = [];
                const depTagRegex = /<dependency\s+([^>]+?)\/?\s*>/gi;
                let depTag: RegExpExecArray | null;
                while ((depTag = depTagRegex.exec(xml)) !== null) {
                    const attrs = depTag[1];
                    const idMatch = attrs.match(/\bid="([^"]+)"/i);
                    const verMatch = attrs.match(/\bversion="([^"]+)"/i);
                    if (idMatch) {
                        deps.push({ id: idMatch[1], versionRange: verMatch?.[1] || '*' });
                    }
                }
                return deps;
            };

            while ((groupMatch = groupRegex.exec(nuspecContent)) !== null) {
                dependencies.push({
                    targetFramework: groupMatch[1] || 'Any',
                    dependencies: parseDeps(groupMatch[2])
                });
            }

            // Handle ungrouped dependencies
            if (dependencies.length === 0) {
                const depsMatch = nuspecContent.match(/<dependencies[^>]*>([\s\S]*?)<\/dependencies>/i);
                if (depsMatch) {
                    const ungrouped = parseDeps(depsMatch[1]);
                    if (ungrouped.length > 0) {
                        dependencies.push({ targetFramework: 'Any', dependencies: ungrouped });
                    }
                }
            }

            return {
                id,
                version: ver,
                description,
                authors,
                licenseUrl,
                projectUrl,
                dependencies: dependencies,
                offline: true
            };
        } catch {
            return null;
        }
    }

    // ── Package metadata ────────────────────────────────────────────────

    async getPackageMetadata(packageId: string, version: string, source?: string): Promise<PackageMetadata | null> {
        try {
            const cacheKey = `${packageId.toLowerCase()}@${version.toLowerCase()}`;
            const cached = this.metadataCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            let metadata: PackageMetadata | null = null;

            if (!source || source === 'all') {
                const allSources = await this._deps.getSources();
                const enabledSources = allSources.filter(s => s.enabled);

                const metadataPromises = enabledSources.map(src =>
                    this.getPackageMetadataFromSource(packageId, version, src.url)
                        .catch(() => null)
                );

                const results = await Promise.all(metadataPromises);

                for (const result of results) {
                    if (result) {
                        metadata = result;
                        break;
                    }
                }
            } else {
                metadata = await this.getPackageMetadataFromSource(packageId, version, source);
            }

            if (metadata) {
                this.metadataCache.set(cacheKey, metadata);
                return metadata;
            }

            // Offline fallback
            const offlineMetadata = await this.getOfflineMetadata(packageId, version);
            if (offlineMetadata) {
                return offlineMetadata;
            }

            return null;
        } catch (error) {
            console.error(`[NuGet] Failed to fetch metadata for ${packageId}@${version}:`, error);
            return null;
        }
    }

    private async getPackageMetadataFromSource(packageId: string, version: string, source: string): Promise<PackageMetadata | null> {
        try {
            if (this._deps.isLocalSource(source)) {
                return null;
            }

            const endpoints = await this._deps.discoverServiceEndpoints(source);
            if (!endpoints.registrationsBaseUrl && !endpoints.searchQueryService) {
                return null;
            }

            const authHeader = await this._deps.getAuthHeader(source);

            const registrationBaseUrl = endpoints.registrationsBaseUrl?.replace(/\/$/, '');
            const flatContainerBaseUrl = endpoints.packageBaseAddress?.replace(/\/$/, '');
            const searchUrl = endpoints.searchQueryService;

            let registrationData: NuGetRegistrationEntry | null = null;

            // Step 1: Try direct version-specific registration endpoint
            if (registrationBaseUrl) {
                const registrationUrl = `${registrationBaseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}.json`;
                registrationData = await this._deps.fetchJson<NuGetRegistrationEntry>(registrationUrl, authHeader);

                // Step 1b: If direct fetch fails, try the package index
                if (!registrationData) {
                    const packageIndexUrl = `${registrationBaseUrl}/${packageId.toLowerCase()}/index.json`;
                    const packageIndex = await this._deps.fetchJson<NuGetRegistrationEntry>(packageIndexUrl, authHeader);

                    if (packageIndex?.items) {
                        for (const page of packageIndex.items) {
                            const pageItems = page.items || [];
                            for (const item of pageItems) {
                                const entry = typeof item.catalogEntry === 'object' ? item.catalogEntry : null;
                                const itemVersion = entry?.version || item.version;
                                if (itemVersion?.toLowerCase() === version.toLowerCase()) {
                                    registrationData = entry || item;
                                    break;
                                }
                            }
                            if (registrationData) { break; }

                            if (!pageItems.length && page['@id']) {
                                const pageData = await this._deps.fetchJson<NuGetRegistrationPage>(page['@id'], authHeader);
                                if (pageData?.items) {
                                    for (const item of pageData.items) {
                                        const entry = typeof item.catalogEntry === 'object' ? item.catalogEntry : null;
                                        const itemVersion = entry?.version || item.version;
                                        if (itemVersion?.toLowerCase() === version.toLowerCase()) {
                                            registrationData = entry || item;
                                            break;
                                        }
                                    }
                                }
                            }
                            if (registrationData) { break; }
                        }
                    }
                }
            }

            if (!registrationData) {
                if (flatContainerBaseUrl) {
                    const nuspecMetadata = await this.getPackageMetadataFromNuspec(packageId, version, flatContainerBaseUrl, authHeader);
                    if (nuspecMetadata) {
                        return nuspecMetadata;
                    }
                }

                if (searchUrl) {
                    return await this.getPackageMetadataFromSearch(packageId, version, searchUrl, authHeader);
                }

                return null;
            }

            // Step 2: Try to get catalog entry if available
            let catalogEntry: NuGetRegistrationEntry = registrationData;
            const catalogEntryUrl = registrationData.catalogEntry;
            if (catalogEntryUrl && typeof catalogEntryUrl === 'string') {
                const fetchedEntry = await this._deps.fetchJson<NuGetRegistrationEntry>(catalogEntryUrl, authHeader);
                if (fetchedEntry) {
                    catalogEntry = fetchedEntry;
                }
            }

            // If registration data has no description/authors, try search API
            if (!catalogEntry.description && !registrationData.description && searchUrl) {
                const searchMetadata = await this.getPackageMetadataFromSearch(packageId, version, searchUrl, authHeader);
                if (searchMetadata) {
                    const dependencies: PackageDependencyGroup[] = [];
                    const depGroups = catalogEntry.dependencyGroups || registrationData.dependencyGroups;
                    if (depGroups) {
                        for (const group of depGroups) {
                            const deps: PackageDependency[] = [];
                            if (group.dependencies) {
                                for (const dep of group.dependencies) {
                                    deps.push({
                                        id: dep.id || 'Unknown',
                                        versionRange: dep.range || dep.version || '*'
                                    });
                                }
                            }
                            dependencies.push({
                                targetFramework: group.targetFramework || 'Any',
                                dependencies: deps
                            });
                        }
                    }
                    searchMetadata.dependencies = dependencies.length > 0 ? dependencies : searchMetadata.dependencies;
                    return searchMetadata;
                }
            }

            // Parse dependencies
            const dependencies: PackageDependencyGroup[] = [];
            const depGroups = catalogEntry.dependencyGroups || registrationData.dependencyGroups;
            if (depGroups) {
                for (const group of depGroups) {
                    const deps: PackageDependency[] = [];
                    if (group.dependencies) {
                        for (const dep of group.dependencies) {
                            deps.push({
                                id: dep.id || 'Unknown',
                                versionRange: dep.range || dep.version || '*'
                            });
                        }
                    }
                    dependencies.push({
                        targetFramework: group.targetFramework || 'Any',
                        dependencies: deps
                    });
                }
            }

            // Try to fetch readme
            let readme: string | undefined;
            if (flatContainerBaseUrl) {
                const readmeUrl = `${flatContainerBaseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}/readme`;
                try {
                    readme = await this._deps.fetchText(readmeUrl, authHeader);
                } catch {
                    // Readme not available
                }
            }

            const metadataVersion = catalogEntry.version || registrationData.version || version;
            const [vulns, packageSize] = await Promise.all([
                Promise.resolve(this.getVulnerabilities(packageId, metadataVersion)),
                this.getPackageSize(packageId, metadataVersion, source)
            ]);

            const rawAuthors = catalogEntry.authors || registrationData.authors || '';
            const authorsStr = Array.isArray(rawAuthors) ? rawAuthors.join(', ') : rawAuthors;

            return {
                id: catalogEntry.id || registrationData.id || packageId,
                version: metadataVersion,
                description: catalogEntry.description || registrationData.description || '',
                authors: authorsStr,
                license: catalogEntry.licenseExpression || registrationData.licenseExpression || undefined,
                licenseUrl: catalogEntry.licenseUrl || registrationData.licenseUrl || undefined,
                projectUrl: catalogEntry.projectUrl || registrationData.projectUrl || undefined,
                totalDownloads: undefined,
                published: catalogEntry.published || registrationData.published || undefined,
                dependencies: dependencies,
                readme: readme,
                vulnerabilities: vulns.length > 0 ? vulns : undefined,
                packageSize: packageSize > 0 ? packageSize : undefined
            };
        } catch (error) {
            console.error(`[NuGet] Failed to fetch metadata for ${packageId}@${version}:`, error);
            return null;
        }
    }

    /**
     * Get package metadata from search API (works better with Nexus/ProGet)
     */
    private async getPackageMetadataFromSearch(packageId: string, version: string, searchUrl: string, authHeader?: string): Promise<PackageMetadata | null> {
        try {
            const url = `${searchUrl}?q=packageid:${encodeURIComponent(packageId)}&take=1&prerelease=true`;
            const searchResult = await this._deps.fetchJson<NuGetSearchResponse>(url, authHeader);

            const packages: NuGetSearchEntry[] = searchResult?.data || searchResult?.Data || (Array.isArray(searchResult) ? searchResult : []);

            if (packages.length > 0) {
                const pkg = packages[0];

                let authors = '';
                if (pkg.authors) {
                    authors = Array.isArray(pkg.authors) ? pkg.authors.join(', ') : pkg.authors;
                } else if (pkg.Authors) {
                    authors = Array.isArray(pkg.Authors) ? pkg.Authors.join(', ') : pkg.Authors;
                } else if (pkg.owner || pkg.Owner) {
                    authors = pkg.owner ?? pkg.Owner ?? '';
                }

                const description = pkg.description || pkg.Description || pkg.summary || pkg.Summary || '';

                return {
                    id: pkg.id || pkg.Id || packageId,
                    version: version,
                    description: description,
                    authors: authors,
                    license: pkg.licenseExpression || pkg.LicenseExpression || undefined,
                    licenseUrl: pkg.licenseUrl || pkg.LicenseUrl || undefined,
                    projectUrl: pkg.projectUrl || pkg.ProjectUrl || undefined,
                    totalDownloads: pkg.totalDownloads || pkg.TotalDownloads,
                    published: undefined,
                    dependencies: [],
                    readme: undefined
                };
            }

            return null;
        } catch (error) {
            console.error(`[NuGet] Failed to fetch metadata from search for ${packageId}:`, error);
            return null;
        }
    }

    /**
     * Fallback: Get package metadata from nuspec file in flat container
     */
    private async getPackageMetadataFromNuspec(packageId: string, version: string, flatContainerBaseUrl: string, authHeader?: string): Promise<PackageMetadata | null> {
        try {
            const nuspecUrl = `${flatContainerBaseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}/${packageId.toLowerCase()}.nuspec`;
            const nuspecContent = await this._deps.fetchText(nuspecUrl, authHeader);

            if (!nuspecContent) {
                return null;
            }

            const getTagContent = (xml: string, tag: string): string => {
                const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
                return match ? match[1].trim() : '';
            };

            const description = getTagContent(nuspecContent, 'description');
            const authors = getTagContent(nuspecContent, 'authors');
            const licenseUrl = getTagContent(nuspecContent, 'licenseUrl');
            const projectUrl = getTagContent(nuspecContent, 'projectUrl');

            const dependencies: PackageDependencyGroup[] = [];
            const depsMatch = nuspecContent.match(/<dependencies>([\s\S]*?)<\/dependencies>/i);
            if (depsMatch) {
                const depsContent = depsMatch[1];
                const groupMatches = depsContent.matchAll(/<group[^>]*targetFramework\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/group>/gi);
                for (const groupMatch of groupMatches) {
                    const targetFramework = groupMatch[1] || 'Any';
                    const groupContent = groupMatch[2];
                    const deps: PackageDependency[] = [];
                    const depMatches = groupContent.matchAll(/<dependency\s+id\s*=\s*"([^"]+)"(?:\s+version\s*=\s*"([^"]*)")?/gi);
                    for (const depMatch of depMatches) {
                        deps.push({
                            id: depMatch[1],
                            versionRange: depMatch[2] || '*'
                        });
                    }
                    dependencies.push({ targetFramework, dependencies: deps });
                }
                if (dependencies.length === 0) {
                    const deps: PackageDependency[] = [];
                    const depMatches = depsContent.matchAll(/<dependency\s+id\s*=\s*"([^"]+)"(?:\s+version\s*=\s*"([^"]*)")?/gi);
                    for (const depMatch of depMatches) {
                        deps.push({
                            id: depMatch[1],
                            versionRange: depMatch[2] || '*'
                        });
                    }
                    if (deps.length > 0) {
                        dependencies.push({ targetFramework: 'Any', dependencies: deps });
                    }
                }
            }

            return {
                id: packageId,
                version: version,
                description: description,
                authors: authors,
                license: undefined,
                licenseUrl: licenseUrl || undefined,
                projectUrl: projectUrl || undefined,
                totalDownloads: undefined,
                published: undefined,
                dependencies: dependencies,
                readme: undefined
            };
        } catch (error) {
            console.error(`Failed to fetch nuspec for ${packageId}@${version}:`, error);
            return null;
        }
    }

    // ── Update checks ───────────────────────────────────────────────────

    /**
     * Check for updates for installed packages.
     * Returns packages that have newer versions available.
     */
    async checkPackageUpdates(
        installedPackages: InstalledPackage[],
        includePrerelease: boolean
    ): Promise<{
        id: string;
        installedVersion: string;
        latestVersion: string;
        iconUrl?: string;
        verified?: boolean;
        authors?: string;
        sourceUrl?: string;
    }[]> {
        const packagesWithUpdates: {
            id: string;
            installedVersion: string;
            latestVersion: string;
            iconUrl?: string;
            verified?: boolean;
            authors?: string;
            sourceUrl?: string;
        }[] = [];

        const allSources = await this._deps.getSources();
        const enabledSources = allSources.filter(s => s.enabled);

        const results = await batchedPromiseAll(installedPackages, async (pkg) => {
            try {
                if (pkg.versionType === 'floating') {
                    return null;
                }
                if (pkg.versionType === 'range') {
                    return null;
                }

                const { versions, sourceUrl } = await this.getPackageVersionsWithSource(pkg.id, includePrerelease);
                if (versions.length === 0) {
                    return null;
                }

                const latestVersion = versions[0];

                if (isNewerVersion(latestVersion, pkg.version)) {
                    const { verified, authors, iconUrl } = await this.getPackageSearchMetadata(pkg.id, latestVersion);

                    let finalIconUrl = iconUrl;
                    if (!finalIconUrl) {
                        finalIconUrl = await this.getPackageIconUrl(pkg.id, latestVersion, enabledSources);
                    }

                    return {
                        id: pkg.id,
                        installedVersion: pkg.version,
                        latestVersion: latestVersion,
                        iconUrl: finalIconUrl,
                        verified,
                        authors,
                        sourceUrl
                    };
                }
            } catch (error) {
                console.error(`Failed to check updates for ${pkg.id}:`, error);
            }
            return null;
        }, 16);

        for (const result of results) {
            if (result) {
                packagesWithUpdates.push(result);
            }
        }

        return packagesWithUpdates;
    }

    /**
     * Check for package updates without fetching metadata (icons, authors, verified status).
     * Used for "Load All Projects" mode where speed is prioritized over details.
     */
    async checkPackageUpdatesMinimal(
        installedPackages: InstalledPackage[],
        includePrerelease: boolean
    ): Promise<{ id: string; installedVersion: string; latestVersion: string; sourceUrl?: string }[]> {
        const packagesWithUpdates: { id: string; installedVersion: string; latestVersion: string; sourceUrl?: string }[] = [];

        const results = await batchedPromiseAll(installedPackages, async (pkg) => {
            try {
                if (pkg.versionType === 'floating') {
                    return null;
                }
                if (pkg.versionType === 'range') {
                    return null;
                }

                const { versions, sourceUrl } = await this.getPackageVersionsWithSource(pkg.id, includePrerelease);
                if (versions.length === 0) {
                    return null;
                }

                const latestVersion = versions[0];

                if (isNewerVersion(latestVersion, pkg.version)) {
                    return {
                        id: pkg.id,
                        installedVersion: pkg.version,
                        latestVersion: latestVersion,
                        sourceUrl
                    };
                }
            } catch (error) {
                console.error(`Failed to check updates for ${pkg.id}:`, error);
            }
            return null;
        }, 16);

        for (const result of results) {
            if (result) {
                packagesWithUpdates.push(result);
            }
        }

        return packagesWithUpdates;
    }

    // ── Search metadata / icon helpers ──────────────────────────────────

    /**
     * Helper to get package icon URL (uses resolveIconUrl with source-aware fallback)
     */
    private async getPackageIconUrl(
        packageId: string,
        version: string,
        enabledSources?: Array<{ url: string }>
    ): Promise<string | undefined> {
        return this.resolveIconUrl(packageId, version, enabledSources);
    }

    /**
     * Get verified status, authors, and iconUrl for a package from the NuGet Search API.
     */
    private async getPackageSearchMetadata(packageId: string, version?: string): Promise<{ verified?: boolean; authors?: string; iconUrl?: string }> {
        const statusCacheKey = cacheKeys.verifiedStatus(packageId);

        const memoryCached = this.verifiedStatusCache.get(statusCacheKey);
        if (memoryCached) {
            let iconUrl: string | undefined;
            if (version) {
                const iconCacheKey = cacheKeys.iconExists(packageId, version);
                const cachedIcon = this.iconUrlCache.get(iconCacheKey);
                if (cachedIcon !== undefined) {
                    iconUrl = cachedIcon || undefined;
                }
            }
            return { verified: memoryCached.verified, authors: memoryCached.authors, iconUrl };
        }

        const workspaceCached = workspaceCache.get<{ verified: boolean; authors?: string; description?: string }>(statusCacheKey);
        if (workspaceCached) {
            this.verifiedStatusCache.set(statusCacheKey, workspaceCached);
            let iconUrl: string | undefined;
            if (version) {
                const iconCacheKey = cacheKeys.iconExists(packageId, version);
                const cachedIcon = this.iconUrlCache.get(iconCacheKey) ?? workspaceCache.get<string>(iconCacheKey);
                if (cachedIcon !== undefined) {
                    iconUrl = cachedIcon || undefined;
                }
            }
            return { verified: workspaceCached.verified, authors: workspaceCached.authors, iconUrl };
        }

        try {
            const nugetOrgEndpoints = await this._deps.discoverServiceEndpoints('https://api.nuget.org/v3/index.json');
            if (!nugetOrgEndpoints.searchQueryService) {
                return {};
            }
            const searchUrl = `${nugetOrgEndpoints.searchQueryService}?q=packageid:${encodeURIComponent(packageId)}&take=1`;
            const data = await this._deps.fetchJson<{ data: Array<{ id: string; verified?: boolean; authors?: string[]; iconUrl?: string; description?: string }> }>(searchUrl);

            if (data?.data?.length && data.data.length > 0) {
                const result = data.data[0];
                if (result.id?.toLowerCase() === packageId.toLowerCase()) {
                    const cacheValue = {
                        verified: result.verified === true,
                        authors: result.authors?.join(', '),
                        description: result.description
                    };
                    this.verifiedStatusCache.set(statusCacheKey, cacheValue);
                    workspaceCache.set(statusCacheKey, cacheValue, CACHE_TTL.VERIFIED_STATUS);

                    let iconUrl: string | undefined;
                    if (result.iconUrl && version && !version.includes('*') && !version.includes('[') && !version.includes('(')) {
                        const lowerId = packageId.toLowerCase();
                        const lowerVersion = version.toLowerCase();
                        const flatContainerUrl = `https://api.nuget.org/v3-flatcontainer/${lowerId}/${lowerVersion}/icon`;
                        iconUrl = flatContainerUrl;
                        const iconCacheKey = cacheKeys.iconExists(packageId, version);
                        this.iconUrlCache.set(iconCacheKey, flatContainerUrl);
                        workspaceCache.set(iconCacheKey, flatContainerUrl, CACHE_TTL.ICON_EXISTS);
                    }

                    return { verified: cacheValue.verified, authors: cacheValue.authors, iconUrl };
                }
            }
        } catch {
            // Silently fail
        }
        return {};
    }

    // ── README extraction ───────────────────────────────────────────────

    /**
     * Extract README from nupkg file (lazy loading for custom sources).
     * Downloads the package and extracts the embedded README.md
     */
    public async extractReadmeFromPackage(packageId: string, version: string, source?: string): Promise<string | null> {
        try {
            // Check workspace cache first
            const readmeCacheKey = cacheKeys.readme(packageId, version);
            const workspaceCached = workspaceCache.get<string>(readmeCacheKey);
            if (workspaceCached !== undefined) {
                return workspaceCached;
            }

            // Check metadata cache for README
            const cacheKey = `${packageId.toLowerCase()}@${version.toLowerCase()}`;
            const cachedMetadata = this.metadataCache.get(cacheKey);
            if (cachedMetadata?.readme) {
                workspaceCache.set(readmeCacheKey, cachedMetadata.readme, CACHE_TTL.README);
                return cachedMetadata.readme;
            }

            // Get the package download URL
            let packageContentUrl: string | null = null;
            const allSources = await this._deps.getSources();
            const enabledSources = allSources.filter((s: NuGetSource) => s.enabled);
            const sourcesToCheck = source ? [source] : enabledSources.map((s: NuGetSource) => s.url);

            for (const sourceUrl of sourcesToCheck) {
                const endpoints = await this._deps.discoverServiceEndpoints(sourceUrl);
                if (!endpoints) {
                    continue;
                }

                const authHeader = await this._deps.getAuthHeader(sourceUrl);

                const registrationBaseUrl = endpoints.registrationsBaseUrl?.replace(/\/$/, '');
                const flatContainerBaseUrl = endpoints.packageBaseAddress?.replace(/\/$/, '');

                // Strategy 1: Direct version-specific registration
                if (registrationBaseUrl) {
                    const directUrl = `${registrationBaseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}.json`;
                    const directData = await this._deps.fetchJson<{
                        packageContent?: string;
                        catalogEntry?: { packageContent?: string };
                    }>(directUrl, authHeader);

                    if (directData) {
                        packageContentUrl = directData.packageContent || directData.catalogEntry?.packageContent || null;
                    }
                }

                // Strategy 2: Package index.json
                if (!packageContentUrl && registrationBaseUrl) {
                    const indexUrl = `${registrationBaseUrl}/${packageId.toLowerCase()}/index.json`;
                    const registrationData = await this._deps.fetchJson<{
                        items?: Array<{
                            '@id'?: string;
                            items?: Array<{
                                packageContent?: string;
                                catalogEntry?: { version?: string; packageContent?: string };
                            }>;
                        }>;
                    }>(indexUrl, authHeader);

                    if (registrationData?.items) {
                        for (const page of registrationData.items) {
                            if (page.items) {
                                for (const item of page.items) {
                                    const itemVersion = item.catalogEntry?.version;
                                    if (itemVersion?.toLowerCase() === version.toLowerCase()) {
                                        packageContentUrl = item.packageContent || item.catalogEntry?.packageContent || null;
                                        if (packageContentUrl) { break; }
                                    }
                                }
                            }
                            if (packageContentUrl) { break; }

                            if (!page.items && page['@id']) {
                                const pageData = await this._deps.fetchJson<{
                                    items?: Array<{
                                        packageContent?: string;
                                        catalogEntry?: { version?: string; packageContent?: string };
                                    }>;
                                }>(page['@id'], authHeader);

                                if (pageData?.items) {
                                    for (const item of pageData.items) {
                                        const itemVersion = item.catalogEntry?.version;
                                        if (itemVersion?.toLowerCase() === version.toLowerCase()) {
                                            packageContentUrl = item.packageContent || item.catalogEntry?.packageContent || null;
                                            if (packageContentUrl) { break; }
                                        }
                                    }
                                }
                            }
                            if (packageContentUrl) { break; }
                        }
                    }
                }

                // Strategy 3: Flat container
                if (!packageContentUrl && flatContainerBaseUrl) {
                    const flatContainerUrl = `${flatContainerBaseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}/${packageId.toLowerCase()}.${version.toLowerCase()}.nupkg`;
                    const exists = await this.checkUrlExists(flatContainerUrl);
                    if (exists) {
                        packageContentUrl = flatContainerUrl;
                    }
                }

                if (packageContentUrl) { break; }
            }

            if (!packageContentUrl) {
                return null;
            }

            // Download the nupkg to a temp file
            const tempDir = os.tmpdir();
            const tempFile = path.join(tempDir, `${packageId}.${version}.nupkg`);

            const downloadSuccess = await this._deps.downloadFile(packageContentUrl, tempFile);
            if (!downloadSuccess) {
                return null;
            }

            try {
                const zip = new AdmZip(tempFile);
                const zipEntries = zip.getEntries();

                // Find nuspec to get readme path
                let readmePath: string | null = null;
                for (const entry of zipEntries) {
                    if (entry.entryName.toLowerCase().endsWith('.nuspec') &&
                        !entry.entryName.includes('..') && !entry.entryName.startsWith('/')) {
                        const nuspecContent = entry.getData().toString('utf8');
                        const readmeMatch = nuspecContent.match(/<readme>([^<]+)<\/readme>/i);
                        if (readmeMatch) {
                            const candidate = readmeMatch[1].trim();
                            if (!candidate.includes('..') && !candidate.startsWith('/') && !candidate.includes('\\')) {
                                readmePath = candidate;
                            }
                        }
                        break;
                    }
                }

                // Look for README file
                const possibleReadmePaths = [
                    readmePath,
                    'README.md',
                    'readme.md',
                    'Readme.md',
                    'docs/README.md',
                    'docs/readme.md'
                ].filter(Boolean) as string[];

                for (const entry of zipEntries) {
                    const entryName = entry.entryName;
                    // Reject entries with path traversal patterns
                    if (entryName.includes('..') || entryName.startsWith('/') || entryName.includes('\\')) {
                        continue;
                    }
                    for (const possiblePath of possibleReadmePaths) {
                        if (entryName.toLowerCase() === possiblePath.toLowerCase() ||
                            entryName.toLowerCase().endsWith('/' + possiblePath.toLowerCase())) {
                            const readmeContent = entry.getData().toString('utf8');

                            if (cachedMetadata) {
                                this.metadataCache.set(cacheKey, { ...cachedMetadata, readme: readmeContent });
                            }

                            workspaceCache.set(readmeCacheKey, readmeContent, CACHE_TTL.README);

                            try { fs.unlinkSync(tempFile); } catch { /* ignore */ }

                            return readmeContent;
                        }
                    }
                }
            } finally {
                try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
            }

            return null;
        } catch (error) {
            console.error(`[NuGet] Error extracting README from package:`, error);
            return null;
        }
    }

    // ── Transitive package metadata ─────────────────────────────────────

    /**
     * Fetch metadata (icons, verified status, authors) for transitive packages.
     */
    public async fetchTransitivePackageMetadata(packages: TransitivePackage[]): Promise<void> {
        const allSources = await this._deps.getSources();
        const enabledSources = allSources.filter(s => s.enabled);

        await batchedPromiseAll(packages, async (pkg) => {
            const { verified, authors, iconUrl } = await this.getPackageSearchMetadata(pkg.id, pkg.version);
            if (iconUrl) {
                pkg.iconUrl = iconUrl;
            }
            if (verified !== undefined) {
                pkg.verified = verified;
            }
            if (authors) {
                pkg.authors = authors;
            }

            if (!pkg.iconUrl) {
                const fallbackIcon = await this.resolveIconUrl(pkg.id, pkg.version, enabledSources);
                if (fallbackIcon) {
                    pkg.iconUrl = fallbackIcon;
                }
            }
        }, 16);
    }
}

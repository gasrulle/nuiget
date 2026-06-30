import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';
import * as zlib from 'zlib';
import { credentialService, CredentialService } from './CredentialService';
import { http2Client, resolveRedirect } from './Http2Client';
import { NuGetCliService } from './NuGetCliService';
import { NuGetConfigParser } from './NuGetConfigParser';
import { NuGetLogger } from './NuGetLogger';
import { NuGetPackageService } from './NuGetPackageService';
import { NuGetProjectService } from './NuGetProjectService';
import { NuGetSourceService } from './NuGetSourceService';
import type { FetchResult, NuGetServiceIndex } from './NuGetTypes';
import {
    InstalledPackage, NuGetSource,
    PackageMetadata, PackageSearchResult, PackageUpdate, Project,
    QuickSearchSourceResult, ResolvedSource, ServiceEndpoints, TransitivePackage,
    TransitivePackagesResult
} from './NuGetTypes';
import { LRUMap } from './NuGetUtils';

// Re-export types for backward compatibility with existing consumers
export type { FetchResult, InstalledPackage, NuGetRegistrationEntry, NuGetRegistrationPage, NuGetSearchEntry, NuGetSearchResponse, NuGetSource, PackageDependency, PackageDependencyGroup, PackageMetadata, PackageSearchResult, PackageUpdate, Project, QuickSearchSourceResult, ServiceEndpoints, TransitiveFrameworkSection, TransitivePackage, TransitivePackagesResult, VersionSpec, VersionType } from './NuGetTypes';

export class NuGetService {
    private configParser: NuGetConfigParser;
    private readonly logger: NuGetLogger;
    private readonly _cliService: NuGetCliService;
    private readonly _sourceService: NuGetSourceService;
    private readonly _projectService: NuGetProjectService;
    private readonly _packageService: NuGetPackageService;
    // LRU cache for service index endpoints (max 50 sources)
    private serviceIndexCache: LRUMap<string, ServiceEndpoints> = new LRUMap(50);
    // Track sources that failed to resolve (url -> error message) - warns once per session
    private failedSources: Map<string, string> = new Map();
    // Cache for failed endpoint discoveries (source URL -> failure timestamp)
    // Prevents re-trying unreachable sources for every package (OS TCP timeout can be ~21s)
    private failedEndpointCache: Map<string, number> = new Map();
    // Failed endpoint cache TTL: 120 seconds (allows retry after connectivity is restored)
    // Users can force-retry immediately via the ⚠️ refresh button (clearSourceErrors)
    private static readonly FAILED_ENDPOINT_CACHE_TTL = 120000;
    // Default timeout for HTTP requests to custom sources (milliseconds)
    private static readonly HTTP_REQUEST_TIMEOUT = 10000;
    // Shorter timeout for service index discovery (milliseconds)
    private static readonly SERVICE_INDEX_TIMEOUT = 3000;
    // Interval for background source health checks when all sources are healthy (5 minutes)
    private static readonly HEALTHY_CHECK_INTERVAL = 300000;
    // Timer for self-scheduling background source health monitor
    private _sourceHealthTimer?: ReturnType<typeof setTimeout>;
    // Maximum number of HTTP redirects to follow before aborting
    private static readonly MAX_REDIRECTS = 5;
    // Maximum response body size for text/JSON fetches (10 MB) to prevent out-of-memory
    private static readonly MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
    // Maximum decompressed response size for vulnerability data (50 MB)
    // Vulnerability base JSON is ~15-20 MB uncompressed but ~2-3 MB with gzip
    private static readonly MAX_VULNERABILITY_RESPONSE_SIZE = 50 * 1024 * 1024;
    // Maximum download size for nupkg files (50 MB) to prevent disk exhaustion
    private static readonly MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024;
    // Cache for getSources() to avoid repeated CLI spawns (dotnet nuget list source)
    // Multiple parallel getPackageVersions calls share a single CLI result
    private _sourcesCache: NuGetSource[] | null = null;
    private _sourcesCacheTime: number = 0;
    private static readonly SOURCES_CACHE_TTL = 30000; // 30 seconds
    private outputChannel: vscode.LogOutputChannel;
    // Cached credentials from nuget.config (source name -> credentials)
    private nugetConfigCredentials: Map<string, { username?: string; password?: string; isEncrypted: boolean }> | null = null;
    // Map of source URL to source name for credential lookup
    private sourceUrlToName: Map<string, string> = new Map();
    // Track sources that need interactive auth (show warning once per session)
    private sourcesNeedingAuth: Set<string> = new Set();

    constructor(outputChannel: vscode.LogOutputChannel) {
        this.configParser = new NuGetConfigParser();
        this.outputChannel = outputChannel;
        this.logger = new NuGetLogger(outputChannel);
        this._cliService = new NuGetCliService(this.logger);
        this._sourceService = new NuGetSourceService(this.configParser, this.logger, () => this.startSourceHealthMonitor());
        this._packageService = new NuGetPackageService({
            discoverServiceEndpoints: (url) => this.discoverServiceEndpoints(url),
            getAuthHeader: (url) => this.getAuthHeader(url),
            fetchJson: (url, auth) => this.fetchJson(url, auth),
            fetchJsonWithDetails: (url, auth, timeout) => this.fetchJsonWithDetails(url, auth, timeout),
            fetchJsonWithCompression: (url, auth) => this.fetchJsonWithCompression(url, auth),
            fetchText: (url, auth) => this.fetchText(url, auth),
            downloadFile: (url, dest) => this.downloadFile(url, dest),
            getSources: () => this.getSources(),
            isLocalSource: (url) => this.isLocalSource(url),
            filterHealthySources: (urls) => this.filterHealthySources(urls),
            getFailedEndpointCacheTTL: () => NuGetService.FAILED_ENDPOINT_CACHE_TTL,
            getFailedEndpointCache: () => this.failedEndpointCache,
            getHttpRequestTimeout: () => NuGetService.HTTP_REQUEST_TIMEOUT,
            getMaxDownloadSize: () => NuGetService.MAX_DOWNLOAD_SIZE,
            getMaxResponseSize: () => NuGetService.MAX_RESPONSE_SIZE,
            sanitizeForLogging: (text) => this.sanitizeForLogging(text),
        });
        this._projectService = new NuGetProjectService(
            (p) => this.useNounFirstSyntax(p),
            (pkgs) => this.fetchInstalledPackageMetadata(pkgs)
        );
        // Set output channel for credential service
        credentialService.setOutputChannel(outputChannel);
    }

    /**
     * Initialize credentials from nuget.config and prewarm authenticated sources.
     * Call this when panel opens. Fire-and-forget.
     */
    public async initializeCredentials(): Promise<void> {
        try {
            // Parse credentials from nuget.config files
            this.nugetConfigCredentials = await this.configParser.getCredentials();

            // Get all sources and build URL-to-name mapping
            const sources = await this.getSources();
            for (const source of sources) {
                this.sourceUrlToName.set(source.url.toLowerCase(), source.name);
            }

            // Prewarm credentials for authenticated sources
            const authSources = sources.filter(s => s.enabled && !this.isLocalSource(s.url));
            credentialService.prewarmCredentials(
                authSources.map(s => ({ url: s.url, name: s.name })),
                this.nugetConfigCredentials
            );
        } catch (error) {
            console.error('[NuGet] Failed to initialize credentials:', error);
        }
    }

    /**
     * Get the source name for a URL (for credential lookup)
     */
    private getSourceNameForUrl(url: string): string | undefined {
        return this.sourceUrlToName.get(url.toLowerCase());
    }

    /**
     * Get authentication header for a source URL
     * @param sourceUrl The NuGet source URL
     * @returns Authorization header value or undefined if no credentials
     */
    private async getAuthHeader(sourceUrl: string): Promise<string | undefined> {
        // Public sources (nuget.org) don't need auth
        if (sourceUrl.includes('.nuget.org')) {
            return undefined;
        }

        const sourceName = this.getSourceNameForUrl(sourceUrl);
        const result = await credentialService.getCredentials(
            sourceUrl,
            sourceName,
            this.nugetConfigCredentials ?? undefined
        );

        if (result.credentials) {
            return CredentialService.createBasicAuthHeader(result.credentials);
        }

        // Log auth requirement once per source per session
        if (result.error && !this.sourcesNeedingAuth.has(sourceUrl)) {
            if (result.error.type === 'provider-needs-interactive') {
                this.sourcesNeedingAuth.add(sourceUrl);
                this.outputChannel.warn(`⚠ ${result.error.message}`);
            } else if (result.error.type !== 'not-found') {
                this.outputChannel.debug(`No credentials for ${sourceUrl}: ${result.error.message}`);
            }
        }

        return undefined;
    }

    /**
     * Pre-warm the nuget.org service index cache.
     * Call this early (e.g., on panel open) to speed up first quick search.
     * Fire-and-forget - no need to await.
     */
    public prewarmNugetOrgServiceIndex(): void {
        const nugetOrgUrl = 'https://api.nuget.org/v3/index.json';
        // Fire and forget - don't await
        this.discoverServiceEndpoints(nugetOrgUrl).catch(() => {
            // Silently ignore - this is just a prewarm optimization
        });
    }

    /**
     * Pre-warm the service index cache for a specific source.
     * Call this when user selects a source to speed up subsequent searches.
     * Fire-and-forget - no need to await.
     */
    public prewarmServiceIndex(sourceUrl: string): void {
        if (!sourceUrl || this.isLocalSource(sourceUrl)) {
            return;
        }
        // Fire and forget - don't await
        this.discoverServiceEndpoints(sourceUrl).catch(() => {
            // Silently ignore - this is just a prewarm optimization
        });
    }

    /**
     * Validate all enabled non-local NuGet sources in parallel.
     * Calls discoverServiceEndpoints() on each source, which populates
     * serviceIndexCache on success and failedEndpointCache on failure.
     * @returns true if any sources failed validation
     */
    private async validateAllSources(): Promise<boolean> {
        const sources = await this.getSources();
        const remoteSources = sources.filter(s => s.enabled && !this.isLocalSource(s.url));

        if (remoteSources.length === 0) {
            return false;
        }

        this.outputChannel.info(`[SourceHealth] Validating ${remoteSources.length} source(s) in background...`);

        const results = await Promise.allSettled(
            remoteSources.map(src =>
                this.discoverServiceEndpoints(src.url)
                    .then(endpoints => ({ url: src.url, ok: Object.keys(endpoints).length > 0 }))
                    .catch(() => ({ url: src.url, ok: false }))
            )
        );

        const failedCount = results.filter(r => r.status === 'fulfilled' && !r.value.ok).length;
        if (failedCount > 0) {
            this.outputChannel.info(`[SourceHealth] ${failedCount}/${remoteSources.length} source(s) unreachable`);
        } else {
            this.outputChannel.info(`[SourceHealth] All ${remoteSources.length} source(s) healthy`);
        }

        return failedCount > 0;
    }

    /**
     * Start the background source health monitor. Validates all sources immediately,
     * then self-schedules the next check based on results:
     * - If any sources failed: re-check at FAILED_ENDPOINT_CACHE_TTL (120s)
     * - If all healthy: re-check at HEALTHY_CHECK_INTERVAL (5min)
     *
     * Can be called multiple times safely — cancels the previous timer first.
     * Called at activation, on clearSourceErrors(), and after source mutations.
     */
    public startSourceHealthMonitor(): void {
        // Cancel any existing timer
        if (this._sourceHealthTimer) {
            clearTimeout(this._sourceHealthTimer);
            this._sourceHealthTimer = undefined;
        }

        // Fire-and-forget the validation + schedule next run
        this.validateAllSources()
            .then(hasFailures => {
                const nextInterval = hasFailures
                    ? NuGetService.FAILED_ENDPOINT_CACHE_TTL
                    : NuGetService.HEALTHY_CHECK_INTERVAL;
                this._sourceHealthTimer = setTimeout(() => {
                    this.startSourceHealthMonitor();
                }, nextInterval);
            })
            .catch(() => {
                // Schedule a retry at the failure interval
                this._sourceHealthTimer = setTimeout(() => {
                    this.startSourceHealthMonitor();
                }, NuGetService.FAILED_ENDPOINT_CACHE_TTL);
            });
    }

    /**
     * Stop the background source health monitor. Call on extension disposal.
     */
    public stopSourceHealthMonitor(): void {
        if (this._sourceHealthTimer) {
            clearTimeout(this._sourceHealthTimer);
            this._sourceHealthTimer = undefined;
        }
    }



    private async useNounFirstSyntax(projectPath: string): Promise<boolean> {
        return this._cliService.useNounFirstSyntax(projectPath);
    }

    /** Clear the cached SDK version detection (e.g. after global.json changes) */
    clearSdkVersionCache(): void {
        this._cliService.clearSdkVersionCache();
    }

    /** Plan 11: hydrate SDK version cache from persistent storage and attach Memento for save-on-write. */
    hydrateSdkVersionCache(store: vscode.Memento, key: string, extensionVersion: string): void {
        this._cliService.hydrateSdkVersionCache(store, key, extensionVersion);
    }

    /** Plan 11: await all pending SDK-cache persistence writes (test/diagnostic helper). */
    async flushPersistedSdkCache(): Promise<void> {
        await this._cliService.flushPersistedSdkCache();
    }

    setupOutputChannel(skipSetup: boolean = false): void {
        this.logger.setupOutputChannel(skipSetup);
    }

    private sanitizeForLogging(text: string): string {
        return this.logger.sanitizeForLogging(text);
    }

    private logOutput(command: string, stdout: string, stderr: string, success: boolean = true): void {
        this.logger.logOutput(command, stdout, stderr, success);
    }

    private logSuccess(message: string): void { this.logger.logSuccess(message); }

    private logWarning(message: string): void { this.logger.logWarning(message); }

    private logError(message: string): void { this.logger.logError(message); }

    logBulkOperationHeader(operationType: string, packageCount: number): void {
        this.logger.logBulkOperationHeader(operationType, packageCount);
    }

    private isLocalSource(sourceUrl: string): boolean {
        return this._sourceService.isLocalSource(sourceUrl);
    }


    private readonly _inFlightEndpoints: Map<string, Promise<ServiceEndpoints>> = new Map();

    /**
     * Discover service endpoints from a NuGet V3 service index
     */
    private async discoverServiceEndpoints(sourceUrl: string): Promise<ServiceEndpoints> {
        // Skip local file paths - they don't have API endpoints
        if (this.isLocalSource(sourceUrl)) {
            return {};
        }

        // Check cache first
        const cached = this.serviceIndexCache.get(sourceUrl);
        if (cached) {
            return cached;
        }

        // Check failed endpoint cache - avoid re-trying unreachable sources within TTL
        const failedAt = this.failedEndpointCache.get(sourceUrl);
        if (failedAt && (Date.now() - failedAt) < NuGetService.FAILED_ENDPOINT_CACHE_TTL) {
            return {};
        }

        // Deduplicate concurrent discovery for the same source. On cold start, many
        // metadata/search/transitive workers can miss the cache simultaneously; without
        // this each fires its own service-index request (a stampede).
        const inFlight = this._inFlightEndpoints.get(sourceUrl);
        if (inFlight) {
            return inFlight;
        }
        const promise = this._discoverServiceEndpointsImpl(sourceUrl)
            .finally(() => this._inFlightEndpoints.delete(sourceUrl));
        this._inFlightEndpoints.set(sourceUrl, promise);
        return promise;
    }

    private async _discoverServiceEndpointsImpl(sourceUrl: string): Promise<ServiceEndpoints> {
        const endpoints: ServiceEndpoints = {};

        try {
            // Normalize the source URL and find the service index
            let indexUrl = sourceUrl;
            if (!indexUrl.endsWith('/index.json')) {
                // Try common patterns for NuGet V3 feeds
                if (indexUrl.endsWith('/')) {
                    indexUrl = indexUrl + 'index.json';
                } else {
                    indexUrl = indexUrl + '/index.json';
                }
            }

            // Get auth header for this source
            const authHeader = await this.getAuthHeader(sourceUrl);

            // Use HTTP/1.1 for service index discovery (HTTP/2 has TLS issues)
            const result = await this.fetchJsonWithDetails<NuGetServiceIndex>(indexUrl, authHeader, NuGetService.SERVICE_INDEX_TIMEOUT);
            if (result.error) {
                throw new Error(result.error.message);
            }
            const serviceIndex = result.data;

            if (!serviceIndex) {
                throw new Error('Empty response from service index.');
            }

            // Check if this looks like a valid NuGet V3 service index
            if (!serviceIndex.resources || !Array.isArray(serviceIndex.resources)) {
                throw new Error('Invalid NuGet V3 service index. Missing resources array.');
            }

            if (serviceIndex.resources.length === 0) {
                throw new Error('NuGet V3 service index has no resources. The feed may be misconfigured.');
            }

            if (serviceIndex.resources) {
                for (const resource of serviceIndex.resources) {
                    const types = Array.isArray(resource['@type']) ? resource['@type'] : [resource['@type']];

                    // PackageBaseAddress - for flat container (versions, content, icon)
                    if (types.some(t => t && t.includes('PackageBaseAddress'))) {
                        endpoints.packageBaseAddress = resource['@id'];
                    }
                    // RegistrationsBaseUrl - for package metadata (exclude gzip-compressed endpoints)
                    if (types.some(t => t && t.includes('RegistrationsBaseUrl') && !t.includes('gz')) && !resource['@id']?.includes('-gz-')) {
                        endpoints.registrationsBaseUrl = resource['@id'];
                    }
                    // SearchQueryService - for search
                    if (types.some(t => t && t.includes('SearchQueryService'))) {
                        endpoints.searchQueryService = resource['@id'];
                    }
                    // SearchAutocompleteService - for quick search/typeahead
                    if (types.some(t => t && t.includes('SearchAutocompleteService'))) {
                        endpoints.searchAutocompleteService = resource['@id'];
                    }
                    // VulnerabilityInfo - for known package vulnerabilities
                    if (types.some(t => t && t.includes('VulnerabilityInfo'))) {
                        endpoints.vulnerabilityInfoUrl = resource['@id'];
                    }
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[NuGet] Failed to discover service endpoints for ${sourceUrl}:`, error);

            // Only warn once per source per session to avoid spamming
            if (!this.failedSources.has(sourceUrl)) {
                this.failedSources.set(sourceUrl, errorMessage);

                vscode.window.showWarningMessage(
                    `Unable to connect to NuGet source: ${sourceUrl}`,
                    'Show Details',
                    'Dismiss'
                ).then(selection => {
                    if (selection === 'Show Details') {
                        vscode.window.showErrorMessage(`Connection error: ${errorMessage}`);
                    }
                });
            }

            // Cache the failure with a TTL to avoid re-trying the same unreachable source
            // for every package (OS TCP timeout can be ~21s per attempt)
            this.failedEndpointCache.set(sourceUrl, Date.now());
            return endpoints;
        }

        // Only cache if we successfully discovered at least one endpoint
        // This prevents caching failed requests due to network issues
        if (endpoints.packageBaseAddress || endpoints.registrationsBaseUrl || endpoints.searchQueryService) {
            this.serviceIndexCache.set(sourceUrl, endpoints);
            // Clear any previous failure entry now that the source is reachable
            this.failedEndpointCache.delete(sourceUrl);
        }

        return endpoints;
    }


    // --- Project service facade delegations ---

    async getPackageDependencies(projectPath: string): Promise<Map<string, string[]>> {
        return this._projectService.getPackageDependencies(projectPath);
    }

    async findProjects(): Promise<Project[]> {
        return this._projectService.findProjects();
    }

    async getProjectReferences(projectPath: string): Promise<string[]> {
        return this._projectService.getProjectReferences(projectPath);
    }

    async getProjectDependencyMap(projectPaths: string[]): Promise<Map<string, string[]>> {
        return this._projectService.getProjectDependencyMap(projectPaths);
    }

    async getInstalledPackages(projectPath: string, liteMode?: boolean): Promise<InstalledPackage[]> {
        return this._projectService.getInstalledPackages(projectPath, liteMode);
    }

    async enrichInstalledPackageMetadata(packages: InstalledPackage[]): Promise<void> {
        return this._packageService.fetchInstalledPackageMetadata(packages);
    }



    async getPackageSize(packageId: string, version: string, sourceUrl?: string): Promise<number> {
        return this._packageService.getPackageSize(packageId, version, sourceUrl);
    }


    private async fetchInstalledPackageMetadata(packages: InstalledPackage[]): Promise<void> {
        return this._packageService.fetchInstalledPackageMetadata(packages);
    }


    async quickSearchGrouped(
        query: string,
        sources: Array<{ name: string; url: string }>,
        includePrerelease?: boolean,
        take: number = 5
    ): Promise<QuickSearchSourceResult[]> {
        return this._packageService.quickSearchGrouped(query, sources, includePrerelease, take);
    }





    async searchPackages(query: string, sources?: string[], includePrerelease?: boolean, liteMode?: boolean, take?: number, exactMatch?: boolean): Promise<PackageSearchResult[]> {
        return this._packageService.searchPackages(query, sources, includePrerelease, liteMode, take, exactMatch);
    }

    async enrichSearchResultMetadata(packages: PackageSearchResult[]): Promise<void> {
        return this._packageService.enrichSearchResultMetadata(packages);
    }




    async installPackage(projectPath: string, packageId: string, version?: string, options?: { skipChannelSetup?: boolean; skipRestore?: boolean; sourceUrl?: string }): Promise<boolean> {
        const result = await this._cliService.installPackage(projectPath, packageId, version, options);
        if (result) { this._projectService.clearAssetsCache(); }
        return result;
    }

    async updatePackage(projectPath: string, packageId: string, version: string, options?: { skipChannelSetup?: boolean; skipNotification?: boolean; skipRestore?: boolean; sourceUrl?: string }): Promise<boolean> {
        const result = await this._cliService.updatePackage(projectPath, packageId, version, options);
        if (result) { this._projectService.clearAssetsCache(); }
        return result;
    }

    async removePackage(projectPath: string, packageId: string, options?: { skipChannelSetup?: boolean; skipRestore?: boolean; skipNotification?: boolean }): Promise<boolean> {
        const result = await this._cliService.removePackage(projectPath, packageId, options);
        if (result) { this._projectService.clearAssetsCache(); }
        return result;
    }

    async getSources(): Promise<NuGetSource[]> {
        return this._sourceService.getSources();
    }

    public invalidateSourcesCache(): void {
        this._sourceService.invalidateSourcesCache();
    }

    async enableSource(sourceName: string): Promise<boolean> {
        return this._sourceService.enableSource(sourceName);
    }

    async disableSource(sourceName: string): Promise<boolean> {
        return this._sourceService.disableSource(sourceName);
    }


    async addSource(
        url: string,
        name?: string,
        username?: string,
        password?: string,
        configFile?: string,
        allowInsecure?: boolean,
        storeEncrypted?: boolean
    ): Promise<{ success: boolean; error?: string }> {
        return this._sourceService.addSource(url, name, username, password, configFile, allowInsecure, storeEncrypted);
    }

    async removeSource(sourceName: string, configFile?: string): Promise<{ success: boolean; error?: string }> {
        return this._sourceService.removeSource(sourceName, configFile);
    }

    getConfigFilePaths(): { label: string; path: string }[] {
        return this._sourceService.getConfigFilePaths();
    }

    /**
     * Proactively test connectivity to all enabled HTTP sources
     * This triggers discoverServiceEndpoints which will populate failedSources
     */
    async testSourceConnectivity(): Promise<void> {
        const sources = await this.configParser.getSources();
        const httpSources = sources.filter(s => s.enabled && !this.isLocalSource(s.url));

        // Test all sources in parallel (don't await individually to avoid blocking)
        await Promise.all(
            httpSources.map(source =>
                this.discoverServiceEndpoints(source.url).catch(() => {
                    // Error already handled in discoverServiceEndpoints
                })
            )
        );
    }

    /**
     * Clear all in-memory NuGet caches synchronously.
     * Called on manual refresh to allow re-discovery, refetch fresh metadata/search,
     * and re-warn about previously-failed sources.
     *
     * Widened beyond the original `clearSourceErrors()` set to also clear
     * `metadataCache` and `searchResultsCache` so users see fresh listings
     * after pressing Refresh instead of waiting for TTLs to expire.
     */
    clearInMemoryNuGetCaches(): void {
        this.failedSources.clear();
        // Also clear the service index cache to force re-discovery
        this.serviceIndexCache.clear();
        // Drop any in-flight discovery so a manual refresh can't attach to a stale
        // (possibly failing) discovery and repopulate the failed-endpoint cache.
        this._inFlightEndpoints.clear();
        // Clear failed endpoint cache so that refreshing actually retries the network
        this.failedEndpointCache.clear();
        // Clear package service caches (icons, vulnerabilities, quick search, etc.)
        this._packageService.clearCaches();
        // Clear metadata + search-result caches so refresh picks up new listings
        this._packageService.clearMetadataAndSearchCaches();
        // Clear sources cache so fresh sources are fetched
        this.invalidateSourcesCache();
        // Clear version caches so update checks see newly published versions
        this.clearVersionsCache();
        // Re-validate all sources immediately in background
        this.startSourceHealthMonitor();
    }

    /**
     * Clear tracked source errors (call on manual refresh to allow re-warning).
     * Backwards-compatible alias for `clearInMemoryNuGetCaches()`.
     */
    clearSourceErrors(): void {
        this.clearInMemoryNuGetCaches();
    }

    /**
     * Clear all cached package version data (in-memory LRU + workspace persistent cache).
     * Called on manual refresh to ensure update checks see newly published versions.
     */
    clearVersionsCache(): void {
        this._packageService.clearVersionsCache();
    }

    /**
     * Clear cached version data for specific packages only.
     * Used after operations to invalidate only the affected packages
     * instead of the entire versions cache (avoids unnecessary HTTP requests).
     */
    clearVersionsCacheForPackages(packageIds: string[]): void {
        this._packageService.clearVersionsCacheForPackages(packageIds);
    }

    /**
     * Clear the dotnet NuGet HTTP cache so that fresh version listings
     * are fetched from the server on next restore/update check.
     * Runs `dotnet nuget locals http-cache --clear` silently.
     */
    async clearNuGetHttpCache(): Promise<void> {
        return this._cliService.clearNuGetHttpCache();
    }

    /**
     * In-flight promise for the background HTTP-cache clear so rapid
     * Refresh clicks don't spawn multiple `dotnet nuget locals` processes.
     * Note: only the disk-clear is coalesced — every Refresh still re-runs
     * the synchronous `clearInMemoryNuGetCaches()` so the second click
     * doesn't see partly-repopulated caches.
     */
    private _httpCacheClearInFlight: Promise<void> | null = null;

    /**
     * Fire-and-forget variant of `clearNuGetHttpCache()` for the Refresh button path.
     * Spawns the `dotnet nuget locals` process in the background and coalesces
     * concurrent calls so multiple rapid Refreshes share one process.
     * The UI proceeds immediately without waiting for the disk clear to finish.
     */
    clearNuGetHttpCacheBackground(): void {
        if (this._httpCacheClearInFlight) { return; }
        this._httpCacheClearInFlight = this._cliService.clearNuGetHttpCache()
            .catch(() => {
                // Best-effort: CLI errors are already logged inside the service
            })
            .finally(() => {
                this._httpCacheClearInFlight = null;
            });
    }

    /**
     * Get map of sources that failed to resolve (url -> error message)
     */
    getFailedSources(): Map<string, string> {
        return new Map(this.failedSources);
    }

    /**
     * Filter out source URLs that are known to be unreachable (in failedEndpointCache within TTL).
     * If ALL sources would be filtered out, returns the original list to avoid silent empty results.
     */
    private filterHealthySources(sourceUrls: string[]): string[] {
        if (sourceUrls.length === 0) {
            return sourceUrls;
        }

        const now = Date.now();
        const healthy = sourceUrls.filter(url => {
            const failedAt = this.failedEndpointCache.get(url);
            if (failedAt && (now - failedAt) < NuGetService.FAILED_ENDPOINT_CACHE_TTL) {
                this.outputChannel.info(`[Search] Skipping unreachable source: ${this.sanitizeForLogging(url)}`);
                return false;
            }
            return true;
        });

        // If ALL sources are unreachable, return the original list so the CLI can attempt
        // them (better to get a CLI error than silently return zero results)
        if (healthy.length === 0) {
            this.outputChannel.warn('[Search] All sources are unreachable — passing all to CLI as fallback');
            return sourceUrls;
        }

        return healthy;
    }


    async getPackageVersions(packageId: string, source?: string, includePrerelease?: boolean, take: number = 20): Promise<string[]> {
        return this._packageService.getPackageVersions(packageId, source, includePrerelease, take);
    }

    tryAcquirePrefetchSlot(): boolean {
        return this._packageService.tryAcquirePrefetchSlot();
    }

    releasePrefetchSlot(): void {
        this._packageService.releasePrefetchSlot();
    }








    async getPackageMetadata(packageId: string, version: string, source?: string): Promise<PackageMetadata | null> {
        return this._packageService.getPackageMetadata(packageId, version, source);
    }





    async checkPackageUpdates(
        installedPackages: InstalledPackage[],
        includePrerelease: boolean,
        preResolvedSources?: ResolvedSource[],
        onUpdateFound?: (update: PackageUpdate) => void
    ): Promise<PackageUpdate[]> {
        return this._packageService.checkPackageUpdates(installedPackages, includePrerelease, preResolvedSources, onUpdateFound);
    }


    async checkPackageUpdatesMinimal(
        installedPackages: InstalledPackage[],
        includePrerelease: boolean,
        preResolvedSources?: ResolvedSource[]
    ): Promise<{ id: string; installedVersion: string; latestVersion: string; sourceUrl?: string }[]> {
        return this._packageService.checkPackageUpdatesMinimal(installedPackages, includePrerelease, preResolvedSources);
    }

    /**
     * Pre-resolve all enabled, healthy, non-local sources with endpoints and auth.
     * Call once before a multi-project batch loop to share resolved sources across projects.
     */
    async resolveSourcesForBatch(): Promise<ResolvedSource[]> {
        return this._packageService.resolveSourcesForBatch();
    }

    async getPackageIconUrl(packageId: string, version: string): Promise<string | undefined> {
        const sources = await this.getSources();
        const enabledSources = sources.filter(s => s.enabled);
        return this._packageService.getPackageIconUrl(packageId, version, enabledSources);
    }


    private fetchText(url: string, authHeader?: string, maxRedirects: number = NuGetService.MAX_REDIRECTS): Promise<string | undefined> {
        return new Promise((resolve) => {
            if (maxRedirects <= 0) {
                resolve(undefined);
                return;
            }

            const client = url.startsWith('https://') ? https : http;
            const parsed = new URL(url);

            const headers: Record<string, string> = {};
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }

            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'GET',
                headers,
                timeout: NuGetService.HTTP_REQUEST_TIMEOUT
            };

            const req = client.request(options, (res) => {
                // Handle redirects (with SSRF protection)
                const redirect = resolveRedirect(res.statusCode, res.headers.location, url, authHeader);
                if (redirect) {
                    this.fetchText(redirect.redirectUrl, redirect.forwardAuth, maxRedirects - 1).then(resolve);
                    return;
                }
                if (res.statusCode !== 200) {
                    resolve(undefined);
                    return;
                }

                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                    if (data.length > NuGetService.MAX_RESPONSE_SIZE) {
                        req.destroy();
                        resolve(undefined);
                    }
                });
                res.on('end', () => resolve(data));
            });

            req.on('timeout', () => {
                req.destroy();
                resolve(undefined);
            });

            req.on('error', () => {
                resolve(undefined);
            });

            req.end();
        });
    }

    /**
     * Fetch JSON with detailed error information for better diagnostics
     * @param url The URL to fetch
     * @param authHeader Optional Authorization header value
     */
    private fetchJsonWithDetails<T>(url: string, authHeader?: string, timeoutMs?: number, maxRedirects: number = NuGetService.MAX_REDIRECTS): Promise<FetchResult<T>> {
        return new Promise((resolve) => {
            if (maxRedirects <= 0) {
                resolve({
                    data: null,
                    error: {
                        type: 'network',
                        message: 'Too many redirects. The server may be misconfigured.'
                    }
                });
                return;
            }

            const client = url.startsWith('https://') ? https : http;
            const parsed = new URL(url);

            const headers: Record<string, string> = {
                'Accept': 'application/json'
            };
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }

            const effectiveTimeout = timeoutMs ?? NuGetService.HTTP_REQUEST_TIMEOUT;

            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'GET',
                headers,
                timeout: effectiveTimeout
            };

            const req = client.request(options, (res) => {
                // Handle redirects (with SSRF protection)
                const redirect = resolveRedirect(res.statusCode, res.headers.location, url, authHeader);
                if (redirect) {
                    this.fetchJsonWithDetails<T>(redirect.redirectUrl, redirect.forwardAuth, timeoutMs, maxRedirects - 1).then(resolve);
                    return;
                }

                const statusCode = res.statusCode || 0;

                // Authentication errors
                if (statusCode === 401 || statusCode === 403) {
                    resolve({
                        data: null,
                        error: {
                            type: 'auth',
                            statusCode,
                            message: statusCode === 401
                                ? 'Authentication required. Check credentials in nuget.config or Windows Credential Manager.'
                                : 'Access denied. You may not have permission to access this feed.'
                        }
                    });
                    return;
                }

                // Not found
                if (statusCode === 404) {
                    resolve({
                        data: null,
                        error: {
                            type: 'not-found',
                            statusCode,
                            message: 'Service index not found. This may not be a valid NuGet V3 feed.'
                        }
                    });
                    return;
                }

                // Server errors
                if (statusCode >= 500) {
                    resolve({
                        data: null,
                        error: {
                            type: 'server-error',
                            statusCode,
                            message: `Server error (HTTP ${statusCode}). The feed may be temporarily unavailable.`
                        }
                    });
                    return;
                }

                // Other non-200 status codes
                if (statusCode !== 200) {
                    resolve({
                        data: null,
                        error: {
                            type: 'unknown',
                            statusCode,
                            message: `Unexpected response (HTTP ${statusCode}).`
                        }
                    });
                    return;
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ data: JSON.parse(data) });
                    } catch {
                        resolve({
                            data: null,
                            error: {
                                type: 'invalid-json',
                                message: 'Invalid response. This does not appear to be a valid NuGet V3 feed.'
                            }
                        });
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    data: null,
                    error: {
                        type: 'network',
                        message: `Connection timed out after ${effectiveTimeout / 1000}s. The server may be slow or unreachable.`
                    }
                });
            });

            req.on('error', (err) => {
                const errorMsg = err.message || 'Unknown network error';
                let message = `Network error: ${errorMsg}`;

                // Provide friendlier messages for common errors
                if (errorMsg.includes('ECONNREFUSED')) {
                    message = 'Connection refused. The server may be down or blocking connections.';
                } else if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('EAI_AGAIN')) {
                    message = 'DNS resolution failed. Check the URL or your network connection.';
                } else if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ESOCKETTIMEDOUT')) {
                    message = 'Connection timed out. The server may be slow or unreachable.';
                } else if (errorMsg.includes('ECONNRESET')) {
                    message = 'Connection reset. The server closed the connection unexpectedly.';
                } else if (errorMsg.includes('certificate') || errorMsg.includes('SSL') || errorMsg.includes('TLS')) {
                    message = 'SSL/TLS certificate error. The server certificate may be invalid or untrusted.';
                }

                resolve({
                    data: null,
                    error: {
                        type: 'network',
                        message
                    }
                });
            });

            req.end();
        });
    }

    private fetchJson<T>(url: string, authHeader?: string): Promise<T | null> {
        // Use HTTP/2 client for nuget.org sources (multiplexing for better performance)
        if (url.includes('.nuget.org')) {
            return http2Client.fetchJson<T>(url);
        }
        return this.fetchJsonHttp1<T>(url, authHeader);
    }

    private fetchJsonHttp1<T>(url: string, authHeader?: string, maxRedirects: number = 5): Promise<T | null> {
        return new Promise((resolve) => {
            const client = url.startsWith('https://') ? https : http;
            const parsed = new URL(url);

            const headers: Record<string, string> = {
                'Accept': 'application/json'
            };
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }

            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'GET',
                headers,
                timeout: NuGetService.HTTP_REQUEST_TIMEOUT
            };

            const req = client.request(options, (res) => {
                // Handle redirects (with SSRF protection)
                const redirect = resolveRedirect(res.statusCode, res.headers.location, url, authHeader);
                if (redirect) {
                    this.fetchJsonHttp1<T>(redirect.redirectUrl, redirect.forwardAuth, maxRedirects - 1).then(resolve);
                    return;
                }
                if (res.statusCode !== 200) {
                    if (res.statusCode !== 404) {
                        console.error(`[NuGet] HTTP ${res.statusCode} fetching JSON`);
                    }
                    resolve(null);
                    return;
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve(null);
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });

            req.on('error', () => {
                resolve(null);
            });

            req.end();
        });
    }

    /**
     * Fetch JSON with gzip/deflate decompression support.
     * Used for vulnerability data which can exceed 10 MB uncompressed.
     * Uses HTTP/1.1 for straightforward zlib stream piping.
     */
    private fetchJsonWithCompression<T>(url: string, authHeader?: string, maxRedirects: number = NuGetService.MAX_REDIRECTS): Promise<T | null> {
        return new Promise((resolve) => {
            if (maxRedirects <= 0) {
                resolve(null);
                return;
            }

            const client = url.startsWith('https://') ? https : http;
            const parsed = new URL(url);

            const headers: Record<string, string> = {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate'
            };
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }

            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'GET',
                headers,
                timeout: NuGetService.HTTP_REQUEST_TIMEOUT
            };

            const req = client.request(options, (res) => {
                // Handle redirects (with SSRF protection)
                const redirect = resolveRedirect(res.statusCode, res.headers.location, url, authHeader);
                if (redirect) {
                    this.fetchJsonWithCompression<T>(redirect.redirectUrl, redirect.forwardAuth, maxRedirects - 1).then(resolve);
                    return;
                }
                if (res.statusCode !== 200) {
                    if (res.statusCode !== 404) {
                        console.error(`[NuGet] HTTP ${res.statusCode} fetching compressed JSON: ${url}`);
                    }
                    resolve(null);
                    return;
                }

                // Select decompression stream based on content-encoding
                const encoding = res.headers['content-encoding'];
                let stream: NodeJS.ReadableStream = res;
                if (encoding === 'gzip' || encoding === 'x-gzip') {
                    stream = res.pipe(zlib.createGunzip());
                } else if (encoding === 'deflate') {
                    stream = res.pipe(zlib.createInflate());
                }

                const chunks: Buffer[] = [];
                let totalSize = 0;
                let resolved = false;

                stream.on('data', (chunk: Buffer) => {
                    if (resolved) { return; }
                    totalSize += chunk.length;
                    if (totalSize > NuGetService.MAX_VULNERABILITY_RESPONSE_SIZE) {
                        resolved = true;
                        req.destroy();
                        console.warn(`[NuGet] Vulnerability response exceeded ${NuGetService.MAX_VULNERABILITY_RESPONSE_SIZE} bytes (decompressed): ${url}`);
                        resolve(null);
                        return;
                    }
                    chunks.push(chunk);
                });

                stream.on('end', () => {
                    if (resolved) { return; }
                    resolved = true;
                    try {
                        const data = Buffer.concat(chunks).toString('utf8');
                        resolve(JSON.parse(data));
                    } catch {
                        resolve(null);
                    }
                });

                stream.on('error', () => {
                    if (resolved) { return; }
                    resolved = true;
                    resolve(null);
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });

            req.on('error', () => {
                resolve(null);
            });

            req.end();
        });
    }


    public async extractReadmeFromPackage(packageId: string, version: string, source?: string): Promise<string | null> {
        return this._packageService.extractReadmeFromPackage(packageId, version, source);
    }

    /**
     * Download a file from URL to local path
     */
    private downloadFile(url: string, destPath: string, maxRedirects: number = NuGetService.MAX_REDIRECTS): Promise<boolean> {
        return new Promise((resolve) => {
            if (maxRedirects <= 0) {
                resolve(false);
                return;
            }

            const client = url.startsWith('https://') ? https : http;
            const file = fs.createWriteStream(destPath);
            let totalBytes = 0;
            let destroyed = false;

            const cleanup = (success: boolean) => {
                if (destroyed) { return; }
                destroyed = true;
                file.close();
                if (!success) {
                    try { fs.unlinkSync(destPath); } catch { /* ignore */ }
                }
                resolve(success);
            };

            file.on('error', () => {
                cleanup(false);
            });

            const parsed = new URL(url);
            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'GET',
                timeout: NuGetService.HTTP_REQUEST_TIMEOUT
            };

            const req = client.request(options, (res) => {
                // Handle redirects (with SSRF protection)
                const redirect = resolveRedirect(res.statusCode, res.headers.location, url);
                if (redirect) {
                    file.close();
                    destroyed = true;
                    this.downloadFile(redirect.redirectUrl, destPath, maxRedirects - 1).then(resolve);
                    return;
                }

                if (res.statusCode !== 200) {
                    cleanup(false);
                    return;
                }

                res.on('data', (chunk: Buffer) => {
                    totalBytes += chunk.length;
                    if (totalBytes > NuGetService.MAX_DOWNLOAD_SIZE) {
                        req.destroy();
                        cleanup(false);
                        return;
                    }
                    file.write(chunk);
                });

                res.on('end', () => {
                    file.end(() => {
                        if (!destroyed) {
                            destroyed = true;
                            resolve(true);
                        }
                    });
                });
            });

            req.on('timeout', () => {
                req.destroy();
                cleanup(false);
            });

            req.on('error', () => {
                cleanup(false);
            });

            req.end();
        });
    }

    async getTransitivePackages(projectPath: string): Promise<TransitivePackagesResult> {
        return this._projectService.getTransitivePackages(projectPath);
    }

    /** All-projects transitive flow — preserves error categorization (parse-failed/fs-error/unknown). */
    async getTransitivePackagesPreservingErrors(projectPath: string): Promise<TransitivePackagesResult> {
        return this._projectService.getTransitivePackagesPreservingErrors(projectPath);
    }


    public async fetchTransitivePackageMetadata(packages: TransitivePackage[]): Promise<void> {
        return this._packageService.fetchTransitivePackageMetadata(packages);
    }

    /**
     * Restore the project using dotnet restore
     * This generates/updates project.assets.json which is needed for transitive packages
     */
    async restoreProject(projectPath: string): Promise<boolean> {
        return this._cliService.restoreProject(projectPath);
    }
}

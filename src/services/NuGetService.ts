import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as zlib from 'zlib';
import { credentialService, CredentialService } from './CredentialService';
import { http2Client, isSafeRedirectTarget } from './Http2Client';
import { NuGetConfigParser } from './NuGetConfigParser';
import {
    InstalledPackage, NuGetRegistrationEntry, NuGetRegistrationPage,
    NuGetSearchEntry, NuGetSearchResponse, NuGetSource,
    PackageDependency, PackageDependencyGroup,
    PackageMetadata, PackageSearchResult, PackageVulnerability, Project,
    QuickSearchSourceResult, TransitiveFrameworkSection, TransitivePackage,
    TransitivePackagesResult, VulnerabilitySeverity
} from './NuGetTypes';
import {
    batchedPromiseAll, ExecError, execWithTimeout, fileExists,
    isNewerVersion, isValidPackageId, isValidSourceName, isValidSourceUrl,
    isValidVersion, isVersionInRange, LRUMap, parseVersionSpec
} from './NuGetUtils';
import { CACHE_TTL, cacheKeys, workspaceCache } from './WorkspaceCache';

// Re-export types for backward compatibility with existing consumers
export type { InstalledPackage, NuGetRegistrationEntry, NuGetRegistrationPage, NuGetSearchEntry, NuGetSearchResponse, NuGetSource, PackageDependency, PackageDependencyGroup, PackageMetadata, PackageSearchResult, Project, QuickSearchSourceResult, TransitiveFrameworkSection, TransitivePackage, TransitivePackagesResult, VersionSpec, VersionType } from './NuGetTypes';

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

// Service index endpoint types
interface NuGetServiceIndex {
    version: string;
    resources: Array<{
        '@id': string;
        '@type': string | string[];
    }>;
}

// Cache for service index endpoints
interface ServiceEndpoints {
    packageBaseAddress?: string; // flat container for versions and content
    registrationsBaseUrl?: string; // registration for metadata
    searchQueryService?: string; // search
    searchAutocompleteService?: string; // autocomplete for quick search
    vulnerabilityInfoUrl?: string; // vulnerability data index
}

/**
 * Result from fetchJsonWithDetails - includes error information for better diagnostics
 */
interface FetchResult<T> {
    data: T | null;
    error?: {
        type: 'network' | 'auth' | 'not-found' | 'server-error' | 'invalid-json' | 'unknown';
        statusCode?: number;
        message: string;
    };
}

export class NuGetService {
    private configParser: NuGetConfigParser;
    // LRU cache for service index endpoints (max 50 sources)
    private serviceIndexCache: LRUMap<string, ServiceEndpoints> = new LRUMap(50);
    // LRU cache for package metadata (key: packageId@version, max 200 entries)
    private metadataCache: LRUMap<string, PackageMetadata> = new LRUMap(200);
    // Track sources that failed to resolve (url -> error message) - warns once per session
    private failedSources: Map<string, string> = new Map();
    // LRU cache for resolved icon URLs (key: packageId@version, max 500 entries)
    // Stores the resolved icon URL string, or empty string if no icon found from any source
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
    // Maximum download size for nupkg files (50 MB) to prevent disk exhaustion
    private static readonly MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024;
    // Maximum number of HTTP redirects to follow before aborting
    private static readonly MAX_REDIRECTS = 5;
    // Maximum response body size for text/JSON fetches (10 MB) to prevent out-of-memory
    private static readonly MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
    // Maximum decompressed response size for vulnerability data (50 MB)
    // Vulnerability base JSON is ~15-20 MB uncompressed but ~2-3 MB with gzip
    private static readonly MAX_VULNERABILITY_RESPONSE_SIZE = 50 * 1024 * 1024;
    // In-memory vulnerability data: Map<lowercasePackageId, Array<{severity, url, versions}>>
    private vulnerabilityData: Map<string, { severity: number; url: string; versions: string }[]> = new Map();
    // Timestamp of last vulnerability data fetch
    private vulnerabilityDataTimestamp: number = 0;
    // Vulnerability data TTL: 1 hour
    private static readonly VULNERABILITY_CACHE_TTL = 3600000;
    // Cache for parsed project.assets.json (path -> { mtime, data })
    // Avoids re-parsing large files (5-50MB) multiple times in a single flow
    private assetsJsonCache: Map<string, { mtimeMs: number; data: unknown; timestamp: number }> = new Map();
    // Assets cache TTL: 30 seconds
    private static readonly ASSETS_CACHE_TTL = 30000;
    // Maximum number of cached assets files (one per project typically)
    private static readonly MAX_ASSETS_CACHE_ENTRIES = 5;
    // Cache for getSources() to avoid repeated CLI spawns (dotnet nuget list source)
    // Multiple parallel getPackageVersions calls share a single CLI result
    private _sourcesCache: NuGetSource[] | null = null;
    private _sourcesCacheTime: number = 0;
    private static readonly SOURCES_CACHE_TTL = 30000; // 30 seconds
    // Cached global-packages folder path (resolved once via dotnet CLI)
    private _globalPackagesFolder: string | null = null;
    // Circuit breaker for icon resolution per source — skip sources after N consecutive misses
    // Prevents N×M HEAD requests when a source has no icons (N packages × M sources)
    private iconSourceMissCount: Map<string, number> = new Map();
    private static readonly ICON_SOURCE_MISS_THRESHOLD = 5;
    private outputChannel: vscode.LogOutputChannel;
    // Cached credentials from nuget.config (source name -> credentials)
    private nugetConfigCredentials: Map<string, { username?: string; password?: string; isEncrypted: boolean }> | null = null;
    // Map of source URL to source name for credential lookup
    private sourceUrlToName: Map<string, string> = new Map();
    // Track sources that need interactive auth (show warning once per session)
    private sourcesNeedingAuth: Set<string> = new Set();
    // Cache for detected SDK major version per project directory (dir -> major version number)
    // Used to choose between old (SDK ≤ 9) and new (SDK ≥ 10) CLI syntax
    private _sdkVersionCache: Map<string, number> = new Map();

    constructor(outputChannel: vscode.LogOutputChannel) {
        this.configParser = new NuGetConfigParser();
        this.outputChannel = outputChannel;
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

    /**
     * Get the noRestore setting - when true, adds --no-restore to install/update commands
     */
    private getNoRestoreFlag(): string {
        const config = vscode.workspace.getConfiguration('nuiget');
        return config.get<boolean>('noRestore', false) ? '--no-restore' : '';
    }

    /**
     * Detect the .NET SDK major version for a given project path.
     * Runs `dotnet --version` with cwd set to the project's directory so that
     * directory-local global.json files are respected. Result is cached per directory.
     * Falls back to 9 on any error (old syntax works as aliases on SDK 10+).
     */
    private async getSdkMajorVersion(projectPath: string): Promise<number> {
        const projectDir = path.dirname(projectPath);
        const cached = this._sdkVersionCache.get(projectDir);
        if (cached !== undefined) { return cached; }

        try {
            const { stdout } = await execWithTimeout('dotnet --version', { timeout: 10000, cwd: projectDir });
            const versionStr = stdout.trim(); // e.g. "10.0.100-preview.1.25120.13"
            const major = parseInt(versionStr.split('.')[0], 10);
            const result = isNaN(major) ? 9 : major;
            this._sdkVersionCache.set(projectDir, result);
            return result;
        } catch {
            // Fallback to old syntax (safe: old syntax still works as aliases on SDK 10+)
            this._sdkVersionCache.set(projectDir, 9);
            return 9;
        }
    }

    /**
     * Check if the SDK for a project uses noun-first CLI syntax (SDK >= 10).
     */
    private async useNounFirstSyntax(projectPath: string): Promise<boolean> {
        return (await this.getSdkMajorVersion(projectPath)) >= 10;
    }

    /** Clear the cached SDK version detection (e.g. after global.json changes) */
    clearSdkVersionCache(): void {
        this._sdkVersionCache.clear();
    }

    /**
     * Setup output channel before an operation (show channel)
     */
    setupOutputChannel(skipSetup: boolean = false): void {
        if (skipSetup) {
            return;
        }
        // Add empty line between operations
        this.outputChannel.appendLine('');
        this.outputChannel.show(true); // true = preserve focus
    }

    /**
     * Sanitize text to remove sensitive information before logging
     * Redacts: URLs with embedded credentials, API keys, tokens, passwords
     */
    private sanitizeForLogging(text: string): string {
        if (!text) {
            return text;
        }

        let sanitized = text;

        // Redact URLs with embedded credentials (user:password@host)
        // Matches http(s)://user:password@host patterns
        sanitized = sanitized.replace(
            /(https?:\/\/)([^:@\s]+):([^@\s]+)@/gi,
            '$1[REDACTED]:[REDACTED]@'
        );

        // Redact CLI-style password arguments (--password "value" or -p "value")
        sanitized = sanitized.replace(
            /(--password|-p)\s+["']?([^"'\s]+)["']?/gi,
            '$1 "[REDACTED]"'
        );

        // Redact common API key patterns (key=value, apikey=value, etc.)
        sanitized = sanitized.replace(
            /(api[-_]?key|apikey|access[-_]?token|auth[-_]?token|bearer|password|secret|credential)[\s]*[=:]\s*['"]?([^\s'"]+)['"]?/gi,
            '$1=[REDACTED]'
        );

        // Redact Authorization headers
        sanitized = sanitized.replace(
            /(Authorization|X-Api-Key|X-NuGet-ApiKey)[\s]*:[\s]*([^\r\n]+)/gi,
            '$1: [REDACTED]'
        );

        // Redact NuGet source credentials that might appear in verbose output
        sanitized = sanitized.replace(
            /(ClearTextPassword|Password|EncryptedPassword)[\s]*[=:]\s*['"]?([^\s'"<>]+)['"]?/gi,
            '$1=[REDACTED]'
        );

        return sanitized;
    }

    /**
     * Log to output channel with color-coded levels
     */
    private logOutput(command: string, stdout: string, stderr: string, success: boolean = true): void {
        // Sanitize all output to remove sensitive information
        const safeCommand = this.sanitizeForLogging(command);
        const safeStdout = this.sanitizeForLogging(stdout);
        const safeStderr = this.sanitizeForLogging(stderr);

        // Log the command (info level = blue)
        this.outputChannel.info(`> ${safeCommand}`);

        // Log stdout as debug (normal text)
        if (safeStdout && safeStdout.trim()) {
            this.outputChannel.debug(safeStdout.trim());
        }
        // Log stderr as warning or error based on success
        if (safeStderr && safeStderr.trim()) {
            if (success) {
                this.outputChannel.warn(`[stderr] ${safeStderr.trim()}`);
            } else {
                this.outputChannel.error(`[stderr] ${safeStderr.trim()}`);
            }
        }

        // Empty line for readability
        this.outputChannel.trace('');
    }

    /**
     * Log success message
     */
    private logSuccess(message: string): void {
        this.outputChannel.info(`✓ ${message}`);
    }

    /**
     * Log warning message (yellow)
     */
    private logWarning(message: string): void {
        this.outputChannel.warn(`⚠ ${message}`);
    }

    /**
     * Log error message (red)
     */
    private logError(message: string): void {
        this.outputChannel.error(`✗ ${message}`);
    }

    /**
     * Log a summary header for bulk operations
     */
    logBulkOperationHeader(operationType: string, packageCount: number): void {
        const header = packageCount > 0
            ? `${operationType} ${packageCount} packages...`
            : operationType;
        this.outputChannel.info(header);
        this.outputChannel.info('='.repeat(header.length));
        this.outputChannel.trace('');
    }

    /**
     * Check if a source URL is a local file path (not an HTTP endpoint)
     */
    private isLocalSource(sourceUrl: string): boolean {
        // Local paths start with drive letter (C:\) or UNC path (\\) or don't start with http
        return !sourceUrl.startsWith('http://') && !sourceUrl.startsWith('https://');
    }

    /**
     * Generate a friendly source name from a URL or local path.
     * Examples:
     * - https://api.nuget.org/v3/index.json → nuget.org
     * - https://pkgs.dev.azure.com/myorg/_packaging/myfeed/nuget/v3/index.json → myorg-myfeed
     * - https://mycompany.jfrog.io/artifactory/api/nuget/v3/nuget-local → mycompany-nuget-local
     * - C:\packages\myfeed → myfeed
     * If the generated name conflicts with existing names, appends -2, -3, etc.
     */
    private generateSourceNameFromUrl(url: string, existingNames: Set<string>): string {
        let baseName = 'custom-source';

        try {
            if (this.isLocalSource(url)) {
                // For local paths, use the last folder name
                // Handle both Windows (\) and Unix (/) separators
                const normalized = url.replace(/\\/g, '/');
                const segments = normalized.split('/').filter(s => s && !s.includes(':'));
                if (segments.length > 0) {
                    baseName = segments[segments.length - 1];
                }
            } else {
                // Parse HTTP(S) URL
                const parsed = new URL(url);
                const hostname = parsed.hostname.toLowerCase();
                const pathSegments = parsed.pathname.split('/').filter(s => s && s !== 'index.json');

                // Special case: nuget.org
                if (hostname.includes('nuget.org')) {
                    baseName = 'nuget.org';
                }
                // Azure DevOps: pkgs.dev.azure.com/myorg/_packaging/myfeed/...
                else if (hostname.includes('dev.azure.com') || hostname.includes('pkgs.visualstudio.com')) {
                    const orgIndex = pathSegments.findIndex(s => s.startsWith('_'));
                    if (orgIndex > 0) {
                        const org = pathSegments[orgIndex - 1];
                        const packagingIndex = pathSegments.indexOf('_packaging');
                        if (packagingIndex !== -1 && pathSegments[packagingIndex + 1]) {
                            baseName = `${org}-${pathSegments[packagingIndex + 1]}`;
                        } else {
                            baseName = org;
                        }
                    } else if (pathSegments.length > 0) {
                        baseName = pathSegments[0];
                    }
                }
                // JFrog/Artifactory: mycompany.jfrog.io/artifactory/api/nuget/v3/nuget-local
                else if (hostname.includes('jfrog.io') || pathSegments.includes('artifactory')) {
                    const hostPrefix = hostname.split('.')[0];
                    // Find last meaningful segment (not api, nuget, v2, v3, etc.)
                    const meaningfulSegments = pathSegments.filter(s =>
                        !['artifactory', 'api', 'nuget', 'v2', 'v3'].includes(s.toLowerCase())
                    );
                    if (meaningfulSegments.length > 0) {
                        baseName = `${hostPrefix}-${meaningfulSegments[meaningfulSegments.length - 1]}`;
                    } else {
                        baseName = hostPrefix;
                    }
                }
                // GitHub Packages: nuget.pkg.github.com/owner/...
                else if (hostname.includes('github.com')) {
                    if (pathSegments.length > 0) {
                        baseName = `github-${pathSegments[0]}`;
                    } else {
                        baseName = 'github';
                    }
                }
                // MyGet: www.myget.org/F/feedname/...
                else if (hostname.includes('myget.org')) {
                    const fIndex = pathSegments.indexOf('F');
                    if (fIndex !== -1 && pathSegments[fIndex + 1]) {
                        baseName = `myget-${pathSegments[fIndex + 1]}`;
                    } else {
                        baseName = 'myget';
                    }
                }
                // Generic: use hostname prefix + last path segment if meaningful
                else {
                    const hostPrefix = hostname.split('.')[0];
                    const meaningfulSegments = pathSegments.filter(s =>
                        !['api', 'nuget', 'v2', 'v3', 'index.json'].includes(s.toLowerCase())
                    );
                    if (meaningfulSegments.length > 0) {
                        baseName = `${hostPrefix}-${meaningfulSegments[meaningfulSegments.length - 1]}`;
                    } else {
                        baseName = hostPrefix || 'custom-source';
                    }
                }
            }
        } catch {
            // URL parsing failed, use fallback
            baseName = 'custom-source';
        }

        // Sanitize: remove invalid characters, trim
        baseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (!baseName) {
            baseName = 'custom-source';
        }

        // Check for duplicates and append suffix if needed
        const lowerExisting = new Set([...existingNames].map(n => n.toLowerCase()));
        if (!lowerExisting.has(baseName.toLowerCase())) {
            return baseName;
        }

        let suffix = 2;
        while (lowerExisting.has(`${baseName}-${suffix}`.toLowerCase())) {
            suffix++;
        }
        return `${baseName}-${suffix}`;
    }

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

    /**
     * Read and parse project.assets.json with mtime-based caching.
     * This file can be 5-50MB for large projects and is read multiple times
     * during a single flow (getResolvedVersions, getPackageDependencies, getTransitivePackages).
     * Caching avoids redundant parsing.
     */
    private async readAssetsJson<T = unknown>(assetsPath: string): Promise<T | null> {
        try {
            const stat = await fs.promises.stat(assetsPath);
            const now = Date.now();
            const cached = this.assetsJsonCache.get(assetsPath);

            // Return cached data if mtime hasn't changed and within TTL
            if (cached &&
                cached.mtimeMs === stat.mtimeMs &&
                (now - cached.timestamp) < NuGetService.ASSETS_CACHE_TTL) {
                return cached.data as T;
            }

            const content = await readFileAsync(assetsPath, 'utf-8');
            const data = JSON.parse(content) as T;

            this.assetsJsonCache.set(assetsPath, {
                mtimeMs: stat.mtimeMs,
                data,
                timestamp: now
            });

            // Evict expired entries and enforce max size to prevent unbounded memory growth
            if (this.assetsJsonCache.size > 1) {
                const keysToDelete: string[] = [];
                for (const [key, entry] of this.assetsJsonCache) {
                    if (key !== assetsPath && (now - entry.timestamp) >= NuGetService.ASSETS_CACHE_TTL) {
                        keysToDelete.push(key);
                    }
                }
                for (const key of keysToDelete) {
                    this.assetsJsonCache.delete(key);
                }
            }

            // Hard cap: if still over max, evict oldest entries
            if (this.assetsJsonCache.size > NuGetService.MAX_ASSETS_CACHE_ENTRIES) {
                let oldest = { key: '', timestamp: Infinity };
                for (const [key, entry] of this.assetsJsonCache) {
                    if (key !== assetsPath && entry.timestamp < oldest.timestamp) {
                        oldest = { key, timestamp: entry.timestamp };
                    }
                }
                if (oldest.key) { this.assetsJsonCache.delete(oldest.key); }
            }

            return data;
        } catch {
            return null;
        }
    }

    /**
     * Get resolved versions from lock files for a project
     * Tries packages.lock.json first (has explicit resolved field), falls back to obj/project.assets.json
     * Returns a map of package ID (lowercase) -> resolved version
     */
    private async getResolvedVersions(projectPath: string): Promise<Map<string, string>> {
        const projectDir = path.dirname(projectPath);
        const resolved = new Map<string, string>();

        // Try packages.lock.json first (cleaner structure)
        const lockFilePath = path.join(projectDir, 'packages.lock.json');
        try {
            if (await fileExists(lockFilePath)) {
                const lockContent = await readFileAsync(lockFilePath, 'utf-8');
                const lockData = JSON.parse(lockContent) as {
                    version: number;
                    dependencies: Record<string, Record<string, {
                        type: string;
                        requested?: string;
                        resolved: string;
                    }>>;
                };

                // Parse dependencies from all target frameworks
                if (lockData.dependencies) {
                    for (const tfm of Object.keys(lockData.dependencies)) {
                        const packages = lockData.dependencies[tfm];
                        for (const [packageId, info] of Object.entries(packages)) {
                            if (info.resolved && info.type === 'Direct') {
                                resolved.set(packageId.toLowerCase(), info.resolved);
                            }
                        }
                    }
                }

                if (resolved.size > 0) {
                    return resolved;
                }
            }
        } catch {
            // Silently fall through to project.assets.json
        }

        // Fallback: try obj/project.assets.json
        const assetsPath = path.join(projectDir, 'obj', 'project.assets.json');
        try {
            if (await fileExists(assetsPath)) {
                const assetsData = await this.readAssetsJson<{
                    version: number;
                    targets: Record<string, Record<string, unknown>>;
                }>(assetsPath);

                // Get first target framework
                if (assetsData?.targets) {
                    const targetFrameworks = Object.keys(assetsData.targets);
                    if (targetFrameworks.length > 0) {
                        const tfm = targetFrameworks[0];
                        const packages = assetsData.targets[tfm];

                        // Parse "PackageId/Version" keys
                        for (const key of Object.keys(packages)) {
                            const match = key.match(/^(.+?)\/(.+)$/);
                            if (match) {
                                const [, packageId, version] = match;
                                resolved.set(packageId.toLowerCase(), version);
                            }
                        }
                    }
                }
            }
        } catch {
            // Gracefully return empty map
        }

        return resolved;
    }

    /**
     * Get package dependencies from project.assets.json
     * Returns a map of package ID (lowercase) -> array of dependency package IDs (lowercase)
     * Used to determine uninstall order for bulk operations
     */
    async getPackageDependencies(projectPath: string): Promise<Map<string, string[]>> {
        const projectDir = path.dirname(projectPath);
        const dependencies = new Map<string, string[]>();

        // Read from obj/project.assets.json which has full dependency graph
        const assetsPath = path.join(projectDir, 'obj', 'project.assets.json');
        try {
            if (await fileExists(assetsPath)) {
                const assetsData = await this.readAssetsJson<{
                    version: number;
                    targets: Record<string, Record<string, {
                        dependencies?: Record<string, string>;
                    }>>;
                }>(assetsPath);

                // Get first target framework
                if (assetsData?.targets) {
                    const targetFrameworks = Object.keys(assetsData.targets);
                    if (targetFrameworks.length > 0) {
                        const tfm = targetFrameworks[0];
                        const packages = assetsData.targets[tfm];

                        // Parse dependencies for each package
                        for (const key of Object.keys(packages)) {
                            const match = key.match(/^(.+?)\/(.+)$/);
                            if (match) {
                                const [, packageId] = match;
                                const pkgData = packages[key];
                                const deps: string[] = [];

                                if (pkgData.dependencies) {
                                    for (const depId of Object.keys(pkgData.dependencies)) {
                                        deps.push(depId.toLowerCase());
                                    }
                                }

                                dependencies.set(packageId.toLowerCase(), deps);
                            }
                        }
                    }
                }
            }
        } catch {
            // Gracefully return empty map
        }

        return dependencies;
    }

    async findProjects(): Promise<Project[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }

        const projects: Project[] = [];

        for (const folder of workspaceFolders) {
            const pattern = new vscode.RelativePattern(folder, '**/*.{csproj,fsproj,vbproj}');
            // Exclude common non-source directories
            const excludePattern = '{**/node_modules/**,**/bin/**,**/obj/**,**/packages/**,.git/**}';
            const files = await vscode.workspace.findFiles(pattern, excludePattern);

            for (const file of files) {
                projects.push({
                    name: path.basename(file.fsPath),
                    path: file.fsPath
                });
            }
        }

        projects.sort((a, b) => a.name.localeCompare(b.name));
        return projects;
    }

    /**
     * Parse <ProjectReference> elements from a .csproj/.fsproj/.vbproj file.
     * Returns an array of absolute, normalized paths to referenced projects.
     */
    async getProjectReferences(projectPath: string): Promise<string[]> {
        const references: string[] = [];
        try {
            const content = await readFileAsync(projectPath, 'utf-8');
            const projectDir = path.dirname(projectPath);

            // Match <ProjectReference Include="..\SomeProject\SomeProject.csproj" />
            // Handles self-closing and with closing tag
            const projectRefRegex = /<ProjectReference\s+[^>]*Include\s*=\s*"([^"]+)"[^>]*(?:\/>|>[\s\S]*?<\/ProjectReference>)/gi;
            let match;
            while ((match = projectRefRegex.exec(content)) !== null) {
                const relativePath = match[1];
                const absolutePath = path.normalize(path.resolve(projectDir, relativePath));
                references.push(absolutePath);
            }
        } catch {
            // If the file can't be read, return empty array
        }
        return references;
    }

    /**
     * Build a project-level dependency map from ProjectReference elements.
     * Returns a map of normalizedProjectPath → [normalizedReferencedProjectPaths].
     * Only includes references to projects within the provided list.
     *
     * @param projectPaths Array of absolute project paths to analyze
     * @returns Map where keys are lowercase normalized project paths and values are
     *          arrays of lowercase normalized paths of projects they depend on
     */
    async getProjectDependencyMap(projectPaths: string[]): Promise<Map<string, string[]>> {
        const isWindows = process.platform === 'win32';
        const normalizePath = (p: string) => {
            const normalized = path.normalize(p);
            return isWindows ? normalized.toLowerCase() : normalized;
        };

        // Build set of known project paths for filtering
        const knownProjects = new Set(projectPaths.map(normalizePath));
        const dependencyMap = new Map<string, string[]>();

        for (const projectPath of projectPaths) {
            const key = normalizePath(projectPath);
            const refs = await this.getProjectReferences(projectPath);
            // Only include references to projects within the provided list
            const filteredRefs = refs
                .map(normalizePath)
                .filter(ref => knownProjects.has(ref) && ref !== key);
            dependencyMap.set(key, filteredRefs);
        }

        return dependencyMap;
    }

    async getInstalledPackages(projectPath: string, liteMode?: boolean): Promise<InstalledPackage[]> {
        const packages: InstalledPackage[] = [];

        // Get resolved versions from lock files
        const resolvedVersions = await this.getResolvedVersions(projectPath);

        // First try: parse the .csproj file directly (most reliable)
        try {
            const content = await readFileAsync(projectPath, 'utf-8');

            // Match PackageReference elements in various formats:
            // 1. Self-closing: <PackageReference Include="PackageName" Version="1.0.0" />
            // 2. With closing tag: <PackageReference Include="PackageName" Version="1.0.0"></PackageReference>
            // 3. With nested Version: <PackageReference Include="PackageName"><Version>1.0.0</Version></PackageReference>
            // 4. Version before Include: <PackageReference Version="1.0.0" Include="PackageName" />

            // First, find all PackageReference elements
            const packageRefRegex = /<PackageReference\s+([^>]+?)(?:\/>|>[\s\S]*?<\/PackageReference>)/gi;

            let match;
            while ((match = packageRefRegex.exec(content)) !== null) {
                const attributes = match[0];

                // Extract Include attribute
                const includeMatch = attributes.match(/Include\s*=\s*"([^"]+)"/i);
                if (!includeMatch) { continue; }

                const id = includeMatch[1];

                // Extract Version from attribute or nested element
                let version = 'unknown';
                const versionAttrMatch = attributes.match(/Version\s*=\s*"([^"]+)"/i);
                if (versionAttrMatch) {
                    version = versionAttrMatch[1];
                } else {
                    // Try nested Version element
                    const versionElemMatch = attributes.match(/<Version>([^<]+)<\/Version>/i);
                    if (versionElemMatch) {
                        version = versionElemMatch[1];
                    }
                }

                // Parse version specification
                const versionSpec = parseVersionSpec(version);
                // Only use resolved version from lock files for floating/range versions.
                // Standard (e.g. "10.0.2") and exact (e.g. "[10.0.2]") versions use the
                // .csproj value directly — lock files may still hold a stale pre-install version.
                const resolvedVersion = (versionSpec.type === 'floating' || versionSpec.type === 'range')
                    ? resolvedVersions.get(id.toLowerCase())
                    : undefined;

                packages.push({
                    id,
                    version,
                    resolvedVersion,
                    versionType: versionSpec.type,
                    floatingPrefix: versionSpec.floatingPrefix,
                    isAlwaysLatest: versionSpec.isAlwaysLatest
                });
            }

            if (packages.length > 0) {
                // Lite Mode: skip metadata enrichment (icons, verified, authors)
                if (!liteMode) {
                    await this.fetchInstalledPackageMetadata(packages);
                }
                return packages;
            }
        } catch (parseError) {
            console.error('Failed to parse csproj file:', parseError);
        }

        // Fallback: try dotnet CLI
        try {
            const projectDir = path.dirname(projectPath);
            const nounFirst = await this.useNounFirstSyntax(projectPath);
            const listCommand = nounFirst
                ? `dotnet package list --project "${projectPath}"`
                : `dotnet list "${projectPath}" package`;
            const { stdout } = await execWithTimeout(listCommand, { cwd: projectDir });

            // Get direct package references from csproj and Directory.Build.props for cross-reference
            // Some SDK-implicit packages appear as "top-level" but aren't user-added PackageReferences
            const directPackageIds = new Set<string>();
            let successfullyReadCsproj = false;

            // Files to check for PackageReference elements
            const filesToCheck = [
                projectPath,
                path.join(projectDir, 'Directory.Build.props'),
                path.join(projectDir, 'Directory.Packages.props')
            ];

            for (const filePath of filesToCheck) {
                try {
                    const content = await readFileAsync(filePath, 'utf-8');
                    // Track if we successfully read the main csproj
                    if (filePath === projectPath) {
                        successfullyReadCsproj = true;
                    }
                    const packageRefRegex = /<PackageReference\s+[^>]*Include\s*=\s*"([^"]+)"/gi;
                    let refMatch;
                    while ((refMatch = packageRefRegex.exec(content)) !== null) {
                        directPackageIds.add(refMatch[1].toLowerCase());
                    }
                    // Also check PackageVersion elements (Central Package Management)
                    const packageVersionRegex = /<PackageVersion\s+[^>]*Include\s*=\s*"([^"]+)"/gi;
                    while ((refMatch = packageVersionRegex.exec(content)) !== null) {
                        directPackageIds.add(refMatch[1].toLowerCase());
                    }
                } catch {
                    // File doesn't exist or can't be read - skip it
                }
            }

            // Parse CLI output - it has "Top-level Package" and "Transitive Package" sections
            const lines = stdout.split('\n');
            let isInTransitiveSection = false;

            for (const line of lines) {
                // Detect section headers
                if (line.includes('Top-level Package')) {
                    isInTransitiveSection = false;
                    continue;
                }
                if (line.includes('Transitive Package')) {
                    isInTransitiveSection = true;
                    continue;
                }

                // Lines with packages have format: "   > PackageName    Requested    Resolved"
                // Match lines starting with > and capture package name and last version (resolved)
                const match = line.match(/^\s*>\s+(\S+).*?(\d+\.\d+[\w.-]*)\s*$/);
                if (match) {
                    const pkgId = match[1];
                    // Package is implicit if:
                    // 1. It's in transitive section, OR
                    // 2. We read the csproj and it's not a direct PackageReference anywhere
                    //    (SDK packages like Microsoft.NET.ILLink.Tasks appear as "top-level" but can't be uninstalled)
                    const isImplicit = isInTransitiveSection ||
                        (successfullyReadCsproj && !directPackageIds.has(pkgId.toLowerCase()));
                    // CLI returns resolved versions, so treat as standard
                    packages.push({
                        id: pkgId,
                        version: match[2],
                        versionType: 'standard',
                        isImplicit
                    });
                }
            }

            // Fetch icons, verified status, and authors for installed packages (skip in Lite Mode)
            if (!liteMode) {
                await this.fetchInstalledPackageMetadata(packages);
            }

            return packages;
        } catch (error) {
            // Don't show error if we already parsed from csproj
            if (packages.length === 0) {
                console.error('Failed to get installed packages via dotnet CLI:', error);
            }
            // Fetch icons, verified status, and authors for packages parsed from csproj (skip in Lite Mode)
            if (packages.length > 0 && !liteMode) {
                await this.fetchInstalledPackageMetadata(packages);
            }
            return packages;
        }
    }

    /**
     * Fetch and cache vulnerability data from all enabled sources.
     * Downloads vulnerability index + page files, builds an in-memory lookup map.
     * Data is cached for 1 hour (VULNERABILITY_CACHE_TTL).
     */
    private async fetchVulnerabilityData(): Promise<void> {
        // Return cached data if still fresh
        if (this.vulnerabilityData.size > 0 && (Date.now() - this.vulnerabilityDataTimestamp) < NuGetService.VULNERABILITY_CACHE_TTL) {
            return;
        }

        const allSources = await this.getSources();
        const enabledSources = allSources.filter(s => s.enabled && !this.isLocalSource(s.url));

        const newData = new Map<string, { severity: number; url: string; versions: string }[]>();

        for (const source of enabledSources) {
            try {
                const endpoints = await this.discoverServiceEndpoints(source.url);
                if (!endpoints.vulnerabilityInfoUrl) { continue; }

                const authHeader = await this.getAuthHeader(source.url);
                // Fetch vulnerability index (array of page references)
                const index = await this.fetchJsonWithCompression<{ '@name': string; '@id': string; '@updated': string }[]>(
                    endpoints.vulnerabilityInfoUrl, authHeader
                );
                if (!Array.isArray(index) || index.length === 0) { continue; }

                // Fetch each vulnerability page and merge into lookup
                for (const page of index) {
                    if (!page['@id']) { continue; }
                    try {
                        const pageData = await this.fetchJsonWithCompression<Record<string, { severity: number; url: string; versions: string }[]>>(
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
     * Checks the cached vulnerability data against the package's version using NuGet range syntax.
     */
    private getVulnerabilities(packageId: string, version: string): PackageVulnerability[] {
        const vulns = this.vulnerabilityData.get(packageId.toLowerCase());
        if (!vulns || vulns.length === 0) { return []; }

        const matches: PackageVulnerability[] = [];
        for (const v of vulns) {
            if (isVersionInRange(version, v.versions)) {
                matches.push({
                    advisoryUrl: v.url,
                    severity: NuGetService.mapSeverity(v.severity)
                });
            }
        }
        return matches;
    }

    /**
     * Get the download size of a package (in bytes) via HEAD request to the flat container nupkg URL.
     * Returns -1 if size cannot be determined.
     */
    async getPackageSize(packageId: string, version: string, sourceUrl?: string): Promise<number> {
        try {
            const source = sourceUrl || 'https://api.nuget.org/v3/index.json';
            const endpoints = await this.discoverServiceEndpoints(source);
            if (!endpoints.packageBaseAddress) { return -1; }

            const baseUrl = endpoints.packageBaseAddress.replace(/\/$/, '');
            const nupkgUrl = `${baseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}/${packageId.toLowerCase()}.${version.toLowerCase()}.nupkg`;
            const authHeader = await this.getAuthHeader(source);
            return await http2Client.headRequestContentLength(nupkgUrl, authHeader);
        } catch {
            return -1;
        }
    }

    /**
     * Fetch icon URLs, verified status, and authors for installed packages from NuGet API or custom sources
     * Uses NuGet search API for verified status and authors
     * Batches requests to limit concurrent network operations
     */
    private async fetchInstalledPackageMetadata(packages: InstalledPackage[]): Promise<void> {
        // Get all enabled sources for fallback
        const allSources = await this.getSources();
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
                        const endpoints = await this.discoverServiceEndpoints(source.url);

                        // Try to get authors from search API
                        if (endpoints.searchQueryService) {
                            const customAuthHeader = await this.getAuthHeader(source.url);
                            const customSearchUrl = `${endpoints.searchQueryService}?q=packageid:${encodeURIComponent(pkg.id)}&take=1&prerelease=true`;
                            const customData = await this.fetchJson<NuGetSearchResponse>(customSearchUrl, customAuthHeader);
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

    /**
     * Autocomplete package IDs for quick search (typeahead).
     * Uses the NuGet Autocomplete API which returns only package ID strings - much lighter than full search.
     * Returns empty array for sources that don't support autocomplete (Option A: silently skip).
     *
     * @param query - The search query (prefix match on package IDs)
     * @param sources - Optional array of source URLs to search
     * @param includePrerelease - Whether to include prerelease packages
     * @param take - Maximum number of results to return (default: 5)
     * @returns Array of package ID strings
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
        const validSources = sources?.filter(s => s && s.trim() && !this.isLocalSource(s)) || [];

        // Determine sources to search:
        // - Single source selected → use only that source
        // - Multiple sources ("all") → query nuget.org + custom sources in parallel
        const isMultipleSources = validSources.length > 1 || validSources.length === 0;
        const nugetOrgUrl = 'https://api.nuget.org/v3/index.json';
        const sourcesToSearch = isMultipleSources
            ? [nugetOrgUrl, ...validSources.filter(s => !s.includes('nuget.org'))]
            : validSources;

        // Deduplicate source URLs
        const uniqueSources = [...new Set(sourcesToSearch)];

        // Build cache key from all sources being searched
        const sourceKey = isMultipleSources ? 'all' : uniqueSources[0] || 'nuget.org';
        const cacheKey = `${trimmedQuery.toLowerCase()}|${sourceKey}|${includePrerelease ? 'pre' : 'stable'}|${take}`;

        // Check cache (30-second TTL)
        const cached = this.autocompleteCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < NuGetService.AUTOCOMPLETE_CACHE_TTL) {
            return cached.data;
        }

        // Query all sources in parallel
        const fetchPromises = uniqueSources.map(async (sourceUrl): Promise<string[]> => {
            try {
                const endpoints = await this.discoverServiceEndpoints(sourceUrl);

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
                    const authHeader = await this.getAuthHeader(sourceUrl);
                    const result = await this.fetchJson<{ data: string[]; totalHits?: number }>(autocompleteUrl, authHeader);

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
                    const authHeader = await this.getAuthHeader(sourceUrl);
                    const result = await this.fetchJson<{ data: Array<{ id: string }> }>(searchUrl, authHeader);

                    if (result?.data && Array.isArray(result.data)) {
                        return result.data.map(pkg => pkg.id);
                    }
                }
            } catch {
                // Silently fail for individual sources
            }
            return [];
        });

        // Wait for all sources with a 2s timeout cap — return whatever we have by then.
        // This prevents slow custom sources from blocking the typeahead UX.
        let results: PromiseSettledResult<string[]>[];
        if (isMultipleSources && uniqueSources.length > 1) {
            // Track which promises have settled
            const settled: (string[] | null)[] = new Array(fetchPromises.length).fill(null);
            const wrappedPromises = fetchPromises.map((p, i) =>
                p.then(value => { settled[i] = value; return value; })
                    .catch(() => { settled[i] = []; return [] as string[]; })
            );

            // Race all promises against a 2s deadline
            const allDone = Promise.all(wrappedPromises);
            const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 2000));
            const raceResult = await Promise.race([allDone, timeout]);

            if (raceResult !== null) {
                // All completed within 2s
                results = raceResult.map(v => ({ status: 'fulfilled' as const, value: v }));
            } else {
                // Timeout — collect whatever has settled so far
                results = settled.map(v =>
                    v !== null
                        ? { status: 'fulfilled' as const, value: v }
                        : { status: 'fulfilled' as const, value: [] as string[] }
                );
            }
        } else {
            // Single source — no timeout needed, just wait
            results = await Promise.allSettled(fetchPromises);
        }

        // Merge results: nuget.org first (index 0 when isMultipleSources), then custom sources
        // This ensures nuget.org IDs "win" collisions in the dedup set
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

        // Limit total results and cache
        const finalResults = allResults.slice(0, take);
        this.autocompleteCache.set(cacheKey, { data: finalResults, timestamp: Date.now() });

        return finalResults;
    }

    /**
     * Grouped quick search - returns results grouped by source.
     * Uses Autocomplete API for nuget.org (fast), Search API for other sources.
     * All sources queried in parallel.
     *
     * @param query - The search query
     * @param sources - Array of source URLs to search
     * @param includePrerelease - Whether to include prerelease packages
     * @param take - Maximum results per source (default: 5)
     * @returns Array of results grouped by source, nuget.org first
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
        const validSources = sources?.filter(s => s && s.url && s.url.trim() && !this.isLocalSource(s.url)) || [];

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

        // Filter out nulls (failed sources) and order: nuget.org first, then others in original order
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
            const endpoints = await this.discoverServiceEndpoints(nugetOrgUrl);

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
            const result = await this.fetchJson<{ data: string[]; totalHits?: number }>(autocompleteUrl);

            if (result?.data && Array.isArray(result.data)) {
                return {
                    sourceName: 'nuget.org',
                    sourceUrl: nugetOrgUrl,
                    packageIds: result.data.slice(0, take)
                };
            }
        } catch {
            // Silently fail
        }
        return null;
    }

    /**
     * Quick search a non-nuget.org source using Search API
     */
    private async quickSearchSource(
        sourceUrl: string,
        sourceName: string,
        query: string,
        includePrerelease?: boolean,
        take: number = 5
    ): Promise<QuickSearchSourceResult | null> {
        try {
            const endpoints = await this.discoverServiceEndpoints(sourceUrl);

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

            // Get auth header for this source
            const authHeader = await this.getAuthHeader(sourceUrl);

            const searchUrl = `${endpoints.searchQueryService}?${params.toString()}`;
            const result = await this.fetchJson<{ data: Array<{ id: string }> }>(searchUrl, authHeader);

            if (result?.data && Array.isArray(result.data)) {
                const packageIds = result.data.map(pkg => pkg.id).slice(0, take);

                return {
                    sourceName,
                    sourceUrl,
                    packageIds
                };
            }
        } catch {
            // Silently fail
        }
        return null;
    }

    /**
     * Search packages directly via the NuGet SearchQueryService API.
     * Used when only a single nuget.org source is active — returns all metadata fields
     * in a single HTTP/2 call, eliminating the CLI spawn + N enrichment API calls.
     *
     * @param query - The search query
     * @param includePrerelease - Whether to include prerelease packages
     * @param liteMode - If true, skip cache population for enrichment data
     * @param take - Maximum number of results
     * @param exactMatch - If true, search by exact package ID
     * @returns Array of PackageSearchResult, or null if the API call failed (caller should fall back to CLI)
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
            const endpoints = await this.discoverServiceEndpoints(nugetOrgUrl);
            if (!endpoints.searchQueryService) {
                return null;
            }

            // Build query: exactMatch uses packageid: prefix for precise lookup
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
            const data = await this.fetchJson<{
                totalHits?: number;
                data: Array<{
                    id: string;
                    version: string;
                    description?: string;
                    authors?: string | string[];
                    totalDownloads?: number;
                    iconUrl?: string;
                    verified?: boolean;
                    versions?: Array<{ version: string; downloads?: number }>;
                }>;
            }>(searchUrl);

            if (!data?.data || !Array.isArray(data.data)) {
                return null;
            }

            this.outputChannel.debug(`[API Search] nuget.org returned ${data.data.length} results (totalHits: ${data.totalHits ?? '?'})`);

            const packages: PackageSearchResult[] = [];
            for (const item of data.data) {
                if (!item.id || !item.version) {
                    continue;
                }

                // Normalize authors: API may return string or string[]
                const authors = Array.isArray(item.authors)
                    ? item.authors.join(', ')
                    : (item.authors ?? '');

                const pkg: PackageSearchResult = {
                    id: item.id,
                    version: item.version,
                    // Match CLI output: CLI returns empty description — detailed description
                    // is cached below and loaded on-demand when the user clicks a package.
                    description: '',
                    authors: liteMode ? '' : authors,
                    totalDownloads: item.totalDownloads,
                    versions: [item.version],
                    iconUrl: undefined,
                    // In liteMode (sidebar), CLI never returns verified — keep parity
                    verified: liteMode ? undefined : item.verified
                };

                // Construct flat container icon URL if the search API confirms an icon exists
                if (item.iconUrl && !item.version.includes('*') && !item.version.includes('[') && !item.version.includes('(')) {
                    const lowerId = item.id.toLowerCase();
                    const lowerVersion = item.version.toLowerCase();
                    const flatContainerUrl = `https://api.nuget.org/v3-flatcontainer/${lowerId}/${lowerVersion}/icon`;
                    pkg.iconUrl = flatContainerUrl;

                    // Pre-populate icon cache so resolveIconUrl() won't issue a HEAD
                    if (!liteMode) {
                        const iconCacheKey = cacheKeys.iconExists(item.id, item.version);
                        this.iconUrlCache.set(iconCacheKey, flatContainerUrl);
                        workspaceCache.set(iconCacheKey, flatContainerUrl, CACHE_TTL.ICON_EXISTS);
                    }
                }

                // Pre-populate verified/authors/description cache so getPackageSearchMetadata()
                // won't re-fetch when user clicks on a package for details
                if (!liteMode) {
                    const statusCacheKey = cacheKeys.verifiedStatus(item.id);
                    const cacheValue = {
                        verified: item.verified === true,
                        authors: authors || undefined,
                        description: item.description
                    };
                    this.verifiedStatusCache.set(statusCacheKey, cacheValue);
                    workspaceCache.set(statusCacheKey, cacheValue, CACHE_TTL.VERIFIED_STATUS);
                }

                packages.push(pkg);
            }

            return packages;
        } catch (error) {
            this.outputChannel.debug(`[API Search] Failed, will fall back to CLI: ${error}`);
            return null; // Signal caller to fall back to CLI
        }
    }

    async searchPackages(query: string, sources?: string[], includePrerelease?: boolean, liteMode?: boolean, take?: number, exactMatch?: boolean): Promise<PackageSearchResult[]> {
        try {
            // Check cache first
            const searchCacheKey = cacheKeys.searchResults(query, sources || [], includePrerelease ?? false) + (liteMode ? ':lite' : '') + (take ? `:take${take}` : '') + (exactMatch ? ':exact' : '');

            // Check in-memory cache (fastest)
            const memoryCached = this.searchResultsCache.get(searchCacheKey);
            if (memoryCached) {
                return memoryCached;
            }

            // Check workspace cache (persists across panel closes)
            const workspaceCached = workspaceCache.get<PackageSearchResult[]>(searchCacheKey);
            if (workspaceCached) {
                this.searchResultsCache.set(searchCacheKey, workspaceCached);
                return workspaceCached;
            }

            let sourceArg = '';
            // Filter out empty source strings
            const validSources = sources?.filter(s => s && s.trim()) || [];

            // Filter out sources known to be unreachable to avoid CLI TCP timeouts (~21s each)
            // failedEndpointCache is populated by the background source health monitor
            const healthySources = validSources.length > 0 ? this.filterHealthySources(validSources) : [];

            // Optimization: when only a single nuget.org source is active, use the SearchQueryService
            // API directly instead of spawning a CLI process + N enrichment API calls.
            // The V3 Search API is not rate-limited on nuget.org and returns all metadata fields
            // (id, version, description, authors, totalDownloads, iconUrl, verified, versions[])
            // in a single HTTP/2 call.
            // IMPORTANT: Check validSources (original, pre-health-filter), not healthySources.
            // Using post-filter sources would wrongly trigger API path when a private source
            // is temporarily unreachable, causing its results to be silently skipped.
            const isNugetOrg = (url: string) => url.includes('api.nuget.org') || url.includes('nuget.org/v3');
            let isSingleNugetOrgSource = false;
            if (validSources.length === 1 && isNugetOrg(validSources[0])) {
                isSingleNugetOrgSource = true;
            } else if (validSources.length === 0) {
                // No explicit sources passed = caller wants all configured sources.
                // Only use API path if nuget.org is the sole configured remote source.
                const configuredSources = await this.getSources();
                const remoteSources = configuredSources.filter(s => s.enabled && !this.isLocalSource(s.url));
                isSingleNugetOrgSource = remoteSources.length === 1 && isNugetOrg(remoteSources[0].url);
            }

            if (isSingleNugetOrgSource) {
                const config = vscode.workspace.getConfiguration('nuiget');
                const searchResultLimit = take ?? config.get<number>('searchResultLimit', 20);

                const apiResults = await this.searchPackagesViaApi(
                    query, includePrerelease ?? false, liteMode ?? false, searchResultLimit, exactMatch ?? false
                );

                if (apiResults !== null) {
                    // Cache and return API results
                    if (apiResults.length > 0) {
                        this.searchResultsCache.set(searchCacheKey, apiResults);
                        workspaceCache.set(searchCacheKey, apiResults, CACHE_TTL.SEARCH_RESULTS);
                    }
                    return apiResults;
                }
                // API failed — fall through to CLI path below
                this.outputChannel.debug('[API Search] Falling back to CLI path');
            }

            if (healthySources.length > 0) {
                sourceArg = healthySources.map(s => `--source "${s}"`).join(' ');
            }

            const prereleaseArg = includePrerelease ? '--prerelease' : '';

            const config = vscode.workspace.getConfiguration('nuiget');
            const searchResultLimit = take ?? config.get<number>('searchResultLimit', 20);
            const exactMatchArg = exactMatch ? '--exact-match' : '';

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const command = `dotnet package search "${query}" ${sourceArg} ${prereleaseArg} ${exactMatchArg} --take ${searchResultLimit}`;
            const { stdout, stderr } = await execWithTimeout(command, { cwd: workspaceFolder });
            this.logOutput(command, stdout, stderr, true);

            const packages: PackageSearchResult[] = [];
            const lines = stdout.split('\n');
            const seenIds = new Set<string>();

            for (const line of lines) {
                // Parse table rows: | Package ID | Latest Version | Owners | Total Downloads |
                // Skip separator lines (contain only dashes)
                if (line.includes('---')) {
                    continue;
                }

                const parts = line.split('|').map(p => p.trim()).filter(p => p);
                if (parts.length >= 2) {
                    const packageId = parts[0];
                    const version = parts[1];

                    // Skip header row and invalid entries
                    if (packageId === 'Package ID' || !packageId || !version) {
                        continue;
                    }

                    // Skip duplicates (same package from multiple sources)
                    if (seenIds.has(packageId)) {
                        continue;
                    }
                    seenIds.add(packageId);

                    const owners = parts[2] || '';
                    const downloads = parts[3] ? parseInt(parts[3].replace(/[^\d]/g, ''), 10) : undefined;

                    packages.push({
                        id: packageId,
                        version: version,
                        description: '',
                        authors: liteMode ? '' : owners,
                        totalDownloads: downloads,
                        versions: [version]
                    });
                }
            }

            // Lite Mode: skip metadata enrichment, return raw CLI results
            if (!liteMode) {
                // Fetch metadata for all packages using unified search API call
                // Pre-fetch enabled sources for icon fallback
                const allSources = await this.getSources();
                const enabledSources = allSources.filter(s => s.enabled);

                await batchedPromiseAll(packages, async (pkg) => {
                    // Single search API call: gets verified, authors, description, AND iconUrl
                    const { verified, authors, iconUrl } = await this.getPackageSearchMetadata(pkg.id, pkg.version);
                    let foundMetadata = false;
                    if (iconUrl) {
                        pkg.iconUrl = iconUrl;
                    }
                    if (verified !== undefined) {
                        pkg.verified = verified;
                        foundMetadata = true;
                    }
                    // Authors from search API override CLI-parsed authors (more accurate)
                    if (authors) {
                        pkg.authors = authors;
                        foundMetadata = true;
                    }

                    // Fill in description from cache (captured by getPackageSearchMetadata)
                    if (!pkg.description) {
                        const statusCacheKey = cacheKeys.verifiedStatus(pkg.id);
                        const cached = this.verifiedStatusCache.get(statusCacheKey);
                        if (cached?.description) {
                            pkg.description = cached.description;
                            foundMetadata = true;
                        }
                    }

                    // If search API didn't return an icon, fall back to resolveIconUrl (custom sources)
                    if (!pkg.iconUrl) {
                        const fallbackIcon = await this.resolveIconUrl(pkg.id, pkg.version, enabledSources);
                        if (fallbackIcon) {
                            pkg.iconUrl = fallbackIcon;
                        }
                    }

                    // Not found on nuget.org — try custom sources for authors/description (skip known-unreachable)
                    if (!foundMetadata) {
                        for (const source of enabledSources) {
                            if (source.url.includes('nuget.org')) { continue; }

                            const failedAt = this.failedEndpointCache.get(source.url);
                            if (failedAt && (Date.now() - failedAt) < NuGetService.FAILED_ENDPOINT_CACHE_TTL) {
                                continue;
                            }

                            try {
                                const endpoints = await this.discoverServiceEndpoints(source.url);
                                if (endpoints.searchQueryService) {
                                    const customAuthHeader = await this.getAuthHeader(source.url);
                                    const customSearchUrl = `${endpoints.searchQueryService}?q=packageid:${encodeURIComponent(pkg.id)}&take=1&prerelease=true`;
                                    const customData = await this.fetchJson<NuGetSearchResponse>(customSearchUrl, customAuthHeader);
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
                                            // Cache (custom sources don't have verified, default to false)
                                            const cacheValue = {
                                                verified: false,
                                                authors: pkg.authors,
                                                description: pkg.description
                                            };
                                            const statusCacheKey = cacheKeys.verifiedStatus(pkg.id);
                                            this.verifiedStatusCache.set(statusCacheKey, cacheValue);
                                            workspaceCache.set(statusCacheKey, cacheValue, CACHE_TTL.VERIFIED_STATUS);
                                            break; // Found
                                        }
                                    }
                                }
                            } catch {
                                // Silently fail for individual sources
                            }
                        }
                    }
                }, 16);
            }

            // Only cache non-empty results (avoid caching failures)
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

    /**
     * Resolve the icon URL for a package, trying nuget.org first for speed,
     * then falling back to custom sources via discovered endpoints.
     * Results are cached per packageId@version — the cache stores the found URL
     * or empty string if no icon was found from any source.
     *
     * @param packageId - The package ID
     * @param version - The package version
     * @param enabledSources - Pre-fetched enabled sources (avoids repeated getSources calls).
     *                         If omitted, only nuget.org is tried (no custom source fallback).
     * @returns The icon URL if found, or undefined
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
                // Skip nuget.org (already tried) and local sources
                if (source.url.includes('nuget.org') || this.isLocalSource(source.url)) {
                    continue;
                }

                // Circuit breaker: skip sources that consistently have no icons
                const missCount = this.iconSourceMissCount.get(source.url) || 0;
                if (missCount >= NuGetService.ICON_SOURCE_MISS_THRESHOLD) {
                    continue;
                }

                try {
                    const endpoints = await this.discoverServiceEndpoints(source.url);
                    if (endpoints.packageBaseAddress) {
                        const customIconUrl = `${endpoints.packageBaseAddress.replace(/\/$/, '')}/${lowerId}/${lowerVersion}/icon`;
                        const authHeader = await this.getAuthHeader(source.url);
                        const customExists = await this.checkUrlExists(customIconUrl, authHeader);
                        if (customExists) {
                            // Reset miss count on success (source does have icons)
                            this.iconSourceMissCount.delete(source.url);
                            this.iconUrlCache.set(cacheKey, customIconUrl);
                            workspaceCache.set(cacheKey, customIconUrl, CACHE_TTL.ICON_EXISTS);
                            return customIconUrl;
                        } else {
                            // Increment miss count
                            this.iconSourceMissCount.set(source.url, missCount + 1);
                        }
                    }
                } catch {
                    // Silently skip failed sources
                }
            }
        }

        // 3. No icon found — cache as empty string with 24h TTL (icon may be added later)
        this.iconUrlCache.set(cacheKey, '');
        workspaceCache.set(cacheKey, '', 24 * 60 * 60 * 1000);
        return undefined;
    }

    /**
     * Check if a URL exists (returns 200) - raw HTTP check, no caching
     * Uses HTTP/2 for nuget.org sources for better performance
     */
    private async checkUrlExists(url: string, authHeader?: string): Promise<boolean> {
        // Use HTTP/2 client for nuget.org sources (multiplexing) - no auth needed
        if (url.includes('.nuget.org')) {
            const statusCode = await http2Client.headRequest(url);
            // Handle redirects by following them
            if (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) {
                // For redirects, fall back to HTTP/1.1 which handles redirects
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
            const parsedUrl = new URL(url);
            const client = url.startsWith('https://') ? https : http;
            const headers: Record<string, string> = {};
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }
            const req = client.request(url, { method: 'HEAD', headers }, (res) => {
                // Handle redirects - follow them (with SSRF protection)
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl && isSafeRedirectTarget(redirectUrl, url)) {
                        // Only forward auth if redirect stays on the same origin (security)
                        let sameOrigin = false;
                        try {
                            const redirectParsed = new URL(redirectUrl);
                            sameOrigin = redirectParsed.origin === parsedUrl.origin;
                        } catch { /* not same origin */ }
                        this.checkUrlExistsHttp1(redirectUrl, sameOrigin ? authHeader : undefined, maxRedirects - 1).then(resolve);
                        return;
                    }
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

    async installPackage(projectPath: string, packageId: string, version?: string, options?: { skipChannelSetup?: boolean; skipRestore?: boolean; sourceUrl?: string }): Promise<boolean> {
        // Validate inputs to prevent command injection
        if (!isValidPackageId(packageId)) {
            vscode.window.showErrorMessage(`Invalid package ID: ${packageId}`);
            return false;
        }
        if (version && !isValidVersion(version)) {
            vscode.window.showErrorMessage(`Invalid version: ${version}`);
            return false;
        }

        // Setup and show output channel
        this.setupOutputChannel(options?.skipChannelSetup);

        try {
            const versionArg = version ? `--version ${version}` : '';
            // For bulk operations, always use --no-restore to defer restore to end of batch
            const noRestoreArg = options?.skipRestore ? '--no-restore' : this.getNoRestoreFlag();
            const sourceArg = options?.sourceUrl && isValidSourceUrl(options.sourceUrl) ? `--source "${options.sourceUrl}"` : '';
            const projectDir = path.dirname(projectPath);
            const nounFirst = await this.useNounFirstSyntax(projectPath);
            const command = nounFirst
                ? `dotnet package add ${packageId} --project "${projectPath}" ${versionArg} ${sourceArg} ${noRestoreArg}`.trim()
                : `dotnet add "${projectPath}" package ${packageId} ${versionArg} ${sourceArg} ${noRestoreArg}`.trim();
            const { stdout, stderr } = await execWithTimeout(command, { cwd: projectDir });

            // Check for actual errors (case-insensitive) - dotnet uses "error" or "Error"
            const hasError = stderr && /\berror\b/i.test(stderr);
            if (hasError) {
                this.logOutput(command, stdout, stderr, false);
                this.logError(`Failed to install ${packageId}`);
                vscode.window.showErrorMessage(`Failed to install ${packageId}: ${stderr}`);
                return false;
            }

            this.logOutput(command, stdout, stderr, true);
            this.logSuccess(`Successfully installed ${packageId}`);
            vscode.window.showInformationMessage(`Successfully installed ${packageId}`);
            // Invalidate assets cache so next getInstalledPackages reads fresh resolved versions
            this.assetsJsonCache.clear();
            return true;
        } catch (error) {
            const nounFirst = this._sdkVersionCache.get(path.dirname(projectPath)) ?? 9;
            const command = nounFirst >= 10
                ? `dotnet package add ${packageId} --project "${projectPath}" ${version ? `--version ${version}` : ''}`.trim()
                : `dotnet add "${projectPath}" package ${packageId} ${version ? `--version ${version}` : ''}`.trim();
            // Extract stderr from ExecError if available for better diagnostics
            const execErr = error as ExecError;
            const errorOutput = execErr.stderr || execErr.stdout || String(error);
            this.logOutput(command, execErr.stdout || '', errorOutput, false);
            this.logError(`Failed to install ${packageId}`);
            vscode.window.showErrorMessage(`Failed to install ${packageId}: ${errorOutput}`);
            return false;
        }
    }

    async updatePackage(projectPath: string, packageId: string, version: string, options?: { skipChannelSetup?: boolean; skipNotification?: boolean; skipRestore?: boolean; sourceUrl?: string }): Promise<boolean> {
        // Validate inputs to prevent command injection
        if (!isValidPackageId(packageId)) {
            vscode.window.showErrorMessage(`Invalid package ID: ${packageId}`);
            return false;
        }
        if (!isValidVersion(version)) {
            vscode.window.showErrorMessage(`Invalid version: ${version}`);
            return false;
        }

        // Setup and show output channel (skip for bulk operations)
        this.setupOutputChannel(options?.skipChannelSetup);

        try {
            // For bulk operations, always use --no-restore to defer restore to end of batch
            const noRestoreArg = options?.skipRestore ? '--no-restore' : this.getNoRestoreFlag();
            const sourceArg = options?.sourceUrl && isValidSourceUrl(options.sourceUrl) ? `--source "${options.sourceUrl}"` : '';
            const projectDir = path.dirname(projectPath);
            const nounFirst = await this.useNounFirstSyntax(projectPath);
            const command = nounFirst
                ? `dotnet package add ${packageId} --project "${projectPath}" --version ${version} ${sourceArg} ${noRestoreArg}`.trim()
                : `dotnet add "${projectPath}" package ${packageId} --version ${version} ${sourceArg} ${noRestoreArg}`.trim();
            const { stdout, stderr } = await execWithTimeout(command, { cwd: projectDir });

            // Check for actual errors (case-insensitive) - dotnet uses "error" or "Error"
            const hasError = stderr && /\berror\b/i.test(stderr);
            if (hasError) {
                this.logOutput(command, stdout, stderr, false);
                this.logError(`Failed to update ${packageId}`);
                if (!options?.skipNotification) {
                    vscode.window.showErrorMessage(`Failed to update ${packageId}: ${stderr}`);
                }
                return false;
            }

            this.logOutput(command, stdout, stderr, true);
            this.logSuccess(`Successfully updated ${packageId}`);
            if (!options?.skipNotification) {
                vscode.window.showInformationMessage(`Successfully updated ${packageId}`);
            }
            // Invalidate assets cache so next getInstalledPackages reads fresh resolved versions
            this.assetsJsonCache.clear();
            return true;
        } catch (error) {
            const nounFirst = this._sdkVersionCache.get(path.dirname(projectPath)) ?? 9;
            const command = nounFirst >= 10
                ? `dotnet package add ${packageId} --project "${projectPath}" --version ${version}`
                : `dotnet add "${projectPath}" package ${packageId} --version ${version}`;
            // Extract stderr from ExecError if available for better diagnostics
            const execErr = error as ExecError;
            const errorOutput = execErr.stderr || execErr.stdout || String(error);
            this.logOutput(command, execErr.stdout || '', errorOutput, false);
            this.logError(`Failed to update ${packageId}`);
            if (!options?.skipNotification) {
                vscode.window.showErrorMessage(`Failed to update ${packageId}: ${errorOutput}`);
            }
            return false;
        }
    }

    async removePackage(projectPath: string, packageId: string, options?: { skipChannelSetup?: boolean; skipRestore?: boolean; skipNotification?: boolean }): Promise<boolean> {
        // Validate inputs to prevent command injection
        if (!isValidPackageId(packageId)) {
            vscode.window.showErrorMessage(`Invalid package ID: ${packageId}`);
            return false;
        }

        // Setup and show output channel
        this.setupOutputChannel(options?.skipChannelSetup);

        try {
            const projectDir = path.dirname(projectPath);
            const nounFirst = await this.useNounFirstSyntax(projectPath);
            const command = nounFirst
                ? `dotnet package remove ${packageId} --project "${projectPath}"`
                : `dotnet remove "${projectPath}" package ${packageId}`;
            const { stdout, stderr } = await execWithTimeout(command, { cwd: projectDir });

            // Check for actual errors (case-insensitive) - dotnet uses "error" or "Error"
            const hasError = stderr && /\berror\b/i.test(stderr);
            if (hasError) {
                this.logOutput(command, stdout, stderr, false);
                this.logError(`Failed to remove ${packageId}`);
                vscode.window.showErrorMessage(`Failed to remove ${packageId}: ${stderr}`);
                return false;
            }

            this.logOutput(command, stdout, stderr, true);
            this.logSuccess(`Successfully removed ${packageId}`);

            // Invalidate assets cache so next getInstalledPackages reads fresh resolved versions
            this.assetsJsonCache.clear();

            // Run silent restore to update project.assets.json (dotnet remove doesn't trigger restore)
            // Skip for bulk operations (caller will run restore once at the end) or if noRestore setting is enabled
            const noRestoreSetting = this.getNoRestoreFlag() !== '';
            if (!options?.skipRestore && !noRestoreSetting) {
                try {
                    const restoreCommand = `dotnet restore "${projectPath}"`;
                    const { stdout: restoreOut, stderr: restoreErr } = await execWithTimeout(restoreCommand, { cwd: projectDir, timeout: 60000 });
                    this.logOutput(restoreCommand, restoreOut, restoreErr, true);
                } catch (restoreError) {
                    // Restore failure is not critical - transitive data may be stale but package was removed
                    const restoreErr = restoreError as ExecError;
                    this.logOutput(`dotnet restore "${projectPath}"`, restoreErr.stdout || '', restoreErr.stderr || '', false);
                }
            }

            if (!options?.skipNotification) {
                vscode.window.showInformationMessage(`Successfully removed ${packageId}`);
            }
            return true;
        } catch (error) {
            const nounFirst = this._sdkVersionCache.get(path.dirname(projectPath)) ?? 9;
            const command = nounFirst >= 10
                ? `dotnet package remove ${packageId} --project "${projectPath}"`
                : `dotnet remove "${projectPath}" package ${packageId}`;
            // Extract stderr from ExecError if available for better diagnostics
            const execErr = error as ExecError;
            const errorOutput = execErr.stderr || execErr.stdout || String(error);
            this.logOutput(command, execErr.stdout || '', errorOutput, false);
            this.logError(`Failed to remove ${packageId}`);
            vscode.window.showErrorMessage(`Failed to remove ${packageId}: ${errorOutput}`);
            return false;
        }
    }

    async getSources(): Promise<NuGetSource[]> {
        const now = Date.now();
        if (this._sourcesCache && (now - this._sourcesCacheTime) < NuGetService.SOURCES_CACHE_TTL) {
            return this._sourcesCache;
        }
        const sources = await this.configParser.getSources();
        this._sourcesCache = sources;
        this._sourcesCacheTime = now;
        return sources;
    }

    /** Invalidate the short-lived sources cache (call after enable/disable/add/remove). */
    public invalidateSourcesCache(): void {
        this._sourcesCache = null;
        this._sourcesCacheTime = 0;
    }

    /**
     * Enable a NuGet source by name
     * @param sourceName The name of the source to enable
     * @returns true if successful, false otherwise
     */
    async enableSource(sourceName: string): Promise<boolean> {
        // Validate source name to prevent command injection
        if (!isValidSourceName(sourceName)) {
            vscode.window.showErrorMessage(`Invalid source name: "${sourceName}". Names must contain only letters, numbers, dots, underscores, hyphens, and spaces.`);
            return false;
        }
        this.setupOutputChannel(true); // Don't auto-reveal for source operations
        const command = `dotnet nuget enable source "${sourceName}"`;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        try {
            const { stdout, stderr } = await execWithTimeout(command, { cwd: workspaceFolder });
            this.logOutput(command, stdout, stderr, true);
            this.logSuccess(`Enabled source: ${sourceName}`);
            this.invalidateSourcesCache();
            this.startSourceHealthMonitor();
            return true;
        } catch (error) {
            const execErr = error as ExecError;
            const errorOutput = execErr.stderr || execErr.stdout || String(error);
            this.logOutput(command, execErr.stdout || '', execErr.stderr || '', false);
            this.logError(`Failed to enable source "${sourceName}": ${errorOutput}`);
            vscode.window.showErrorMessage(`Failed to enable source "${sourceName}": ${errorOutput}`);
            return false;
        }
    }

    /**
     * Disable a NuGet source by name
     * @param sourceName The name of the source to disable
     * @returns true if successful, false otherwise
     */
    async disableSource(sourceName: string): Promise<boolean> {
        // Validate source name to prevent command injection
        if (!isValidSourceName(sourceName)) {
            vscode.window.showErrorMessage(`Invalid source name: "${sourceName}". Names must contain only letters, numbers, dots, underscores, hyphens, and spaces.`);
            return false;
        }
        this.setupOutputChannel(true); // Don't auto-reveal for source operations
        const command = `dotnet nuget disable source "${sourceName}"`;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        try {
            const { stdout, stderr } = await execWithTimeout(command, { cwd: workspaceFolder });
            this.logOutput(command, stdout, stderr, true);
            this.logSuccess(`Disabled source: ${sourceName}`);
            this.invalidateSourcesCache();
            this.startSourceHealthMonitor();
            return true;
        } catch (error) {
            const execErr = error as ExecError;
            const errorOutput = execErr.stderr || execErr.stdout || String(error);
            this.logOutput(command, execErr.stdout || '', execErr.stderr || '', false);
            this.logError(`Failed to disable source "${sourceName}": ${errorOutput}`);
            vscode.window.showErrorMessage(`Failed to disable source "${sourceName}": ${errorOutput}`);
            return false;
        }
    }

    /**
     * Add a new NuGet source
     * @param url The URL or path of the source
     * @param name Optional name for the source (auto-generated if omitted)
     * @param username Optional username for authenticated sources
     * @param password Optional password for authenticated sources
     * @param configFile Optional config file to add source to
     * @param allowInsecure Whether to allow HTTP (not HTTPS) connections
     * @param storeEncrypted Whether to store password encrypted (Windows only, default true)
     * @returns Object with success flag and optional error message
     */
    async addSource(
        url: string,
        name?: string,
        username?: string,
        password?: string,
        configFile?: string,
        allowInsecure?: boolean,
        storeEncrypted?: boolean
    ): Promise<{ success: boolean; error?: string }> {
        // Validate URL to prevent command injection
        if (!isValidSourceUrl(url)) {
            return { success: false, error: 'Invalid source URL. Please enter a valid HTTP, HTTPS, or file path.' };
        }

        // Validate source name if provided
        if (name && !isValidSourceName(name)) {
            return { success: false, error: 'Invalid source name. Names must contain only letters, numbers, dots, underscores, hyphens, and spaces.' };
        }

        this.setupOutputChannel(true); // Don't auto-reveal for source operations

        // If configFile is specified but doesn't exist, create a minimal nuget.config
        if (configFile) {
            try {
                await fs.promises.access(configFile, fs.constants.F_OK);
            } catch {
                // File doesn't exist, create minimal nuget.config
                const minimalConfig = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
  </packageSources>
</configuration>
`;
                try {
                    await writeFileAsync(configFile, minimalConfig, 'utf8');
                    this.outputChannel.info(`Created new nuget.config at: ${configFile}`);
                } catch (createError) {
                    return { success: false, error: `Failed to create nuget.config: ${createError}` };
                }
            }
        }

        // Generate a friendly name from URL if not provided
        let sourceName = name;
        if (!sourceName) {
            const sources = await this.getSources();
            const existingNames = new Set(sources.map(s => s.name));
            sourceName = this.generateSourceNameFromUrl(url, existingNames);
        }

        let command = `dotnet nuget add source "${url}" --name "${sourceName}"`;

        if (username) {
            command += ` --username "${username}"`;
        }
        if (password) {
            command += ` --password "${password}"`;
            // Use encrypted storage by default on Windows
            // On non-Windows platforms, encryption is not supported
            const isWindows = process.platform === 'win32';
            if (!isWindows || storeEncrypted === false) {
                command += ` --store-password-in-clear-text`;
            }
        }
        if (configFile) {
            command += ` --configfile "${configFile}"`;
        }
        if (allowInsecure) {
            command += ` --allow-insecure-connections`;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        try {
            const { stdout, stderr } = await execWithTimeout(command, { cwd: workspaceFolder });
            this.logOutput(command, stdout, stderr, true);
            this.logSuccess(`Added source: ${name || url}`);
            this.invalidateSourcesCache();
            this.startSourceHealthMonitor();
            return { success: true };
        } catch (error) {
            const execErr = error as ExecError;
            const errorOutput = execErr.stderr || execErr.stdout || String(error);
            this.logOutput(command, execErr.stdout || '', execErr.stderr || '', false);
            this.logError(`Failed to add source: ${errorOutput}`);

            // Check for specific error: source already exists
            if (errorOutput.includes('already been added') || errorOutput.includes('already exists')) {
                return { success: false, error: 'A source with this name already exists.' };
            }

            return { success: false, error: errorOutput };
        }
    }

    /**
     * Remove a NuGet source by name
     * @param sourceName The name of the source to remove
     * @param configFile Optional config file to remove source from
     * @returns Object with success flag and optional error message
     */
    async removeSource(sourceName: string, configFile?: string): Promise<{ success: boolean; error?: string }> {
        // Validate source name to prevent command injection
        if (!isValidSourceName(sourceName)) {
            return { success: false, error: 'Invalid source name. Names must contain only letters, numbers, dots, underscores, hyphens, and spaces.' };
        }

        this.setupOutputChannel(true); // Don't auto-reveal for source operations
        let command = `dotnet nuget remove source "${sourceName}"`;

        if (configFile) {
            command += ` --configfile "${configFile}"`;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        try {
            const { stdout, stderr } = await execWithTimeout(command, { cwd: workspaceFolder });
            this.logOutput(command, stdout, stderr, true);
            this.logSuccess(`Removed source: ${sourceName}`);
            this.invalidateSourcesCache();
            this.startSourceHealthMonitor();
            return { success: true };
        } catch (error) {
            const execErr = error as ExecError;
            const errorOutput = execErr.stderr || execErr.stdout || String(error);
            this.logOutput(command, execErr.stdout || '', execErr.stderr || '', false);
            this.logError(`Failed to remove source "${sourceName}": ${errorOutput}`);

            // Check for specific error: source doesn't exist
            if (errorOutput.includes('Unable to find') || errorOutput.includes('does not exist')) {
                return { success: false, error: 'Source not found. It may have already been removed.' };
            }

            return { success: false, error: errorOutput };
        }
    }

    /**
     * Get available NuGet config file paths
     * Returns paths for user-level and any workspace-level config files
     */
    getConfigFilePaths(): { label: string; path: string }[] {
        return this.configParser.getConfigFilePaths();
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
     * Clear tracked source errors (call on manual refresh to allow re-warning)
     */
    clearSourceErrors(): void {
        this.failedSources.clear();
        // Also clear the service index cache to force re-discovery
        this.serviceIndexCache.clear();
        // Clear failed endpoint cache so that refreshing actually retries the network
        this.failedEndpointCache.clear();
        // Clear icon source circuit breaker so custom sources are re-tried
        this.iconSourceMissCount.clear();
        // Clear vulnerability cache so fresh data is fetched
        this.vulnerabilityData.clear();
        this.vulnerabilityDataTimestamp = 0;
        // Clear sources cache so fresh sources are fetched
        this.invalidateSourcesCache();
        // Clear version caches so update checks see newly published versions
        this.clearVersionsCache();
        // Re-validate all sources immediately in background
        this.startSourceHealthMonitor();
    }

    /**
     * Clear all cached package version data (in-memory LRU + workspace persistent cache).
     * Called on manual refresh to ensure update checks see newly published versions.
     */
    clearVersionsCache(): void {
        this.versionsCache.clear();
        workspaceCache.clearByPrefix('versions:');
    }

    /**
     * Clear the dotnet NuGet HTTP cache so that fresh version listings
     * are fetched from the server on next restore/update check.
     * Runs `dotnet nuget locals http-cache --clear` silently.
     */
    async clearNuGetHttpCache(): Promise<void> {
        try {
            await execWithTimeout('dotnet nuget locals http-cache --clear', { timeout: 15000 });
            this.outputChannel.info('[NuGet] Cleared dotnet NuGet HTTP cache');
        } catch (err) {
            // Non-critical — log and continue
            this.outputChannel.warn('[NuGet] Failed to clear dotnet NuGet HTTP cache:', String(err));
        }
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

    /**
     * Pre-validate source URLs that have no cached status (neither in serviceIndexCache
     * nor failedEndpointCache). This populates the failure cache before CLI search so that
     * filterHealthySources can remove unreachable sources on the first search.
     */
    async getPackageVersions(packageId: string, source?: string, includePrerelease?: boolean, take: number = 20): Promise<string[]> {
        try {
            // If no specific source, try all enabled sources in parallel
            if (!source || source === 'all') {
                const allSources = await this.getSources();
                const enabledSources = allSources.filter(s => s.enabled);

                if (take <= 1) {
                    // For update checks (take=1), race for speed — first non-empty result wins
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
                // A single source may only host a few versions; merging gives the full picture.
                const allResults = await Promise.all(
                    enabledSources.map(src =>
                        this.getPackageVersionsFromSource(packageId, src.url, includePrerelease, take)
                            .catch(() => [] as string[])
                    )
                );

                // Merge, deduplicate, sort descending by semver-ish comparison, and take
                const merged = new Set<string>();
                for (const versions of allResults) {
                    for (const v of versions) {
                        merged.add(v);
                    }
                }
                const sorted = [...merged].sort((a, b) => {
                    // Reverse sort: higher versions first
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
     * Used by update checks to track which source a package update came from,
     * so that install/update commands can pass --source for faster execution.
     */
    async getPackageVersionsWithSource(packageId: string, includePrerelease?: boolean): Promise<{ versions: string[]; sourceUrl?: string }> {
        try {
            const allSources = await this.getSources();
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
     * Remaining promises continue in background but we don't wait for them.
     * Falls back to default value if no result matches.
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

                    // Check if this result matches our criteria
                    if (predicate(result)) {
                        resolved = true;
                        resolve(result);
                        return;
                    }

                    // Store result in case we need to fall back
                    results[index] = result;
                    completed++;

                    // If all completed and none matched, resolve with first or default
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
            // Skip local sources - they don't have API endpoints
            if (this.isLocalSource(source)) {
                return [];
            }

            // Check cache first
            const memoryCacheKey = cacheKeys.versions(packageId, source, includePrerelease ?? false, take);

            // Check in-memory cache (fastest)
            const memoryCached = this.versionsCache.get(memoryCacheKey);
            if (memoryCached) {
                return memoryCached;
            }

            // Check workspace cache (persists across panel closes)
            const workspaceCached = workspaceCache.get<string[]>(memoryCacheKey);
            if (workspaceCached) {
                this.versionsCache.set(memoryCacheKey, workspaceCached);
                return workspaceCached;
            }

            // Discover the package base address from the source's service index
            const endpoints = await this.discoverServiceEndpoints(source);
            if (!endpoints.packageBaseAddress && !endpoints.searchQueryService) {
                return [];
            }

            const baseUrl = endpoints.packageBaseAddress?.replace(/\/$/, '');
            if (!baseUrl) {
                return [];
            }
            const searchUrl = endpoints.searchQueryService;

            // Get auth header for this source
            const authHeader = await this.getAuthHeader(source);

            // Try flat container first
            const url = `${baseUrl}/${packageId.toLowerCase()}/index.json`;
            const versions = await this.fetchJson<{ versions: string[] }>(url, authHeader);

            // If flat container fails, try search API (better for Nexus/ProGet)
            if ((!versions || !versions.versions) && searchUrl) {
                const searchResult = await this.fetchJson<{
                    data: Array<{
                        id: string;
                        version: string;
                        versions: Array<{ version: string; '@id': string }>;
                    }>;
                }>(`${searchUrl}?q=packageid:${encodeURIComponent(packageId)}&take=1&prerelease=${includePrerelease ?? false}`, authHeader);

                if (searchResult?.data?.[0]?.versions) {
                    const pkgVersions = searchResult.data[0].versions.map(v => v.version);

                    let allVersions = pkgVersions;
                    // Filter out prerelease versions if not requested
                    if (!includePrerelease) {
                        allVersions = allVersions.filter(v => !v.includes('-'));
                    }
                    // Return latest versions first, limited to 'take' count
                    const result = [...allVersions].reverse().slice(0, take);

                    // Only cache non-empty results (avoid caching failures)
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

            // Filter out prerelease versions if not requested
            if (!includePrerelease) {
                allVersions = allVersions.filter(v => !v.includes('-'));
            }

            // Return latest versions first, limited to 'take' count
            const result = [...allVersions].reverse().slice(0, take);

            // Only cache non-empty results (avoid caching failures)
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

    /**
     * Resolve the NuGet global-packages folder path via dotnet CLI.
     * Cached after first successful resolution.
     */
    private async resolveGlobalPackagesFolder(): Promise<string | null> {
        if (this._globalPackagesFolder) { return this._globalPackagesFolder; }
        try {
            const { stdout } = await execWithTimeout('dotnet nuget locals global-packages --list', { timeout: 10000 });
            // Output format: "global-packages: C:\Users\xxx\.nuget\packages\"
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
     * Reads the .nuspec file from ~/.nuget/packages/{id}/{version}/{id}.nuspec
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

            // Parse basic metadata from nuspec XML
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

            // Parse dependencies
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

            // Handle ungrouped dependencies (no <group> wrapper)
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

    async getPackageMetadata(packageId: string, version: string, source?: string): Promise<PackageMetadata | null> {
        try {
            // Check memory cache first
            const cacheKey = `${packageId.toLowerCase()}@${version.toLowerCase()}`;
            const cached = this.metadataCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            let metadata: PackageMetadata | null = null;

            // If no specific source, try all enabled sources in parallel
            if (!source || source === 'all') {
                const allSources = await this.getSources();
                const enabledSources = allSources.filter(s => s.enabled);

                // Fetch from all sources in parallel
                const metadataPromises = enabledSources.map(src =>
                    this.getPackageMetadataFromSource(packageId, version, src.url)
                        .catch(() => null)
                );

                const results = await Promise.all(metadataPromises);

                // Return the first non-null result
                for (const result of results) {
                    if (result) {
                        metadata = result;
                        break;
                    }
                }
            } else {
                metadata = await this.getPackageMetadataFromSource(packageId, version, source);
            }

            // Cache the result if we found metadata
            if (metadata) {
                this.metadataCache.set(cacheKey, metadata);
                return metadata;
            }

            // Offline fallback: try local global-packages cache
            const offlineMetadata = await this.getOfflineMetadata(packageId, version);
            if (offlineMetadata) {
                // Don't cache offline metadata — prefer fresh data when sources recover
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
            // Skip local sources - they don't have API endpoints
            if (this.isLocalSource(source)) {
                return null;
            }

            // Discover the endpoints from the source's service index
            const endpoints = await this.discoverServiceEndpoints(source);
            if (!endpoints.registrationsBaseUrl && !endpoints.searchQueryService) {
                return null;
            }

            // Get auth header for this source (used for all API calls)
            const authHeader = await this.getAuthHeader(source);

            const registrationBaseUrl = endpoints.registrationsBaseUrl?.replace(/\/$/, '');
            const flatContainerBaseUrl = endpoints.packageBaseAddress?.replace(/\/$/, '');
            const searchUrl = endpoints.searchQueryService;

            let registrationData: NuGetRegistrationEntry | null = null;

            // Step 1: Try direct version-specific registration endpoint (only if we have registration URL)
            if (registrationBaseUrl) {
                const registrationUrl = `${registrationBaseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}.json`;
                registrationData = await this.fetchJson<NuGetRegistrationEntry>(registrationUrl, authHeader);

                // Step 1b: If direct fetch fails, try the package index and find the version
                if (!registrationData) {
                    const packageIndexUrl = `${registrationBaseUrl}/${packageId.toLowerCase()}/index.json`;
                    const packageIndex = await this.fetchJson<NuGetRegistrationEntry>(packageIndexUrl, authHeader);

                    if (packageIndex?.items) {
                        // Nexus/ProGet style: items contains pages, each page has items with catalogEntry
                        for (const page of packageIndex.items) {
                            // Page might have inline items or need separate fetch
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

                            // If no inline items, may need to fetch the page
                            if (!pageItems.length && page['@id']) {
                                const pageData = await this.fetchJson<NuGetRegistrationPage>(page['@id'], authHeader);
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
                // Try nuspec from flat container (only if we have the URL)
                if (flatContainerBaseUrl) {
                    const nuspecMetadata = await this.getPackageMetadataFromNuspec(packageId, version, flatContainerBaseUrl, authHeader);
                    if (nuspecMetadata) {
                        return nuspecMetadata;
                    }
                }

                // Try search API as last resort
                if (searchUrl) {
                    return await this.getPackageMetadataFromSearch(packageId, version, searchUrl, authHeader);
                }

                return null;
            }

            // Step 2: Try to get catalog entry if available (nuget.org specific)
            let catalogEntry: NuGetRegistrationEntry = registrationData;
            const catalogEntryUrl = registrationData.catalogEntry;
            if (catalogEntryUrl && typeof catalogEntryUrl === 'string') {
                const fetchedEntry = await this.fetchJson<NuGetRegistrationEntry>(catalogEntryUrl, authHeader);
                if (fetchedEntry) {
                    catalogEntry = fetchedEntry;
                }
            }

            // If registration data has no description/authors, try search API which usually has it
            if (!catalogEntry.description && !registrationData.description && searchUrl) {
                const searchMetadata = await this.getPackageMetadataFromSearch(packageId, version, searchUrl, authHeader);
                if (searchMetadata) {
                    // Merge: use search metadata but keep any dependencies from registration
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

            // Parse dependencies from catalog entry or registration data
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

            // Try to fetch readme from flatcontainer (only if we have the URL)
            let readme: string | undefined;
            if (flatContainerBaseUrl) {
                const readmeUrl = `${flatContainerBaseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}/readme`;
                try {
                    readme = await this.fetchText(readmeUrl, authHeader);
                } catch {
                    // Readme not available for this package
                }
            }

            const metadataVersion = catalogEntry.version || registrationData.version || version;
            // Look up vulnerability data if available
            // Fetch vulnerability data and package size in parallel (both best-effort)
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
                totalDownloads: undefined, // Not available in catalog API
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
            const searchResult = await this.fetchJson<NuGetSearchResponse>(url, authHeader);

            // Handle different response formats (nuget.org uses 'data', some servers use 'Data' or root array)
            const packages: NuGetSearchEntry[] = searchResult?.data || searchResult?.Data || (Array.isArray(searchResult) ? searchResult : []);

            if (packages.length > 0) {
                const pkg = packages[0];

                // Handle different field names for authors
                let authors = '';
                if (pkg.authors) {
                    authors = Array.isArray(pkg.authors) ? pkg.authors.join(', ') : pkg.authors;
                } else if (pkg.Authors) {
                    authors = Array.isArray(pkg.Authors) ? pkg.Authors.join(', ') : pkg.Authors;
                } else if (pkg.owner || pkg.Owner) {
                    authors = pkg.owner ?? pkg.Owner ?? '';
                }

                // Handle different field names for description
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
            const nuspecContent = await this.fetchText(nuspecUrl, authHeader);

            if (!nuspecContent) {
                return null;
            }

            // Parse basic metadata from nuspec XML
            const getTagContent = (xml: string, tag: string): string => {
                const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
                return match ? match[1].trim() : '';
            };

            const description = getTagContent(nuspecContent, 'description');
            const authors = getTagContent(nuspecContent, 'authors');
            const licenseUrl = getTagContent(nuspecContent, 'licenseUrl');
            const projectUrl = getTagContent(nuspecContent, 'projectUrl');

            // Parse dependencies
            const dependencies: PackageDependencyGroup[] = [];
            const depsMatch = nuspecContent.match(/<dependencies>([\s\S]*?)<\/dependencies>/i);
            if (depsMatch) {
                const depsContent = depsMatch[1];
                // Try to find dependency groups
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
                // If no groups, look for flat dependencies
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

    /**
     * Check for updates for installed packages
     * Returns packages that have newer versions available
     *
     * Floating versions (*, 10.*, 6.7.*) and range versions ([1.0,2.0)) are skipped.
     * These versions cannot be updated from the UI - users must edit .csproj directly.
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

        // Pre-fetch enabled sources once for all update checks
        const allSources = await this.getSources();
        const enabledSources = allSources.filter(s => s.enabled);

        // Check each installed package for updates with concurrency limit
        const results = await batchedPromiseAll(installedPackages, async (pkg) => {
            try {
                // Skip floating versions (*, 10.*, etc.) - cannot be updated from UI
                if (pkg.versionType === 'floating') {
                    return null;
                }

                // Skip range versions ([1.0,2.0), etc.) - cannot be updated from UI
                if (pkg.versionType === 'range') {
                    return null;
                }

                // Get available versions with source tracking
                const { versions, sourceUrl } = await this.getPackageVersionsWithSource(pkg.id, includePrerelease);
                if (versions.length === 0) {
                    return null;
                }

                const latestVersion = versions[0];

                // Standard version comparison
                if (isNewerVersion(latestVersion, pkg.version)) {
                    // Single search API call: gets verified, authors, AND iconUrl
                    const { verified, authors, iconUrl } = await this.getPackageSearchMetadata(pkg.id, latestVersion);

                    // If search API didn't return an icon, fall back to resolveIconUrl
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
     * Returns only package ID, installed version, and latest version.
     */
    async checkPackageUpdatesMinimal(
        installedPackages: InstalledPackage[],
        includePrerelease: boolean
    ): Promise<{ id: string; installedVersion: string; latestVersion: string; sourceUrl?: string }[]> {
        const packagesWithUpdates: { id: string; installedVersion: string; latestVersion: string; sourceUrl?: string }[] = [];

        // Check each installed package for updates with concurrency limit
        const results = await batchedPromiseAll(installedPackages, async (pkg) => {
            try {
                // Skip floating versions (*, 10.*, etc.) - cannot be updated from UI
                if (pkg.versionType === 'floating') {
                    return null;
                }

                // Skip range versions ([1.0,2.0), etc.) - cannot be updated from UI
                if (pkg.versionType === 'range') {
                    return null;
                }

                // Get available versions with source tracking
                const { versions, sourceUrl } = await this.getPackageVersionsWithSource(pkg.id, includePrerelease);
                if (versions.length === 0) {
                    return null;
                }

                const latestVersion = versions[0];

                // Standard version comparison
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
     * Combines what was previously two calls (search + HEAD) into a single search call
     * that returns all three fields. The iconUrl from the search response is used to
     * construct a version-specific flat container URL, eliminating the need for a HEAD request.
     *
     * @param packageId - The package ID
     * @param version - Optional package version for icon URL construction (flat container path)
     */
    private async getPackageSearchMetadata(packageId: string, version?: string): Promise<{ verified?: boolean; authors?: string; iconUrl?: string }> {
        const statusCacheKey = cacheKeys.verifiedStatus(packageId);

        // Check in-memory cache first (fastest)
        const memoryCached = this.verifiedStatusCache.get(statusCacheKey);
        if (memoryCached) {
            // Reconstruct icon URL from icon cache if we have a version
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

        // Check workspace cache (persists across panel closes)
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
            // Use dynamic endpoint from nuget.org service index
            const nugetOrgEndpoints = await this.discoverServiceEndpoints('https://api.nuget.org/v3/index.json');
            if (!nugetOrgEndpoints.searchQueryService) {
                return {}; // Can't get verified status without search endpoint
            }
            const searchUrl = `${nugetOrgEndpoints.searchQueryService}?q=packageid:${encodeURIComponent(packageId)}&take=1`;
            const data = await this.fetchJson<{ data: Array<{ id: string; verified?: boolean; authors?: string[]; iconUrl?: string; description?: string }> }>(searchUrl);

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

                    // If the search API returned an iconUrl AND we have a version,
                    // construct the version-specific flat container URL (skip HEAD request).
                    // The search API confirming iconUrl means the package has an embedded icon.
                    let iconUrl: string | undefined;
                    if (result.iconUrl && version && !version.includes('*') && !version.includes('[') && !version.includes('(')) {
                        const lowerId = packageId.toLowerCase();
                        const lowerVersion = version.toLowerCase();
                        const flatContainerUrl = `https://api.nuget.org/v3-flatcontainer/${lowerId}/${lowerVersion}/icon`;
                        iconUrl = flatContainerUrl;
                        // Pre-populate icon cache so resolveIconUrl() won't issue a HEAD
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
                // Handle redirects - preserve auth header for same-origin redirects (with SSRF protection)
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl && isSafeRedirectTarget(redirectUrl, url)) {
                        try {
                            const redirectParsed = new URL(redirectUrl, url);
                            const sameOrigin = redirectParsed.origin === parsed.origin;
                            this.fetchText(redirectParsed.href, sameOrigin ? authHeader : undefined, maxRedirects - 1).then(resolve);
                        } catch {
                            this.fetchText(redirectUrl, undefined, maxRedirects - 1).then(resolve);
                        }
                        return;
                    }
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
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl && isSafeRedirectTarget(redirectUrl, url)) {
                        // Preserve auth header on same-origin redirects only
                        const redirectParsed = new URL(redirectUrl, url);
                        const sameOrigin = redirectParsed.origin === parsed.origin;
                        this.fetchJsonWithDetails<T>(redirectUrl, sameOrigin ? authHeader : undefined, timeoutMs, maxRedirects - 1).then(resolve);
                        return;
                    }
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
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl && maxRedirects > 0 && isSafeRedirectTarget(redirectUrl, url)) {
                        // Preserve auth header on same-origin redirects only
                        const redirectParsed = new URL(redirectUrl, url);
                        const sameOrigin = redirectParsed.origin === parsed.origin;
                        this.fetchJsonHttp1<T>(redirectUrl, sameOrigin ? authHeader : undefined, maxRedirects - 1).then(resolve);
                        return;
                    }
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
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl && maxRedirects > 0 && isSafeRedirectTarget(redirectUrl, url)) {
                        const redirectParsed = new URL(redirectUrl, url);
                        const sameOrigin = redirectParsed.origin === parsed.origin;
                        this.fetchJsonWithCompression<T>(redirectParsed.href, sameOrigin ? authHeader : undefined, maxRedirects - 1).then(resolve);
                        return;
                    }
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

    /**
     * Extract README from nupkg file (lazy loading for custom sources)
     * Downloads the package and extracts the embedded README.md
     */
    public async extractReadmeFromPackage(packageId: string, version: string, source?: string): Promise<string | null> {
        try {
            // Check workspace cache first (persists across panel closes)
            const readmeCacheKey = cacheKeys.readme(packageId, version);
            const workspaceCached = workspaceCache.get<string>(readmeCacheKey);
            if (workspaceCached !== undefined) {
                return workspaceCached;
            }

            // Check if we already have the README cached in metadata
            const cacheKey = `${packageId.toLowerCase()}@${version.toLowerCase()}`;
            const cachedMetadata = this.metadataCache.get(cacheKey);
            if (cachedMetadata?.readme) {
                // Also add to workspace cache
                workspaceCache.set(readmeCacheKey, cachedMetadata.readme, CACHE_TTL.README);
                return cachedMetadata.readme;
            }

            // Get the package download URL from enabled sources
            let packageContentUrl: string | null = null;
            const allSources = await this.getSources();
            const enabledSources = allSources.filter((s: NuGetSource) => s.enabled);
            const sourcesToCheck = source ? [source] : enabledSources.map((s: NuGetSource) => s.url);

            for (const sourceUrl of sourcesToCheck) {
                // Discover service endpoints for this source
                const endpoints = await this.discoverServiceEndpoints(sourceUrl);
                if (!endpoints) {
                    continue;
                }

                // Get auth header for this source
                const authHeader = await this.getAuthHeader(sourceUrl);

                const registrationBaseUrl = endpoints.registrationsBaseUrl?.replace(/\/$/, '');
                const flatContainerBaseUrl = endpoints.packageBaseAddress?.replace(/\/$/, '');

                // Strategy 1: Try direct version-specific registration endpoint (Nexus/ProGet style)
                if (registrationBaseUrl) {
                    const directUrl = `${registrationBaseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}.json`;
                    const directData = await this.fetchJson<{
                        packageContent?: string;
                        catalogEntry?: { packageContent?: string };
                    }>(directUrl, authHeader);

                    if (directData) {
                        packageContentUrl = directData.packageContent || directData.catalogEntry?.packageContent || null;
                    }
                }

                // Strategy 2: Try package index.json and search through pages (nuget.org style)
                if (!packageContentUrl && registrationBaseUrl) {
                    const indexUrl = `${registrationBaseUrl}/${packageId.toLowerCase()}/index.json`;
                    const registrationData = await this.fetchJson<{
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
                            // Check inline items
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

                            // If no inline items but page has @id, fetch the page
                            if (!page.items && page['@id']) {
                                const pageData = await this.fetchJson<{
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

                // Strategy 3: If registration didn't have packageContent, try flat container directly
                // This is reliable because flat container URL is predictable
                if (!packageContentUrl && flatContainerBaseUrl) {
                    const flatContainerUrl = `${flatContainerBaseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}/${packageId.toLowerCase()}.${version.toLowerCase()}.nupkg`;
                    // Verify the package exists at this URL before using it
                    const exists = await this.checkUrlExists(flatContainerUrl);
                    if (exists) {
                        packageContentUrl = flatContainerUrl;
                    }
                }

                // Break if we found a URL from this source
                if (packageContentUrl) { break; }
            }

            if (!packageContentUrl) {
                return null;
            }

            // Download the nupkg to a temp file
            const tempDir = os.tmpdir();
            const tempFile = path.join(tempDir, `${packageId}.${version}.nupkg`);

            const downloadSuccess = await this.downloadFile(packageContentUrl, tempFile);
            if (!downloadSuccess) {
                return null;
            }

            try {
                // Open the nupkg as a ZIP file
                const zip = new AdmZip(tempFile);
                const zipEntries = zip.getEntries();

                // First, find and parse the nuspec to get the readme path
                let readmePath: string | null = null;
                for (const entry of zipEntries) {
                    if (entry.entryName.toLowerCase().endsWith('.nuspec') &&
                        !entry.entryName.includes('..') && !entry.entryName.startsWith('/')) {
                        const nuspecContent = entry.getData().toString('utf8');
                        const readmeMatch = nuspecContent.match(/<readme>([^<]+)<\/readme>/i);
                        if (readmeMatch) {
                            const candidate = readmeMatch[1].trim();
                            // Reject path traversal in nuspec-provided readme path
                            if (!candidate.includes('..') && !candidate.startsWith('/') && !candidate.includes('\\')) {
                                readmePath = candidate;
                            }
                        }
                        break;
                    }
                }

                // Look for README file
                // Priority: 1) Path from nuspec, 2) README.md at root or common locations
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

                            // Update the metadata cache with the README
                            if (cachedMetadata) {
                                this.metadataCache.set(cacheKey, { ...cachedMetadata, readme: readmeContent });
                            }

                            // Cache to workspace (persists across panel closes)
                            workspaceCache.set(readmeCacheKey, readmeContent, CACHE_TTL.README);

                            // Cleanup temp file
                            try { fs.unlinkSync(tempFile); } catch { /* ignore */ }

                            return readmeContent;
                        }
                    }
                }
            } finally {
                // Cleanup temp file
                try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
            }

            return null;
        } catch (error) {
            console.error(`[NuGet] Error extracting README from package:`, error);
            return null;
        }
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
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl && isSafeRedirectTarget(redirectUrl, url)) {
                        file.close();
                        destroyed = true;
                        this.downloadFile(redirectUrl, destPath, maxRedirects - 1).then(resolve);
                        return;
                    }
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

    /**
     * Get transitive packages for ALL target frameworks
     * Uses project.assets.json which is always fresh after dotnet commands
     * Metadata is NOT fetched here - call fetchTransitivePackageMetadata separately when section is expanded
     * @param projectPath Path to the project file
     */
    async getTransitivePackages(projectPath: string): Promise<TransitivePackagesResult> {
        const projectDir = path.dirname(projectPath);
        const assetsPath = path.join(projectDir, 'obj', 'project.assets.json');

        if (!await fileExists(assetsPath)) {
            // project.assets.json doesn't exist - project has never been built/restored
            return { frameworks: [], dataSourceAvailable: false };
        }

        try {
            const result = await this.getTransitivePackagesFromAssets(assetsPath);
            return {
                frameworks: result.frameworks,
                dataSourceAvailable: true
            };
        } catch (error) {
            console.error('Failed to parse project.assets.json:', error);
            return { frameworks: [], dataSourceAvailable: true };
        }
    }

    /**
     * Get transitive packages from project.assets.json
     * This file is always updated by dotnet commands (including remove)
     */
    private async getTransitivePackagesFromAssets(assetsPath: string): Promise<{ frameworks: TransitiveFrameworkSection[] }> {
        const assetsData = await this.readAssetsJson<{
            version: number;
            targets: Record<string, Record<string, {
                type?: string;
                dependencies?: Record<string, string>;
            }>>;
            projectFileDependencyGroups: Record<string, string[]>;
        }>(assetsPath);

        if (!assetsData?.targets || !assetsData.projectFileDependencyGroups) {
            return { frameworks: [] };
        }

        // Get target frameworks sorted newest first
        const targetFrameworks = Object.keys(assetsData.targets).sort((a, b) => {
            const getVersion = (tfm: string): number => {
                const match = tfm.match(/net(\d+(?:\.\d+)?)/i);
                return match ? parseFloat(match[1]) : 0;
            };
            return getVersion(b) - getVersion(a);
        });

        if (targetFrameworks.length === 0) {
            return { frameworks: [] };
        }

        const frameworkSections: TransitiveFrameworkSection[] = [];

        for (const targetFramework of targetFrameworks) {
            const targetPackages = assetsData.targets[targetFramework];

            // Get direct packages for this TFM from projectFileDependencyGroups
            // Format: "PackageId >= Version" or "PackageId"
            const directPackageIds = new Set<string>();
            const directDeps = assetsData.projectFileDependencyGroups[targetFramework] || [];
            for (const dep of directDeps) {
                // Extract package ID (before >=, >, ==, etc. or just the ID)
                const match = dep.match(/^([^\s>=<]+)/);
                if (match) {
                    directPackageIds.add(match[1].toLowerCase());
                }
            }

            // Build dependency graph (who depends on whom)
            const dependedOnBy = new Map<string, Set<string>>();
            const packageVersions = new Map<string, string>(); // packageId lowercase -> version

            for (const key of Object.keys(targetPackages)) {
                // Key format: "PackageId/Version"
                const match = key.match(/^(.+?)\/(.+)$/);
                if (!match) { continue; }

                const [, packageId, version] = match;
                const packageIdLower = packageId.toLowerCase();
                packageVersions.set(packageIdLower, version);

                const pkgData = targetPackages[key];
                if (pkgData.dependencies) {
                    for (const depId of Object.keys(pkgData.dependencies)) {
                        const depIdLower = depId.toLowerCase();
                        if (!dependedOnBy.has(depIdLower)) {
                            dependedOnBy.set(depIdLower, new Set());
                        }
                        const deps = dependedOnBy.get(depIdLower);
                        if (deps) { deps.add(packageId); }
                    }
                }
            }

            // Build full chain for each transitive package (recursive, with memoization)
            const chainCache = new Map<string, string[]>();
            const buildChain = (packageId: string, visited: Set<string> = new Set()): string[] => {
                const cacheKey = packageId.toLowerCase();
                const cached = chainCache.get(cacheKey);
                if (cached) { return [...cached]; }

                const chain: string[] = [];
                const parents = dependedOnBy.get(cacheKey);

                if (!parents || parents.size === 0) {
                    chainCache.set(cacheKey, chain);
                    return chain;
                }

                for (const parent of parents) {
                    if (visited.has(parent.toLowerCase())) {
                        continue; // Avoid cycles
                    }

                    if (directPackageIds.has(parent.toLowerCase())) {
                        // Found a direct package - this is a valid chain root
                        chain.push(parent);
                    } else {
                        // Transitive parent - keep searching up the chain
                        visited.add(parent.toLowerCase());
                        const parentChain = buildChain(parent, visited);
                        if (parentChain.length > 0) {
                            chain.push(...parentChain.map(p => `${p} → ${parent}`));
                        }
                    }
                }

                chainCache.set(cacheKey, [...chain]);
                return chain;
            };

            // Collect transitive packages (packages not in directPackageIds)
            const transitivePackages: TransitivePackage[] = [];

            for (const key of Object.keys(targetPackages)) {
                const match = key.match(/^(.+?)\/(.+)$/);
                if (!match) { continue; }

                const [, packageId, version] = match;

                // Skip direct packages
                if (directPackageIds.has(packageId.toLowerCase())) {
                    continue;
                }

                const fullChain = buildChain(packageId);
                const displayChain = fullChain.slice(0, 5);
                const needsTruncation = fullChain.length > 5;

                transitivePackages.push({
                    id: packageId,
                    version,
                    requiredByChain: displayChain,
                    fullChain: needsTruncation ? fullChain : undefined
                });
            }

            // Sort alphabetically
            transitivePackages.sort((a, b) => a.id.localeCompare(b.id));

            frameworkSections.push({
                targetFramework,
                packages: transitivePackages
            });
        }

        return { frameworks: frameworkSections };
    }

    /**
     * Fetch metadata (icons, verified status, authors) for transitive packages
     * Uses batched fetching to limit concurrent network operations
     */
    public async fetchTransitivePackageMetadata(packages: TransitivePackage[]): Promise<void> {
        // Pre-fetch enabled sources once for all packages
        const allSources = await this.getSources();
        const enabledSources = allSources.filter(s => s.enabled);

        await batchedPromiseAll(packages, async (pkg) => {
            // Single search API call: gets verified, authors, AND iconUrl
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

            // If search API didn't return an icon, fall back to resolveIconUrl (custom sources)
            if (!pkg.iconUrl) {
                const fallbackIcon = await this.resolveIconUrl(pkg.id, pkg.version, enabledSources);
                if (fallbackIcon) {
                    pkg.iconUrl = fallbackIcon;
                }
            }
        }, 16); // Sliding-window concurrency (was 8 batch-then-wait)
    }

    /**
     * Restore the project using dotnet restore
     * This generates/updates project.assets.json which is needed for transitive packages
     */
    async restoreProject(projectPath: string): Promise<boolean> {
        this.setupOutputChannel(true); // Don't auto-reveal for this operation
        const command = `dotnet restore "${projectPath}"`;

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const { stdout, stderr } = await execWithTimeout(command, { timeout: 120000, cwd: workspaceFolder }); // 2 minute timeout for restore
            this.logOutput(command, stdout, stderr, true);
            this.logSuccess('Project restored successfully');
            return true;
        } catch (error) {
            const execErr = error as ExecError;
            const errorOutput = execErr.stderr || execErr.stdout || String(error);
            this.logOutput(command, execErr.stdout || '', execErr.stderr || '', false);
            this.logError(`Failed to restore project: ${errorOutput}`);
            vscode.window.showErrorMessage(`Failed to restore project: ${errorOutput}`);
            return false;
        }
    }
}

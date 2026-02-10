import AdmZip from 'adm-zip';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { credentialService, CredentialService } from './CredentialService';
import { http2Client } from './Http2Client';
import { NuGetConfigParser } from './NuGetConfigParser';
import { CACHE_TTL, cacheKeys, workspaceCache } from './WorkspaceCache';

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

// Async file existence check (non-blocking alternative to fs.existsSync)
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * LRU (Least Recently Used) Map with maximum size limit.
 * Automatically evicts oldest entries when capacity is reached.
 * Used for in-memory caches to prevent unbounded memory growth.
 */
class LRUMap<K, V> {
    private cache: Map<K, V> = new Map();
    private readonly maxSize: number;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
    }

    get(key: K): V | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Move to end (most recently used)
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    set(key: K, value: V): void {
        // If key exists, delete it first to update position
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Evict oldest entry (first in iteration order)
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }
        this.cache.set(key, value);
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}

/**
 * Execute promises in batches to limit concurrency.
 * Prevents overwhelming the network with too many simultaneous requests.
 * @param items Array of items to process
 * @param processor Async function to process each item
 * @param concurrency Maximum concurrent operations (default: 6)
 */
async function batchedPromiseAll<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number = 6
): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(processor));
        results.push(...batchResults);
    }
    return results;
}

// Command timeout (60 seconds)
const COMMAND_TIMEOUT = 60000;

// Custom error type that includes stdout/stderr from failed commands
interface ExecError extends Error {
    stdout?: string;
    stderr?: string;
    code?: number;
}

// Execute command with timeout
async function execWithTimeout(
    command: string,
    timeoutOrOptions?: number | { timeout?: number; cwd?: string },
    legacyCwd?: string
): Promise<{ stdout: string; stderr: string }> {
    // Handle both old signature (command, timeout) and options object
    let timeout = COMMAND_TIMEOUT;
    let cwd: string | undefined;

    if (typeof timeoutOrOptions === 'number') {
        timeout = timeoutOrOptions;
        cwd = legacyCwd;
    } else if (timeoutOrOptions) {
        timeout = timeoutOrOptions.timeout ?? COMMAND_TIMEOUT;
        cwd = timeoutOrOptions.cwd;
    }

    return new Promise((resolve, reject) => {
        exec(command, { timeout, cwd }, (error, stdout, stderr) => {
            if (error) {
                // Include stdout/stderr in the error for better diagnostics
                const execError = error as ExecError;
                execError.stdout = stdout;
                execError.stderr = stderr;
                reject(execError);
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

// Validate package ID to prevent command injection
function isValidPackageId(packageId: string): boolean {
    // NuGet package IDs: alphanumeric, dots, underscores, hyphens
    return /^[a-zA-Z0-9._-]+$/.test(packageId);
}

// Validate version string
function isValidVersion(version: string): boolean {
    // SemVer-like: digits, dots, hyphens, plus, alphanumeric
    return /^[a-zA-Z0-9._+-]+$/.test(version);
}

// Validate source name to prevent command injection in dotnet nuget commands
function isValidSourceName(name: string): boolean {
    // Source names: alphanumeric, dots, underscores, hyphens, spaces
    // Reject shell metacharacters: "; & | $ ` \ < > ( ) { } ! # etc.
    return /^[a-zA-Z0-9._\- ]+$/.test(name) && name.length > 0 && name.length <= 256;
}

// Validate URL for safe shell command use
function isValidSourceUrl(url: string): boolean {
    // Allow file:// for local folders, http(s):// for network sources
    // Reject shell-dangerous characters
    const dangerousChars = /["'`\\|><;{}\r\n\t&$!#()]/;
    if (dangerousChars.test(url)) {
        return false;
    }
    // Validate URL structure
    try {
        const parsed = new URL(url);
        return ['http:', 'https:', 'file:'].includes(parsed.protocol);
    } catch {
        // If not a URL, it might be a local path
        // Allow Windows and Unix paths (alphanumeric, :, \, /, ., -, _, space)
        return /^[a-zA-Z0-9.:/_\- \\]+$/.test(url);
    }
}

/**
 * Version specification types for NuGet packages
 */
export type VersionType = 'floating' | 'range' | 'exact' | 'standard';

/**
 * Parsed version specification result
 */
export interface VersionSpec {
    type: VersionType;
    /** Original version string from csproj */
    original: string;
    /** For floating versions: the prefix before the wildcard (e.g., "10" from "10.*") */
    floatingPrefix?: string;
    /** For floating versions: the depth of the wildcard (major=1, minor=2, patch=3) */
    floatingDepth?: number;
    /** Whether this is a pure wildcard (*) that always gets latest */
    isAlwaysLatest?: boolean;
}

/**
 * Parse a version specification to determine its type and extract metadata
 * Supports: floating (*, 10.*, 1.0.*, 1.*-*), range ([1.0,2.0), (,2.0]), exact ([1.0.0]), standard (1.0.0)
 */
function parseVersionSpec(version: string): VersionSpec {
    const trimmed = version.trim();

    // Pure wildcard - always gets latest
    if (trimmed === '*' || trimmed === '*-*') {
        return {
            type: 'floating',
            original: version,
            isAlwaysLatest: true,
            floatingDepth: 0
        };
    }

    // Floating versions with wildcards: 10.*, 1.0.*, 1.*-*, 1.0.0-*
    // Patterns: N.*, N.N.*, N.N.N-*, N.*-*
    const floatingMatch = trimmed.match(/^(\d+(?:\.\d+)*)\.?\*(-\*)?$/);
    if (floatingMatch) {
        const prefix = floatingMatch[1];
        const parts = prefix.split('.');
        return {
            type: 'floating',
            original: version,
            floatingPrefix: prefix,
            floatingDepth: parts.length,
            isAlwaysLatest: false
        };
    }

    // Prerelease floating: 1.0.0-* or 1.0.0-beta.*
    const prereleaseFloatingMatch = trimmed.match(/^(\d+\.\d+\.\d+)-(.*)?\*$/);
    if (prereleaseFloatingMatch) {
        return {
            type: 'floating',
            original: version,
            floatingPrefix: prereleaseFloatingMatch[1],
            floatingDepth: 3,
            isAlwaysLatest: false
        };
    }

    // Exact version: [1.0.0]
    if (/^\[\d+(\.\d+)*(-[\w.]+)?\]$/.test(trimmed)) {
        return {
            type: 'exact',
            original: version
        };
    }

    // Range with brackets: [1.0,2.0], (1.0,2.0], [1.0,2.0), (1.0,2.0)
    // Also: [1.0,), (,2.0], (1.0,), (,2.0)
    if (/^[[(].*,.*[)\]]$/.test(trimmed)) {
        return {
            type: 'range',
            original: version
        };
    }

    // Standard version (could be implicit minimum version)
    return {
        type: 'standard',
        original: version
    };
}

export interface Project {
    name: string;
    path: string;
}

export interface InstalledPackage {
    id: string;
    /** The version as specified in the csproj (may be floating like "10.*" or range like "[1.0,2.0)") */
    version: string;
    /** The actual resolved version from lock file (e.g., "10.2.0") */
    resolvedVersion?: string;
    /** Type of version specification */
    versionType: VersionType;
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
}

export interface NuGetSource {
    name: string;
    url: string;
    enabled: boolean;
}

/**
 * Represents a transitive (indirect) package dependency
 */
export interface TransitivePackage {
    id: string;
    version: string;
    /** Chain of packages that require this package (up to 5 levels, full chain in tooltip) */
    requiredByChain: string[];
    /** Full chain for tooltip if truncated */
    fullChain?: string[];
    iconUrl?: string;
    verified?: boolean;
    authors?: string;
}

/**
 * Transitive packages for a specific target framework
 */
export interface TransitiveFrameworkSection {
    targetFramework: string;
    packages: TransitivePackage[];
}

/**
 * Result of getTransitivePackages - includes data source status and all frameworks
 */
export interface TransitivePackagesResult {
    frameworks: TransitiveFrameworkSection[];
    /** Whether project.assets.json exists (project has been built/restored) */
    dataSourceAvailable: boolean;
}

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
}

/**
 * Result from grouped quick search - one entry per source
 */
export interface QuickSearchSourceResult {
    sourceName: string;
    sourceUrl: string;
    packageIds: string[];
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
    // LRU cache for icon existence checks (url -> exists, max 500 entries)
    private iconExistsCache: LRUMap<string, boolean> = new LRUMap(500);
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
    // Failed endpoint cache TTL: 60 seconds (allows retry after connectivity is restored)
    private static readonly FAILED_ENDPOINT_CACHE_TTL = 60000;
    // Default timeout for HTTP requests to custom sources (milliseconds)
    private static readonly HTTP_REQUEST_TIMEOUT = 10000;
    // Shorter timeout for service index discovery (milliseconds)
    private static readonly SERVICE_INDEX_TIMEOUT = 5000;
    // Cache for parsed project.assets.json (path -> { mtime, data })
    // Avoids re-parsing large files (5-50MB) multiple times in a single flow
    private assetsJsonCache: Map<string, { mtimeMs: number; data: unknown; timestamp: number }> = new Map();
    // Assets cache TTL: 30 seconds
    private static readonly ASSETS_CACHE_TTL = 30000;
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
     * Get the noRestore setting - when true, adds --no-restore to install/update commands
     */
    private getNoRestoreFlag(): string {
        const config = vscode.workspace.getConfiguration('nuiget');
        return config.get<boolean>('noRestore', false) ? '--no-restore' : '';
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
        const header = `${operationType} ${packageCount} packages...`;
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
                    // RegistrationsBaseUrl - for package metadata
                    if (types.some(t => t && t.includes('RegistrationsBaseUrl') && !t.includes('gz'))) {
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

            // Evict expired entries to prevent unbounded memory growth
            if (this.assetsJsonCache.size > 1) {
                for (const [key, entry] of this.assetsJsonCache) {
                    if (key !== assetsPath && (now - entry.timestamp) >= NuGetService.ASSETS_CACHE_TTL) {
                        this.assetsJsonCache.delete(key);
                    }
                }
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

        return projects;
    }

    async getInstalledPackages(projectPath: string): Promise<InstalledPackage[]> {
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
                const resolvedVersion = resolvedVersions.get(id.toLowerCase());

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
                // Fetch icons, verified status, and authors for packages parsed from csproj
                await this.fetchInstalledPackageMetadata(packages);
                return packages;
            }
        } catch (parseError) {
            console.error('Failed to parse csproj file:', parseError);
        }

        // Fallback: try dotnet CLI
        try {
            const { stdout } = await execWithTimeout(`dotnet list "${projectPath}" package`);

            // Get direct package references from csproj and Directory.Build.props for cross-reference
            // Some SDK-implicit packages appear as "top-level" but aren't user-added PackageReferences
            const directPackageIds = new Set<string>();
            const projectDir = path.dirname(projectPath);
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

            // Fetch icons, verified status, and authors for installed packages
            await this.fetchInstalledPackageMetadata(packages);

            return packages;
        } catch (error) {
            // Don't show error if we already parsed from csproj
            if (packages.length === 0) {
                console.error('Failed to get installed packages via dotnet CLI:', error);
            }
            // Fetch icons, verified status, and authors for packages parsed from csproj
            if (packages.length > 0) {
                await this.fetchInstalledPackageMetadata(packages);
            }
            return packages;
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

            // Skip icon fetching for wildcard versions without resolved version
            if (!versionForIcon.includes('*') && !versionForIcon.includes('[') && !versionForIcon.includes('(')) {
                // First try nuget.org for icon and metadata
                const iconUrl = `https://api.nuget.org/v3-flatcontainer/${pkg.id.toLowerCase()}/${versionForIcon.toLowerCase()}/icon`;
                const iconExists = await this.checkIconExists(pkg.id, versionForIcon, iconUrl);
                if (iconExists) {
                    pkg.iconUrl = iconUrl;
                }
            }

            // Fetch verified status and authors using cached method
            const { verified, authors } = await this.getPackageVerifiedAndAuthors(pkg.id);
            if (verified !== undefined) {
                pkg.verified = verified;
                foundMetadata = true;
            }
            if (authors) {
                pkg.authors = authors;
                foundMetadata = true;
            }

            // If not found on nuget.org, try custom sources
            if (!foundMetadata) {
                for (const source of enabledSources) {
                    if (source.url.includes('nuget.org')) { continue; } // Already tried

                    try {
                        const endpoints = await this.discoverServiceEndpoints(source.url);

                        // Try to get icon from custom source (only if we have a valid version)
                        if (!pkg.iconUrl && endpoints.packageBaseAddress && !versionForIcon.includes('*') && !versionForIcon.includes('[')) {
                            const customIconUrl = `${endpoints.packageBaseAddress.replace(/\/$/, '')}/${pkg.id.toLowerCase()}/${versionForIcon.toLowerCase()}/icon`;
                            const customIconExists = await this.checkIconExists(pkg.id, versionForIcon, customIconUrl);
                            if (customIconExists) {
                                pkg.iconUrl = customIconUrl;
                            }
                        }

                        // Try to get authors from search API
                        if (endpoints.searchQueryService) {
                            const customAuthHeader = await this.getAuthHeader(source.url);
                            const customSearchUrl = `${endpoints.searchQueryService}?q=packageid:${encodeURIComponent(pkg.id)}&take=1&prerelease=true`;
                            const customData = await this.fetchJson<any>(customSearchUrl, customAuthHeader);
                            const customPackages = customData?.data || customData?.Data || (Array.isArray(customData) ? customData : []);

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
        }, 8); // Limit to 8 concurrent requests
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

        // For quick search, prioritize speed:
        // - If multiple sources ("all"), use only nuget.org for fastest response
        // - If single source selected, use that source
        const isMultipleSources = validSources.length > 1 || validSources.length === 0;
        const sourcesToSearch = isMultipleSources
            ? ['https://api.nuget.org/v3/index.json']
            : validSources;

        // Build cache key (include take to respect quickSearchResultsPerSource setting changes)
        const cacheKey = `${trimmedQuery.toLowerCase()}|${sourcesToSearch[0] || 'nuget.org'}|${includePrerelease ? 'pre' : 'stable'}|${take}`;

        // Check cache (30-second TTL)
        const cached = this.autocompleteCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < NuGetService.AUTOCOMPLETE_CACHE_TTL) {
            return cached.data;
        }

        const allResults: string[] = [];
        const seenIds = new Set<string>();

        for (const sourceUrl of sourcesToSearch) {
            try {
                const endpoints = await this.discoverServiceEndpoints(sourceUrl);

                // Silently skip sources without autocomplete API
                if (!endpoints.searchAutocompleteService) {
                    continue;
                }

                // Build autocomplete URL
                const params = new URLSearchParams({
                    q: trimmedQuery,
                    take: take.toString(),
                    semVerLevel: '2.0.0'
                });
                if (includePrerelease) {
                    params.set('prerelease', 'true');
                }

                const autocompleteUrl = `${endpoints.searchAutocompleteService}?${params.toString()}`;

                // Get auth header for this source
                const authHeader = await this.getAuthHeader(sourceUrl);

                // Use HTTP/2 for nuget.org sources (TLS 1.2+ now enforced)
                const result = await this.fetchJson<{ data: string[]; totalHits?: number }>(autocompleteUrl, authHeader);

                if (result?.data && Array.isArray(result.data)) {
                    for (const packageId of result.data) {
                        const lowerId = packageId.toLowerCase();
                        if (!seenIds.has(lowerId)) {
                            seenIds.add(lowerId);
                            allResults.push(packageId);
                        }
                    }
                }
            } catch {
                // Silently fail for individual sources
                continue;
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

    async searchPackages(query: string, sources?: string[], includePrerelease?: boolean): Promise<PackageSearchResult[]> {
        try {
            // Check cache first
            const searchCacheKey = cacheKeys.searchResults(query, sources || [], includePrerelease ?? false);

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
            if (validSources.length > 0) {
                sourceArg = validSources.map(s => `--source "${s}"`).join(' ');
            }

            const prereleaseArg = includePrerelease ? '--prerelease' : '';

            const config = vscode.workspace.getConfiguration('nuiget');
            const searchResultLimit = config.get<number>('searchResultLimit', 20);

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const command = `dotnet package search "${query}" ${sourceArg} ${prereleaseArg} --take ${searchResultLimit}`;
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
                        authors: owners,
                        totalDownloads: downloads,
                        versions: [version]
                    });
                }
            }

            // Fetch icons and verified status for all packages in parallel
            await Promise.all([
                this.fetchPackageIcons(packages),
                this.fetchPackageVerifiedStatus(packages)
            ]);

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
     * Fetch icon URLs for packages from NuGet API
     * Uses the flat container icon endpoint which works for embedded icons
     */
    private async fetchPackageIcons(packages: PackageSearchResult[]): Promise<void> {
        const iconPromises = packages.map(async (pkg) => {
            // Use flat container icon endpoint - works for embedded icons (iconFile)
            const iconUrl = `https://api.nuget.org/v3-flatcontainer/${pkg.id.toLowerCase()}/${pkg.version.toLowerCase()}/icon`;

            // Check if icon exists (cached)
            const exists = await this.checkIconExists(pkg.id, pkg.version, iconUrl);
            if (exists) {
                pkg.iconUrl = iconUrl;
            }
        });

        await Promise.all(iconPromises);
    }

    /**
     * Check if an icon URL exists, with caching.
     * Icons are immutable per package version, so cache indefinitely.
     */
    private async checkIconExists(packageId: string, version: string, iconUrl: string): Promise<boolean> {
        const cacheKey = cacheKeys.iconExists(packageId, version);

        // Check in-memory cache first (fastest)
        const memoryCached = this.iconExistsCache.get(cacheKey);
        if (memoryCached !== undefined) {
            return memoryCached;
        }

        // Check workspace cache (persists across panel closes)
        const workspaceCached = workspaceCache.get<boolean>(cacheKey);
        if (workspaceCached !== undefined) {
            this.iconExistsCache.set(cacheKey, workspaceCached);
            return workspaceCached;
        }

        // Fetch and cache result
        const exists = await this.checkUrlExists(iconUrl);
        this.iconExistsCache.set(cacheKey, exists);
        workspaceCache.set(cacheKey, exists, CACHE_TTL.ICON_EXISTS);
        return exists;
    }

    /**
     * Check if a URL exists (returns 200) - raw HTTP check, no caching
     * Uses HTTP/2 for nuget.org sources for better performance
     */
    private async checkUrlExists(url: string): Promise<boolean> {
        // Use HTTP/2 client for nuget.org sources (multiplexing)
        if (url.includes('.nuget.org')) {
            const statusCode = await http2Client.headRequest(url);
            // Handle redirects by following them
            if (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) {
                // For redirects, fall back to HTTP/1.1 which handles redirects
                return this.checkUrlExistsHttp1(url);
            }
            return statusCode === 200;
        }
        return this.checkUrlExistsHttp1(url);
    }

    /**
     * HTTP/1.1 URL check with redirect handling
     */
    private checkUrlExistsHttp1(url: string): Promise<boolean> {
        return new Promise((resolve) => {
            const client = url.startsWith('https://') ? https : http;
            const req = client.request(url, { method: 'HEAD' }, (res) => {
                // Handle redirects - follow them
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl) {
                        this.checkUrlExistsHttp1(redirectUrl).then(resolve);
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

    /**
     * Fetch verified status and authors for packages from NuGet search API or custom sources
     * The verified field indicates the package ID prefix is reserved by the owner
     */
    private async fetchPackageVerifiedStatus(packages: PackageSearchResult[]): Promise<void> {
        if (packages.length === 0) {
            return;
        }

        // Get all enabled sources for fallback
        const allSources = await this.getSources();
        const enabledSources = allSources.filter(s => s.enabled);

        try {
            // Fetch verified status and authors for each package individually
            const verifiedPromises = packages.map(async (pkg) => {
                try {
                    const statusCacheKey = cacheKeys.verifiedStatus(pkg.id);

                    // Check in-memory cache first (fastest)
                    const memoryCached = this.verifiedStatusCache.get(statusCacheKey);
                    if (memoryCached) {
                        pkg.verified = memoryCached.verified;
                        if (memoryCached.authors) {
                            pkg.authors = memoryCached.authors;
                        }
                        if (memoryCached.description && !pkg.description) {
                            pkg.description = memoryCached.description;
                        }
                        return;
                    }

                    // Check workspace cache (persists across panel closes)
                    const workspaceCached = workspaceCache.get<{ verified: boolean; authors?: string; description?: string }>(statusCacheKey);
                    if (workspaceCached) {
                        this.verifiedStatusCache.set(statusCacheKey, workspaceCached);
                        pkg.verified = workspaceCached.verified;
                        if (workspaceCached.authors) {
                            pkg.authors = workspaceCached.authors;
                        }
                        if (workspaceCached.description && !pkg.description) {
                            pkg.description = workspaceCached.description;
                        }
                        return;
                    }

                    // First try nuget.org - use dynamic endpoint from service index
                    const nugetOrgEndpoints = await this.discoverServiceEndpoints('https://api.nuget.org/v3/index.json');
                    if (!nugetOrgEndpoints.searchQueryService) {
                        return; // Can't get verified status without search endpoint
                    }
                    const searchUrl = `${nugetOrgEndpoints.searchQueryService}?q=packageid:${encodeURIComponent(pkg.id)}&take=1`;
                    const data = await this.fetchJson<{ data: Array<{ id: string; verified?: boolean; authors?: string[]; description?: string }> }>(searchUrl);

                    if (data?.data?.length && data.data.length > 0) {
                        const result = data.data[0];
                        if (result.id?.toLowerCase() === pkg.id.toLowerCase()) {
                            pkg.verified = result.verified === true;
                            if (result.authors) {
                                pkg.authors = result.authors.join(', ');
                            }
                            if (result.description && !pkg.description) {
                                pkg.description = result.description;
                            }
                            // Cache the result
                            const cacheValue = {
                                verified: pkg.verified,
                                authors: pkg.authors,
                                description: result.description
                            };
                            this.verifiedStatusCache.set(statusCacheKey, cacheValue);
                            workspaceCache.set(statusCacheKey, cacheValue, CACHE_TTL.VERIFIED_STATUS);
                            return; // Found on nuget.org
                        }
                    }

                    // Not found on nuget.org, try custom sources
                    for (const source of enabledSources) {
                        if (source.url.includes('nuget.org')) { continue; } // Already tried

                        const endpoints = await this.discoverServiceEndpoints(source.url);
                        if (endpoints.searchQueryService) {
                            const customAuthHeader = await this.getAuthHeader(source.url);
                            const customSearchUrl = `${endpoints.searchQueryService}?q=packageid:${encodeURIComponent(pkg.id)}&take=1&prerelease=true`;
                            const customData = await this.fetchJson<any>(customSearchUrl, customAuthHeader);
                            const customPackages = customData?.data || customData?.Data || (Array.isArray(customData) ? customData : []);

                            if (customPackages.length > 0) {
                                const result = customPackages[0];
                                if (result.id?.toLowerCase() === pkg.id.toLowerCase() || result.Id?.toLowerCase() === pkg.id.toLowerCase()) {
                                    // Get authors
                                    const authors = result.authors || result.Authors;
                                    if (authors) {
                                        pkg.authors = Array.isArray(authors) ? authors.join(', ') : authors;
                                    }
                                    // Get description
                                    const desc = result.description || result.Description || result.summary || result.Summary;
                                    if (desc && !pkg.description) {
                                        pkg.description = desc;
                                    }
                                    // Cache the result (custom sources don't have verified, default to false)
                                    const cacheValue = {
                                        verified: false,
                                        authors: pkg.authors,
                                        description: pkg.description
                                    };
                                    this.verifiedStatusCache.set(statusCacheKey, cacheValue);
                                    workspaceCache.set(statusCacheKey, cacheValue, CACHE_TTL.VERIFIED_STATUS);
                                    return; // Found
                                }
                            }
                        }
                    }
                } catch {
                    // Silently fail for individual package lookups
                }
            });

            await Promise.all(verifiedPromises);
        } catch {
            // Silently fail - verified status is optional
        }
    }

    async installPackage(projectPath: string, packageId: string, version?: string, options?: { skipChannelSetup?: boolean }): Promise<boolean> {
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
            const noRestoreArg = this.getNoRestoreFlag();
            const command = `dotnet add "${projectPath}" package ${packageId} ${versionArg} ${noRestoreArg}`.trim();
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const { stdout, stderr } = await execWithTimeout(command, { cwd: workspaceFolder });

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
            return true;
        } catch (error) {
            const command = `dotnet add "${projectPath}" package ${packageId} ${version ? `--version ${version}` : ''}`.trim();
            // Extract stderr from ExecError if available for better diagnostics
            const execErr = error as ExecError;
            const errorOutput = execErr.stderr || execErr.stdout || String(error);
            this.logOutput(command, execErr.stdout || '', errorOutput, false);
            this.logError(`Failed to install ${packageId}`);
            vscode.window.showErrorMessage(`Failed to install ${packageId}: ${errorOutput}`);
            return false;
        }
    }

    async updatePackage(projectPath: string, packageId: string, version: string, options?: { skipChannelSetup?: boolean }): Promise<boolean> {
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
            const noRestoreArg = this.getNoRestoreFlag();
            const command = `dotnet add "${projectPath}" package ${packageId} --version ${version} ${noRestoreArg}`.trim();
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const { stdout, stderr } = await execWithTimeout(command, { cwd: workspaceFolder });

            // Check for actual errors (case-insensitive) - dotnet uses "error" or "Error"
            const hasError = stderr && /\berror\b/i.test(stderr);
            if (hasError) {
                this.logOutput(command, stdout, stderr, false);
                this.logError(`Failed to update ${packageId}`);
                vscode.window.showErrorMessage(`Failed to update ${packageId}: ${stderr}`);
                return false;
            }

            this.logOutput(command, stdout, stderr, true);
            this.logSuccess(`Successfully updated ${packageId}`);
            vscode.window.showInformationMessage(`Successfully updated ${packageId}`);
            return true;
        } catch (error) {
            const command = `dotnet add "${projectPath}" package ${packageId} --version ${version}`;
            // Extract stderr from ExecError if available for better diagnostics
            const execErr = error as ExecError;
            const errorOutput = execErr.stderr || execErr.stdout || String(error);
            this.logOutput(command, execErr.stdout || '', errorOutput, false);
            this.logError(`Failed to update ${packageId}`);
            vscode.window.showErrorMessage(`Failed to update ${packageId}: ${errorOutput}`);
            return false;
        }
    }

    async removePackage(projectPath: string, packageId: string, options?: { skipChannelSetup?: boolean; skipRestore?: boolean }): Promise<boolean> {
        // Validate inputs to prevent command injection
        if (!isValidPackageId(packageId)) {
            vscode.window.showErrorMessage(`Invalid package ID: ${packageId}`);
            return false;
        }

        // Setup and show output channel
        this.setupOutputChannel(options?.skipChannelSetup);

        try {
            const command = `dotnet remove "${projectPath}" package ${packageId}`;
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const { stdout, stderr } = await execWithTimeout(command, { cwd: workspaceFolder });

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

            // Run silent restore to update project.assets.json (dotnet remove doesn't trigger restore)
            // Skip for bulk operations (caller will run restore once at the end) or if noRestore setting is enabled
            const noRestoreSetting = this.getNoRestoreFlag() !== '';
            if (!options?.skipRestore && !noRestoreSetting) {
                try {
                    const restoreCommand = `dotnet restore "${projectPath}"`;
                    const { stdout: restoreOut, stderr: restoreErr } = await execWithTimeout(restoreCommand, { cwd: workspaceFolder, timeout: 60000 });
                    this.logOutput(restoreCommand, restoreOut, restoreErr, true);
                } catch (restoreError) {
                    // Restore failure is not critical - transitive data may be stale but package was removed
                    const restoreErr = restoreError as ExecError;
                    this.logOutput(`dotnet restore "${projectPath}"`, restoreErr.stdout || '', restoreErr.stderr || '', false);
                }
            }

            vscode.window.showInformationMessage(`Successfully removed ${packageId}`);
            return true;
        } catch (error) {
            const command = `dotnet remove "${projectPath}" package ${packageId}`;
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
        return await this.configParser.getSources();
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
    }

    /**
     * Get map of sources that failed to resolve (url -> error message)
     */
    getFailedSources(): Map<string, string> {
        return new Map(this.failedSources);
    }

    async getPackageVersions(packageId: string, source?: string, includePrerelease?: boolean, take: number = 20): Promise<string[]> {
        try {
            // If no specific source, try all enabled sources in parallel
            if (!source || source === 'all') {
                const allSources = await this.getSources();
                const enabledSources = allSources.filter(s => s.enabled);

                // Race pattern: resolve as soon as first source returns non-empty results
                // Remaining requests will complete in background but we don't wait for them
                return await this.raceForFirstResult(
                    enabledSources.map(src =>
                        this.getPackageVersionsFromSource(packageId, src.url, includePrerelease, take)
                            .catch(() => [] as string[])
                    ),
                    (versions) => versions.length > 0
                );
            }

            return await this.getPackageVersionsFromSource(packageId, source, includePrerelease, take);
        } catch (error) {
            console.error(`[NuGet] Failed to fetch versions for ${packageId}:`, error);
            return [];
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
                    const result = allVersions.reverse().slice(0, take);

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
            const result = allVersions.reverse().slice(0, take);

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
            }

            return metadata;
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

            let registrationData: any = null;

            // Step 1: Try direct version-specific registration endpoint (only if we have registration URL)
            if (registrationBaseUrl) {
                const registrationUrl = `${registrationBaseUrl}/${packageId.toLowerCase()}/${version.toLowerCase()}.json`;
                registrationData = await this.fetchJson<any>(registrationUrl, authHeader);

                // Step 1b: If direct fetch fails, try the package index and find the version
                if (!registrationData) {
                    const packageIndexUrl = `${registrationBaseUrl}/${packageId.toLowerCase()}/index.json`;
                    const packageIndex = await this.fetchJson<any>(packageIndexUrl, authHeader);

                    if (packageIndex?.items) {
                        // Nexus/ProGet style: items contains pages, each page has items with catalogEntry
                        for (const page of packageIndex.items) {
                            // Page might have inline items or need separate fetch
                            const pageItems = page.items || [];
                            for (const item of pageItems) {
                                const itemVersion = item.catalogEntry?.version || item.version;
                                if (itemVersion?.toLowerCase() === version.toLowerCase()) {
                                    registrationData = item.catalogEntry || item;
                                    break;
                                }
                            }
                            if (registrationData) { break; }

                            // If no inline items, may need to fetch the page
                            if (!pageItems.length && page['@id']) {
                                const pageData = await this.fetchJson<any>(page['@id'], authHeader);
                                if (pageData?.items) {
                                    for (const item of pageData.items) {
                                        const itemVersion = item.catalogEntry?.version || item.version;
                                        if (itemVersion?.toLowerCase() === version.toLowerCase()) {
                                            registrationData = item.catalogEntry || item;
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
            let catalogEntry = registrationData;
            const catalogEntryUrl = registrationData.catalogEntry;
            if (catalogEntryUrl && typeof catalogEntryUrl === 'string') {
                const fetchedEntry = await this.fetchJson<any>(catalogEntryUrl, authHeader);
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

            return {
                id: catalogEntry.id || registrationData.id || packageId,
                version: catalogEntry.version || registrationData.version || version,
                description: catalogEntry.description || registrationData.description || '',
                authors: catalogEntry.authors || registrationData.authors || '',
                license: catalogEntry.licenseExpression || registrationData.licenseExpression || undefined,
                licenseUrl: catalogEntry.licenseUrl || registrationData.licenseUrl || undefined,
                projectUrl: catalogEntry.projectUrl || registrationData.projectUrl || undefined,
                totalDownloads: undefined, // Not available in catalog API
                published: catalogEntry.published || registrationData.published || undefined,
                dependencies: dependencies,
                readme: readme
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
            const searchResult = await this.fetchJson<any>(url, authHeader);

            // Handle different response formats (nuget.org uses 'data', some servers use 'Data' or root array)
            const packages = searchResult?.data || searchResult?.Data || (Array.isArray(searchResult) ? searchResult : []);

            if (packages.length > 0) {
                const pkg = packages[0];

                // Handle different field names for authors
                let authors = '';
                if (pkg.authors) {
                    authors = Array.isArray(pkg.authors) ? pkg.authors.join(', ') : pkg.authors;
                } else if (pkg.Authors) {
                    authors = Array.isArray(pkg.Authors) ? pkg.Authors.join(', ') : pkg.Authors;
                } else if (pkg.owner || pkg.Owner) {
                    authors = pkg.owner || pkg.Owner;
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
    }[]> {
        const packagesWithUpdates: {
            id: string;
            installedVersion: string;
            latestVersion: string;
            iconUrl?: string;
            verified?: boolean;
            authors?: string;
        }[] = [];

        // Check each installed package for updates in parallel
        const updateChecks = installedPackages.map(async (pkg) => {
            try {
                // Skip floating versions (*, 10.*, etc.) - cannot be updated from UI
                if (pkg.versionType === 'floating') {
                    return null;
                }

                // Skip range versions ([1.0,2.0), etc.) - cannot be updated from UI
                if (pkg.versionType === 'range') {
                    return null;
                }

                // Get available versions
                const versions = await this.getPackageVersions(pkg.id, undefined, includePrerelease, 1);
                if (versions.length === 0) {
                    return null;
                }

                const latestVersion = versions[0];

                // Standard version comparison
                if (this.isNewerVersion(latestVersion, pkg.version)) {
                    const iconUrl = await this.getPackageIconUrl(pkg.id, latestVersion);
                    const { verified, authors } = await this.getPackageVerifiedAndAuthors(pkg.id);

                    return {
                        id: pkg.id,
                        installedVersion: pkg.version,
                        latestVersion: latestVersion,
                        iconUrl,
                        verified,
                        authors
                    };
                }
            } catch (error) {
                console.error(`Failed to check updates for ${pkg.id}:`, error);
            }
            return null;
        });

        const results = await Promise.all(updateChecks);
        for (const result of results) {
            if (result) {
                packagesWithUpdates.push(result);
            }
        }

        return packagesWithUpdates;
    }

    /**
     * Helper to get package icon URL (uses cached icon check)
     */
    private async getPackageIconUrl(packageId: string, version: string): Promise<string | undefined> {
        const iconUrl = `https://api.nuget.org/v3-flatcontainer/${packageId.toLowerCase()}/${version.toLowerCase()}/icon`;
        const hasIcon = await this.checkIconExists(packageId, version, iconUrl);
        return hasIcon ? iconUrl : undefined;
    }

    /**
     * Helper to get verified status and authors for a package (uses cache)
     */
    private async getPackageVerifiedAndAuthors(packageId: string): Promise<{ verified?: boolean; authors?: string }> {
        const statusCacheKey = cacheKeys.verifiedStatus(packageId);

        // Check in-memory cache first (fastest)
        const memoryCached = this.verifiedStatusCache.get(statusCacheKey);
        if (memoryCached) {
            return { verified: memoryCached.verified, authors: memoryCached.authors };
        }

        // Check workspace cache (persists across panel closes)
        const workspaceCached = workspaceCache.get<{ verified: boolean; authors?: string; description?: string }>(statusCacheKey);
        if (workspaceCached) {
            this.verifiedStatusCache.set(statusCacheKey, workspaceCached);
            return { verified: workspaceCached.verified, authors: workspaceCached.authors };
        }

        try {
            // Use dynamic endpoint from nuget.org service index
            const nugetOrgEndpoints = await this.discoverServiceEndpoints('https://api.nuget.org/v3/index.json');
            if (!nugetOrgEndpoints.searchQueryService) {
                return {}; // Can't get verified status without search endpoint
            }
            const searchUrl = `${nugetOrgEndpoints.searchQueryService}?q=packageid:${encodeURIComponent(packageId)}&take=1`;
            const data = await this.fetchJson<{ data: Array<{ id: string; verified?: boolean; authors?: string[] }> }>(searchUrl);

            if (data?.data?.length && data.data.length > 0) {
                const result = data.data[0];
                if (result.id?.toLowerCase() === packageId.toLowerCase()) {
                    const cacheValue = {
                        verified: result.verified === true,
                        authors: result.authors?.join(', '),
                        description: undefined
                    };
                    this.verifiedStatusCache.set(statusCacheKey, cacheValue);
                    workspaceCache.set(statusCacheKey, cacheValue, CACHE_TTL.VERIFIED_STATUS);
                    return { verified: cacheValue.verified, authors: cacheValue.authors };
                }
            }
        } catch {
            // Silently fail
        }
        return {};
    }

    /**
     * Simple version comparison - returns true if version1 is newer than version2
     */
    private isNewerVersion(version1: string, version2: string): boolean {
        // Normalize versions for comparison
        const v1 = version1.toLowerCase();
        const v2 = version2.toLowerCase();

        if (v1 === v2) { return false; }

        // Parse version parts
        const parseVersion = (v: string) => {
            const [main, prerelease] = v.split('-');
            const parts = main.split('.').map(p => parseInt(p, 10) || 0);
            return { parts, prerelease: prerelease || null };
        };

        const parsed1 = parseVersion(v1);
        const parsed2 = parseVersion(v2);

        // Compare main version parts
        const maxLen = Math.max(parsed1.parts.length, parsed2.parts.length);
        for (let i = 0; i < maxLen; i++) {
            const p1 = parsed1.parts[i] || 0;
            const p2 = parsed2.parts[i] || 0;
            if (p1 > p2) { return true; }
            if (p1 < p2) { return false; }
        }

        // Main versions are equal, check prerelease
        // A stable version is considered newer than a prerelease of the same version
        if (!parsed1.prerelease && parsed2.prerelease) { return true; }
        if (parsed1.prerelease && !parsed2.prerelease) { return false; }

        // Both are prerelease, compare lexicographically
        if (parsed1.prerelease && parsed2.prerelease) {
            return parsed1.prerelease > parsed2.prerelease;
        }

        return false;
    }

    private fetchText(url: string, authHeader?: string): Promise<string | undefined> {
        return new Promise((resolve) => {
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
                headers
            };

            const req = client.request(options, (res) => {
                // Handle redirects - preserve auth header for same-origin redirects
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl) {
                        try {
                            const redirectParsed = new URL(redirectUrl, url);
                            const sameOrigin = redirectParsed.origin === parsed.origin;
                            this.fetchText(redirectParsed.href, sameOrigin ? authHeader : undefined).then(resolve);
                        } catch {
                            this.fetchText(redirectUrl, undefined).then(resolve);
                        }
                        return;
                    }
                }
                if (res.statusCode !== 200) {
                    resolve(undefined);
                    return;
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
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
    private fetchJsonWithDetails<T>(url: string, authHeader?: string, timeoutMs?: number): Promise<FetchResult<T>> {
        return new Promise((resolve) => {
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
                // Handle redirects
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl) {
                        // Preserve auth header on same-origin redirects only
                        const redirectParsed = new URL(redirectUrl, url);
                        const sameOrigin = redirectParsed.origin === parsed.origin;
                        this.fetchJsonWithDetails<T>(redirectUrl, sameOrigin ? authHeader : undefined, timeoutMs).then(resolve);
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

    private fetchJsonHttp1<T>(url: string, authHeader?: string): Promise<T | null> {
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
                // Handle redirects
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl) {
                        // Preserve auth header on same-origin redirects only
                        const redirectParsed = new URL(redirectUrl, url);
                        const sameOrigin = redirectParsed.origin === parsed.origin;
                        this.fetchJsonHttp1<T>(redirectUrl, sameOrigin ? authHeader : undefined).then(resolve);
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
                    if (entry.entryName.toLowerCase().endsWith('.nuspec')) {
                        const nuspecContent = entry.getData().toString('utf8');
                        const readmeMatch = nuspecContent.match(/<readme>([^<]+)<\/readme>/i);
                        if (readmeMatch) {
                            readmePath = readmeMatch[1].trim();
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
    private downloadFile(url: string, destPath: string): Promise<boolean> {
        return new Promise((resolve) => {
            const client = url.startsWith('https://') ? https : http;
            const file = fs.createWriteStream(destPath);

            client.get(url, (res) => {
                // Handle redirects
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl) {
                        file.close();
                        this.downloadFile(redirectUrl, destPath).then(resolve);
                        return;
                    }
                }

                if (res.statusCode !== 200) {
                    file.close();
                    resolve(false);
                    return;
                }

                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(true);
                });
            }).on('error', () => {
                file.close();
                try { fs.unlinkSync(destPath); } catch { /* ignore */ }
                resolve(false);
            });
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
                        dependedOnBy.get(depIdLower)!.add(packageId);
                    }
                }
            }

            // Build full chain for each transitive package (recursive)
            const buildChain = (packageId: string, visited: Set<string> = new Set()): string[] => {
                const chain: string[] = [];
                const parents = dependedOnBy.get(packageId.toLowerCase());

                if (!parents || parents.size === 0) {
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
        await batchedPromiseAll(packages, async (pkg) => {
            // Fetch icon (cached)
            const iconUrl = `https://api.nuget.org/v3-flatcontainer/${pkg.id.toLowerCase()}/${pkg.version.toLowerCase()}/icon`;
            const iconExists = await this.checkIconExists(pkg.id, pkg.version, iconUrl);
            if (iconExists) {
                pkg.iconUrl = iconUrl;
            }

            // Fetch verified status and authors (cached)
            const { verified, authors } = await this.getPackageVerifiedAndAuthors(pkg.id);
            if (verified !== undefined) {
                pkg.verified = verified;
            }
            if (authors) {
                pkg.authors = authors;
            }
        }, 8); // Limit to 8 concurrent requests
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

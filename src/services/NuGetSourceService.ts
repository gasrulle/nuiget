import * as fs from 'fs';
import * as vscode from 'vscode';
import { NuGetConfigParser } from './NuGetConfigParser';
import { NuGetLogger } from './NuGetLogger';
import { NuGetSource } from './NuGetTypes';
import { execWithTimeout, isExecError, isValidCredentialValue, isValidSourceName, isValidSourceUrl } from './NuGetUtils';

/**
 * NuGetSourceService — Manages NuGet source CRUD operations, caching,
 * config file access, and source name generation.
 *
 * Extracted from NuGetService to separate source management concerns
 * from package search, metadata, and project operations.
 */
export class NuGetSourceService {
    private readonly configParser: NuGetConfigParser;
    private readonly logger: NuGetLogger;
    private readonly _onSourceMutated: () => void;

    // Cache for getSources() to avoid repeated CLI spawns
    private _sourcesCache: NuGetSource[] | null = null;
    private _sourcesCacheTime: number = 0;
    private static readonly SOURCES_CACHE_TTL = 30000; // 30 seconds

    /**
     * @param configParser — Shared NuGetConfigParser instance
     * @param logger — Shared NuGetLogger instance
     * @param onSourceMutated — Callback invoked after add/remove/enable/disable to
     *   let the facade invalidate downstream caches and restart health monitoring
     */
    constructor(configParser: NuGetConfigParser, logger: NuGetLogger, onSourceMutated: () => void) {
        this.configParser = configParser;
        this.logger = logger;
        this._onSourceMutated = onSourceMutated;
    }

    /**
     * Get all configured NuGet sources (cached for 30 seconds).
     */
    async getSources(): Promise<NuGetSource[]> {
        const now = Date.now();
        if (this._sourcesCache && (now - this._sourcesCacheTime) < NuGetSourceService.SOURCES_CACHE_TTL) {
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
     * Enable a NuGet source by name.
     */
    async enableSource(sourceName: string): Promise<boolean> {
        return this._configureSource('enable', sourceName);
    }

    /**
     * Disable a NuGet source by name.
     */
    async disableSource(sourceName: string): Promise<boolean> {
        return this._configureSource('disable', sourceName);
    }

    /**
     * Enable or disable a NuGet source by name.
     */
    private async _configureSource(action: 'enable' | 'disable', sourceName: string): Promise<boolean> {
        if (!isValidSourceName(sourceName)) {
            vscode.window.showErrorMessage(`Invalid source name: "${sourceName}". Names must contain only letters, numbers, dots, underscores, hyphens, and spaces.`);
            return false;
        }
        const pastTense = action === 'enable' ? 'Enabled' : 'Disabled';
        this.logger.setupOutputChannel(true);
        const command = `dotnet nuget ${action} source "${sourceName}"`;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        try {
            const { stdout, stderr } = await execWithTimeout(command, { cwd: workspaceFolder });
            this.logger.logOutput(command, stdout, stderr, true);
            this.logger.logSuccess(`${pastTense} source: ${sourceName}`);
            this.invalidateSourcesCache();
            this._onSourceMutated();
            return true;
        } catch (error) {
            const errorOutput = isExecError(error) ? (error.stderr || error.stdout || String(error)) : String(error);
            this.logger.logOutput(command, isExecError(error) ? (error.stdout || '') : '', isExecError(error) ? (error.stderr || '') : '', false);
            this.logger.logError(`Failed to ${action} source "${sourceName}": ${errorOutput}`);
            vscode.window.showErrorMessage(`Failed to ${action} source "${sourceName}": ${errorOutput}`);
            return false;
        }
    }

    /**
     * Add a new NuGet source.
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
        if (!isValidSourceUrl(url)) {
            return { success: false, error: 'Invalid source URL. Please enter a valid HTTP, HTTPS, or file path.' };
        }
        if (name && !isValidSourceName(name)) {
            return { success: false, error: 'Invalid source name. Names must contain only letters, numbers, dots, underscores, hyphens, and spaces.' };
        }
        if (username && !isValidCredentialValue(username)) {
            return { success: false, error: 'Invalid username. Must not contain double quotes, backticks, dollar signs, backslashes, or control characters.' };
        }
        if (password && !isValidCredentialValue(password)) {
            return { success: false, error: 'Invalid password. Must not contain double quotes, backticks, dollar signs, backslashes, or control characters.' };
        }

        this.logger.setupOutputChannel(true);

        // If configFile is specified but doesn't exist, create a minimal nuget.config
        if (configFile) {
            try {
                await fs.promises.access(configFile, fs.constants.F_OK);
            } catch {
                const minimalConfig = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
  </packageSources>
</configuration>
`;
                try {
                    await fs.promises.writeFile(configFile, minimalConfig, 'utf8');
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
            this.logger.logOutput(command, stdout, stderr, true);
            this.logger.logSuccess(`Added source: ${name || url}`);
            this.invalidateSourcesCache();
            this._onSourceMutated();
            return { success: true };
        } catch (error) {
            const errorOutput = isExecError(error) ? (error.stderr || error.stdout || String(error)) : String(error);
            this.logger.logOutput(command, isExecError(error) ? (error.stdout || '') : '', isExecError(error) ? (error.stderr || '') : '', false);
            this.logger.logError(`Failed to add source: ${errorOutput}`);

            if (errorOutput.includes('already been added') || errorOutput.includes('already exists')) {
                return { success: false, error: 'A source with this name already exists.' };
            }

            return { success: false, error: errorOutput };
        }
    }

    /**
     * Remove a NuGet source by name.
     */
    async removeSource(sourceName: string, configFile?: string): Promise<{ success: boolean; error?: string }> {
        if (!isValidSourceName(sourceName)) {
            return { success: false, error: 'Invalid source name. Names must contain only letters, numbers, dots, underscores, hyphens, and spaces.' };
        }

        this.logger.setupOutputChannel(true);
        let command = `dotnet nuget remove source "${sourceName}"`;

        if (configFile) {
            command += ` --configfile "${configFile}"`;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        try {
            const { stdout, stderr } = await execWithTimeout(command, { cwd: workspaceFolder });
            this.logger.logOutput(command, stdout, stderr, true);
            this.logger.logSuccess(`Removed source: ${sourceName}`);
            this.invalidateSourcesCache();
            this._onSourceMutated();
            return { success: true };
        } catch (error) {
            const errorOutput = isExecError(error) ? (error.stderr || error.stdout || String(error)) : String(error);
            this.logger.logOutput(command, isExecError(error) ? (error.stdout || '') : '', isExecError(error) ? (error.stderr || '') : '', false);
            this.logger.logError(`Failed to remove source "${sourceName}": ${errorOutput}`);

            if (errorOutput.includes('Unable to find') || errorOutput.includes('does not exist')) {
                return { success: false, error: 'Source not found. It may have already been removed.' };
            }

            return { success: false, error: errorOutput };
        }
    }

    /**
     * Get available NuGet config file paths.
     */
    getConfigFilePaths(): { label: string; path: string }[] {
        return this.configParser.getConfigFilePaths();
    }

    /**
     * Check if a source URL is a local file path (not an HTTP endpoint).
     */
    isLocalSource(sourceUrl: string): boolean {
        return !sourceUrl.startsWith('http://') && !sourceUrl.startsWith('https://');
    }

    /**
     * Generate a friendly source name from a URL or local path.
     * Handles Azure DevOps, JFrog, GitHub Packages, MyGet, and generic URLs.
     * Appends -2, -3, etc. to avoid duplicate names.
     */
    generateSourceNameFromUrl(url: string, existingNames: Set<string>): string {
        let baseName = 'custom-source';

        try {
            if (this.isLocalSource(url)) {
                const normalized = url.replace(/\\/g, '/');
                const segments = normalized.split('/').filter(s => s && !s.includes(':'));
                if (segments.length > 0) {
                    baseName = segments[segments.length - 1];
                }
            } else {
                const parsed = new URL(url);
                const hostname = parsed.hostname.toLowerCase();
                const pathSegments = parsed.pathname.split('/').filter(s => s && s !== 'index.json');

                if (hostname.includes('nuget.org')) {
                    baseName = 'nuget.org';
                }
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
                else if (hostname.includes('jfrog.io') || pathSegments.includes('artifactory')) {
                    const hostPrefix = hostname.split('.')[0];
                    const meaningfulSegments = pathSegments.filter(s =>
                        !['artifactory', 'api', 'nuget', 'v2', 'v3'].includes(s.toLowerCase())
                    );
                    if (meaningfulSegments.length > 0) {
                        baseName = `${hostPrefix}-${meaningfulSegments[meaningfulSegments.length - 1]}`;
                    } else {
                        baseName = hostPrefix;
                    }
                }
                else if (hostname.includes('github.com')) {
                    if (pathSegments.length > 0) {
                        baseName = `github-${pathSegments[0]}`;
                    } else {
                        baseName = 'github';
                    }
                }
                else if (hostname.includes('myget.org')) {
                    const fIndex = pathSegments.indexOf('F');
                    if (fIndex !== -1 && pathSegments[fIndex + 1]) {
                        baseName = `myget-${pathSegments[fIndex + 1]}`;
                    } else {
                        baseName = 'myget';
                    }
                }
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
            baseName = 'custom-source';
        }

        baseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (!baseName) {
            baseName = 'custom-source';
        }

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
}

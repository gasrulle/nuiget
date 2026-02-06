import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

/**
 * Credentials for a NuGet source
 */
export interface SourceCredentials {
    username: string;
    password: string;
    /** Source of the credentials for debugging */
    source: 'nuget-config' | 'credential-provider' | 'env-var';
}

/**
 * Credential acquisition result
 */
export interface CredentialResult {
    credentials: SourceCredentials | null;
    /** If credentials couldn't be acquired, this explains why */
    error?: {
        type: 'not-found' | 'decrypt-failed' | 'provider-not-installed' | 'provider-needs-interactive' | 'unknown';
        message: string;
        /** For provider-needs-interactive, user should run this command */
        suggestedAction?: string;
    };
}

/**
 * Cached credential entry
 */
interface CachedCredential {
    result: CredentialResult;
    timestamp: number;
}

/**
 * Service for acquiring credentials for authenticated NuGet feeds.
 *
 * Priority order:
 * 1. nuget.config <packageSourceCredentials> (supports ClearTextPassword, encrypted Password, and %ENV_VAR%)
 * 2. Azure Artifacts Credential Provider (non-interactive mode only)
 *
 * On Windows, encrypted passwords are decrypted using DPAPI via PowerShell.
 */
export class CredentialService {
    private static instance: CredentialService;

    // Cache of credentials by source URL (case-insensitive)
    private credentialCache: Map<string, CachedCredential> = new Map();

    // Cache TTL: 30 minutes for successful credentials, 5 minutes for failures
    private static readonly SUCCESS_TTL = 30 * 60 * 1000;
    private static readonly FAILURE_TTL = 5 * 60 * 1000;

    // Credential provider paths (discovered once)
    private credentialProviderPath: string | null | undefined = undefined; // undefined = not checked yet

    private outputChannel: vscode.LogOutputChannel | null = null;

    private constructor() { }

    public static getInstance(): CredentialService {
        if (!CredentialService.instance) {
            CredentialService.instance = new CredentialService();
        }
        return CredentialService.instance;
    }

    /**
     * Set output channel for logging
     */
    public setOutputChannel(channel: vscode.LogOutputChannel): void {
        this.outputChannel = channel;
    }

    /**
     * Log a message to the output channel
     */
    private log(level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
        if (!this.outputChannel) {
            return;
        }
        switch (level) {
            case 'info':
                this.outputChannel.info(message);
                break;
            case 'warn':
                this.outputChannel.warn(message);
                break;
            case 'error':
                this.outputChannel.error(message);
                break;
            case 'debug':
                this.outputChannel.debug(message);
                break;
        }
    }

    /**
     * Get credentials for a NuGet source URL.
     * Returns cached credentials if available and not expired.
     *
     * @param sourceUrl The NuGet source URL (e.g., https://pkgs.dev.azure.com/...)
     * @param sourceName Optional source name for nuget.config lookup
     * @param nugetConfigCredentials Pre-parsed credentials from nuget.config (pass to avoid re-parsing)
     */
    public async getCredentials(
        sourceUrl: string,
        sourceName?: string,
        nugetConfigCredentials?: Map<string, { username?: string; password?: string; isEncrypted: boolean }>
    ): Promise<CredentialResult> {
        const cacheKey = sourceUrl.toLowerCase();

        // Check cache first
        const cached = this.credentialCache.get(cacheKey);
        if (cached) {
            const ttl = cached.result.credentials ? CredentialService.SUCCESS_TTL : CredentialService.FAILURE_TTL;
            if (Date.now() - cached.timestamp < ttl) {
                return cached.result;
            }
            // Expired, remove from cache
            this.credentialCache.delete(cacheKey);
        }

        // Try to acquire credentials
        const result = await this.acquireCredentials(sourceUrl, sourceName, nugetConfigCredentials);

        // Cache the result
        this.credentialCache.set(cacheKey, {
            result,
            timestamp: Date.now()
        });

        return result;
    }

    /**
     * Prewarm credentials for multiple sources in parallel.
     * Fire-and-forget - does not block.
     */
    public prewarmCredentials(
        sources: Array<{ url: string; name: string }>,
        nugetConfigCredentials?: Map<string, { username?: string; password?: string; isEncrypted: boolean }>
    ): void {
        // Run all in parallel, don't await
        for (const source of sources) {
            this.getCredentials(source.url, source.name, nugetConfigCredentials).catch(() => {
                // Silently ignore prewarm failures
            });
        }
    }

    /**
     * Clear cached credentials (call when sources change)
     */
    public clearCache(): void {
        this.credentialCache.clear();
    }

    /**
     * Acquire credentials from available sources (not from cache)
     */
    private async acquireCredentials(
        sourceUrl: string,
        sourceName?: string,
        nugetConfigCredentials?: Map<string, { username?: string; password?: string; isEncrypted: boolean }>
    ): Promise<CredentialResult> {
        // 1. Try nuget.config credentials first
        if (nugetConfigCredentials && sourceName) {
            const configCreds = nugetConfigCredentials.get(sourceName);
            if (configCreds && configCreds.password) {
                try {
                    let password = configCreds.password;

                    // Resolve environment variables (%VAR% syntax)
                    password = this.resolveEnvVars(password);

                    // Decrypt if encrypted (Windows only)
                    if (configCreds.isEncrypted) {
                        const decrypted = await this.decryptDpapi(password);
                        if (decrypted) {
                            password = decrypted;
                        } else {
                            this.log('warn', `Failed to decrypt password for source "${sourceName}"`);
                            // Fall through to credential provider
                        }
                    }

                    if (password && !password.startsWith('%')) { // Not an unresolved env var
                        this.log('debug', `Using nuget.config credentials for "${sourceName}"`);
                        return {
                            credentials: {
                                username: configCreds.username || 'VssSessionToken',
                                password,
                                source: 'nuget-config'
                            }
                        };
                    }
                } catch (error) {
                    this.log('warn', `Error processing credentials for "${sourceName}": ${error}`);
                }
            }
        }

        // 2. Try Azure Artifacts Credential Provider (non-interactive)
        const providerResult = await this.tryCredentialProvider(sourceUrl);
        if (providerResult.credentials) {
            return providerResult;
        }

        // 3. Check for ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS (JSON format)
        // Per Azure Artifacts Credential Provider docs: preferred for automated scenarios
        const externalEndpoints = await this.tryExternalFeedEndpoints(sourceUrl);
        if (externalEndpoints.credentials) {
            return externalEndpoints;
        }

        // 4. Check for environment variable token (ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN)
        const envToken = process.env.ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN
            || process.env.VSS_NUGET_ACCESSTOKEN;
        if (envToken && this.isAzureArtifactsUrl(sourceUrl)) {
            this.log('debug', `Using environment variable token for Azure Artifacts`);
            return {
                credentials: {
                    username: 'VssSessionToken',
                    password: envToken,
                    source: 'env-var'
                }
            };
        }

        // No credentials found
        return providerResult; // Contains error info from credential provider attempt
    }

    /**
     * Resolve %ENV_VAR% placeholders in a string
     */
    private resolveEnvVars(value: string): string {
        return value.replace(/%([^%]+)%/g, (_, varName) => {
            return process.env[varName] || `%${varName}%`;
        });
    }

    /**
     * Validate that a string is valid base64 format.
     * Prevents injection attacks by ensuring input contains only safe characters.
     */
    private isValidBase64(value: string): boolean {
        // base64 only contains: A-Z, a-z, 0-9, +, /, and = for padding
        return /^[A-Za-z0-9+/]+=*$/.test(value) && value.length > 0;
    }

    /**
     * Decrypt a DPAPI-encrypted password using PowerShell (Windows only)
     */
    private async decryptDpapi(encryptedBase64: string): Promise<string | null> {
        if (process.platform !== 'win32') {
            this.log('debug', 'DPAPI decryption only available on Windows');
            return null;
        }

        // Validate base64 format to prevent PowerShell command injection
        if (!this.isValidBase64(encryptedBase64)) {
            this.log('warn', 'Invalid base64 format in encrypted password - possible injection attempt');
            return null;
        }

        try {
            // PowerShell command to decrypt using DPAPI
            // The encrypted password in nuget.config is base64-encoded cipher text
            const psCommand = `
                Add-Type -AssemblyName System.Security
                $encrypted = [Convert]::FromBase64String('${encryptedBase64}')
                $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
                [System.Text.Encoding]::UTF8.GetString($decrypted)
            `.replace(/\n/g, ' ');

            const { stdout } = await execAsync(`powershell -NoProfile -Command "${psCommand}"`, {
                timeout: 5000
            });

            return stdout.trim();
        } catch (error) {
            this.log('debug', `DPAPI decryption failed: ${error}`);
            return null;
        }
    }

    /**
     * Validate URL format for safe use in shell commands.
     * Allows only standard URL characters to prevent injection.
     */
    private isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            // Only allow http/https protocols
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return false;
            }
            // Reject URLs with shell-dangerous characters in host/path
            // Allow standard URL chars: alphanumeric, -, ., _, ~, :, /, ?, #, [, ], @, !, $, &, ', (, ), *, +, ,, ;, =, %
            const dangerousChars = /["'`\\|><;{}\r\n\t]/;
            return !dangerousChars.test(url);
        } catch {
            return false;
        }
    }

    /**
     * Try to get credentials from Azure Artifacts Credential Provider
     */
    private async tryCredentialProvider(sourceUrl: string): Promise<CredentialResult> {
        // Validate URL format to prevent command injection
        if (!this.isValidUrl(sourceUrl)) {
            this.log('warn', `Invalid URL format for credential provider: ${sourceUrl}`);
            return {
                credentials: null,
                error: {
                    type: 'unknown',
                    message: 'Invalid URL format'
                }
            };
        }

        // Only try for Azure Artifacts URLs or explicit supported hosts
        if (!this.isAzureArtifactsUrl(sourceUrl) && !this.isSupportedCredentialProviderHost(sourceUrl)) {
            return {
                credentials: null,
                error: {
                    type: 'not-found',
                    message: 'No credentials configured for this source'
                }
            };
        }

        // Find credential provider
        const providerPath = await this.findCredentialProvider();
        if (!providerPath) {
            return {
                credentials: null,
                error: {
                    type: 'provider-not-installed',
                    message: 'Azure Artifacts Credential Provider not installed'
                }
            };
        }

        try {
            // Run credential provider in non-interactive mode with JSON output
            // -N = non-interactive, -F Json = JSON output format
            const command = `"${providerPath}" -U "${sourceUrl}" -N -F Json`;

            this.log('debug', `Invoking credential provider for ${sourceUrl}`);

            const { stdout } = await execAsync(command, {
                timeout: 10000,
                env: {
                    ...process.env,
                    // Disable session token cache check to get fresh tokens
                    // NUGET_CREDENTIALPROVIDER_SESSIONTOKENCACHE_ENABLED: 'false'
                }
            });

            // Parse JSON response
            // Format: {"Username":"...","Password":"..."}
            const response = JSON.parse(stdout.trim());

            if (response.Username && response.Password) {
                this.log('debug', `Credential provider returned credentials for ${sourceUrl}`);
                return {
                    credentials: {
                        username: response.Username,
                        password: response.Password,
                        source: 'credential-provider'
                    }
                };
            }

            // Provider returned but no credentials
            return {
                credentials: null,
                error: {
                    type: 'provider-needs-interactive',
                    message: 'Authentication required. Please run "dotnet restore --interactive" in the terminal to authenticate.',
                    suggestedAction: 'dotnet restore --interactive'
                }
            };
        } catch (error: any) {
            // Check if it's an interactive auth requirement
            const errorMsg = error.stderr || error.message || String(error);

            if (errorMsg.includes('interactive') || errorMsg.includes('device flow') || errorMsg.includes('login')) {
                return {
                    credentials: null,
                    error: {
                        type: 'provider-needs-interactive',
                        message: 'Authentication required. Please run "dotnet restore --interactive" in the terminal to authenticate.',
                        suggestedAction: 'dotnet restore --interactive'
                    }
                };
            }

            this.log('debug', `Credential provider error: ${errorMsg}`);
            return {
                credentials: null,
                error: {
                    type: 'unknown',
                    message: `Credential provider failed: ${errorMsg}`
                }
            };
        }
    }

    /**
     * Try to get credentials from ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS
     * This is the preferred method for automated scenarios per Azure Artifacts docs.
     * Format: {"endpointCredentials": [{"endpoint":"http://example.index.json","username":"optional","password":"accesstoken"}]}
     */
    private async tryExternalFeedEndpoints(sourceUrl: string): Promise<CredentialResult> {
        const endpointsJson = process.env.ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS
            || process.env.VSS_NUGET_EXTERNAL_FEED_ENDPOINTS;

        if (!endpointsJson) {
            return { credentials: null };
        }

        try {
            const config = JSON.parse(endpointsJson);
            const endpointCredentials = config.endpointCredentials;

            if (!Array.isArray(endpointCredentials)) {
                return { credentials: null };
            }

            const lowerSourceUrl = sourceUrl.toLowerCase();

            for (const endpoint of endpointCredentials) {
                if (!endpoint.endpoint) {
                    continue;
                }

                // Check if the source URL matches or starts with the endpoint URL
                const lowerEndpoint = endpoint.endpoint.toLowerCase();
                if (lowerSourceUrl === lowerEndpoint ||
                    lowerSourceUrl.startsWith(lowerEndpoint.replace(/\/$/, '') + '/') ||
                    lowerEndpoint.startsWith(lowerSourceUrl.replace(/\/$/, '') + '/')) {

                    if (endpoint.password) {
                        this.log('debug', `Using external feed endpoints credentials for ${sourceUrl}`);
                        return {
                            credentials: {
                                username: endpoint.username || 'VssSessionToken',
                                password: endpoint.password,
                                source: 'env-var'
                            }
                        };
                    }
                }
            }

            return { credentials: null };
        } catch (error) {
            this.log('debug', `Failed to parse ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS: ${error}`);
            return { credentials: null };
        }
    }

    /**
     * Find the Azure Artifacts Credential Provider executable
     */
    private async findCredentialProvider(): Promise<string | null> {
        // Return cached result if already checked
        if (this.credentialProviderPath !== undefined) {
            return this.credentialProviderPath;
        }

        const candidates: string[] = [];
        const userProfile = os.homedir();

        if (process.platform === 'win32') {
            // Windows: check netfx and netcore locations
            candidates.push(
                path.join(userProfile, '.nuget', 'plugins', 'netfx', 'CredentialProvider.Microsoft', 'CredentialProvider.Microsoft.exe'),
                path.join(userProfile, '.nuget', 'plugins', 'netcore', 'CredentialProvider.Microsoft', 'CredentialProvider.Microsoft.exe')
            );
        } else {
            // Linux/macOS: netcore only
            candidates.push(
                path.join(userProfile, '.nuget', 'plugins', 'netcore', 'CredentialProvider.Microsoft', 'CredentialProvider.Microsoft.dll')
            );
        }

        // Check environment variable overrides (NuGet 5.3+ priority order)
        // Per Microsoft docs: NUGET_NETFX_PLUGIN_PATHS and NUGET_NETCORE_PLUGIN_PATHS take precedence
        if (process.platform === 'win32') {
            // For Windows, check framework-specific path first
            const netfxPaths = process.env.NUGET_NETFX_PLUGIN_PATHS;
            if (netfxPaths) {
                candidates.unshift(...netfxPaths.split(path.delimiter));
            }
        }

        // Check .NET Core specific paths (cross-platform)
        const netcorePaths = process.env.NUGET_NETCORE_PLUGIN_PATHS;
        if (netcorePaths) {
            candidates.unshift(...netcorePaths.split(path.delimiter));
        }

        // Fallback to NUGET_PLUGIN_PATHS (used if framework-specific vars not set)
        const pluginPaths = process.env.NUGET_PLUGIN_PATHS;
        if (pluginPaths && !netcorePaths && !(process.platform === 'win32' && process.env.NUGET_NETFX_PLUGIN_PATHS)) {
            candidates.unshift(...pluginPaths.split(path.delimiter));
        }

        // Find first existing provider
        for (const candidate of candidates) {
            try {
                await fs.promises.access(candidate, fs.constants.F_OK);
                this.credentialProviderPath = candidate;

                // On Linux/macOS, we need to run the .dll with dotnet
                if (candidate.endsWith('.dll')) {
                    this.credentialProviderPath = `dotnet "${candidate}"`;
                }

                this.log('debug', `Found credential provider at: ${candidate}`);
                return this.credentialProviderPath;
            } catch {
                // Not found, continue
            }
        }

        this.credentialProviderPath = null;
        this.log('debug', 'Azure Artifacts Credential Provider not found');
        return null;
    }

    /**
     * Check if URL is an Azure Artifacts/Azure DevOps URL
     */
    private isAzureArtifactsUrl(url: string): boolean {
        const lowerUrl = url.toLowerCase();
        return lowerUrl.includes('pkgs.dev.azure.com')
            || lowerUrl.includes('.pkgs.visualstudio.com')
            || lowerUrl.includes('/_packaging/');
    }

    /**
     * Check if URL is a supported credential provider host
     * (can be extended via environment variable)
     */
    private isSupportedCredentialProviderHost(url: string): boolean {
        const supportedHosts = process.env.ARTIFACTS_CREDENTIALPROVIDER_HOSTS
            || process.env.NUGET_CREDENTIALPROVIDER_VSTS_HOSTS;

        if (!supportedHosts) {
            return false;
        }

        const lowerUrl = url.toLowerCase();
        return supportedHosts.split(';').some(host => lowerUrl.includes(host.toLowerCase()));
    }

    /**
     * Create Basic auth header value from credentials
     */
    public static createBasicAuthHeader(credentials: SourceCredentials): string {
        const combined = `${credentials.username}:${credentials.password}`;
        const base64 = Buffer.from(combined).toString('base64');
        return `Basic ${base64}`;
    }
}

// Export singleton instance
export const credentialService = CredentialService.getInstance();

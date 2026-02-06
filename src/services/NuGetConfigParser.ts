import { exec } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

const readFileAsync = promisify(fs.readFile);
const execAsync = promisify(exec);

export interface NuGetSource {
    name: string;
    url: string;
    enabled: boolean;
    configFile?: string;
}

export class NuGetConfigParser {
    private parser: XMLParser;

    constructor() {
        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            // Disable entity processing - nuget.config doesn't use XML entities
            // Also mitigates CVE for malicious entity code points (e.g., &#9999999;)
            processEntities: false
        });
    }

    async getSources(): Promise<NuGetSource[]> {
        const sources: NuGetSource[] = [];

        // Try to get sources from dotnet CLI (includes all configs and credentials)
        // Run from workspace folder to pick up workspace-level nuget.config files
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        try {
            const { stdout } = await execAsync('dotnet nuget list source --format detailed',
                { cwd: workspaceFolder, encoding: 'utf8' });
            const lines = stdout.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Match lines like: "  1.  nuget.org [Enabled]"
                const sourceMatch = line.match(/^\s+(\d+)\.\s\s(.+?)\s+\[(Enabled|Disabled)\]/);
                if (sourceMatch) {
                    const name = sourceMatch[2].trim();
                    const enabled = sourceMatch[3] === 'Enabled';
                    // URL is on the next line, indented
                    const urlLine = lines[i + 1];
                    if (urlLine) {
                        const url = urlLine.trim();
                        if (url) {
                            sources.push({
                                name: name,
                                url: url,
                                enabled: enabled
                            });
                        }
                    }
                }
            }

            // Build a map of source names to config files by parsing all configs
            // This tells us which config file each source belongs to
            if (sources.length > 0) {
                const configSourceMap = await this.buildSourceConfigMap();
                for (const source of sources) {
                    if (configSourceMap.has(source.name)) {
                        source.configFile = configSourceMap.get(source.name);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to get sources from dotnet CLI:', error);
        }

        // If CLI fails, fallback to parsing config files
        if (sources.length === 0) {
            const configSources = await this.parseConfigFiles();
            sources.push(...configSources);
        }

        return sources;
    }

    /**
     * Build a map of source names to their config file paths
     * Used to determine which config file a source belongs to for removal
     */
    private async buildSourceConfigMap(): Promise<Map<string, string>> {
        const sourceConfigMap = new Map<string, string>();
        const configPaths = await this.findNuGetConfigs();

        for (const configPath of configPaths) {
            try {
                const sources = await this.parseConfigFile(configPath);
                for (const source of sources) {
                    // Don't overwrite - first config file wins (matches NuGet precedence)
                    if (!sourceConfigMap.has(source.name)) {
                        sourceConfigMap.set(source.name, configPath);
                    }
                }
            } catch (error) {
                console.error(`Failed to parse ${configPath}:`, error);
            }
        }

        return sourceConfigMap;
    }

    private async parseConfigFiles(): Promise<NuGetSource[]> {
        const sources: NuGetSource[] = [];
        const configPaths = await this.findNuGetConfigs();

        for (const configPath of configPaths) {
            try {
                const configSources = await this.parseConfigFile(configPath);
                sources.push(...configSources);
            } catch (error) {
                console.error(`Failed to parse ${configPath}:`, error);
            }
        }

        return sources;
    }

    private async findNuGetConfigs(): Promise<string[]> {
        const configs: string[] = [];

        // User-level config
        const userProfile = process.env.USERPROFILE || process.env.HOME || '';
        if (userProfile) {
            const userConfig = path.join(userProfile, '.nuget', 'NuGet', 'NuGet.Config');
            if (await this.fileExists(userConfig)) {
                configs.push(userConfig);
            }

            // Also check AppData location on Windows
            if (process.platform === 'win32') {
                const appDataConfig = path.join(userProfile, 'AppData', 'Roaming', 'NuGet', 'NuGet.Config');
                if (await this.fileExists(appDataConfig)) {
                    configs.push(appDataConfig);
                }
            }
        }

        // Workspace-level configs
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                const workspaceConfig = path.join(folder.uri.fsPath, 'nuget.config');
                if (await this.fileExists(workspaceConfig)) {
                    configs.push(workspaceConfig);
                }

                // Also check NuGet.Config (capitalized)
                const workspaceConfigAlt = path.join(folder.uri.fsPath, 'NuGet.Config');
                if (await this.fileExists(workspaceConfigAlt)) {
                    configs.push(workspaceConfigAlt);
                }
            }
        }

        return configs;
    }

    /**
     * Get available NuGet config file paths for UI dropdown
     * Returns paths for user-level and any workspace-level config files
     */
    getConfigFilePaths(): { label: string; path: string }[] {
        const configs: { label: string; path: string }[] = [];

        // User-level config (always available, even if file doesn't exist yet)
        const userProfile = process.env.USERPROFILE || process.env.HOME || '';
        if (userProfile) {
            if (process.platform === 'win32') {
                const appDataConfig = path.join(userProfile, 'AppData', 'Roaming', 'NuGet', 'NuGet.Config');
                configs.push({ label: 'User (AppData)', path: appDataConfig });
            } else {
                const userConfig = path.join(userProfile, '.nuget', 'NuGet', 'NuGet.Config');
                configs.push({ label: 'User', path: userConfig });
            }
        }

        // Workspace-level configs
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                const folderName = path.basename(folder.uri.fsPath);
                // Check for existing config files (prefer lowercase)
                const workspaceConfig = path.join(folder.uri.fsPath, 'nuget.config');

                // Add workspace option (prefer lowercase, will be created if doesn't exist)
                configs.push({ label: `Workspace: ${folderName}`, path: workspaceConfig });
            }
        }

        return configs;
    }

    private async parseConfigFile(configPath: string): Promise<NuGetSource[]> {
        const sources: NuGetSource[] = [];

        try {
            const content = await readFileAsync(configPath, 'utf-8');
            const config = this.parser.parse(content);

            if (config.configuration?.packageSources?.add) {
                const addElements = Array.isArray(config.configuration.packageSources.add)
                    ? config.configuration.packageSources.add
                    : [config.configuration.packageSources.add];

                for (const add of addElements) {
                    if (add['@_key'] && add['@_value']) {
                        sources.push({
                            name: add['@_key'],
                            url: add['@_value'],
                            enabled: true,
                            configFile: configPath
                        });
                    }
                }
            }

            // Check for disabled sources
            if (config.configuration?.disabledPackageSources?.add) {
                const disabledElements = Array.isArray(config.configuration.disabledPackageSources.add)
                    ? config.configuration.disabledPackageSources.add
                    : [config.configuration.disabledPackageSources.add];

                for (const disabled of disabledElements) {
                    const sourceName = disabled['@_key'];
                    const source = sources.find(s => s.name === sourceName);
                    if (source) {
                        source.enabled = false;
                    }
                }
            }
        } catch (error) {
            console.error(`Error parsing config file ${configPath}:`, error);
        }

        return sources;
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get credentials for all sources from nuget.config files.
     * Parses <packageSourceCredentials> section.
     *
     * @returns Map of source name -> { username, password, isEncrypted }
     *
     * nuget.config format:
     * <packageSourceCredentials>
     *   <MySource>
     *     <add key="Username" value="user" />
     *     <add key="ClearTextPassword" value="pass" />  <!-- or Password for encrypted -->
     *   </MySource>
     * </packageSourceCredentials>
     */
    async getCredentials(): Promise<Map<string, { username?: string; password?: string; isEncrypted: boolean }>> {
        const credentials = new Map<string, { username?: string; password?: string; isEncrypted: boolean }>();
        const configPaths = await this.findNuGetConfigs();

        for (const configPath of configPaths) {
            try {
                const configCredentials = await this.parseCredentialsFromConfig(configPath);
                // Merge - first config file wins (matches NuGet precedence)
                for (const [name, creds] of configCredentials) {
                    if (!credentials.has(name)) {
                        credentials.set(name, creds);
                    }
                }
            } catch (error) {
                console.error(`Failed to parse credentials from ${configPath}:`, error);
            }
        }

        return credentials;
    }

    /**
     * Parse credentials from a single nuget.config file
     */
    private async parseCredentialsFromConfig(
        configPath: string
    ): Promise<Map<string, { username?: string; password?: string; isEncrypted: boolean }>> {
        const credentials = new Map<string, { username?: string; password?: string; isEncrypted: boolean }>();

        try {
            const content = await readFileAsync(configPath, 'utf-8');
            const config = this.parser.parse(content);

            const packageSourceCredentials = config.configuration?.packageSourceCredentials;
            if (!packageSourceCredentials) {
                return credentials;
            }

            // packageSourceCredentials contains child elements named after the source
            // Each child has <add key="Username" value="..." /> and <add key="Password|ClearTextPassword" value="..." />
            for (const sourceName of Object.keys(packageSourceCredentials)) {
                const sourceCredentials = packageSourceCredentials[sourceName];
                if (!sourceCredentials) {
                    continue;
                }

                let username: string | undefined;
                let password: string | undefined;
                let isEncrypted = false;

                // Handle both single <add> and array of <add> elements
                const addElements = sourceCredentials.add
                    ? (Array.isArray(sourceCredentials.add) ? sourceCredentials.add : [sourceCredentials.add])
                    : [];

                for (const add of addElements) {
                    const key = add['@_key']?.toLowerCase();
                    const value = add['@_value'];

                    if (key === 'username') {
                        username = value;
                    } else if (key === 'cleartextpassword') {
                        password = value;
                        isEncrypted = false;
                    } else if (key === 'password') {
                        password = value;
                        isEncrypted = true;
                    }
                }

                if (password) {
                    // Source names in packageSourceCredentials can have spaces replaced with underscores
                    // or other encoding, so we store as-is and match flexibly later
                    credentials.set(sourceName, { username, password, isEncrypted });
                }
            }
        } catch (error) {
            console.error(`Error parsing credentials from ${configPath}:`, error);
        }

        return credentials;
    }

    /**
     * Find credentials for a specific source by name.
     * Handles the case where source names may have spaces replaced with safe characters.
     * Per NuGet spec: spaces are encoded as `_x0020_` in XML element names.
     */
    findCredentialsForSource(
        credentials: Map<string, { username?: string; password?: string; isEncrypted: boolean }>,
        sourceName: string
    ): { username?: string; password?: string; isEncrypted: boolean } | undefined {
        // Try exact match first
        if (credentials.has(sourceName)) {
            return credentials.get(sourceName);
        }

        // Try with spaces replaced by _x0020_ (NuGet's XML entity encoding)
        const xmlEncodedName = sourceName.replace(/ /g, '_x0020_');
        if (credentials.has(xmlEncodedName)) {
            return credentials.get(xmlEncodedName);
        }

        // Try with spaces replaced by underscores (common alternate encoding)
        const underscoreName = sourceName.replace(/ /g, '_');
        if (credentials.has(underscoreName)) {
            return credentials.get(underscoreName);
        }

        // Try case-insensitive match with both encodings
        const lowerName = sourceName.toLowerCase();
        for (const [name, creds] of credentials) {
            const lowerCredName = name.toLowerCase();
            // Decode _x0020_ back to space for comparison
            const decodedCredName = lowerCredName.replace(/_x0020_/g, ' ');
            const decodedLowerName = lowerName.replace(/_x0020_/g, ' ');

            if (decodedCredName === decodedLowerName ||
                lowerCredName.replace(/_/g, ' ') === lowerName.replace(/_/g, ' ')) {
                return creds;
            }
        }

        return undefined;
    }
}

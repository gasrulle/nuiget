import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    InstalledPackage, Project, TransitiveFrameworkSection,
    TransitivePackage, TransitivePackagesResult
} from './NuGetTypes';
import { execWithTimeout, fileExists, parseVersionSpec } from './NuGetUtils';

/**
 * Handles project discovery, .csproj parsing, installed packages,
 * transitive dependency resolution, and project.assets.json caching.
 *
 * This is a pure filesystem/project service — it does NOT make NuGet API calls.
 * Metadata enrichment (icons, verified status, authors) is handled by the caller
 * via the `onEnrichMetadata` callback.
 */
export class NuGetProjectService {
    // Cache for parsed project.assets.json (path -> { mtime, data })
    private assetsJsonCache: Map<string, { mtimeMs: number; data: unknown; timestamp: number }> = new Map();
    private static readonly ASSETS_CACHE_TTL = 30000;
    private static readonly MAX_ASSETS_CACHE_ENTRIES = 5;

    constructor(
        private readonly useNounFirstSyntax: (projectPath: string) => Promise<boolean>,
        private readonly onEnrichMetadata?: (packages: InstalledPackage[]) => Promise<void>
    ) { }

    /** Clear the assets.json cache (call after install/update/remove) */
    clearAssetsCache(): void {
        this.assetsJsonCache.clear();
    }

    private async readAssetsJson<T = unknown>(assetsPath: string): Promise<T | null> {
        try {
            const stat = await fs.promises.stat(assetsPath);
            const now = Date.now();
            const cached = this.assetsJsonCache.get(assetsPath);

            if (cached &&
                cached.mtimeMs === stat.mtimeMs &&
                (now - cached.timestamp) < NuGetProjectService.ASSETS_CACHE_TTL) {
                return cached.data as T;
            }

            const content = await fs.promises.readFile(assetsPath, 'utf-8');
            const data = JSON.parse(content) as T;

            this.assetsJsonCache.set(assetsPath, {
                mtimeMs: stat.mtimeMs,
                data,
                timestamp: now
            });

            // Evict expired entries
            if (this.assetsJsonCache.size > 1) {
                const keysToDelete: string[] = [];
                for (const [key, entry] of this.assetsJsonCache) {
                    if (key !== assetsPath && (now - entry.timestamp) >= NuGetProjectService.ASSETS_CACHE_TTL) {
                        keysToDelete.push(key);
                    }
                }
                for (const key of keysToDelete) {
                    this.assetsJsonCache.delete(key);
                }
            }

            // Hard cap on cache size
            if (this.assetsJsonCache.size > NuGetProjectService.MAX_ASSETS_CACHE_ENTRIES) {
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

    private async getResolvedVersions(projectPath: string): Promise<Map<string, string>> {
        const projectDir = path.dirname(projectPath);
        const resolved = new Map<string, string>();

        // Try packages.lock.json first
        const lockFilePath = path.join(projectDir, 'packages.lock.json');
        try {
            if (await fileExists(lockFilePath)) {
                const lockContent = await fs.promises.readFile(lockFilePath, 'utf-8');
                const lockData = JSON.parse(lockContent) as {
                    version: number;
                    dependencies: Record<string, Record<string, {
                        type: string;
                        requested?: string;
                        resolved: string;
                    }>>;
                };

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
            // Fall through to project.assets.json
        }

        // Fallback: obj/project.assets.json
        const assetsPath = path.join(projectDir, 'obj', 'project.assets.json');
        try {
            if (await fileExists(assetsPath)) {
                const assetsData = await this.readAssetsJson<{
                    version: number;
                    targets: Record<string, Record<string, unknown>>;
                }>(assetsPath);

                if (assetsData?.targets) {
                    const targetFrameworks = Object.keys(assetsData.targets);
                    if (targetFrameworks.length > 0) {
                        const tfm = targetFrameworks[0];
                        const packages = assetsData.targets[tfm];

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

    async getPackageDependencies(projectPath: string): Promise<Map<string, string[]>> {
        const projectDir = path.dirname(projectPath);
        const dependencies = new Map<string, string[]>();

        const assetsPath = path.join(projectDir, 'obj', 'project.assets.json');
        try {
            if (await fileExists(assetsPath)) {
                const assetsData = await this.readAssetsJson<{
                    version: number;
                    targets: Record<string, Record<string, {
                        dependencies?: Record<string, string>;
                    }>>;
                }>(assetsPath);

                if (assetsData?.targets) {
                    const targetFrameworks = Object.keys(assetsData.targets);
                    if (targetFrameworks.length > 0) {
                        const tfm = targetFrameworks[0];
                        const packages = assetsData.targets[tfm];

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

    async getProjectReferences(projectPath: string): Promise<string[]> {
        const references: string[] = [];
        try {
            const content = await fs.promises.readFile(projectPath, 'utf-8');
            const projectDir = path.dirname(projectPath);

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

    async getProjectDependencyMap(projectPaths: string[]): Promise<Map<string, string[]>> {
        const isWindows = process.platform === 'win32';
        const normalizePath = (p: string) => {
            const normalized = path.normalize(p);
            return isWindows ? normalized.toLowerCase() : normalized;
        };

        const knownProjects = new Set(projectPaths.map(normalizePath));
        const dependencyMap = new Map<string, string[]>();

        for (const projectPath of projectPaths) {
            const key = normalizePath(projectPath);
            const refs = await this.getProjectReferences(projectPath);
            const filteredRefs = refs
                .map(normalizePath)
                .filter(ref => knownProjects.has(ref) && ref !== key);
            dependencyMap.set(key, filteredRefs);
        }

        return dependencyMap;
    }

    async getInstalledPackages(projectPath: string, liteMode?: boolean): Promise<InstalledPackage[]> {
        const packages: InstalledPackage[] = [];
        const resolvedVersions = await this.getResolvedVersions(projectPath);

        // Primary: parse .csproj directly
        try {
            const content = await fs.promises.readFile(projectPath, 'utf-8');
            const packageRefRegex = /<PackageReference\s+([^>]+?)(?:\/>|>[\s\S]*?<\/PackageReference>)/gi;

            let match;
            while ((match = packageRefRegex.exec(content)) !== null) {
                const attributes = match[0];

                const includeMatch = attributes.match(/Include\s*=\s*"([^"]+)"/i);
                if (!includeMatch) { continue; }

                const id = includeMatch[1];

                let version = 'unknown';
                const versionAttrMatch = attributes.match(/Version\s*=\s*"([^"]+)"/i);
                if (versionAttrMatch) {
                    version = versionAttrMatch[1];
                } else {
                    const versionElemMatch = attributes.match(/<Version>([^<]+)<\/Version>/i);
                    if (versionElemMatch) {
                        version = versionElemMatch[1];
                    }
                }

                const versionSpec = parseVersionSpec(version);
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
                if (!liteMode && this.onEnrichMetadata) {
                    await this.onEnrichMetadata(packages);
                }
                return packages;
            }
        } catch (parseError) {
            console.error('Failed to parse csproj file:', parseError);
        }

        // Fallback: dotnet CLI
        try {
            const projectDir = path.dirname(projectPath);
            const nounFirst = await this.useNounFirstSyntax(projectPath);
            const listCommand = nounFirst
                ? `dotnet package list --project "${projectPath}"`
                : `dotnet list "${projectPath}" package`;
            const { stdout } = await execWithTimeout(listCommand, { cwd: projectDir });

            const directPackageIds = new Set<string>();
            let successfullyReadCsproj = false;

            const filesToCheck = [
                projectPath,
                path.join(projectDir, 'Directory.Build.props'),
                path.join(projectDir, 'Directory.Packages.props')
            ];

            for (const filePath of filesToCheck) {
                try {
                    const content = await fs.promises.readFile(filePath, 'utf-8');
                    if (filePath === projectPath) {
                        successfullyReadCsproj = true;
                    }
                    const pkgRefRegex = /<PackageReference\s+[^>]*Include\s*=\s*"([^"]+)"/gi;
                    let refMatch;
                    while ((refMatch = pkgRefRegex.exec(content)) !== null) {
                        directPackageIds.add(refMatch[1].toLowerCase());
                    }
                    const packageVersionRegex = /<PackageVersion\s+[^>]*Include\s*=\s*"([^"]+)"/gi;
                    while ((refMatch = packageVersionRegex.exec(content)) !== null) {
                        directPackageIds.add(refMatch[1].toLowerCase());
                    }
                } catch {
                    // File doesn't exist or can't be read
                }
            }

            const lines = stdout.split('\n');
            let isInTransitiveSection = false;

            for (const line of lines) {
                if (line.includes('Top-level Package')) {
                    isInTransitiveSection = false;
                    continue;
                }
                if (line.includes('Transitive Package')) {
                    isInTransitiveSection = true;
                    continue;
                }

                const lineMatch = line.match(/^\s*>\s+(\S+).*?(\d+\.\d+[\w.-]*)\s*$/);
                if (lineMatch) {
                    const pkgId = lineMatch[1];
                    const isImplicit = isInTransitiveSection ||
                        (successfullyReadCsproj && !directPackageIds.has(pkgId.toLowerCase()));
                    packages.push({
                        id: pkgId,
                        version: lineMatch[2],
                        versionType: 'standard',
                        isImplicit
                    });
                }
            }

            if (!liteMode && this.onEnrichMetadata) {
                await this.onEnrichMetadata(packages);
            }

            return packages;
        } catch (error) {
            if (packages.length === 0) {
                console.error('Failed to get installed packages via dotnet CLI:', error);
            }
            if (packages.length > 0 && !liteMode && this.onEnrichMetadata) {
                await this.onEnrichMetadata(packages);
            }
            return packages;
        }
    }

    async getTransitivePackages(projectPath: string): Promise<TransitivePackagesResult> {
        const projectDir = path.dirname(projectPath);
        const assetsPath = path.join(projectDir, 'obj', 'project.assets.json');

        if (!await fileExists(assetsPath)) {
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

            const directPackageIds = new Set<string>();
            const directDeps = assetsData.projectFileDependencyGroups[targetFramework] || [];
            for (const dep of directDeps) {
                const match = dep.match(/^([^\s>=<]+)/);
                if (match) {
                    directPackageIds.add(match[1].toLowerCase());
                }
            }

            const dependedOnBy = new Map<string, Set<string>>();
            const packageVersions = new Map<string, string>();

            for (const key of Object.keys(targetPackages)) {
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
                        continue;
                    }

                    if (directPackageIds.has(parent.toLowerCase())) {
                        chain.push(parent);
                    } else {
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

            const transitivePackages: TransitivePackage[] = [];

            for (const key of Object.keys(targetPackages)) {
                const match = key.match(/^(.+?)\/(.+)$/);
                if (!match) { continue; }

                const [, packageId, version] = match;

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

            transitivePackages.sort((a, b) => a.id.localeCompare(b.id));

            frameworkSections.push({
                targetFramework,
                packages: transitivePackages
            });
        }

        return { frameworks: frameworkSections };
    }
}

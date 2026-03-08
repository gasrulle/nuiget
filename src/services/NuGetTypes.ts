/**
 * Shared type definitions for NuGet service operations.
 * Extracted from NuGetService.ts for modularity and reuse.
 */

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

export interface NuGetSource {
    name: string;
    url: string;
    enabled: boolean;
    configFile?: string;
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

/**
 * Result from grouped quick search - one entry per source
 */
export interface QuickSearchSourceResult {
    sourceName: string;
    sourceUrl: string;
    packageIds: string[];
}

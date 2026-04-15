/**
 * Shared type definitions for NuGet service operations.
 * Extracted from NuGetService.ts for modularity and reuse.
 */

/** Sentinel value representing "All Projects" in the project selector. */
export const ALL_PROJECTS_SENTINEL = '__all_projects__';

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

export interface PackageUpdate {
    id: string;
    installedVersion: string;
    latestVersion: string;
    iconUrl?: string;
    verified?: boolean;
    authors?: string;
    sourceUrl?: string;
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

// ─── NuGet V3 API response types (vendor-polymorphic) ────────────────────────

/**
 * A single package entry in a NuGet search response.
 * Field names vary across server implementations (nuget.org, Nexus, ProGet, etc.).
 */
export interface NuGetSearchEntry {
    id?: string;
    Id?: string;
    version?: string;
    Version?: string;
    description?: string;
    Description?: string;
    summary?: string;
    Summary?: string;
    authors?: string | string[];
    Authors?: string | string[];
    owner?: string;
    Owner?: string;
    totalDownloads?: number;
    TotalDownloads?: number;
    versions?: Array<{ version: string; downloads?: number }>;
    Versions?: Array<{ version: string; downloads?: number }>;
    iconUrl?: string;
    verified?: boolean;
    packageTypes?: Array<{ name: string }>;
    licenseExpression?: string;
    LicenseExpression?: string;
    licenseUrl?: string;
    LicenseUrl?: string;
    projectUrl?: string;
    ProjectUrl?: string;
}

/**
 * NuGet V3 search API response (e.g., SearchQueryService).
 * nuget.org uses `data`, some servers use `Data` or return a root array.
 */
export interface NuGetSearchResponse {
    data?: NuGetSearchEntry[];
    Data?: NuGetSearchEntry[];
    totalHits?: number;
    TotalHits?: number;
}

/**
 * A catalog entry or registration leaf in the NuGet V3 registration API.
 * May appear inline or behind a `catalogEntry` URL.
 */
export interface NuGetRegistrationEntry {
    '@id'?: string;
    id?: string;
    version?: string;
    description?: string;
    authors?: string | string[];
    summary?: string;
    title?: string;
    catalogEntry?: string | NuGetRegistrationEntry;
    dependencyGroups?: Array<{
        targetFramework?: string;
        '@id'?: string;
        dependencies?: Array<{
            id?: string;
            range?: string;
            version?: string;
            '@id'?: string;
        }>;
    }>;
    listed?: boolean;
    published?: string;
    packageContent?: string;
    licenseExpression?: string;
    licenseUrl?: string;
    projectUrl?: string;
    iconUrl?: string;
    items?: NuGetRegistrationPage[];
}

/**
 * A page in a NuGet V3 registration index. Pages may inline items
 * or require a separate fetch via `@id`.
 */
export interface NuGetRegistrationPage {
    '@id'?: string;
    items?: NuGetRegistrationEntry[];
    lower?: string;
    upper?: string;
}

// ─── Webview ↔ Extension Host Message Protocol ──────────────────────────────
//
// Discriminated unions for messages sent from the webview to the extension host.
// Using typed messages eliminates unsafe `as` casts in message handlers and
// enables exhaustive switch checking.

/** Package reference for bulk update operations */
export interface BulkPackageRef {
    id: string;
    version: string;
    sourceUrl?: string;
}

/** Project update data for all-projects bulk update */
export interface ProjectBulkUpdate {
    projectPath: string;
    projectName: string;
    packages: BulkPackageRef[];
}

/** Project removal data for all-projects bulk remove */
export interface ProjectBulkRemoval {
    projectPath: string;
    projectName: string;
    packages: string[];
}

/** Transitive package reference for metadata fetching (subset of TransitivePackage) */
export interface TransitivePackageRef {
    id: string;
    version: string;
    requiredByChain: string[];
    fullChain?: string[];
}

// ─── Shared Messages (used by both main panel and sidebar) ───────────────────

export interface GetInstalledPackagesMsg {
    type: 'getInstalledPackages';
    projectPath: string;
}

export interface SearchPackagesMsg {
    type: 'searchPackages';
    query: string;
    sources?: string[];
    includePrerelease?: boolean;
    take?: number;
    exactMatch?: boolean;
}

export interface CheckPackageUpdatesMsg {
    type: 'checkPackageUpdates';
    installedPackages: InstalledPackage[];
    includePrerelease: boolean;
    projectPath: string;
}

export interface CheckAllProjectsUpdatesMsg {
    type: 'checkAllProjectsUpdates';
    includePrerelease: boolean;
}

export interface CheckAllProjectsInstalledMsg {
    type: 'checkAllProjectsInstalled';
    context?: string;
}

export interface InstallPackageMsg {
    type: 'installPackage';
    projectPath: string;
    packageId: string;
    version?: string;
    sourceUrl?: string;
}

export interface PickProjectForInstallMsg {
    type: 'pickProjectForInstall';
    packageId: string;
    version?: string;
}

export interface PickProjectForRemoveMsg {
    type: 'pickProjectForRemove';
    packageId: string;
    /** Project paths where the package is installed (pre-filtered by webview) */
    projectPaths: string[];
}

export interface UpdatePackageMsg {
    type: 'updatePackage';
    projectPath: string;
    packageId: string;
    version: string;
    sourceUrl?: string;
}

export interface RemovePackageMsg {
    type: 'removePackage';
    projectPath: string;
    packageId: string;
}

export interface BulkUpdatePackagesMsg {
    type: 'bulkUpdatePackages';
    packages: BulkPackageRef[];
    projectPath: string;
}

export interface BulkUpdateAllProjectsMsg {
    type: 'bulkUpdateAllProjects';
    projectUpdates: ProjectBulkUpdate[];
}

export interface GetPackageVersionsMsg {
    type: 'getPackageVersions';
    packageId: string;
    source?: string;
    includePrerelease?: boolean;
    take?: number;
}

// ─── Panel-Only Messages ─────────────────────────────────────────────────────

export interface GetProjectsMsg {
    type: 'getProjects';
}

export interface GetTransitivePackagesMsg {
    type: 'getTransitivePackages';
    projectPath: string;
    forceRestore?: boolean;
}

export interface GetTransitiveMetadataMsg {
    type: 'getTransitiveMetadata';
    packages: TransitivePackageRef[];
    targetFramework: string;
    projectPath: string;
}

export interface RestoreProjectMsg {
    type: 'restoreProject';
    projectPath: string;
}

export interface AutocompletePackagesMsg {
    type: 'autocompletePackages';
    query: string;
    sources: Array<{ name: string; url: string }>;
    includePrerelease?: boolean;
}

export interface BulkInstallMsg {
    type: 'bulkInstall';
    projectPaths: string[];
    packageId: string;
    version?: string;
}

export interface GetSourcesMsg {
    type: 'getSources';
}

export interface RefreshSourcesMsg {
    type: 'refreshSources';
}

export interface FullRefreshMsg {
    type: 'fullRefresh';
}

export interface EnableSourceMsg {
    type: 'enableSource';
    sourceName: string;
}

export interface DisableSourceMsg {
    type: 'disableSource';
    sourceName: string;
    sourceUrl: string;
}

export interface AddSourceMsg {
    type: 'addSource';
    url: string;
    name?: string;
    username?: string;
    password?: string;
    configFile?: string;
    allowInsecure?: boolean;
    storeEncrypted?: boolean;
}

export interface RemoveSourceMsg {
    type: 'removeSource';
    sourceName: string;
    configFile?: string;
}

export interface GetConfigFilesMsg {
    type: 'getConfigFiles';
}

export interface GetPackageMetadataMsg {
    type: 'getPackageMetadata';
    packageId: string;
    version: string;
    source?: string;
}

export interface GetSettingsMsg {
    type: 'getSettings';
}

export interface SaveSettingsMsg {
    type: 'saveSettings';
    includePrerelease?: boolean;
    selectedSource?: string;
    selectedProject?: string;
    recentSearches?: string[];
}

export interface GetSplitPositionMsg {
    type: 'getSplitPosition';
}

export interface SaveSplitPositionMsg {
    type: 'saveSplitPosition';
    position: number;
}

export interface PrewarmSourceMsg {
    type: 'prewarmSource';
    sourceUrl: string;
}

export interface FetchReadmeFromPackageMsg {
    type: 'fetchReadmeFromPackage';
    packageId: string;
    version: string;
    source?: string;
}

export interface ConfirmBulkRemoveMsg {
    type: 'confirmBulkRemove';
    packages: string[];
    projectPath: string;
}

export interface ConfirmBulkRemoveAllProjectsMsg {
    type: 'confirmBulkRemoveAllProjects';
    projectRemovals: ProjectBulkRemoval[];
}

// ─── Sidebar-Only Messages ───────────────────────────────────────────────────

export interface SidebarReadyMsg {
    type: 'ready';
}

export interface SaveSectionSplitMsg {
    type: 'saveSectionSplit';
    position?: number;
}

export interface ShowContextMenuMsg {
    type: 'showContextMenu';
    packageId: string;
    installedVersion?: string;
    latestVersion?: string;
    context: 'browse' | 'installed' | 'updates';
    projectPath: string;
    versionType?: string;
    sourceUrl?: string;
    /** Projects where this package is installed (for all-projects browse context menu) */
    installedProjects?: Array<{ projectPath: string; projectName: string; version: string }>;
}

// ─── Union Types ─────────────────────────────────────────────────────────────

/** All messages the main panel webview can send to the extension host */
export type PanelRequestMessage =
    | GetProjectsMsg | GetInstalledPackagesMsg | GetTransitivePackagesMsg | GetTransitiveMetadataMsg
    | RestoreProjectMsg | SearchPackagesMsg | AutocompletePackagesMsg
    | InstallPackageMsg | BulkInstallMsg | UpdatePackageMsg | RemovePackageMsg
    | GetSourcesMsg | RefreshSourcesMsg | FullRefreshMsg
    | EnableSourceMsg | DisableSourceMsg | AddSourceMsg | RemoveSourceMsg
    | GetConfigFilesMsg | GetPackageVersionsMsg | GetPackageMetadataMsg
    | CheckPackageUpdatesMsg | CheckAllProjectsUpdatesMsg | CheckAllProjectsInstalledMsg
    | BulkUpdateAllProjectsMsg | GetSettingsMsg | SaveSettingsMsg
    | GetSplitPositionMsg | SaveSplitPositionMsg
    | PrewarmSourceMsg | FetchReadmeFromPackageMsg
    | BulkUpdatePackagesMsg | ConfirmBulkRemoveMsg | ConfirmBulkRemoveAllProjectsMsg;

/** All messages the sidebar webview can send to the extension host */
export type SidebarRequestMessage =
    | SidebarReadyMsg | SaveSectionSplitMsg | SearchPackagesMsg
    | GetInstalledPackagesMsg | CheckPackageUpdatesMsg
    | CheckAllProjectsUpdatesMsg | CheckAllProjectsInstalledMsg
    | InstallPackageMsg | UpdatePackageMsg | RemovePackageMsg
    | BulkUpdatePackagesMsg | BulkUpdateAllProjectsMsg
    | GetPackageVersionsMsg | ShowContextMenuMsg
    | PickProjectForInstallMsg | PickProjectForRemoveMsg;

// ─── Service Infrastructure Types ────────────────────────────────────────────

/** NuGet V3 service index response */
export interface NuGetServiceIndex {
    version: string;
    resources: Array<{
        '@id': string;
        '@type': string | string[];
    }>;
}

/** Resolved service endpoints from a NuGet source's service index */
export interface ServiceEndpoints {
    packageBaseAddress?: string;
    registrationsBaseUrl?: string;
    searchQueryService?: string;
    searchAutocompleteService?: string;
    vulnerabilityInfoUrl?: string;
}

/** Pre-resolved source with endpoints and auth for batch operations (avoids per-package re-discovery) */
export interface ResolvedSource {
    url: string;
    endpoints: ServiceEndpoints;
    authHeader?: string;
}

/** Result from fetchJsonWithDetails — includes error information for better diagnostics */
export interface FetchResult<T> {
    data: T | null;
    error?: {
        type: 'network' | 'auth' | 'not-found' | 'server-error' | 'invalid-json' | 'unknown';
        statusCode?: number;
        message: string;
    };
}

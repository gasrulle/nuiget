/**
 * Domain types shared by the extension host and both webviews.
 *
 * This file must stay free of Node, VS Code and React imports — it is bundled
 * into the webviews as well as the extension.
 */

/** Sentinel `selectedProject` value meaning "every project in the workspace". */
export const ALL_PROJECTS = '__all_projects__';

export type Surface = 'main' | 'sidebar';

export type VersionType = 'floating' | 'range' | 'exact' | 'standard' | 'unresolved';

export interface VersionSpec {
    type: VersionType;
    /** Original version text as written in the project (or `''` when centrally managed and unresolved). */
    original: string;
    /** For floating versions: the prefix before the wildcard (e.g. `10` for `10.*`). */
    floatingPrefix?: string;
    /** For floating versions: the position of the wildcard counted in fixed components (`1.*` = 1 major, `1.0.*` = 2 minor, `1.0.0.*` = 3 patch; 0 for `*`; 4 for a prerelease wildcard such as `1.0.0-*`). */
    floatingDepth?: number;
    /** `*` — always the newest version. */
    isAlwaysLatest?: boolean;
}

export interface Project {
    name: string;
    path: string;
    /** Workspace folder name this project belongs to (multi-root grouping). */
    workspaceFolder?: string;
}

/**
 * Where a package reference's version is declared.
 * - `project`: `Version` attribute/element on the `PackageReference` in the project file.
 * - `central`: `PackageVersion` in the nearest `Directory.Packages.props` (CPM).
 * - `central-override`: CPM project with a `VersionOverride` on the reference.
 * - `props`: `PackageReference` declared in an imported props file (e.g. `Directory.Build.props`).
 * - `unresolved`: version could not be determined statically (needs evaluation).
 */
export type VersionDeclaration = 'project' | 'central' | 'central-override' | 'props' | 'unresolved';

/** Fidelity of project data. Provisional data comes from static XML inspection; authoritative data from MSBuild evaluation. */
export type Fidelity = 'provisional' | 'authoritative';

export interface InstalledPackage {
    id: string;
    /** Version as specified (may be floating like `10.*` or a range like `[1.0,2.0)`); `''` when unresolved. */
    version: string;
    /** Actual resolved version from assets/lock files (e.g. `10.2.0`). */
    resolvedVersion?: string;
    versionType: VersionType;
    floatingPrefix?: string;
    isAlwaysLatest?: boolean;
    declaration: VersionDeclaration;
    /** Absolute path of the file that declares the item when it is not the project file (props/central). */
    definedIn?: string;
    /** Target frameworks this reference applies to when it is conditioned; undefined = all. */
    targetFrameworks?: string[];
    /** Implicit references (SDK-injected) that cannot be uninstalled. */
    isImplicit?: boolean;
    iconUrl?: string;
    verified?: boolean;
    authors?: string;
    vulnerabilities?: PackageVulnerability[];
}

/** `sdk-too-old`: the SDK the project resolves is below 10 (D13); the message is "requires .NET SDK 10 or newer". */
export type UnsupportedProjectReason = 'packages-config' | 'non-sdk-style' | 'parse-failed' | 'not-found' | 'sdk-too-old';

export interface InstalledResult {
    projectPath: string;
    packages: InstalledPackage[];
    fidelity: Fidelity;
    /** True when the project uses Central Package Management. */
    isCpm: boolean;
    /** Absolute path of the governing `Directory.Packages.props`, when CPM. */
    centralPropsPath?: string;
    unsupported?: { reason: UnsupportedProjectReason; message: string };
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
    /** Source URL the entry came from (first source when merged). */
    sourceUrl?: string;
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
    /** Loaded from the local global-packages folder: no allowed source produced metadata for this version (unreachable, unknown to every source, or none allowed; the response does not say which). Never cached. */
    offline?: boolean;
    /** Source URL the metadata came from. */
    sourceUrl?: string;
}

export type VulnerabilitySeverity = 'Low' | 'Moderate' | 'High' | 'Critical';

export interface PackageVulnerability {
    advisoryUrl: string;
    severity: VulnerabilitySeverity;
}

export interface NuGetSource {
    name: string;
    url: string;
    enabled: boolean;
    configFile?: string;
    /** True for file-system sources (no HTTP API). */
    isLocal?: boolean;
}

export interface FailedSource {
    url: string;
    error: string;
}

export interface TransitivePackage {
    id: string;
    version: string;
    /** Distinct top-level packages that require this package (first 5; full set in `fullChain`). */
    requiredByChain: string[];
    fullChain?: string[];
    iconUrl?: string;
    verified?: boolean;
    authors?: string;
}

export interface TransitiveFrameworkSection {
    targetFramework: string;
    packages: TransitivePackage[];
}

export type TransitiveErrorKind = 'parse-failed' | 'fs-error' | 'unknown';

export interface TransitiveResult {
    projectPath: string;
    frameworks: TransitiveFrameworkSection[];
    /** False → `obj/project.assets.json` is missing (restore needed). */
    dataSourceAvailable: boolean;
    errorKind?: TransitiveErrorKind;
}

export interface QuickSearchSourceResult {
    sourceName: string;
    sourceUrl: string;
    packageIds: string[];
}

export interface PackageMetadataLite {
    id: string;
    version: string;
    iconUrl?: string;
    verified?: boolean;
    authors?: string;
    description?: string;
    vulnerabilities?: PackageVulnerability[];
}

// ─── Session (shared, host-owned state) ─────────────────────────────────────

export interface SessionSnapshot {
    /** Monotonic revision; webviews ignore snapshots with a lower revision than the last applied one. */
    rev: number;
    /** Project path or `ALL_PROJECTS`; `''` when the workspace has no projects. */
    selectedProject: string;
    /** `'all'` or a source URL. */
    selectedSource: string;
    includePrerelease: boolean;
    restoreEnabled: boolean;
    /** Who caused this revision. */
    origin: Surface | 'host';
}

export type SessionIntent = Partial<Pick<SessionSnapshot, 'selectedProject' | 'selectedSource' | 'includePrerelease' | 'restoreEnabled'>>;

// ─── Resources & invalidation ───────────────────────────────────────────────

/**
 * Resource keys identify cacheable query results. Format is `<kind>:<discriminator>`;
 * build them with `resourceKeys` so every module agrees on the shape.
 */
export type ResourceKey = string & { readonly __brand?: 'ResourceKey' };

export const resourceKeys = {
    projects: (): ResourceKey => 'projects',
    /** Sources effective for one project directory (ADR-005 resolves sources per `projectDir`; the plan row's `cwd` is that directory). */
    sources: (projectDir: string): ResourceKey => `sources:${projectDir}`,
    installed: (projectPath: string): ResourceKey => `installed:${projectPath}`,
    updates: (projectPath: string, includePrerelease: boolean): ResourceKey => `updates:${projectPath}|${includePrerelease ? 'pre' : 'stable'}`,
    transitive: (projectPath: string): ResourceKey => `transitive:${projectPath}`,
    allProjectsInstalled: (): ResourceKey => 'allProjects:installed',
    allProjectsUpdates: (includePrerelease: boolean): ResourceKey => `allProjects:updates|${includePrerelease ? 'pre' : 'stable'}`,
    allProjectsTransitive: (): ResourceKey => 'allProjects:transitive',
    versions: (packageId: string, sourceUrl: string | undefined, includePrerelease: boolean): ResourceKey =>
        `versions:${packageId.toLowerCase()}|${sourceUrl ?? 'all'}|${includePrerelease ? 'pre' : 'stable'}`,
    metadata: (packageId: string, version: string, sourceUrl: string | undefined): ResourceKey =>
        `metadata:${packageId.toLowerCase()}@${version.toLowerCase()}|${sourceUrl ?? 'all'}`,
} as const;

export type InvalidationReason =
    | 'operation'
    | 'file-watcher'
    | 'manual-refresh'
    | 'source-changed'
    | 'session-changed'
    | 'workspace-folders'
    | 'restore';

/**
 * Invalidation scope. `workspace` subsumes `project` which subsumes `package`.
 * Scopes are merged by the coordinator (union of paths/ids; widest kind wins).
 */
export type InvalidationScope =
    | { kind: 'workspace' }
    | { kind: 'project'; projectPaths: string[] }
    | { kind: 'package'; projectPaths: string[]; packageIds: string[] }
    | { kind: 'sources' }
    | { kind: 'metadata'; packageIds: string[] };

// ─── Operations ─────────────────────────────────────────────────────────────

export type OperationKind = 'install' | 'update' | 'remove' | 'restore';

export type OperationStatus =
    | 'queued'
    | 'running'
    | 'restoring'
    | 'completed'
    | 'partial'
    | 'failed'
    | 'cancelled'
    | 'rejected';

export interface StepOutcome {
    ok: boolean;
    /** True when the step was intentionally skipped (e.g. restore disabled). */
    skipped?: boolean;
    error?: string;
}

export interface OperationOutcome {
    opId: string;
    kind: OperationKind;
    status: OperationStatus;
    projectPath: string;
    packageId?: string;
    version?: string;
    /** Result of the reference edit (`dotnet package add/remove`). Absent for pure restores. */
    edit?: StepOutcome;
    /** Result of the post-edit restore. */
    restore?: StepOutcome;
    /** Projects whose files changed as a side effect (e.g. CPM central version change). */
    affectedProjects?: string[];
    /** Human-readable reason for `rejected` (e.g. queue full) or `failed`. */
    message?: string;
}

/** What a central version change reaches (ADR-004 tier 3): the mutator's preview, shown before `ops/update` or `ops/install` of a centrally managed package. */
export interface CpmImpactPreview {
    centralPropsPath: string;
    packageId: string;
    /** The central version before the change. */
    fromVersion?: string;
    toVersion: string;
    /** Every project importing that props file that references the package without an override, the asking project included. */
    affectedProjects: string[];
}

export interface OperationProgress {
    opId: string;
    status: OperationStatus;
    kind?: OperationKind;
    /** Project(s) the operation touches, so a non-originating surface can mark rows busy. */
    projectPaths?: string[];
    packageIds?: string[];
    /** 1-based index for bulk operations. */
    current?: number;
    total?: number;
    detail?: string;
}

export interface BulkOutcome {
    opId: string;
    status: OperationStatus;
    results: OperationOutcome[];
    /** Per-project restore results after all edits. */
    restores: Array<{ projectPath: string } & StepOutcome>;
    message?: string;
}

// ─── Layout (surface-local persisted preferences kept by the host) ─────────

export interface LayoutPreferences {
    /** Main panel list/details split (percent of width). */
    splitPosition?: number;
    /** Sidebar installed/updates split (percent of height). */
    sidebarSectionSplit?: number;
}

export interface ExtensionConfig {
    /** The values of `nuiget.searchDebounceMode` as contributed; `off` is main-panel-only. */
    searchDebounceMode: 'quicksearch' | 'full' | 'off';
    quickSearchResultsPerSource: number;
    searchResultLimit: number;
    /** `nuiget.enablePerformanceLogging`: the webviews send `perf/mark` and the host logs `[perf]` lines at `info` only while it is on. */
    enablePerformanceLogging: boolean;
    treeIndent: number;
    isWindows: boolean;
}

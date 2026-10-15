/**
 * Webview ↔ extension-host protocol: request / response / stream / event maps.
 *
 * Every request from a webview carries an `id`; the host answers with exactly one
 * response (ok or error) for that id, optionally preceded by stream chunks. Events
 * flow host → webview without correlation.
 *
 * Both webviews use the same maps. Requests marked "sidebar" or "main" in comments
 * are only *meaningful* for that surface; the host rejects them elsewhere with
 * `unsupported`.
 */

import type {
    BulkOutcome,
    CpmImpactPreview,
    ExtensionConfig,
    FailedSource,
    InstalledResult,
    InvalidationReason,
    InvalidationScope,
    LayoutPreferences,
    NuGetSource,
    OperationOutcome,
    OperationProgress,
    PackageMetadata,
    PackageMetadataLite,
    PackageSearchResult,
    PackageUpdate,
    Project,
    QuickSearchSourceResult,
    ResourceKey,
    SessionIntent,
    SessionSnapshot,
    TransitiveFrameworkSection,
    TransitiveResult,
    TransitiveErrorKind,
} from './domain';

// ─── Shared payload fragments ───────────────────────────────────────────────

export interface BulkPackageRef {
    id: string;
    version: string;
    sourceUrl?: string;
}

export interface ProjectBulkUpdate {
    projectPath: string;
    projectName: string;
    packages: BulkPackageRef[];
}

export interface ProjectBulkRemoval {
    projectPath: string;
    projectName: string;
    packages: string[];
}

export interface ProjectInstalledChunk {
    projectPath: string;
    projectName: string;
    workspaceFolder?: string;
    result?: InstalledResult;
    error?: string;
}

export interface ProjectUpdatesChunk {
    projectPath: string;
    projectName: string;
    workspaceFolder?: string;
    updates: PackageUpdate[];
    error?: string;
}

export interface ProjectTransitiveChunk {
    projectPath: string;
    projectName: string;
    workspaceFolder?: string;
    frameworks: TransitiveFrameworkSection[];
    dataSourceAvailable: boolean;
    errorKind?: TransitiveErrorKind;
}

export interface ProjectListing {
    projects: Project[];
}

export type ContextMenuContext = 'browse' | 'installed' | 'updates';

export interface ContextMenuRequest {
    packageId: string;
    installedVersion?: string;
    latestVersion?: string;
    context: ContextMenuContext;
    projectPath: string;
    versionType?: string;
    sourceUrl?: string;
    installedProjects?: Array<{ projectPath: string; projectName: string; version: string }>;
    partiallyInstalled?: boolean;
}

// ─── Request map ────────────────────────────────────────────────────────────

/**
 * `payload` is what the webview sends; `result` is the terminal response; `chunk`
 * (optional) is the type of intermediate stream chunks.
 */
export interface RequestMap {
    // Session
    'session/get': { payload: Record<string, never>; result: SessionSnapshot };
    'session/set': { payload: SessionIntent; result: SessionSnapshot };

    // Config & layout
    'config/get': { payload: Record<string, never>; result: ExtensionConfig };
    'layout/get': { payload: Record<string, never>; result: LayoutPreferences };
    'layout/set': { payload: LayoutPreferences; result: LayoutPreferences };

    // Projects
    'projects/list': { payload: Record<string, never>; result: ProjectListing };

    // Single-project resources
    /** The provisional list, streamed before the evaluated one when an evaluation runs; a cached list is answered without a chunk (ADR-009 d.2, d.3). */
    'installed/get': { payload: { projectPath: string }; result: InstalledResult; chunk: { kind: 'provisional'; result: InstalledResult } };
    'updates/get': { payload: { projectPath: string; includePrerelease: boolean }; result: { projectPath: string; updates: PackageUpdate[]; sourcesUnavailable?: boolean }; chunk: { kind: 'found'; update: PackageUpdate } };
    'transitive/get': { payload: { projectPath: string; forceRestore?: boolean }; result: TransitiveResult };
    'transitive/metadata': { payload: { packages: Array<{ id: string; version: string }> }; result: { metadata: PackageMetadataLite[] } };

    // All-projects resources (streamed per project)
    'allProjects/installed': { payload: Record<string, never>; result: { projectPaths: string[]; errored: Array<{ projectPath: string; error: string }> }; chunk: { kind: 'start'; projects: Project[] } | { kind: 'project'; chunk: ProjectInstalledChunk } | { kind: 'metadata'; projectPath: string; packages: PackageMetadataLite[] } };
    'allProjects/updates': { payload: { includePrerelease: boolean }; result: { projectPaths: string[]; sourcesUnavailable?: boolean }; chunk: { kind: 'start'; projects: Project[] } | { kind: 'project'; chunk: ProjectUpdatesChunk } | { kind: 'icons'; icons: Record<string, string> } };
    'allProjects/transitive': { payload: Record<string, never>; result: { projectPaths: string[]; errored: Array<{ projectPath: string; errorKind: TransitiveErrorKind }> }; chunk: { kind: 'start'; projects: Project[] } | { kind: 'project'; chunk: ProjectTransitiveChunk } };

    // Search
    'search/query': { payload: { query: string; sourceUrls?: string[]; includePrerelease: boolean; take?: number; exactMatch?: boolean }; result: { query: string; results: PackageSearchResult[]; sourcesUnavailable?: boolean }; chunk: { kind: 'metadata'; packages: PackageMetadataLite[] } };
    'search/autocomplete': { payload: { query: string; sources: Array<{ name: string; url: string }>; includePrerelease: boolean }; result: { query: string; groups: QuickSearchSourceResult[] } };

    // Package details
    'package/versions': { payload: { packageId: string; sourceUrl?: string; includePrerelease: boolean; take?: number }; result: { packageId: string; versions: string[] } };
    'package/metadata': { payload: { packageId: string; version: string; sourceUrl?: string }; result: { metadata: PackageMetadata | null } };
    'package/readme': { payload: { packageId: string; version: string; sourceUrl?: string }; result: { readme: string | null } };
    /** Lazily fetches one README image host-side with the icon fetch's auth, size cap and policy (ADR-006). `dataUri` is `null` when the fetch failed or policy blocked it; the webview then renders a link. */
    'readme/image': { payload: { url: string; sourceUrl?: string }; result: { url: string; dataUri: string | null } }; // main
    'package/prewarm': { payload: { sourceUrl?: string }; result: Record<string, never> };

    // Sources
    'sources/list': { payload: Record<string, never>; result: { sources: NuGetSource[]; failed: FailedSource[] }; chunk: { kind: 'health'; failed: FailedSource[] } };
    'sources/refresh': { payload: Record<string, never>; result: { sources: NuGetSource[]; failed: FailedSource[] }; chunk: { kind: 'health'; failed: FailedSource[] } };
    'sources/configFiles': { payload: Record<string, never>; result: { configFiles: Array<{ path: string; label: string }> } };
    'sources/add': { payload: { url: string; name?: string; username?: string; password?: string; configFile?: string; allowInsecure?: boolean; storeEncrypted?: boolean }; result: { sources: NuGetSource[] } };
    'sources/remove': { payload: { sourceName: string; configFile?: string }; result: { sources: NuGetSource[]; removedUrl?: string } };
    'sources/enable': { payload: { sourceName: string }; result: { sources: NuGetSource[] } };
    'sources/disable': { payload: { sourceName: string }; result: { sources: NuGetSource[]; disabledUrl?: string } };

    // Operations (long-running; progress via chunks, outcome as the response)
    'ops/install': { payload: { projectPath: string; packageId: string; version?: string; sourceUrl?: string }; result: OperationOutcome; chunk: OperationProgress };
    'ops/update': { payload: { projectPath: string; packageId: string; version: string; sourceUrl?: string }; result: OperationOutcome; chunk: OperationProgress };
    'ops/remove': { payload: { projectPath: string; packageId: string }; result: OperationOutcome; chunk: OperationProgress };
    'ops/restore': { payload: { projectPaths: string[] }; result: BulkOutcome; chunk: OperationProgress };
    'ops/bulkInstall': { payload: { projectPaths: string[]; packageId: string; version?: string }; result: BulkOutcome; chunk: OperationProgress };
    'ops/bulkUpdate': { payload: { projectPath: string; packages: BulkPackageRef[] }; result: BulkOutcome; chunk: OperationProgress };
    'ops/bulkRemove': { payload: { projectPath: string; packages: string[] }; result: BulkOutcome; chunk: OperationProgress };
    'ops/bulkUpdateAllProjects': { payload: { projectUpdates: ProjectBulkUpdate[] }; result: BulkOutcome; chunk: OperationProgress };
    'ops/bulkRemoveAllProjects': { payload: { projectRemovals: ProjectBulkRemoval[] }; result: BulkOutcome; chunk: OperationProgress };

    // Central Package Management
    /** The projects a central version change would reach, asked before `ops/update` or `ops/install` of a centrally managed package (ADR-004 tier 3, interaction model §5). `preview` is `null` when the project does not use Central Package Management or the package has no central entry; the edit itself goes through `ops/*`, whose gate decides. */
    'cpm/preview': { payload: { projectPath: string; packageId: string; version: string }; result: { preview: CpmImpactPreview | null } };

    // Invalidation (manual refresh from either surface)
    'refresh/all': { payload: Record<string, never>; result: Record<string, never> };

    // UI delegation to VS Code chrome
    'ui/contextMenu': { payload: ContextMenuRequest; result: { handled: boolean } };                 // sidebar
    'ui/openSourceSettings': { payload: Record<string, never>; result: Record<string, never> };       // sidebar → main
    'ui/viewPackage': { payload: { packageId: string; version?: string }; result: Record<string, never> }; // sidebar → main
    'ui/copyToClipboard': { payload: { text: string }; result: Record<string, never> };
    'ui/openExternal': { payload: { url: string }; result: Record<string, never> };

    // Diagnostics
    'perf/mark': { payload: { name: 'webviewReady' | 'firstUsefulRender'; detail?: string }; result: Record<string, never> };
}

export type RequestType = keyof RequestMap;
export type RequestPayload<T extends RequestType> = RequestMap[T]['payload'];
export type RequestResult<T extends RequestType> = RequestMap[T]['result'];
export type RequestChunk<T extends RequestType> = RequestMap[T] extends { chunk: infer C } ? C : never;

// ─── Event map (host → webview, uncorrelated) ───────────────────────────────

export interface EventMap {
    'session/changed': SessionSnapshot;
    'projects/changed': ProjectListing;
    /** The coordinator's `InvalidationEvent` forwarded unchanged (ADR-002). `generation` is the event's sequence number and is not comparable with a response's generation; `keys` lists every key the coordinator has seen that `scope` reached, with its generation after this invalidation, which is what an ok response for that key carries. A key absent from `keys` was never queried. */
    'resources/invalidated': { scope: InvalidationScope; reason: InvalidationReason; generation: number; keys: Array<{ key: ResourceKey; generation: number }> };
    'sources/health': { failed: FailedSource[] };
    'ops/progress': OperationProgress;
    /** Outcome of an operation started by *any* surface (the originating surface also gets it as its response). */
    'ops/completed': OperationOutcome | BulkOutcome;
    'config/changed': ExtensionConfig;
    'ui/navigateToPackage': { packageId: string; version?: string };
    'ui/openSourceSettings': Record<string, never>;
    'ui/focusSearch': Record<string, never>;
    'ui/selectProject': { projectPath: string; initialTab?: 'installed' | 'updates' };
}

export type EventType = keyof EventMap;
export type EventPayload<T extends EventType> = EventMap[T];

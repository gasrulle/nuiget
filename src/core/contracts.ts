/**
 * Core contracts — the interfaces every `src/core` module implements or consumes.
 *
 * Rules for `src/core/**` (enforced by ESLint `no-restricted-imports`):
 *   - no React, no webview `postMessage`, no `vscode.window.*` UI calls;
 *   - may depend on `vscode` only for `workspace`/`Memento`/`FileSystemWatcher`/`Uri` types via the
 *     adapters declared here, so the modules stay unit-testable without the extension host.
 */

import type {
    BulkOutcome,
    CpmImpactPreview,
    Fidelity,
    InstalledResult,
    InvalidationReason,
    InvalidationScope,
    OperationKind,
    OperationOutcome,
    OperationProgress,
    Project,
    ResourceKey,
    SessionIntent,
    SessionSnapshot,
    Surface,
} from '../protocol/domain';

export type { CpmImpactPreview };

// ─── Platform adapters (so core never imports vscode UI directly) ───────────

export interface KeyValueStore {
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): PromiseLike<void>;
}

export interface Logger {
    trace(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string | Error, ...args: unknown[]): void;
}

export interface Disposable {
    dispose(): void;
}

export type Listener<T> = (value: T) => void;

export interface Event<T> {
    (listener: Listener<T>): Disposable;
}

// ─── Session (ADR-001) ──────────────────────────────────────────────────────

export interface SessionStore {
    /** Current committed snapshot. */
    readonly snapshot: SessionSnapshot;
    /** Fires after every committed change, including host-originated normalization. */
    readonly onDidChange: Event<SessionSnapshot>;
    /**
     * Apply an intent. Values are validated/normalized (e.g. selecting a project that no
     * longer exists falls back to the first project; `ALL_PROJECTS` with ≤1 project downgrades).
     * Resolves with the committed snapshot. In-memory state changes synchronously; persistence is
     * awaited but a persistence failure is logged and does not roll back the in-memory state.
     */
    apply(intent: SessionIntent, origin: Surface | 'host'): Promise<SessionSnapshot>;
    /**
     * Re-validate the snapshot against the current project list and enabled source URLs, with the
     * normalization described on `apply`, and commit the result with origin `'host'` (ADR-001). The host
     * calls it (composition root, plan item P2.10) whenever the project list or the source list changes;
     * because sources resolve per project directory (ADR-005), a change of the selected project is a
     * source-list change too. The `QueryCoordinator` never calls it.
     */
    reconcile(projects: Project[], enabledSourceUrls: string[]): Promise<SessionSnapshot>;
}

// ─── Operations (ADR-003) ───────────────────────────────────────────────────

export interface OperationTicket<T> {
    opId: string;
    /** False when the queue refused the work (over capacity / disposed). `completion` then resolves to a `rejected` outcome. */
    admitted: boolean;
    /** Resolves exactly once with the terminal outcome; never rejects. */
    completion: Promise<T>;
    cancel(): void;
}

export interface OperationRunContext {
    opId: string;
    signal: AbortSignal;
    report(progress: Omit<OperationProgress, 'opId'>): void;
}

export interface OperationQueue extends Disposable {
    readonly isBusy: boolean;
    readonly activeCount: number;
    readonly pendingCount: number;
    readonly onDidChange: Event<{ active: number; pending: number }>;
    /** Fires for every `report()` of a running workflow with `opId` stamped; the host forwards it as the `ops/progress` event. */
    readonly onProgress: Event<OperationProgress>;
    /**
     * Submit a top-level workflow. Workflows run strictly one at a time (FIFO). Nested work inside a
     * workflow must call services directly — never `submit()` again (that would deadlock).
     */
    submit<T extends OperationOutcome | BulkOutcome>(
        label: string,
        run: (ctx: OperationRunContext) => Promise<T>,
        /** Builds the terminal outcome when the queue refuses the work. `opId` is the ticket's id, so a rejected outcome is correlated like any other (C-ops-5). */
        rejected: (reason: string, opId: string) => T,
    ): OperationTicket<T>;
    /** Resolves when the queue is idle (used by tests and the file watcher). */
    waitIdle(): Promise<void>;
}

// ─── Queries & invalidation (ADR-002) ───────────────────────────────────────

export interface QueryContext {
    signal: AbortSignal;
    /** Current generation of the resource being computed; results for an older generation are discarded. */
    generation: number;
}

export interface QueryHandle<T> {
    key: ResourceKey;
    generation: number;
    /** Resolves with the authoritative value for `generation`; rejects with `StaleQueryError` if superseded. */
    value: Promise<T>;
    /** Unsubscribe this consumer. The computation is cancelled only when the last subscriber leaves. */
    release(): void;
}

export class StaleQueryError extends Error {
    constructor(public readonly key: ResourceKey, public readonly generation: number) {
        super(`Query ${key} generation ${generation} was superseded`);
        this.name = 'StaleQueryError';
    }
}

export interface InvalidationEvent {
    scope: InvalidationScope;
    reason: InvalidationReason;
    /** Sequence number of this event: the coordinator's count of `invalidate()` calls folded into it. It is not a resource generation and is not comparable with `QueryHandle.generation` or the `generation` of a response envelope. */
    generation: number;
    /** Every key the coordinator has seen that `scope` reached, with its generation after this invalidation (the value a `QueryHandle` and an ok response envelope carry for that key). Keys never queried are absent. */
    keys: Array<{ key: ResourceKey; generation: number }>;
}

export interface QueryCoordinator extends Disposable {
    readonly onDidInvalidate: Event<InvalidationEvent>;
    /**
     * Subscribe to a resource. If a computation for the current generation is running, the handle
     * joins it; if a fresh value is cached, it resolves immediately; otherwise `compute` starts.
     * `onChunk` receives streamed intermediate values (per-project chunks, metadata enrichment).
     */
    query<T, C = never>(
        key: ResourceKey,
        compute: (ctx: QueryContext, emit: (chunk: C) => void) => Promise<T>,
        onChunk?: (chunk: C) => void,
    ): QueryHandle<T>;
    /** Bump generations for every key matching `scope` (merging with pending invalidations). */
    invalidate(scope: InvalidationScope, reason: InvalidationReason): void;
    /** Current generation for a key (0 when never computed). */
    generationOf(key: ResourceKey): number;
    /** Peek at the cached value without subscribing. */
    peek<T>(key: ResourceKey): { value: T; generation: number } | undefined;
}

// ─── Dotnet CLI (ADR-003 / S1) ──────────────────────────────────────────────

export interface DotnetResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
    /** Argv that was executed (for logging; never a shell string). */
    argv: string[];
    cancelled?: boolean;
    timedOut?: boolean;
}

export interface DotnetRunOptions {
    cwd: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    /** Extra environment variables, merged under the fixed CLI environment (ADR-003): a caller can add variables but cannot override `DOTNET_CLI_UI_LANGUAGE`, `DOTNET_NOLOGO`, `DOTNET_CLI_TELEMETRY_OPTOUT`, `NO_COLOR` or `TERM`. */
    env?: Record<string, string>;
}

export interface DotnetRunner {
    /** Execute `dotnet <args>` with argv (no shell). Resolves for every exit code; rejects only when the binary cannot be started. */
    run(args: string[], options: DotnetRunOptions): Promise<DotnetResult>;
    /** Resolve the SDK version that applies in `cwd` (honours `global.json`). Cached per directory. */
    sdkVersion(cwd: string): Promise<SdkInfo | undefined>;
    clearSdkCache(): void;
}

/** Where a capability value comes from. `'verified'` is used only when a tracked probe fixture proves it (`src/core/cli/__fixtures__/sdk-probes/`). */
export type CapabilityProvenance = 'verified' | 'documented' | 'assumed' | 'unverified';

export interface SdkInfo {
    version: string;
    major: number;
    /** `major >= 10` (D13). A project that resolves an unsupported SDK is `unsupported: 'sdk-too-old'` and read-only. */
    supported: boolean;
    /** `dotnet package add` writes the central version of a Central Package Management project (ADR-004 supplement). */
    cpmAwareAdd: boolean;
    /** P1.6 produces `'verified'` for SDK 10 from the P0.0 fixture and `'unverified'` otherwise; the other two values are reserved by the plan row. */
    cpmAwareAddProvenance: CapabilityProvenance;
}

// ─── HTTP transport, credentials, sources (ADR-005) ─────────────────────────

export interface TransportRequest {
    url: string;
    method?: 'GET' | 'HEAD';
    headers?: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal;
    /** Hard cap on the decoded body size; exceeding it fails with `too-large`. Default 10 MiB. */
    maxBytes?: number;
    /** Request `Accept-Encoding: gzip, deflate` and decode (needed for the ~20 MB vulnerability index). */
    acceptCompressed?: boolean;
}

export type TransportErrorCode =
    | 'network'
    | 'timeout'
    | 'cancelled'
    | 'too-large'
    | 'redirect-blocked'
    | 'too-many-redirects'
    | 'invalid-json'
    | 'http-error';

export interface TransportFailure {
    ok: false;
    code: TransportErrorCode;
    status?: number;
    message: string;
}

export interface TransportSuccess {
    ok: true;
    status: number;
    headers: Record<string, string>;
    body: Buffer;
    /** Final URL after redirects. */
    url: string;
}

export type TransportResult = TransportSuccess | TransportFailure;

export type JsonResult<T> = { ok: true; status: number; data: T; url: string } | TransportFailure;

/**
 * The only module allowed to open sockets. Honours VS Code proxy settings by routing HTTP/1.1
 * through Node's `https` module (which the extension host patches for proxies); HTTP/2 is used only
 * when no proxy is configured. One redirect/SSRF implementation; same-origin-only auth forwarding.
 */
export interface Transport extends Disposable {
    fetch(request: TransportRequest): Promise<TransportResult>;
    fetchJson<T>(request: TransportRequest): Promise<JsonResult<T>>;
    head(request: Omit<TransportRequest, 'method'>): Promise<TransportResult>;
}

export interface CredentialProvider {
    /** Resolve an `Authorization` header value for a source URL (nuget.config, credential provider, env). */
    getAuthHeader(sourceUrl: string): Promise<string | undefined>;
    /** Warm caches for the given sources without blocking. */
    prewarm(sourceUrls: string[]): void;
    clear(): void;
}

export interface SourceMutationResult {
    ok: boolean;
    error?: string;
}

export interface SourceProvider {
    /** Enabled + disabled sources effective for `projectDir` (uses `dotnet nuget list source` with that cwd). Cached per directory. */
    listSources(projectDir: string): Promise<import('../protocol/domain').NuGetSource[]>;
    /** Candidate `nuget.config` paths for adding a source (user-level + workspace-level). */
    configFiles(workspaceDir?: string): Array<{ path: string; label: string }>;
    add(options: { url: string; name?: string; username?: string; password?: string; configFile?: string; allowInsecure?: boolean; storeEncrypted?: boolean }, cwd: string): Promise<SourceMutationResult>;
    remove(name: string, cwd: string, configFile?: string): Promise<SourceMutationResult>;
    enable(name: string, cwd: string): Promise<SourceMutationResult>;
    disable(name: string, cwd: string): Promise<SourceMutationResult>;
    invalidate(): void;
}

/** Decides which feeds may be asked about which package ids (ADR-005). */
export interface OutboundPolicy {
    /** Sources (from `candidates`) that may receive a query for `packageId`. */
    allowedSourcesFor(packageId: string, candidates: import('../protocol/domain').NuGetSource[]): import('../protocol/domain').NuGetSource[];
}

// ─── Project model (ADR-004) ────────────────────────────────────────────────

export interface ProjectExecutionContext {
    projectPath: string;
    projectDir: string;
    workspaceFolder?: string;
    sdk?: SdkInfo;
    /** Effective `nuget.config` chain (nearest first) as reported by the SDK for `projectDir`. */
    configFiles: string[];
    /** Enabled source URLs in effect for this project (after `<clear/>`/mappings). */
    sourceUrls: string[];
    /** Changes whenever any input file (project, imported props/targets, global.json, nuget.config) changes. */
    revision: string;
}

export interface ProjectInspector {
    /** Fast static inspection (fast-xml-parser). Always `fidelity: 'provisional'`. */
    inspect(projectPath: string): Promise<InstalledResult>;
}

export interface ProjectEvaluator {
    /** Cached MSBuild evaluation (`dotnet msbuild -getItem/-getProperty`). `fidelity: 'authoritative'`. */
    evaluate(context: ProjectExecutionContext, signal?: AbortSignal): Promise<InstalledResult>;
    /** Report which fidelity is available right now without triggering evaluation. */
    cachedFidelity(projectPath: string): Fidelity | undefined;
}

/** The three reference edits the mutator decides on; a restore is not a mutation of the project file. */
export type MutationKind = Exclude<OperationKind, 'restore'>;

export interface MutationRequest {
    kind: MutationKind;
    packageId: string;
    /** Target version for `install`/`update`; absent for `remove` and for `install` of the latest version. */
    version?: string;
}

/**
 * `ok: true` carries whether the project uses Central Package Management as the decision saw it, so the command runs as
 * admitted (`isCpm` into `addPackageArgs`, never `--no-restore` with it; D7, N51). `ok: false` carries the explanation the
 * UI shows (SDK missing or below 10, unsaved project or props file, unverified CPM capability, an unresolved row or an
 * override that holds in some target frameworks only, a Central Package Management edit without a version).
 */
export type MutationDecision = { ok: true; isCpm: boolean } | { ok: false; error: string };

/**
 * ADR-004 tier 3. Decides whether a reference edit may run in `context` and previews its Central Package
 * Management impact. Provenance checks (`cpmAwareAddProvenance === 'verified'`, D7) live here and nowhere else.
 * Implemented in P6.3; `HostServices.mutator` is absent until then (P2.9). Any further member is a contract change of its own.
 */
export interface ProjectMutator {
    canMutate(context: ProjectExecutionContext, request: MutationRequest): Promise<MutationDecision>;
    /** `undefined` when the project is not CPM, the package has no central entry, or the asking project overrides the central version (then the edit reaches that project alone). */
    previewCpmImpact(context: ProjectExecutionContext, packageId: string, toVersion: string): Promise<CpmImpactPreview | undefined>;
}

# Architecture

This document describes the technical architecture of the nUIget VS Code extension.

## 2.0 Architecture

nUIget 2.0 is a re-architecture on audited contracts: a platform-agnostic core (`src/core`: the CLI runner, the
project model with its static inspection, MSBuild evaluation and edit gate, package sources and credentials, the
feed clients over one HTTP transport, the query coordinator and the Catalog of reads, the operation queue and
workflows), a typed protocol between host and webviews (`src/protocol`), a host layer that adapts VS Code to the
core (`src/host`), a composition root (`src/extension.ts`), and one shared webview code base for the main
panel and the sidebar (`src/webview/{shared,main,sidebar}`). It was built next to 1.x under a build flag,
replaced it in one step at the flip (plan item P8.1), and the 1.x sources were deleted at P8.2. The sections below
describe the tree, and the module map names the item that brought each part.

### Decisions and plans

| Document | Subject |
| --- | --- |
| [Execution plan](docs/plans/2026-10-11-nuiget-2.0-execution-plan.md) | Decisions D1–D13, work items, gates |
| [Item tracker](docs/plans/STATUS.md) | State of every work item |
| [ADR-000](docs/adr/000-release-and-compatibility-policy.md) | Release and compatibility policy: clean break, .NET SDK 10 floor, VS Code 1.85 / Node 18 baseline |
| [ADR-001](docs/adr/001-session-store.md) | Host-owned session state (`SessionStore`) |
| [ADR-002](docs/adr/002-query-coordinator.md) | Resource queries, generations and invalidation (`QueryCoordinator`) |
| [ADR-003](docs/adr/003-operation-queue-and-dotnet-runner.md) | Operation queue outcomes and shell-free CLI execution |
| [ADR-004](docs/adr/004-project-model.md) | Three-tier project model and Central Package Management; [SDK probes](docs/adr/004-sdk-probes.md) |
| [ADR-005](docs/adr/005-execution-context-and-outbound-policy.md) | Project execution context and outbound request policy |
| [ADR-006](docs/adr/006-icons-and-csp.md) | Host-side icon resolution and webview CSP |
| [ADR-007](docs/adr/007-protocol.md) | Typed envelope protocol for webview ↔ host |
| [ADR-008](docs/adr/008-webview-architecture.md) | Webview architecture: shared slices, primitives, two entry points |
| [UX interaction model](docs/ux/interaction-model.md) | Keyboard, focus and state behaviour of the 2.0 UI |

### Protocol and contracts

`src/protocol/**` is the single contract between the host and both webviews (ADR-007). Nothing else crosses
`postMessage`.

| File | Content |
| --- | --- |
| `domain.ts` | Data types both sides share: projects, packages, sources, session, resource keys, operation outcomes |
| `messages.ts` | `RequestMap` (44 requests, each with `payload`, `result` and an optional stream `chunk`) and `EventMap` (11 events) |
| `envelope.ts` | The shapes on the wire (`request`, `cancel`, `stream`, `response`, `event`), their factories and `ProtocolRequestError` |
| `guards.ts` | Runtime validation in both directions: `parseInbound` for the host, `parseOutbound` for a webview |

A webview sends a request with an `id`. The host answers that `id` with exactly one response, which is either
a result or an error, and may send stream chunks before it. A result that was read from a cached resource
carries the `generation` of that resource on the response envelope, so a webview can discard a result that an
invalidation has overtaken (ADR-002, ADR-008). Events go from the host to the webviews without an `id`. The
two parse functions return `undefined` for anything that is not a valid envelope, so neither side switches on
an unchecked `type`.

The type names exist only at compile time, so `guards.ts` lists them again for the runtime check. Each list is
a record checked with `satisfies Record<RequestType, true>` (or `EventType`): the compiler rejects a list that
lacks a type of the map or names one the map does not have.

`src/core/contracts.ts` holds the interfaces the core modules implement or consume, grouped by decision record:
platform adapters (`KeyValueStore`, `Logger`, `Event`), `SessionStore` (ADR-001), `QueryCoordinator` (ADR-002),
`OperationQueue` and `DotnetRunner` (ADR-003), the project model with `ProjectMutator` (ADR-004), and
`Transport`, credentials, sources and the outbound policy (ADR-005). It imports types from
`src/protocol/domain.ts` only.
`KeyValueStore.update` returns `PromiseLike` instead of `Thenable`, a global that only the VS Code declarations
provide, so the file does not depend on them.

The reference [`docs/protocol.md`](docs/protocol.md) is generated from `messages.ts` by
`npm run docs:protocol` (`scripts/gen-protocol-docs.mjs`, which reads the two maps through the TypeScript
compiler API). `npm run docs:protocol:check` regenerates it in memory and fails when the committed file
differs; the Lint job of CI runs it.

These files are frozen (plan decision D6): they change only in a plan item that names them.

### Module map


| Path | Role | Since |
| --- | --- | --- |
| `src/protocol/**` | Message and domain types shared by host and webviews | P1.1a, P1.1b |
| `src/core/contracts.ts` | Interfaces of the core modules | P1.1a, P1.1b |
| `src/core/util/**` | Leaf helpers of the core: `Emitter` and `toDisposable` (`events.ts`), `batchedPromiseAll` and `raceFirst` (`concurrency.ts`), `fileExists`, `readTextIfExists` and `findUp` (`fs.ts`), `normalizeProjectPath`, `isPathInside` and `fromMsBuildPath` (`paths.ts`), `topologicalSortByDependency` (`topo.ts`) | P1.2 |
| `src/core/versioning/**` | NuGet versions and version specifications as separate types: `parseVersion`, `compare`, `normalize`, `selectLatest` (`NuGetVersion.ts`); `parseVersionSpec`, `satisfies`, `resolveFloating`, `isUpdateCandidate`, `effectiveInstalledVersion`, `toDomainSpec` (`VersionRange.ts`). Parsing never coerces: text that is not a version is `undefined`, never `0.0.0`. An exact pin such as `[1.0.0]` is not an update candidate. `CONFORMANCE.md` is the conformance table against NuGet's package-versioning rules (normalization, precedence, what is not a version); `conformance.test.ts` runs every row of it and checks the laws (idempotent `normalize`, a total order, equality as normalized text ignoring case, metadata ignored, sorted output) on versions from a seeded generator | P1.3, P6.5 |
| `src/core/cache/**` | Cache for data fetched from feeds. `CachePolicy.ts` is the one table of lifetimes, key builders (`cacheKeys`) and clear scopes; `invalidationToCacheScopes` maps an invalidation of query resources (ADR-002) to the scopes and packages to drop. `TieredCache` puts an LRU memory tier in front of an optional persistent store, which is limited to 500 entries and 8 MiB of serialized entries; over the limit it evicts expired entries, then the soonest to expire, then the oldest permanent ones, and an entry larger than the whole budget stays in memory only. `clearPackages` drops the version lists and metadata of named packages; icons and READMEs are keyed by exact version and are never dropped by an invalidation `orphanedStoreKeys(store)` lists the keys under the cache's prefix that its index does not name, so the host can remove what 1.x's `WorkspaceCache` left under the same prefix (P7.1). | P1.4 |
| `src/core/logging/**` | Credential redaction for everything that reaches a log. `redact(text)` removes URL userinfo (a password pair or a lone token), secret query parameters, `Authorization`, `Proxy-Authorization`, `Cookie` and API key headers, `--password` and `--api-key` values (quoted values whole), `nuget.config` credentials, JSON Web Tokens and GitHub and nuget.org tokens. `redactArgv(argv)` replaces the value after a secret option by position, so a secret with spaces cannot leak. Both prefer redacting too much. They are functions, not a logger: a module that logs calls them itself | P1.5 |
| `src/core/cli/**` | The only module that starts processes (ADR-003). `DefaultDotnetRunner` spawns `dotnet` with an argv array and no shell, with a fixed environment that a caller cannot override (`DOTNET_CLI_UI_LANGUAGE=en`, `DOTNET_NOLOGO`, `NO_COLOR`, `TERM=dumb` and others), output caps, a timeout that escalates from SIGTERM to SIGKILL, and cancellation; success is exit code 0. `sdkVersion(cwd)` probes the SDK a directory resolves and caches a definitive answer (a version, or a non-zero exit) but never a transient one (not started, timed out, cancelled, unreadable output). `sdk.ts` maps a version to `SdkInfo`: `supported` from major 10 on, and the Central Package Management capability as `verified` only for a major that has a tracked probe fixture. The fixtures (`__fixtures__/sdk-probes/<sdk>.json`) are written by `scripts/probe-sdk.mjs`, which runs the `package add`/`remove`/`restore` rows on the CPM input in `__fixtures__/sdk-probes/cpm` (each in a fresh copy, diffs against the pristine files), the properties run and one `-getItem:PackageReference;PackageVersion` run per target framework on that input and on `src/core/project/__fixtures__/multitfm`, and derives the verdict from the rows; the CI job `SDK probe` re-runs it on the newest SDK 10 with `--check` and fails when exit codes, diffs, evaluations or verdict differ from the tracked fixture. `commands.ts` builds argv for the noun-first `dotnet package add/remove`, `restore`, `package search`, `msbuild -getItem/-getProperty` and `nuget … source`; `addPackageArgs` refuses `--no-restore` for a Central Package Management project. `validate.ts` rejects what the CLI would misread; `powershell.ts` runs a script through `-EncodedCommand` on Windows | P1.6 |
| `src/core/http/ssrf.ts` | Pure helpers for following redirects safely (ADR-005); no I/O. `classifyAddress` puts an IP literal into `public`, `private`, `loopback`, `link-local`, `unspecified`, `multicast` or `reserved`, and looks at the IPv4 address inside IPv4-mapped, NAT64 and 6to4 IPv6 addresses. `isSafeRedirectTarget` refuses a downgrade from HTTPS, every scheme but http and https, `localhost` names and every IP literal that is not public, except when the target is the host already being talked to (a private feed may redirect to itself). `resolveRedirect` turns a status and a `Location` into the next request: 301, 302, 303, 307 and 308 are followed, a 303 is re-issued as GET, and the `Authorization` value goes to the same origin only. `redactUrl` removes credentials from a URL for logs. `index.ts` exports these and nothing else | P1.9 |
| `src/core/http/Transport.ts` | `NodeTransport`, the only module of the 2.0 core that opens sockets (ADR-005, `docs/adr/005-proxy-matrix.md`): HTTP/1.1 through `http`/`https` request functions with no agent of its own, so that the extension host's proxy patch applies; HTTP/2 for allow-listed origins while the injected proxy predicate is false, with a connection-level failure downgrading the origin for the instance's life and `reset()` to start over; five redirects re-validated with `ssrf.ts` and by resolved address under the request's deadline; size cap, gzip/deflate, and redirect, error and HEAD bodies never read | P4.2 |
| `src/core/feeds/**` | The NuGet V3 feed clients (ADR-005): `serviceIndex.ts` (endpoints per source, 10 min success cache, one shared discovery per source that a cancelling caller does not cut short, failures into `SourceHealth` for 120 s), `health.ts` (the tracker and the re-probing monitor), `flatContainer.ts` (version index, nuspec, size, download, and an icon result of `found`, `missing` or `failed`), `relevance.ts` (search ranking across feeds), `wire.ts` (wire shapes and helpers), `icons.ts` (`DefaultIconResolver`: one shared resolution per package version that runs until its last caller gives up, a miss cached for 24 h only when a feed answered, never after a failure; a source skipped after five consecutive 404/410 answers until a `sources` or `workspace` invalidation, where failures and answers that are no usable icon never count and any other answer clears the count; `TieredCacheIconCache` puts icons into the persistent tier's byte budget; `toImageDataUri` checks size and image type), `readme.ts` (README through the feed's template or the package archive, entries bounded by their declared size), `readmeImage.ts` (`ReadmeImageFetcher`: README images as `data:` URIs, https and public hosts only on the first hop, the source credential only to the source's own origin, found images in a 64-entry LRU), `nuspec.ts` (`parseNuspec`: a DOCTYPE is refused, empty dependency groups kept, the license only from an expression; `nuspecToMetadata`), `offline.ts` (`OfflineMetadataReader`: metadata from the global-packages folder, whose resolver the composition root injects, marked `offline` and never cached), `search.ts` (`DefaultSearchClient`: the V3 search service of each source and `dotnet package search --format json` for the rest, merged by id with the first-listed source winning, ranked by relevance only when two or more origins answered, `sourcesUnavailable` when a source did not answer; a free-text query goes to every source handed in, a query that names a package id only where the outbound policy allows it; quick search through the autocomplete service where a source has one; no default source and no remote `iconUrl`), `registration.ts` (`DefaultRegistrationClient`: listed-only versions from the search service or the registration index without unlisted entries, every version from the flat-container index, metadata from the registration leaf or index; `[]` for an unknown package, `undefined` for a source that could not answer; the policy asked first), `vulnerability.ts` (`DefaultVulnerabilityClient`: each source's `VulnerabilityInfo` data downloaded once, compressed and under a 64 MiB cap, shared by concurrent callers and kept for the policy's TTL only when the index and every page loaded; `sourcesUnavailable` otherwise), `updates.ts` (`DefaultUpdateChecker`: candidates by `isUpdateCandidate`, compared against the effective installed version, every allowed source awaited and the newest version across them taken, bare rows, `sourcesUnavailable` when an allowed source could not answer), `enricher.ts` (`DefaultMetadataEnricher`: verification, authors and description from the first allowed source that knows the id, the icon as a data URI, vulnerabilities from every source's data and absent when unknown), `metadataResolver.ts` (`DefaultMetadataResolver`: registration, nuspec, then search per allowed source, offline from the global-packages folder when none answered; versions as a union with `sourcesUnavailable`; no cache, so no metadata bleeds between sources) | P4.3–P4.8 |
| `src/core/ops/PackageWorkflows.ts` | Orchestration of install, update, remove and restore over the CLI runner (ADR-003); no VS Code API and no messaging. Every reference edit first passes one admission gate: `contextFor(projectPath)` (the host's chain-less execution context, memoized per project for one operation) and `mutator.canMutate(context, request)` (D7, D13). A context that cannot be built, a mutator that throws and a refusal end the edit with that message; nothing is spawned for a refused request. The command is built from the decision's `isCpm` alone (N51): a non-CPM add runs with `--no-restore`, a Central Package Management add without it (its implicit restore runs whatever the restore toggle says). For an admitted CPM `install` or `update` the workflow takes `previewCpmImpact` before the edit (a failing preview refuses it); the other projects that share the central entry are `affectedProjects` of the outcome and are restored once after the edited project (bulk: after all edited projects, each once), under the same toggle and abort rules; a single edit reports the restores as one step, the edited project's failure first and each failure prefixed with its project's file name. Restores are never gated. The edit (`dotnet package add` or `dotnet package remove`) and the restore are separate steps with separate results: a failed restore after a successful edit is `partial`, and an abort between the two yields `cancelled` with the edit reported as done and the restore as skipped when a restore was wanted; with the restore switched off the operation is `completed`, because nothing remained to cancel. Bulk workflows order projects and packages by dependency, continue past a refused or failed request, restore each changed project once after all edits, and end `cancelled`, `completed`, `failed` or `partial`. Every progress report names the kind, the projects and the packages. Command lines, output and error texts are redacted before they reach `onCommand`, an outcome or the log | P1.10, P6.3b |
| `src/core/ops/OperationQueue.ts` | `DefaultOperationQueue` (ADR-003). One top-level workflow runs at a time, in submission order; five may wait behind it. `submit(label, run, rejected)` decides admission synchronously and returns a ticket with an `opId`, `admitted`, `cancel()` and a `completion` that resolves exactly once and never rejects: with the workflow's outcome, with `rejected(reason, opId)` when the queue is full or disposed, with `failed` when `run` threw, or with `cancelled` when the ticket was cancelled before the workflow started. The queue builds the last two from the caller's `rejected` outcome and replaces `status` and `message`. A workflow submitted to an idle queue starts on a microtask, so a progress listener attached right after `submit` sees the first report; `onProgress` carries every report with its `opId`, and none after the outcome. The ticket is settled and the slot freed in the same turn, so whoever awaits `completion` sees the queue without that workflow. `cancel()` on the running workflow only aborts its signal. `index.ts` exports the queue and the workflows | P2.1 |
| `src/core/project/{xml,discovery,assets,central,references}.ts` | The file-reading part of the project model (ADR-004 tier 1), without the inspector. `xml.ts` parses MSBuild XML after validating it (`XmlParseError` with file and line), reads attributes whatever their case, and takes the last definition of a property. `discovery.ts` finds project files with one search, attributes each to its deepest workspace folder, and classifies a project from its text as `sdk-style`, `legacy`, `packages-config` or `unknown`. `assets.ts` reads `obj/project.assets.json` and `packages.lock.json` through `AssetsReader` (parsed once while the file is unchanged, for 30 s, five documents at most): resolved versions for the project and per target framework, package dependencies, and transitive packages with their top-level roots, found by a search that is safe on cyclic graphs; a missing or unreadable file is reported as a category, never as an error text. `central.ts` finds the nearest `Directory.Packages.props` below a stop directory and reads its `PackageVersion` entries; conditions are not evaluated, an entry that depends on one is marked `conditioned`. `references.ts` lists the projects a project references (`ProjectReference`, with backslash paths converted on every platform) and builds the map project → referenced projects, with normalized paths, that orders multi-project operations. Fixtures, including a tracked `obj/`, are under `__fixtures__/` | P2.2, P2.3 |
| `src/core/project/inspector.ts` | `StaticProjectInspector` (ADR-004 tier 1): what a project references, read without MSBuild from the project file, the nearest `Directory.Build.props` and the nearest `Directory.Packages.props`. Every row says where its version comes from: `project`, `props`, `central`, `central-override`, or `unresolved` with an empty version when deciding would need evaluation (a `$(Property)`, a condition other than `'$(TargetFramework)' == 'x'`, a conditioned or missing central entry, a guarded `Update` that covers a reference only partly). A plain framework condition limits a row to that framework; rows that differ only in framework are merged, and a row that covers every declared framework has no limit. `resolvedVersion` comes from the restore output for the row's framework. The answer is always `provisional` and `inspect` never rejects: a `packages.config` project, a project that is not SDK-style, a missing file, and a project or props file that cannot be read or parsed are reported as `unsupported` with a reason, the last one so that a broken `Directory.Packages.props` cannot make a CPM project look like an ordinary one. `index.ts` exports the six modules by name | P2.4 |
| `src/core/project/{context,revision}.ts` | `ProjectContextProvider` builds the `ProjectExecutionContext` of a project (ADR-005): the SDK that applies in its directory, the `nuget.config` chain as `dotnet nuget config paths` reports it (nearest first), the URLs of the sources enabled for that directory, and a revision. A project whose SDK is below 10 comes back with `unsupported: 'sdk-too-old'` and a complete context, because it stays readable (D13). The revision is a short hash over path, modification time and size of the project, the nearest `Directory.Build.props`, `Directory.Build.targets` and `Directory.Packages.props`, the nearest `global.json` and the config files; it changes when one of them changes, appears or disappears, and it keys the evaluator cache (ADR-004). `get(projectPath, workspaceFolder, { configChain: false })` builds the context of a mutation decision: no `dotnet nuget config paths`, `configFiles` empty, a revision over the project's own files; such a context never reaches `FeedContexts.register` or the evaluator | P2.5 |
| `src/core/project/{evaluator,rows}.ts` | `MsBuildProjectEvaluator` (ADR-004 tier 2): one combined run of the four properties (`TargetFramework`, `TargetFrameworks`, `ManagePackageVersionsCentrally`, `CentralPackageVersionOverrideEnabled`, always the four: `-getProperty` with one name prints a bare value) and the `PackageReference` and `PackageVersion` items with no global property; when `TargetFrameworks` is empty its items are the result (a single-framework project costs one run, P7.2c), and when it is set they are the outer build's, lacking the conditional and SDK-implicit references, so one `-getItem:PackageReference,PackageVersion -p:TargetFramework=<tfm>` run per target framework follows; all through `DotnetRunner.run` with `msbuildGetArgs` in the project directory; the JSON is read from the first line that starts with `{`. Each item becomes a row in the inspector's order of decisions: a property in a version is `unresolved`; under CPM `VersionOverride` is `central-override` while overrides are enabled (`""` counts as enabled), else `unresolved`; a `Version` is `project`, or `props` with `definedIn` when `DefiningProjectFullPath` is not the project (an SDK-injected reference is `props`, `isImplicit`, with the SDK's file); otherwise the `PackageVersion` item of the same id is `central`, else `unresolved`. Rows are merged across frameworks by id, version, declaration and implicitness, and `targetFrameworks` is set only where a row is missing from some framework; `centralPropsPath` comes from the `PackageVersion` items, else the nearest `Directory.Packages.props`. Successes are cached per project (normalized path) and revision, one shared promise per revision; the runs are bound to no caller's signal, because the coordinator aborts a stale computation and the next computation of the same revision joins the promise in flight instead of restarting the runs (each run is bounded by its timeout; a caller already cancelled starts nothing, N79); a failure (non-zero exit, timeout, cancellation, no JSON: `EvaluationError`, logged redacted) is never cached. No `resolvedVersion`: the Catalog keeps the inspection's. `rows.ts` holds `resolvedRow` and `unresolvedRow`, used by both tiers. The tests replay the `evaluations` of the SDK probe fixture (P6.1); a gated test evaluates the multi-target fixture with the real SDK `cachedFidelity(projectPath)` is declared in `src/core/contracts.ts:323` and implemented, but nothing consumes it; P8.2 may delete it behind the sentinel. | P6.2a |
| `src/core/project/mutator.ts` | `DefaultProjectMutator` (ADR-004 tier 3; deps: the inspector, `isDirty(file)`, `discoverProjects()`). `canMutate(context, request)` decides in this order: no SDK in the context, an SDK below 10, unsaved changes of the project file, a project the inspection reports unsupported; a `remove` is then admitted (whatever the provenance and the props file's state); an `install` or `update` of an `unresolved` row, or of an id that overrides the central version in some target frameworks only, is refused, while an id whose every row overrides is admitted as a CPM edit and `previewCpmImpact` answers `undefined` for it (the add rewrites the override and leaves the props file, probe row `add-override`, N74); a non-CPM edit is admitted; a CPM edit needs a verified CPM-aware SDK (`cpmAwareAddProvenance === 'verified'`, read only here), a version, the props file and no unsaved changes in it. `ok: true` carries `isCpm`. `previewCpmImpact` reads the central entry and lists every discovered project that imports the same props file (paths compared normalized) and references the package through it, the requesting one included. The mutator writes no file and caches nothing | P6.3a |
| `src/core/sources/**` | Package sources and the outbound rule (ADR-005). Two things are true about sources and they come from different places. Name, address and enabled state of the sources of a project directory come from the dotnet CLI (`DotnetSourceProvider`: `dotnet nuget list source` with that directory as working directory), which applies the config chain, `<clear />` and disabled sources itself; a listing is kept per directory until it is invalidated or a source is added, removed, enabled or disabled, and a failed listing is an error, not an empty list. What the CLI does not print comes from the files: `NuGetConfigReader` parses one `nuget.config` in document order (credentials with `%VAR%` and DPAPI on Windows, with the entropy `NuGet` that NuGet uses, package source mapping, the place of each `<clear />`), and `mergeConfigChain` merges a chain from the farthest file to the nearest, where an entry replaces an earlier one of the same key whole and `<clear />` discards everything before it. `DefaultOutboundPolicy` decides which sources may be asked about a package id: enabled ones only, and with a mapping only those that declare the winning pattern (an exact id over any prefix, a longer prefix over a shorter one, `*` last); when those are disabled or absent the id is sent nowhere. No source is recognized by its address | P2.6 |
| `src/core/credentials/**` | `DefaultCredentialProvider` answers the `Authorization` header for a source URL (ADR-005) from three places, in this order: the environment (the external feed endpoints variable, then the access token for Azure Artifacts), the `nuget.config` chain (clear text, or DPAPI on Windows; when decryption fails the next step runs, and a decryption that times out is transient like a plugin timeout; the encrypted text is never sent), and the Azure Artifacts Credential Provider, run as the cross-platform plugin through the dotnet runner with the URL as one argument. `nuget.config` credentials are keyed by source name, so a URL is joined to its source first (`credentialForUrl`). A header is kept for 30 minutes and "none" for 5; what could not be found out (a timeout, a failed start) is not kept. Hosts are recognized by host name. Nothing secret is logged, and the output of the plugin is never logged at all | P2.7 |
| `src/core/catalog/**` | `Catalog`, the use cases both hosts call for reads ([ADR-009](docs/adr/009-catalog.md)). Every cacheable read is one `QueryCoordinator.query` under the `resourceKeys` key of its request, so the main panel and the sidebar share one computation. `installed(projectPath)` resolves with `{ result, upgrade? }`: the provisional result of the static inspection at once, and, when an evaluation has started, the authoritative result through `upgrade`, which is also what the coordinator caches for later readers. The computation streams the provisional result as the chunk `{ kind: 'provisional', result }` of `installed/get` (the request's only chunk; a cache hit and a joiner get none) and evaluates every supported project whose context could be built (`MsBuildProjectEvaluator`, cached by revision); the evaluated row is complete and wins, and only `resolvedVersion` is kept from the inspection. A failed evaluation answers the provisional result, which the coordinator keeps until the next invalidation of the key. Lite metadata stays outside `installed/get`: the views ask `transitive/metadata` for the rows they show. A project whose SDK is below 10 keeps its packages and is marked `unsupported`; a context that cannot be built is logged and does not hide the package list. The all-projects reads are fan-outs over the per-project resources that emit the protocol's chunk types. A handle whose generation is superseded is released and the query asked again, three times at most. `invalidate(scope, reason)` is the single entry for invalidation. No directory is taken from `process.cwd()`. The feed reads (`updates`, `allProjectsUpdates`, `transitiveMetadata`, `search`, `quickSearch`, `versions`, `metadata`, `readme`, `readmeImage`, `prewarm`, `sourceHealth`) resolve their sources, policy and credentials from `FeedContexts`, one feed context per effective `nuget.config` chain (sources, merged config, `DefaultOutboundPolicy`, policy-bound clients from `createFeedClients().forPolicy`), reached through `ProjectContextProvider.get` for a project and through the directory the host names otherwise; the `installed` computation hands the chain of its own walk to `FeedContexts.register`, so a feed read of that directory walks nothing, and a directory's chain is kept until `invalidate`. `allProjectsInstalled` follows each project's chunk with a `metadata` chunk of its rows' lite metadata (live vulnerabilities); `sourceHealth()` lists the failed sources. `versions` and `metadata` are fan-outs over one coordinator resource per allowed source (`resourceKeys.versions(id, source.url, …)`, `resourceKeys.metadata(id, version, source.url)`; the `'all'` keys are never written, N70). An incomplete answer (`sourcesUnavailable`, offline or no metadata) is delivered but not cached: its compute throws `IncompleteResultError(value)`, which `queryWithRetry` unwraps with the handle's generation. `updates` streams bare rows and answers them enriched without vulnerability data (`searchEnricher`); `transitiveMetadata` enriches with live vulnerabilities; `invalidate` of sources or workspace also clears the feed contexts and resets the shared feed clients A search that names no `take` returns 20, the contributed default of `nuiget.searchResultLimit` (P7.5a; the host always passes one). | P2.8 |
| `src/core/session/**` | `DefaultSessionStore`, the only writer of the shared session state (selected project, selected source, prerelease and restore switches; ADR-001). An intent is normalized against the project and source lists of the last `reconcile`, committed in memory at once with a higher `rev`, broadcast, and then persisted in revision order; a failed write is logged and does not undo the change. The host calls `reconcile` whenever the project list or the source list changes, which includes a change of the selected project, because sources resolve per project directory | P1.7 |
| `src/core/queries/QueryCoordinator.ts` | `DefaultQueryCoordinator` (ADR-002). A resource key has a generation that every invalidation raises. `query(key, compute)` joins the computation that is running for the current generation, answers from the cache when the cached value is of that generation, and otherwise starts one; streamed chunks reach every subscriber that has not released its handle. An invalidation during a computation aborts its signal and rejects its handles with `StaleQueryError`, and the late result is never cached. If a subscriber is still there, the recompute for the new generation starts at once, so a consumer that asks again joins it; the old handles keep it alive only until a consumer joins, it settles, or the next invalidation. Invalidations of one tick are merged into one `onDidInvalidate` event that lists every affected key with its new generation; the event's own `generation` only numbers the events. Values are kept for the 200 most recently used keys | P1.8 |
| `src/core/queries/scopes.ts` | The two tables of ADR-002 as pure functions: `scopeMatchesKey` says whether an invalidation scope reaches a resource key, `mergeScopes` combines two pending scopes into one that reaches at least what both reach. Project paths are compared after `normalizeProjectPath`, so spelling differences on Windows do not hide a match; package ids compare case-insensitively | P1.7 |
| `src/host/**` | Adapts VS Code to the core (ADR-007); no business logic. `WebviewHost` is the base of both surfaces: it decodes an inbound envelope with the protocol guards, calls the handler registered for its type and posts exactly one terminal response per request id, an error envelope included (`unsupported` for a type nobody registered, `failed` for a thrown error, the code of a `HostRequestError`). A handler whose result is a coordinator resource sets `ctx.generation`, and the base puts it on the ok envelope (ADR-007); an error response and a chunk never carry one. A request's `AbortSignal` is aborted with a reason: `cancelled` when the webview sent a cancel envelope, `disposed` when the surface went away, and nothing is posted to a disposed surface. An error whose `code` is `not-yet-available` (a Catalog read that waits for the feeds, ADR-009) is answered as `unsupported`. `handlers.ts` registers the handlers both surfaces share (`registerSharedHandlers`): reads call one Catalog method and forward its chunks unchanged; `operations` has one typed submit function per `ops/*` request, which validates the payload (a real project, a non-empty batch), takes the restore switch as it is at submission and hands the workflow to the `OperationQueue`; `awaitTicket` ties the ticket to the request (opening chunk `queued` or `rejected` with the ticket's `opId`, progress of that operation as chunks, a webview cancel cancels the ticket, a disposed surface does not), and `settleOperation` announces the outcome to every surface and invalidates what it changed. A forced restore of `transitive/get` is such a ticket too. `sourceDirectory` decides where sources are resolved: the directory of the selected project, else the first workspace folder, else a `not-found` error. `services.ts` holds `HostServices` (what the composition root hands to both hosts), `readExtensionConfig` (the one reader of the `nuiget` settings), `renderWebviewHtml` (the Content Security Policy of ADR-006 with a script nonce of 16 random bytes per render) and `createWorkflowDeps` (the dependencies of `PackageWorkflows`, with the answer to "is this a Central Package Management project" kept per project while an operation runs). `MainPanelHost` and `SidebarHost` attach the webviews, forward session, configuration, operation and invalidation events, and the sidebar turns a context-menu choice into a typed operation; before a single install or update that names a version it asks `mutator.previewCpmImpact` over `contextFor`, and when the package has a central entry it confirms the central change in a VS Code modal that lists the projects it reaches (nothing is submitted on Cancel; a failed preview leaves the decision to the gate). `handlers.ts` answers `cpm/preview` (P6.4a) with that preview, or `null`, for the main panel's dialog. `HostServices.contextFor(projectPath)` is the chain-less execution context of a preview outside an operation; `pickers.ts` has the quick picks; `legacyState.ts` sweeps the 1.x storage at activation (P7.1) Install from the sidebar's browse under All Projects leaves out the picked projects where the package has a central entry or whose preview fails, and names them (N76, P7.5a). Both 2.0 shells (`MainShell`, `SidebarView`) send `perf/mark` `webviewReady` once at mount and `firstUsefulRender` once when the first installed list is shown; the host writes them at Info when `nuiget.enablePerformanceLogging` is on (N81, P7.fix-2). | P2.9 |
| `src/extension.ts` | 2.0 composition root: it assembles and holds no business logic. `activate` calls `activateWith(context, overrides)`, whose overrides (`spawn`, `resolveExecutable`, `transport`) exist for tests and which returns `{ services, ready }`. Composition order: the output channel and one `redactingLogger` over it, which is the only `Logger` the core and both surfaces get (every message, string argument and error passes `redact`); `sweepLegacyState` (`src/host/legacyState.ts`), which removes the eight 1.x `nuget.*` keys, `nuiget.sdkVersionCache` and the `nuiget.cache.*` entries the `TieredCache` index does not list, migrating nothing (ADR-000, P7.1); `DefaultDotnetRunner` with its SDK cache hydrated from `globalState` under `nuiget.sdkVersionCache.v2`; a `TieredCache` over `workspaceState`; `DotnetSourceProvider`; `AssetsReader`, `StaticProjectInspector` and `ProjectContextProvider` sharing one `stopDirs` array that a workspace-folder change refills in place; `DefaultQueryCoordinator`; `DefaultSessionStore`; `DefaultOperationQueue`; the feeds: a `NodeTransport` (unless overridden) whose proxy predicate is `proxyConfigured()` (`http.proxySupport` not `off` and `http.proxy` or a proxy environment variable set, read on every call; an `http` setting change calls `transport.reset()`), a `NuGetConfigReader`, one shared `DefaultCredentialProvider` whose `nuget.config` credentials come from the registered feed contexts, one shared `DefaultServiceIndexClient`, `createFeedClients` and `FeedContexts`; one `SourceHealthTracker` shared by the service index and a health monitor (`startHealthMonitor`) that runs no `dotnet`: it probes the sources of the chains reads registered (`FeedContexts.registered()`), is restarted by `onDidRegister` and by a sources or workspace invalidation, and its changes reach both surfaces as `sources/health` without invalidating anything; the `Catalog`; `PackageWorkflows` over `createWorkflowDeps`; `HostServices` (`onOperationProgress` is `queue.onProgress`; `workspaceFolderFor` answers the deepest workspace folder that contains a path); the `SidebarHost` view provider. Every coordinator invalidation is forwarded unchanged to the sidebar and to the open main panel. `refreshProjectsAndSession` discovers the projects, announces them, sets `nuiget.hasProjectFiles`, lists the enabled sources of the project the store will keep or pick, and skips the reconcile when the selection moved during the listing (the coalesced rerun does it); otherwise it calls `session.reconcile`; it runs at activation, after an invalidation of scope `workspace`, `project` or `sources`, and when the selected project differs from the one last reconciled for (ADR-001: another project is another source list). Runs never overlap: requests during a run cause one more run. A source listing that fails is not an empty list: the last list of that directory, or else only the selected source, is passed on, so the selection survives. Six file watchers, debounced, invalidate after the queue is idle: project files and `packages.lock.json` (scope `project`), `Directory.{Build,Packages}.{props,targets}` and `global.json` (scope `workspace`; `global.json` also clears the SDK cache), `nuget.config` (scope `sources`), `obj/project.assets.json` (scope `project`, reason `restore`). One status bar item shows the queue. It registers exactly the 12 contributed commands. `MsBuildProjectEvaluator` (P6.2b) is composed with the runner, the shared `stopDirs` and the logger and handed to the `Catalog`. `DefaultProjectMutator` (P6.3b) is composed with the inspector, an `isDirty` adapter over `vscode.workspace.textDocuments` (file documents with unsaved changes, paths compared normalized) and `catalog.projects()` as its project list; it is `HostServices.mutator` and reaches the workflows through `createWorkflowDeps` with the context provider and `workspaceFolderFor`. | P2.10 |
| `src/webview/shared/**` | The code both webviews share (ADR-008): `tokens.css` (the only colour literals, aliases of `--vscode-*`), `primitives/` (`Listbox`, `Row`, `Dialog`, `ConfirmDialog`, `Popover`, `Tabs`, `Toolbar`, `SectionHeader`, `Sash` and the smaller ones, the icons, the layer stack `layers.ts` and `primitives.css`), `bus/` (the message bus over the protocol, stale answers dropped by id and generation), `store/` (the slices `session`, `projects`, `installed`, `transitive`, `updates`, `allProjects`, `search`, `details`, `sources`, `config`, `ops` and `useResource`), `installed/rules.ts`, `search/SearchBox.tsx`, `allProjects/folderGroups.tsx` and `packageIcon.ts` (a row's image: the host's `data:` URI or the bundled default icon that the root carries as `data-package-icon`) | P3.1–P3.3, P5.1, P5.2 |
| `src/webview/sidebar/**` | The 2.0 sidebar: the search box with `@installed`/`@updates` and browse, the Installed and Updates sections with the split sash kept in the view's state, the actions menu through the host's QuickPick, Ctrl+Enter to the full view, and All Projects sections; "Sidebar slice" below | P3.4, P5.5–P5.10 |
| `src/webview/main/**` | The 2.0 main panel: `MainShell` (header, unified search, tab bar, split layout) and the features under `features/`: `installed`, `updates`, `search`, `details` and `sources`; All Projects is a mode of the Installed and Updates tabs | P5.3–P5.9 |

Import rules between these layers are in
[`.github/instructions/core-boundaries.instructions.md`](.github/instructions/core-boundaries.instructions.md).
`eslint.config.mjs` enforces them with one fence per layer, and `src/test/lint/import-boundaries.test.ts` checks
each fence through the ESLint API.

### Operation outcomes

Every operation ends in exactly one outcome ([ADR-003](docs/adr/003-operation-queue-and-dotnet-runner.md)):
the ticket's `completion` resolves once and never rejects, and the host answers the request with it and
announces it to both surfaces as `ops/completed`. The statuses (`OperationStatus`, `src/protocol/domain.ts`):

| Status | Produced by | Meaning |
| --- | --- | --- |
| `queued`, `running`, `restoring` | progress only (`ops/progress`, the opening chunk) | Never the status of an outcome |
| `completed` | `PackageWorkflows` | The edit succeeded; the restore succeeded or was switched off |
| `partial` | `PackageWorkflows` | The edit succeeded and the restore failed; for a bulk operation, some edits or restores failed |
| `failed` | `PackageWorkflows`, or the queue when the workflow threw | The edit failed, was refused (SDK below 10, a Central Package Management add or update) or threw; for a bulk operation, no edit completed |
| `cancelled` | `PackageWorkflows`, or the queue for a ticket cancelled before it started | Cancelled; an edit that already ran is reported as done |
| `rejected` | the queue | Not admitted: one operation runs and five wait, or the queue is disposed |

An `OperationOutcome` reports edit and restore as separate `StepOutcome`s (`ok`, `skipped`, `error`); a
restore the user switched off is `{ ok: true, skipped: true }`. A `BulkOutcome` has one outcome per edit in
`results` and one restore per project in `restores`. Every outcome, a refusal included, has the ticket's `opId`.

### Reading through the Catalog

Hosts read through `Catalog` and nowhere else ([ADR-009](docs/adr/009-catalog.md)). Four reads are resources
of the query coordinator, computed once per generation for both surfaces: the project list (`projects`), the
sources of a directory (`sources:<dir>`), the installed packages of a project (`installed:<path>`) and its
transitive packages (`transitive:<path>`). Each of the four resolves with the generation it was computed for
(`{ value, generation }`; `installed()` has `generation` beside `result`), and the ten handlers whose result
is such a resource put it on the ok response (`projects/list`, `installed/get`, `updates/get`, `transitive/get`,
`sources/list`, `sources/refresh` and the four source mutations), so a webview can compare it with the
generation an invalidation lists for the key. The all-projects reads are fan-outs over those resources and
stream one chunk per project; they are not resources themselves and report no generation. `installed()` resolves with `{ result, upgrade? }`:
the result of the static inspection at once (also streamed as the `provisional` chunk of `installed/get`), and the
evaluated result through `upgrade`, which the host sends as the response (P6.2b). `Catalog.invalidate(scope, reason)` is the single entry for invalidation: it clears the source
listings for the scopes `sources` and `workspace` and then raises the generation of every key the scope reaches.

The feed reads are `updates`, `allProjectsUpdates`, `transitiveMetadata`, `search`, `quickSearch`, `versions`,
`metadata`, `readme`, `readmeImage`, `prewarm` and `sourceHealth` ("Package feeds" below). `updates:<path>|…` is
a resource like the four above and its response carries a generation; `versions` and `metadata` are fan-outs over
one resource per allowed source and carry none; the others run directly.

### Package feeds: transport, policy, caching and health

Everything the 2.0 core asks of a package feed goes through four layers ([ADR-005](docs/adr/005-execution-context-and-outbound-policy.md),
[ADR-006](docs/adr/006-icons-and-csp.md), [ADR-009](docs/adr/009-catalog.md)).

- **Transport** (`src/core/http`). `NodeTransport` is the only HTTP client. It passes no `agent` to
  `http(s).request`, so the extension host's proxy patch applies in every `http.proxySupport` mode
  (`docs/adr/005-proxy-matrix.md`); HTTP/2 is used only for allow-listed origins while the injected proxy predicate
  (`proxyConfigured()` in the root: `http.proxySupport` not `off` and `http.proxy` or a proxy environment variable
  set) is false, and a connection-level HTTP/2 failure downgrades the origin for the instance's lifetime (`reset()`
  on an `http` setting change). Redirects are capped at five and re-validated against private and unresolvable
  targets; bodies have a size cap, gzip is decoded on request, and the credential follows a redirect only to the same
  origin.
- **Feed contexts** (`src/core/catalog/feedContexts.ts`). One context per effective `nuget.config` chain: the sources
  listed for its directory, the merged configuration, a `DefaultOutboundPolicy` built from its package source mapping,
  and the policy-bound clients (`createFeedClients().forPolicy`). A project reaches its chain through the `installed`
  computation's own walk (`FeedContexts.register`); a read without a project names a directory (the host's
  `sourceDirectory`). The service index (with the source health), the credential provider, the flat container, the
  vulnerability data, README extraction, README images and the icon cache are shared by every context.
- **Policy.** A request that carries a package id (`exactMatch` search, `searchById`, `lookup`, versions, metadata,
  nuspec, icons, readme) goes only to the sources the context's policy allows for that id; a free-text query goes to
  every source handed in, and every source's vulnerability data applies to every id (no id is sent). No source is
  special by its address and nothing defaults to nuget.org (`src/core/feeds/policy.test.ts`).
- **Feed clients** (`src/core/feeds`). The service index (endpoints per source, one discovery per source shared by
  concurrent callers, failures into the health tracker for 120 s), the flat container, search (the V3 search service,
  or `dotnet package search --format json` in the read's directory for local feeds and feeds without one; the JSON is
  read after any `info :`/`warn :` lines), registration, vulnerabilities, icons, README and README images, nuspec and
  offline metadata, the update checker (every allowed source awaited, the newest version wins), the enricher and the
  metadata resolver (registration → nuspec → search per allowed source, then the global-packages folder).

**Empty is not unknown.** A source that could not answer is reported, never read as "no result": `search` and
`updates` carry `sourcesUnavailable` (also when a selected source is excluded as unhealthy), `searchById` answers
`failed` apart from `missing`, vulnerability data read in part is unknown (`vulnerabilities` stays absent), and
`package/versions` with no versions from an unreachable source is a `failed` response.

**Caching.** Results the coordinator caches are only complete ones: a compute that ends with `sourcesUnavailable`,
offline metadata or no metadata throws `IncompleteResultError(value)`, and `queryWithRetry` hands the value back with
the handle's generation while the coordinator stores nothing. Versions and metadata are cached per source
(`versions:<id>|<sourceUrl>|…`, `metadata:<id>@<version>|<sourceUrl>`); the `'all'` keys are never written. In the
`TieredCache` (lifetimes in `CachePolicy.ts`, persisted within the 8 MB byte budget): found icons (kept),
known icon misses (24 h, only when a feed answered) and lite lookups (5 min, including "this source does not know
the id"; a source that could not answer is not stored and is asked again). In memory only: service-index endpoints (10 min), source failures (120 s), vulnerability data (1 h, only
when every page loaded), READMEs (an LRU per package version and source), README images (an LRU of 64 found
images), credentials (30 min, failures 5 min).
`Catalog.invalidate` of a `sources` or `workspace` scope clears the feed contexts and resets every shared feed
client; the metadata resolver, the update checker and search keep no cache of their own.

**Health.** One `SourceHealthTracker` records the failures of every read and of the monitor, and its changes reach
both surfaces as `sources/health`; `sources/list` carries the current failures. A failed source stays listed until a
probe or a read answers from it; the failure TTL only allows the retry (N71). The monitor runs no `dotnet`: it
probes the sources of the chains that reads have registered, re-probes every 120 s while something is down and every
300 s otherwise, and restarts when a chain is registered or the sources are invalidated. A recovered source
invalidates nothing; the webviews ask again for what they showed as unavailable.

### Project execution context

Sources, SDK and configuration belong to a project, not to the workspace
([ADR-005](docs/adr/005-execution-context-and-outbound-policy.md)). `ProjectContextProvider.get(projectPath)`
(`src/core/project/context.ts`) assembles the `ProjectExecutionContext` of a project: the .NET SDK that
applies in its directory (through the runner, so `global.json` is honoured), its `nuget.config` chain as
`dotnet nuget config paths` reports it (nearest first), the URLs of the sources enabled for it, and a
`revision` hash over the project file, the nearest props and targets files, `global.json` and the config files,
which changes when any of them does. An SDK that cannot be detected leaves `sdk` unset and a config chain that
cannot be listed leaves it empty; a source listing that fails rejects, because no sources and unknown sources
are different facts. When the SDK is below 10 the provider answers with the complete context and
`unsupported: { reason: 'sdk-too-old' }`: the project stays readable and its packages are listed, and the
workflows refuse to edit it (plan decision D13).

### Webview tokens and the colour gate

`src/webview/shared/tokens.css` is the one place where the 2.0 webviews define what a size, a duration or a
colour is ([ADR-008](docs/adr/008-webview-architecture.md)). It holds custom properties with the prefix
`--nuiget-` and nothing else: spacing, radius, row heights, icon sizes, the smallest pointer target, a
z-index scale, two durations and an easing, and typography in `em` on the font size of the editor's UI.
Every colour token is an alias of a `--vscode-*` variable, which VS Code sets on a webview for the active
theme, so light and dark themes need no rule of their own. Three blocks cover the rest: the two
high-contrast body classes (borders from `--vscode-contrastBorder`, no shadow), `@media (forced-colors:
active)` with system colour keywords, and `@media (prefers-reduced-motion: reduce)`, which sets both
durations to zero, so that anything timed with the tokens stops moving. The file holds no colour literal;
if one is ever needed, this is where it goes.

Two lint tests in `src/test/lint` keep that true: `webview-tokens.test.ts` checks the shape of the file
(only `--nuiget-*` declarations, `var()` only of `--vscode-*` or `--nuiget-*`, one block per mode, the token
names the primitives rely on), and `webview-colours.test.ts` fails for a hex colour or a colour function in
any other file under `src/webview`, tests included.

The theme pass (P5.11) adds what the tokens alone did not settle. VS Code leaves a webview's `body` transparent and
paints the surface behind the iframe; the two roots now paint it themselves, `.nuiget-main` with
`--nuiget-color-bg` (`--vscode-editor-background`) and `.nuiget-sidebar` with `--nuiget-color-bg-sidebar`
(`--vscode-sideBar-background`), both `Canvas` under forced colours, so the document says what its text stands
on. The scrollbars of every scrolling element are `::-webkit-scrollbar` rules in `primitives.css`, 10 px thick like
VS Code's webview defaults and coloured with the `--nuiget-color-scrollbar*` tokens, so that forced colours reach
them; `scrollbar-color` is not available in Chromium 114. A badge's tone colours its border and leaves its text in
the badge foreground, since the info, warning and error colours fall below 4.5:1 on the badge background; for the
same reason the secondary text of a selected or current row (version, description, status) takes the row's
foreground instead of the muted colour. Every
rule that gives the pointer cursor sets `min-height: var(--nuiget-target-min)` (24 px, WCAG 2.5.8), and the sash,
drawn 4 px thin, takes the pointer over a 24 px wide `::after` (`webview-stylesheets.test.ts`).
`webview-css-baseline.test.ts` fails for a CSS feature that Chromium 114, the browser of VS Code 1.85, lacks: a
denylist of 26 features, each with its key in MDN browser-compat-data and the Chromium version that key gives
(finding N64); JavaScript APIs are held by the ES2022 `lib` of `tsconfig.json`. Contrast and target size are
measured where the colours exist: `src/test/ui/v2/theme.ui.test.ts` injects axe-core into the main panel and the
sidebar in VS Code under six built-in themes (Dark and Light Modern, both high-contrast themes, Dark and Light 2026),
with a row selected in each, and requires no `color-contrast` or `target-size` violation, with the contrast rule
having checked text.

`src/webview/shared/primitives/icons.tsx` is the icon set (codicon paths as inline SVG). An icon takes
`size`, `className` and `title` and renders no `style` attribute, which the Content Security Policy would
refuse (ADR-006); without a title it is hidden from assistive technology, with one it is an image with that
name. Every icon is a `/* @__PURE__ */ React.memo(…)` call, so a bundle keeps only the icons it uses
(`src/test/lint/webview-icons-pure.test.ts`; finding N63). The frontend test setup
(`src/test/setup-frontend.ts`) registers the `toHaveNoViolations` matcher of
`jest-axe`, so a component test can end with `expect(await axe(container)).toHaveNoViolations()`.

### Primitives and the listbox contract

`src/webview/shared/primitives/index.ts` exports the building blocks both 2.0 webviews are made of
([ADR-008](docs/adr/008-webview-architecture.md)): `Listbox`, `Row`, `SectionHeader`, `IconButton`, `Badge`,
`LiveStatus`, `EmptyState`, `Skeleton`, `Spinner`, `ProgressBar`, `Banner`, `Sash`, `Dialog`, `ConfirmDialog`,
`Popover`, `Tabs`, `Toolbar`, the icons and `cssVars`. Each has a test with React Testing Library that ends in
an axe run.

**A list is a listbox, and its row buttons are not in it.** The interaction model asks for
`role="listbox"` with `role="option"` rows and for action buttons on a row. A button inside an option is
nested interactive content: axe refuses it (`nested-interactive`, also at `tabIndex={-1}`) and a screen
reader cannot reach it. So a row is three elements:

```text
div.nuiget-row[role="presentation"][data-index][data-testid="package-row-<id>"]     ← measured, placed
├─ div.nuiget-row-option[role="option"][tabIndex 0 | -1][aria-selected][aria-posinset][aria-setsize]
│  │  [aria-labelledby → name, version][aria-describedby → badges, authors, description, status]
│  │  [aria-busy][aria-disabled]                                                    ← text only
│  ├─ span.nuiget-row-check[aria-hidden]      (multi-selectable lists)
│  ├─ span.nuiget-row-icon[aria-hidden]       (comfortable rows, with or without an icon)
│  └─ span.nuiget-row-body[title="<id> <version>"]                                  ← the tooltip
│     ├─ span.nuiget-row-line   name, badges
│     ├─ span.nuiget-row-line   version (`old → new` for an update), authors with the Verified mark, status
│     └─ span.nuiget-row-description   (Browse)
└─ div.nuiget-row-actions[aria-hidden="true"]                                       ← pointer only
      IconButton[tabIndex -1][data-testid="row-action-<name>"] … or a Spinner while the row is busy
```

A comfortable row is the 1.x card (D15): a 32 px icon column and two lines, a third for a Browse description,
at least `--nuiget-row-height-comfortable` (66 px) with a line under it and a 3 px accent on the selected row. A
compact row shows the same spans on one line (`display: contents` on the lines), name first: the version shrinks
with an ellipsis before the name does, and authors, description and status are read out, not shown. The arrow of
an update stays the text `→`, so the name reads `3.0.0 → 3.1.0`. The tooltip sits on the body: on the option a
`title` would become its description whenever no `aria-describedby` exists.

The wrapper carries nothing but classes, data attributes and the measuring ref; an `aria-*` attribute on it
would make it an owned child of the listbox that is no option (`aria-required-children`). The actions are
visible on `:hover` and `:focus-within` of the row and hidden with `visibility`, so the row does not move
when the pointer arrives. A click on an action leaves focus on the option. Everything a button does, a key
of the list does too:

| Key | Effect |
|---|---|
| ArrowUp, ArrowDown, Home, End | Move the active row (the one tab stop, roving `tabIndex`); the selection does not change |
| Enter | `onActivate`: the main panel selects the row and shows its details, the sidebar runs its primary action |
| Ctrl+Enter, Cmd+Enter | `onSecondaryActivate` |
| Delete, Cmd+Backspace | `onDelete` (uninstall where it applies) |
| Shift+F10, ContextMenu key, right-click | `onContextMenu` with an anchor: the actions menu of the row |
| Space, Ctrl+click, Cmd+click, a click on the check mark | Only in a multi-selectable list (`selectedIds` given): `onToggleSelected`, the row joins or leaves the bulk set |

A list names its keys in a visually hidden sentence it is described by (`hint`). A disabled option
(`aria-disabled`, for example an unresolved package) keeps focus and the menu and ignores Enter, Ctrl+Enter
and Delete. A list that offers bulk actions passes `selectedIds` (since P5.4): it is then `aria-multiselectable`,
the rows of the set are `aria-selected` and show a check mark (an `aria-hidden` span inside the option, so
nothing in the option can take focus), and `selectedId` becomes the current row, `aria-current`, the one whose
details are shown. Without `selectedIds` nothing of this exists and Space is not handled. Shift ranges, Ctrl+A,
PageUp/PageDown and type-ahead are not handled.

`Listbox` is always virtualized (`@tanstack/react-virtual`): only the rows in view and an overscan are in the
document, every option says its place among all (`aria-posinset`, `aria-setsize`), and the active row stays
mounted when it is scrolled out of view, so focus never falls out of the list. The active row is remembered
by item id. When its item disappears, the row now at its index takes over; when the list empties, the
container around the empty state takes focus. The list never takes focus it did not have.

**Numbers reach the DOM as custom properties.** The Content Security Policy allows no `style` attribute in
markup (ADR-006), and a virtualized row, a progress bar and a split need a number per element. `cssVars()`
is the one way: it hands React's `style` prop (which sets properties through the CSSOM) nothing but
`--nuiget-*` custom properties, and the stylesheet owns the property that uses them
(`transform: translateY(var(--nuiget-virtual-offset))`, `width: var(--nuiget-progress-value)`). `Sash`
renders no style at all: it reports percentages, and its owner puts them on the layout container.

**One stylesheet, one live region.** `primitives/primitives.css` holds the rules of all primitives; every
class starts with `nuiget-`, and every size, colour and duration is a token.
`src/test/lint/webview-stylesheets.test.ts` fails for `!important`, a `px` font size, a duration that is not
a duration token, a reduced-motion rule and an unprefixed class in any 2.0 stylesheet other than
`tokens.css`.
`LiveStatus` is the one `role="status"` region of a surface with the test id `status-live`: outcomes are
announced there, and the same message twice is announced twice. A `Banner` announces itself when it appears
(`role="alert"` for an error) and says its severity in words; a `Skeleton` is decoration and says nothing.

**Layers: dialogs and popovers.** `Dialog` is modal (`role="dialog"` or `alertdialog`, `aria-modal`, named by
its heading): focus moves into it, Tab and Shift+Tab wrap inside it, focus that lands outside is taken back,
Escape closes it, and focus returns to the element that had it. `ConfirmDialog` is the `alertdialog` of
interaction model §5 (bulk update, bulk uninstall, remove source) with the test ids `confirm-dialog`,
`confirm-dialog-confirm` and `confirm-dialog-cancel`; it opens on Cancel. `Popover` is a non-modal dialog
next to an element or at a point (a context menu): Escape or Tab past either end closes it and returns
focus to the anchor, a press outside closes it and leaves focus where the press put it. Both are portalled
to the body, so no `overflow: hidden` parent clips them (finding U9), and register on one stack
(`primitives/layers.ts`): only the topmost layer answers Escape, traps focus or closes on an outside press,
and an Escape it handles does not reach the page. A confirmation opened from a dialog (Remove source over
Source Settings) and a popover inside a dialog therefore close first and alone. A popover is placed by
`placePopover()` (below its anchor, above when there is more room there, moved inside the viewport) and
positioned with `--nuiget-popover-x` and `--nuiget-popover-y` through `cssVars()`; a popover that opens
after a dialog is lifted to the dialog's z-index and stacks above it by document order. A dialog is not
dimmed: no theme variable exists for a scrim; the layer takes the pointer, and the dialog's surface uses
`--nuiget-color-widget-bg` and `-fg` (aliases of `--vscode-editorWidget-*`) with a border.

**Tabs and toolbars have one tab stop.** `Tabs` renders `tablist`, `tab` and one `tabpanel` (the selected
one, which the selected tab controls and names); ArrowLeft, ArrowRight (wrapping), Home and End select and
focus, because a panel shows without delay; a count is part of the tab's name ("Updates 3"). `Toolbar`
(`role="toolbar"`) keeps the tab stop on its enabled controls itself (roving `tabindex` written to the DOM
and kept by a `MutationObserver`), so its children are ordinary buttons; a control that mounts later is no
second stop, and a disabled tab stop hands it to the first control. In a text field Home, End and the arrows
move the caret; an arrow leaves the field at the edge of its text.

jsdom lays nothing out, so a test that renders a `Listbox` installs a layout first
(`installFakeLayout()` in `primitives/testSupport.ts`); without it the real virtualizer has no row in view,
and axe skips its `aria-hidden-focus` rule instead of failing it. `axeRuleOutcome()` lets a test assert that
a rule ran and passed. The virtualizer itself is never mocked. A dialog or popover is not inside the
container that `render()` returns: its tests run `axe(document.body)`, and `installFakeViewport()` gives the
window a size and chosen elements a box for placement.

### Message bus and store slices

`src/webview/shared/bus` and `src/webview/shared/store` are the webview's side of the protocol
([ADR-007](docs/adr/007-protocol.md), [ADR-008](docs/adr/008-webview-architecture.md)). They import
`src/protocol` and nothing of the core.

**Bus.** `createMessageBus(port, source)` (`bus/MessageBus.ts`) takes the way to the host (the object
`acquireVsCodeApi()` returns) and the place where messages arrive (`window`). `request(type, payload,
{ signal, onChunk })` posts a request envelope and resolves with `{ result, generation }` of the ok response,
or rejects with a `ProtocolRequestError` that carries the code of the error response. A request has one
outcome: a response, a chunk or anything else for an id that is not waiting (answered, cancelled, never sent
here) is dropped, as is whatever `parseOutbound` does not accept. Aborting the signal posts a `cancel`
envelope, rejects with `cancelled` at once and forgets the id, so the terminal response the host still sends
finds nobody. `onEvent(type, handler)` returns the function that removes the handler. The bus also remembers,
per resource key, the generation the latest `resources/invalidated` event listed for it
(`listedGeneration(key)`); the event's own `generation` is a sequence number and is not kept.
`useMessageBus()` gives a component the bus of the surface; the entry point creates it.

**`useResource(key, requester)`** (`store/useResource.ts`) keeps one resource of the host current and is the
one place for three rules:

| Rule | Behaviour |
|---|---|
| Ask again when invalidated | A `resources/invalidated` event that names the key in `keys` starts a new request. What is shown stays until the answer (`revalidating`); a list is never blanked. |
| The latest request wins | A new request cancels the one before it, and an answer or failure of an earlier request is not applied. A key change cancels too, and no render shows the data of the previous key. |
| No result behind an invalidation | An ok answer whose `generation` is below the one listed for the same key is not applied. Equal, higher, absent, or a key no event has named: applied. With nothing newer on its way the hook asks once more; a second out-of-date answer for the same listing ends as an error, so loading always ends. |

**Slices.** Each is a reducer with a context of its own (`useSession`, `useProjects`, `useInstalled`,
`useTransitive`, `useAllProjects`, `useUpdates`, `useConfig`, `useSources`, `useSearch`, `useDetails`, `useOps`), so a component
renders for the slice it reads; the functions that change something (`useSessionActions`, `useDetailsActions`,
`useOpsActions`) are in separate contexts and never change. `StoreProvider` mounts all eleven, which is what makes a surface ask `session/get` and `projects/list` when it
starts; the other slices ask when they have something to ask for.

- `session` (ADR-001): `committed` is the last snapshot of the host that was applied, and a snapshot is
  applied only when its `rev` is above that one. `set(intent)` shows the change at once as *pending* and sends
  `session/set`; the intent leaves when its own request is answered, with the committed snapshot under it, or
  is taken back when the request fails. Several intents lie over the committed state oldest first, so the
  answer to an earlier one never shows through a later one.
- `projects`: the answer to `projects/list` (subject to the generation rule for the key `projects`) and every
  `projects/changed` event, which replaces the list as it is. The slice does not ask again on an
  invalidation; the host follows one with the event.
- `installed`: `useResource` for `installed:<path>` of the project the host has **committed** as selected,
  never a pending one; nothing is asked without a project or in all-projects mode. The key is built from the
  path exactly as the snapshot has it, which is how the host names it. Lite metadata is kept by
  lower-cased package id for the project it was asked for. While the request is unanswered, the `provisional` chunk
  of that request is shown as `result` (a chunk of an earlier request or another project never is); the response
  replaces it. The slice asks `transitive/metadata` with the concrete versions of the rows it shows (two-phase,
  ADR-009 d.1): for the provisional list at once and for the response only when its rows differ, and writes the
  answer into the map; another project or other rows cancel the ask, and an error is no metadata (P5.10, P6.2b).
- `transitive` (P5.4): `useResource` for `transitive:<path>` of the committed project, but only after the section
  was opened (`enable()`); another project starts closed again. `restore()` asks the next `transitive/get` with
  `forceRestore`, once. The rows' metadata comes from `transitive/metadata` by `id@version`; when the host cannot
  answer it (`unsupported` until the feeds of P4 exist) the rows show from `transitive/get` alone.
- `allProjects` (P5.4): the stream of `allProjects/installed` while All Projects is committed, one chunk per
  project kept by its path. It is not a `useResource`: the fan-out has no generation and its key is never in
  `resources/invalidated` (ADR-009). The slice asks again when an invalidation names `projects` or any
  `installed:` key, keeps what it shows until the new answer, and applies the chunks and the answer of its
  latest request only. Leaving All Projects resets it and cancels the stream, so a chunk that arrives late for it is
  never shown (harness gate `late allProjects chunk after switching is discarded`, P5.9). Since P5.9 it also streams
  `allProjects/transitive` once `enableTransitive()` was called, sticky while All Projects stays committed (unlike
  `transitive.enable()`, which resets per project); it asks again on an invalidation that names `projects`, an
  `installed:` or a `transitive:` key, with the same latest-request rule. A third stream, `allProjects/updates`, runs
  while All Projects is committed, under the committed prerelease flag; it asks again on a flag change and on an
  invalidation naming `projects` or an `updates:` key (never `installed:`), applies the chunks, icons and answer of its
  latest request only (N11), and asks once more when a source recovers while the answer said `sourcesUnavailable`.
- `updates` (P5.5): `useResource` for `updates:<path>|<prerelease>` of the committed project under the committed
  prerelease flag; another flag is another resource, so a toggle asks again. Nothing is asked without a single
  project. Before the answer the rows are the bare `found` chunks of the latest request; the answer replaces them
  with the enriched rows (icon, authors, verification). `sourcesUnavailable` is kept as a flag, never as an empty
  list. When a `sources/health` event no longer lists a source that the previous one listed and the shown answer
  was unavailable, the slice asks again once after `RECOVERY_DELAY_MS` (300 ms), unless a request went out in the
  meantime: a manual refresh announces `failed: []` and then invalidates, and that invalidation is the one request.
- `config` (P5.6): the extension's settings from every `config/changed` event and, once a consumer calls
  `enable()`, one `config/get` unless an event said them already. Not in ADR-008's enumeration of slices; added with
  its first consumer, the main panel's quick-search. `searchDebounceMode` carries the contributed values
  `quicksearch`, `full` and `off` as they are (N57, closed at P5.13); `src/test/lint/extension-config-settings.test.ts`
  holds `ExtensionConfig` to the contributed settings and that enum.
- `sources` (read part P5.6, mutations P5.8): lazy like `transitive`, but `enable()` is sticky for the surface. Once
  enabled and with a committed session it asks `sources/list` for the committed project's directory; again when the
  committed project changes, on `refresh()`, and when an invalidation has the scope `sources` or names a `sources:`
  key. It is no `useResource`: the key is the project's directory, which the webview does not compute. The latest
  request wins and the shown list stays until the answer; `failed` follows the answer, its `health` chunk and
  `sources/health`. `add`, `remove` (with the declaring `configFile` when known) and `setEnabled` mark the source
  `pending`, show the list each answers with at once and reject with the host's message; the invalidation the host
  sends after a mutation asks the list again. `loadConfigFiles` asks `sources/configFiles` once per call.
- `search` (P5.6): one browse search per surface over the committed source (`sourceUrls` absent for `all`) and
  prerelease flag. A search is keyed by what the user typed, so it is not a coordinator resource: no generation, and
  a new text cancels the request before it. The `metadata` chunk precedes the answer and is merged onto its results
  by `id@version` (`withMetadata`). A committed source or prerelease change asks the shown text again without
  blanking the list; `sourcesUnavailable` is a flag over the results. The slice also owns quick-search:
  `suggest(text)` sends `search/autocomplete` with the enabled sources (every one under `all`, else the selected
  one) and sends nothing while the list is unknown or names none; the latest suggestion wins.
- `details` (P5.7): the package selected in a main-panel list (`select()`: id, version to show first, source, origin
  `installed`/`updates`/`browse`, owning project), the chosen version, and its `package/versions`,
  `package/metadata` and, once the README tab was shown, `package/readme`. Each request follows the selection: the one
  before is cancelled, and an answer whose package or version differs from what was asked is not shown. These answers
  carry no generation (N70); the slice asks again when an invalidation names a `versions:<id>|` or `metadata:<id>@`
  key of the package. Stale selection (interaction model §4): when the committed project changes under an installed or
  update selection, it stays read-only until the new installed list answers, then stays (with the new project) or goes;
  All Projects or no project clears it. A browse selection is never stale.
- `ops`: operations in progress, by operation id, from `ops/progress` (`running`, `restoring`; the host sends
  no `queued` event) and, on the surface that asked, from the call: `run(type, payload)` records the operation
  at once under an id of the surface, with its kind and the projects and packages read from the payload
  (`touchedBy`), moves it under the host's `opId` with the first chunk of the request (the `queued` chunk of an
  operation that waits) and removes both when the request settles (N61). The last outcome comes from
  `ops/completed` with a sequence number for the live region. `isPackageBusy(project, id)` is true on both
  surfaces, whoever started the operation. `run` resolves with the outcome; the surface that asked receives it
  as response and as event, and it counts once (by `opId`).

Tests use `createFakeHost()` (`bus/testSupport.ts`): the real bus over an `EventTarget`, with a record of
what was posted and helpers to make the host answer, fail, stream, broadcast and invalidate.

### Sidebar slice

Sidebar parity (P5.10): a `Sash` between the open Installed and Updates sections shares the height in a ratio kept in
the webview's own state (`getState`/`setState`, written when a change ends, never per pointer step); the session slice
asks `session/get` again when the hidden view is shown (`visibilitychange`). On every sidebar list Shift+F10, the
ContextMenu key and a right-click send `ui/contextMenu` (the host shows the row's actions as a QuickPick, as 1.x did)
and Ctrl+Enter (Cmd+Enter) sends `ui/viewPackage`; Enter keeps the row's primary action, except on a centrally managed update row, where Enter and the row button send `ui/contextMenu` so the host previews and confirms the central change (P6.4). A browse row in a CPM project asks `cpm/preview` before it installs; a package with a central entry (or an ask that fails) goes to `ui/contextMenu` instead, and a second Enter while the ask runs sends nothing (N77). In All Projects both sections
show one heading and list per project over the `allProjects` slice (`ProjectPackages`, `ProjectUpdates`), under a
caption per workspace folder when there are several; each row acts on its own project. A search result under All
Projects goes through `ui/contextMenu` with `projectPath: ALL_PROJECTS` and `installedProjects`, so the host's
project picker installs it. The host's version picker says "No package source could be reached for this package"
when no source answered, instead of an empty list.

`src/webview/sidebar` is the 2.0 sidebar as far as it goes: one vertical slice from the entry to an
uninstall. `node esbuild.mjs` builds it into `dist/sidebar.js` and, because the entry imports
stylesheets, `dist/sidebar.css` (the tokens, the primitives' rules and `sidebar.css`), which `SidebarHost`
links.

- `index.tsx` acquires the VS Code API (once, and only when its root element is on the page), creates the
  message bus and mounts `StoreProvider` around `SidebarView`.
- `SidebarView.tsx` is the shell (`nuiget-sidebar`): a search box (`sidebar-search-input`) that for now
  filters the installed packages by id, a progress bar while the list is revalidated, a banner for an
  unsupported project and one with "Retry" for an error, the Installed section and the one live region
  (`status-live`). It announces a first load and, through `describeOutcome` (`outcomes.ts`), how every
  operation ended, on whichever surface it started.
- `InstalledSection.tsx` is the Installed section (`section-header-installed`, `sidebar-installed-list`):
  `SectionHeader`, `Listbox` and one `Row` per package of the committed project.

| State (interaction model §4) | What the section shows |
|---|---|
| Loading (first) | Three skeleton rows; "Loading installed packages" in the live region |
| Revalidating | The rows stay; the list is `aria-busy`; an indeterminate progress bar under the search box |
| Provisional | A "provisional" badge beside the section title, with a tooltip |
| Unresolved | Version "unresolved" with a tooltip (`Row.versionTitle`, `UNRESOLVED_HINT`), status "Unresolved", the row disabled and without action |
| Centrally managed | A "CPM" badge read as "Centrally managed"; uninstalls from this project (the central entry stays); an update goes through the host's actions menu and its modal preview (P6.4) |
| Unsupported project | A warning banner "Unsupported project: <reason>"; the rows are listed without actions |
| Pending operation | A spinner in place of the row's button, status "Uninstalling", from the click to the outcome |
| Empty, error | An `EmptyState` sentence; an error banner with "Retry", over the rows if there are any |

Uninstall is the row's button, Enter or Delete on the active row: `ops/remove` through
`useOpsActions().run`. The row is busy at once (the ops slice records the operation from the call, also while
it waits in the queue), stays busy while the slice reports the operation, and leaves the list when the host's
new list no longer has it: nothing is
removed by guessing, so a failed or refused uninstall leaves the row as it was and is announced with its
reason. A package that cannot be uninstalled here (implicit, declared in a props file, central, unresolved,
or in an unsupported project) has no button, and Enter or Delete on it says why.

The harness scenario `sidebar: uninstall then watcher invalidation converges` shows the host's side of the
same story on the client model: the operation's invalidation and the file watcher's, in either order, leave
both surfaces with the same list of the generation the last event listed.

### Main panel shell

`src/webview/main` is the frame of the 2.0 main panel (ADR-008: the shell is under 300 lines). `node esbuild.mjs`
builds it into `dist/webview.js` and, because the entry imports `../shared/tokens.css` and `main.css`,
`dist/webview.css`, which `MainPanelHost` links; `check:vsix` therefore passes on a 2.0 build too.

- `index.tsx` does what the sidebar's entry does (API acquired once, inside the root check; bus; `StoreProvider`)
  around `MainShell`.
- `MainShell.tsx` (`nuiget-app`, a `main` landmark): the header with the shared context (interaction model §1),
  the unified search box (`search-input`), the tabs Installed and Updates (`tab-bar`, `installed-tab`,
  `updates-tab`) and the split between the list and the details (`sash`, `package-details-panel`), with the one
  live region (`status-live`). The lists and the details are props (`installed`, `updates`, `details`), so a
  feature is added in `index.tsx` and the shell does not grow.

| Part | Behaviour |
|---|---|
| Project selector (`project-selector`) | The projects slice; "All Projects (N)" with two or more; disabled until the session has arrived. A choice is a `session/set` intent, shown at once |
| Source selector (`source-selector`) | The session's source, disabled: the list of sources to choose from is the sources feature's |
| Include prerelease | A checkbox bound to the session (`session/set { includePrerelease }`) |
| Refresh | `refresh/all` once; "Refreshed" or "Refresh failed" in the live region |
| Search box | `parseSearchQuery` (`src/webview/shared/search`): `@installed` and `@vulnerable` select Installed, `@updates` selects Updates, and the text after the prefix is the list's filter; a plain text is a browse search, which changes nothing here until the search feature runs it. Escape clears a box with text and leaves an empty one. Choosing the other tab ends a filter mode |
| Tabs | `Tabs`; `ui/selectProject` with `initialTab` selects it (the host applied the project already); `ui/focusSearch` focuses the box |
| Split | `Sash` (25–75 %, start 50 %) reports a share that the shell puts on the split as `--nuiget-split`; `main.css` sizes the list with it |

### Installed feature (main)

`src/webview/main/features/installed` is the Installed tab (P5.4); `index.tsx` hands it to the shell as
`installed={view => <InstalledTab {...view} />}`, so the shell did not grow.

- **Sections.** For a single project one list (`installed-list`) under a collapsible `Direct packages (N)`
  header (`section-header-direct`; `(k of N)` while a filter is on, `(N)` while the vulnerability data of
  `@vulnerable` is unknown) and, under it, the transitive section; in All Projects one `SectionHeader` and one
  list per project from the `allProjects` slice (`installed-list-<name>`), inside one scroll container where every
  list is as high as its rows. Each header carries the `provisional` and `Unsupported` badges. Folder headings,
  `Unsupported` sections and the all-projects transitive aggregate are P5.9's.
- **Rows (P9.3).** A comfortable `Row` per package: the icon from the lite map (`packageIconSrc`: the `data:` URI
  or the bundled default), authors and the Verified mark from the same map, no description (D14); the version
  cell of `versionCell` (`10.* (10.2.0)`, `(run restore)`, `* (always latest: …)`); badges `SDK`, `props`, `CPM`,
  `floating` or `range`, `Vulnerable`. A row `whyNotRemovable` refuses keeps a muted, empty check mark
  (`selectable={false}`) and no uninstall action; Enter still shows its details. The Installed tab counts the
  listed packages (no number while loading or at zero; All Projects once every project answered).
- **Two selections.** The current row is the tab's own state (click or Enter, `aria-current`); the details pane
  of P5.7 will read it. The bulk set is kept by project path as the host sent it (Space, Ctrl/Cmd+click or the
  check mark, `aria-selected`); a row that cannot be uninstalled (central, implicit, props, unresolved,
  unsupported) is not added, and the reason is announced.
- **Bulk flow.** The `Toolbar` holds `select-all-button` (every removable row the filter shows; pressed again it
  clears) and `uninstall-selected-button` with the count. The `ConfirmDialog` lists exactly the packages, under
  their project's name; Confirm sends `ops/bulkRemove` for one project or `ops/bulkRemoveAllProjects` with the
  project names, closes the dialog and empties the sent part of the set. The rows are busy from the request on
  (ops slice, N61), and leave only with the host's next list: nothing is removed by guessing, so a failed package
  of a `partial` batch stays where it is. The shell announces every outcome once, from either surface.
- **Filter modes.** `@installed <text>` filters by id; `@vulnerable` keeps the rows whose metadata lists
  vulnerabilities, and says that the data is not there yet while no metadata has arrived (empty is not unknown).
- **Transitive.** Closed until opened; then `transitive/get`, one list per target framework (with headings when
  there are several), "Required by" as each row's description, a Restore banner (`transitive-restore-banner`)
  when the assets file is missing, and the rows' metadata only when the host can answer it.

### Updates feature (main and sidebar)

`src/webview/main/features/updates` is the Updates tab (P5.5), handed to the shell as
`updates={view => <UpdatesTab {...view} />}`; the shell shows the count on the tab only when the answer is
complete (not while loading, not with `sourcesUnavailable`, never `0`).

- **List.** One multi-selectable list (`updates-list`) of the `updates` slice's rows, sorted by id: icon, authors
  and the Verified mark from the answer (P9.4; in All Projects the `icons` chunk when a row carries no icon),
  `installed → latest` with the new version marked (`nextVersion`), the `CPM` badge, and `row-action-update` per
  row. A project with no packages says "No packages installed.", not "No updates available.". Every row of a bulk
  update stays busy until it ends: the ops slice keeps the union of the projects and packages an operation
  reported, so a per-step report does not drop the others. Enter or the button sends
  `ops/update` with the row's `sourceUrl`; the row is busy from the request on and leaves with the host's next
  list. `@updates <text>` filters by id.
- **Bulk flow.** `select-all-button` and `update-all-button` ("Update all (n)" or "Update selected (n)", centrally
  managed and busy rows left out); the `ConfirmDialog` lists `id: from → to` and Confirm sends `ops/bulkUpdate`.
- **Centrally managed packages.** Until the central editor of P6.3 exists, a package declared in
  `Directory.Packages.props` is never updated from a project: Enter opens a read-only dialog
  (`cpm-preview-dialog`) that names the central change, and Space announces that it cannot join a bulk update.
- **Unknown is not empty.** `sourcesUnavailable` is a warning banner with Retry over the list
  (`updates-unavailable-banner`), and the empty list then says that updates could not be checked; "No updates
  available." only follows a complete answer. In All Projects the tab is `AllProjectsUpdates` (P5.9): one section per
  project under its workspace folder over the `allProjects/updates` stream, rows of an unsupported project read-only,
  one banner over every section when a source could not be checked, and Update all as one `ops/bulkUpdateAllProjects`
  listing the packages under their project; the tab count is the sum once every listed project has answered.

The sidebar's `UpdatesSection` (`src/webview/sidebar`) reads the same slice: compact rows in
`sidebar-updates-list` under `section-header-updates`, the count only when known, Enter and the row button
update, a centrally managed package is announced and has no row button, the banner is
`sidebar-updates-unavailable` and the empty state `sidebar-updates-empty`. The sidebar's search box filters the
Installed section only; its search modes are P5.6's.

### Search feature (main and sidebar)

Both surfaces use one combobox, `shared/search/SearchBox.tsx`: typing `@` lists the filter prefixes the surface
offers, and quick-search suggestions use the same list. ArrowUp/ArrowDown move through the options with focus kept in
the box (`aria-activedescendant`), Enter or Tab takes the active option, Escape closes the list, then clears the box,
then leaves it. The list belongs to the box and is no layer of `primitives/layers.ts`: focus never moves into it, which
is why it is not a `Popover`.

- **Main panel.** Plain text is a browse search: `BrowseList` (`browse-list`) takes the place of the tab bar and
  lists the results with icons (`data:` URIs only, the CSP's `img-src`), authors, downloads and the Verified and
  Installed badges. `useSearchTyping` owns the timers by `searchDebounceMode`: `quicksearch` asks for suggestions
  150 ms after the last key from two characters on while the box has focus, `full` searches 300 ms after the last
  key, and `off` runs nothing while typing; Enter always searches at once. The sidebar ignores the setting: it
  searches 300 ms after the last key in every mode, as 1.x did. The main panel's search feature enables `config` and `sources` on mount,
  so the main panel's start requests are `session/get`, `projects/list`, `config/get` and one `perf/mark`
  (`webviewReady`, N81), with `sources/list` after the first snapshot; the sidebar's set is `session/get`,
  `projects/list` and the same mark.
  Picking a suggestion and `ui/navigateToPackage` fill the box with the id and search for it exactly; the package
  found becomes the current row. A navigation that names a version (View details of a sidebar row) carries it in
  the search slice (`version`), and the details select that version rather than the latest found (P7.5a). Leaving browse clears the search and cancels its request.
- **Sidebar.** `@installed <text>` and `@updates <text>` show that section alone, filtered; any other text (also
  `@vulnerable`) is a browse search, 300 ms after the last key from two characters on, or at once on Enter.
  `BrowseResults` (`sidebar-browse-list`) lists compact rows; Enter or the row's button installs the version found
  into the committed project with the row's `sourceUrl`. An installed package and a surface without a single project
  install nothing and say why. The sidebar never asks for suggestions, the source list or the settings.

### Details feature (main)

`features/details/DetailsPane.tsx` renders the selection of the `details` slice; the Installed, Updates and browse
lists call `select()` when the user makes a row current (and the browse list after a navigation), never when a list
resets its own row, so the stale-selection rule can keep the pane. The header shows the installed version with
Uninstall (`whyNotRemovable` decides) and the version selector (`version-selector`, newest first, `(installed)`
marked) with one primary button (`install-update-button`): Install when the package is not installed in the target
project, otherwise Update or Downgrade by the order of the host's list (no comparator in the webview; a version missing
from the list says Update). The target is the committed project for a browse row and the row's own project otherwise;
without a single project, while stale, for a floating or ranged reference or an unresolved one, the button is
disabled with the reason. An install into a CPM project asks `cpm/preview` first (the primary button waits; a selection change cancels the ask): `null` installs at once, a preview or an error opens `CentralUpdateDialog` with `kind: 'install'` and its confirm runs `ops/install` (N77). A centrally managed package opens `CentralUpdateDialog`, which asks `cpm/preview`, lists the projects the central version applies to and runs `ops/update` on *Update central version*; a row with a `VersionOverride` updates in its project alone (no preview, N74); a central row uninstalls directly and the pane says that the central entry stays. Busy follows
`isPackageBusy`.

The Details tab shows description, authors, downloads, publication date, license, project URL, size, vulnerabilities
(severity in words with an icon) and dependencies by framework; details from the local package cache are marked
offline, saying whether a source is down (`sources/health`) or no source knows the version. An empty version list of a
local source says that it cannot be listed. The README tab renders with `features/details/markdown.ts` (main panel
only: its module-level imports would otherwise reach the sidebar bundle): marked with highlight.js (token classes
prefixed `nuiget-hljs-`, coloured by the `--nuiget-color-syntax-*` tokens), then DOMPurify without `<style>`, `style`,
form elements or `<button>`. Copy buttons are added to the sanitized DOM afterwards, and every image is fetched by the
host (`readme/image`, `http:` URLs of known hosts upgraded first, four at a time, cancelled with the selection); an
image the host cannot fetch is replaced by its alt text, because the CSP's `img-src` allows `data:` only.

### Sources feature (main)

`features/sources/SourcesControl.tsx` is the source part of the header: the selector (`source-selector`, All sources
and every enabled source by name, the session's URL kept as an option when it is not listed, disabled until the list
is known; a choice is `session/set { selectedSource }`) and the gear (`source-settings`) that opens
`SourceSettingsDialog` (`source-settings-modal`), which `ui/openSourceSettings` opens too. The dialog lists every
source (`source-row-<name>`) with an enable checkbox, its URL and the config file that declares it, and Remove with
an in-dialog confirmation (interaction model §5). Add source switches the dialog to a form (`add-source-panel`): the
config file (`sources/configFiles`, nearest first), URL, name, and credentials (password encryption on Windows only);
an `http:` URL needs the insecure option, which SDK 10 requires. Focus moves to the URL field when the form opens and
back to Add source when it closes.

The host answers `sources/list`, `sources/refresh` and the four mutations with each source's `configFile`:
`Catalog.sources(dir, signal, { configFiles: true })` attributes the cached listing at read time with `withConfigFiles`
over the directory's `FeedContext` (`forDirectory`, which walks the config chain only when no computation has
registered it). The cached `sources:<dir>` value stays the plain listing, so activation and the session's reconcile,
which ask without the flag, never walk the chain. `computeInstalled` registers its own pending walk with `FeedContexts`
before awaiting it, so a directory read meanwhile joins that walk; `sources/list` before `installed/get` for the same
directory still walks twice (N72, P6.2). Without a chain the listing comes back unattributed and the remove
confirmation says the source goes from the nearest config file.

### All Projects (main)

With All Projects committed, the Installed and Updates tabs show one section per project, grouped by
`shared/allProjects/folderGroups.tsx` under a heading per workspace folder when there are two or more (sections one
heading level down). An unsupported project keeps its section in its folder with an `Unsupported` badge and the banner
"Unsupported project: <message>"; a project whose SDK is below 10 lists its packages read-only (D13), the other reasons
have no packages and show no list. The Installed tab's transitive section aggregates `allProjects/transitive` on
expand: one row per lower-cased id and version, with each project's top-level roots ("no traceable top-level package"
for none) and Restore for the projects not restored. In the details pane an installed or update row changes its own
project; a search result offers Install…, whose dialog (`MultiInstallDialog`) shows where the package is installed and
sends `ops/bulkInstall` for the projects picked. A bulk install shows no preview, so the dialog asks `cpm/preview` for
each Central Package Management project when it opens (one after the other, aborted on close) and a project whose
answer is a preview or an error cannot be picked ("centrally managed: install it from the project to see the
preview", "preview failed"); Install waits for the answers (N76, P7.5a). The sidebar's QuickPick path does the same
in `SidebarHost` after the pick and names the projects it left out. The Updates tab is `AllProjectsUpdates` (see "Updates feature").
`touchedBy` keeps the flat cross product of projects and packages for the all-projects bulk requests, as the host's
`ops/progress` does.

### Two-surface harness

`src/test/harness` tests what the two surfaces do together, on the 2.0 protocol
(`npx vitest run --project integration src/test/harness`; part of `npm test`).

- **Composition.** `createHarness` (`harness.ts`) runs the real composition root through `activateWith` over
  the `vscode` mock, with a scratch workspace of real project files. The surfaces are the real `SidebarHost`
  and `MainPanelHost`; nothing builds `HostServices` by hand. The main panel gets a panel that reports its
  disposal once.
- **Fake dotnet.** `fakeDotnet.ts` is the injected `spawn`: no process starts. It answers `--version`,
  `nuget list source` (per working directory) and `nuget config paths`, and it makes `package add` and
  `package remove` real by editing the project file on disk, so the inspector reads back what an operation
  did; on a Central Package Management project `package add --version` writes the central version into the governing
  `Directory.Packages.props` and leaves a versionless reference in the project, and `package add` without a version
  changes nothing (the probe rows of `src/core/cli/__fixtures__/sdk-probes/10.0.401.json`). `msbuild` answers from the
  project files (properties and `PackageReference`/`PackageVersion` items in the probe's JSON shapes) only under
  `createHarness({ evaluate: true })`; otherwise it prints nothing, every evaluation fails and the lists stay
  provisional (P6.4b). A scenario can hold the calls that match a predicate and release them later. A computation of
  `installed/get` can be held at `nuget config paths` only: the SDK probe is cached per directory after its
  first answer, and a result that the coordinator has cached is answered without any call.
- **Fake feed.** `fakeFeed.ts` is the injected `transport` (a `FakeTransport` over a scripted handler): the service
  index, search, registration and flat container of `SHARED_FEED` and `PRIVATE_FEED`, answered from what a scenario
  `publish`es; `down` fails every request. No request reaches the network, and the real health monitor runs over it.
- **Fake webview.** `FakeWebview.ts` records every envelope and keeps a small client model. Its eight rules
  are the ones the message bus and store of the webviews implement (ADR-001, ADR-002, ADR-008; "Message bus
  and store slices" above):
  1. On start it asks `session/get` and `projects/list`. A snapshot (from a `session/get` or `session/set`
     response or a `session/changed` event) is applied only when its `rev` is above the last applied one.
  2. `projects/changed` and the `projects/list` response replace the project list.
  3. When the applied snapshot selects another real project, it asks `installed/get` for it, and asks again
     when `resources/invalidated` names that project's key in `keys`. In all-projects mode it asks
     `allProjects/installed` instead, again when the event names `projects` or any `installed:` key, and
     keeps the `project` chunks by project path. The mode is entered by `showAllProjects()` or by an applied
     snapshot that selects All Projects; a mode a snapshot entered is left by a snapshot that selects anything else,
     which cancels the stream and drops its chunks, as the slice's reset does (P5.9).
  4. The latest request wins per slot (`session`, `projects`, `installed`, `allProjects`): a response or
     chunk of an earlier request of that slot is recorded and not applied.
  5. Progress, chunks, `ops/completed` and terminal responses are recorded; a request without a terminal
     response is pending.
  6. Every envelope is kept verbatim; other events are recorded only.
  7. An ok response of the `projects`, `installed` or `updates` slot carries `generation`; it is applied only when
     that generation is not below the one the latest `resources/invalidated` event listed for its key (`projects`,
     `installed:<path>`, `updates:<path>|…`); a lower one is recorded and not applied. Rule 4 is unchanged; chunks
     are never compared with a generation.
  8. `checkUpdates` asks `updates/get` for the selected project; once asked, the model asks again when
     `resources/invalidated` names that `updates:` key and when an applied snapshot of the same project carries
     another `includePrerelease`. Every `sources/health` payload is kept.

  The webview slices go beyond this model in named places (P5.2, from the P3 phase review): `useResource` asks once
  more after an ok answer that rule 7 would discard, and a second out-of-date answer for the same listing ends as an
  error (`store/useResource.ts`), where the model only records it; the `search`, `details`, `sources` and `config`
  slices and the `transitive` and `updates` streams of `allProjects` are not modelled at all. Those rules are tested in
  the slices' own tests under `src/webview/shared/store`; the harness proves the host side and the rules above.
- **Driver.** `resolve`, `dispose`, `selectProject`, `toggle`, `operate`, `refresh`, `request`, `cancel`,
  `showAllProjects`, `command`, the `files` verbs (an edit on disk plus the file watcher's event), `advance`
  and `settle`. `expectState` waits until every visible surface equals the host and the host equals the
  expected literals, then checks that every request has exactly one terminal response and that no surface
  was answered for a request it did not send (ADR-007).
- **Timers.** `setTimeout` and `clearTimeout` are fake once the root is ready, for the watcher debounces;
  microtasks, `setImmediate` and file I/O are real. A scenario advances the clock or waits for a condition;
  it does not sleep.
- **Scenarios** (`scenarios.test.ts`): `A→B→A ordering`, `full/scoped/watcher invalidation both orders` (six
  orderings), `queue saturation + exception after admission`, `project deletion mid-request`, `shared query
  with one subscriber cancelling`, `surface disposed with pending ops`, `central version change affecting
  several projects`, `generation on responses`, since P3.4 `sidebar: uninstall then watcher invalidation
  converges`, and since P5.4 `bulk remove partial failure reconciles` (a bulk uninstall of three where one
  removal fails: the batch is `partial`, the failed package stays in the file and on both surfaces, nothing is
  removed by guessing, the credential in the error output does not reach the outcome, the project is restored
  once, and the operation's invalidation names only the packages that went), since P4.9b `updates converge across
  surfaces` (one computation for both surfaces, both ask again after an update) and `sources unreachable shows
  banner not empty`, and since P5.5 `prerelease toggle re-checks updates` (a toggle on either surface makes both
  ask under the new flag, and back). Later items add theirs here (P5.6 to P5.9, P6.4).

### Coexistence of 1.x and 2.0

There is one entry set since the flip (P8.1), and the 1.x code was deleted at P8.2b: `node esbuild.mjs` builds
`src/extension.ts` into `dist/extension.js`, `src/webview/main/index.tsx` into `dist/webview.js` and
`src/webview/sidebar/index.tsx` into `dist/sidebar.js`; `npm run watch` and the launch configuration "Run
Extension" use the same entries.

### Shared tooling

These parts are the current truth for the build, test and release pipeline.

- **Type-checking.** `npm run check-types` runs three programs: `tsconfig.json` (the extension and webviews,
  against Node 18 declarations through the `@types-host/node` alias, see ADR-000), `tsconfig.test.json` (Mocha
  end-to-end and ExTester UI suites) and `tsconfig.vitest.json` (every Vitest test and benchmark and the shared
  test helpers under `src/test`, against Node 24 declarations).
- **Linting.** `npm run lint` covers `src`, `scripts`, `esbuild.mjs` and the root configuration files.
- **Unit tests.** Vitest projects `backend` (`src/core`, `src/protocol`, `src/host`, `src/extension.test.ts`,
  `src/test/lint`), `frontend` (`src/webview`) and `integration` (the two-surface harness in `src/test/harness`,
  described below). Coverage has global thresholds, a separate
  floor for `src/webview/**` and a floor of 85 % of the lines for `src/core/**`. `node --test scripts/hooks` tests the guard hook.
- **Benchmarks.** Every `src/**/*.bench.ts`: the 2.0 benchmarks sit next to the modules they measure (plan decision
  D8, P8.2a; the list is in `benchmarks/README.md`), with the runner helper `src/test/benchmarks/benchmark.ts`. `npm run bench` runs them, `npm run
  bench:save` rewrites `benchmarks/baseline.json` and `npm run bench:compare` compares a run with it. The CI
  job `Benchmark (informational)` compares on its own hardware and never fails the pipeline.
- **Bundle size.** `node esbuild.mjs --production --analyze` fails when a bundle exceeds its ceiling. Metafiles go
  to `out/esbuild/`. The ceilings are the sizes measured at P8.2b plus 10 %. They are
  checked only under `--production --analyze`, which CI runs in the `E2E` build step (sizes in the job summary) and
  the `Build & Package` job.
- **Dotnet timings.** `npm run perf:baseline` (`scripts/perf-baseline.mjs`) times the `dotnet` commands the 2.0
  extension runs: SDK probe, `nuget config paths`, cold and warm restores, and the evaluator's msbuild runs on the
  e2e project and a multi-targeted copy of it. The CI job `Perf baseline (informational)` runs it on every push;
  `docs/perf-baseline.md` holds the baseline and the tolerances P7.6 checks.
- **Documentation.** `npm run docs:check` runs `scripts/check-docs-drift.mjs`, then `npm run docs:protocol:check`
  (`docs/protocol.md` is generated from `src/protocol/messages.ts`, with a Surface column from the members' trailing
  `// main`, `// sidebar` and `// sidebar → main` markers). The drift check reads this section, the interaction
  model, the 2.0 gotchas of `.github/copilot-instructions.md` and the README: every message name of a protocol group
  must be a request or event, the request and event counts must match the maps, every `nuiget.*` name must be a
  contributed setting, command, view or context key, the README's settings and commands tables must follow the
  manifest, every module map path must exist with a row for each 2.0 module, and every path under `src/`,
  `scripts/`, `docs/` or `.github/` must exist. It reads no sizes or line counts; `src/test/lint/docs-drift.test.ts`
  holds its negative controls.
- **Packaging.** `npm run package:vsix` runs `npm ci` → `check-types` → tests → lint and production build →
  `vsce package`. `npm run check:vsix` fails when the VSIX would contain anything other than `dist/*.js`,
  `dist/*.css`, `resources/`, `package.json`, `README.md`, `CHANGELOG.md` and `LICENSE`, or would lack a required
  file.
- **Continuous integration.** `.github/workflows/ci.yml` runs on pushes to `main` and `labs/**` and on pull
  requests to `main`. Every job installs with `npm ci`; actions are pinned by commit SHA.

  | Job | Needs | What it does |
  | --- | --- | --- |
  | Lint | — | `npm run lint`, the guard hook tests, then `npm run docs:check` |
  | Test (ubuntu, windows) | — | Unit tests with .NET SDK 10 installed; coverage on ubuntu |
  | E2E (VS Code 1.85.0, stable) | — | Production build with the ceiling check (sizes in the job summary), then the `v2-*` extension-host suite under Xvfb; log artifact per version |
  | UI | Lint, Test | ExTester packages a VSIX and runs `src/test/ui/v2` under Xvfb, then `check:vsix` on that build; log and screenshot artifact |
  | Build & Package | Lint, Test, E2E | Type check, production build, `check:vsix`, VSIX uploaded as artifact `vsix` |
  | Benchmark (informational) | — | Compares against `benchmarks/baseline.json`; never fails the run |

  The end-to-end run on VS Code 1.85.0 is what proves the extension works on the minimum supported host. The
  owner downloads the `vsix` artifact and publishes it manually.
- **The suites under test.** `npm run test:e2e` runs the extension-host suite: `.vscode-test.mjs` selects
  `out/test/e2e/v2-*.e2e.test.js` against what
  was last built into `dist/`. `npm run test:ui` runs `src/test/ui/v2` through ExTester, which packages its VSIX
  through `vscode:prepublish`, the production build. The two suites divide the work by what each can see. The
  extension-host suite (`src/test/e2e/v2-*.e2e.test.ts`, one file per legacy e2e file since P5.12a, shared steps in `v2Support.ts`)
  shows that the extension activates,
  that every contributed command answers, that the main panel is one tab that closes and opens again, and that
  noun-first `dotnet package add` and `remove` on the project file under both surfaces (an install, an update from
  3.13.3 to 3.14.0 by name, an edit and its write-back) do no harm; every wait is a bounded poll on the workbench or
  the file, and it runs on VS Code 1.85.0 too, the only Node 18 host that executes 2.0 code. The ExTester suite (`src/test/ui/v2/sidebar.ui.test.ts`) is the one that sees the
  webview: the sidebar lists the fixture's packages, a row is as high as its token says and the second row lies
  under the first (stylesheet, tokens and the virtual offsets work under the Content Security Policy), the row
  action shows with focus, and Delete uninstalls a package, announced in the live region and gone from the
  project file. `UI` runs `check:vsix` on the build ExTester packaged (N62, closed at P5.3); `E2E` builds
  with `node esbuild.mjs --production --analyze`, packages nothing and runs no `check:vsix`. Which 2.0 test replaces each
  legacy test file, and what P8.1 and P8.2 do with the legacy set, is `docs/plans/test-retirement-map.md` (P5.12b).
  `src/test/lint/interaction-model-testids.test.ts` holds the `data-testid` tables of `docs/ux/interaction-model.md`
  §8 to the ids the 2.0 webviews render.

## Repository Assistance Resources

Copilot resources are versioned under `.github/`: `copilot-instructions.md`
contains repository workflow rules, `instructions/` contains path-scoped guidance,
`agents/` contains specialist profiles, `skills/` contains on-demand workflows and
their bundled references, and `prompts/` contains the version-bump workflow.
React and TypeScript guidance is tailored to the client-only webviews and the
extension's existing build formats. CI efficiency and hardening skills and a
Technical Writer profile complement the application-focused resources.

Claude Code reads the same resources through `CLAUDE.md` and `.claude/` (rule pointers, skill links,
agent pointers). Two parts exist for the 2.0 work only: the `architecture-advisor` agent, a read-only reviewer
that implementing sessions consult, and the guard hook `scripts/hooks/guard.mjs`, registered in
`.claude/settings.json`, which blocks edits to frozen contract files, focused or skipped tests, unverified
commits and forced pushes.

These files affect development assistance, not extension runtime behavior.
Upstream-derived additions record their pinned Awesome Copilot source; local
adaptations are maintained alongside repository-specific rules.

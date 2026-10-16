# Changelog

All notable changes to the nUIget extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Two-line package cards in the main panel, name-first rows in the sidebar**
- **Installed rows show icon, authors and Verified mark, SDK and floating badges, under a Direct packages header with the count**
- **Updates rows show icon, authors and Verified mark with the new version marked, sorted by id; no 0 on the tab; every row of an Update all stays busy until it ends**

## [2.0.0] - 2026-10-16

### Breaking changes

- **nUIget 2.0 replaces the 1.x extension: the 2.0 main panel, sidebar and host are what the package ships**
- **nUIget 2.0 requires .NET SDK 10 or newer; projects that resolve an older SDK are read-only**
- **2.0 resets the persisted 1.x state: the selected project and source, the prerelease and restore toggles and the split positions are chosen once more, the cached feed data and the SDK cache are rebuilt, and the 1.x entries are removed from workspace and global storage at the first activation**
- **The `nuiget.noRestore` setting is no longer migrated to the restore toggle (set the toggle once if it was `true`), and the recent-searches list is gone**

### Added
- **2.0 updates of overridden central versions** — a package whose project overrides the central version updates in that project alone
- **2.0 Central Package Management in the UI** — a centrally managed package updates through a preview of the projects its central version applies to, and uninstalls from its project while the central entry stays; an unresolved version says why in its tooltip
- **2.0 Central Package Management preview** — the host previews which projects a central version change reaches (cpm/preview) and the sidebar's actions menu confirms it before the edit
- **2.0 Central Package Management edits** — on a verified .NET SDK 10 the 2.0 host installs and updates centrally managed packages through dotnet package add without --no-restore, previews which projects share the central entry, restores and refreshes them after the edit, refuses an edit while the project or props file has unsaved changes, and keeps the central entry when one project uninstalls
- **2.0 project evaluation** — `src/core/project` reads what MSBuild evaluates for a project (its target frameworks, each framework's package references and central versions, version overrides and SDK-injected references) into the same rows as the static inspection, once per project and revision, and evaluates again after a failure instead of keeping it, and both 2.0 surfaces show a project's packages from the project files at once and the evaluated list when MSBuild has answered
- **2.0 sidebar parity** — the sidebar shares its height between the Installed and Updates sections with a sash it remembers, opens a row's actions menu with Shift+F10 or a right-click and the package in the full view with Ctrl+Enter, catches up with the selection when it is shown again, groups All Projects by project and workspace folder with each row acting on its own project, installs a search result into the projects picked under All Projects, and says when no package source could be reached instead of offering an empty version list
- **2.0 All Projects** — the Installed and Updates tabs group every discovered project under its workspace folder, show unsupported projects with the reason (an SDK below 10 lists its packages read-only), aggregate transitive packages across projects on expand, and install from the details pane into several projects through a picker
- **2.0 package sources** — the main panel's header selects the package source among the enabled ones, and its NuGet sources dialog (also opened from the sidebar) lists every source with the config file that declares it, enables and disables a source, removes one after a confirmation in the dialog, and adds one to a chosen config file with optional credentials, an HTTP source only when the insecure connection is allowed; removing a source edits the config file that declares it
- **2.0 package details** — the main panel shows the details of the package selected in any list: its versions with the installed one marked, Install, Update, Downgrade and Uninstall for the selected project, description, license, size, vulnerabilities and dependencies by framework, details from the local package cache marked offline, and the README with highlighted code, copy buttons and images fetched by the extension; switching projects keeps the details read-only until the new project confirms the package
- **2.0 search** — the main panel searches the package sources from its search box, with suggestions while typing (or a search after a pause when `nuiget.searchDebounceMode` asks for it), results with icons, authors, downloads and Verified and Installed badges in place of the tabs, a warning with Retry when a source could not be searched, and navigation to a package that selects it; the sidebar searches as you type, installs a result with Enter or its row button, and filters its sections with `@installed` and `@updates`
- **2.0 feed discovery** — `src/core/feeds` finds what each NuGet V3 source offers from its service index (search, registration, flat container, autocomplete, vulnerabilities, README; never nuget.org's gzip-only registration hive), shares one discovery between callers so that one that gives up does not cost the others their answer, keeps a source that does not answer out of use for two minutes while a background monitor re-checks it, reads version lists, nuspecs, package sizes and icons from the flat container (telling a missing icon from a feed that failed), and ranks search results merged from several feeds by how well the id matches
- **2.0 package icons and README images** — `src/core/feeds` fetches package icons from the flat container of each source and delivers them as `data:` URIs, kept in the persistent cache within its byte budget; a feed that fails no longer leaves a package without its icon for a day, and a caller that gives up does not cancel the icon for another view waiting on it; README images are fetched by the extension over https from public hosts only, with a private source's credential sent only to that source's own server
- **2.0 package manifests and offline details** — `src/core/feeds` reads a package's nuspec (description, authors, license expression, project URL and dependency groups, including frameworks that need no dependency) and, when no source answers, shows the details of a version restored on this machine from the NuGet global-packages folder, marked as offline
- **2.0 package search** — `src/core/feeds` searches every selected source, through its search service or the dotnet CLI for local folders and feeds without one, merges the results by package id, ranks them by how well the name matches when several sources answered, and says when a source could not be searched instead of showing an empty result; quick search suggests ids per source and no longer falls back to nuget.org, and a search for an exact package id only reaches the sources that package is mapped to
- **2.0 versions, details and vulnerabilities** — `src/core/feeds` lists the versions a source publishes, with a listed-only list that leaves unlisted versions out for update suggestions, reads package details from the registration, and checks versions against each source's vulnerability data, which is kept for an hour only when it was read completely, so a feed that failed half-way is read again rather than hiding advisories
- **2.0 update check and package details** — `src/core/feeds` checks every installed package against all the sources it may come from and offers the newest version among them, never offers an update for an exact pin, says when a source could not be checked instead of reporting no update, fills in icons, authors and vulnerabilities per package, and takes package details from the source the package is mapped to; a configuration without nuget.org never contacts it, and a package mapped to a private feed never has its id sent to nuget.org
- **2.0 feeds in the Catalog** — both 2.0 surfaces now search, list versions, show details, READMEs and README images, and check updates through the package feeds, each read using the sources, package source mapping and credentials of the project's own `nuget.config` chain; the HTTP connections follow VS Code's proxy settings and are rebuilt when an `http` setting changes, and an answer from a feed that could not be reached is shown but never kept
- **2.0 source health** — both 2.0 surfaces hear when a package source becomes unreachable or comes back, the source list marks the failed ones, an update check against an unreachable source says so instead of showing an empty list, and the all-projects view fills in icons, authors and vulnerabilities per project as they arrive
- **2.0 HTTP transport** — `src/core/http` opens every feed connection of the 2.0 core: HTTP/1.1 through the request functions VS Code patches, so proxies from `http.proxy`, the environment or the operating system's configuration (PAC included) and the operating-system certificates apply as they do for other extensions; HTTP/2 only for nuget.org and only without a known proxy, falling back to HTTP/1.1 for good after a failed connection; redirects capped at five and re-checked against the resolved address, compressed responses decoded within a size cap, and every request bounded by its deadline and cancellable
- **2.0 Updates tab and sidebar Updates section** — the main panel and the sidebar list the updates of the selected project under the prerelease setting, show the rows as they are found, count them only when every source answered, update one package with Enter or its row button and several from the Update all dialog, show a read-only preview instead of updating a centrally managed package, and say that updates could not be checked, with Retry, when a source is unreachable; when the source comes back the updates are checked again
- **2.0 Installed tab** — the main panel lists the installed packages of the selected project or of every project in All Projects, one section per project, with a transitive dependencies section loaded on expand and a Restore banner when the assets file is missing, a bulk toolbar (Select all, Uninstall selected) over a multi-selectable list, and a confirmation dialog listing exactly the packages that will be uninstalled
- **2.0 main panel shell** — the main panel shows the selected project, source and prerelease setting in its header (project and prerelease can be changed there, for both surfaces), a refresh button, the unified search box that selects and filters the Installed or Updates tab with `@installed`, `@updates` and `@vulnerable`, and a resizable split between the list and the details; the 2.0 build now produces both stylesheets, and CI checks the contents of the 2.0 package
- **2.0 dialogs, popovers, tabs and toolbars** — the 2.0 webview primitives gain a modal dialog and a confirmation dialog that keep focus inside, close on Escape and give focus back to where it was, a popover that floats above clipping parents and stays inside the window, tabs and toolbars with one tab stop and arrow-key navigation; a dialog opened from a dialog, or a popover inside one, closes first and alone, and every icon a 2.0 bundle does not use is now left out of it
- **2.0 sidebar, first slice** — the sidebar lists the installed packages of the selected project with their state (provisional data, unresolved references, centrally managed packages, a project whose .NET SDK is too old), uninstalls a package from its row or with Enter or Delete, shows a spinner on the row until the operation has ended on either surface, keeps the list on screen while it is refreshed, and announces loading and every outcome to screen readers
- **2.0 webview message bus and store** — `src/webview/shared/bus` and `src/webview/shared/store` connect a 2.0 webview to the host: every request has exactly one outcome and can be cancelled, a late or out-of-date answer is never shown, a list is asked for again when the host says it changed and stays on screen meanwhile, a toggle shows its new value at once and goes back if the host refuses it, and a row is marked busy on both surfaces while an operation on its package runs
- **2.0 webview primitives** — `src/webview/shared/primitives` holds the building blocks of the 2.0 webviews: a virtualized list with one tab stop whose rows are options, with every row action on the keyboard (Enter, Ctrl+Enter, Delete, Shift+F10) and the pointer buttons kept out of the way of screen readers; a collapsible section header, icon button, badge, spinner, skeleton, progress bar, empty state, a banner that says its severity in words, a keyboard-operable split sash, and the one status region that announces outcomes; each is tested with a screen-reader rule check
- **2.0 webview tokens and icons** — `src/webview/shared` holds the design tokens of the 2.0 webviews (spacing, radius, row heights, icon sizes, hit target, z-index, motion, em typography and colour aliases, with high-contrast, forced-colours and reduced-motion coverage in one file) and the icon set without inline styles; a lint test keeps colour literals out of every other 2.0 webview file, and the frontend tests check rendered markup with axe
- **Two-surface harness** — `src/test/harness` drives the real 2.0 composition root with both webview hosts over fake webviews and an in-process fake dotnet that edits the scratch project files, and proves across the sidebar and the main panel: ordering of session changes, invalidation in every order, queue saturation and a throwing operation, project deletion during a request, one shared computation when a subscriber cancels, disposal with pending operations, and a central version change reaching several projects
- **2.0 composition root** — `src/extension.ts` assembles the 2.0 core and both webview hosts: one dotnet runner with a persisted SDK cache, one query coordinator whose invalidations reach both surfaces unchanged, a session that is reconciled with the sources of the project it keeps or picks whenever projects, sources or the selection change, file watchers for project, props, `nuget.config`, `global.json`, lock and assets files, a status bar item for the operation queue, and a redacting logger for everything the core logs
- **2.0 build** — `node esbuild.mjs` builds the 2.0 entry points into the three bundles, and `--production --analyze` checks them against size ceilings
- **2.0 protocol and core contracts** — `src/protocol` and `src/core/contracts.ts` define the typed messages and interfaces of the 2.0 host and webviews; `npm run docs:protocol` generates `docs/protocol.md` from them and CI fails when that file is out of date
- **2.0 webview hosts** — `src/host` answers every request of the 2.0 panel and sidebar with exactly one response, runs every package operation and forced restore through the operation queue, keeps a queued operation alive when the surface that asked for it closes, and serves both webviews under a Content Security Policy with a per-render script nonce and no remote origin, and every response that is a cached resource carries the generation it was computed for
- **2.0 catalog** — `src/core/catalog` is the one place the 2.0 panel and sidebar read from: projects, sources, installed and transitive packages are each computed once for both, and the list of installed packages appears from the project files at once and is refined when a full evaluation is available
- **2.0 credentials** — `src/core/credentials` finds the sign-in for an authenticated source in the environment, in `nuget.config` and through the Azure Artifacts Credential Provider, without a shell and without logging anything secret
- **2.0 package sources** — `src/core/sources` lists the sources that apply to each project through the dotnet CLI, reads credentials and package source mapping from the `nuget.config` chain, and sends a package id only to the sources that are enabled for the project and that the mapping allows
- **2.0 project context** — `src/core/project` works out for each project which .NET SDK, which `nuget.config` files and which sources apply to it, marks a project whose SDK is older than .NET 10 as read-only, and notices when one of its input files changes
- **2.0 project inspection** — `src/core/project` lists the packages a project references without running MSBuild, says for each where its version is declared (project, props file, central, override), limits references to their target frameworks, and reports what it cannot decide as unresolved instead of guessing
- **2.0 project references** — `src/core/project` reads the project references of a project and orders multi-project operations by them, also for backslash paths on macOS and Linux
- **2.0 project files** — `src/core/project` reads project and props files, `project.assets.json` and `packages.lock.json` for the 2.0 project model: project discovery and classification, central package versions with conditioned entries marked, and resolved versions per target framework
- **2.0 operation queue** — `src/core/ops` runs one package operation at a time with five waiting, answers every submission with exactly one outcome, including a refusal when the queue is full and a failure when the operation throws, and reports progress with the operation's id
- **2.0 package workflows** — `src/core/ops` installs, updates, removes and restores packages through the dotnet runner, reports the project edit and the restore separately, refuses edits on projects below .NET SDK 10 and additions or updates on Central Package Management projects, and redacts command output before it is logged
- **2.0 redirect guard** — `src/core/http` decides whether a redirect may be followed: no downgrade from HTTPS, no loopback, private or link-local target, also when the address is written as IPv4-mapped IPv6, NAT64 or 6to4, and a credential is forwarded to the same origin only
- **2.0 query coordinator** — `src/core/queries` computes each resource once per generation however many surfaces ask, never caches a result that an invalidation has overtaken, and reports one invalidation event per tick with the new generation of every key
- **2.0 dotnet runner** — `src/core/cli` runs `dotnet` without a shell and with a fixed English environment, builds the noun-first `dotnet package` commands of .NET SDK 10, validates every argument, and reports an older SDK as unsupported
- **2.0 log redaction** — `src/core/logging` removes credentials from text and command lines before they are logged, including tokens in URLs, `Proxy-Authorization` and `Cookie` headers and quoted passwords
- **2.0 core cache** — `src/core/cache` provides the two-tier cache of the 2.0 core with one table of lifetimes and key shapes; the persistent tier is limited to 8 MiB, and an invalidation that names packages drops only their version lists and metadata
- **Core versioning module** — NuGet version parsing, comparison and version-spec classification for 2.0; exact pins are never reported as updatable.
- **2.0 core utilities** — `src/core/util` provides the event emitter, bounded concurrency, file lookup, path normalization and dependency ordering that the 2.0 core modules build on, and coverage of `src/core` now has a floor of 85 % of the lines
- **2.0 import fences** — ESLint keeps the 2.0 layers apart from each other and from the 1.x code, with a self-pruning allow-list, and `npm run lint` now also covers `scripts/` and the root configuration files

### Changed
- **Benchmarks live next to the 2.0 modules they measure**
- **2.0 evaluation of a single-framework project is one msbuild run**
- **Benchmarks for the 2.0 core (versioning, cache, operation queue, invalidation scopes) with a regenerated baseline**
- **Benchmarks for the 2.0 transport and feed reads (updates, versions, search, nuspec parsing, relevance) with a regenerated baseline**
- **resources/invalidated carries per-key generations**
- **Webview CSP uses a script nonce and admits bundled fonts**
- **Credential lookup order is environment, nuget.config, then credential provider**
- **Azure Artifacts Credential Provider runs as the netcore plugin through dotnet (netfx plugin no longer used)**
- **Refreshed and scoped Copilot instructions, agents, and skills for the current extension architecture**
- **Added focused GitHub Actions skills and a repository-tailored Technical Writer agent**
- **Made the Copilot instructions, skills, and agents available to Claude Code**
- **Pre-approved Claude Code build and test commands and blocked publishing and force-push**
- **Pointed agent documentation lookups for VS Code, .NET, and NuGet at Context7**
- **Switched the Context7 MCP configuration to the documented Authorization header**
- **Updated runtime and development dependencies and removed obsolete type packages and watch-task tooling**
- **Migrated benchmarks to Vitest 5 with refreshed baselines and CI comparison reporting**
- **Added the nUIget 2.0 execution plan, architecture decision records, and UX interaction model under docs/**
- **Added the autonomous run protocol and item tracker for the 2.0 plan**
- **Applied the P1.1b contract changes and amended ADR-002 to ADR-008 to match**
- **Added the 2.0 session store and the matching of invalidation scopes to the core**
- **InvalidationEvent.keys carries per-key generations**
- **Recorded a .NET SDK 10 probe of package add and remove on Central Package Management projects**
- **The SDK probe is a script that also records per-framework evaluations, and CI re-runs it on the newest SDK 10**
- **Recorded the NuGet version conformance table and checked it with property tests**
- **Split agent gotchas into 1.x and 2.0 sections and added 2.0 layer-boundary instructions**
- **Added the architecture-advisor agent and the 2.0 execution protocol summary for Claude Code**
- **Type-checked the extension against Node 18 declarations, the VS Code 1.85 host baseline**
- **Added Claude Code guard hooks that protect frozen contracts, tests, and commit and push safety during the 2.0 work**
- **Stopped shipping development configuration files in the extension package and added a package contents check**
- **Rebuilt the CI pipeline: clean installs, pinned actions, Windows unit tests, end-to-end tests on the minimum supported VS Code, UI tests, and a downloadable package artifact**
- **Let the end-to-end test runner use its own Mocha 11 so the tests can run on VS Code 1.85**
- **Type-checked the 2.0 tests and shared test helpers as part of check-types and added a coverage floor for the webviews**
- **Added a 2.0 section to ARCHITECTURE.md, marked the 1.x sections, and corrected statements that no longer matched the code**
- **Added the findings ledger for the 2.0 work under docs/plans**
- **2.0 theme pass**
- **Ported the extension-host end-to-end suites to the 2.0 entry with noun-first dotnet commands and bounded waits**
- **`nuiget.recentSearchesLimit` removed**
- **Deleted the 1.x extension code; the 2.0 entry and sidebar moved to `src/extension.ts` and `src/webview/sidebar`**
- **Removed the 1.x sections of ARCHITECTURE.md and the 1.x agent gotchas**

### Fixed

- **Long NuGet prerelease versions and package IDs remain intact during CLI search and installation**

## [1.18.9] - 2026-10-10

### Fixed

- **Unlisted NuGet versions are no longer suggested as package updates**
- **Cross-platform UI test input replacement and panel state isolation**

## [1.18.8] - 2026-06-30

### Fixed

- **All-projects "Transitive packages" header no longer shows a misleading "(0)" before the list is lazily loaded**

### Changed

- **Skeleton loading rows replace the spinner when loading installed packages (no layout shift)**
- **Parallelized per-project dependency-map reads for faster bulk-operation startup**
- **Faster sidebar refresh after external `.csproj` changes (debounce 5s → 2s)**
- **Memoized the all-projects updates keyboard handler to avoid per-render allocations**
- **Non-blocking offline-metadata file checks (async `fileExists` instead of sync `fs.existsSync`)**

## [1.18.7] - 2026-06-30

### Changed

- **Parallelized vulnerability-page fetching — first-load enrichment ~11x faster on large indexes**
- **Optimistic package removal on the main panel — removed rows disappear immediately**
- **Removed empty-state flash after bulk remove in all-projects mode**
- **Parallelized sidebar first-paint data (projects + sources) and multi-root project discovery**
- **README fetch no longer waits for package metadata to load first**
- **De-duplicated concurrent cold-start source listing and service-index discovery**

## [1.18.6] - 2026-06-30

### Fixed

- **Transitive "Required by: unknown" resolved via reverse-BFS top-level root resolution**

### Changed

- **Required-by now groups by project in all-projects mode, with a per-row project count**
- **Dependency refresh — all runtime and dev dependencies updated to latest compatible versions**
- **Tooling and library majors — esbuild 0.28, marked 18, @types/node 26, @vscode/test-electron 3, @vscode/test-cli 0.0.15**

### Security

- **Resolved all npm audit advisories — 0 vulnerabilities remaining (previously 1 critical, 8 high, 5 moderate, 2 low)**

## [1.18.5] - 2026-05-02

### Added

- **Transitive packages in all-projects mode**— All-Projects view now shows a single aggregated **Transitive Packages** section. Each row deduplicates by `id@version` across projects and lists every framework that pulls the package in. Selecting a row opens the standard details panel with a project-grouped **Required by** breakdown so you can see exactly which projects (and which top-level packages within them) bring in each transitive dependency. Loads lazily on section expand, streams per project so partial data appears immediately, and exposes a **Restore N projects** button when `obj/project.assets.json` is missing for one or more projects.
- **"Restore after operations" toggle** — New per-workspace UI toggle replaces the legacy `nuiget.noRestore` setting. Sidebar shows a `$(verified-filled)` (on, default) / `$(verified)` (off) icon in the title bar; main panel shows a checkbox next to "Include prerelease". Both stay in sync. When off, install/update/remove operations skip the trailing `dotnet restore` phase, mirroring the previous setting's behavior with discoverable UI. Existing `nuiget.noRestore` values are migrated automatically on first activation (multi-root workspaces: any folder with `noRestore: true` migrates to `restoreEnabled: false`).
- **Performance instrumentation** — Optional `[perf]` timing logs in the nUIget output channel, gated by the new `nuiget.enablePerformanceLogging` setting (default: off). When enabled, hot paths (panel open, installed-package load, search, install/update/remove, sidebar resolve) emit total wall time and sub-phase deltas. Multi-root workspaces tag each line with the owning workspace folder name.
- **Hover prefetch** — Hovering a package row in the Browse, Installed, and Updates tabs prefetches its versions list and (when known) its metadata after a 150ms dwell. The details panel and version dropdown now usually appear instantly on click instead of showing a loading flash. Prefetches are deduplicated, capped to 4 concurrent backend lookups, and skipped when the data is already cached.
- **`nUIget: Clear SDK Version Cache` command** — New Command Palette entry to manually invalidate the persisted SDK-major-version map (rare; extension-version stamping and `global.json` watcher cover most cases automatically).
- **Workspace folder add/remove auto-refresh** — Adding or removing a workspace folder now triggers a debounced (300ms) refresh of the main panel and sidebar so any in-flight All-Projects enumeration aborts and restarts with the new folder list.
- **Persistent SDK version cache** — The `dotnet --version` probe (~250ms per project directory) now persists across VS Code sessions. The snapshot is keyed by extension version and invalidates automatically when `global.json` changes or the extension is upgraded. The persisted map is capped at 256 entries (FIFO/insertion-order eviction) to bound `globalState` growth across long-lived installs.

### Removed

- **`nuiget.noRestore` setting** — Replaced by the **Restore after operations** UI toggle (see Added). Existing values are migrated to per-workspace state on first activation.

### Changed

- **Version dropdown enabled for floating/range versions**
- **Optimistic install/update write-through** — Single-package install and update now apply to the visible row immediately (new row appears, version flips). Authoritative re-fetch still runs underneath as silent reconciliation, so failures or stale data correct themselves without flicker.
- **Refresh no longer blocks on disk HTTP cache clear** — Manual refresh now clears in-memory caches (sources, service index, metadata, search, versions, package data) synchronously and runs the on-disk `dotnet nuget locals http-cache --clear` in the background. Concurrent refreshes coalesce so only one disk-clear runs at a time. The Command Palette `nUIget: Clear NuGet HTTP Cache` still awaits completion.
- **Package metadata cache size increased** — In-memory LRU bumped from 200 → 500 entries. Cleared on Refresh (relies on Plan 05 widening) so users always get fresh data when they ask for it.
- **Quick-search autocomplete results cached for 5 minutes** — Up from 30 seconds. Newly published packages can take up to 5 min to appear in autocomplete; click Refresh to clear immediately.
- **Streaming all-projects installed (Stage A)**
- **Streaming all-projects installed (Stage B)**
- **All-projects view groups by workspace folder**
- **Removed legacy non-streamed all-projects installed path**

### Fixed

- **Cross-project filtering of `packageUpdates` in sidebar single-project view**
- **Cross-project filtering in `bulkRemoveResult`**
- **Stale `allProjectsUpdatesRef` entry not dropped on revalidate**
- **Loading skeleton flash on `packageChanged` install fallback and `bulkInstallResult`**
- **Sidebar flicker — duplicate reload after package operations**
- **Sidebar flicker — empty-state flash on external `.csproj` changes**
- **Sidebar — unnecessary "Checking for updates" spinner when results already shown**
- **Sidebar — unrelated package rows re-rendering on state changes**
- **Sidebar — install with empty version no longer inserts a blank row**
- **Sidebar — `allProjectsInstalled` revalidate no longer blanks rows during refresh**
- **Sidebar — `revalidate` clears stale per-project updates cache**
- **Sidebar — package update/remove no longer cross-project filters update list**
- **File watcher — mid-operation `.csproj` changes are now captured (debounce rearmed after op)**
- **Sidebar tests — assertions now use `.not.toBeNull()` for proper presence check**
- **All-projects installed list no longer hidden behind a spinner during streaming**
- **Bulk update in all-projects mode now refreshes installed rows**
- **Failed `dotnet --version` probes no longer survive across sessions**
- **SDK-cache persistence writes are now serialized**
- **Second package operation silently dropped while first was running**

## [1.18.4] - 2026-04-16

### Added

- **Generalized API search for all V3 NuGet sources** — Package search now uses the V3 SearchQueryService API for ANY NuGet source that supports it (not just nuget.org). Multiple sources are queried in parallel with results merged and deduplicated. Auth headers are passed for authenticated feeds. Handles both camelCase and PascalCase response fields (BaGet/ProGet compatibility). CLI is used only as fallback for V2 feeds and local sources.
- **Multi-project install from sidebar** — When "All Projects" is selected in the sidebar, installing a package (via "+" icon or right-click context menu) now shows a multi-select project picker. Users can select multiple projects at once; single selection uses the existing install path, multiple selections use bulk install with topological sort and deferred restore.
- **Partially-installed package UX in sidebar** — In all-projects mode, packages installed in some but not all projects now show a `+` icon (for installing in remaining projects) with an N/M badge indicating install count. Context menu shows both install and uninstall actions. Fully installed packages show the trash icon as before.

### Changed

- **Refresh buttons now clear NuGet HTTP cache**
- **ESLint 10**
- **Removed `.npmrc`**

### Fixed

- **API search description dropped**
- **Local/failed sources dropped from search**
- **Multi-source search result ordering**
- **Multi-source search result count exceeding limit**
- **Resolved `dompurify` moderate vulnerability (GHSA-39q2-94rc-95cp)**
- **Resolved `typescript-eslint` peer dependency warning for TypeScript 6.0**
- **Multi-source API search sorting drops custom source packages**
- **CI lockfile sync failures**
- **Sidebar keyboard shortcuts respect partially-installed state**
- **Sidebar context-menu install rechecks operation lock to reduce race window**
- **Sidebar `+` button passes pre-fetched installed info to avoid redundant query**
- **Sidebar `fullyInstalledSet` guards against flicker during refresh**

## [1.18.3] - 2026-04-15

### Changed

- **Two-phase installed packages delivery**
- **Two-phase CLI search results delivery**
- **Incremental streaming update results**
- **Quick search LRU cache**

### Removed

- **Dead `autocompletePackageId` code** — Removed the unused `autocompletePackageId()` method, its `autocompleteCache`, facade method, tests, and benchmark. `quickSearchGrouped()` is the sole autocomplete path.

## [1.18.2] - 2026-04-13

### Fixed

- **Redundant source resolution in multi-project update checks**
- **Redundant `checkAllProjectsUpdates` from `refreshScoped` in all-projects mode**
- **Sidebar `bulkUpdateAllProjectsResult` triggering fallback `checkPackageUpdates`**

## [1.18.1] - 2026-04-13

### Fixed

- **Installed packages not refreshing after operations in all-projects mode**
- **Sidebar installed section stale after main panel remove/install/update**
- **File watcher safety-net cancelled by main-panel-initiated operations**

## [1.18.0] - 2026-04-12

### Added

- **Integration test infrastructure** — Vitest `integration` project with 53 tests across 8 files covering NuGetPackageService, NuGetProjectService, NuGetSourceService, NuGetService, NuGetPanel, NuGetSidebarPanel, CrossPanelSync, and CacheInvalidation
- **Performance benchmark infrastructure** — 13 benchmark files using Vitest bench (tinybench) covering utils, csproj parsing, cache operations, search, metadata, project parsing, update checking, source health, markdown rendering, HTTP client, search query parsing, and React rendering
- **E2E test infrastructure** — 8 test files using @vscode/test-electron + Mocha for Extension Host testing (extension activation, commands, panel, sidebar, install/update flows, source management, file watcher, settings persistence)
- **UI test infrastructure** — 11 test files using vscode-extension-tester (ExTester) for Selenium-based UI testing (activation, panel open, search/install/update/remove flows, sidebar interaction, source settings, keyboard navigation, context menu, theme switching)
- **data-testid attributes** — Added to 9 React components (App, SidebarApp, PackageDetailsPanel, InstalledTab, UpdatesTab, SourceSettingsOverlay, DraggableSash, PackageRow, SectionHeader) for UI test targeting
- **VS Code tasks for test layers** — 7 new tasks: Run Integration Tests, Run E2E Tests, Run UI Tests, Run Benchmarks, Save Benchmark Baseline, Compare Benchmarks, Run All Tests (Unit + Integration)
- **npm scripts for test layers** — `test:integration`, `test:e2e`, `test:ui`, `bench`, `bench:save`, `bench:compare`
- **Benchmark baseline comparison in CI** — PR benchmark job compares against committed `benchmarks/baseline.json` and reports to GitHub Actions summary

### Fixed

- **Uninstall Selected button invisible in light themes**
- **Cache key race condition on source/prerelease switch**
- **Full main panel refresh after sidebar operations**
- **Redundant Installed tab re-fetch on tab switch**
- **Benchmark suite not working**
- **Resolved `diff` and `serialize-javascript` vulnerabilities**

### Changed

- **ESLint config**
- **Benchmark npm scripts**

## [1.17.4] - 2026-04-11

### Changed

- **Selective cache invalidation after operations** — Install/update/remove operations now invalidate only the affected package's version cache entries instead of clearing the entire cache. Saves 20-30 redundant HTTP requests per operation in workspaces with many packages.
- **Scoped background update checks** — Post-operation background re-checks now scope to the affected project instead of re-checking all projects. Multi-project workspaces see proportional speedup.
- **Removed redundant sidebar getInstalledPackages request** — The sidebar `packageChanged` handler no longer sends a separate `getInstalledPackages` request; the background update check already provides fresh installed data.
- **Bulk operations include packageIds for cross-panel sync** — All bulk operation notifications (bulkInstall, bulkUpdate, bulkRemove, bulkUpdateAllProjects, bulkRemoveAllProjects) now include the affected package IDs, enabling selective cache invalidation in the receiving panel.

## [1.17.3] - 2026-04-10

### Changed

- **Type-safe error handling** — Replaced `as ExecError` type assertion casts with `isExecError()` type guard across CLI and source services
- **Deduplicated `parseSearchQuery`** — Sidebar now imports the shared implementation from `utils/parseSearchQuery` instead of maintaining a local copy
- **`httpsUpgradeDomains` uses `Set`** — Converted from array to `Set` for O(1) lookups in markdown HTTP-to-HTTPS domain matching
- **Memoized SVG icon components** — All 26 icon components in `icons.tsx` wrapped with `React.memo` to prevent unnecessary re-renders

## [1.17.2] - 2026-04-10

### Changed

- **Update checking performance** — Pre-resolves all NuGet sources, service endpoints, and auth headers once before starting the batch version-check loop. Eliminates the "service index stampede" where 16 concurrent workers all made redundant HTTP calls to the same service index URLs, and removes per-package source/endpoint/auth resolution overhead.

### Removed

- **Activity Bar badge** — Removed the update count badge from the sidebar Activity Bar icon and the `nuiget.showActivityBarBadge` setting. The sidebar's Updates section already displays accurate update counts via its section header, making the badge redundant. This removal eliminates significant complexity (badge caching, 10-minute background timer, dual TreeView/WebviewView routing, stale-count edge cases) with no loss of functionality.

## [1.17.1] - 2026-04-10

### Fixed

- **Sidebar batch update causes mid-operation UI refresh spam**

## [1.17.0] - 2026-04-10

### Added

- **Unified "All Projects" toggle** — Replaced per-section toggle icons in Installed and Updates tabs (and sidebar sections) with a single "All Projects (N)" option in the project selector dropdown (full manager) and QuickPick dialog (sidebar). Selecting "All Projects" drives both Installed and Updates views simultaneously, persists across tab switches, and auto-downgrades to a single project when only one project remains in the workspace.
- **Package icons in all-projects mode** — All-projects views in the full manager now display package icons using progressive/lazy loading. Icons resolve in the background after the initial data loads, providing fast initial render with icons appearing shortly after.
- **Collapsible project groups in sidebar** — All-projects mode in the sidebar now renders project groups as collapsible tree-view items with chevron icons, matching VS Code's native explorer behavior. Project headers show a badge count and toggle their children on click or Enter/Space.

### Changed

- **VS Code-native sidebar styling** — Project group headers and package rows in the sidebar now match VS Code explorer typography: 22px row height, native font size, bold group headers, and proper tree-view indentation with hover/focus states.

### Fixed

- **Updates out of sync between sidebar and full manager**
- **Refresh in all-projects mode not re-fetching data**
- **All-projects Installed tab showing "No packages installed" instead of package list**
- **Packages not selectable in all-projects Installed and Updates tabs**
- **Project picker always highlighting "All Projects"** — Sidebar project picker now correctly highlights the currently selected project instead of always defaulting to the first item
- **Install not working when "All Projects" is selected** — Full manager disables the Install button with a tooltip directing users to Multi Install; sidebar shows a one-time project picker for install actions without changing the overall project selection
- **Stuck loading spinner when rapidly switching between All Projects and single project**
- **Sidebar context menu UX in all-projects browse mode** — Right-clicking a browse package with "All Projects" selected now shows the actions QuickPick first. Project-independent actions (Copy Package ID, View Package Details) execute immediately. Project-dependent actions (Install, Uninstall, Change Version) show a project picker after selection. Uninstall/Change Version picker is filtered to projects where the package is installed; Install picker shows all projects with installed markers.
- **Sidebar browse row icon not updating after install/remove in all-projects mode**
- **Sidebar context menu failing for installed packages in all-projects mode**
- **Install/Update button disabled in full manager when package is selected from all-projects Installed or Updates tab**
- **Sidebar browse showing "+" instead of trashcan for installed packages in all-projects mode** — Browse rows now correctly show the uninstall (trashcan) icon when a package is already installed in any project. Tooltip shows which project(s) the package will be removed from. Clicking the trashcan removes directly for single-project installs or shows a project picker for multi-project installs.
- **"All Projects" selection not carrying over when opening full manager from sidebar**
- **Install button not disabled for currently installed version in all-projects mode**
- **Sidebar showing empty installed/updates sections after switching to all-projects mode**
- **Quick search dropdown opening when navigating to package details from sidebar**
- **Sidebar trashcan icon doing nothing for installed packages in all-projects mode** — Clicking the trashcan now removes the package from the specific project it's listed under, instead of sending the sentinel value as the project path
- **Slow full manager refresh after uninstall/install/update with sidebar open** — Sidebar background update check no longer sends a redundant refresh command back to the main panel that initiated the operation, eliminating a second full reload cycle (installed packages + update check + icon resolution)

## [1.16.0] - 2026-04-01

### Added

- **Unified Search Bar** — Removed the Browse tab and InstalledTab filter bar; a single always-visible search bar drives browse, @installed, @updates, and @vulnerable modes with @-prefix dropdown, quick search suggestions, recent searches, and keyboard navigation — matching the sidebar's search UX
- **Unified search bar tests** — 19 new tests covering filter dropdown keyboard navigation (ArrowDown/Up/Enter/Tab/Escape), @-prefix auto-show, tab auto-activation on @-prefix, clear search restoring tabs, browse mode Enter/Escape, vulnerability badge, debounce suppression for @-prefix queries, and searchDebounceMode settings integration

### Fixed

- **Activity Bar badge not updating after sidebar operations**
- **Filter dropdown Escape key re-opening immediately**
- **Filter icon button not showing dropdown when search is empty**
- **@-prefix typing triggering search debounce instead of filter dropdown**

## [1.15.3] - 2026-03-30

### Added

- **Discriminated Union Message Types** — All 48 webview↔extension host message types defined as typed interfaces in `NuGetTypes.ts` with `PanelRequestMessage` and `SidebarRequestMessage` unions, eliminating `as` type casts from both panel message handlers
- **Shared Query Functions** — `queryAllProjectsUpdates()` and `queryAllProjectsInstalled()` extracted to `NuGetOperations.ts`, deduplicating identical loops from `NuGetPanel.ts` and `NuGetSidebarPanel.ts`
- **Centralized HTTP Redirect Handling** — `resolveRedirect()` and `isRedirectStatus()` helpers in `Http2Client.ts` replace inline redirect logic across 10 sites in Http2Client.ts and NuGetService.ts, consolidating status detection, URL resolution, SSRF validation, and same-origin auth forwarding
- **NuGetLogger and NuGetCliService Extraction** — Logging utilities and dotnet CLI operations extracted from `NuGetService` into `NuGetLogger.ts` and `NuGetCliService.ts`, reducing the god class by ~320 lines while preserving the public facade API
- **NuGetSourceService Extraction** — Source CRUD operations, config file management, and source name generation extracted from `NuGetService` into `NuGetSourceService.ts`, continuing the facade decomposition
- **NuGetProjectService Extraction** — Project discovery, .csproj parsing, installed packages, transitive dependency resolution, and `project.assets.json` caching extracted from `NuGetService` into `NuGetProjectService.ts` (~440 lines), further reducing the god class
- **NuGetPackageService Extraction** — Package search, metadata resolution, version queries, vulnerability data, icon URL resolution, autocomplete, update checking, README extraction, and size fetching extracted from `NuGetService` into `NuGetPackageService.ts` (~1250 lines), reducing the god class from ~3400 to ~1200 lines (64% reduction)
- **Sub-Service Unit Tests** — New test files for `NuGetLogger` (22 tests), `NuGetCliService` (27 tests), `NuGetSourceService` (32 tests), and `NuGetProjectService` (24 tests), covering credential sanitization, SDK detection, CLI operations, source CRUD/caching, project discovery, .csproj parsing, transitive dependency resolution, and assets.json caching
- **Credential Validation** — `isValidCredentialValue()` validator in `NuGetUtils.ts` prevents command injection via username/password fields in `addSource()`

### Fixed

- **Main panel stuck loading spinner on checkAllProjectsUpdates/checkAllProjectsInstalled errors**
- **Sidebar post-disposal messaging when dispose() called directly**
- **HTTP redirect URL parsing crash** — `resolveRedirect()` now catches malformed `Location` headers instead of throwing
- **Removed internal refactor script** — Deleted `_replace_methods.cjs` from repository root (was incorrectly shipped in VSIX)

## [1.15.2] - 2026-03-29

### Added

- **Discriminated Union Message Types** — All 48 webview↔extension host message types defined as typed interfaces in `NuGetTypes.ts` with `PanelRequestMessage` and `SidebarRequestMessage` unions, eliminating `as` type casts from both panel message handlers
- **Shared Query Functions** — `queryAllProjectsUpdates()` and `queryAllProjectsInstalled()` extracted to `NuGetOperations.ts`, deduplicating identical loops from `NuGetPanel.ts` and `NuGetSidebarPanel.ts`
- **Centralized HTTP Redirect Handling** — `resolveRedirect()` and `isRedirectStatus()` helpers in `Http2Client.ts` replace inline redirect logic across 10 sites in Http2Client.ts and NuGetService.ts, consolidating status detection, URL resolution, SSRF validation, and same-origin auth forwarding
- **NuGetLogger and NuGetCliService Extraction** — Logging utilities and dotnet CLI operations extracted from `NuGetService` into `NuGetLogger.ts` and `NuGetCliService.ts`, reducing the god class by ~320 lines while preserving the public facade API
- **NuGetSourceService Extraction** — Source CRUD operations, config file management, and source name generation extracted from `NuGetService` into `NuGetSourceService.ts`, continuing the facade decomposition
- **NuGetProjectService Extraction** — Project discovery, .csproj parsing, installed packages, transitive dependency resolution, and `project.assets.json` caching extracted from `NuGetService` into `NuGetProjectService.ts` (~440 lines), further reducing the god class
- **NuGetPackageService Extraction** — Package search, metadata resolution, version queries, vulnerability data, icon URL resolution, autocomplete, update checking, README extraction, and size fetching extracted from `NuGetService` into `NuGetPackageService.ts` (~1250 lines), reducing the god class from ~3400 to ~1200 lines (64% reduction)
- **Activity Bar Badge** — Shows the number of available NuGet package updates on the nUIget sidebar icon, with per-project update breakdown in the tooltip for multi-project workspaces. Configurable via `nuiget.showActivityBarBadge` (default: on). Uses runtime detection for compatibility with older VS Code versions.
- **Test Infrastructure** — Vitest (backend/frontend projects), React Testing Library, VS Code API mocks, test fixtures, coverage with V8 provider
- **CI/CD Pipeline** — GitHub Actions workflow with lint, test (with coverage upload), and build/package jobs. Concurrency control cancels stale PR runs. VSIX artifact uploaded on successful builds
- **Comprehensive Test Coverage** — 955 tests across 22 test files covering all services, panels, React components, and hooks. Coverage thresholds enforced: 65% lines/statements, 50% branches, 55% functions

### Fixed

- **Sidebar stuck loading spinner when project path becomes invalid**
- **Main panel stuck loading spinner on backend errors**
- **Resolved all npm audit vulnerabilities**
- **Eliminated all 848 ESLint warnings from build output**

## [1.15.0] - 2026-03-27

### Added

- **GitHub Pull Request Template** — Structured PR template optimized for autonomous coding agent review, with PR type selection, structured change manifest table, strict testing/verification and security review checklists, manual testing steps, and collapsible agent-routing hints with component-to-file mapping
- **GitHub Issue Templates** — Five structured YAML issue form templates (bug report, feature request, performance, UI/UX, documentation) optimized for autonomous agent resolution, with component-to-file mapping hints, required environment fields, severity/scope dropdowns, and blank issues blocked
- **Bundle analysis flag** — `node esbuild.mjs --analyze` prints per-bundle size breakdowns via esbuild metafile
- **EditorConfig** — `.editorconfig` for consistent cross-editor formatting (indent, line endings, trailing whitespace)
- **CSS module type declaration** — `src/global.d.ts` declares `*.css` modules for TypeScript 6.0 `noUncheckedSideEffectImports` compatibility

### Changed

- **TypeScript 6.0**
- **ESLint ecmaVersion 2020 → 2022**
- **All dependencies updated to latest**
- **Removed unused `@exodus/bytes` devDependency**
- **Resolved `fast-xml-parser` moderate vulnerability (GHSA-jp2q-39xq-3w4g)**
- **Fixed `no-useless-assignment` lint error in `App.tsx` keyboard navigation**

### Security

- **SSRF redirect validation** — All HTTP redirect handlers (Http2Client + NuGetService) now validate redirect targets via `isSafeRedirectTarget()`, blocking redirects to private/loopback IPs (10.x, 172.16-31.x, 192.168.x, 169.254.x, localhost, ::1) and HTTPS→HTTP downgrades
- **ZIP-SLIP path traversal prevention** — nupkg README extraction now rejects zip entries with `..`, leading `/`, or backslash path traversal patterns; nuspec-provided readme paths are also validated
- **DOMPurify hardening** — Explicit `ALLOWED_URI_REGEXP` (https/http/mailto only), `FORBID_TAGS` (style, form, input, textarea, select, button), and `FORBID_ATTR` (style) restrictions added to markdown sanitization

### Changed

- **TypeScript strictness** — Added `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride` to tsconfig.json
- **ESLint strict enforcement** — Promoted all `warn` rules to `error` (`curly`, `eqeqeq`, `no-throw-literal`, `semi`, `prefer-const`, `@typescript-eslint/no-unused-vars`, `react-hooks/exhaustive-deps`); added `no-explicit-any` (warn), `no-non-null-assertion` (warn), `no-console` (warn, allows warn/error)
- **Eliminated all `any` types** — Replaced `fetchJson<any>` with typed NuGet API response interfaces (`NuGetSearchResponse`, `NuGetRegistrationEntry`, `NuGetRegistrationPage`); replaced `catch (error: any)` with `unknown`; replaced `handleMessage(message: any)` with `WebviewMessage` type
- **Resolved npm audit vulnerabilities** — Fixed `brace-expansion` and `picomatch` transitive vulnerabilities

## [1.15.1] - 2026-03-27

### Fixed

- **SSRF redirect handling for relative URLs** — `isSafeRedirectTarget()` now resolves relative `Location` headers against the original URL; all 11 redirect sites across Http2Client.ts and NuGetService.ts pass the resolved absolute URL to recursive calls
- **Update operation version guard** — `executeSingleOperation()` now throws early if version is missing for update operations instead of silently passing an empty string

## [1.14.1] - 2026-03-19

### Fixed

- **Sidebar browse install uses wildcard version** — The sidebar "+" button now explicitly passes `--version <latest>` to the `dotnet add package` CLI command, preventing wildcard or floating version references in the `.csproj` file

## [1.14.0] - 2026-03-18

### Added

- **Installed tab count badge** — The Installed tab in the main panel now shows a count badge with the number of installed packages, matching the existing Updates tab badge and the sidebar's Installed section header badge
- **Installed tab vulnerability badge** — The Installed tab shows a severity-colored vulnerability badge (with warning icon and count) when any installed packages have known vulnerabilities, colored by highest severity (Low/Moderate/High/Critical)
- **Installed tab @vulnerable filter** — Type `@vulnerable` in the Installed tab filter to show only packages with known security vulnerabilities, with `@`-prefix dropdown auto-complete matching the sidebar pattern
- **Filter funnel button** — Added a filter funnel icon button (matching VS Code's native Extensions sidebar) to both the sidebar search and Installed tab filter bar, providing one-click access to all available `@`-prefix filters

### Fixed

- **Sidebar wrong-project packages on startup** — Fixed multi-project workspaces showing packages for the wrong project when opening the sidebar, caused by a ref timing race between `state` and `projects` message handlers. Also added `projectPath` validation on `installedPackages`/`packageUpdatesMinimal` responses to discard stale out-of-order replies, and removed the same-project guard in `projectChanged` so re-selecting the current project triggers a refresh
- **Bulk install deferred restore** — `executeBulkInstall` now uses `--no-restore` per project and runs a single `dotnet restore` at the end of the batch, matching the existing bulk update/remove pattern and properly respecting the `noRestore` setting

## [1.13.0] - 2025-03-12

### Added

- **Source-targeted install and update operations** — Install and update CLI commands now pass `--source` to `dotnet add package` when the winning source is known, avoiding redundant probing of all configured NuGet sources and significantly speeding up single and bulk operations in multi-source environments
- **Clear NuGet HTTP Cache command** — New `nUIget: Clear NuGet HTTP Cache` command in the Command Palette for explicitly clearing the dotnet NuGet HTTP cache when needed

### Changed

- **Background source health monitor** — Source validation moved from blocking per-search pre-validation to a self-scheduling background monitor that validates all sources at startup and re-checks at TTL expiry (120s for failures, 5min when healthy), eliminating 3s search delays in multi-source environments
- **Pre-validation timeout reduced to 3 seconds** — Source health pre-validation timeout lowered from 5s to 3s for faster search startup when unreachable sources are present
- **Refresh no longer clears NuGet HTTP cache** — Refresh buttons in both the full manager and sidebar no longer run `dotnet nuget locals http-cache --clear` (0–15s process spawn), making refresh near-instant

## [1.12.0]

### Added

- **VS Code-style search progress indicator** — Sidebar now shows a native-style indeterminate linear progress bar (animated 2px dash sliding left-to-right) below the search input during browse searches, installed loading, and update checks

### Changed

- **Native sash styling** — Sidebar and main panel sashes now use the native VS Code pattern: transparent hit area with a `::before` pseudo-element for the accent line, plus a 300ms hover delay to prevent flash on cursor pass-through

### Fixed

- **Vulnerability data not loading** — Vulnerability base JSON (~15-20 MB) exceeded the 10 MB response size limit, silently returning no data. Vulnerability fetches now use gzip/deflate compression (~2-3 MB transfer), fixing missing shield badges on installed packages

## [1.11.0]

### Added

- **Vulnerability scanning for installed packages** — Fetches NuGet V3 VulnerabilityInfo index, enriches installed packages with vulnerability data (severity + advisory URL), displays color-coded shield badges on package rows and detailed advisory links in the details panel
- **Package size display** — Shows nupkg download size (via HEAD request to flat container) in the details panel, formatted as KB/MB
- **Offline metadata fallback** — When all NuGet sources are unreachable, reads `.nuspec` from the local global-packages cache (`~/.nuget/packages/`) to display basic metadata (description, authors, dependencies) with an "Offline" indicator
- **Optimistic UI updates after package operations** — Install, update, remove, and bulk operations now immediately update the updates list and badge counts without waiting for a full re-check, significantly improving perceived responsiveness
- **Per-package failure tracking in bulk operations** — Bulk update/remove result messages now include `failedPackageIds` (single-project) and `perProjectFailedIds` (all-projects), enabling accurate optimistic state when some packages fail
- **Operation-aware cross-panel sync** — Main panel now sends operation details (type, packageId, projectPath) to the sidebar instead of triggering a full refresh, enabling surgical sidebar state updates
- **Lightweight sidebar notification path** — New `notifySidebarOfChange()` method skips `clearNuGetHttpCache()` and source re-fetch after operations, eliminating a 0–15 second process spawn per operation

### Fixed

- **Sidebar installed packages now sorted alphabetically**
- **Sidebar updates now sorted alphabetically**
- **`getPackageSize` nupkg URL missing trailing slash normalization**
- **`headRequestContentLength` double-resolve on timeout**
- **Vulnerability badge pluralization typo ("vulnerabilityy")**
- **Offline nuspec dependency parsing ignoring ungrouped deps and attribute order**
- **`getPackageSize` blocking metadata flow sequentially instead of parallel**
- **`getVulnerabilities` missing `private` access modifier**
- **`isNewerVersion` incorrect comparison when SemVer build metadata present**
- **Extension activation unhandled promise rejection on project file discovery**
- **`findNuGetConfigs` single filesystem error aborting all config file discovery**
- **WorkspaceCache arbitrary eviction ordering for permanent (no-TTL) entries**
- **Sidebar package rows missing keyboard focus-visible indicator**
- **DraggableSash storing mutable state on function object via `as any`**
- **NuGetPanel message handler missing `default` case in switch**
- **`refreshDebounceRef` not cleared on App unmount**
- **CSP `img-src` redundant domain entries covered by wildcards**
- **Http2Client double-resolve in `fetchJsonHttp1WithDetails`**
- **CredentialService DPAPI command injection hardening**
- **Sidebar missing concurrent operation guard**
- **Sidebar CSP overly permissive for `img-src`**
- **Bulk operation early exits leaving UI in loading state**
- **`bulkInstall` missing topological sort for project dependencies**
- **Sidebar `bulkUpdatePackages` missing topological sort**
- **Sidebar `checkAllProjectsInstalled` not echoing `context` field**
- **`getTransitiveMetadata` missing error response on failure**
- **Sidebar `bulkUpdateAllProjects` early exit missing response message**
- **`assetsJsonCache` unbounded growth within TTL window**
- **HTTP/2 session pool stale entry cleanup before eviction**
- **File watcher debounce timeout not cleaned on extension disposal**
- **All 5 npm audit vulnerabilities resolved** — Updated dompurify (XSS), fast-xml-parser (stack overflow), ajv (ReDoS), minimatch (ReDoS), and underscore (DoS)
- **Sidebar sash position not persisted across VS Code sessions**
- **"Load all projects" toggle visible in Updates section with single project**
- **Failed operations no longer trigger optimistic sidebar updates**
- **Sidebar's own failed operations no longer clear update badges**
- **Sidebar `_notifyMainPanel()` no longer fires after failed operations** — install/update/remove from sidebar only refresh main panel when the operation succeeded
- **Bulk install no longer notifies sidebar when all installs failed**

### Changed

- **Panel operation logic extracted to `NuGetOperations.ts`** — Install, update, remove, and all bulk operation variants deduplicated into shared functions with `OperationContext` interface. `topologicalSortByDependency` moved to `NuGetUtils.ts`.
- **`detailsPanelContent` memoized with `useMemo`** — BrowseTab no longer re-renders when unrelated App state changes
- **`findNuGetConfigs` parallelized** — File existence checks now run concurrently via `Promise.all`
- **DraggableSash ARIA attributes** — Added `role="separator"`, `aria-orientation`, and `aria-label`
- **TypeScript target bumped from ES2020 to ES2022** — Enables `Array.at()`, `Object.hasOwn()`, Error `cause`, and RegExp `/d` flag
- **Dependencies updated** — `@tanstack/react-virtual` 3.13.18→3.13.21, `marked` 17.0.1→17.0.4, `esbuild` 0.27.2→0.27.3, `@types/vscode` 1.108.1→1.109.0, `typescript-eslint` 8.56.0→8.56.1
- **HTTP/2 stale session cleanup moved to periodic interval** — Removes per-request O(n) scan of all sessions; stale entries now pruned every 30 seconds
- **`installedPackages` setter uses content comparison** — Skips re-render when the same `id@version` set is received, preventing cascading downstream effects
- **Transitive prefetch delay reduced from 2 000 ms to 500 ms** — Transitive dependency data loads sooner after direct packages finish
- **Dependency group headers keyboard accessible** — Added `role="button"`, `tabIndex`, `aria-expanded`, and Enter/Space key handlers
- **Source settings and warning indicator accessibility** — Added `aria-label`, `role="button"`, `tabIndex`, and keyboard handlers
- **Sidebar no longer does full re-fetch after every operation** — Previously cleared all updates and re-requested `checkAllProjectsUpdates` + `checkAllProjectsInstalled` after every install/update/remove. Now surgically filters affected packages from update lists
- **Sidebar sections independently expandable** — Both Installed and Updates sections can be open simultaneously with a draggable divider between them (mimics native VS Code sidebar behavior). Default is 50/50 split; double-click sash to reset
- **Main panel refresh handler debounced** — Rapid refresh messages from sidebar operations are collapsed with a 300ms debounce to avoid redundant re-fetches
- **`checkPackageUpdates` effect skip on optimistic update** — After an operation where the update outcome is already known, the `installedPackages` change effect skips the redundant `checkPackageUpdates` request
- **`bulkUpdateAllProjectsResult` no longer triggers `checkAllProjectsUpdates`** — Optimistic state clearing replaces the expensive full re-check; background timer or manual refresh reconciles if needed

## [1.10.0] - 2026-03-02

### Added

- **Centralized refresh button** — Main panel header now has a refresh button (sync icon) to the right of the source settings gear, clearing all server and client caches and syncing the sidebar

### Changed

- **InstalledTab per-section refresh button removed** — Replaced by the centralized header-level refresh button

### Fixed

- **Load all projects toggle not reset on project change**
- **Sidebar section content scrolling prematurely with available space**
- **Floating version packages showing update actions in sidebar**
- **New package versions not found in updates sections**
- **Stale dotnet NuGet HTTP cache blocking version discovery**

## [1.9.2] - 2026-03-01

### Fixed

- **Multi-project bulk update/remove ordering** — Projects are now topologically sorted by `<ProjectReference>` dependency order before processing, and all `dotnet restore` calls are deferred to a final phase after all updates/removals complete. Prevents C# Dev Kit "unable to restore" errors during batch operations across interdependent projects.
- **Per-package topological sort in multi-project bulk update** — Packages within each project are now sorted by NuGet dependency order during multi-project bulk updates, consistent with single-project bulk update behavior.

## [1.9.1] - 2026-02-19

### Fixed

- **Security: fast-xml-parser DoS vulnerability (GHSA-jmr7-xgp7-cmfj)**

## [1.9.0] - 2026-02-19

### Added

- **"Manage NuGet Sources…" in sidebar source picker** — Source picker quick pick now includes a divider and a gear-icon action at the bottom that opens the main panel with the source settings overlay

### Changed

- **API-first search for single nuget.org source** — When only one nuget.org source is active, Browse tab search uses the NuGet V3 SearchQueryService API directly via HTTP/2 instead of spawning a CLI process + N enrichment API calls, reducing search latency from ~2-4s to ~100-300ms

### Fixed

- **API-first search skipping private source results**
- **API-first search visual mismatch with CLI results**

## [1.8.0] - 2026-02-18

### Fixed

- **Sidebar project toggle tooltips mismatch**
- **Installed tab collapse/expand all buttons hidden in single-project mode**

### Added

- **Multi Install** — Install a package to multiple projects at once from the Browse tab details panel with a project picker dropdown
- **All-Projects Installed View** — Load installed packages across all projects in both the Installed tab (full manager) and sidebar Installed section, with collapsible per-project sections, client-side filtering, and bulk uninstall across all projects
- **Toolbar icon buttons** — Replaced text-based "Select all/Deselect all" and "Load all projects" controls with compact codicon icon buttons (check-all, expand-all, collapse-all, single/all-projects toggle) in both Installed and Updates tab toolbars

### Changed

- **Multi Install hidden when package is installed** — Multi Install button only appears when the package is not installed in the currently selected project to avoid scope confusion with the single-project Uninstall button
- **Consistent project sorting across all multi-project views** — All multi-project sections (Installed tab, Updates tab, sidebar Installed/Updates, Multi Install dropdown) now sort projects alphabetically by name with the currently selected project always pinned first, matching the project selector dropdown order

### Fixed

- **Multi Install version-aware dropdown**

## [1.7.0] - 2026-02-18

### Added

- **Full manager search clear button** — Inline clear button in the Browse tab search box using the standard VS Code `clear-all` codicon
- **ClearAllIcon component** — New `ClearAllIcon` SVG icon component matching the VS Code `clear-all` codicon for consistent search clear buttons

### Fixed

- **Spinner stuck on full manager open** — Fixed "Searching..." spinner persisting indefinitely when opening the full manager with a cached search query; the `restoreSearchQuery` handler now correctly sets `searchQuery` state and uses proper sources/prerelease settings
- **Sidebar search focus on open** — Search input now auto-focuses when the sidebar panel is opened or re-shown, matching native VS Code sidebar behavior
- **Open full manager clears sidebar search** — Opening the full manager no longer clears the sidebar's active search results; cross-panel sync now guards against redundant source/project change messages
- **Remove source icon invisible on dark themes** — Replaced `opacity`-based visibility with `color` CSS variables (`--vscode-descriptionForeground` / `--vscode-errorForeground`) per project icon visibility conventions
- **Sidebar clear icon updated to clear-all codicon** — Replaced `CloseIcon` with `ClearAllIcon` for consistency with VS Code's standard search clear icon
- **VSIX package size bloat** — Excluded `docs/` directory (contains demo GIF) from VSIX packaging; README references the GIF via absolute GitHub URL so marketplace rendering is unaffected

### Changed

- **README overhaul**

## [1.6.0] - 2026-02-18

### Added

- **Native VS Code icon system** — Replaced all emoji/Unicode character icons (⚙️, ⚠️, ✓, ▶/▼, 🔄, 📏, ⬇, ⏳, 🗑️, ←/→, ✕, ℹ️) with inline SVG components matching VS Code's codicon system in new `icons.tsx` module

### Fixed

- **README audit fixes** — Fixed broken emoji characters, updated outdated sidebar description (removed Browse section/Activity Bar badge refs), added missing `nuiget.searchResultLimit` setting, aligned `noRestore` description with package.json, documented Cross-Project Updates/Installed Tab Filter/Cross-Panel Sync/Bulk Operations, added editor title bar tip
- **High-contrast theme support** — Added `body.vscode-high-contrast` and `body.vscode-high-contrast-light` CSS rules with `--vscode-contrastBorder` and `--vscode-contrastActiveBorder` for all interactive elements in both main panel and sidebar
- **Reduced-motion accessibility** — Added `@media (prefers-reduced-motion: reduce)` rules to disable spinner, icon, and tab transition animations in both main panel and sidebar
- **Icon CSS utilities** — Added `.inline-icon`, `.codicon-loading` spin animation, and icon-specific color rules for verified badges, warnings, and settings gear
- **Sidebar ARIA improvements** — Added `role="search"` wrapper, `role="searchbox"` and `aria-label` on search input, `role="listbox"`/`role="option"` on filter dropdown, `aria-label` on action buttons, `:focus-visible` outlines on section action buttons and search clear button

### Changed

- **Tab bar uses VS Code tab tokens** — Tabs now use `--vscode-tab-activeForeground`, `--vscode-tab-inactiveForeground`, `--vscode-tab-hoverBackground`, `--vscode-tab-activeBorderTop`, and `--vscode-editorGroupHeader-tabsBackground`
- **Modal overlay uses theme-aware backdrop** — Source settings overlay uses `color-mix()` with `--vscode-editor-background` and `backdrop-filter: blur(2px)` instead of hardcoded `rgba(0,0,0,0.5)`
- **Modal uses widget tokens** — Source settings modal uses `--vscode-editorWidget-background` and `--vscode-editorWidget-border`
- **Spinner uses progress bar token** — Loading spinner accent color uses `--vscode-progressBar-background` instead of `--vscode-focusBorder`
- **Deduplicated checkbox CSS** — Consolidated three near-identical checkbox styling blocks into a single shared selector group
- **Button border tokens** — Primary and secondary buttons now include `--vscode-button-border` for proper theme integration
- **List selection foreground** — Selected package items now set `--vscode-list-activeSelectionForeground` for correct text color
- **Removed all `!important` overrides** — Replaced 6 `!important` usages with higher-specificity selectors
- **Sidebar icons consolidated** — Removed inline SVG definitions from `PackageRow.tsx`, `SectionHeader.tsx`, and `SidebarApp.tsx`; all icons now import from shared `icons.tsx` module
- **Sidebar icon visibility uses color tokens** — Section action buttons and search clear button switched from `opacity` to `color: var(--vscode-descriptionForeground)` / `var(--vscode-foreground)` pattern
- **Sidebar filter dropdown shadow** — Uses `var(--vscode-widget-shadow)` instead of hardcoded `rgba(0, 0, 0, 0.3)`

### Fixed

- **Hardcoded highlight.js colors** — Replaced hardcoded `#6a9955`, `#608b4e`, `#008000` comment/doctag colors with `var(--vscode-editorLineNumber-activeForeground)` fallbacks
- **Settings gear icon barely visible**
- **Verified badge not vertically aligned with author text**
- **Update arrow misaligned in updates tab**
- **Close button double-opacity compounding**
- **CSP hardened for style-src** — Moved inline `<style>` blocks from NuGetPanel.ts and NuGetSidebarPanel.ts to external CSS files, removing `'unsafe-inline'` from `style-src` directive
- **CSP hardened for script-src** — Removed `'unsafe-inline'` from `script-src` directive; both panels only use external `<script src>` tags
- **`$(project)` literal text in sidebar** — Was displaying `$(project)` as literal text in welcome message (codicon syntax doesn't render in webviews)
- **Sidebar Unicode arrow `→`** — Replaced with `ArrowRightIcon` SVG component in package update version display

## [1.5.3] - 2026-02-16

### Changed

- **Sidebar updates section codicons** — Selected project now uses outlined collection icon; all projects uses filled collection icon without border
- **Sidebar title bar codicon order** — Reordered to: Include prerelease, Project, Sources, Refresh, Open Full Manager
- **Sidebar package row truncation** — Version truncates first (down to major.minor), then package name truncates

## [1.5.2] - 2026-02-16

### Added

- **eslint-plugin-react-hooks** — Added React Hooks linting rules (`rules-of-hooks` as error, `exhaustive-deps` as warning) to catch stale closure and hook order bugs at lint time
- **Shared `compareVersions` utility** — Unified version comparison logic in `types.ts`, replacing inline implementations in `PackageDetailsPanel`
- **Shared `topologicalSortByDependency` utility** — Extracted from duplicate Kahn's algorithm implementations in `NuGetPanel.ts` for bulk update and remove operations

### Changed

- **NuGetService module split** — Extracted types into `NuGetTypes.ts` (~120 lines) and utilities into `NuGetUtils.ts` (~300 lines), reducing `NuGetService.ts` from ~4280 to ~3400 lines
- **App.tsx component extraction** — Extracted `SourceSettingsOverlay`, `DraggableSash`, and `markdownSetup` into separate modules, reducing `App.tsx` from ~1800 to ~1230 lines
- **SourceSettingsOverlay self-contained state** — Source settings modal now owns its own form state (add source form, confirm remove dialog) via `forwardRef`/`useImperativeHandle`, reducing prop drilling and state declarations in `App.tsx`

### Fixed

- **HTTP timeout and redirect safety** — Added request timeouts to `fetchText` and `downloadFile`, max redirect depth limits to all HTTP methods across `NuGetService` and `Http2Client`, and download size limits to prevent resource exhaustion
- **InstalledTab virtualization** — Installed packages list now uses `@tanstack/react-virtual` virtual scrolling for improved performance in large projects
- **SemVer 2.0 prerelease comparison** — `isNewerVersion` now compares prerelease segments per SemVer 2.0 spec (numeric segments as integers, string segments lexicographically)
- **Update check concurrency** — `checkPackageUpdates` and `checkPackageUpdatesMinimal` now use `batchedPromiseAll` (concurrency: 16) instead of unbounded `Promise.all`
- **HTTP/2 request-level timeouts** — Individual HTTP/2 stream requests now have 10s timeouts, preventing hangs when servers accept connections but never respond
- **Response body size limits** — All HTTP fetch methods now abort responses exceeding 10 MB to prevent out-of-memory conditions
- **Sidebar type unification** — Sidebar types now imported from shared `types.ts` instead of local duplicates, fixing `InstalledPackage.versionType` drift (`string` vs `VersionType` union)
- **buildChain memoization** — Transitive dependency chain resolution now caches results per package, preventing exponential recursion on large dependency graphs
- **`fetchJsonHttp1` infinite redirect loop**
- **`NuGetSource` type missing `configFile` field**
- **`DraggableSash` `onDragEnd` stale closure**
- **Array mutation in `getPackageVersionsFromSource`**
- **`execWithTimeout` maxBuffer limit**
- **Consolidated `NuGetSource` interface definitions**
- **Concurrent operation guard for install/update/remove**
- **Stale installed packages visible during project switch**
- **Forced background update check dropped during in-flight check**
- **JSON.parse on truncated response in HTTP/1.1 fallback**
- **Sidebar refresh not clearing failed endpoint cache**
- **Main panel not refreshing on external .csproj changes**

## [1.5.1] - 2026-02-16

### Fixed

- **Deferred restore for bulk updates** — Bulk update operations now use `--no-restore` per package and run a single `dotnet restore` at the end of the batch, matching the existing bulk remove pattern

## [1.5.0] - 2026-02-16

### Fixed

- **Sidebar badge not showing until section expanded**
- **Refresh button not clearing stale update data**
- **"Update to Version" context menu installing directly instead of showing version picker**
- **Background update check blocked on refresh**
- **Sidebar updates not refreshing on external .csproj changes (e.g. git checkout)**
- **"Update All" button not updating packages on first click**
- **Garbled output channel header for "Update All" across multiple projects**
- **Notification spam during batch update**

### Changed

- **CLI commands use .NET 10 noun-first syntax on SDK 10+**

## [1.4.2] - 2026-02-16

### Changed

- **Native Sidebar Styling** — Search input now matches the Extensions view (wrapper with clear button), section chevrons use SVG with rotation animation, section headers match native VS Code padding and height
- **Activity Bar badge removed** — Section header badges now provide update counts; the Activity Bar icon badge has been removed
- **Extensions-style sidebar search** — Search box now works like VS Code Extensions view: plain text searches NuGet with 300ms debounce (min 2 chars), `@installed` filters installed packages, `@updates` filters updates. Typing `@` shows an auto-completing filter dropdown. Sections hidden during search; Installed + Updates sections shown by default.

### Removed

- **Recent searches**
- **Browse section header**

### Fixed

- **Activity Bar badge race condition**

## [1.4.1] - 2026-02-16

### Fixed

- **Conditional sidebar visibility** — Activity Bar icon and sidebar only appear when the workspace contains compatible project files (.csproj, .fsproj, .vbproj). Dynamically updates when project files are added or removed.

## [1.4.0] - 2026-02-15

### Added

- **Sidebar Panel** — Brand new Activity Bar panel with Browse, Installed, and Updates sections in a compact single-column layout. Always uses lite mode for maximum speed. Source/project/prerelease selection via title bar QuickPick commands. Package actions via hover buttons and right-click context menus. Update badge on the Activity Bar icon. Cross-view sync with the main panel.
- **Sidebar Keyboard Navigation** — Arrow Up/Down, Home/End, Enter, Ctrl+Enter (install/update), and Delete (uninstall) in sidebar package lists, matching the main panel's keyboard behavior
- **Sidebar Background Update Monitoring** — Updates are checked automatically in the background (5s after activation, on project file changes, and every 10 minutes). The Activity Bar badge shows the update count without needing to open the sidebar.
- **Cross-panel source & project sync** — Source and project selections are now shared bidirectionally between the main panel and sidebar. Changing either in one view updates the other in real time.
- **Sidebar default collapsed sections** — All sidebar sections start collapsed for a cleaner initial look. Searching auto-expands the Browse section.
- **Keyboard shortcut hints in tooltips** — Action buttons now show keyboard shortcuts in parentheses (e.g., Install (Enter), Uninstall (Del), Clear filter (Esc))

## [1.3.0] - 2026-02-14

### Added

- **Load All Projects Updates** — New "Load all projects" checkbox on the Updates tab that loads and displays package updates from all projects in the workspace simultaneously. Results are grouped by project with headers. Bulk "Update All" works across all projects with per-project output logging. Speeds up multi-project workspaces by skipping metadata (icons, authors, verified status) during load.

### Changed

- **Project dropdown sorting**

## [1.2.1] - 2026-02-11

### Fixed

- **Marketplace showing "Works with: Universal" instead of Desktop**

## [1.2.0] - 2026-02-11

### Fixed

- **Full Search Slow With Unreachable Sources**
- **Refresh Button Not Retrying Sources**
- **Package Details Missing Published Date**

### Changed

- **Failed Endpoint Cache TTL Increased to 120s**
- **Refresh Button Moved to Direct Packages Header**
- **Unified Metadata Fetching (2× Fewer HTTP Calls)**
- **Sliding-Window Concurrency**
- **Verified Badge in Package Details Panel**

## [1.1.2] - 2026-02-11

- **Batch Uninstall Only Removing One Package**
- **Notification Spam During Batch Uninstall**

## [1.1.1] - 2026-02-10

### Fixed

- **Slow Installed Tab with Unreachable Sources**
- **Redundant project.assets.json Parsing**
- **Transitive Prefetch Network Contention**

## [1.1.0] - 2026-02-10

### Added

- **Installed Tab Filter** - Compact client-side filter input on the Installed tab to quickly find packages by ID. Case-insensitive contains match, no HTTP calls. Clear button (×) and Escape key to reset. Header shows filtered count (e.g., "3 of 12"). Persists across tab switches, clears on panel close.

### Changed

- **Architecture: Component Decomposition**
- **Performance: List Virtualization**
- **Performance: Memoized README Parsing**
- **Performance: React.memo on DraggableSash**
- **Performance: Consolidated Message Handler**
- **Performance: Memoized Details Panel**

### Fixed

- **Transitive Metadata Circular Dependency**
- **Transitive Packages Not Loading**
- **Transitive Spinner Stuck on Project Change**
- **Transitive Stale After Bulk Remove**
- **Source Dropdown Not Resetting on Remove**
- **Missing `useMemo` Deps in InstalledTab**
- **Inline Callbacks Defeating React.memo**

## [1.0.0] - 2026-02-05

Initial release of nUIget - a Visual Studio-style NuGet Package Manager for VS Code.

### Features

- **Visual Studio-Style GUI** - Split-panel layout with Browse, Installed, and Updates tabs
- **Package Management** - Install, update, and remove NuGet packages via dotnet CLI
- **Multi-Project Support** - Manage packages across multiple .NET projects (.csproj, .fsproj, .vbproj)
- **Source Management** - Configure NuGet sources with settings cog (⚙️) to enable/disable/add/remove sources
- **Credential Support** - Reads credentials from nuget.config and Windows Credential Manager
- **Transitive Dependencies** - View transitive packages per target framework with "Required by" chains
- **Updates Tab** - Shows packages with available updates, badge count, and prerelease support
- **Bulk Operations** - Select multiple packages for batch uninstall with topological sort
- **README Display** - View package README files with syntax-highlighted code blocks and copy button
- **Keyboard Navigation** - Arrow keys to navigate, Ctrl+Enter to quick install, Delete to uninstall
- **Quick Search** - Real-time search suggestions with recent search history
- **Full Theme Support** - Adapts to VS Code light and dark themes via CSS variables

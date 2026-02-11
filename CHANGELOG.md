# Changelog

All notable changes to the nUIget extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3] - 2026-02-12

### Changed

- **Refresh Button Moved to Direct Packages Header** — The ↻ refresh icon on the Installed tab moved from the transitive packages section to the direct packages header. Clicking it now refreshes both installed and transitive packages in parallel and runs `dotnet restore` to ensure transitive data is up to date. The transitive section collapses during refresh for a consistent experience.

## [1.1.2] - 2026-02-11

### Fixed

- **Batch Uninstall Only Removing One Package**
- **Notification Spam During Batch Uninstall**
- **Full Search Slow With Unreachable Sources** — `dotnet package search` CLI no longer blocks on sources known to be unreachable. Sources are pre-validated (5s timeout) and pre-filtered via `failedEndpointCache` before passing to the CLI, avoiding OS TCP timeouts (~21s per dead source). `fetchPackageVerifiedStatus` also skips failed sources early.
- **Refresh Button Not Retrying Sources** — `clearSourceErrors()` now also clears `failedEndpointCache`, so clicking the ⚠️ refresh button genuinely retries the network instead of hitting stale cache entries.
- **Icon Cache Key Poisoning Custom Source Lookups** — `checkIconExists` cache key `icon:pkgid@version` had no URL component, so a `false` result from nuget.org prevented checking custom sources. The installed tab's custom source icon fallback was dead code. Replaced with `resolveIconUrl` using URL-aware caching (`iconurl:` prefix).
- **Icon HEAD Requests Missing Auth Headers** — `checkUrlExistsHttp1` didn't pass authentication headers, so private feeds requiring auth always returned 401/403 for icon checks. Added auth support with same-origin redirect safety.
- **Report Abuse Link Shown for Custom Sources** — Report Abuse link now only appears when the selected source is nuget.org or "All sources", instead of always showing a nuget.org link for private feed packages.
- **HTTP Redirect Loop Protection** — `checkUrlExistsHttp1` now limits redirects to 5 hops (was unlimited, could stack overflow on circular redirects).

### Changed

- **Failed Endpoint Cache TTL** increased from 60s to 120s (2 minutes) to reduce frequency of CLI timeouts against persistently unreachable sources. Manual refresh via ⚠️ button bypasses the TTL.
- **Source-Aware Icon Resolution** — New `resolveIconUrl()` helper replaces `checkIconExists()`. Tries nuget.org flat container first (fast path preserved), falls back to custom sources via discovered `packageBaseAddress` with auth. Circuit breaker skips sources after 5 consecutive icon misses to avoid N×M HEAD requests. Used consistently across Browse, Installed, Updates, and Transitive views.
- **Autocomplete Queries All Sources** — When "All sources" is selected, `autocompletePackageId()` now queries nuget.org AND custom sources in parallel (was nuget.org only). Uses `SearchAutocompleteService` when available, falls back to `SearchQueryService` for feeds that lack it. Results deduped by package ID. 2-second timeout cap prevents slow sources from blocking typeahead.
- **Icon Not-Found Cache TTL** — Changed from permanent (never expires) to 24 hours, allowing newly-added icons to be discovered on next session.

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

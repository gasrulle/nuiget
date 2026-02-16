# Changelog

All notable changes to the nUIget extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

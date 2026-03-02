# Changelog

All notable changes to the nUIget extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

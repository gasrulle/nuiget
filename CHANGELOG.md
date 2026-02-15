# Changelog

All notable changes to the nUIget extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Sidebar Panel** — Brand new Activity Bar panel with Browse, Installed, and Updates sections in a compact single-column layout. Always uses lite mode for maximum speed. Source/project/prerelease selection via title bar QuickPick commands. Package actions via hover buttons and right-click context menus. Update badge on the Activity Bar icon. Cross-view sync with the main panel.
- **Sidebar Keyboard Navigation** — Arrow Up/Down, Home/End, Enter, Ctrl+Enter (install/update), and Delete (uninstall) in sidebar package lists, matching the main panel's keyboard behavior
- **Sidebar Background Update Monitoring** — Updates are checked automatically in the background (5s after activation, on project file changes, and every 10 minutes). The Activity Bar badge shows the update count without needing to open the sidebar.
- **Cross-panel source & project sync** — Source and project selections are now shared bidirectionally between the main panel and sidebar. Changing either in one view updates the other in real time.
- **Sidebar default collapsed sections** — All sidebar sections start collapsed for a cleaner initial look. Searching auto-expands the Browse section.
- **Keyboard shortcut hints in tooltips** — Action buttons now show keyboard shortcuts in parentheses (e.g., Install (Enter), Uninstall (Del), Clear filter (Esc))

### Changed

- **Sidebar action icons refined**
- **Sidebar "Load all projects" changed from checkbox to link button**
- **Sidebar Updates section uses background data** — expanding Updates no longer re-fetches if background check data is already available, making it instant

### Fixed

- **Sidebar hover highlight visibility**
- **Sidebar source/project selection not persisted across reload**
- **Sidebar stale closure bugs** — handlers for Update, Update All, and context menu used captured state instead of refs, causing wrong versions or missed updates
- **Sidebar badge overwritten by single-project update check**
- **Sidebar background update race condition** — background check no longer pushes per-project results that could overwrite user-initiated loading states
- **Sidebar section badges not showing on startup**
- **Stale version displayed after Change Version** — after changing a package version via the context menu, the installed list showed the previous version. Lock file resolved versions were incorrectly overriding the freshly-written .csproj version for standard (non-floating) version specs.

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

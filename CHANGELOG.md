# Changelog

All notable changes to the nUIget extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

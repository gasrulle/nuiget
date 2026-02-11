# Architecture

This document describes the technical architecture of the nUIget VS Code extension.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS Code                                  │
│  ┌──────────────────┐     ┌──────────────────────────────────┐ │
│  │   extension.ts   │────▶│      NuGetPanel.ts               │ │
│  │  (Entry Point)   │     │   (WebviewPanel + Messages)      │ │
│  └──────────────────┘     └───────────────┬──────────────────┘ │
│                                           │                      │
│                                    postMessage                   │
│                                           │                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Webview (React)                        │  │
│  │                      App.tsx (shell)                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │ BrowseTab   │  │InstalledTab │  │  UpdatesTab [3] │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │  │
│  │         └────────────────┼──────────────────┘            │  │
│  │                 PackageDetailsPanel                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      Services                             │  │
│  │  ┌────────────────────┐  ┌────────────────────────────┐ │  │
│  │  │   NuGetService.ts  │  │  NuGetConfigParser.ts      │ │  │
│  │  │   (CLI + API)      │  │  (Source Resolution)       │ │  │
│  │  └────────────────────┘  └────────────────────────────┘ │  │
│  │  ┌────────────────────┐  ┌────────────────────────────┐ │  │
│  │  │ CredentialService  │  │  Http2Client.ts            │ │  │
│  │  │ (Auth for feeds)   │  │  (HTTP/2 multiplexing)     │ │  │
│  │  └────────────────────┘  └────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
src/
├── extension.ts              # Extension entry point, command registration
├── webview/
│   ├── NuGetPanel.ts         # WebviewPanel, message handling, state persistence
│   └── app/
│       ├── index.tsx         # React entry point with ErrorBoundary
│       ├── App.tsx           # Application shell (~1650 lines)
│       ├── App.css           # Styles
│       ├── types.ts          # Shared types, LRUMap, utility functions
│       ├── components/
│       │   ├── BrowseTab.tsx          # Browse tab (~540 lines)
│       │   ├── InstalledTab.tsx       # Installed tab (~970 lines)
│       │   ├── UpdatesTab.tsx         # Updates tab (~410 lines)
│       │   └── PackageDetailsPanel.tsx # Details panel (~280 lines)
│       └── hooks/
│           └── usePackageSelection.ts  # Package selection logic hook
├── services/
│   ├── NuGetService.ts       # dotnet CLI integration, NuGet API calls
│   ├── NuGetConfigParser.ts  # nuget.config parsing, credential resolution
│   ├── CredentialService.ts  # Authentication for private feeds (DPAPI, Cred Provider)
│   ├── Http2Client.ts        # HTTP/2 client with session reuse for nuget.org
│   └── WorkspaceCache.ts     # Persistent caching with TTL support
└── test/
    └── WorkspaceCache.test.ts # Unit tests for cache utility
```

## Component Architecture

The webview UI is decomposed into focused tab components, each managing their own local state while sharing cross-cutting state from the App shell.

### Component Hierarchy

```
App.tsx (shell)
├── Tab Bar (Browse | Installed | Updates [badge])
├── Source Settings (inline)
├── BrowseTab (forwardRef → BrowseTabHandle)
│   ├── Search input + Quick search
│   ├── Virtualized package list (@tanstack/react-virtual)
│   └── PackageDetailsPanel (via MemoizedPackageDetailsPanel)
├── InstalledTab (forwardRef → InstalledTabHandle)
│   ├── Filter bar + Toolbar
│   ├── Direct packages list
│   ├── Transitive packages (collapsible per-framework)
│   └── PackageDetailsPanel (via MemoizedPackageDetailsPanel)
└── UpdatesTab (forwardRef → UpdatesTabHandle)
    ├── Bulk operations toolbar
    ├── Virtualized update list (@tanstack/react-virtual)
    └── PackageDetailsPanel (via MemoizedPackageDetailsPanel)
```

### Mounting Strategy

| Component | Strategy | Reason |
|-----------|----------|--------|
| BrowseTab | Always mounted, `display:none` | Preserves search state, scroll position |
| InstalledTab | Always mounted, `display:none` | Preserves filter state, transitive data |
| UpdatesTab | Conditionally rendered | Re-fetches data on each visit |

### State Ownership

**App.tsx (shared state):** `projects`, `selectedProject`, `installedPackages`, `selectedPackage`, `selectedTransitivePackage`, `packageMetadata`, `packageVersions`, `selectedVersion`, `activeTab`, `includePrerelease`, `selectedSource`, `sources`, `detailsTab`, `sanitizedReadmeHtml`.

**Tab components (local state):** Each tab manages its own UI state (search results, loading flags, filter text, transitive sections, bulk selections) to minimize cross-component coupling.

### Message Routing

App.tsx's `handleMessage` dispatches incoming messages to components via `forwardRef` + `useImperativeHandle`:

```typescript
// Each tab ref exposes a handleMessage method
const browseTabCompRef = useRef<BrowseTabHandle>(null);
const installedTabCompRef = useRef<InstalledTabHandle>(null);
const updatesTabCompRef = useRef<UpdatesTabHandle>(null);

// In handleMessage:
if (browseTabCompRef.current?.handleMessage(msg)) return;
if (installedTabCompRef.current?.handleMessage(msg)) return;
if (updatesTabCompRef.current?.handleMessage(msg)) return;
// ...handle remaining messages in App
```

Each component's `handleMessage` returns `true` if it consumed the message, enabling short-circuit dispatch. InstalledTab and UpdatesTab return `void` (unconditional dispatch for their message types).

### Source Removal Reset

When a source is removed, the backend captures the source URL *before* removal and sends it as `removedSourceUrl` alongside `removedSourceName` in the `sources` response. The frontend compares `removedSourceUrl` directly against `selectedSourceRef.current` to reset the dropdown — avoiding stale closure issues in the `useCallback(fn, [])` handler.

### Props Pattern

Components receive state via props (not React Context) since there's only one level of nesting:

```typescript
<MemoizedBrowseTab
    ref={browseTabCompRef}
    vscode={vscode}
    isVisible={activeTab === 'browse'}
    selectedProject={selectedProject}
    // ...shared state and callbacks
/>
```

All tab components are wrapped in `React.memo` for render optimization.

## Message Flow

The extension uses VS Code's webview message passing for communication:

```
React (App.tsx)                          Extension (NuGetPanel.ts)
     │                                           │
     │──── postMessage({ type: 'getProjects' })──▶│
     │                                           │
     │◀── postMessage({ type: 'projects', ... })─│
     │                                           │
     │──── postMessage({ type: 'searchPackages' })▶│
     │                                           │
     │◀── postMessage({ type: 'searchResults' })──│
```

### Disposed Panel Safety

The `NuGetPanel` uses a `_disposed` flag and `_postMessage()` helper to prevent "Webview is disposed" errors:

```typescript
private _disposed = false;

private _postMessage(message: unknown): void {
    if (!this._disposed) {
        this._panel.webview.postMessage(message);
    }
}

public dispose(): void {
    this._disposed = true;
    // ... cleanup
}
```

**Critical:** The `_postMessage()` helper must call `this._panel.webview.postMessage()`, not itself, to avoid infinite recursion.

### Key Message Types

#### Project & Source Management
| Message | Direction | Purpose |
|---------|-----------|---------|
| `getProjects` | UI → Ext | Request list of .NET projects |
| `projects` | Ext → UI | Return project list |
| `getSources` | UI → Ext | Request NuGet sources |
| `sources` | Ext → UI | Return sources list with `failedSources` array |
| `refreshSources` | UI → Ext | Clear source errors and re-fetch (resets warnings) |
| `sourceConnectivityUpdate` | Ext → UI | Update failed sources after background connectivity test |
| `prewarmSource` | UI → Ext | Pre-fetch service index for faster first search |
| `enableSource` | UI → Ext | Enable a disabled NuGet source |
| `disableSource` | UI → Ext | Disable a NuGet source |
| `addSource` | UI → Ext | Add a new NuGet source with optional credentials |
| `addSourceResult` | Ext → UI | Result of add source operation |
| `removeSource` | UI → Ext | Remove a NuGet source |
| `getConfigFiles` | UI → Ext | Get available nuget.config file paths |
| `configFiles` | Ext → UI | Return config file paths |

#### Package Search & Metadata
| Message | Direction | Purpose |
|---------|-----------|---------|
| `searchPackages` | UI → Ext | Search NuGet for packages |
| `searchResults` | Ext → UI | Return search results |
| `autocompletePackages` | UI → Ext | Quick search for package ID suggestions (150ms debounce) |
| `autocompleteResults` | Ext → UI | Return array of package ID strings |
| `getPackageVersions` | UI → Ext | Get all versions for a package |
| `packageVersions` | Ext → UI | Return version list |
| `getPackageMetadata` | UI → Ext | Get detailed package metadata |
| `packageMetadata` | Ext → UI | Return package metadata |
| `fetchReadmeFromPackage` | UI → Ext | Extract README from nupkg file |
| `packageReadme` | Ext → UI | Return README content |

#### Installed Packages
| Message | Direction | Purpose |
|---------|-----------|---------|
| `getInstalledPackages` | UI → Ext | Get packages for a project |
| `installedPackages` | Ext → UI | Return installed packages |
> **Client-side filter:** The Installed tab includes a local filter input (`installedFilterQuery` state) that filters `sortedInstalledPackages` via `useMemo` with a case-insensitive `includes()` on package ID. No messages are sent — filtering is entirely in-browser on the already-loaded package array. The `uninstallablePackages` memo and "Select all" logic are scoped to the filtered list.| `getTransitivePackages` | UI → Ext | Get transitive packages from project.assets.json |
| `transitivePackages` | Ext → UI | Return frameworks with transitive packages |
| `getTransitiveMetadata` | UI → Ext | Fetch metadata for one framework's packages |
| `transitiveMetadata` | Ext → UI | Return packages with icons/verified/authors |
| `checkPackageUpdates` | UI → Ext | Check for package updates |
| `packageUpdates` | Ext → UI | Return packages with available updates |

#### Package Operations
| Message | Direction | Purpose |
|---------|-----------|---------|
| `installPackage` | UI → Ext | Install package via dotnet CLI |
| `installResult` | Ext → UI | Result of install operation |
| `updatePackage` | UI → Ext | Update package to new version |
| `updateResult` | Ext → UI | Result of update operation |
| `removePackage` | UI → Ext | Remove package from project |
| `removeResult` | Ext → UI | Result of remove operation |
| `restoreProject` | UI → Ext | Run dotnet restore on project |
| `restoreProjectResult` | Ext → UI | Result of restore operation |

#### Bulk Operations
| Message | Direction | Purpose |
|---------|-----------|---------|
| `bulkUpdatePackages` | UI → Ext | Update multiple packages (topological sort) |
| `bulkUpdateResult` | Ext → UI | Result of bulk update with success/fail counts |
| `confirmBulkRemove` | UI → Ext | Request bulk uninstall (triggers confirmation) |
| `bulkRemoveConfirmed` | Ext → UI | Confirmation to proceed with bulk remove |
| `bulkRemoveResult` | Ext → UI | Result of bulk remove operation |

#### Settings & State
| Message | Direction | Purpose |
|---------|-----------|---------|
| `getSettings` | UI → Ext | Request persisted settings |
| `settings` | Ext → UI | Return saved settings (includePrerelease, selectedSource, recentSearches) |
| `saveSettings` | UI → Ext | Persist settings to workspaceState |
| `getSplitPosition` | UI → Ext | Request persisted split position |
| `splitPosition` | Ext → UI | Return saved split position (cross-workspace) |
| `saveSplitPosition` | UI → Ext | Persist split position to globalState |
| `restoreSearchQuery` | Ext → UI | Restore search query from previous session |
| `settingsChanged` | Ext → UI | VS Code settings changed (searchDebounceMode, etc.) |

## State Management

### Session State (vscode.getState/setState)
- Persists only while panel is hidden (same session)
- Used for: tab selection, search query, project selection, recent searches

### Persistent State (context.workspaceState)
- Persists across panel closes and VS Code restarts
- Used for: Include prerelease checkbox, selected NuGet source, recent searches
- Accessed via `getSettings`/`saveSettings` messages

### Global State (context.globalState)
- Persists across workspaces
- Used for: Split panel position
- Accessed via `getSplitPosition`/`saveSplitPosition` messages
### Dual-Save Pattern
Critical settings are saved to BOTH state stores for resilience:

```typescript
// Session state (fast restore when panel reopens)
vscode.setState({
    selectedProject,
    selectedSource,
    activeTab,
    includePrerelease,
    recentSearches
});

// Workspace state (survives VS Code restart)
vscode.postMessage({
    type: 'saveSettings',
    includePrerelease,
    selectedSource,
    recentSearches
});
```

### Race Condition Prevention
```typescript
// settingsLoadedRef prevents saving defaults before settings are loaded
const settingsLoadedRef = useRef(false);
// settingsLoaded state triggers useEffects after settings arrive
const [settingsLoaded, setSettingsLoaded] = useState(false);

// Only save after settings have been loaded
useEffect(() => {
    if (settingsLoadedRef.current) {
        vscode.postMessage({ type: 'saveSettings', selectedSource });
    }
}, [selectedSource]);

// Wait for settings before fetching updates (ensures correct includePrerelease value)
useEffect(() => {
    if (settingsLoaded && selectedProject && installedPackages.length > 0) {
        vscode.postMessage({ type: 'checkPackageUpdates', ... });
    }
}, [settingsLoaded, selectedProject, installedPackages, includePrerelease]);
```

### Tab Data Prefetching
Both Installed and Updates tabs use prefetch patterns for fast first-click loading:

```typescript
// Installed tab: prefetch on project select, skip refetch on first visit
const hasVisitedInstalledTabRef = useRef(false);

useEffect(() => {
    if (activeTab === 'installed' && selectedProject) {
        if (hasVisitedInstalledTabRef.current) {
            // Subsequent visit - refetch
            vscode.postMessage({ type: 'getInstalledPackages', ... });
        } else {
            // First visit - use prefetched data
            hasVisitedInstalledTabRef.current = true;
        }
    }
}, [activeTab, selectedProject]);

// Updates tab: prefetch when installedPackages loads
// Badge count (updateCount) populated before user clicks tab
useEffect(() => {
    if (settingsLoaded && selectedProject && installedPackages.length > 0) {
        vscode.postMessage({ type: 'checkPackageUpdates', ... });
    }
}, [settingsLoaded, selectedProject, installedPackages, includePrerelease]);
```

### Package Selection Hook

The `usePackageSelection` hook consolidates ~180 lines of duplicated selection logic across Browse, Installed, and Updates tabs:

```typescript
// hooks/usePackageSelection.ts
const { selectDirectPackage, selectTransitivePackage, clearSelection } = usePackageSelection({
    setSelectedPackage,
    setSelectedTransitivePackage,
    setSelectedVersion,
    // ... other state setters and cache refs
});

// Usage in Browse tab (simple case)
selectDirectPackage(pkg, {
    selectedVersionValue: pkg.version,
    metadataVersion: pkg.version,
    initialVersions: [pkg.version],
});

// Usage in Installed tab (floating version handling)
selectDirectPackage(pkg, {
    selectedVersionValue: pkg.version,
    metadataVersion: pkg.resolvedVersion || pkg.version,  // "10.*" → "10.2.0"
    initialVersions: [pkg.version],
});

// Usage in Updates tab (synthetic package + dual versions)
const installedPkg = { id: pkg.id, version: pkg.installedVersion } as InstalledPackage;
selectDirectPackage(installedPkg, {
    selectedVersionValue: pkg.latestVersion,
    metadataVersion: pkg.latestVersion,
    initialVersions: [pkg.latestVersion, pkg.installedVersion],
});
```

**Key features:**
- **Early-exit guard**: Skips re-selection if same package is already selected (consistent for keyboard and click handlers)
- **Cache-first**: Checks `versionsCache` and `metadataCache` before making API calls
- **Mutually exclusive**: Clears `selectedTransitivePackage` when selecting direct package and vice versa

## Performance Caching

### Multi-Tier Cache Architecture
The extension uses a two-tier caching system for performance:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Cache Architecture                          │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │  In-Memory Cache     │───▶│  Workspace Cache             │  │
│  │  (Map objects)       │    │  (workspaceState via         │  │
│  │  Fastest lookups     │    │   WorkspaceCache utility)    │  │
│  │  Session lifetime    │    │  Persists across panels      │  │
│  └──────────────────────┘    └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Failed Endpoint Cache
When a custom NuGet source is unreachable (VPN disconnected, feed down), the OS TCP timeout can take ~21s per connection attempt. Without caching, every installed package triggers a fresh connection attempt to the same dead source.

```typescript
// Cache failed endpoint discoveries to avoid repeated timeouts
private failedEndpointCache: Map<string, number> = new Map(); // URL → timestamp
private static readonly FAILED_ENDPOINT_CACHE_TTL = 120000;   // 120s (2 min) TTL

async discoverServiceEndpoints(sourceUrl: string): Promise<ServiceEndpoints> {
    // Discovers: packageBaseAddress, registrationsBaseUrl, searchQueryService,
    //            searchAutocompleteService
    // Check failed cache — skip sources that timed out recently
    const failedAt = this.failedEndpointCache.get(sourceUrl);
    if (failedAt && (Date.now() - failedAt) < FAILED_ENDPOINT_CACHE_TTL) {
        return {}; // Instant return, no network call
    }
    // ... attempt connection with 5s timeout ...
    // On failure: this.failedEndpointCache.set(sourceUrl, Date.now());
}
```

**Impact:** With 20 packages from a custom source, reduces worst-case from ~21s (per batch) to ~5s (one timeout, then cached).

#### Search Pre-filtering
Full search (`searchPackages`) uses the `dotnet package search` CLI which handles its own networking and is unaware of the extension's failure cache. Without pre-filtering, the CLI waits for OS TCP timeouts (~21s) per unreachable source on every search.

The fix uses a two-layer defense:
1. **Pre-validation** (`preValidateSources`): Before the first CLI search, sources without cached status are tested via `discoverServiceEndpoints` (5s timeout, parallel). This populates `failedEndpointCache`.
2. **Pre-filtering** (`filterHealthySources`): Sources in `failedEndpointCache` (within TTL) are excluded from CLI arguments. If ALL sources are unreachable, they are passed through as a fallback.
3. **Panel-level filtering**: `NuGetPanel` also excludes sources from `failedSources` map before calling `searchPackages` (defense-in-depth).

`clearSourceErrors()` clears all three caches (`failedSources`, `serviceIndexCache`, `failedEndpointCache`) so the ⚠️ refresh button genuinely retries the network. After TTL expiry (2 min), lazy re-validation occurs automatically on the next search.

The Browse tab's metadata enrichment loop also checks `failedEndpointCache` before iterating custom sources for authors/description, skipping unreachable ones without entering `discoverServiceEndpoints`.

### project.assets.json Cache
Large projects can have 5-50MB `project.assets.json` files. This file is read and parsed in multiple code paths within a single flow (`getResolvedVersions`, `getPackageDependencies`, `getTransitivePackages`). A short-lived mtime-based cache avoids redundant parsing:

```typescript
private assetsJsonCache: Map<string, { mtimeMs: number; data: unknown; timestamp: number }>;
private static readonly ASSETS_CACHE_TTL = 30000; // 30s

async readAssetsJson<T>(assetsPath: string): Promise<T | null> {
    const stat = await fs.promises.stat(assetsPath);
    const cached = this.assetsJsonCache.get(assetsPath);
    if (cached && cached.mtimeMs === stat.mtimeMs && (Date.now() - cached.timestamp) < ASSETS_CACHE_TTL) {
        return cached.data as T;
    }
    // Parse and cache...
}
```

### HTTP Request Timeouts
All HTTP/1.1 requests to custom sources use explicit timeouts to prevent unbounded waits:

| Method | Timeout | Purpose |
|--------|---------|---------|
| `discoverServiceEndpoints` | 5s | Service index discovery |
| `fetchJsonWithDetails` | 10s (default) | Metadata/search API calls |
| `fetchJsonHttp1` | 10s | Generic JSON fetching |
| `checkUrlExistsHttp1` | 5s | Icon HEAD requests |

Timeouts use `options.timeout` + `req.on('timeout')` handler that calls `req.destroy()`.

### Source-Aware Icon Resolution (`resolveIconUrl`)
All icon fetching uses a single `resolveIconUrl()` helper that:
1. Checks `iconUrlCache` (LRU, stores resolved URL string or `''` for not-found)
2. Checks `workspaceCache` (persists across panel closes)
3. Tries nuget.org flat container first — HTTP/2 `HEAD` request (fast path, no auth needed)
4. Falls back to custom sources — discovers `packageBaseAddress` via service index, tries `{base}/{id}/{version}/icon` with auth headers
5. Caches the result: found URLs with TTL=∞ (immutable), not-found with TTL=24h

Auth headers are passed to `checkUrlExistsHttp1` but NOT forwarded across origins on redirect (same-origin safety check).

**Circuit breaker**: Tracks consecutive icon misses per source URL (`iconSourceMissCount`). After 5 consecutive misses, that source is skipped for the rest of the session — prevents N×M HEAD requests when a source has no icons. A single hit resets the counter. Cleared on manual refresh via `clearSourceErrors()`.

```typescript
private async resolveIconUrl(
    packageId: string, version: string,
    enabledSources?: Array<{ url: string }>
): Promise<string | undefined> {
    // 1. nuget.org flat container (HTTP/2, fast)
    // 2. Custom sources via discovered packageBaseAddress (with auth + circuit breaker)
    // 3. Cache result
}
```

Methods that process many packages pre-fetch `enabledSources` once to avoid repeated `getSources()` calls.

### Multi-Source Autocomplete
When "All sources" is selected, `autocompletePackageId()`:
1. Queries nuget.org AND custom sources **in parallel** using `Promise.allSettled`
2. Uses `SearchAutocompleteService` when available (lightweight, returns only IDs)
3. Falls back to `SearchQueryService` for feeds that lack autocomplete (extracts IDs from full results)
4. Deduplicates by package ID — nuget.org results are processed first, so they "win" on collision
5. Results are sorted by prefix relevance, then alphabetically
6. **2-second timeout cap** for multi-source mode — returns whatever results are available by then, so slow custom sources don't block the typeahead UX

### Transitive Prefetch Deferral
Transitive package fetching is deferred by 2s after installed packages finish loading. This reduces network contention during the critical path (metadata fetch + update checks):

```typescript
// InstalledTab.tsx — defer to reduce network pressure
const timer = setTimeout(() => {
    setLoadingTransitive(true);
    vscode.postMessage({ type: 'getTransitivePackages', projectPath });
}, 2000);
return () => clearTimeout(timer);
```

### WorkspaceCache Utility
Location: `src/services/WorkspaceCache.ts`

```typescript
// Singleton cache backed by VS Code workspaceState
// Implements size limiting to prevent unbounded growth
class WorkspaceCache {
    private static readonly MAX_ENTRIES = 500;  // Prevents unbounded workspace state growth

    initialize(context: ExtensionContext): void;
    get<T>(key: string): T | undefined;  // Returns undefined if expired
    set<T>(key: string, value: T, ttl: number): void;  // ttl=0 means no expiry
    has(key: string): boolean;
    delete(key: string): void;

    // Eviction on set(): expired entries cleaned first, then oldest by TTL
    private evictIfNeeded(): void;
}

// Cache key builders (use : as separator, @ for version)
const cacheKeys = {
    versions: (id: string, source: string, prerelease: boolean, take: number) =>
        `versions:${id.toLowerCase()}:${source}:${prerelease}:${take}`,
    verifiedStatus: (id: string) =>
        `verified:${id.toLowerCase()}`,
    iconExists: (id: string, version: string) =>
        `iconurl:${id.toLowerCase()}@${version}`,
    searchResults: (query: string, sources: string[], prerelease: boolean) =>
        `search:${query.toLowerCase()}:${[...sources].sort().join(',')}:${prerelease}`,
    readme: (id: string, version: string) =>
        `readme:${id.toLowerCase()}@${version}`,
};

// TTL constants (milliseconds)
const CACHE_TTL = {
    VERSIONS: 3 * 60 * 1000,        // 3 minutes
    VERIFIED_STATUS: 5 * 60 * 1000, // 5 minutes
    ICON_EXISTS: 0,                 // Never expires for found icons (immutable per version)
                                     // Not-found icons use 24h TTL to allow new icons to be discovered
    SEARCH_RESULTS: 2 * 60 * 1000,  // 2 minutes
    README: 0,                      // Never expires (immutable per version)
};
```

### Cache Usage Pattern
```typescript
// Check in-memory first (fastest)
const memoryCached = this.versionsCache.get(cacheKey);
if (memoryCached) return memoryCached;

// Check workspace cache (persists across panel closes)
const workspaceCached = workspaceCache.get<string[]>(cacheKey);
if (workspaceCached) {
    this.versionsCache.set(cacheKey, workspaceCached);  // Promote to memory
    return workspaceCached;
}

// Fetch from network, then cache both tiers
const result = await this.fetchVersions(...);
this.versionsCache.set(cacheKey, result);
workspaceCache.set(cacheKey, result, CACHE_TTL.VERSIONS);
return result;
```

### What Gets Cached

| Data | TTL | Rationale |
|------|-----|-----------|
| Icon URL (found) | ∞ | Icons are immutable per package@version |
| Icon URL (not found) | 24h | Allows newly-published icons to be discovered |
| Package versions | 3 min | New versions published occasionally |
| Verified status & authors | 5 min | Rarely changes, safe to cache longer |
| Search results | 2 min | Frequently updated, short cache for freshness |
| README content | ∞ | Immutable per package@version |

### List Virtualization

The Browse and Updates tabs use `@tanstack/react-virtual` to virtualize package lists, rendering only visible items in the DOM:

```typescript
// Virtualizer instance per list
const browseVirtualizer = useVirtualizer({
    count: searchResults.length,
    getScrollElement: () => browseScrollRef.current,
    estimateSize: () => 66, // estimated item height (padding + icon + text)
    overscan: 5, // render 5 extra items above/below viewport
});

// Items are absolutely positioned within a relative container
<div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
    {virtualizer.getVirtualItems().map(virtualRow => (
        <div
            ref={virtualizer.measureElement}  // dynamic height measurement
            style={{ position: 'absolute', transform: `translateY(${virtualRow.start}px)` }}
        />
    ))}
</div>
```

The keyboard navigation handler (`createPackageListKeyHandler`) accepts an optional `scrollToIndex` callback, allowing virtualized lists to scroll to items that may not be in the DOM yet:
```typescript
options?: {
    scrollToIndex?: (index: number) => void; // calls virtualizer.scrollToIndex()
}
```

The Installed tab is **not** virtualized because its list is embedded within a complex layout (filter bar, toolbar, collapsible transitive framework sections) that scrolls together.

### Component Memoization

- **Tab components** (`BrowseTab`, `InstalledTab`, `UpdatesTab`) are wrapped in `React.memo` with `forwardRef` + `useImperativeHandle` for parent-to-child communication.
- **PackageDetailsPanel** is wrapped in `React.memo` as `MemoizedPackageDetailsPanel`, shared by all three tabs.
- `DraggableSash` is wrapped in `React.memo` as `MemoizedDraggableSash` with memoized `onReset`/`onDragEnd` callbacks (`useCallback` with `[]` deps) to prevent re-renders on unrelated state changes.
- `sanitizedReadmeHtml` is memoized via `useMemo` keyed on `packageMetadata?.readme`, preventing expensive `marked.parse()` + `DOMPurify.sanitize()` re-computation on every render.

### Message Handler Pattern

The webview message handler uses a `useRef` pattern to avoid the "stale closure" problem without requiring ref-sync effects:

```typescript
// Ref holds the latest handler
const handleMessageRef = useRef<(event: MessageEvent) => void>(() => {});

// Handler defined as regular function - captures current state via closures
const handleMessage = (event: MessageEvent) => {
    // reads selectedProject, selectedPackage, activeTab, etc. directly
};
handleMessageRef.current = handleMessage; // updated every render

// Event listener set up once, calls through ref
useEffect(() => {
    const listener = (e: MessageEvent) => handleMessageRef.current(e);
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
}, []);
```

This pattern eliminates the need for individual ref-sync effects (previously 7 separate `useEffect` hooks were used to sync state values like `selectedProject`, `activeTab`, `selectedSource` etc. to refs so the `useCallback(fn, [])` handler could read them).

### Details Panel Component

The package details panel has been extracted into `PackageDetailsPanel.tsx` (~280 lines), wrapped in `React.memo` as `MemoizedPackageDetailsPanel`. Each tab renders its own instance, receiving shared state as props. This replaces the previous `useMemo`-based approach with proper component-level memoization via `React.memo`.

### State Stability Patterns

**Installed packages content comparison:** To prevent cascading re-render chains (where `setInstalledPackages` → triggers `checkPackageUpdates` effect → posts message → response calls `setPackagesWithUpdates`), incoming packages are compared by `id@version` content before updating state:

```typescript
setInstalledPackages(prev => {
    const prevKey = prev.map(p => `${p.id}@${p.version}`).sort().join(',');
    const newKey = incoming.map(p => `${p.id}@${p.version}`).sort().join(',');
    return prevKey === newKey ? prev : incoming; // same ref = no re-render
});
```

**Transitive metadata ref mirror:** The transitive metadata prefetch effect needs to track which frameworks are already being fetched. React 19 runs `setState` updaters asynchronously, so assigning a local variable inside an updater and reading it after `setState` returns always yields the initial value. Instead, a `useRef<Set<string>>` mirrors the state synchronously:

```typescript
// Ref mirror for synchronous reads — React 19 defers setState updaters
const transitiveLoadingMetadataRef = useRef<Set<string>>(new Set());
const [transitiveLoadingMetadata, setTransitiveLoadingMetadata] = useState<Set<string>>(new Set());

// In prefetch effect — read ref synchronously, then update both
const frameworksToFetch = transitiveFrameworks.filter(f =>
    !f.metadataLoaded && !transitiveLoadingMetadataRef.current.has(f.targetFramework)
);
if (frameworksToFetch.length === 0) return;
for (const f of frameworksToFetch) {
    transitiveLoadingMetadataRef.current.add(f.targetFramework);
}
setTransitiveLoadingMetadata(new Set(transitiveLoadingMetadataRef.current));
// Now safe to call postMessage — frameworksToFetch is populated
```

The ref is also cleared in `doResetTransitiveState` and updated in the `transitiveMetadata` response handler.

### Frontend Caching (React)
The webview maintains LRU caches using `useRef<LRUMap>()` to avoid redundant requests with memory bounds:

```typescript
// LRU Map with max size eviction
class LRUMap<K, V> {
    constructor(maxSize: number);
    get(key: K): V | undefined;  // Moves to most-recently-used
    set(key: K, value: V): void; // Evicts oldest if at capacity
}

// Version cache - prevents "Loading..." flash on re-selecting packages
// Max 200 entries to prevent unbounded memory growth
const versionsCache = useRef<LRUMap<string, string[]>>(new LRUMap(200));

// Metadata cache - cached package details
// Max 100 entries
const metadataCache = useRef<LRUMap<string, PackageMetadata>>(new LRUMap(100));
```

These are checked before sending `getPackageVersions` or metadata requests.

### Concurrency Limiting
Parallel API requests use sliding-window concurrency to prevent network congestion while keeping all slots saturated:

```typescript
// Sliding-window concurrency: starts next item as any slot frees (not batch-then-wait)
async function batchedPromiseAll<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number = 6
): Promise<R[]>;

// Used for metadata fetching on all tabs (Installed, Browse, Updates, Transitive)
await batchedPromiseAll(packages, async (pkg) => {
    // Single search API call returns verified, authors, AND iconUrl
    const { verified, authors, iconUrl } = await this.getPackageSearchMetadata(pkg.id, pkg.version);
    // Falls back to resolveIconUrl only for custom-source-only packages
    if (!pkg.iconUrl) { pkg.iconUrl = await this.resolveIconUrl(...); }
}, 16); // Sliding-window with 16 concurrent slots
```

### Async I/O
All file system operations use async methods to avoid blocking the event loop:

```typescript
// Helper for non-blocking file existence check
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch { return false; }
}

// Used instead of synchronous fs.existsSync
if (await fileExists(assetsPath)) { ... }
```

### Backend Caching (NuGetService)
The extension backend uses LRU caches with size limits to prevent unbounded memory growth:

```typescript
// LRUMap implementation with automatic eviction
class LRUMap<K, V> {
    constructor(maxSize: number);
    get(key: K): V | undefined;   // Returns value, moves to MRU
    set(key: K, value: V): void;  // Evicts LRU if at capacity
    has(key: K): boolean;
    delete(key: K): boolean;
}

// Cache size limits in NuGetService
private serviceIndexCache = new LRUMap<string, ServiceEndpoints>(50);
private metadataCache = new LRUMap<string, PackageMetadata>(200);
private iconUrlCache = new LRUMap<string, string>(500);  // Stores resolved icon URL or '' (not found)
private versionsCache = new LRUMap<string, string[]>(200);
private verifiedStatusCache = new LRUMap<string, VerifiedStatus>(300);
private searchResultsCache = new LRUMap<string, PackageSearchResult[]>(100);
private autocompleteCache = new LRUMap<string, AutocompleteEntry>(50);
```

### HTTP/2 Session Pool
The HTTP/2 client limits concurrent sessions to prevent memory accumulation:

```typescript
// Http2Client.ts
private static readonly MAX_SESSIONS = 10;
private sessions: Map<string, ClientHttp2Session> = new Map();
private sessionOrder: string[] = []; // LRU tracking

// When creating new session, evict oldest if at capacity
if (this.sessions.size >= Http2Client.MAX_SESSIONS) {
    const oldestOrigin = this.sessionOrder.shift();
    this.sessions.get(oldestOrigin)?.close();
    this.sessions.delete(oldestOrigin);
}
```

### HTTP Error Propagation
The Http2Client provides two fetch methods:
- `fetchJson<T>()` - Simple API, returns `T | null` (legacy, backward-compatible)
- `fetchJsonWithDetails<T>()` - Returns structured error info for callers that need to distinguish error types

```typescript
// Http2Client.ts - Result type with error details
interface FetchResult<T> {
    data: T | null;
    error?: {
        type: 'network' | 'http-error' | 'parse-error';
        message: string;
        statusCode?: number;  // For http-error
    };
}

// Usage: when you need to handle errors differently
const result = await http2Client.fetchJsonWithDetails<ServiceIndex>(url);
if (result.error?.type === 'network') {
    // Retry logic or offline handling
} else if (result.error?.statusCode === 401) {
    // Prompt for authentication
}
```

### Early Resolution Pattern
For parallel fetches across multiple sources, the extension uses a race pattern to resolve as soon as the first source returns valid data:

```typescript
// NuGetService.ts - Resolve early, don't wait for slow sources
private raceForFirstResult<T>(
    promises: Promise<T>[],
    predicate: (result: T) => boolean,
    defaultValue: T
): Promise<T> {
    // Resolves immediately when first promise matches predicate
    // Remaining promises continue in background but we don't wait
}

// Usage: getPackageVersions with "all" sources
return await this.raceForFirstResult(
    enabledSources.map(src => this.getPackageVersionsFromSource(...)),
    (versions) => versions.length > 0  // First non-empty wins
);
```

### React 19 Concurrent Rendering
The webview leverages React 19's concurrent features for responsive UI during heavy operations:

```typescript
// Deferred search - keeps UI responsive while typing
const [searchQuery, setSearchQuery] = useState('');
const deferredSearchQuery = useDeferredValue(searchQuery);
const isSearchStale = searchQuery !== deferredSearchQuery;
// Effect uses deferredSearchQuery for API calls

// Deferred lists - smooth sorting/filtering feedback
const sortedInstalledPackages = useMemo(() => [...packages].sort(...), [packages]);
const deferredInstalledPackages = useDeferredValue(sortedInstalledPackages);
const isInstalledStale = sortedInstalledPackages !== deferredInstalledPackages;
// Render uses deferredInstalledPackages with stale class for opacity fade

// Non-blocking tab transitions
const [isTabPending, startTabTransition] = useTransition();
startTabTransition(() => {
    setActiveTab('installed');
    setSelectedPackage(null);
});
// Tab shows .pending class during transition
```

Stale indicators provide visual feedback with CSS opacity fade:
```css
.package-list.stale { opacity: 0.7; transition: opacity 0.2s ease-out; }
.tab.pending { opacity: 0.7; }
```

## HTTP/2 Client

Location: `src/services/Http2Client.ts`

### Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                       HTTP Client Selection                      │
│                                                                  │
│  URL contains .nuget.org?                                        │
│     ├── YES → HTTP/2 Client (multiplexing, session reuse)       │
│     └── NO  → HTTP/1.1 Client (keepAlive agent)                 │
└─────────────────────────────────────────────────────────────────┘
```

### HTTP/2 Benefits
- **Multiplexing**: Many requests over 1 TCP connection
- **Session Reuse**: Single TCP handshake for entire session
- **Head-of-Line Blocking**: Eliminated (unlike HTTP/1.1)

### Performance Impact
| Scenario | HTTP/1.1 | HTTP/2 | Improvement |
|----------|----------|--------|-------------|
| 20 icon checks | ~1000ms | ~300ms | ~70% |
| 50 metadata fetches | ~2500ms | ~800ms | ~68% |
| Search + icons + verified | ~1500ms | ~500ms | ~66% |

### Supported Origins (HTTP/2)
- `https://api.nuget.org` (flat container for icons, versions)

Azure Search endpoints (`azuresearch-*.nuget.org`) use HTTP/1.1 due to TLS compatibility issues with Electron's BoringSSL.

All other sources use HTTP/1.1 with keepAlive connection pooling.

## Authentication for Private Feeds

### Overview
The extension supports authenticated API calls for private NuGet feeds (Azure DevOps, GitHub Packages, JFrog, etc.) via the `CredentialService`.

### Credential Resolution Priority
1. **nuget.config `<packageSourceCredentials>`** - Parsed by `NuGetConfigParser.getCredentials()`
2. **Windows Credential Manager** - Via PowerShell `Get-StoredCredential` cmdlet
3. **Azure Artifacts Credential Provider** - Non-interactive mode (cached tokens only)

### Credential Flow
```
NuGetPanel opens
    │
    ▼
initializeCredentials() ──▶ NuGetConfigParser.getCredentials()
    │                              │
    ▼                              ├── Parse ClearTextPassword
    │                              ├── Decrypt DPAPI Password
    │                              └── Resolve %ENV_VAR% syntax
    │
    ▼
CredentialService.prewarmCredentials()
    │
    ├── nuget.config credentials (already loaded)
    ├── Windows Credential Manager lookup
    └── Credential Provider invocation
```

### DPAPI Decryption
Encrypted passwords in nuget.config use Windows DPAPI (CurrentUser scope). Decryption is done via PowerShell:

```powershell
[System.Security.Cryptography.ProtectedData]::Unprotect(
    [Convert]::FromBase64String($encrypted),
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
```

If decryption fails (wrong user, different machine), the credential is skipped with a warning logged.

### Credential Caching
- **Success TTL:** 30 minutes
- **Failure TTL:** 5 minutes (to retry after VPN connect, etc.)
- Cache key: source URL (normalized)

### Auth Header Passing
All `fetchJson()` and `fetchText()` calls accept an optional `authHeader` parameter:

```typescript
const authHeader = await this.getAuthHeader(sourceUrl);
const result = await this.fetchJson<SearchResult>(searchUrl, authHeader);
```

Auth headers are preserved on same-origin redirects only (security best practice).

## NuGet API Integration

### Service Index Discovery
Each NuGet V3 source has a service index at `{source}/index.json` providing:
- `PackageBaseAddress` - flat container for versions, content, icons
- `RegistrationsBaseUrl` - package metadata (filtered: excludes gzip-compressed `-gz-` endpoints since HTTP/2 client has no gzip decompression; uses `registration5-semver1/`)
- `SearchQueryService` - search, also used by `getPackageSearchMetadata` for unified metadata (verified, authors, iconUrl)

### Local Source Detection
```typescript
// Skip local file paths (not HTTP endpoints)
private isLocalSource(sourceUrl: string): boolean {
    return !sourceUrl.startsWith('http://') && !sourceUrl.startsWith('https://');
}
```
Sources like `C:\Program Files (x86)\Microsoft SDKs\NuGetPackages\` are skipped.

### Memory Cache
```typescript
// Cache keyed by packageId@version (immutable - safe to cache)
private metadataCache: Map<string, PackageMetadata> = new Map();
```

### Package Icons
```
Primary: https://api.nuget.org/v3-flatcontainer/{id}/{version}/icon
- Works for embedded icons (modern packages)
- Works for iconUrl packages (legacy)
- Use HEAD request to check existence before setting
```

### Verified Status (Reserved Prefix)
```
Endpoint: {searchQueryService from service index}?q=packageid:{id}&take=1
Response: { data: [{ id, verified: true/false, authors: [...] }] }
```
Uses dynamic endpoint discovery from nuget.org's service index (`/v3/index.json`).

### Package Metadata Fallback Chain
1. Direct version-specific registration endpoint
2. Package index + page traversal (for Nexus-style feeds)
3. Nuspec from flat container
4. Search API as last resort

### README Extraction from nupkg
Custom sources (Nexus, ProGet) often don't expose `ReadmeUriTemplate`.
Solution: Download the nupkg (ZIP file) and extract README:
```typescript
// Uses adm-zip to extract README.md from nupkg
const zip = new AdmZip(tempFile);
// Check nuspec for <readme> path, fallback to common paths
```

## Security

### Input Validation (Command Injection Prevention)
All user input is validated before use in shell commands to prevent command injection:

```typescript
// NuGetService.ts - Validate before dotnet CLI commands
function isValidPackageId(id: string): boolean {
    return /^[a-zA-Z0-9._-]+$/.test(id);  // Alphanumeric, dots, underscores, hyphens
}

function isValidVersion(version: string): boolean {
    return /^[a-zA-Z0-9._+-]+$/.test(version);  // SemVer-compatible
}

function isValidSourceName(name: string): boolean {
    return /^[a-zA-Z0-9._\- ]+$/.test(name) && name.length <= 256;
}

function isValidSourceUrl(url: string): boolean {
    // Rejects shell metacharacters: ; & | $ ` \ < > etc.
    const dangerousChars = /["'`\\|><;{}\r\n\t&$!#()]/;
    return !dangerousChars.test(url);
}

// CredentialService.ts - Validate before PowerShell execution
private isValidBase64(value: string): boolean {
    return /^[A-Za-z0-9+/]+=*$/.test(value);  // Prevents PS injection in DPAPI decrypt
}

private isValidUrl(url: string): boolean {
    // Validates URL format and rejects dangerous characters
}
```

**Validation Points:**
- `installPackage` / `updatePackage` / `removePackage` - validates package ID and version
- `enableSource` / `disableSource` / `removeSource` - validates source name
- `addSource` - validates source URL and optional source name
- `decryptDpapi` - validates base64 format before PowerShell interpolation
- `tryCredentialProvider` - validates URL before credential provider invocation

### Credential Redaction
Sensitive information is redacted before logging:

```typescript
private sanitizeForLogging(text: string): string {
    // Redacts: embedded credentials in URLs, --password args,
    // API keys, tokens, Authorization headers, etc.
}
```

### XSS Prevention
README content is sanitized before rendering:

```typescript
import DOMPurify from 'dompurify';

<div dangerouslySetInnerHTML={{
    __html: DOMPurify.sanitize(marked.parse(readme))
}} />
```

## Content Security Policy

The webview requires specific CSP for external resources:

```typescript
const csp = `
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src ${webview.cspSource} 'unsafe-inline';
    connect-src ${webview.cspSource};
    img-src https://api.nuget.org https://*.nuget.org
            https://raw.githubusercontent.com https://*.githubusercontent.com
            https://github.com https://shields.io https://*.shields.io
            https://img.shields.io data:;
`;
```

**Note:** The expanded `img-src` list supports README images from GitHub and badge images from shields.io.

## Theme Compliance

The webview CSS uses VS Code CSS variables for full theme adaptation:

### Core UI Elements
- Backgrounds: `--vscode-editor-background`, `--vscode-list-hoverBackground`
- Text: `--vscode-foreground`, `--vscode-descriptionForeground`
- Selection: `--vscode-list-activeSelectionBackground`, `--vscode-focusBorder`
- Buttons: `--vscode-button-*`, `--vscode-inputValidation-error*`
- Shadows: `--vscode-widget-shadow`

### Syntax Highlighting (README code blocks)
Uses `--vscode-symbolIcon-*` and `--vscode-debugTokenExpression-*` variables with dark theme fallbacks:
- Keywords: `--vscode-symbolIcon-keywordForeground`
- Types: `--vscode-symbolIcon-classForeground`
- Functions: `--vscode-symbolIcon-functionForeground`
- Strings: `--vscode-debugTokenExpression-string`
- Numbers: `--vscode-debugTokenExpression-number`

### Light Theme Overrides
VS Code adds `vscode-light` class to body for light themes. The CSS includes specific overrides:
```css
body.vscode-light .readme-rendered .hljs-comment { color: #008000; }
body.vscode-light .readme-rendered .hljs-keyword { color: var(--vscode-symbolIcon-keywordForeground, #0000ff); }
```

## Build System

### esbuild Configuration
- Two separate builds: extension (Node.js/CJS) and webview (browser/IIFE)
- esbuild `define` for `process.env.NODE_ENV` (required by React)
- `jsx: 'automatic'` for React 17+ JSX transform
- Source maps disabled in production builds
- ~100ms build times vs ~2-3s with webpack

### Output
```
dist/
├── extension.js      # Main extension code (no source map in production)
├── webview.js        # React webview bundle
└── webview.css       # External CSS file
```

## Testing the Extension

1. Run `npm run watch` (or press F5)
2. Open a folder with .csproj files in the Extension Host window
3. Open Command Palette → "nUIget: Manage NuGet Packages"
4. Test all three tabs (Browse, Installed, Updates)

## Transitive Packages Architecture

### Data Source
Transitive packages are loaded exclusively from **`obj/project.assets.json`**:

- Always fresh after any dotnet command including `dotnet remove`
- Uses `projectFileDependencyGroups` to identify direct packages
- Uses `targets` section for full dependency graph
- Generated by `dotnet restore` (run automatically or via ↻ button)

**Note:** `packages.lock.json` is only used by `getResolvedVersionFromLockFiles()` to resolve floating versions (e.g., `10.*`) to their actual installed version. It is NOT used for transitive package discovery.

### Multi-Framework Support
The Installed tab shows transitive dependencies grouped by target framework:

```typescript
interface TransitiveFrameworkSection {
    targetFramework: string;  // e.g., "net8.0", "net6.0"
    packages: TransitivePackage[];
    metadataLoaded: boolean;  // Icons/verified loaded on expand
}
```

### Background Prefetch Pattern (Two-Stage)
Transitive data is prefetched in two stages for optimal UX:

```typescript
// Stage 1: Prefetch framework list after direct packages load
useEffect(() => {
    if (selectedProject && !loadingInstalled && transitiveLockFileExists === null) {
        vscode.postMessage({ type: 'getTransitivePackages', projectPath });
    }
}, [selectedProject, loadingInstalled]);

// Stage 2: Prefetch metadata for all frameworks after framework list loads
useEffect(() => {
    if (transitiveFrameworks.length > 0) {
        const frameworksToPrefetch = transitiveFrameworks.filter(f => !f.metadataLoaded);
        for (const f of frameworksToPrefetch) {
            vscode.postMessage({ type: 'getTransitiveMetadata', targetFramework: f.targetFramework });
        }
    }
}, [transitiveFrameworks]);
```

When user expands a section: instant if prefetch completed, shows loading if prefetch in progress.

## Bulk Operations

### Topological Sort for Dependencies
Both bulk update and bulk uninstall use topological sorting to handle dependencies correctly:

```typescript
// Sort packages so dependencies are processed before dependents
const sorted = topologicalSort(packages, dependencyGraph);
```

### Bulk Update Flow
1. UI sends `bulkUpdatePackages` with list of packages
2. Extension sorts by dependency order
3. Each package updated sequentially (with `skipChannelSetup` option)
4. Single `dotnet restore` at the end (not per-package)
5. Returns `bulkUpdateResult` with success/fail counts

### Bulk Remove Flow
1. UI sends `confirmBulkRemove` with package list
2. Extension sends `bulkRemoveConfirmed` (no modal, direct proceed)
3. Packages removed in reverse dependency order (dependents first)
4. Single `dotnet restore` at the end
5. Returns `bulkRemoveResult` with success/fail counts

### Performance Optimization
- `skipChannelSetup: true` - Don't reveal output channel for each package
- `skipRestore: true` - Skip per-package restore, run once at end
- Progress notification shows current/total count

## Common Patterns

### Fetching Data for Package Lists
```typescript
// Unified metadata fetch: single search API call per package returns verified, authors, AND iconUrl
// Used by all 4 tabs (Browse, Installed, Updates, Transitive)
await batchedPromiseAll(packages, async (pkg) => {
    const { verified, authors, iconUrl } = await this.getPackageSearchMetadata(pkg.id, pkg.version);
    if (iconUrl) { pkg.iconUrl = iconUrl; }
    if (!pkg.iconUrl) { pkg.iconUrl = await this.resolveIconUrl(pkg.id, pkg.version, enabledSources); }
}, 16);
```

### Handling Installed Packages
```typescript
// Primary: Parse .csproj directly (reliable)
const packages = parsePackageReferencesFromCsproj(content);

// Fallback: Use dotnet CLI (may fail if sources unreachable)
const { stdout } = await execAsync(`dotnet list "${projectPath}" package`);
```

### Shared UI Components
```typescript
// renderPackageDetailsPanel() used by all three tabs
// Ensures consistent package details display
const renderPackageDetailsPanel = () => {
    // ... shared implementation
};
```

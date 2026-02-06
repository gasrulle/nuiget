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
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │   Browse    │  │  Installed  │  │  Updates [3]    │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  │                        App.tsx                            │  │
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
│       ├── App.tsx           # Main UI component (~3400 lines)
│       ├── App.css           # Styles
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
| `getTransitivePackages` | UI → Ext | Get transitive packages from project.assets.json |
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
        `icon:${id.toLowerCase()}@${version}`,
    searchResults: (query: string, sources: string[], prerelease: boolean) =>
        `search:${query.toLowerCase()}:${[...sources].sort().join(',')}:${prerelease}`,
    readme: (id: string, version: string) =>
        `readme:${id.toLowerCase()}@${version}`,
};

// TTL constants (milliseconds)
const CACHE_TTL = {
    VERSIONS: 3 * 60 * 1000,        // 3 minutes
    VERIFIED_STATUS: 5 * 60 * 1000, // 5 minutes
    ICON_EXISTS: 0,                 // Never expires (icons immutable per version)
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
| Icon existence | ∞ | Icons are immutable per package@version |
| Package versions | 3 min | New versions published occasionally |
| Verified status & authors | 5 min | Rarely changes, safe to cache longer |
| Search results | 2 min | Frequently updated, short cache for freshness |
| README content | ∞ | Immutable per package@version |

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
Parallel API requests are batched to prevent network congestion:

```typescript
// Execute promises in batches to limit concurrency
async function batchedPromiseAll<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number = 6
): Promise<R[]>;

// Used for metadata fetching on installed packages
await batchedPromiseAll(packages, async (pkg) => {
    const iconExists = await this.checkIconExists(...);
    const { verified, authors } = await this.getPackageVerifiedAndAuthors(...);
}, 8); // Max 8 concurrent requests
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
private iconExistsCache = new LRUMap<string, boolean>(500);
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
- `RegistrationsBaseUrl` - package metadata
- `SearchQueryService` - search

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
// Fetch icons and verified status in parallel
await Promise.all([
    this.fetchPackageIcons(packages),
    this.fetchPackageVerifiedStatus(packages)
]);
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

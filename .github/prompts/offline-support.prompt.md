# Full Offline / Cached Package Support — Implementation Prompt

## Overview

Enhance the extension to gracefully degrade when NuGet sources are unreachable by leveraging the **local NuGet global-packages cache** (`~/.nuget/packages/`). Currently, the extension has minimal offline support: `getOfflineMetadata()` reads `.nuspec` files as a last-resort metadata fallback. This prompt covers expanding offline support to **version listing, README extraction, search, icon loading, source provenance display**, and **UI indicators** — all derived from data already present on disk from prior restores.

**Key constraint:** Only packages previously restored to global-packages are browsable offline. No new package _discovery_ is possible without network. This is the same constraint as `dotnet restore --source ~/.nuget/packages`.

## MANDATORY: Read These Files First

Before making ANY changes, read these files in full:
- `ARCHITECTURE.md` — System architecture, caching layers, performance patterns
- `.github/copilot-instructions.md` — Agent rules, gotchas, build verification (`npm run package:vsix`)
- `src/services/NuGetService.ts` — Core backend service (~4200+ lines). Focus on:
  - `resolveGlobalPackagesFolder()` (~L2863) — resolves cache path, already cached for lifetime
  - `getOfflineMetadata()` (~L2891) — current offline nuspec reader
  - `getPackageMetadata()` (~L2974) — orchestrator that falls back to offline
  - `getPackageVersions()` / `getPackageVersionsFromSource()` (~L2655) — network-only today
  - `searchPackages()` / `searchPackagesViaApi()` (~L1615, ~L1724) — network-only today
  - `extractReadmeFromPackage()` (~L3881) — downloads nupkg from network, ignores local cache
  - `failedEndpointCache` (~L84) — tracks unreachable sources (120s TTL)
  - `filterHealthySources()` (~L2587) — filters out failed sources
- `src/services/NuGetTypes.ts` — `PackageMetadata`, `PackageSearchResult` types
- `src/webview/app/types.ts` — Frontend mirror types
- `src/webview/app/components/PackageDetailsPanel.tsx` — Offline indicator banner

## Current State Analysis

### What Already Works Offline
| Feature | Mechanism |
|---------|-----------|
| Installed packages listing | Direct `.csproj` XML parsing |
| Transitive dependencies | `project.assets.json` parsing (with mtime+TTL cache) |
| Basic metadata for cached packages | `getOfflineMetadata()` reads `.nuspec` from global-packages |
| Offline indicator in details panel | `offline?: boolean` on `PackageMetadata`, yellow banner in UI |

### What Requires Network Today (Targets for This Work)
| Feature | Current Method | Offline Alternative |
|---------|---------------|-------------------|
| Version listing | `getPackageVersionsFromSource()` → flat container API | Enumerate subdirectories under `~/.nuget/packages/{id}/` |
| README display | `extractReadmeFromPackage()` → downloads nupkg from network | Read `<readme>` element from nuspec → load file from extracted package folder |
| Search / browse | `searchPackages()` → `dotnet package search` / API | Enumerate global-packages directories, filter by id/description/tags from nuspec |
| Package icon | Flat container icon URL (network) | Read `<icon>` element from nuspec → load file as data URI from extracted folder |
| Source provenance | Not shown | Read `.nupkg.metadata` JSON → `source` field |
| Enhanced offline metadata | Only basic fields from nuspec | Also extract `tags`, `releaseNotes`, `repository`, `copyright`, `license` expression |

## Global-Packages Folder Structure Reference

```
~/.nuget/packages/
├── {packageid.lowercase}/
│   ├── {version.lowercase}/
│   │   ├── {packageid}.nuspec          ← Richest metadata source (XML)
│   │   ├── .nupkg.metadata             ← JSON: { version, contentHash, source }
│   │   ├── {packageid}.{version}.nupkg ← Original package archive (ZIP)
│   │   ├── {packageid}.{version}.nupkg.sha512  ← integrity hash
│   │   ├── icon.png                    ← Extracted icon (path from nuspec <icon>)
│   │   ├── README.md                   ← Extracted readme (path from nuspec <readme>)
│   │   ├── lib/                        ← Compiled assemblies per TFM
│   │   └── ...
│   └── {another-version}/
└── {another-package}/
```

**Key facts:**
- Package IDs and versions are **always lowercased** in folder names
- `.nupkg.metadata` existence confirms successful extraction — if absent, the folder may be corrupt
- The `<readme>` nuspec element (NuGet 5.10+) contains the relative path to the readme within the extracted folder
- The `<icon>` nuspec element contains the relative path to the icon within the extracted folder

---

## Step-by-Step Implementation

### Step 1: Enhanced Offline Metadata — `getOfflineMetadata()`

**File:** `src/services/NuGetService.ts`

Expand the existing `getOfflineMetadata()` to extract additional fields from the nuspec:

**Currently extracted:** `id`, `version`, `description`, `authors`, `licenseUrl`, `projectUrl`, `dependencies`
**Add:** `tags`, `releaseNotes`, `repository` url, `copyright`, `license` (SPDX expression), `readme` path, `icon` path

Also read `.nupkg.metadata` to get the `source` field (where the package was originally downloaded from).

```typescript
// Add to nuspec parsing:
const tags = getTag('tags');
const releaseNotes = getTag('releaseNotes');
const copyright = getTag('copyright');

// License: can be <license type="expression">MIT</license> or <license type="file">LICENSE.md</license>
const licenseMatch = nuspecContent.match(/<license\s+type="([^"]*)"[^>]*>([^<]*)<\/license>/i);
const license = licenseMatch ? (licenseMatch[1] === 'expression' ? licenseMatch[2].trim() : undefined) : undefined;

// Repository URL
const repoMatch = nuspecContent.match(/<repository\s+[^>]*url="([^"]*)"[^>]*\/>/i);
const repositoryUrl = repoMatch ? repoMatch[1] : undefined;

// README relative path from nuspec
const readmePath = getTag('readme'); // e.g., "docs/README.md" or "README.md"

// Icon relative path from nuspec
const iconPath = nuspecContent.match(/<icon>([^<]+)<\/icon>/i)?.[1]?.trim();

// Read .nupkg.metadata for source provenance
const nupkgMetadataPath = path.join(globalFolder, lowerId, lowerVersion, '.nupkg.metadata');
let sourceUrl: string | undefined;
try {
    if (fs.existsSync(nupkgMetadataPath)) {
        const metaJson = JSON.parse(await readFileAsync(nupkgMetadataPath, 'utf8'));
        sourceUrl = metaJson.source;
    }
} catch { /* ignore parse errors */ }
```

**Type changes:** Add optional fields to `PackageMetadata` in both `NuGetTypes.ts` and `app/types.ts`:
```typescript
tags?: string;           // Comma-separated tags from nuspec
releaseNotes?: string;   // Release notes text
copyright?: string;
repositoryUrl?: string;  // Git/source URL
sourceUrl?: string;      // NuGet source this was downloaded from (from .nupkg.metadata)
```

**Decision:** Only add fields that the detail panel will actually render. Don't over-expand the type without UI.

### Step 2: Offline Version Listing — `getOfflineVersions()`

**File:** `src/services/NuGetService.ts`

Create a new private method that lists versions from the global-packages folder:

```typescript
/**
 * List available versions for a package from the local global-packages cache.
 * Only returns versions that have been previously restored.
 */
private async getOfflineVersions(packageId: string): Promise<string[]> {
    const globalFolder = await this.resolveGlobalPackagesFolder();
    if (!globalFolder) { return []; }

    const packageDir = path.join(globalFolder, packageId.toLowerCase());
    if (!fs.existsSync(packageDir)) { return []; }

    const entries = await readdirAsync(packageDir, { withFileTypes: true });
    const versions: string[] = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) { continue; }
        // Verify the version folder has .nupkg.metadata (confirms successful extraction)
        const metadataPath = path.join(packageDir, entry.name, '.nupkg.metadata');
        if (fs.existsSync(metadataPath)) {
            versions.push(entry.name);
        }
    }

    // Sort descending (latest first) using numeric-aware comparison
    versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
    return versions;
}
```

**Integration point in `getPackageVersions()`:**

Add an offline fallback at the end of `getPackageVersions()`, after all network attempts fail:

```typescript
// After existing network logic returns empty...
// Offline fallback: check local cache
if (result.length === 0) {
    const offlineVersions = await this.getOfflineVersions(packageId);
    if (offlineVersions.length > 0) {
        // Don't cache offline results in versionsCache — they're incomplete
        return offlineVersions;
    }
}
```

**Important:** Do NOT cache offline version results in `versionsCache` or `workspaceCache` — they represent only locally cached versions, not the full picture. When the network recovers, fresh data should replace them without cache invalidation.

**Note:** You will need to add `readdirAsync` if it doesn't already exist. Check if there's an existing promisified readdir, or use `fs.promises.readdir`:
```typescript
import { readdir } from 'fs/promises';
// or use existing util.promisify pattern if established in the codebase
```

### Step 3: Local README Extraction — `extractReadmeFromLocalCache()`

**File:** `src/services/NuGetService.ts`

Create a new private method that reads README from the extracted package folder:

```typescript
/**
 * Extract README from locally cached package in global-packages folder.
 * Checks the nuspec <readme> element for the file path, then reads it directly.
 * Falls back to scanning for common readme filenames.
 */
private async extractReadmeFromLocalCache(packageId: string, version: string): Promise<string | null> {
    const globalFolder = await this.resolveGlobalPackagesFolder();
    if (!globalFolder) { return null; }

    const lowerId = packageId.toLowerCase();
    const lowerVersion = version.toLowerCase();
    const packageDir = path.join(globalFolder, lowerId, lowerVersion);

    if (!fs.existsSync(packageDir)) { return null; }

    // Strategy 1: Read <readme> element from nuspec for the exact path
    const nuspecPath = path.join(packageDir, `${lowerId}.nuspec`);
    if (fs.existsSync(nuspecPath)) {
        const nuspecContent = await readFileAsync(nuspecPath, 'utf8');
        const readmeMatch = nuspecContent.match(/<readme>([^<]+)<\/readme>/i);
        if (readmeMatch) {
            const readmeRelPath = readmeMatch[1].trim();
            // SECURITY: Validate the path doesn't escape the package directory
            const readmeFullPath = path.resolve(packageDir, readmeRelPath);
            if (readmeFullPath.startsWith(packageDir) && fs.existsSync(readmeFullPath)) {
                return await readFileAsync(readmeFullPath, 'utf8');
            }
        }
    }

    // Strategy 2: Check common README filenames at package root
    const readmeNames = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'readme.txt'];
    for (const name of readmeNames) {
        const readmePath = path.join(packageDir, name);
        if (fs.existsSync(readmePath)) {
            return await readFileAsync(readmePath, 'utf8');
        }
    }

    return null;
}
```

**Integration point in `extractReadmeFromPackage()`:**

Add local cache check BEFORE the network download attempt:

```typescript
// At the top of extractReadmeFromPackage(), after workspace cache check:

// Try local global-packages cache first (no network required)
const localReadme = await this.extractReadmeFromLocalCache(packageId, version);
if (localReadme) {
    // Cache the result
    workspaceCache.set(readmeCacheKey, localReadme, CACHE_TTL.README);
    return localReadme;
}

// ... existing network download logic follows
```

**Security note:** The `path.resolve()` + `startsWith()` check prevents path traversal attacks from malicious nuspec `<readme>` values.

### Step 4: Local Icon Extraction — `getOfflineIcon()`

**File:** `src/services/NuGetService.ts`

Create a method to extract an icon from the local cache and return it as a data URI:

```typescript
/**
 * Get package icon from locally cached package as a data URI.
 * Reads the <icon> element from the nuspec to find the icon file path.
 */
private async getOfflineIcon(packageId: string, version: string): Promise<string | null> {
    const globalFolder = await this.resolveGlobalPackagesFolder();
    if (!globalFolder) { return null; }

    const lowerId = packageId.toLowerCase();
    const lowerVersion = version.toLowerCase();
    const packageDir = path.join(globalFolder, lowerId, lowerVersion);

    if (!fs.existsSync(packageDir)) { return null; }

    // Read <icon> element from nuspec
    const nuspecPath = path.join(packageDir, `${lowerId}.nuspec`);
    if (!fs.existsSync(nuspecPath)) { return null; }

    const nuspecContent = await readFileAsync(nuspecPath, 'utf8');
    const iconMatch = nuspecContent.match(/<icon>([^<]+)<\/icon>/i);
    if (!iconMatch) { return null; }

    const iconRelPath = iconMatch[1].trim();
    // SECURITY: Validate the path doesn't escape the package directory
    const iconFullPath = path.resolve(packageDir, iconRelPath);
    if (!iconFullPath.startsWith(packageDir) || !fs.existsSync(iconFullPath)) {
        return null;
    }

    // Determine MIME type from extension
    const ext = path.extname(iconFullPath).toLowerCase();
    const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
    };
    const mime = mimeMap[ext] || 'image/png';

    // Read file and convert to data URI
    const iconBuffer = await readFileAsync(iconFullPath); // no encoding = Buffer
    return `data:${mime};base64,${iconBuffer.toString('base64')}`;
}
```

**Integration:** Use as a fallback in `resolveIconUrl()` or `getPackageMetadata()` when network icon resolution fails. The data URI format works with the existing CSP (`img-src ... data:;`).

**Performance note:** Only call this when the user actually views a package's details (on-demand), not during search result listing. Icon files can be several KB and base64 encoding doubles the size.

### Step 5: Offline Search — `searchOfflinePackages()`

**File:** `src/services/NuGetService.ts`

Create a method that searches the global-packages folder by enumerating directories and matching against nuspec metadata:

```typescript
/**
 * Search locally cached packages in the global-packages folder.
 * Used as a fallback when all NuGet sources are unreachable.
 * Scans package directories and matches against id, description, and tags from nuspec.
 */
private async searchOfflinePackages(
    query: string,
    take: number = 20
): Promise<PackageSearchResult[]> {
    const globalFolder = await this.resolveGlobalPackagesFolder();
    if (!globalFolder) { return []; }

    const queryLower = query.toLowerCase();
    const results: PackageSearchResult[] = [];

    let entries: fs.Dirent[];
    try {
        entries = await readdirAsync(globalFolder, { withFileTypes: true });
    } catch {
        return [];
    }

    // Phase 1: Quick filter by directory name (fast)
    const candidates = entries
        .filter(e => e.isDirectory() && e.name.includes(queryLower))
        .slice(0, take * 3); // Over-select, we'll refine with nuspec

    // Phase 2: For matching directories, find latest version and read nuspec
    for (const candidate of candidates) {
        if (results.length >= take) { break; }

        const packageDir = path.join(globalFolder, candidate.name);
        const versions = await this.getOfflineVersions(candidate.name);
        if (versions.length === 0) { continue; }

        const latestVersion = versions[0]; // Already sorted descending
        const nuspecPath = path.join(packageDir, latestVersion,
            `${candidate.name}.nuspec`);

        if (!fs.existsSync(nuspecPath)) { continue; }

        try {
            const nuspecContent = await readFileAsync(nuspecPath, 'utf8');
            const getTag = (tag: string): string | undefined => {
                const match = nuspecContent.match(
                    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
                );
                return match ? match[1].trim() : undefined;
            };

            const id = getTag('id') || candidate.name;
            const description = getTag('description') || '';
            const authors = getTag('authors') || '';
            const tags = getTag('tags') || '';

            results.push({
                id,
                version: latestVersion,
                description,
                authors,
                versions: versions,
                totalDownloads: undefined,
                iconUrl: undefined,
                verified: undefined,
                offline: true
            });
        } catch { continue; }
    }

    // Phase 3: If query didn't match directory names well, also search
    // nuspec content (description, tags) for remaining slots.
    // This is expensive — only do it if Phase 1 yielded few results.
    if (results.length < take && candidates.length < 5) {
        const allDirs = entries.filter(e => e.isDirectory()).slice(0, 500); // Cap scan
        for (const dir of allDirs) {
            if (results.length >= take) { break; }
            if (results.some(r => r.id.toLowerCase() === dir.name)) { continue; }

            const versions = await this.getOfflineVersions(dir.name);
            if (versions.length === 0) { continue; }

            const latestVersion = versions[0];
            const nuspecPath = path.join(globalFolder, dir.name, latestVersion,
                `${dir.name}.nuspec`);
            if (!fs.existsSync(nuspecPath)) { continue; }

            try {
                const content = await readFileAsync(nuspecPath, 'utf8');
                const desc = content.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || '';
                const tags = content.match(/<tags[^>]*>([\s\S]*?)<\/tags>/i)?.[1] || '';

                if (desc.toLowerCase().includes(queryLower) ||
                    tags.toLowerCase().includes(queryLower)) {
                    const id = content.match(/<id[^>]*>([\s\S]*?)<\/id>/i)?.[1]?.trim() || dir.name;
                    const authors = content.match(/<authors[^>]*>([\s\S]*?)<\/authors>/i)?.[1]?.trim() || '';

                    results.push({
                        id,
                        version: latestVersion,
                        description: desc.trim(),
                        authors,
                        versions: versions,
                        totalDownloads: undefined,
                        iconUrl: undefined,
                        verified: undefined,
                        offline: true
                    });
                }
            } catch { continue; }
        }
    }

    return results;
}
```

**Integration point in `searchPackages()`:**

Add offline fallback after all network search paths fail:

```typescript
// At the end of searchPackages(), if results are empty and network failed:
if (packages.length === 0) {
    const offlineResults = await this.searchOfflinePackages(query, effectiveTake);
    if (offlineResults.length > 0) {
        // Don't cache offline search results — they're incomplete
        return offlineResults;
    }
}
```

**Type change:** Add `offline?: boolean` to `PackageSearchResult` in both `NuGetTypes.ts` and `app/types.ts`.

**Performance:** Phase 1 (directory name match) is fast. Phase 3 (nuspec content scan) is capped at 500 directories maximum to prevent scanning thousands of cached packages. Consider adding a TTL-cached index in a future iteration if users have very large caches.

### Step 6: Source Provenance Display

**File:** `src/webview/app/components/PackageDetailsPanel.tsx`

When `metadata.offline === true` and `metadata.sourceUrl` is available, display where the package was originally downloaded from:

```tsx
{metadata.offline && metadata.sourceUrl && (
    <div className="offline-source">
        Originally from: {metadata.sourceUrl}
    </div>
)}
```

**File:** `src/webview/app/App.css`

Add styling (keep it subtle — muted text below the offline banner):

```css
.offline-source {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    padding: 2px 8px 4px;
}
```

### Step 7: Offline Indicator Enhancements

**File:** `src/webview/app/components/PackageDetailsPanel.tsx`

The existing offline indicator banner should be enhanced:
- Current: Generic "offline data — some information may be limited" message
- Enhanced: Show which data came from cache vs which is unavailable
- If `metadata.sourceUrl` is present, mention it

**File:** `src/webview/app/components/BrowseTab.tsx`

When search results contain `offline: true` items, show a subtle indicator:
- Banner at top of search results: "Showing cached packages (offline)"
- Or a small badge on each result row

**File:** `src/webview/sidebar/SidebarApp.tsx`

When browse search falls back to offline, show an indicator above results.

### Step 8: `PackageSearchResult` Type Update

**Files:** `src/services/NuGetTypes.ts` and `src/webview/app/types.ts`

Add `offline?: boolean` to `PackageSearchResult`:

```typescript
export interface PackageSearchResult {
    // ... existing fields
    offline?: boolean;  // Result came from local cache, not network
}
```

Also add the new metadata fields to `PackageMetadata` in both files:

```typescript
export interface PackageMetadata {
    // ... existing fields
    tags?: string;
    releaseNotes?: string;
    copyright?: string;
    repositoryUrl?: string;
    sourceUrl?: string;      // NuGet source this was downloaded from
}
```

---

## Integration & Fallback Strategy

The offline support follows a **graceful degradation** pattern. Each method tries network first, then falls back to local cache. The `failedEndpointCache` (120s TTL) already tracks unreachable sources — offline fallbacks should only engage when sources are actually unreachable, not as a first choice.

### Fallback Order
```
1. In-memory cache (LRU)
2. Workspace cache (persists across panel close)
3. Network (API / CLI)
4. Local global-packages cache (offline fallback)  ← NEW
```

### What NOT to Cache from Offline Results
- **Don't** store offline search results in `searchResultsCache` — they're incomplete
- **Don't** store offline version results in `versionsCache` / `workspaceCache` — only shows locally cached versions
- **DO** store offline metadata in `metadataCache` with `offline: true` (existing behavior, already excluded by `getPackageMetadata`)
- **DO** store locally extracted README in `workspaceCache` — it's the same content as the network version

### Source Health Awareness

The extension already has `failedEndpointCache` and `filterHealthySources()`. Offline fallbacks should use this:

```typescript
// Example: In getPackageVersions(), check if ALL sources are unhealthy
const allSources = await this.getSources();
const healthySources = allSources.filter(s => s.enabled && !this.isSourceFailed(s.url));
if (healthySources.length === 0) {
    // All sources unreachable — use offline fallback immediately instead of timing out
    return this.getOfflineVersions(packageId);
}
```

This avoids the 5-second timeout per source before reaching the offline fallback.

---

## Testing Checklist

### Manual Testing Workflow
1. Build: `npm run package:vsix`
2. Install VSIX in VS Code
3. Open a project with existing packages (so global-packages has data)
4. **Test online behavior unchanged:** All operations should work identically
5. **Simulate offline:** Disconnect network OR add firewall rule blocking nuget.org
6. Test each offline feature:
   - [ ] Installed packages still load (existing — csproj parsing)
   - [ ] Click installed package → metadata loads from offline cache with offline indicator
   - [ ] Version dropdown → shows locally cached versions
   - [ ] README tab → shows locally cached README
   - [ ] Search → shows cached packages matching query with offline indicator
   - [ ] Icon → loads from local cache (data URI) for packages with embedded icons
   - [ ] Source provenance → shows original source URL
7. **Test recovery:** Reconnect network
   - [ ] Fresh search returns network results (not cached offline results)
   - [ ] Version dropdown refreshes with full version list
   - [ ] Metadata loads full data, offline indicator disappears

### Edge Cases
- [ ] Package exists in global-packages but nuspec is missing/corrupt
- [ ] Package directory exists but `.nupkg.metadata` is missing (incomplete extraction)
- [ ] Global-packages folder doesn't exist (clean machine, no prior restore)
- [ ] Very large global-packages cache (1000+ packages) — search should not hang
- [ ] Nuspec `<readme>` or `<icon>` points to non-existent file
- [ ] Nuspec `<readme>` or `<icon>` attempts path traversal (e.g., `../../etc/passwd`) — MUST be blocked
- [ ] Mixed online/offline sources (one source up, one down)
- [ ] Icon file is very large (> 100KB) — consider skipping data URI conversion
- [ ] README file is very large (> 1MB) — consider truncating

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `src/services/NuGetService.ts` | `getOfflineVersions()`, `extractReadmeFromLocalCache()`, `getOfflineIcon()`, `searchOfflinePackages()`, enhanced `getOfflineMetadata()`, integration points in `getPackageVersions()`, `extractReadmeFromPackage()`, `searchPackages()` |
| `src/services/NuGetTypes.ts` | Add `tags?`, `releaseNotes?`, `copyright?`, `repositoryUrl?`, `sourceUrl?` to `PackageMetadata`; add `offline?` to `PackageSearchResult` |
| `src/webview/app/types.ts` | Mirror type additions from `NuGetTypes.ts` |
| `src/webview/app/components/PackageDetailsPanel.tsx` | Enhanced offline banner, source provenance display |
| `src/webview/app/components/BrowseTab.tsx` | Offline search results indicator |
| `src/webview/app/App.css` | `.offline-source` styling |
| `src/webview/sidebar/SidebarApp.tsx` | Offline browse results indicator |

---

## Documentation Updates Required

After implementation, update:

| File | What to update |
|------|---------------|
| `CHANGELOG.md` | `### Added` entry under `## [Unreleased]`: `- **Offline Package Support** — Browse, search, and view metadata for locally cached packages when NuGet sources are unreachable` |
| `ARCHITECTURE.md` | Add "Offline Support" section documenting the fallback chain, global-packages folder structure, and which features work offline |
| `README.md` | Add "Offline Support" section to features list |
| `.github/copilot-instructions.md` | Add gotcha entries for offline caching pitfalls |

---

## Important Gotchas

1. **Don't cache offline results in network caches.** Offline data is incomplete. When network recovers, fresh data must replace it without explicit invalidation.

2. **Path traversal in nuspec.** The `<readme>` and `<icon>` elements contain user-controlled relative paths from the package author. Always validate with `path.resolve()` + `startsWith(packageDir)` before reading.

3. **`readFileAsync` for icon returns Buffer.** When reading binary files (icons), don't pass `'utf8'` encoding — you need the raw Buffer for base64 conversion.

4. **Global-packages folder is lowercase.** Both package IDs and versions are lowercased in the folder structure. Always use `.toLowerCase()` when constructing paths.

5. **`.nupkg.metadata` is the extraction sentinel.** If this file is missing, the version folder may be corrupt/incomplete. Don't trust a version directory without it.

6. **Performance: cap directory scans.** The global-packages folder can contain thousands of packages. Always limit enumeration (e.g., `slice(0, 500)`) and do fast directory-name filtering before reading nuspec files.

7. **`fs.existsSync` is synchronous.** It's acceptable for path existence checks in the offline path (which is inherently filesystem-bound), but don't use it in hot loops of 1000+ iterations. Consider `fs.promises.access()` for truly large scans.

8. **Don't break online behavior.** Offline fallbacks should ONLY engage after network paths fail. The integration must be additive — existing tests, flows, and performance characteristics must not change when sources are reachable.

9. **CSP for data URIs.** The existing CSP already includes `data:` in `img-src`, so base64 icon data URIs work. Don't add new CSP entries.

10. **`fs.promises.readdir` vs promisified `readdir`.** Check which pattern the codebase uses (`util.promisify(fs.readdir)` vs `fs.promises.readdir`) and stay consistent.

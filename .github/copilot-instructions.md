<!-- Workspace-specific instructions for agents working on this project. Keep concise, actionable, and up to date. -->

# Agent Guidelines
- **Use Context7 for Documentation:** Use `resolve-library-id` then `get-library-docs` for React, VS Code Extension API, esbuild, ESLint, TypeScript docs.
- **Use Microsoft Docs MCP for VS Code APIs:** Use `microsoft_docs_search`, `microsoft_code_sample_search`, `microsoft_docs_fetch` for official VS Code extension documentation.

## MANDATORY: VSIX Packaging Verification
After making changes to TypeScript files (especially `NuGetService.ts`, `NuGetPanel.ts`, or `extension.ts`), run `npm run package:vsix` to verify the build succeeds. TypeScript errors (typos, missing properties) will break VSIX packaging even if `npm run watch` succeeds.

## MANDATORY: Documentation Updates
After completing ANY feature, fix, or change, update these files:

| File | Update When |
|------|-------------|
| **CHANGELOG.md** | New features → `### Added`, bug fixes → `### Fixed`, behavior changes → `### Changed` |
| **ARCHITECTURE.md** | New message types, state patterns, services, data flows |
| **README.md** | User-facing feature changes, new settings/commands |
| **copilot-instructions.md** | New gotchas, capabilities, common issues |

# Project Overview
- **Name:** nUIget (VS Code Extension)
- **Purpose:** Visual Studio-style GUI to manage NuGet packages via dotnet CLI. Reads sources/credentials from nuget.config and Windows Credential Manager.
- **Layout:** Split-panel (left: package list; right: details). Tabs: Browse, Installed, Updates.

# Key Capabilities
- **Draggable Split Panel:** Resizable sash between package list (default 35%) and details (65%). Drag to adjust (20-80% range). Position persists across workspaces via `globalState`. Double-click to reset to default. Uses `--vscode-sash-hoverBorder` for VS Code-native theming.
- **React 19.2.4 with Concurrent Features:** `useDeferredValue` for search queries and package lists (non-blocking UI). `useTransition` for tab switching. Stale data indicators with CSS opacity fade (.stale class).
- **HTTP/2 for nuget.org:** Multiplexing for bulk requests (icons, metadata). Session pool limit (MAX_SESSIONS=10) with LRU eviction. Falls back to HTTP/1.1 for private sources.
- **Sources:** Resolve via `dotnet nuget list source --format detailed`. Settings cog (⚙️) for enable/disable/add/remove sources.
- **Authenticated Private Feeds:** CredentialService enables browsing/searching packages from Azure DevOps, GitHub Packages, JFrog, etc. Credentials resolved from: (1) nuget.config `<packageSourceCredentials>`, (2) Windows Credential Manager, (3) Azure Artifacts Credential Provider (non-interactive). Credentials pre-warmed on panel open, cached 30min.
- **Encrypted Credentials:** When adding sources with password on Windows, encrypts via DPAPI by default. DPAPI decrypted via PowerShell. Non-Windows uses clear text. Supports `%ENV_VAR%` syntax for cross-platform security.
- **Package Management:** Search/install/update/remove via dotnet CLI. Multi-project support (.csproj, .fsproj, .vbproj).
- **GUI:** React webview in editor panel. Package icons via flat container API. Verified badge (✓) for reserved prefix packages.
- **Updates Tab:** Shows packages with newer versions. Badge shows count. Respects prerelease checkbox.
- **Bulk Operations:** Select all + Uninstall Selected with topological sort for dependency order.
- **Settings Persistence:** Prerelease checkbox and source dropdown persist via `context.workspaceState`. Split position persists via `context.globalState` (cross-workspace).
- **Multi-Tier Caching:** Backend LRUMap caches (size-limited: metadata 200, versions 200, icons 500, search 100). Frontend LRU caches via useRef. WorkspaceCache for persistence. TTLs: icons ∞, versions 3min, verified 5min, search 2min, README ∞.
- **Floating Versions:** Detects `*`, `10.*`, `[1.0,2.0)` - info-only, cannot update from UI.
- **Transitive Packages:** Collapsible per-framework sections. Two-stage background prefetch (frameworks → metadata).
- **Output Channel:** "nUIget" channel. Sanitizes credentials. `nuiget.noRestore` setting adds `--no-restore` flag to install/update commands.
- **Disposed Panel Safety:** `_disposed` flag + `_postMessage()` helper prevents "Webview is disposed" errors.

# Requirements
- **VS Code:** 1.85.0+
- **.NET SDK:** Installed and on PATH
- **Node.js/NPM:** For build

# Build and Run
```bash
npm install          # Install dependencies
npm run watch        # Build (watch mode)
# Press F5 to launch Extension Host
```

# Test the GUI
**Important:** Open a folder with .csproj files in Extension Host (not the nuiget folder).

- **Command Palette:** "nUIget: Manage NuGet Packages"
- **Context Menu:** Right-click .csproj → "nUIget: Manage Packages"
- **Solution Explorer:** Right-click project node → "nUIget: Manage Packages"

Verify: Browse/search, Install, Installed tab with transitive, Updates tab with badge, Settings persistence.

# Package as VSIX
```bash
npm run package:vsix  # Outputs nuiget.vsix
```

# Gotchas & Pitfalls

## VS Code Extension
| Issue | Solution |
|-------|----------|
| Context menu not showing | Use regex: `resourceFilename =~ /\\.(csproj\|fsproj\|vbproj)$/` not `resourceExtname ==` |
| Watch task hangs preLaunchTask | Use esbuild problemMatcher with `endsPattern: "^\\[watch\\] build finished"` |
| preLaunchTask fails | Use explicit task label ("watch") not "${defaultBuildTask}" |

## React/Webview
| Issue | Solution |
|-------|----------|
| "process is not defined" | Add esbuild define for `process.env.NODE_ENV` |
| React 19 StrictMode double-render | Expected behavior - verifies cleanup functions work correctly |
| Stale data during deferred updates | Use `isXxxStale = value !== deferredValue` to add `.stale` class for visual feedback |
| Package icons not loading | CSP needs `img-src https://api.nuget.org https://*.nuget.org data:;` |
| Icons not showing | Use flat container `/v3-flatcontainer/{id}/{version}/icon` not registration API iconUrl |
| README images not loading | CSP includes: `github.com`, `githubusercontent.com`, `shields.io`, `opencollective.com`, `codecov.io`, `badge.fury.io`, `travis-ci.*`, `appveyor.com`, `coveralls.io`, `snyk.io`, `codacy.com`, `sonarcloud.io`, `badgen.net`, `circleci.com`, `azure/visualstudio` |
| Code blocks not highlighted | Use `marked-highlight` + `highlight.js/lib/core` with individual language imports + `ignoreIllegals: true` |
| XSS in README content | Wrap `marked.parse()` output in `DOMPurify.sanitize()` before `dangerouslySetInnerHTML` |
| Language labels on code blocks | Use custom `marked.Renderer` to wrap `<pre>` in `<div data-language="...">` wrapper |
| Colors not adapting to theme | Use `--vscode-*` CSS variables, not hardcoded hex colors. Light themes need `body.vscode-light` overrides. |

## State Management
| Issue | Solution |
|-------|----------|
| Settings reset on panel close | Use `context.workspaceState` via messages, not just `vscode.getState/setState` |
| Source dropdown resets | Use `settingsLoadedRef` flag to prevent defaults overwriting loaded settings |
| Details panel shows wrong package | Clear both `selectedPackage` AND `selectedTransitivePackage` - they're mutually exclusive |
| Version dropdown shows "Loading" on re-click | Use `useRef<Map>` frontend cache. Check cache before fetching. |

## NuGet/dotnet CLI
| Issue | Solution |
|-------|----------|
| `dotnet list package` fails (NU1900) | Parse .csproj directly as primary method |
| `--source ""` error | Filter empty strings: `sources?.filter(s => s && s.trim())` |
| "Request path contains unescaped characters" | Skip local sources with `isLocalSource()` check |
| Metadata fails on private source | Check VPN connection |
| README not showing | Extract from nupkg using adm-zip (custom sources don't expose ReadmeUriTemplate) |
| Floating version metadata fails | Use `pkg.resolvedVersion` for API calls, not `pkg.version` (e.g., "10.*" vs "10.2.0") |
| Transitive packages not available | `project.assets.json` (in obj/) is generated by build/restore - use `restoreProject()` if missing |
| Transitive stale after `dotnet remove` | `dotnet remove package` does NOT update `project.assets.json` - must run `dotnet restore` after remove |
| Transitive stale / need refresh | Use the ↻ refresh button in transitive section (runs restore + reload, ignores noRestore setting) |

## Code Patterns
| Issue | Solution |
|-------|----------|
| "Maximum call stack size exceeded" | Helper methods must call actual API, not themselves (e.g., `_postMessage()` → `this._panel.webview.postMessage()`) |
| "Webview is disposed" error | Check `_disposed` flag before posting messages in async callbacks |
| Array mutation bugs | Use `[...array].sort()` not `array.sort()` in cache keys |
| fetchJson masking errors | Check for `null` and throw explicitly if you need to detect failures |
| Property name typos break VSIX | Use `outputChannel` not `_outputChannel`. Run `npm run package:vsix` to catch TypeScript errors that `watch` doesn't surface. |
| Package selection duplication | Use `usePackageSelection` hook: `selectDirectPackage(pkg, { selectedVersionValue, metadataVersion, initialVersions })` |
| Floating version in Installed tab | Pass `metadataVersion: pkg.resolvedVersion \|\| pkg.version` to handle "10.*" → "10.2.0" |
| Updates tab synthetic package | Create `{ id: pkg.id, version: pkg.installedVersion } as InstalledPackage` before calling `selectDirectPackage` |

## Performance Patterns
| Pattern | Implementation |
|---------|----------------|
| Async file I/O | Use `fileExists()` helper with `fs.promises.access`, never `fs.existsSync` |
| Concurrency limiting | Use `batchedPromiseAll(items, processor, 8)` for parallel API calls |
| Frontend LRU cache | Use `useRef<LRUMap<K,V>>(new LRUMap(maxSize))` for React caches |
| Backend LRU cache | Use `LRUMap<K,V>(maxSize)` class in NuGetService for all in-memory caches |
| HTTP/2 session pool | MAX_SESSIONS=10 with LRU eviction in Http2Client |
| List virtualization | Import `useVirtualizer` from `@tanstack/react-virtual` for large lists |
| Race for first result | Use `raceForFirstResult()` to resolve early when first source returns data |

## Security Patterns
| Pattern | Implementation |
|---------|----------------|
| Package ID validation | Use `isValidPackageId(id)` before dotnet CLI commands |
| Version validation | Use `isValidVersion(ver)` before dotnet CLI commands |
| Source name validation | Use `isValidSourceName(name)` before dotnet nuget source commands |
| Source URL validation | Use `isValidSourceUrl(url)` before dotnet nuget add source |
| Base64 validation | Use `isValidBase64(str)` before DPAPI PowerShell decryption |
| Credential redaction | Use `sanitizeForLogging(text)` before logging any text that might contain secrets |
| XSS prevention | Use `DOMPurify.sanitize()` before `dangerouslySetInnerHTML` |

# VSIX Optimization
Add to .vscodeignore: `node_modules/**`, `.github/prompts/**`, `src/**`
Reduces VSIX from ~1.4 MB to ~73 KB.

# Debugging Workflow
When investigating bugs that are hard to reproduce or understand:
1. **Add temporary debug logs** with a distinctive prefix (e.g., `[DEBUG-XYZ]`) using `console.log()`
2. **Keep logs focused** - log key state values, conditions, and control flow decisions
3. **Test with DevTools open** - In webview: Ctrl+Shift+P → "Developer: Open Webview Developer Tools" → Console tab
4. **Once bug is confirmed fixed, remove all debug logs** - search for the prefix and delete
5. **Never commit debug logs** - they clutter output and leak implementation details

# Maintenance Checklist
- [x] Dependencies installed and compiled
- [x] Watch build running
- [x] Extension Host launched (F5)
- [x] GUI verified (all tabs, context menus)
- [x] Core flows exercised (search, install, update, remove)
- [x] VSIX packaging optimized

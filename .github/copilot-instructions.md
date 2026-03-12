<!-- Workspace-specific instructions for agents working on this project. Keep concise, actionable, and up to date. -->
<!-- For full technical documentation, see ARCHITECTURE.md -->

# Agent Guidelines
- **Use Context7 for Documentation:** Use `resolve-library-id` then `get-library-docs` for React, VS Code Extension API, esbuild, ESLint, TypeScript docs.
- **Use Microsoft Docs MCP for VS Code APIs:** Use `microsoft_docs_search`, `microsoft_code_sample_search`, `microsoft_docs_fetch` for official VS Code extension documentation.

## MANDATORY: Read ARCHITECTURE.md Before Making Changes
**ARCHITECTURE.md is the single source of truth** for all technical details: component hierarchy, message protocol, state management patterns, caching strategies, auth flow, security, performance patterns, and sidebar architecture. This file (copilot-instructions.md) only contains agent rules, build commands, and gotchas/pitfalls — it does NOT duplicate architecture details.

**Before** modifying any TypeScript, React, or CSS file, read the relevant section(s) of ARCHITECTURE.md to understand:
- How components communicate (message types, forwardRef routing, cross-panel sync)
- State ownership (what lives in App.tsx vs tab components vs sidebar)
- Caching layers (backend LRUMap, frontend useRef<LRUMap>, WorkspaceCache)
- Performance patterns (batchedPromiseAll, failedEndpointCache, HTTP/2 session pool)
- Security constraints (input validation, credential redaction, CSP)

Failing to consult ARCHITECTURE.md risks re-introducing bugs, duplicating logic, or breaking established patterns.

## MANDATORY: VSIX Packaging Verification
After making changes to TypeScript files (especially `NuGetService.ts`, `NuGetPanel.ts`, or `extension.ts`), run `npm run package:vsix` to verify the build succeeds. TypeScript errors (typos, missing properties) will break VSIX packaging even if `npm run watch` succeeds.

## MANDATORY: Documentation Updates
After completing ANY feature, fix, or change, update these files:

| File | Update When |
|------|-------------|
| **CHANGELOG.md** | New features → `### Added`, bug fixes → `### Fixed`, behavior changes → `### Changed` |
| **ARCHITECTURE.md** | New message types, state patterns, services, data flows, capabilities |
| **README.md** | User-facing feature changes, new settings/commands |
| **copilot-instructions.md** | New gotchas or common issues |

### CHANGELOG.md Rules
- Always add entries under an `## [Unreleased]` section at the top of the changelog (below the header). If the section already exists, append to it.
- For `### Added` entries: write the **bold headline** followed by a brief description (e.g., `- **New Feature** — Short explanation of what it does`).
- For `### Fixed` and `### Changed` entries: only write the **bold headline** per bullet (e.g., `- **Some Fix**`). Do NOT add descriptions, explanations, or details after the headline.
- Never edit or modify content under previously released version sections — only the `## [Unreleased]` section may be changed.

### ARCHITECTURE.md vs copilot-instructions.md — What Goes Where
These two files serve different purposes. **Never duplicate content between them.**

| | **ARCHITECTURE.md** | **copilot-instructions.md** |
|---|---|---|
| **Purpose** | Describes *how the system works* (descriptive) | Tells agents *how to work on it* (prescriptive) |
| **Audience** | Any developer needing to understand the codebase | AI agents making changes |
| **Content** | Component architecture, message protocol tables, state management patterns, caching strategies, auth flow, security model, performance patterns, data flows, code examples | Agent rules, mandatory checks, build/test commands, gotchas & pitfalls (issue→solution tables) |
| **Add here when** | New component, message type, state pattern, service, cache layer, API integration, data flow, or architectural decision | New bug trap, footgun, or "don't do X" rule discovered during development |
| **Style** | Explanatory sections with diagrams/code blocks | Terse tables and bullet points |
| **Example** | "The sidebar uses `parseSearchQuery()` returning `{ mode, filterText }` to drive all rendering..." | "Browse section removed — No Browse `SectionHeader` exists. Don't re-add." |

**Rule of thumb:** If it explains *what* or *how* the system works → ARCHITECTURE.md. If it warns about a mistake or prescribes a workflow → copilot-instructions.md.

## Build and Run
```bash
npm install          # Install dependencies
npm run watch        # Build (watch mode) — F5 to launch Extension Host
npm run package:vsix # Outputs nuiget.vsix
```
**Test:** Open a folder with .csproj files in Extension Host (not nuiget folder). Command Palette → "nUIget: Manage NuGet Packages" or right-click .csproj.

# Gotchas & Pitfalls

## Known Issues
| Issue | Status |
|-------|--------|
| No known `npm audit` vulnerabilities | All 5 previously tracked vulnerabilities (ajv, minimatch, underscore, dompurify, fast-xml-parser) resolved via `npm audit fix`. **Re-run `npm audit` periodically to check for regressions.** |

## VS Code Extension
| Issue | Solution |
|-------|----------|
| Context menu not showing | Use regex: `resourceFilename =~ /\\.(csproj\|fsproj\|vbproj)$/` |
| Watch task hangs preLaunchTask | Compound `watch` task uses `dependsOn` with `npm: watch:esbuild` + `npm: watch:tsc`. esbuild plugin emits `[watch] build started`/`[watch] build finished`. tsc uses `$tsc-watch` matcher. |
| preLaunchTask fails | Use explicit task label ("watch") not "${defaultBuildTask}" |

## React 19 / Webview
| Issue | Solution |
|-------|----------|
| "process is not defined" | Add esbuild define for `process.env.NODE_ENV` |
| StrictMode double-render | Expected behavior — verifies cleanup functions |
| **setState updater side effects** | **Never** call `postMessage()` or side effects inside `setState(prev => {...})` — StrictMode runs updaters twice. Use flag variable inside, call side effect outside. |
| **Async setState variable assignment** | **CRITICAL:** Never assign `let x` inside `setState(prev => {...})` and read after — React 19 runs updaters async, `x` stays initial. Use `useRef` mirror pattern (see `transitiveLoadingMetadataRef`). |
| Stale closures in `useCallback([])` | App.tsx uses `useCallback(fn, [])` with individual `useRef` mirrors (`selectedProjectRef`, `selectedSourceRef`, `activeTabRef`, etc.) synced via `useEffect`. SidebarApp.tsx uses the `handleMessageRef` pattern: regular function assigned to `ref.current` each render, one `useEffect([])` listener calls `ref.current(e)`. |
| Inline callbacks defeat React.memo | Extract callbacks to `useCallback([])` (e.g., `handleSashReset`, `handleSashDragEnd`, `handleToggleDep`). Inline arrows create new refs every render. |
| Icons not loading | CSP: `img-src https://api.nuget.org https://*.nuget.org data:;`. Use flat container API, not registration iconUrl. |
| README images not loading | CSP includes: `github.com`, `githubusercontent.com`, `shields.io`, `opencollective.com`, `codecov.io`, `badge.fury.io`, `travis-ci.*`, `appveyor.com`, `coveralls.io`, `snyk.io`, `codacy.com`, `sonarcloud.io`, `badgen.net`, `circleci.com`, `azure/visualstudio` |
| Code blocks not highlighted | `marked-highlight` + `highlight.js/lib/core` with individual languages + `ignoreIllegals: true`. All config in `markdownSetup.ts`. |
| XSS in README | `renderMarkdownToHtml()` in `markdownSetup.ts` handles `DOMPurify.sanitize()` + `marked.parse()` + `upgradeHttpToHttps()`. Never call these separately in components. |
| Colors not adapting | Use `--vscode-*` CSS variables. Light themes need `body.vscode-light` overrides. |

## State Management
| Issue | Solution |
|-------|----------|
| Settings reset on panel close | Use `context.workspaceState` via messages, not just `vscode.getState/setState` |
| Source dropdown resets | Use `settingsLoadedRef` flag to prevent defaults overwriting loaded settings |
| Details panel shows wrong package | Clear both `selectedPackage` AND `selectedTransitivePackage` — mutually exclusive |
| Stale packages on project switch | `selectedProject` effect must `setInstalledPackages([])` before fetching. Without it, stale data triggers `checkPackageUpdates` for the wrong project. |
| Version dropdown "Loading" on re-click | `useRef<LRUMap>` frontend cache. Check cache before fetching. |
| installedPackages cascading renders | Content comparison in setter: compare `id@version` joined keys, return `prev` if unchanged |
| Source removal stale closure | `handleMessage` is `useCallback([])` — `sources` state is stale. Backend sends `removedSourceUrl`, frontend compares via `selectedSourceRef.current`. |
| **Transitive metadata ref mirror** | Use `transitiveLoadingMetadataRef = useRef<Set>()` as synchronous mirror. Read ref in prefetch effect, update both ref and state. Required because React 19 defers setState updaters. |
| Transitive spinner stuck | `doResetTransitiveState(false)` must set `loadingTransitive = false` — prevents stuck spinner when reset races with in-flight request. |
| Transitive stale after bulk remove | `bulkRemoveResult` handler must call `resetTransitiveState(true)` after routing. |
| Transitive hidden in all-projects installed | Transitive packages sections are hidden when `loadAllProjectsInstalled` is true for performance. Don't render transitive sections in all-projects installed mode. |
| Multi-project updates not refreshing | `bulkUpdateAllProjectsResult` handler must re-fetch via `checkAllProjectsUpdates` after forwarding to UpdatesTab. |
| Multi Install data isolation | `multiInstallProjectData` is a **separate state** from `allProjectsInstalled` — not cleared on tab switch. `allProjectsInstalled` is for the Installed tab; `multiInstallProjectData` is for the Browse tab Multi Install dropdown. Backend echoes `context` field in `allProjectsInstalled` response to route correctly. After `bulkInstallResult`, optimistic update + re-fetch via `context: 'multiInstall'`. Multi Install button only visible when `!isInstalled` (package not installed in current project) — avoids scope confusion with single-project Uninstall. |
| Cross-panel sync echo loop | Use `skipSaveRef`/`skipSourceSaveRef`/`skipProjectSaveRef` refs in App.tsx. Set `true` before setState, save effect checks and resets. |
| `skipNextUpdateCheckRef` skips update re-check | After an operation with known outcome, set `skipNextUpdateCheckRef.current = true` before requesting `getInstalledPackages`. The `[installedPackages]` effect checks and resets the flag, skipping the redundant `checkPackageUpdates`. The `selectedProject` effect resets the flag to `false` — without this, a lingering flag would skip the else-if branch that clears stale updates after project switch. |
| `notifySidebarOfChange` vs `refreshSidebar` | `notifySidebarOfChange(operation)` is the lightweight post-operation path — skips `clearNuGetHttpCache()` and source re-fetch, sends `packageChanged` message for surgical UI updates. `refreshSidebar()` is for manual refresh button and file watcher only. Don't swap them. |
| `onPackageChanged` only on success | Single-op handlers (`installPackage`, `updatePackage`, `removePackage`) must only call `NuGetPanel.onPackageChanged?.()` when the operation succeeded. The `success` variable is hoisted outside `withProgress` (e.g. `let installSuccess = false;`). Without this guard, a failed operation still triggers sidebar optimistic updates that remove the package from the updates list. `bulkInstall` must check `results.some(r => r.success)`. |
| Sidebar result `message.success` check | Sidebar's `installResult`/`updateResult`/`removeResult` handler must check `message.success` before optimistically filtering packages from update lists. Without this, a failed sidebar operation incorrectly removes the package from the sidebar's updates/badge. |
| Sidebar `_notifyMainPanel` only on success | `NuGetSidebarProvider._notifyMainPanel()` must only be called after successful operations. For single ops, guard with `if (success)`. For `bulkUpdatePackages`, guard with `failedPackageIds.length < packages.length`. For `bulkUpdateAllProjects`, guard with `totalFailed < totalPackages`. Without this, a failed sidebar operation triggers an unnecessary full main panel refresh. |
| Bulk result `failedPackageIds` scoping | `failedPackageIds` / `perProjectFailedIds` must be declared OUTSIDE the `withProgress` callback — the `_postMessage` call referencing them is after the callback closes. Declaring inside causes `ReferenceError` at runtime. |
| Bulk result enriched payloads | All bulk result messages (`bulkUpdateResult`, `bulkRemoveResult`, `bulkUpdateAllProjectsResult`, `bulkRemoveAllProjectsResult`) include per-package failure data. New bulk operations must follow this pattern for optimistic UI updates. |
| `refreshDebounceRef` in App.tsx | The `refresh` handler uses 300ms debounce to collapse rapid refresh messages from sidebar operations. Don't remove — without it, 3 quick sidebar ops trigger 3 full main panel reloads. |
| SourceSettingsOverlay state ownership | Source settings form state (`addSourceUrl`, `addSourceName`, `addingSource`, `confirmRemoveSource`, etc.) lives INSIDE `SourceSettingsOverlay.tsx`, NOT in App.tsx. App.tsx forwards `addSourceResult` via `sourceSettingsRef.current?.handleAddSourceResult()`. Don't re-add these state vars to App.tsx. |

## Sidebar
| Issue | Solution |
|-------|----------|
| Activity Bar badge removed | `setBadge()` is a no-op — don't set `webviewView.badge`. Section header badges provide update counts. `_pendingBadgeCount` field removed. |
| Search mode model | All sidebar rendering is driven by `parseSearchQuery(query)` → `{ mode: 'default' \| 'browse' \| 'installed' \| 'updates', filterText }`. Never check `installedExpanded`/`updatesExpanded` outside default mode. |
| Browse section removed | No Browse `SectionHeader` exists. Browse results render directly when `searchMode === 'browse'` (plain text + Enter). |
| Recent searches removed | No state, effects, handlers, CSS, or backend cases (`getRecentSearches`, `clearRecentSearches`, `_addRecentSearch`) exist. Don't re-add. |
| @-prefix dropdown | Shows when text starts with `@` but isn't yet a complete valid prefix. Auto-filters as typed (`@up` → only `@updates`). Keyboard: ArrowDown/Up navigate, Enter/Tab select, Escape dismiss. |
| Client-side filtering | `@installed`/`@updates` filter client-side (live, no Enter). Browse mode uses 300ms debounce (min 2 chars) — Enter bypasses debounce for immediate search. `browseDebounceRef` holds the timer. Stale results discarded via backend `_latestSearchQuery` guard. |
| `searchModeRef` for handlers | `searchMode` is derived via `useMemo`, so stale in `useCallback([])`. Use `searchModeRef.current` in handlers. Same pattern as `selectedProjectRef`, `selectedSourceRef`. |
| Codicon font not in webviews | Codicon font is NOT available in webview HTML. Use `icons.tsx` SVG components (e.g., `<ChevronRightIcon size={14} />`). Never use emoji characters — they render inconsistently cross-platform. Both main panel and sidebar import from the same `icons.tsx` module. Never define inline SVGs in sidebar components. |
| `$(codicon)` syntax not in webviews | VS Code `$(name)` codicon syntax does NOT render in webview HTML — it displays as literal text. Use SVG icon components or plain English descriptions instead. |
| Icon visibility: use color, not opacity | Use `color: var(--vscode-descriptionForeground)` (muted) and `color: var(--vscode-foreground)` (hover/active) instead of `opacity`. Opacity compounds when both parent and SVG child have it (0.7 × 0.7 = 0.49 effective). |
| Section chevrons | SVG `chevron-right` icon with CSS `.section-chevron.expanded { transform: rotate(90deg) }` and `transition: 0.1s`. Not Unicode characters. |
| Search wrapper pattern | Search input is wrapped in `.sidebar-search-wrapper` (flex container with border). Input itself is transparent/borderless. Clear button is a sibling inside the wrapper. `focus-within` on wrapper provides focus ring. |
| Pending data for first open | `_pendingProjectUpdates` and `_pendingInstalledCount` are cached before sidebar resolves. `_sendInitialData()` delivers then clears them. Don't remove this caching. |
| Context menu `label.includes()` substring trap | `'Update to 8.0.5'.includes('Update to ')` is true, but so is `'Update to Version...'.includes('Update to ')`. Guard with `&& !label.includes('Update to Version')` to distinguish direct update from version picker. |
| `.csproj` file watcher must forceRefresh webview | The debounced `.csproj` watcher must both send `forceRefresh` to the webview (to clear stale state) AND call `checkUpdatesInBackground(true)` with force AND call `_notifyMainPanel()`. Just calling the background check is insufficient — the webview still shows old data, and omitting the main panel notification means external changes (e.g. `git checkout .`) won't refresh the main panel. |
| File watcher debounce cleanup on disposal | `dispose()` must clear both `_backgroundCheckTimer` (interval) and `_fileWatcherDebounce` (timeout). Without this, debounced callbacks fire after the provider is disposed, causing stale reference errors. |
| `handleUpdateAll` data source mismatch | Badge count uses 3-tier fallback (`allProjectsUpdates` sum → `packageUpdates.length` → single-project lookup). But `handleUpdateAll` in single-project mode only reads `packageUpdatesRef`. Must fallback to `allProjectsUpdatesRef.current.find(...)` when `packageUpdatesRef` is empty. |
| `totalUpdateCount` 3-tier fallback | Tier 1: sum of all `allProjectsUpdates[].updates.length`. Tier 2: `packageUpdates.length`. Tier 3: `allProjectsUpdates.find(selected project)?.updates.length`. Any code consuming the badge count must handle that the data may come from any tier. |
| `loadAllProjects` not reset on project change | `projectChanged` handler must `setLoadAllProjects(false)` and `setLoadAllProjectsInstalled(false)`. Without this, toggling "all projects" in one project stays visually toggled after switching to another. |
| `section-content` no hardcoded max-height | Uses `flex: 1; min-height: 0;` to fill available space. Don't add `max-height` — it causes premature scroll when the sidebar has plenty of vertical room. |
| Sections independently collapsible | Both Installed and Updates sections can be open simultaneously with a `MemoizedDraggableSash` (orientation="vertical") between them. `sectionSplit` state (default 50) controls the percentage split (20-80 clamped). Sash only renders when both sections are expanded. Double-click resets to 50/50. |
| Floating version context menu | `showContextMenu` message includes `versionType`. `_showContextMenu` skips "Update to X" for floating/range. Backend already filters floating from update checks — this is defense-in-depth for the context menu. |
| `versionsCache` has no TTL | In-memory LRU cache never expires. `clearSourceErrors()` now calls `clearVersionsCache()` which clears both `versionsCache` and `workspaceCache` version entries. Without this, refresh doesn't pick up newly published versions. |
| dotnet NuGet HTTP cache stale | Refresh buttons do NOT clear the HTTP cache (too slow at 0–15s). Use Command Palette → `nUIget: Clear NuGet HTTP Cache` (`nuiget.clearHttpCache`) to explicitly clear it. `clearSourceErrors()` already re-validates sources via `startSourceHealthMonitor()`. |

## NuGet / dotnet CLI
| Issue | Solution |
|-------|----------|
| `dotnet list package` fails (NU1900) | Parse .csproj directly as primary method |
| `--source ""` error | Filter: `sources?.filter(s => s && s.trim())` |
| "Unescaped characters" in request path | Skip local sources with `isLocalSource()` |
| README not showing | Extract from nupkg via adm-zip (custom sources lack ReadmeUriTemplate) |
| Floating version metadata fails | Use `pkg.resolvedVersion` not `pkg.version` for API calls |
| Version spec guard for lock file | Only `floating` and `range` version types use lock file `resolvedVersion`. Standard versions (e.g., `10.0.2`) read directly from .csproj. Guard: `versionSpec.type === 'floating' \|\| versionSpec.type === 'range'`. |
| Transitive not available | `project.assets.json` needs build/restore — use `restoreProject()` if missing |
| Transitive stale after remove | `dotnet remove` doesn't update assets.json — run `dotnet restore` after |
| Unreachable custom source blocks loading | `failedEndpointCache` caches failures for 120s (2 min). Background source health monitor (`startSourceHealthMonitor()`) validates all sources at startup and self-schedules re-checks (120s on failures, 5min when healthy). `searchPackages` uses `filterHealthySources()` to skip unreachable sources — no blocking pre-validation in the search path. `clearSourceErrors()` clears all caches and triggers immediate re-validation. Source mutations (add/remove/enable/disable) also trigger re-validation. |
| Registration API returns null/garbled | Gzip-compressed endpoint selected by mistake. Filter by `!resource['@id']?.includes('-gz-')` in `discoverServiceEndpoints`. HTTP/2 client has no gzip decompression. |
| Package details missing published/deps | Registration endpoint resolving to `registration5-gz-semver2/` (gzip). Must use `registration5-semver1/` (plain JSON). |
| .NET 10 noun-first syntax | SDK 10+ uses `dotnet package add/remove/list --project`. SDK ≤9 uses `dotnet add/remove/list <proj> package`. Per-project detection via `getSdkMajorVersion()` + `useNounFirstSyntax()`. Cache: `_sdkVersionCache` (per-directory). Invalidated by `global.json` watcher. Falls back to SDK 9 (old syntax). |
| `logBulkOperationHeader` double-formatting | When `packageCount = 0`, the method uses `operationType` as the full header string. Callers passing pre-formatted strings (all-projects bulk ops) must pass `packageCount = 0` and include trailing `...` in `operationType`. Don't pass a formatted message AND a non-zero count — it appends `${count} packages...` again. |
| `dotnet package search` always noun-first | Introduced in .NET 8.0.2xx SDK as a new command — always noun-first, no old equivalent. No SDK detection needed. |
| `execWithTimeout` maxBuffer | Set to 10 MB. Default Node.js `exec` buffer is 1 MB — large `dotnet list package` output exceeds it. Don't reduce below 10 MB. |
| Vulnerability data 1h TTL | `vulnerabilityData` Map + `vulnerabilityDataTimestamp`. `clearSourceErrors()` clears it. `fetchVulnerabilityData()` skips re-fetch within TTL. Don't cache offline metadata — prefer fresh data when sources recover. |
| Offline metadata not cached | `getOfflineMetadata()` results (with `offline: true`) are NOT stored in `metadataCache`. This ensures fresh API data replaces offline data once sources recover. |
| `_globalPackagesFolder` cached once | Resolved via `dotnet nuget locals global-packages --list`, falls back to `~/.nuget/packages`. Cached for extension lifetime — acceptable since the path rarely changes. |

## Code Patterns
| Issue | Solution |
|-------|----------|
| "Maximum call stack size exceeded" | `_postMessage()` must call `this._panel.webview.postMessage()`, not itself |
| "Webview is disposed" error | Check `_disposed` flag before posting in async callbacks |
| Array mutation bugs | `[...array].sort()` / `[...array].reverse()` not `array.sort()` / `array.reverse()` |
| Property name typos break VSIX | Run `npm run package:vsix` — catches errors `watch` misses |
| Module extraction locations | Validators (`isValidPackageId`, etc.) are in `NuGetUtils.ts`. Types (`NuGetSource`, `Project`, etc.) are in `NuGetTypes.ts`. `NuGetConfigParser` re-exports `NuGetSource` from `NuGetTypes`. Markdown rendering is in `markdownSetup.ts`. Shared operation functions (`executeSingleOperation`, `executeBulkInstall`, etc.) are in `NuGetOperations.ts` with `OperationContext` interface. `topologicalSortByDependency` is in `NuGetUtils.ts`. |
| `fetchJsonHttp1` redirect safety | Has `maxRedirects = 5` default — never remove. Without it, a redirect loop causes unbounded recursion → stack overflow. |
| `fetchJsonHttp1` truncated response | `resolved` flag guards `res.on('end')` after `req.destroy()` for MAX_RESPONSE_SIZE. Don't remove — `end` fires after destroy and `JSON.parse` throws on truncated data. Same pattern exists in `fetchJsonHttp1WithDetails`. |
| HTTP/2 session pool stale cleanup | Before LRU-evicting, loop `sessionOrder` and remove entries whose session is `closed` or `destroyed`. Without this, stale map entries from error/timeout handlers count toward `MAX_SESSIONS` but are unusable, preventing new connections. |
| Concurrent mutating operations | `_operationInProgress` boolean in both `NuGetPanel` and `NuGetSidebarProvider`. Panel guards 8 cases: `installPackage`, `updatePackage`, `removePackage`, `bulkInstall`, `bulkUpdatePackages`, `bulkUpdateAllProjects`, `confirmBulkRemove`, `confirmBulkRemoveAllProjects`. Sidebar guards 5 cases: `installPackage`, `updatePackage`, `removePackage`, `bulkUpdatePackages`, `bulkUpdateAllProjects`. Each uses `if (this._operationInProgress) { break; }` + try/finally. |
| Sidebar `_forceCheckPending` | When `checkUpdatesInBackground(force=true)` is called during an in-flight check, `_forceCheckPending` queues a re-run in `finally`. Don't bypass — prevents dropped `.csproj` change events. |
| Package selection | Use `usePackageSelection` hook. Installed: `metadataVersion: pkg.resolvedVersion`. Updates: synthetic `InstalledPackage`. |
| Bulk operation notification spam | `updatePackage()` and `removePackage()` have `skipNotification` option. All bulk callers (`bulkUpdatePackages`, `bulkUpdateAllProjects`, `confirmBulkRemove`) must pass `{ skipNotification: true }` — the bulk loop's summary notification handles reporting. |
| Bulk operation per-package restore | `installPackage()`, `updatePackage()` and `removePackage()` have `skipRestore` option. All bulk callers must pass `{ skipRestore: true }` and call `restoreProject()` once after the loop. `dotnet add package` does implicit restore — `--no-restore` suppresses it. `dotnet remove package` does not restore — explicit call needed. |
| Multi-project bulk op ordering | `bulkUpdateAllProjects` and `confirmBulkRemoveAllProjects` topologically sort projects by `<ProjectReference>` dependency order using `getProjectDependencyMap()`. Updates: dependencies first. Removals: dependents first. All restores deferred to a final phase after all updates/removals complete. Don't restore per-project mid-loop — causes C# Dev Kit "unable to restore" errors. |
| InstalledTab refresh button removed | Use header-level `handleFullRefresh` + `fullRefresh` message instead. Don't re-add per-tab refresh buttons. |
| Multi-project bulk op ordering (bulkInstall) | `bulkInstall` also topologically sorts projects — dependencies first. Same pattern as `bulkUpdateAllProjects`. |
| Bulk operation early exit must send response | Every `break` early exit in bulk operations MUST send a result message (even empty) to the webview. Without it, the UI stays in permanent loading state. |
| `browseDetailsPanelContent` useMemo | BrowseTab's details panel JSX is memoized via `useMemo` in App.tsx. InstalledTab and UpdatesTab render their own `MemoizedPackageDetailsPanel` internally. |
| `assetsJsonCache` max entries | Capped at `MAX_ASSETS_CACHE_ENTRIES = 5` with TTL sweep. Don't remove the cap — concurrent flows can grow the cache unbounded within TTL. |

# Debugging Workflow
1. Add temporary `console.log()` with distinctive prefix (e.g., `[DEBUG-XYZ]`)
2. Webview logs: Ctrl+Shift+P → "Developer: Open Webview Developer Tools" → Console
3. **Remove all debug logs** after fix confirmed — search for prefix and delete

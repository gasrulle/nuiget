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

## VS Code Extension
| Issue | Solution |
|-------|----------|
| Context menu not showing | Use regex: `resourceFilename =~ /\\.(csproj\|fsproj\|vbproj)$/` |
| Watch task hangs preLaunchTask | Use esbuild problemMatcher with `endsPattern: "^\\[watch\\] build finished"` |
| preLaunchTask fails | Use explicit task label ("watch") not "${defaultBuildTask}" |

## React 19 / Webview
| Issue | Solution |
|-------|----------|
| "process is not defined" | Add esbuild define for `process.env.NODE_ENV` |
| StrictMode double-render | Expected behavior — verifies cleanup functions |
| **setState updater side effects** | **Never** call `postMessage()` or side effects inside `setState(prev => {...})` — StrictMode runs updaters twice. Use flag variable inside, call side effect outside. |
| **Async setState variable assignment** | **CRITICAL:** Never assign `let x` inside `setState(prev => {...})` and read after — React 19 runs updaters async, `x` stays initial. Use `useRef` mirror pattern (see `transitiveLoadingMetadataRef`). |
| Stale closures in `useCallback([])` | Use `handleMessageRef` pattern: regular function assigned to `ref.current` each render, one `useEffect([])` listener calls `ref.current(e)`. For state needed in handlers that can't re-register, use `useRef` mirrors (e.g., `selectedSourceRef`, `selectedProjectRef`). |
| Inline callbacks defeat React.memo | Extract callbacks to `useCallback([])` (e.g., `handleSashReset`, `handleSashDragEnd`, `handleToggleDep`). Inline arrows create new refs every render. |
| Icons not loading | CSP: `img-src https://api.nuget.org https://*.nuget.org data:;`. Use flat container API, not registration iconUrl. |
| README images not loading | CSP includes: `github.com`, `githubusercontent.com`, `shields.io`, `opencollective.com`, `codecov.io`, `badge.fury.io`, `travis-ci.*`, `appveyor.com`, `coveralls.io`, `snyk.io`, `codacy.com`, `sonarcloud.io`, `badgen.net`, `circleci.com`, `azure/visualstudio` |
| Code blocks not highlighted | `marked-highlight` + `highlight.js/lib/core` with individual languages + `ignoreIllegals: true` |
| XSS in README | `DOMPurify.sanitize()` before `dangerouslySetInnerHTML` |
| Colors not adapting | Use `--vscode-*` CSS variables. Light themes need `body.vscode-light` overrides. |

## State Management
| Issue | Solution |
|-------|----------|
| Settings reset on panel close | Use `context.workspaceState` via messages, not just `vscode.getState/setState` |
| Source dropdown resets | Use `settingsLoadedRef` flag to prevent defaults overwriting loaded settings |
| Details panel shows wrong package | Clear both `selectedPackage` AND `selectedTransitivePackage` — mutually exclusive |
| Version dropdown "Loading" on re-click | `useRef<LRUMap>` frontend cache. Check cache before fetching. |
| installedPackages cascading renders | Content comparison in setter: compare `id@version` joined keys, return `prev` if unchanged |
| Source removal stale closure | `handleMessage` is `useCallback([])` — `sources` state is stale. Backend sends `removedSourceUrl`, frontend compares via `selectedSourceRef.current`. |
| **Transitive metadata ref mirror** | Use `transitiveLoadingMetadataRef = useRef<Set>()` as synchronous mirror. Read ref in prefetch effect, update both ref and state. Required because React 19 defers setState updaters. |
| Transitive spinner stuck | `doResetTransitiveState(false)` must set `loadingTransitive = false` — prevents stuck spinner when reset races with in-flight request. |
| Transitive stale after bulk remove | `bulkRemoveResult` handler must call `resetTransitiveState(true)` after routing. |
| Multi-project updates not refreshing | `bulkUpdateAllProjectsResult` handler must re-fetch via `checkAllProjectsUpdates` after forwarding to UpdatesTab. |
| Cross-panel sync echo loop | Use `skipSaveRef`/`skipSourceSaveRef`/`skipProjectSaveRef` refs in App.tsx. Set `true` before setState, save effect checks and resets. |

## Sidebar
| Issue | Solution |
|-------|----------|
| Activity Bar badge removed | `setBadge()` is a no-op — don't set `webviewView.badge`. Section header badges provide update counts. `_pendingBadgeCount` field removed. |
| Search mode model | All sidebar rendering is driven by `parseSearchQuery(query)` → `{ mode: 'default' \| 'browse' \| 'installed' \| 'updates', filterText }`. Never check `expandedSection` outside default mode. |
| Browse section removed | No Browse `SectionHeader` exists. Browse results render directly when `searchMode === 'browse'` (plain text + Enter). |
| Recent searches removed | No state, effects, handlers, CSS, or backend cases (`getRecentSearches`, `clearRecentSearches`, `_addRecentSearch`) exist. Don't re-add. |
| @-prefix dropdown | Shows when text starts with `@` but isn't yet a complete valid prefix. Auto-filters as typed (`@up` → only `@updates`). Keyboard: ArrowDown/Up navigate, Enter/Tab select, Escape dismiss. |
| Client-side filtering | `@installed`/`@updates` filter client-side (live, no Enter). Browse mode uses 300ms debounce (min 2 chars) — Enter bypasses debounce for immediate search. `browseDebounceRef` holds the timer. Stale results discarded via backend `_latestSearchQuery` guard. |
| `searchModeRef` for handlers | `searchMode` is derived via `useMemo`, so stale in `useCallback([])`. Use `searchModeRef.current` in handlers. Same pattern as `selectedProjectRef`, `selectedSourceRef`. |
| Codicon font not in webviews | Codicon font is NOT available in webview HTML. Use inline SVGs matching codicon paths (e.g., chevron-right `d="M5.7 13.7L5 13l4.6-4.6L5 3.7l.7-.7 5.3 5.3-5.3 5.4z"`). |
| Section chevrons | SVG `chevron-right` icon with CSS `.section-chevron.expanded { transform: rotate(90deg) }` and `transition: 0.1s`. Not Unicode characters. |
| Search wrapper pattern | Search input is wrapped in `.sidebar-search-wrapper` (flex container with border). Input itself is transparent/borderless. Clear button is a sibling inside the wrapper. `focus-within` on wrapper provides focus ring. |
| Pending data for first open | `_pendingProjectUpdates` and `_pendingInstalledCount` are cached before sidebar resolves. `_sendInitialData()` delivers then clears them. Don't remove this caching. |

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
| Unreachable custom source blocks loading | `failedEndpointCache` caches failures for 120s (2 min). `discoverServiceEndpoints` uses 5s timeout. `searchPackages` pre-validates and pre-filters sources via `filterHealthySources()` before CLI. `clearSourceErrors()` clears all caches including `failedEndpointCache` and sources cache. |
| Registration API returns null/garbled | Gzip-compressed endpoint selected by mistake. Filter by `!resource['@id']?.includes('-gz-')` in `discoverServiceEndpoints`. HTTP/2 client has no gzip decompression. |
| Package details missing published/deps | Registration endpoint resolving to `registration5-gz-semver2/` (gzip). Must use `registration5-semver1/` (plain JSON). |

## Code Patterns
| Issue | Solution |
|-------|----------|
| "Maximum call stack size exceeded" | `_postMessage()` must call `this._panel.webview.postMessage()`, not itself |
| "Webview is disposed" error | Check `_disposed` flag before posting in async callbacks |
| Array mutation bugs | `[...array].sort()` not `array.sort()` |
| Property name typos break VSIX | Run `npm run package:vsix` — catches errors `watch` misses |
| Package selection | Use `usePackageSelection` hook. Installed: `metadataVersion: pkg.resolvedVersion`. Updates: synthetic `InstalledPackage`. |

# Debugging Workflow
1. Add temporary `console.log()` with distinctive prefix (e.g., `[DEBUG-XYZ]`)
2. Webview logs: Ctrl+Shift+P → "Developer: Open Webview Developer Tools" → Console
3. **Remove all debug logs** after fix confirmed — search for prefix and delete

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
- **Architecture:** App.tsx shell (~1650 lines) + tab components (`BrowseTab`, `InstalledTab`, `UpdatesTab`, `PackageDetailsPanel`) in `src/webview/app/components/`. Shared types in `types.ts`. See ARCHITECTURE.md for full details.

# Key Capabilities
- **React 19 + Concurrent Features:** `useDeferredValue`, `useTransition`, stale data indicators. `@tanstack/react-virtual` for Browse/Updates virtualization.
- **Component Architecture:** `React.memo`-wrapped tab components with `forwardRef`/`useImperativeHandle` for message routing. Props-based data flow (no Context).
- **Draggable Split Panel:** Resizable sash (20-80% range), persists via `globalState`. `--vscode-sash-hoverBorder` theming.
- **HTTP/2 for nuget.org:** Multiplexing for bulk requests. Session pool (MAX_SESSIONS=10) with LRU eviction. HTTP/1.1 fallback for private sources.
- **Sources & Auth:** `dotnet nuget list source`, enable/disable/add/remove. CredentialService for Azure DevOps, GitHub Packages, JFrog. DPAPI encryption on Windows.
- **Package Management:** Search/install/update/remove via dotnet CLI. Multi-project (.csproj, .fsproj, .vbproj). Floating versions, Updates tab with badge, bulk operations.
- **Transitive Packages:** Collapsible per-framework sections. Two-stage background prefetch (frameworks → metadata).
- **Multi-Tier Caching:** Backend LRUMap (metadata 200, versions 200, icons 500, search 100). Frontend `useRef<LRUMap>`. WorkspaceCache for persistence.
- **Disposed Panel Safety:** `_disposed` flag + `_postMessage()` helper prevents "Webview is disposed" errors.
- **Settings Persistence:** Prerelease/source via `workspaceState`. Split position via `globalState`.

# Build and Run
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

## NuGet / dotnet CLI
| Issue | Solution |
|-------|----------|
| `dotnet list package` fails (NU1900) | Parse .csproj directly as primary method |
| `--source ""` error | Filter: `sources?.filter(s => s && s.trim())` |
| "Unescaped characters" in request path | Skip local sources with `isLocalSource()` |
| README not showing | Extract from nupkg via adm-zip (custom sources lack ReadmeUriTemplate) |
| Floating version metadata fails | Use `pkg.resolvedVersion` not `pkg.version` for API calls |
| Transitive not available | `project.assets.json` needs build/restore — use `restoreProject()` if missing |
| Transitive stale after remove | `dotnet remove` doesn't update assets.json — run `dotnet restore` after |

## Code Patterns
| Issue | Solution |
|-------|----------|
| "Maximum call stack size exceeded" | `_postMessage()` must call `this._panel.webview.postMessage()`, not itself |
| "Webview is disposed" error | Check `_disposed` flag before posting in async callbacks |
| Array mutation bugs | `[...array].sort()` not `array.sort()` |
| Property name typos break VSIX | Run `npm run package:vsix` — catches errors `watch` misses |
| Package selection | Use `usePackageSelection` hook. Installed: `metadataVersion: pkg.resolvedVersion`. Updates: synthetic `InstalledPackage`. |

## Performance Patterns
| Pattern | Implementation |
|---------|----------------|
| Async file I/O | `fileExists()` with `fs.promises.access`, never `fs.existsSync` |
| Concurrency limiting | `batchedPromiseAll(items, processor, 8)` |
| LRU caches | Frontend: `useRef<LRUMap>`. Backend: `LRUMap` in NuGetService |
| useRef state mirror | For synchronous reads across async boundaries. See `transitiveLoadingMetadataRef`, `selectedSourceRef`, `selectedProjectRef`. |
| Race for first result | `raceForFirstResult()` to resolve early from first source |

## Security Patterns
| Pattern | Implementation |
|---------|----------------|
| Input validation | `isValidPackageId()`, `isValidVersion()`, `isValidSourceName()`, `isValidSourceUrl()`, `isValidBase64()` — validate before CLI commands |
| Credential redaction | `sanitizeForLogging(text)` before logging |

# Debugging Workflow
1. Add temporary `console.log()` with distinctive prefix (e.g., `[DEBUG-XYZ]`)
2. Webview logs: Ctrl+Shift+P → "Developer: Open Webview Developer Tools" → Console
3. **Remove all debug logs** after fix confirmed — search for prefix and delete

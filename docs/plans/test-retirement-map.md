# Test retirement map (nUIget 2.0)

Written in P5.12b (ruling of 2026-10-16 in `docs/plans/STATUS.md`). One row per legacy test file: what it proved,
where 2.0 proves the same (a `src/test/ui/v2` or `src/test/e2e/v2-*` test by `file › title`, a harness scenario
by title, or a core test file), or "no 2.0 behaviour" with the section of `docs/ux/interaction-model.md`, and what
P8.2 does with it. Nothing listed here is deleted before P8.2 (plan row P8.2, "per the retirement map"); see
"Deletion mechanism".

Counts: 11 ExTester files, 9 extension-host e2e files, 9 integration files, 13 benchmarks (42), plus the support set.

## ExTester (`src/test/ui`)

| Legacy file | What it proved | 2.0 proof | P8.2 action |
|---|---|---|---|
| `src/test/ui/activation.ui.test.ts` | The nUIget control is in the Activity Bar; the sidebar resolves | `src/test/ui/v2/sidebar.ui.test.ts › renders the installed packages of the fixture project` (opens the view from the Activity Bar control, `openSidebarView`) | delete |
| `src/test/ui/context-menu.ui.test.ts` | `nuiget.openManager` is registered | `src/test/e2e/v2-extension.e2e.test.ts › it registers every contributed command and none of the 1.x entry` | delete |
| `src/test/ui/install-flow.ui.test.ts` | Install button and version selector in the details panel | `src/test/ui/v2/main-details.ui.test.ts › shows the versions, the details and the README of the current row`; install from browse: `src/test/ui/v2/main-search.ui.test.ts` (P5.12b block d) | delete |
| `src/test/ui/keyboard-navigation.ui.test.ts` | Search focused on panel open; Tab between controls; tabs by keyboard; Escape in search | tabs: `src/test/ui/v2/main-shell.ui.test.ts › reaches the tabs by keyboard`; Escape: `src/test/ui/v2/main-search.ui.test.ts › Enter searches the feeds, the results take the place of the tabs, and Escape brings the tabs back`; focus on open: no 2.0 behaviour (`docs/ux/interaction-model.md` §1 and §5 name no initial focus for the main panel; only the sidebar focuses its search box when shown, `src/host/SidebarHost.ts:58`) | delete |
| `src/test/ui/panel-open.ui.test.ts` | Panel root, search input, project and source selectors, tab bar | `src/test/ui/v2/main-shell.ui.test.ts › renders the shell under the CSP` | delete |
| `src/test/ui/remove-flow.ui.test.ts` | Installed tab content; uninstall button in the details | `src/test/ui/v2/main-installed.ui.test.ts › lists the installed packages of the fixture project`, `› confirms the bulk uninstall and the project file follows`; `uninstall-button`: `src/test/ui/v2/main-details.ui.test.ts` (P5.12b block d) | delete |
| `src/test/ui/search-flow.ui.test.ts` | Search results; details on selection; clear on empty; replace, not append; browse state reset when the panel reopens | `src/test/ui/v2/main-search.ui.test.ts › Enter searches the feeds, the results take the place of the tabs, and Escape brings the tabs back`; details and clearing: `main-search.ui.test.ts` (P5.12b block d); reopen: `src/host/MainPanelHost.ts:31` keeps a hidden panel's context (`retainContextWhenHidden: true`), a closed and reopened panel is a new webview, and the main webview restores nothing through `vscode.getState` (`src/webview/main/index.tsx:14` declares it, nothing calls it) | delete |
| `src/test/ui/sidebar-interaction.ui.test.ts` | Sidebar search input; `@`-prefix modes; collapsible sections | `src/test/ui/v2/sidebar.ui.test.ts` (search input, `@installed`, `@updates`, browse and a section toggle: P5.12b block d); `src/test/ui/v2/sidebar-parity.ui.test.ts › the sash between the sections moves with the keyboard` | delete |
| `src/test/ui/source-settings.ui.test.ts` | Source settings opens from the gear; its modal shows | `src/test/ui/v2/main-sources.ui.test.ts › lists the sources in the selector and the dialog, opens the add form and closes on Escape` | delete |
| `src/test/ui/theme-switching.ui.test.ts` | The panel renders under dark, light and high-contrast themes | `src/test/ui/v2/theme.ui.test.ts` (six themes; contrast and target size measured, P5.11) | delete |
| `src/test/ui/update-flow.ui.test.ts` | Updates tab content; select-all button | `src/test/ui/v2/main-updates.ui.test.ts › lists the updates of the fixture project with their versions and counts them on the tab`, `› the Update all dialog lists the packages and cancels on Escape, leaving the project file as it was`, `› Enter updates one package and the project file follows`; select all: P5.12b block d | delete |

## Extension host (`src/test/e2e`)

Each file has a `v2-*` port from P5.12a; the legacy `sidebar` file is folded into `v2-sidebar.e2e.test.ts`.

| Legacy file | What it proved | 2.0 proof | P8.2 action |
|---|---|---|---|
| `src/test/e2e/commands.e2e.test.ts` | Each command executes; the panel opens | `src/test/e2e/v2-commands.e2e.test.ts` (whole suite) | delete |
| `src/test/e2e/extension.e2e.test.ts` | Installed, activates, commands registered | `src/test/e2e/v2-extension.e2e.test.ts` | delete |
| `src/test/e2e/file-watcher.e2e.test.ts` | An external project edit does not crash the watcher | `src/test/e2e/v2-file-watcher.e2e.test.ts › an edit outside the extension and its write-back are read without an error`; the lists following: harness `sidebar: uninstall then watcher invalidation converges` | delete |
| `src/test/e2e/install-flow.e2e.test.ts` | Verb-first `dotnet add … package` writes and removes a reference | `src/test/e2e/v2-install-flow.e2e.test.ts` (noun-first) | delete |
| `src/test/e2e/panel.e2e.test.ts` | Panel opens, survives a tab switch, is not duplicated, reopens | `src/test/e2e/v2-panel.e2e.test.ts` | delete |
| `src/test/e2e/settings-persistence.e2e.test.ts` | Close and reopen, visibility toggles do not crash | `src/test/e2e/v2-settings-persistence.e2e.test.ts`; what is remembered: `src/core/session/SessionStore.test.ts`, `src/webview/sidebar-next/SidebarLayout.test.tsx` | delete |
| `src/test/e2e/sidebar.e2e.test.ts` | View resolves; refresh, prerelease and Open Full View answer | `src/test/e2e/v2-sidebar.e2e.test.ts` | delete |
| `src/test/e2e/source-management.e2e.test.ts` | `nuget.config` names nuget.org; the panel opens | `src/test/e2e/v2-source-management.e2e.test.ts` | delete |
| `src/test/e2e/update-flow.e2e.test.ts` | An old version replaced (finding N44) | `src/test/e2e/v2-update-flow.e2e.test.ts` (names 3.14.0; no fixed sleep) | delete |

## Integration (`src/test/integration`)

| Legacy file | What it proved | 2.0 proof | P8.2 action |
|---|---|---|---|
| `src/test/integration/CacheInvalidation.integration.test.ts` | LRUMap, failed-endpoint cache and WorkspaceCache invalidation | `src/core/cache/cache.test.ts`, `src/core/queries/QueryCoordinator.test.ts`, `src/core/queries/scopes.test.ts`, `src/core/feeds/health.test.ts` | delete |
| `src/test/integration/CrossPanelSync.integration.test.ts` | Selective cache invalidation and concurrent operations across the two panels | harness `A→B→A ordering: …`, `shared query with one subscriber cancelling: …`, `updates converge across surfaces`, `generation on responses: …`; `src/core/ops/OperationQueue.test.ts` | delete |
| `src/test/integration/NuGetPackageService.integration.test.ts` | Search, versions, listed-only update suggestions, cache clearing, prefetch | `src/core/feeds/search.test.ts`, `src/core/feeds/updates.test.ts`, `src/core/feeds/flatContainer.test.ts`, `src/core/catalog/Catalog.test.ts` | delete |
| `src/test/integration/NuGetPanel.integration.test.ts` | The 1.x panel's message handling and error resilience | `src/host/handlers.test.ts`, `src/host/WebviewHost.test.ts` | delete |
| `src/test/integration/NuGetProjectService.integration.test.ts` | Installed packages from the project file, transitive packages, project references | `src/core/project/inspector.test.ts`, `src/core/project/assets.test.ts`, `src/core/project/references.test.ts`, `src/core/project/central.test.ts` | delete |
| `src/test/integration/NuGetService.integration.test.ts` | Facade search, metadata, versions, source errors, version cache | `src/core/catalog/Catalog.test.ts`, `src/core/feeds/registration.test.ts`, `src/core/feeds/metadataResolver.test.ts` | delete |
| `src/test/integration/NuGetSidebarPanel.integration.test.ts` | The 1.x sidebar's update pipeline and source operations | `src/host/handlers.test.ts` (SidebarHost), harness `updates converge across surfaces`, `prerelease toggle re-checks updates`, `sources unreachable shows banner not empty` | delete |
| `src/test/integration/NuGetSourceService.integration.test.ts` | Source listing, caching and invalidation | `src/core/sources/DotnetSourceProvider.test.ts`, `src/core/sources/NuGetConfigReader.test.ts`, `src/core/catalog/feedContexts.test.ts` | delete |
| `src/test/integration/ui-helpers.integration.test.ts` | The 1.x ExTester helpers (`src/test/ui/helpers`) | no 2.0 behaviour: the v2 suite has its own helpers (`src/test/ui/v2/{mainWebview,sidebarWebview}.ts`) and imports nothing from `src/test/ui/helpers` | delete with `src/test/ui/helpers` |

## Benchmarks (`src/test/benchmarks`)

D8: benchmarks stay mandatory and move to core. A subject either has a `core-*.bench.ts` case today or P8.2 adds one
in the same PR that deletes the legacy bench, with the baseline regenerated.

| Legacy bench | Subject | 2.0 bench | P8.2 action |
|---|---|---|---|
| `src/test/benchmarks/cache.bench.ts` | LRUMap, WorkspaceCache | `core-cache.bench.ts` (memory tier, persistent tier, invalidation) | delete |
| `src/test/benchmarks/csproj-parsing.bench.ts` | Project file parsing | none | adds `core-project.bench.ts` (StaticProjectInspector over the fixture projects), then delete |
| `src/test/benchmarks/http.bench.ts` | HTTP fetch pipeline | `core-transport.bench.ts` | delete |
| `src/test/benchmarks/markdown.bench.ts` | README rendering | none in core: the renderer is webview code (`src/webview/main/features/details/markdown.ts`) | adds a bench for the webview renderer (P8.2's consultation names it; D8 says core, this subject is not), then delete |
| `src/test/benchmarks/metadata.bench.ts` | Package metadata and versions | versions: `core-feeds.bench.ts › Catalog.versions (3 sources, one resource each)`; metadata: none | adds a `Catalog.metadata` case to `core-feeds.bench.ts`, then delete |
| `src/test/benchmarks/project-parsing.bench.ts` | Installed packages, transitive from the assets file, project references | none | adds cases to `core-project.bench.ts` (inspector, assets reader, references), then delete |
| `src/test/benchmarks/queryAllProjectsTransitive.bench.ts` | All-projects transitive orchestration | none | adds a `Catalog.allProjectsTransitive` case to `core-feeds.bench.ts` (or `core-project.bench.ts`), then delete |
| `src/test/benchmarks/react-rendering.bench.ts` | 1.x React component rendering | none | adds a bench of the 2.0 `Listbox` with many rows (P8.2's consultation names it), then delete |
| `src/test/benchmarks/search-query.bench.ts` | `parseSearchQuery` | none (the 2.0 parser is `src/webview/shared/search/parseSearchQuery.ts`) | adds a case for the 2.0 parser to the webview bench above, then delete |
| `src/test/benchmarks/search.bench.ts` | Search, grouped quick search | search: `core-feeds.bench.ts › Catalog.search (3 sources, 60 rows merged and enriched)`; quick search: none | adds a `Catalog.quickSearch` case to `core-feeds.bench.ts`, then delete |
| `src/test/benchmarks/source-health.bench.ts` | Source health checks | none | adds a `SourceHealthTracker` case (`core-feeds.bench.ts`), then delete |
| `src/test/benchmarks/update-checking.bench.ts` | Update checks | `core-feeds.bench.ts › Catalog.updates (50 packages, 3 sources, enriched)` | delete |
| `src/test/benchmarks/utils.bench.ts` | Validators, version specs, LRUMap, topological sort | version specs: `core-versioning.bench.ts`; LRU: `core-cache.bench.ts`; validators and topological sort: none | adds validator (`src/core/cli/validate.ts`) and topological-sort (`src/core/util/topo.ts`) cases to a core bench, then delete |

Subjects that need a new bench at P8.2: project parsing (inspector, assets, references), README rendering, package
metadata, all-projects transitive, list rendering, the 2.0 search-query parser, quick search, source health,
validators and topological sort.

## Support set

| Path | Role | P8.2 action |
|---|---|---|
| `src/test/ui/helpers/**` (`panel-helpers.ts`, `webview-helpers.ts`) | 1.x ExTester helpers | delete with the 1.x ExTester files |
| `src/test/ui/setup.ts` | 1.x ExTester setup | delete (check that `src/test/ui/v2` does not load it) |
| `src/test/e2e/index.ts` | A Mocha runner nothing references (`.vscode-test.mjs` selects files) | delete with the legacy e2e set, in one commit |
| `src/test/integration/setup.ts`, `src/test/integration/msw-handlers.ts` | Integration setup and MSW handlers | delete with the integration files |
| `src/test/benchmarks/setup.ts` | `mockServiceHttp` for the 1.x service benches | delete with the last legacy bench |
| `src/test/__mocks__/vscode.ts` | The shared `vscode` mock (N58: its panel fires `onDidDispose` on every `dispose`) | rewritten for the 2.0 tests that still use it, or deleted, with the 1.x tests |
| `tsconfig.test.json`, `tsconfig.vitest.json` | Type-checking of the 1.x and 2.0 test sets (P0.11 split) | narrowed to the 2.0 set |
| `package.json` `test:ui` | Runs the 1.x ExTester glob | removed at P8.1 (flip) |
| `.vscode-test.mjs` `!(v2-*)` branch and `NUIGET_V2` | Selects the 1.x e2e files | removed at P8.1 (flip) |
| `eslint.config.mjs` `LEGACY_IMPORT_ALLOWLIST` | Empty today | stays empty; removed with the fence's 1.x patterns at P8.2 |

## P8.1 flip

- `e2e-v2` and `ui-v2` become the default jobs; the legacy `e2e` and `ui` jobs go, and so does `npm run test:ui`.
- `build` (`Build & Package`) has `needs: [ lint, test, e2e ]` (`.github/workflows/ci.yml:369`): it must point at the
  v2 e2e job once the legacy one is gone.
- `NUIGET_V2` and the `!(v2-*)` branch of `.vscode-test.mjs` disappear; the v2 files keep their names until P8.2
  renames nothing in `src/test` unless its consultation says so.
- Until then `.github/workflows/ci.yml` and `.vscode-test.mjs` need no change: both v2 jobs already run the whole v2
  suites by glob (`ci.yml:280`, `:352`; `test:ui:v2` globs `out/test/ui/v2/*.ui.test.js`).

## Deletion mechanism

`scripts/hooks/guard.mjs:186-190` denies `rm`, `mv`, `unlink`, `git rm` and `git mv` of any `*.test.ts(x)` argument
and does not consult the contract sentinel, so no session can delete a test file. P8.2 is marked ⚑: its consultation
settles how the deletion is executed (a prior row that names `scripts/hooks/guard.mjs`, or a deletion run by the
owner). P5.12b deletes, renames and moves nothing.

## Decided in P5.12b

- (3) The v2 jobs: no change to `.github/workflows/ci.yml` or `.vscode-test.mjs`; the "P8.1 flip" section above is
  the deliverable.
- (6) The §8 tables of `docs/ux/interaction-model.md` take the state markers, layer roots and All Projects patterns
  that product files render, with an admission rule under the tables; `src/test/lint/interaction-model-testids.test.ts`
  holds the tables to the rendered ids.
- (7) No harness mode that mounts `StoreProvider` over a port adapter: the per-feature ExTester tests over the real
  host and the real slices are the end-to-end proof. Closed.
- (8) N66 closes after block (d) when its test is announced in five local runs and in `UI 2.0`; N73 is staged in the
  harness (block c).
- (9) `theme.ui.test.ts`: `incomplete` becomes a structural assertion (rule `color-contrast`, targets inside
  `package-details-panel`), never a count (block d).

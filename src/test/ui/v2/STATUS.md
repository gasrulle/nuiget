# STATUS — src/test/ui/v2   commit c15000f (P5.9 commit b; parent of commit c)   2026-10-16T02:00:00Z

git status --porcelain --untracked-files=all (before commit c): modified `.github/copilot-instructions.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `docs/ux/interaction-model.md`, `src/test/ui/v2/main-sources.ui.test.ts` (comment only) and the four STATUS notes; new `src/test/ui/v2/main-all-projects.ui.test.ts` (all belong to P5.9 commit c)

Item: **P5.9 feature all-projects, commit c of three**: `main-all-projects.ui.test.ts` (All Projects on the real host
over a second project created at runtime) and the corrected `nuget.config` statement (P5.8's note and the comment of
`main-sources.ui.test.ts`).

## Verified by running

P5.9 commit c:

```text
baseline at c15000f (commit b) → CI run 38714494277 green on all 11 jobs
npm run check-types          → first run red: `id` possibly null in the new test (getAttribute); fixed, exit 0
npx tsc --noEmit / npm run check-types / npm run lint → exit 0 each (after the last edit)
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → 18 passing (33s) at the first run, the two new tests
                               (`the host offers All Projects once a second project appears`, `All Projects lists one
                               section per project and the collapsed transitive aggregate`) among them
git status --porcelain --untracked-files=all src/test/e2e → empty afterwards · test -e .../e2e-workspace/Utility → false
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 281249 / 299921 · webview 517706 / 600685 ·
                               sidebar 307187 / 329122 (no source change since commit b)
grep -c "has no `nuget.config`" src/test/ui/v2/STATUS.md src/test/ui/v2/main-sources.ui.test.ts → 0 and 0
npm test / npm run bench     → exit 0 (npm test 0: Tests 3203 passed (3203) · bench 0: Tests 119 passed | 1 skipped (120))
test -e .claude/.contract-change → false · git diff --stat 69205e2 -- src/protocol src/core src/host docs/adr package.json
                               .vscode-test.mjs esbuild.mjs vitest.config.mts eslint.config.mjs .github/workflows → empty
```

## Done (tested)

- `main-all-projects.ui.test.ts`: creates `Utility/Utility.csproj` in the opened fixture workspace, waits for "All
  Projects (2)", commits All Projects (value set and `change` dispatched on the selector), reads two `installed-list-*`
  ids from the DOM and checks the closed `section-header-transitive`; `after` removes the project, writes
  `TestProject.csproj` back and waits until the host is back on it with `installed-list`.

## Done (untested)

- The multi-install picker in VS Code: it needs a real nuget.org search, so per the ruling it is left to jsdom
  (`DetailsPane.test.tsx` `a browse selection under All Projects opens the project picker and installs into the projects
  picked`).

## Not started

- The sidebar's All Projects (P5.10).

## Deviations from contract/ADR (file:line each)

- Folder headings and `sdk-too-old` are not shown in VS Code: one workspace folder, SDK 10 only on the runners;
  `AllProjectsView.test.tsx` proves both in jsdom (ruling (3)).
- Test ids outside interaction model §8 for P5.12b: `multi-install-dialog`, `installed-list-<name>`,
  `updates-list-<name>`, `section-header-project-<name>`, `section-header-updates-<name>`.

## Advisor decisions (date, item, question, answer verbatim)

The P5.9 ruling and the commit-b follow-up (both 2026-10-15) are verbatim in `docs/plans/STATUS.md`.

## Exact next step (one item ID)

P5.2 (store slices sweep), after P5.9 commit c's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/core/catalog/{Catalog,Catalog.test,feedContexts,feedContexts.test}.ts`, `src/host/{handlers,handlers.test}.ts`, `src/webview/main/{MainShell.tsx,main.css}`, `src/webview/shared/store/{sources.tsx,sources.test.tsx}` and the five STATUS notes; new `src/webview/main/features/sources/{SourcesControl,SourceSettingsDialog,SourcesControl.test}.tsx`, `src/test/ui/v2/main-sources.ui.test.ts` (all belong to the P5.8 commit)

Item: **P5.8 feature sources**, for this directory: `main-sources.ui.test.ts`: in VS Code on a `NUIGET_V2=1` VSIX, the
source selector becomes enabled and offers All sources, the gear opens `source-settings-modal` with at least one
`source-row-*`, the add form opens and Back closes it, Escape (sent to the focused element) closes the dialog.

## Verified by running

P5.8 (the same gate run for every directory of the item):

```text
baseline at f8bfe3f          → CI run 38701616594 green on all 11 jobs · npx tsc --noEmit 0 · npx eslint src 0 · npx vitest run →
                               Test Files 154 passed (154) · Tests 3162 passed | 4 skipped (3166)
stop-and-ask (config chain for configFile attribution) → ruling 1b of 2026-10-15 (verbatim in src/core/catalog/STATUS.md
                               and docs/plans/STATUS.md)
first repeat of the sources tests → 0 of 20: an unhandled rejection in sources.test.tsx (a rejected promise awaited after
                               the host answered) made every run exit 1 with all tests passed; fixed in the test, gotcha
                               row added to copilot-instructions; the counts of earlier runs had hidden it
first backend run with ruling 1b → 2 red: `sources/list resolves the selected project's directory` (the call now carries
                               `{ configFiles: true }`, asserted as ruling step 5 says) and `updates asks installed before
                               the feed context and walks the chain once` (step 3 started the walk before the inspection;
                               fixed by starting the inspection first, no test changed)
npx tsc --noEmit / npm run check-types / npm run lint → exit 0 each (last run after every code edit)
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → exit 0 · Test Files 155 passed (155) · Tests 3184 passed (3184)
npx vitest run --project backend src/core/catalog src/host src/extension.next.test.ts → exit 0 (extension.next.test.ts
                               unchanged: :365 and :373 as they were)
npx vitest run --project integration src/test/harness → 19 passed · "sources unreachable shows banner not empty" 40 of
                               40 · "both orders" (6 scenarios of the matrix at :95) 40 of 40; no harness file changed
sources feature and slice tests, 20 times → 20 of 20 (exit codes counted)
npm run bench                → exit 0 · Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
npx vitest run --coverage    → exit 0 · store/sources.tsx 98.27 % lines · main/features/sources 93.45 %
npm run docs:protocol:check  → docs/protocol.md is up to date
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 281249 / 299921 (280657 at P5.7) · webview
                               501695 / 600685 (492873) · sidebar 304283 / 329122 (303486); dist/ deleted after
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → 16 passing (18s), with and after the core change;
                               fixture unchanged
grep -c "configFiles: true" src/host/handlers.ts → 2 · catalog.sources in extension.next.ts:154 and SidebarHost.ts:88
                               without the flag · one withConfigFiles call in Catalog.ts, inside sources() after the query
npm run package:vsix (1.x)   → SKIPPED: no 1.x file changed; CI's Package job builds it
npm run test:ui (1.x)        → SKIPPED: no 1.x UI file changed; the CI job `UI` runs it
test -e .claude/.contract-change → false · git diff --stat c4c3617 -- src/protocol src/core/contracts.ts docs/adr
                               src/core/project/context.ts src/extension.next.test.ts → empty
```

## Done (tested)

- 16 passing locally, the new test among them.

## Done (untested)

- The attribution against a real SDK in VS Code: the ExTester test shows the rows, not their `configFile` (a machine's
  user-level config file differs; the jsdom and host tests cover what is shown and sent).

## Not started

- The sidebar's source and restore title-bar state and "Open full view" (P5.10); the multi-install picker (P5.9).

## Deviations from contract/ADR (file:line each)

- No source is added, removed, enabled or disabled in VS Code: the fixture's `nuget.config` is shared by every suite,
  and a source declared in the user-level `NuGet.Config` (nuget.org) would be changed on the machine (and on the CI
  runners). (Corrected at P5.9: the P5.8 note stated the opposite about the fixture's `nuget.config`.) Mutations are covered in jsdom and,
  on the host, by `handlers.test.ts`.

## Advisor decisions (date, item, question, answer verbatim)

The P5.8 ruling of the `architecture-advisor` (2026-10-15, option 1b) is verbatim in `docs/plans/STATUS.md` under "### P5.8 — stop-and-ask: the config chain for `configFile` attribution in `Catalog.sources()`" and in `src/core/catalog/STATUS.md`. The ambient advisor was consulted before writing (the selector disabled until the list is known keeps the P5.3 test as written, the in-dialog confirm row, `allowInsecure` for `http:`, no mutation in VS Code).

## Exact next step (one item ID)

P5.9 (feature all-projects), after P5.8's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `src/webview/main/{MainShell.tsx,index.tsx,main.css}`, `src/webview/main/features/installed/InstalledTab.tsx`, `src/webview/main/features/updates/UpdatesTab.tsx`, `src/webview/main/features/search/BrowseList.tsx`, `src/webview/shared/store/StoreProvider.tsx`, `src/webview/shared/tokens.css` and the three STATUS notes; new `src/webview/main/features/details/{DetailsPane,DetailsInfo,ReadmeView}.tsx`, `markdown.ts`, `DetailsPane.test.tsx`, `markdown.test.ts`, `src/webview/shared/store/{details.tsx,details.test.tsx}`, `src/test/ui/v2/main-details.ui.test.ts` (all belong to the P5.7 commit)

Item: **P5.7 feature details**, for this directory: `main-details.ui.test.ts`: in VS Code on a `NUIGET_V2=1` VSIX, the
Newtonsoft.Json row of the Installed tab made current shows the package, its versions from nuget.org with
`13.0.2 (installed)`, an Update or Downgrade button, the Dependencies of the Details tab, and the README tab's content
(no `script` element) or its empty state. Nothing is installed or uninstalled.

## Verified by running

P5.7 (the same gate run for every directory of the item):

```text
baseline at 4dfa2e5          → CI run 38697862878 green on all 11 jobs · npx tsc --noEmit 0 · npx eslint src 0 ·
                               npx vitest run → Test Files 151 passed (151) · Tests 3115 passed | 4 skipped (3119)
markdown port alone (esbuild --bundle --minify) → 159750 bytes, before any UI work (no ceiling at risk)
first stylesheet lint        → `every class selector starts with .nuiget-` red for `.hljs-*`; fixed by highlight.js's
                               own `classPrefix: 'nuiget-hljs-'` (no test changed)
npx tsc --noEmit / npm run check-types / npm run lint → exit 0 each (last run after every code edit)
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 154 passed (154) · Tests 3166 passed (3166)
npm run bench                → Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
npx vitest run --coverage    → exit 0 (thresholds hold) · store/details.tsx 96.77 % lines · main/features/details 94.68 %
npm run docs:protocol:check  → docs/protocol.md is up to date
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 280657 / 299921 · webview 492873 / 600685
                               (320845 at P5.6; + marked, highlight.js core with 15 languages, DOMPurify) · sidebar
                               303486 / 329122 (300411 at P5.6; + the details slice); dist/ deleted after
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → 15 passing (17s) at the first run; fixture unchanged
main/features and store/details.test.tsx, 20 times in a row → 20 of 20
npm run package:vsix (1.x)   → SKIPPED: no 1.x file changed; CI's Package job builds it
npm run test:ui (1.x)        → SKIPPED: no 1.x UI file changed; the CI job `UI` runs it
test -e .claude/.contract-change → false · git diff --stat 4dfa2e5 -- src/protocol src/core docs/adr src/host package.json → empty
```

## Done (tested)

- 15 passing locally, the new test among them; the fixture project left as found.

## Done (untested)

- Copying a code block in VS Code (the clipboard is covered in jsdom only), and README images in VS Code (the ExTester
  test does not depend on the README having images).

## Not started

- The sources settings and selector (P5.8), the multi-install picker (P5.9), the sidebar's "View package details" and
  "Open full view" (P5.10), central version changes (P6.3).

## Deviations from contract/ADR (file:line each)

- The README test accepts `readme-empty` as well as `readme-content`: whether the package version carries a README is
  the feed's fact, not the panel's; with content it checks that text was rendered and no script survived.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-15, P5.7: no L1 consultation (the item is not ⚑ and no stop-and-ask trigger fired: the bundle stayed under its ceiling, `Catalog.versions` returns a defined order so no comparator was needed, the lists' `select()` calls are what the row's note "P5.7 reads it" names). The ambient advisor was consulted before writing; its points are in the code: the slice owns the selection for the stale rule, the markdown port in `main/features/details` (N63), no `highlight.js/styles` import (colour gate), every image through `readme/image`, the echo check as the gate, `CentralUpdateDialog` reused, the bundle measured before the UI.

## Exact next step (one item ID)

P5.8 (feature sources), after P5.7's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/core/feeds/{enricher,enricher.test}.ts`, `src/host/handlers.test.ts`, `src/webview/main/{MainShell.tsx,index.tsx,index.test.tsx,main.css}`, `src/webview/shared/store/StoreProvider.tsx`, `src/webview/sidebar-next/{SidebarView.tsx,SidebarView.test.tsx,UpdatesSection.tsx,sidebar.css}` and the six STATUS notes; new `src/webview/shared/search/{SearchBox.tsx,SearchBox.test.tsx,search.css}`, `src/webview/shared/store/{search,sources,config}.tsx` with their tests, `src/webview/main/features/search/{BrowseList.tsx,BrowseList.test.tsx,useSearchTyping.ts,useSearchTyping.test.tsx}`, `src/webview/sidebar-next/{BrowseResults.tsx,BrowseResults.test.tsx}`, `src/test/ui/v2/main-search.ui.test.ts` (all belong to the P5.6 commit)

Item: **P5.6 feature search**, for this directory: `main-search.ui.test.ts`: in VS Code on a `NUIGET_V2=1` VSIX,
plain text replaces the tab bar, Enter searches the real feeds, the row `package-row-newtonsoft.json` of
`browse-list` appears, and Escape brings the tab bar back with an empty box. It prints the time from Enter to the
first row (`console.warn`, the lint rule allows `warn` and `error` only).

## Verified by running

P5.6 (the same gate run for every directory of the item):

```text
baseline at c4c3617          → CI run 38680684265 green · npx tsc --noEmit 0 · npx eslint src 0 · npx vitest run →
                               Test Files 144 passed (144) · Tests 3061 passed | 4 skipped (3065)
stop-and-ask 1 (source list of quick-search, searchDebounceMode) → ruling of 2026-10-15, option 2 narrowed
first test:ui:v2 run         → stopped in vscode:prepublish at check-types: four type errors in the item's new tests
                               (shared mock typed by its default, `act` returning Promise<unknown>, an invalid
                               InvalidationReason); fixed, lint warning (console.log) → console.warn
stop-and-ask 2 (src/webview/main/index.test.tsx, `config/get` at start) → ruling of 2026-10-15, option 1
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each (last run after every edit)
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 151 passed (151) · Tests 3119 passed (3119)
npm run bench                → Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
npx vitest run --coverage    → exit 0 (thresholds hold) · store/search.tsx 97.95 % lines · store/sources.tsx 97.56 %
                               · store/config.tsx 94.73 % · shared/search 100 % · main/features/search 97.36 %
npm run docs:protocol:check  → docs/protocol.md is up to date
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 280657 / 299921 · webview 320845 / 600685
                               (309114 at P5.5) · sidebar 300411 / 329122 (288948 at P5.5); dist/ deleted after
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → 14 passing (16s) at the second run (the first
                               stopped at check-types, above) · `[P5.6] cold search: 2323 ms from Enter to the first row`
timer-based frontend tests (sidebar-next, main/features/search, shared/search, store/search), 20 times → 20 of 20
npm run package:vsix (1.x)   → SKIPPED: no 1.x file changed; CI's Package job builds it
npm run test:ui (1.x)        → SKIPPED: no 1.x UI file changed; the CI job `UI` runs it
test -e .claude/.contract-change → false · git diff --stat c4c3617 -- src/protocol src/core/contracts.ts docs/adr
                               package.json src/host/services.ts → empty
```

## Done (tested)

- 14 passing locally, the new test among them; the fixture project left as found (`git status src/test/e2e` clean).

## Done (untested)

- The quick-search suggestions in VS Code: the ExTester test submits with Enter; suggestions, timers and both modes are
  covered in jsdom (`useSearchTyping.test.tsx`).

## Not started

- Details of a browse row (P5.7), the sources settings and selector (P5.8), the multi-install picker (P5.9), the
  sidebar's context menu, "View package details" and "Open full view" (P5.10), the search settings' `full`/`off`
  values (N57, P5.13).

## Deviations from contract/ADR (file:line each)

- Sidebar browse is covered in jsdom (`src/webview/sidebar-next/BrowseResults.test.tsx`), not in VS Code: installing
  from it would change the shared fixture project; the uninstall test of `sidebar.ui.test.ts` already proves the
  operation path.

## Advisor decisions (date, item, question, answer verbatim)

Both P5.6 rulings of the `architecture-advisor` (2026-10-15) are verbatim in `docs/plans/STATUS.md` under "### P5.6 — stop-and-ask: the source list of quick-search and `searchDebounceMode`" and "### P5.6 — stop-and-ask: the main entry's start requests". The ambient advisor was consulted before writing (scope: no install action on main browse rows, the details pane stays P5.7's, `ui/viewPackage` senders stay P5.10's, the combobox instead of `Popover`, the latency measured at the first ExTester run).

## Exact next step (one item ID)

P5.7 (feature details), after P5.6's CI run is green.

## Earlier notes of this directory

Scope of this note: the suites that put the 2.0 entries under test in VS Code and what they need:
`src/test/ui/v2/**` (ExTester), `src/test/e2e/v2-sidebar.e2e.test.ts` (extension host), the `NUIGET_V2`
switch in `esbuild.mjs` and `.vscode-test.mjs`, the script `test:ui:v2`, and the CI jobs `e2e-v2` and `ui-v2`.

git status --porcelain --untracked-files=all (this directory and the job): `?? src/test/ui/v2/main-shell.ui.test.ts`,
`?? src/test/ui/v2/mainWebview.ts`, ` M src/test/ui/v2/STATUS.md`, ` M .github/workflows/ci.yml` (all belong to the
P5.3 commit; the product side is in `src/webview/main/STATUS.md`)

Item: **P5.4 commit c** for this directory: `main-installed.ui.test.ts` (four tests, ruling step 8). Earlier:
**P5.3 main shell**, for this directory: the ExTester test `main-shell.ui.test.ts` (the shell renders under
the CSP, the tabs are reached by keyboard), its helper `mainWebview.ts`, and the `check:vsix` step of the
`ui-v2` job that closes N62. Earlier: **P3.5** (below, unchanged).

git status --porcelain --untracked-files=all (P5.5, before the commit): `?? src/webview/shared/store/{updates.tsx,updates.test.tsx}`,
`?? src/webview/main/features/updates/{UpdatesTab.tsx,UpdatesTab.test.tsx,UpdateAllDialog.tsx,CentralUpdateDialog.tsx}`,
`?? src/webview/sidebar-next/{UpdatesSection.tsx,UpdatesSection.test.tsx}`, `?? src/test/ui/v2/main-updates.ui.test.ts`,
` M src/webview/shared/store/StoreProvider.tsx`, ` M src/webview/main/{MainShell.tsx,index.tsx}`,
` M src/webview/sidebar-next/{SidebarView.tsx,SidebarView.test.tsx}`, ` M src/test/harness/{FakeWebview.ts,scenarios.test.ts}`,
` M ARCHITECTURE.md`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md` and the five STATUS notes of the item's directories

Item: **P5.5** for this directory: `main-updates.ui.test.ts` (three tests over §8 ids only: the updates of the fixture project with `13.0.2 →` and a count on the tab; the Update all dialog lists `Newtonsoft.Json: 13.0.2 →` and cancels on Escape with the project file unchanged; Enter updates Newtonsoft.Json and the project file follows; the fixture is restored in `after`). Earlier: P5.4 commit c.

## Verified by running

P5.5:

```text
baseline at 04ac55f          → CI run 38677913029 green · npx tsc --noEmit 0 · npx eslint src 0 · npx vitest run green
first full run with the Updates section mounted → 4 of 25 `SidebarView.test.tsx` tests red at document-wide
                               `.nuiget-skeleton-row` counts → stop-and-ask (ruling of 2026-10-16, option 1: six query
                               sites re-scoped to the Installed section, the four tests named by title)
npx tsc --noEmit / npm run check-types / npx eslint src → exit 0 each
npx vitest run --project frontend src/webview/sidebar-next, 20 times in a row → 20 of 20 (4 files, 30 tests)
npx vitest run --project integration src/test/harness → 19 passed · -t "prerelease toggle re-checks updates" 40 of 40
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 144 passed (144) · Tests 3065 passed (3065)
npm run bench                → Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
npx vitest run --coverage     → exit 0 (thresholds hold) · store/updates.tsx 97.61 % lines · main/features/updates 89.58 %
npm run docs:protocol:check  → docs/protocol.md is up to date
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 280611 / 299921 · webview 309114 / 600685
                               (301845 at P5.4) · sidebar 288948 / 329122 (293929 noted at P5.4)
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → 13 passing at the first run (Updates tab: 3)
npm run package:vsix (1.x)   → SKIPPED: no host, root, extension or 1.x file changed; CI's Package job builds it
npm run test:ui (1.x)        → SKIPPED: no 1.x UI file changed; the CI job `UI` runs it
test -e .claude/.contract-change → false · git diff --stat 04ac55f -- src/protocol src/core docs/adr src/host → empty
```

P5.4 commit c:

```text
npx tsc -p tsconfig.test.json --noEmit → exit 0 · npx eslint src/test/ui/v2 → exit 0
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → 10 passing (9s) at the first run: lists the installed
                               packages of the fixture project · selects a row and marks it for a bulk action · the
                               bulk uninstall dialog cancels on Escape and leaves the project file as it was ·
                               confirms the bulk uninstall and the project file follows · the two main-shell tests
                               · the four sidebar tests; check:vsix on that build → OK; git status src/test/e2e → clean
CI run 38634627520 (7f8dfd1) → 10 of 11 jobs success; `UI 2.0`: the six other v2 tests passing, `main-installed`'s
                               "before each" hook failed with "Timeout of 2000ms exceeded": the hook had Mocha's
                               default limit, and on CI this file runs right after VS Code starts. Fixed forward
                               (P5.4): the hook sets `this.timeout(150_000)`; the helpers' polls stay bounded
```

P5.3:

```text
npx tsc -p tsconfig.test.json --noEmit → exit 0
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → dist/: extension.js, sidebar.css, sidebar.js,
                               webview.css, webview.js · check:vsix: OK (N62: a 2.0 build passes it now)
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 (macOS, VS Code of ExTester), three runs:
  run 1 → 5 passing, 1 failing: `reaches the tabs by keyboard`, "expected 'search-input' to equal
          'installed-tab'": keys sent through `driver.actions()` did not reach the webview's document; the test
          sends them to the focused element now (as the sidebar test does with `option.sendKeys`)
  run 2 → 4 passing, 2 failing: `renders the shell under the CSP` at `Workbench.executeCommand` with
          "ElementNotInteractableError" (the main-shell file runs first, right after VS Code starts; the palette
          input was not ready): `openMainPanel` polls now; and P3.5's `uninstalls through the sidebar and the
          project file follows`, 180 s without "Uninstalled Serilog" in `status-live` while the screenshot shows
          the row gone: recorded as N66 (not changed here, the test and the sidebar are not this item's)
  run 3 → 6 passing (6s): renders the shell under the CSP · reaches the tabs by keyboard · the four sidebar tests
npm run check:vsix after each ExTester run (the build ExTester packaged with NUIGET_V2=1) → check:vsix: OK
CI run 38625758047 (7385eeb) → 10 of 11 jobs success; `UI 2.0`: every test passing, then the new step `Check
                               VSIX contents (2.0)` failed: "1 file(s) are outside the allow-list … ui-v2-output.txt".
                               The log the test step tees into the checkout was selected for the VSIX (also for the
                               one ExTester packaged and installed). Locally the log goes to the scratchpad, so the
                               check passed there. Fixed forward (P5.3, N62): the log is written to `$RUNNER_TEMP`
                               and uploaded from there. The 1.x `UI` job tees `ui-output.txt` into the checkout the
                               same way and runs no `check:vsix`; left as it is (1.x, retired at P8.2)
git status --porcelain src/test/e2e → clean after every run
```

P3.5:


```text
baseline (at 8c95e9e) npx tsc --noEmit / npm run check-types / npx eslint src → exit 0 / exit 0 / exit 0
baseline npx vitest run      → Test Files 110 passed (110) · Tests 2680 passed | 3 skipped (2683)
npx tsc -p tsconfig.test.json → exit 0 · glob `out/test/e2e/!(v2-*).e2e.test.js` → 9 files, none `v2-*` ·
                               glob `out/test/e2e/v2-*.e2e.test.js` → `out/test/e2e/v2-sidebar.e2e.test.js`
rm -rf dist && node esbuild.mjs --v2 --production && NUIGET_V2=1 npm run test:e2e → exit 0 · suite "2.0
                               sidebar": 3 passing (514ms), in VS Code stable (1.141.1, downloaded by
                               `vscode-test` as in CI) · git status -- src/test/e2e/fixtures → clean
control: rm -rf dist && node esbuild.mjs --production && NUIGET_V2=1 npm run test:e2e → exit 1 · 1 failing:
                               `the 2.0 entry is the one under test`, "commands of the 1.x entry: dist/ was
                               not built with --v2" (a 1.x build under the v2 selector is caught at once)
npm run test:e2e (the same 1.x build, no variable; the row's literal gate) → exit 0 · 30 passing (2m) · none of
                               the v2 titles in the output · fixtures clean
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → exit 0 · ExTester ran `vscode:prepublish`,
                               packaged `nuiget-1.18.9.vsix` (16 files) and installed it · suite "2.0
                               sidebar": 4 passing (6s) · fixtures clean afterwards · the VSIX file is
                               gitignored
rm -rf dist && NUIGET_V2=1 npm run package && npx vsce ls | grep '^dist/' → dist/extension.js, dist/sidebar.css,
                               dist/sidebar.js, dist/webview.js; no dist/webview.css (N62) ·
                               grep -c nuiget-sidebar dist/sidebar.js → 1
npx tsc --noEmit / npm run check-types → exit 0 / exit 0
npx eslint src / npm run lint → exit 0 / exit 0 (`npm run lint` covers `esbuild.mjs` and `.vscode-test.mjs`)
npx vitest run / npm test (NUIGET_SDK_TESTS=1) → 2680 passed | 3 skipped / 110 files, 2683 passed
npx vitest run --coverage    → exit 0 · all files lines 80.64 % (no product code changed)
npm run bench / bench:compare → exit 0 / exit 0 · Tests 112 passed | 1 skipped (113)
npm run docs:protocol:check  → exit 0
.github/workflows/ci.yml     → parses (python yaml); jobs: lint, test, e2e, ui, e2e-v2, ui-v2, build,
                               benchmark; `build.needs` unchanged ([lint, test, e2e]); no `continue-on-error`
npm run package:vsix, npm run check:vsix, npm run test:ui (the 1.x UI suite) → SKIPPED: no host, packaging or
                               1.x UI file changed and no product code; `check:vsix` is not meant for a 2.0
                               build (N62); CI runs all three on the 1.x entries
CI                           → see the tracker row of P3.5 (ten jobs expected)
```

## Done (tested)

- P5.5 `main-updates.ui.test.ts`: 3 passing at the first local run (13 in the v2 suite).
P5.4 commit c: `main-installed.ui.test.ts` opens the panel (`openMainPanel`, `enterMainWebview`) before each test,
finds `installed-list` as a multi-selectable listbox with the fixture's two rows, makes Serilog the current row
(`aria-current`) and selects it with Space (`aria-selected`, `uninstall-selected-button` enabled), opens the dialog
and cancels it with Escape (the project file unchanged), then confirms and waits until the Serilog row is gone and
the project file no longer names it. It restores the fixture in `after`; keys go to elements; nothing waits on
`status-live` (N66).

P5.3: `main-shell.ui.test.ts` opens the panel through the Command Palette (`nUIget: Manage NuGet Packages`, the
title of `nuiget.openManager`; `package.json` unchanged), enters the webview recognized by `nuiget-app` (with the
sidebar open there are two `iframe.webview`), finds every shell test id, waits for the fixture project in the
project selector, and reads the layout under the CSP: the root is the flex column of `main.css`, the split
custom property set through the CSSOM (`--nuiget-split: 50%`) sizes the list to half the split, and the colour
token resolves. The second test reaches `installed-tab` with Tab from the search box and `updates-tab` with
ArrowRight, which selects it. The `ui-v2` job runs `npm run check:vsix` after the suite, on the `dist/` that
`vscode:prepublish` built with `NUIGET_V2` set.

P3.5:

- **`NUIGET_V2=1`**, the one switch. `esbuild.mjs` treats it like `--v2`, so that `vscode:prepublish`, which
  `vsce` and ExTester always run and which takes no flag, builds the 2.0 entries; `.vscode-test.mjs` selects
  `out/test/e2e/v2-*.e2e.test.js` with it and every other e2e file without it. `npm run test:e2e` is unchanged
  as a script and is the 1.x suite unless the variable is set.
- **`npm run test:ui:v2`**: compiles the suites and runs `out/test/ui/v2/*.ui.test.js` with ExTester, which
  packages the VSIX itself. The 1.x `test:ui` glob (`out/test/ui/*.ui.test.js`) does not reach the folder.
- **`src/test/e2e/v2-sidebar.e2e.test.ts`** (extension host, 3 tests): `the 2.0 entry is the one under test`
  (the twelve contributed commands are registered, the two that only `src/extension.ts` registers are not),
  `the sidebar view resolves and its commands answer`, `a noun-first package remove outside the extension is
  seen without an error` (`dotnet package remove Serilog --project …` with an argument vector, the project
  file polled every 250 ms, then both refresh commands). The fixture project is written back in
  `suiteTeardown`. No fixed sleep.
- **`src/test/ui/v2/sidebar.ui.test.ts`** (WebDriver, 4 tests) with its own helper `sidebarWebview.ts`:
  `renders the installed packages of the fixture project` (the test ids of interaction model §8, both rows),
  `lays the rows out from the stylesheet under the CSP` (each row is as high as `--nuiget-row-height-compact`
  in `tokens.css`; the second row's `--nuiget-virtual-offset` is that height and it lies under the first; the
  shell has a colour of the theme and fills the view), `shows the uninstall action when a row has focus` (and
  the other row's action is not shown), `uninstalls through the sidebar and the project file follows` (Delete
  on the focused option → "Uninstalled Serilog" in `status-live` → the row gone → the other row still there →
  the project file without the reference). The fixture is written back in `after`.
- **CI**: `e2e-v2` ("E2E 2.0", VS Code 1.85.0 and stable, `node esbuild.mjs --v2 --production`, then
  `npm run test:e2e` under `NUIGET_V2=1`) and `ui-v2` ("UI 2.0", needs Lint and Test, `npm run test:ui:v2`
  under `NUIGET_V2=1`), each with its log artifact. Copies of the existing jobs with those differences.
- What P3.4 listed as untested and is now shown in VS Code: the host's HTML loads `dist/sidebar.js` and
  `dist/sidebar.css` under its Content Security Policy; the tokens resolve; the custom properties React sets
  for the virtual offsets take effect under `style-src` for the webview's origin only; the row action follows
  focus; the real host and the real slices agree from the click to the project file.

## Done (untested)

- **The two new jobs on a runner.** They are copies of jobs that are green, and their commands pass locally on
  macOS; Xvfb, a cold NuGet cache and VS Code 1.85.0 for the extension-host suite are first exercised by the
  push of this commit. A first red run is handled as the ruling says (step 7).
- **VS Code 1.85.0 locally.** The local e2e run used stable. The 1.85.0 run is CI's.
- **Chromium 114.** No job sees the 2.0 webview in the browser of VS Code 1.85: ExTester runs the newest VS
  Code it supports (finding N64).
- Scrolling a long list, high contrast, a narrow view, a screen reader: not part of this item (P5.11, P7.4).
- The uninstall in the UI test took about 2 s locally with a warm NuGet cache; the timeouts (180 s for the
  announcement, 120 s for the row) are for a cold runner and are not exercised.

## Not started

- Running `check:vsix` on a 2.0 VSIX: when `dist/webview.css` exists (P5.3, N62).
- UI tests of what the sidebar does not have yet (Updates, browse, context menu, all-projects mode) and of the
  main panel: with their features in P5; the 1.x suites are rewritten or retired at P5.12 and P8.2.

## Deviations from contract/ADR (file:line each)

P5.3:

- The P3.5 ruling below (steps 4 and 5, DO NOT) says a v2 suite never opens the main panel, for N62. The P3.6
  ruling replaced that rule in P5.3, which opens it; the ruling stays verbatim, the gotcha row is rewritten.
- The P3.6 ruling names one step of `ci.yml` for P5.3. The fix-forward also changes the `tee` target of the step
  before it and the upload path of the step after it: the check the ruling asked for refuses the log the job
  wrote into the checkout, and the VSIX under test should not carry it either.
- The P3.6 ruling says to delete the comment at `.github/workflows/ci.yml:325` (above the `ui-v2` job). It is
  rewritten instead: the job still needs a sentence saying why `NUIGET_V2` is set and what `check:vsix` checks.
- `mainWebview.ts` imports `driverOf` and `poll` from `sidebarWebview.ts` (P3.5's helper, unchanged) instead of
  moving them into a shared module; P5.12b decides the final shape of the v2 helpers.

P3.5:

- The P3 gate says "CI e2e proves it" of "sidebar usable for installed + uninstall in the Extension Host". An
  extension-host test cannot see a webview, so the proof is the ExTester suite (`ui-v2`); the e2e suite proves
  the build's identity, activation, the view and commands, and the noun-first CLI path. As ruled (step 9).
- `src/test/e2e/v2-sidebar.e2e.test.ts`: three tests. The ruling's VERIFY line expects "4 passing" for this
  suite and lists three titles; the three titles are the ones written.
- `src/test/ui/v2/sidebar.ui.test.ts:93-95`: beyond the ruled assertion that the focused row's action is
  displayed, the test also asserts that the other row's action is not: that is what shows the `visibility`
  rule is in effect and not merely absent. `:72-81`: beyond the ruled layout checks, the second row's
  `--nuiget-virtual-offset` is read and the shell's height is compared with two rows.
- `src/test/e2e/v2-sidebar.e2e.test.ts:41-48`: `dotnet` is run with `DOTNET_CLI_UI_LANGUAGE=en` and
  `DOTNET_NOLOGO=1` added to the environment, so that a failure message in the assertion is readable; the
  arguments are the ruled ones.
- `.vscode-test.mjs`, `esbuild.mjs`, `package.json` (scripts): files the row does not name, changed by the
  ruling and only as it says (one line each plus a comment; one script).

## Advisor decisions (date, item, question, answer verbatim)

2026-10-13, P3.5, stop-and-ask in the plan's §2.4 form (`architecture-advisor`), on `labs/2.0` @ `8c95e9e` with
nothing written. Question: the row names two test files and `ci.yml`, but `.vscode-test.mjs` would run a new
`v2-*` e2e file in the 1.x jobs, `vsce` and ExTester always run `vscode:prepublish` (the 1.x build), `check:vsix`
wants `dist/webview.css`, the fixture is shared and an extension-host test cannot see the webview: which files
may change, by which mechanism do the jobs get the 2.0 entries, what does each suite assert, which fixture,
what of `check:vsix`, what shape have the jobs and how does a red run of a new job count? Answer, verbatim:

`````text
DECISION: Option 1, narrowed: one environment switch, `NUIGET_V2=1`, read by `esbuild.mjs` and by `.vscode-test.mjs`; one new npm script (`test:ui:v2`; the env switch makes `npm run test:e2e` select the v2 suite, so no e2e script is added); the two new CI jobs set the variable at job level; the shared fixture is kept and restored; `check:vsix` is not run on a 2.0 build. Not `OWNER MUST DECIDE`: every file this touches is tooling, and `package.json` `contributes` stays untouched (§2.3).

WHY: The brief is right about the tree. `vsce` always runs `vscode:prepublish` (`node_modules/@vscode/vsce/out/package.js:1561`, unconditional in `packageCommand`; `createVSIX` at `api.js:25` calls the same function, so ExTester's `--package_options` cannot skip it), and the prepublish child is spawned with `shell: true` and no `env` override (`package.js:1477`), so an environment variable is the one switch that reaches `npm run package` → `node esbuild.mjs --production` inside both `npx vsce package` and `extest setup-and-run`. `.vscode-test.mjs` has exactly one configuration and already reads `process.env.VSCODE_TEST_VERSION` (`.vscode-test.mjs:7`), so an env-selected `files` pattern follows the file's own precedent; `@vscode/test-cli` expands `files` with `glob()` and supports no negation (`node_modules/@vscode/test-cli/out/cli/gatherFiles.mjs:10-18`), so the legacy pattern must exclude `v2-*` by extglob. Option 2 (hand-assembled extension folder) bypasses `.vscodeignore` and is a second packaging path to maintain; option 3 leaves the P3 gate's "usable for installed + uninstall" unproven, because only ExTester can reach the webview (`src/extension.next.ts:41` exports nothing, no command uninstalls). Plan §2.1 is read as: the row names `ci.yml`, and the configuration that `ci.yml`'s new jobs cannot work without (`esbuild.mjs:7`, `.vscode-test.mjs`, `package.json` `scripts`) is in scope by this ruling; nothing else is. Finding N62 already rules that the v2 jobs do not run `check:vsix`; N44 already assigns "bounded polling, no fixed sleeps" to the P3.5 e2e test.

DO:
1. `esbuild.mjs:7`: `const isV2 = process.argv.includes('--v2') || process.env.NUIGET_V2 === '1';` with a one-line comment: the variable exists so that `vscode:prepublish`, run by `vsce` and ExTester, builds the 2.0 entries in the `e2e-v2`/`ui-v2` jobs. No other change to the file; `--v2` stays the documented flag (D4).
2. `.vscode-test.mjs`: `const v2 = process.env.NUIGET_V2 === '1';` and `files: v2 ? 'out/test/e2e/v2-*.e2e.test.js' : 'out/test/e2e/!(v2-*).e2e.test.js'`. Everything else (version, workspaceFolder, mocha, launchArgs) unchanged. Verify the extglob before relying on it: after `npx tsc -p tsconfig.test.json`, `node -e "import('glob').then(g=>g.glob('out/test/e2e/!(v2-*).e2e.test.js').then(f=>console.log(f.length,f)))"` → 9 files, none starting with `v2-`; the same with `'out/test/e2e/v2-*.e2e.test.js'` → exactly the new file.
3. `package.json` scripts: add `"test:ui:v2": "tsc -p tsconfig.test.json && extest setup-and-run out/test/ui/v2/*.ui.test.js --code_version max --code_settings src/test/ui/settings.json --open_resource src/test/e2e/fixtures/e2e-workspace"`. It does not call `package:vsix` (that reruns `npm ci` and the whole `npm test`; ExTester packages the VSIX itself, and under `NUIGET_V2=1` that VSIX is the 2.0 one). Do not change `test:e2e`, `test:ui`, `package`, `vscode:prepublish`. No new dependency. `.claude/settings.json` needs no change: `Bash(npm run test:*)` and `Bash(xvfb-run -a npm run test:*)` already cover both suites; an env-prefixed invocation that prompts is run anyway and the prompt noted (§2.2 step 5).
4. `src/test/e2e/v2-sidebar.e2e.test.ts` (the row's path; Mocha `tdd` ui like its neighbours). Titles the gate reads:
   - `suite('2.0 sidebar')` → `suiteSetup`: activate `Gasrulle.nuiget`; find the `.csproj` with `vscode.workspace.findFiles`; keep its original content.
   - `test('the 2.0 entry is the one under test')`: `vscode.commands.getCommands(true)` contains the 12 contributed commands and contains neither `nuiget.refreshPackagesScoped` nor `nuiget.viewPackageDetails` (registered only by `src/extension.ts:182,273`). This is what makes a stale `dist/` fail at the first test instead of confusingly later.
   - `test('the sidebar view resolves and its commands answer')`: `workbench.view.extension.nuiget-sidebar`, then `nuiget.sidebar.refresh`, `nuiget.sidebar.togglePrerelease`, `nuiget.sidebar.togglePrereleaseOff` do not reject.
   - `test('a noun-first package remove outside the extension is seen without an error')`: `child_process.execFile('dotnet', ['package', 'remove', 'Serilog', '--project', csprojPath])` (argv, never a terminal or shell string; noun-first only, which also proves the runner's SDK is ≥ 10, D13), then poll the file every 250 ms up to 60 s until `Include="Serilog"` is gone, then `nuiget.sidebar.refresh` and `nuiget.refreshPackages` still resolve. No `setTimeout` sleeps of a fixed length anywhere in the file (N44). `suiteTeardown` writes the original content back exactly as `src/test/e2e/install-flow.e2e.test.ts:34-39` does.
   - The test never opens the main panel (`nuiget.openManager`, `nuiget.sidebar.openFullView`): the 2.0 main entry is a placeholder without `dist/webview.css` until P5.3 (N62).
5. `src/test/ui/v2/sidebar.ui.test.ts` plus its own helper module in `src/test/ui/v2/` (frame switch into the sidebar webview looking for `[data-testid="nuiget-sidebar"]`, `findByTestId`, `waitForTestIdGone`); import nothing from `src/test/ui/helpers/*` (those are 1.x files and are deleted with the 1.x suites at P8.2). Titles:
   - `describe('2.0 sidebar')` → `before`: read `TestProject.csproj`; `after`: write it back; `afterEach`: `switchTo().defaultContent()`.
   - `it('renders the installed packages of the fixture project')`: `nuiget-sidebar`, `sidebar-search-input`, `section-header-installed`, `sidebar-installed-list`, `package-row-newtonsoft.json`, `package-row-serilog` are present (ids lower-cased, model §8).
   - `it('lays the rows out from the stylesheet under the CSP')`: the row's computed `height` equals the compact row token's px value (read it from `src/webview/shared/tokens.css`); the second row's rect `y` is ≥ the first row's `y + height` (virtual offsets set through the CSSOM under `style-src ${webview.cspSource}`, `src/host/services.ts:112-116`); the sidebar root's computed `color` is not transparent (tokens resolved to the theme).
   - `it('shows the uninstall action when a row has focus')`: click the Serilog row's `role="option"`, then `row-action-uninstall` inside `package-row-serilog` `isDisplayed()` is true (it is `visibility: hidden` until hover or `focus-within`, `src/webview/shared/primitives/primitives.css:136-146`).
   - `it('uninstalls through the sidebar and the project file follows')`: with the Serilog option focused, send `Key.DELETE` (the keyboard path is the robust one; a click on the button is valid only after the row has focus); `status-live` text contains `Uninstalled Serilog` (`src/webview/sidebar-next/outcomes.ts:5,36`); `package-row-serilog` gone within 120 s (the restore of a net8.0 project under SDK 10 may download a targeting pack on a cold runner); `package-row-newtonsoft.json` still present; switch back to the default content and read the `.csproj` from disk: no `Include="Serilog"`, still `Include="Newtonsoft.Json"`.
   - Assert nothing about `sidebar-installed-provisional`: its presence depends on `obj/project.assets.json`, which is gitignored and written by the restore.
   - The test never opens the main panel (N62, as in step 4).
6. `.github/workflows/ci.yml`: add `e2e-v2` (`name: E2E 2.0 (${{ matrix.vscode }})`, same `strategy.matrix.vscode: [ '1.85.0', 'stable' ]`, `fail-fast: false`, `timeout-minutes: 30`, `env: VSCODE_TEST_VERSION: ${{ matrix.vscode }}` and `NUIGET_V2: '1'`, same checkout/setup-node/setup-dotnet/warm-up/`npm ci` steps, `Build extension (2.0)`: `node esbuild.mjs --v2 --production`, `Run E2E tests (2.0)`: `xvfb-run -a npm run test:e2e 2>&1 | tee e2e-v2-output.txt`, the same summary step reading that file, artifact `e2e-v2-log-${{ matrix.vscode }}`) and `ui-v2` (`name: UI 2.0`, `needs: [ lint, test ]`, `timeout-minutes: 45`, `env: NUIGET_V2: '1'`, same setup steps, `xvfb-run -a npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 2>&1 | tee ui-v2-output.txt`, artifact `ui-v2-log` with `/tmp/nuiget-ui-v2/screenshots`). 1.85.0 stays in the matrix because it is the only place the D10 baseline (Node 18 host) runs 2.0 code. Leave `build.needs` as `[ lint, test, e2e ]`: that job packages the 1.x release artifact. No `continue-on-error`. The existing `e2e`, `ui` and `build` jobs are not edited.
7. Before the first push, run both suites locally: `rm -rf dist && node esbuild.mjs --v2 --production && NUIGET_V2=1 npm run test:e2e` (macOS: a display is available), then `rm -rf dist && node esbuild.mjs --production && npm run test:e2e` (the legacy suite, the row's literal gate), then `NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2`. Paste all three results in the STATUS note. CI red handling under RUN.md §5: a job that dies before any test ran (VS Code or ChromeDriver download, N37) is re-run with `gh run rerun <id> --failed` and does not count; a failure inside a v2 suite is a fix-forward commit citing P3.5 and counts; after two such red runs the item is `blocked`.
8. Docs duties: no CHANGELOG entry (tests and CI only); ARCHITECTURE.md 2.0 section: one paragraph under its testing heading on the `NUIGET_V2` switch, the two jobs and what each suite proves; `.github/copilot-instructions.md`: one new 2.0 gotcha row for `NUIGET_V2` ("`vsce` and ExTester always run `vscode:prepublish`; a 2.0 VSIX comes only from `NUIGET_V2=1`, and the same variable selects the `v2-*` e2e files — unset it before running the 1.x suites; `rm -rf dist` when switching entry sets") and extend the existing row "`--v2` build has no `dist/webview.css` yet" with "the `e2e-v2`/`ui-v2` jobs therefore do not run `check:vsix`". Handoff note: `src/test/ui/v2/STATUS.md`, covering both suites and the jobs. Ledger: N62 stays open (P5.3), N44 row notes the v2 e2e test polls; add a Low finding that no job runs the 2.0 webview in Chromium 114 (the `e2e-v2` 1.85.0 job loads it but cannot observe it; ExTester runs `max`), for P3.6/P7 to weigh.
9. Deviations to record in the STATUS note: the P3 gate's "CI e2e proves it" is carried by `ui-v2` (ExTester), since an extension-host test cannot see the webview; the e2e test proves activation, build identity, view resolution and the noun-first CLI path.

DO NOT:
- Do not run `npm run check:vsix` on a `--v2` build or add `dist/webview.css` to it (N62; P5.3 closes it).
- Do not add `continue-on-error`, `allow-failure` or a re-run loop to either new job.
- Do not edit any 1.x e2e or UI file, `src/test/ui/helpers/*`, `src/test/ui/setup.ts`, `src/test/e2e/index.ts`, `scripts/check-vsix-contents.mjs` or `.vscodeignore`.
- Do not change `vscode:prepublish`, `package`, `test:e2e` or `test:ui`, and do not add `cross-env` or any other dependency.
- Do not create a second fixture workspace; restore `src/test/e2e/fixtures/e2e-workspace/TestProject.csproj` in `after`/`suiteTeardown`.
- Do not use `dotnet add <proj> package`, a terminal `sendText`, or a fixed `setTimeout` sleep in the v2 tests.
- Do not open the main panel from a v2 suite.
- Do not put a second labelled configuration or a `--label` flag in: the env switch is the single selector.
- Do not call the test's directory `app` or `sidebar` (import fence gotcha): `src/test/ui/v2/` is the folder.

CONTRACT CHANGE: none. `src/protocol/**`, `src/core/contracts.ts`, `docs/adr/**`, `package.json` `contributes` and `src/host/**` stay untouched; no sentinel.

VERIFY:
- `node -e "import('glob').then(g=>g.glob('out/test/e2e/!(v2-*).e2e.test.js').then(f=>console.log(f.length)))"` → `9`; the `v2-*` pattern → `1`.
- `rm -rf dist && NUIGET_V2=1 npm run package && npx vsce ls | grep '^dist/'` → `dist/extension.js`, `dist/webview.js`, `dist/sidebar.js`, `dist/sidebar.css`, no `dist/webview.css`; `grep -c nuiget-sidebar dist/sidebar.js` → ≥ 1.
- `rm -rf dist && node esbuild.mjs --v2 --production && NUIGET_V2=1 npm run test:e2e` → 4 passing, 0 failing, the first title `the 2.0 entry is the one under test`.
- `rm -rf dist && node esbuild.mjs --production && npm run test:e2e` → the legacy count (30 passing), none of the v2 titles in the output.
- `NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2` → 4 passing; afterwards `git status --short src/test/e2e/fixtures` → clean.
- `npx tsc --noEmit`, `npm run check-types`, `npm run lint` (covers `.vscode-test.mjs` and `esbuild.mjs`) → 0; `npx vitest run` → green; `npm run bench` → exit 0.
- `gh run view <id>` for the push → ten jobs, all `success`: Lint, Test (2), E2E (2), E2E 2.0 (2), UI, UI 2.0, Build & Package, Benchmark informational.

FILES CHECKED: docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:41-175,240-251; docs/plans/RUN.md:16-27,64-139; docs/plans/STATUS.md rows P3.4-P3.6; docs/plans/findings-ledger.md rows N37, N44, N61, N62, N63; src/webview/sidebar-next/STATUS.md; .github/agents/architecture-advisor.agent.md; package.json:21-24,59,294-320,344-350 and `contributes.commands`; .vscode-test.mjs; tsconfig.test.json; esbuild.mjs:1-36,76-100; scripts/check-vsix-contents.mjs:1-30; .vscodeignore; .gitignore:3-23; .github/workflows/ci.yml:1-287; .claude/settings.json; src/test/e2e/index.ts, sidebar.e2e.test.ts, install-flow.e2e.test.ts:1-80; src/test/e2e/fixtures/e2e-workspace/{TestProject.csproj,nuget.config}; src/test/ui/setup.ts, settings.json, sidebar-interaction.ui.test.ts, remove-flow.ui.test.ts, helpers/webview-helpers.ts, helpers/panel-helpers.ts:1-80; src/extension.next.ts:1-330; src/extension.ts (registerCommand sites 134-273); src/host/SidebarHost.ts:17-60,100-125; src/host/services.ts:100-135; src/webview/sidebar-next/{index.tsx:12,InstalledSection.tsx:60-192,outcomes.ts:1-46}; src/webview/shared/primitives/Row.tsx:35-102, primitives.css:76-146; src/core/cli/commands.ts:65-91; src/core/ops/PackageWorkflows.ts:1-115; docs/ux/interaction-model.md §8; .github/copilot-instructions.md:197; node_modules/@vscode/vsce/out/package.js:1465-1480,1557-1580 and api.js:20-45; node_modules/@vscode/test-cli/out/bin.mjs:1-60, cli/gatherFiles.mjs, config.d.cts:2-55; `npx vsce package --help`; `npx extest --help`, `setup-and-run --help`, `setup-tests --help`, `install-vsix --help`, `run-tests --help`; node_modules/vscode-extension-tester/out/extester.js:144-168, util/codeUtil.js:613-616.
`````

## Exact next step (one item ID)

P5.6 (feature search, main and sidebar browse), after P5.5's CI run is green; a fresh session starts it (second compaction of this one).






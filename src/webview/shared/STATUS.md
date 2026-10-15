# STATUS — src/webview/shared   commit 359a2a4 (P5.9 commit a; parent of commit b)   2026-10-16T01:00:00Z

git status --porcelain --untracked-files=all (before commit b): modified `ARCHITECTURE.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/webview/main/MainShell.tsx`, `src/webview/main/features/updates/{UpdatesTab,UpdatesTab.test,UpdateAllDialog}.tsx`, `src/webview/shared/store/{allProjects,allProjects.test}.tsx` and the two STATUS notes; new `src/webview/main/features/updates/AllProjectsUpdates.tsx` (all belong to P5.9 commit b)

Item: **P5.9, commit b of three**: `store/allProjects.tsx` streams `allProjects/updates` while All Projects is
committed, with the committed prerelease flag, asked again on a flag change and on an invalidation naming `projects`
or an `updates:` key (never `installed:`), the latest request's chunks, icons and answer only (N11 closed), and one
re-ask after `RECOVERY_DELAY_MS` when a source recovers while the answer said `sourcesUnavailable`.

## Verified by running

P5.9 commit b:

```text
baseline at 359a2a4 (commit a) → CI run 38712032135 green on all 11 jobs
stop-and-ask (the P5.5 test `All Projects: an empty state instead of a list`) → ruling of 2026-10-15 (verbatim in
                               docs/plans/STATUS.md): rewrite by title, second assertion kept
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each (last run after every code edit)
git diff --numstat 359a2a4 -- src/webview/main/features/updates/UpdatesTab.test.tsx → 76 2 (the one test body; the
                               three new titles are additions)
src/webview/main/features/updates, 20 times → 20 of 20 · main features and store/allProjects.test.tsx, 20 times → 20 of 20
npx vitest run --project integration src/test/harness → exit 0 · the gate scenario 40 of 40
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → exit 0 · Test Files 156 passed (156) · Tests 3203 passed (3203)
npm run bench                → exit 0 · Tests 119 passed | 1 skipped (120)
npx vitest run --coverage    → exit 0 (thresholds hold) · store/allProjects.tsx 96.69 % · main/features/updates 86.89 %
npm run docs:protocol:check  → docs/protocol.md is up to date
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 281249 / 299921 · webview 517706 / 600685
                               (508743 at commit a) · sidebar 307187 / 329122 (305381 at commit a)
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → 16 passing (18s); fixture unchanged
grep -rc "not available in this view yet" src/webview/main → 0 · N11 closed in the ledger
npm run package:vsix (1.x) / npm run test:ui (1.x) → SKIPPED: no 1.x file changed; CI builds and runs them
test -e .claude/.contract-change → false · no frozen path changed
```

## Done (tested)

- `allProjects.test.tsx` (+4): the four titles of the ruling's DO 3, verbatim.

## Done (untested)

- All Projects in VS Code: commit c.

## Not started

- The ExTester test and the remaining docs (commit c); the sidebar's All Projects (P5.10).

## Deviations from contract/ADR (file:line each)

- None beyond the earlier notes.

## Advisor decisions (date, item, question, answer verbatim)

The P5.9 ruling and the commit-b follow-up (both 2026-10-15) are verbatim in `docs/plans/STATUS.md`.

## Exact next step (one item ID)

P5.9 commit c (ExTester `main-all-projects.ui.test.ts`, docs), after commit b's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before commit a): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `src/test/harness/{FakeWebview,scenarios.test}.ts`, `src/webview/main/main.css`, `src/webview/main/features/details/{DetailsPane,DetailsPane.test}.tsx`, `src/webview/main/features/installed/{InstalledTab,InstalledTab.test,InstalledProjectSection}.tsx`, `src/webview/main/features/updates/{UpdatesTab,UpdatesTab.test}.tsx`, `src/webview/shared/store/{allProjects,allProjects.test}.tsx` and the three STATUS notes; new `src/webview/main/features/all-projects/folderGroups.tsx`, `src/webview/main/features/details/MultiInstallDialog.tsx`, `src/webview/main/features/installed/{AllProjectsTransitiveSection,AllProjectsView.test}.tsx` (all belong to P5.9 commit a)

Item: **P5.9, commit a of three**: `store/allProjects.tsx` streams `allProjects/transitive` once `enableTransitive()`
was called, sticky while All Projects stays committed, asked again on a `projects`, `installed:` or `transitive:` key,
the latest request's chunks and answer only, reset with the slice when All Projects is left.

## Verified by running

P5.9 commit a (the same gate run for every directory of the commit):

```text
baseline at 69205e2          → CI run 38706897616 green on all 11 jobs · npx tsc --noEmit 0 · npx eslint src 0 ·
                               npx vitest run exit 0
stop-and-ask (sdk-too-old, All Projects updates, the ExTester path, then the P5.4 test's line 166) → ruling of
                               2026-10-15 (verbatim in docs/plans/STATUS.md): three green commits a, b, c
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each (last run after every code edit)
git diff --numstat 69205e2 -- src/webview/main/features/installed/InstalledTab.test.tsx → 1 1 (line 166 only)
main features and store/allProjects.test.tsx, 20 times → 20 of 20 (exit codes counted)
npx vitest run --project integration src/test/harness -t 'late allProjects chunk after switching is discarded', 40
                               times → 40 of 40 · the whole harness exit 0 · "both orders" untouched
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → exit 0 · Test Files 156 passed (156) · Tests 3196 passed (3196)
npm run bench                → exit 0 · Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
npx vitest run --coverage    → exit 0 (thresholds hold, the 2.0 webview key included) · store/allProjects.tsx 96.25 %
npm run docs:protocol:check  → docs/protocol.md is up to date
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 281249 / 299921 · webview 508743 / 600685
                               (501695 at P5.8) · sidebar 305381 / 329122 (304283 at P5.8)
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → 16 passing (18s); fixture unchanged
npm run package:vsix (1.x)   → SKIPPED: no 1.x file changed; CI's Package job builds it
npm run test:ui (1.x)        → SKIPPED: no 1.x UI file changed; the CI job `UI` runs it
test -e .claude/.contract-change → false · git diff --stat 69205e2 -- src/protocol src/core src/host docs/adr package.json
                               .vscode-test.mjs esbuild.mjs vitest.config.mts eslint.config.mjs .github/workflows → empty
```

## Done (tested)

- `allProjects.test.tsx` (+2): `the transitive stream is asked only after enableTransitive, collects chunks by project
  and applies its latest request only`, `leaving All Projects closes the transitive stream; coming back starts closed`.

## Done (untested)

- All Projects in VS Code: commit c adds the ExTester test over a second project created at runtime; folder headings and
  `sdk-too-old` cannot be shown on the runners (one workspace folder, SDK 10 only) and are proved in jsdom.

## Not started

- All Projects updates (commit b), the ExTester test and the remaining docs (commit c); the sidebar's All Projects
  (P5.10).

## Deviations from contract/ADR (file:line each)

- The aggregation is the main feature's (`AllProjectsTransitiveSection`), not the slice's: the sidebar bundle pays for
  every byte in `shared/store` (305381 / 329122).

## Advisor decisions (date, item, question, answer verbatim)

The P5.9 ruling of the `architecture-advisor` (2026-10-15) is verbatim in `docs/plans/STATUS.md` under "### P5.9 — stop-and-ask: sdk-too-old placement, All Projects updates, the ExTester path, and the P5.4 test's line 166". The ambient advisor was consulted before writing (the gate scenario first, the `seq` rule as the generation rule, the aggregation in the feature, `touchedBy` checked).

## Exact next step (one item ID)

P5.9 commit b (All Projects updates), after commit a's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/core/catalog/{Catalog,Catalog.test,feedContexts,feedContexts.test}.ts`, `src/host/{handlers,handlers.test}.ts`, `src/webview/main/{MainShell.tsx,main.css}`, `src/webview/shared/store/{sources.tsx,sources.test.tsx}` and the five STATUS notes; new `src/webview/main/features/sources/{SourcesControl,SourceSettingsDialog,SourcesControl.test}.tsx`, `src/test/ui/v2/main-sources.ui.test.ts` (all belong to the P5.8 commit)

Item: **P5.8 feature sources**, for this directory: the mutations of `store/sources.tsx` (`add`, `remove` with the
declaring `configFile` when known, `setEnabled`, a `pending` set by source name, the answered list shown at once, the
host's message on refusal; `configFiles`/`loadConfigFiles` over `sources/configFiles`).

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

- `sources.test.tsx` (+3, 8 in all): the four mutations with their payloads, `pending` and the answer shown; a refusal
  rejects with the host's message and leaves the list (the rejection handled from the start); `loadConfigFiles` and its
  failure.

## Done (untested)

- The attribution against a real SDK in VS Code: the ExTester test shows the rows, not their `configFile` (a machine's
  user-level config file differs; the jsdom and host tests cover what is shown and sent).

## Not started

- The sidebar's source and restore title-bar state and "Open full view" (P5.10); the multi-install picker (P5.9).

## Deviations from contract/ADR (file:line each)

- None beyond the earlier notes.

## Advisor decisions (date, item, question, answer verbatim)

The P5.8 ruling of the `architecture-advisor` (2026-10-15, option 1b) is verbatim in `docs/plans/STATUS.md` under "### P5.8 — stop-and-ask: the config chain for `configFile` attribution in `Catalog.sources()`" and in `src/core/catalog/STATUS.md`. The ambient advisor was consulted before writing (the selector disabled until the list is known keeps the P5.3 test as written, the in-dialog confirm row, `allowInsecure` for `http:`, no mutation in VS Code).

## Exact next step (one item ID)

P5.9 (feature all-projects), after P5.8's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `src/webview/main/{MainShell.tsx,index.tsx,main.css}`, `src/webview/main/features/installed/InstalledTab.tsx`, `src/webview/main/features/updates/UpdatesTab.tsx`, `src/webview/main/features/search/BrowseList.tsx`, `src/webview/shared/store/StoreProvider.tsx`, `src/webview/shared/tokens.css` and the three STATUS notes; new `src/webview/main/features/details/{DetailsPane,DetailsInfo,ReadmeView}.tsx`, `markdown.ts`, `DetailsPane.test.tsx`, `markdown.test.ts`, `src/webview/shared/store/{details.tsx,details.test.tsx}`, `src/test/ui/v2/main-details.ui.test.ts` (all belong to the P5.7 commit)

Item: **P5.7 feature details**, for this directory: `store/details.tsx` (the selection, the chosen version, versions,
metadata and README per selection with latest-wins and the echo check, re-asked on `versions:<id>|` and
`metadata:<id>@` invalidations, the stale-selection rule over the installed slice), mounted by `StoreProvider.tsx`;
`tokens.css` gains `--nuiget-color-code-bg`, `--nuiget-color-code-fg` and seven `--nuiget-color-syntax-*` aliases, each
with a forced-colours value.

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

- `details.test.tsx` (8): nothing without a selection; versions and details asked; `response for other package
  ignored` (the gate: cancelled earlier requests and an own answer for another package or version); README after
  `showReadme`, per version, reset by a new selection; invalidation keys; prerelease; error and retry; stale selection
  confirmed and cleared; browse never stale and All Projects clears.
- `src/test/lint` (117) green with the new tokens and stylesheet rules.

## Done (untested)

- Copying a code block in VS Code (the clipboard is covered in jsdom only), and README images in VS Code (the ExTester
  test does not depend on the README having images).

## Not started

- The sources settings and selector (P5.8), the multi-install picker (P5.9), the sidebar's "View package details" and
  "Open full view" (P5.10), central version changes (P6.3).

## Deviations from contract/ADR (file:line each)

- The README of a selection is asked only after the README tab was shown for it (`showReadme`), as 1.x loaded it on
  demand; versions and details are asked at once.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-15, P5.7: no L1 consultation (the item is not ⚑ and no stop-and-ask trigger fired: the bundle stayed under its ceiling, `Catalog.versions` returns a defined order so no comparator was needed, the lists' `select()` calls are what the row's note "P5.7 reads it" names). The ambient advisor was consulted before writing; its points are in the code: the slice owns the selection for the stale rule, the markdown port in `main/features/details` (N63), no `highlight.js/styles` import (colour gate), every image through `readme/image`, the echo check as the gate, `CentralUpdateDialog` reused, the bundle measured before the UI.

## Exact next step (one item ID)

P5.8 (feature sources), after P5.7's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/core/feeds/{enricher,enricher.test}.ts`, `src/host/handlers.test.ts`, `src/webview/main/{MainShell.tsx,index.tsx,index.test.tsx,main.css}`, `src/webview/shared/store/StoreProvider.tsx`, `src/webview/sidebar-next/{SidebarView.tsx,SidebarView.test.tsx,UpdatesSection.tsx,sidebar.css}` and the six STATUS notes; new `src/webview/shared/search/{SearchBox.tsx,SearchBox.test.tsx,search.css}`, `src/webview/shared/store/{search,sources,config}.tsx` with their tests, `src/webview/main/features/search/{BrowseList.tsx,BrowseList.test.tsx,useSearchTyping.ts,useSearchTyping.test.tsx}`, `src/webview/sidebar-next/{BrowseResults.tsx,BrowseResults.test.tsx}`, `src/test/ui/v2/main-search.ui.test.ts` (all belong to the P5.6 commit)

Item: **P5.6 feature search**, for this directory: `store/search.tsx` (one browse search per surface over the
committed source and prerelease flag, latest text wins, the `metadata` chunk merged onto the answer by `id@version`,
`sourcesUnavailable` as a flag, a committed change asks the shown text again without blanking, `exactMatch` for
navigation; quick-search `suggest`/`suggestions`/`clearSuggestions` over the enabled sources), `store/sources.tsx`
(read part, lazy and sticky `enable()`), `store/config.tsx` (lazy `config/get`, `config/changed` always applied),
`StoreProvider.tsx` (mounts the three), `search/SearchBox.tsx` + `search/search.css` (the combobox of both surfaces).

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

- `search.test.tsx` (14): nothing before a search, the committed source and flag, waiting for the session, the merge,
  latest wins, revalidation on a prerelease change, the unavailable flag, error and retry, exact match and clear; the
  ruling's three quick-search titles, `fullsearch` sends nothing, `quickSearchSources`; `withMetadata`.
- `sources.test.tsx` (5) and `config.test.tsx` (2): the titles of ruling 1, verbatim.
- `SearchBox.test.tsx` (7): prefixes as the text grows, ArrowUp/Down with `aria-activedescendant` and wrap, Enter and
  Tab take the option, Enter submits, Escape closes then clears then leaves, suggestions with their source when
  several answer and a click that keeps focus, blur closes, axe with the list open.
- `StoreProvider.test.tsx` unchanged and green: R1 still "session/get and projects/list, and nothing else".

## Done (untested)

- The quick-search suggestions in VS Code: the ExTester test submits with Enter; suggestions, timers and both modes are
  covered in jsdom (`useSearchTyping.test.tsx`).

## Not started

- Details of a browse row (P5.7), the sources settings and selector (P5.8), the multi-install picker (P5.9), the
  sidebar's context menu, "View package details" and "Open full view" (P5.10), the search settings' `full`/`off`
  values (N57, P5.13).

## Deviations from contract/ADR (file:line each)

- `store/config.tsx`: ADR-008's enumeration of slices (`docs/adr/008-webview-architecture.md:25-27`) has no `config`;
  added with its first consumer by ruling 1 (recorded, not an ADR edit, D6). The host sends `full` and `off` of
  `nuiget.searchDebounceMode` as `quicksearch` (N57, now owned by P5.13).
- `search/SearchBox.tsx`: the suggestions list is not a `Popover` and not a layer of `primitives/layers.ts`: focus stays
  in the box (`aria-activedescendant`), so there is no focus trap, no outside-press handling and no listener on the
  document; Escape is the input's own key. It is positioned under the box by `search.css` with `--nuiget-z-popover`.
- `ARCHITECTURE.md` ("Message bus and store slices", the paragraph ruling 2 cites as :377-378): the claim it protects
  stays (the store asks `session/get` and `projects/list` at start; the other slices ask when they have something to
  ask for), but the count "mounts all seven" became "mounts all ten" and the hook list names `useConfig`,
  `useSources` and `useSearch`: "seven" would be false with the three new slices mounted.
- The `search` slice gives up a quick-search answer silently on error (no suggestions shown); the search itself
  reports errors.

## Advisor decisions (date, item, question, answer verbatim)

Both P5.6 rulings of the `architecture-advisor` (2026-10-15) are verbatim in `docs/plans/STATUS.md` under "### P5.6 — stop-and-ask: the source list of quick-search and `searchDebounceMode`" and "### P5.6 — stop-and-ask: the main entry's start requests". The ambient advisor was consulted before writing (scope: no install action on main browse rows, the details pane stays P5.7's, `ui/viewPackage` senders stay P5.10's, the combobox instead of `Popover`, the latency measured at the first ExTester run).

## Exact next step (one item ID)

P5.7 (feature details), after P5.6's CI run is green.

## Earlier notes of this directory

Scope of this note: `src/webview/shared/**`, the code both 2.0 webviews share, and the test wiring it needs
(`src/test/setup-frontend.ts`, `src/test/jest-axe.d.ts`, `src/test/lint/webview-*.test.ts`).

git status --porcelain --untracked-files=all: ` M src/webview/shared/store/ops.tsx`, ` M src/webview/shared/store/ops.test.tsx`, ` M` this note and
`src/webview/sidebar-next/{InstalledSection.tsx,STATUS.md}`, `ARCHITECTURE.md`, `.github/copilot-instructions.md`,
`docs/plans/STATUS.md`, `docs/plans/findings-ledger.md` (all belong to P5.4 commit a)

Item: **P5.4 feature installed (main), commit c of three**: nothing in this directory changes in commit c (the
feature is in `src/webview/main/STATUS.md`); commit b `4a083b5`. Earlier, commit b (commit a `e4a7f4f`, N61, CI run 38631553549 green on all
11 jobs). Earlier in this note: commit a. Commit b, also (P5.4 stop-and-ask ruling of 2026-10-14, verbatim in
`docs/plans/STATUS.md`, "Advisor decisions"): N61 lands; the row stays `in-progress` until commit c. The
ruling is an L1 consultation (stop-and-ask: `Listbox.tsx` is not among the row's files); commit a touches no
file outside those the P3.6 ruling named for P5.4.

git status --porcelain --untracked-files=all (P5.5, before the commit): `?? src/webview/shared/store/{updates.tsx,updates.test.tsx}`,
`?? src/webview/main/features/updates/{UpdatesTab.tsx,UpdatesTab.test.tsx,UpdateAllDialog.tsx,CentralUpdateDialog.tsx}`,
`?? src/webview/sidebar-next/{UpdatesSection.tsx,UpdatesSection.test.tsx}`, `?? src/test/ui/v2/main-updates.ui.test.ts`,
` M src/webview/shared/store/StoreProvider.tsx`, ` M src/webview/main/{MainShell.tsx,index.tsx}`,
` M src/webview/sidebar-next/{SidebarView.tsx,SidebarView.test.tsx}`, ` M src/test/harness/{FakeWebview.ts,scenarios.test.ts}`,
` M ARCHITECTURE.md`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md` and the five STATUS notes of the item's directories

Item: **P5.5 feature updates**, for this directory: the `updates` slice (`store/updates.tsx`: `useResource` for `updates:<path>|<prerelease>` of the committed project under the committed flag, the `found` chunks before the answer, `sourcesUnavailable` as a flag, one re-request after a source recovers unless a request went out meanwhile, `RECOVERY_DELAY_MS` 300) and its mount in `StoreProvider` (inside `InstalledProvider`). Earlier in this note: P5.4.

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

P5.4 commit b:

```text
npx tsc --noEmit / npm run check-types / npx eslint src → exit 0 / exit 0 / exit 0
npx vitest run --project frontend src/webview/shared → Test Files 34 passed · Tests 235 passed (new: Listbox 4,
                               Row 1, transitive 6, allProjects 5, StoreProvider 1)
npx vitest run --project frontend (all webview tests) → Test Files 53 passed (53) · Tests 884 passed (884)
npx vitest run --project backend src/test/lint → Test Files 6 passed (6) · Tests 117 passed (117)
npx vitest run --project integration src/test/harness → Tests 16 passed (16), with `bulk remove partial failure
                               reconciles: …` (the row's gate); that scenario alone, 40 times → 40 of 40
Listbox, Row, transitive, allProjects and StoreProvider tests, 40 times in a row → 40 of 40
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 120 passed (120) · Tests 2790 passed (2790)
npm run bench               → Test Files 18 passed (18) · Tests 112 passed | 1 skipped (113)
npx vitest run --coverage    → exit 0 · src/webview/{shared,main,sidebar-next}/** 1034 of 1044 lines, 99.04 % (floor
                               85) · src/webview/** 71.18 % (ratchet 64) · lines/branches: transitive.tsx 97.77/96,
                               allProjects.tsx 96.42/86.84, Listbox.tsx 98.98/92.17, Row.tsx 100/97.14, rules.ts 100/100
git diff --numstat e4a7f4f -- primitives/Listbox.test.tsx primitives/Row.test.tsx → 114 0 / 33 0 (additions only)
grep -rn "from '../../sidebar-next|from '../sidebar-next" src/webview/main src/webview/shared → 0
grep -c 'aria-multiselectable' primitives/Listbox.tsx → 2 · grep -c 'aria-current' primitives/Row.tsx → 2 (the
                               attribute and its JSDoc; the ruling expected 1)
git diff --stat e4a7f4f -- src/protocol src/core docs/adr src/host package.json esbuild.mjs vitest.config.mts
                               eslint.config.mjs .github/workflows → empty · test -e .claude/.contract-change → false
npm run package:vsix, check:vsix, docs:protocol:check, test:ui, test:ui:v2 → SKIPPED: no host, packaging, protocol
                               or UI-test file changed in commit b, and nothing renders the new code yet (commit c)
```

P5.4 commit a:

```text
baseline (working tree at 9000208 plus the N61 change) npx tsc --noEmit / npx eslint src → exit 0 / exit 0
npx vitest run --project frontend src/webview/shared src/webview/sidebar-next → Test Files 31 passed (31) · Tests 243
                               passed (243), with `a row is busy from the call to run until the request settles` and
                               `a request without an answer leaves nothing busy`
store/ops.test.tsx and sidebar-next/SidebarView.test.tsx, 40 times in a row → 40 of 40 green
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 118 passed (118) · Tests 2772 passed (2772)
npm run bench               → Test Files 18 passed (18) · Tests 112 passed | 1 skipped (113)
npm run package:vsix, npm run check:vsix, npm run docs:protocol:check, npm run test:ui → SKIPPED: no host,
                               packaging, protocol or UI file changed (P5.4 ruling, step 2)
test -e .claude/.contract-change → false
```

Earlier:

```text
baseline (at 587499e) npx tsc --noEmit / npx eslint src → exit 0 / exit 0
baseline npx vitest run      → Test Files 110 passed (110) · Tests 2680 passed | 3 skipped (2683)
N63 before: rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 168070 / 299921 ·
                               webview 223600 / 600685 · sidebar 293929 / 329122; out/esbuild/sidebar.meta.json:
                               outputs['dist/sidebar.js'].inputs['src/webview/shared/primitives/icons.tsx']
                               .bytesInOutput = 17758
N63 after (26 annotations, nothing else in icons.tsx) → extension 168070 · webview 223600 ·
                               sidebar 278401 / 329122 (−15528) · icons.tsx bytesInOutput 2284; dist/ deleted after
the item at d7a79ba (all new modules in the barrel) → sidebar 278756: layers.ts kept 188 bytes (its selector was an
                               array joined at module level, a call the bundler keeps) and each new component
                               module a shell of 29–40 bytes (its `import './primitives.css'`); fixed forward
                               (P5.1, N63): the selector is one literal → extension 168070 / 299921 · webview
                               223600 / 600685 · sidebar 278568 / 329122 · icons.tsx 2284; dist/sidebar.css
                               12485 → 15379 bytes (primitives.css is one stylesheet, CSS is not tree-shaken)
npx tsc --noEmit / npm run check-types → exit 0 / exit 0
npx eslint src               → exit 0, no output
npx vitest run --project frontend src/webview/shared → Test Files 27 passed (27) · Tests 190 passed (190)
                               (primitives alone: 19 files, 120 tests; new: Dialog 11, ConfirmDialog 7, Popover 15,
                               Tabs 5, Toolbar 6, composed +1). The row's gate "axe 0": every new test file ends in
                               `has no axe violations`, the layer tests over `document.body` with
                               `aria-dialog-name` asserted as `passes`
npx vitest run --project backend src/test/lint → Test Files 6 passed (6) · Tests 117 passed (117)
                               (new: webview-icons-pure 2; webview-tokens requires the two widget tokens)
negative control (icons)     → icons.tsx stashed (unannotated): `every icon is a pure call` fails; restored
negative control (layers)    → 40 mutations, one at a time, of Dialog, ConfirmDialog, Popover, Tabs, Toolbar and
                               layers.ts against the six test files: first run 33 caught; tests added for the
                               real survivors (a press on text that takes no focus; Escape does not reach the
                               page; a popover stays open while a dialog opened from it is pressed; a
                               pointer-only button after the last control; focus on Cancel with a link in the
                               message). Final 38 of 40 caught; the two left are equivalent: `isInLayerAbove`
                               over `slice(index)` (a layer contains nothing outside its own element) and
                               `restoreFocus` without the "focus was inside" guard (React DOM puts focus back on
                               the element that had it before a commit when a commit's cleanup moved it; the
                               guard stays as stated intent). Every file restored (`git diff` clean of mutants)
the six new or changed primitive test files, 40 times in a row → 40 of 40 green; again on the committed tests
                               (d7a79ba plus the layers.ts fix) → 40 of 40 green
npx vitest run               → Test Files 116 passed (116) · Tests 2727 passed | 3 skipped (2730)
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 116 passed (116) · Tests 2730 passed (2730)
npm run bench               → exit 0 · Test Files 18 passed (18) · Tests 112 passed | 1 skipped (113)
npx vitest run --coverage    → no threshold error · all files lines 80.98 % · src/webview/{shared,main,sidebar-next}/**
                               847 of 855 lines, 99.06 % (floor 85) · src/webview/** 70.23 % (ratchet 64) ·
                               primitives 458 of 464 · new files lines/branches: Dialog 100/95, ConfirmDialog
                               100/100, Popover 97.1/86.2, Tabs 100/100, Toolbar 97.87/88.88, layers 100/83.33
npm run docs:protocol:check  → SKIPPED: no protocol file changed
npm run package:vsix, npm run check:vsix → SKIPPED: no host, extension, esbuild or packaging file changed (P3.3
                               precedent); CI builds and packages the 1.x entries
npm run test:ui              → SKIPPED: no 1.x UI changed and the 2.0 suites open no dialog yet; CI runs both
test -e .claude/.contract-change → false
git diff --stat 587499e -- src/protocol src/core docs/adr package.json esbuild.mjs vitest.config.mts → empty (run at d7a79ba)
git grep -n 'console.warn\|RESTORE\|AFTER\|TEST' -- primitives/layers.ts primitives/Popover.test.tsx → no match (probe residue)
```

## Done (tested)

- P5.5 `store/updates.test.tsx` (6): asks under the committed project and flag and nothing without a single project; found rows stream, the enriched answer replaces them; rows kept while revalidating, an unavailable answer is a flag, not empty; a recovery asks again once; a recovery followed by a manual refresh's invalidation asks exactly once (P4 review note); a health event while the answer was available asks nothing.
P5.4 commit b (P5.4 ruling steps 3, 4 and 6):

- `primitives/Listbox.tsx`, `Row.tsx`, `primitives.css`: multi-selection, additive. `selectedIds` and
  `onToggleSelected`; with them the list is `aria-multiselectable`, `aria-selected` is the bulk set, `selectedId` is
  the current row (`aria-current`), each option begins with an `aria-hidden` check mark, and Space, Ctrl+click,
  Cmd+click and a click on the mark toggle (not on a disabled row). Without them nothing changes: every earlier
  Listbox and Row test is unedited and green.
- `installed/rules.ts`: `shownVersion`, `whyNotRemovable` and `IN_PROGRESS`, lifted unchanged from
  `sidebar-next/InstalledSection.tsx` (which re-exports the two functions); `store/outcomes.ts`: `describeOutcome`,
  lifted unchanged from `sidebar-next/outcomes.ts` (now a re-export). The sidebar tests are unedited and green.
- `store/transitive.tsx` (+ 6 tests with the ruling's titles, among them `transitive/metadata answering
  unsupported is no metadata, and the rows come from transitive/get alone`, the P3 review's non-blocking 6) and
  `store/allProjects.tsx` (+ 5 tests with the ruling's titles); both mounted by `StoreProvider` (+1 test).
- `src/test/harness/scenarios.test.ts`: the row's gate scenario (details in `src/test/harness/STATUS.md`).

P5.4 commit a (N61, closed): `store/ops.tsx` `run(type, payload)` records the operation at the call under an id of
the surface (`local:<n>`), with `kind` from the request type and `projectPaths`/`packageIds` read from the payload
(`touchedBy`, every payload shape of the `ops/*` requests); the first chunk of the request names the host's
`opId` and the entry moves under it, keeping what an `ops/progress` report said first; when the request settles,
resolved or rejected, both entries go. New actions `asked`, `named`, `settled`. Tests in `store/ops.test.tsx`: `a
row is busy from the call to run until the request settles`, `a request without an answer leaves nothing busy`
(the two the P3.6 ruling names), `reads the projects and packages an operation touches from what was asked`,
`naming moves the entry under the operation id and keeps what the host reported first`.


P5.1 (ADR-008 primitives `Dialog`, `Popover`, `Tabs`; interaction model §5 and §8; findings U2, U6, U9, N63):

- `primitives/layers.ts`: one stack of open layers per page. Only the topmost answers Escape, traps focus or
  closes on an outside press; `tabbables`, `focusInto`, `restoreFocus` (focus goes back to the opener only
  when it was inside the closing layer or nowhere). Not in the barrel.
- `primitives/Dialog.tsx`: modal, portalled to the body, `role="dialog"` or `alertdialog`, `aria-modal`,
  named by its `h2` title, optional description (a `div`, so it may hold a list) and named close button.
  Focus moves to `initialFocus` or the first tabbable control (the dialog itself when there is none); Tab and
  Shift+Tab wrap; focus that lands outside is taken back; Escape closes and does not reach the page; focus
  returns to the opener. A dialog opened from a dialog stacks, and Escape closes only the top one.
- `primitives/ConfirmDialog.tsx`: the `alertdialog` of interaction model §5 with `confirm-dialog`,
  `confirm-dialog-confirm`, `confirm-dialog-cancel` (§8); opens on Cancel; `busy` disables Confirm.
- `primitives/Popover.tsx`: non-modal `role="dialog"` (named by `label` or `labelledBy`), anchored to an
  element or a point; `placePopover()` puts it below, above when there is more room there, inside the
  viewport by 4 px; placed with `--nuiget-popover-x`/`-y` through `cssVars()` and hidden until placed.
  Escape or Tab past either end closes it and returns focus to the anchor; a press outside (not on the
  anchor, which toggles) closes it and leaves focus there; focus moved out by other means closes it. It
  follows window resize and scroll.
- `primitives/Tabs.tsx`: `tablist`/`tab`/one `tabpanel`; the selected tab is the one tab stop, controls the
  panel and names it; ArrowLeft/ArrowRight (wrapping), Home, End select and focus; an optional count is a
  `Badge` and part of the name ("Updates 3").
- `primitives/Toolbar.tsx`: `role="toolbar"` with a roving tab stop over its enabled controls, written to the
  DOM and kept by a `MutationObserver` (a control that mounts later is no second stop; a disabled stop hands
  it to the first control); ArrowLeft/ArrowRight (wrapping), Home, End; in a text field these move the caret,
  and an arrow leaves the field at the edge of its text.
- `primitives/composed.test.tsx`: the three 1.x dialogs (Source Settings `SourceSettingsOverlay.tsx:85`, its
  Remove Source confirmation `:295`, the Multi Install picker `PackageDetailsPanel.tsx:316`) rebuilt from the
  primitives on a page with the details tabs and a bulk toolbar: no axe violation with the popover open and
  with the confirmation over the settings dialog.
- `primitives/primitives.css`: rules for the layers, tabs and toolbar, a disabled `.nuiget-button` (no
  opacity), focus outlines for tabs, dialogs and popovers; `tokens.css`: `--nuiget-color-widget-bg|fg`
  (aliases of `--vscode-editorWidget-background|foreground`, `Canvas`/`CanvasText` under forced colours).
- `primitives/icons.tsx`: `/* @__PURE__ */` before each of the 26 `React.memo` calls (N63); `layers.ts` has
  no call at module level, so a bundle that uses no layer keeps only the module shells (167 bytes in all);
  `src/test/lint/webview-icons-pure.test.ts`: `every icon is a pure call` and a scanner test.
- `primitives/testSupport.ts`: `installFakeViewport()` (window size and boxes of chosen elements), next to
  `installFakeLayout()`, which it does not change.

P5.3 (the main shell's item; its note is `src/webview/main/STATUS.md`): `search/parseSearchQuery.ts` and its 24
tests, ported unchanged from `src/webview/app/utils/parseSearchQuery.ts`, which the import fence keeps out of the
2.0 webviews. Nothing else in this directory changed.

Before P5.1 (unchanged; details in the commits `3794311`, `81ec41d`, `c48d30b`, `5bc53c1` and their versions
of this note): `tokens.css`; the twelve primitives of P3.2 with the icons, `cssVars`, the barrel and
`testSupport.ts`; the bus (`bus/`) and the store slices `session`, `projects`, `installed`, `ops` with
`useResource` (`store/`) of P3.3; the lint tests `src/test/lint/webview-{colours,tokens,stylesheets}.test.ts`.

## Done (untested)

- In a browser. Nothing of P5.1 is rendered by a surface yet: the main shell (P5.3) is the first consumer of
  `Tabs`, the bulk dialog of P5.4 the first of `ConfirmDialog` and `Toolbar`. jsdom lays nothing out, so the
  look of the layers, the 100vw/100vh limits of a popover, scrolling inside a dialog and the tab underline are
  unverified until the ExTester tests of those items.
- Screen readers. The roles and names are checked by axe and Testing Library; how a reader announces an
  `alertdialog` on open, and whether VS Code's webview passes `aria-modal` on, is P7.4's manual pass.
- `Popover` follows `resize` and `scroll`; no test fires them (placement itself is tested through
  `placePopover` and on open).
- The other notes of P3.2 and P3.3 on layout, the real host and `useResource.ts:85-96` stand.

## Not started

- A menu (`role="menu"`) for the actions menu of a row (Shift+F10, right-click): P5.10 decides between a
  `Popover` of buttons and a menu primitive; the 1.x sidebar asks the host for a native context menu.
- A dimmed backdrop behind a dialog: no `--vscode-*` variable exists for one (P5.11 may revisit).
- The other slices of ADR-008 (`updates`, `transitive`, `search`, `details`, `allProjects`, `sources`): with
  their first consumer (P3.6 ruling): P5.4 to P5.8, P5.2 closes the sweep.
- Space, PageUp/PageDown, type-ahead and multi-selection in `Listbox`: P5 (bulk selection with P5.4).

## Deviations from contract/ADR (file:line each)

P5.4 commit b:

- `installed/rules.ts` also holds `IN_PROGRESS` (the words of a busy row), which the ruling did not list: the main
  panel's rows need it and may not import from `sidebar-next`. Lifted unchanged; `InstalledSection.tsx` imports it.
- `store/transitive.tsx`: the metadata is kept with the result it was asked for, so a newer result shows no
  metadata until its own `transitive/metadata` answer (no icon of a package that may have left the list).
  `restore()` on a closed section opens it and asks with `forceRestore`.
- `store/allProjects.tsx`: when the latest request is answered, chunks and metadata of projects the answer does not
  list are dropped (a project that was deleted does not stay on screen); the ruling did not say what happens to them.
- The harness scenario's two deviations from the ruling's assertions are in `src/test/harness/STATUS.md`.

P5.4 commit a:

- `store/ops.tsx` (`touchedBy`): for an all-projects bulk request the entry lists every project and every package
  of the payload, so `busyPackages` (projects × packages) marks a package busy in a project where it was not
  asked for when its id is asked for in another. That is the shape `OperationProgress` already has for the host's
  own reports; no finer shape exists in the protocol.


P5.1:

- The P3.6 ruling's test wording "every line matching `React.memo(` in that file is preceded by the
  annotation" matches no line: each call is `React.memo<IconProps>(`. `src/test/lint/webview-icons-pure.test.ts`
  matches `React.memo` with or without type arguments, asserts that there are 26 such calls (one per exported
  icon, so the check cannot pass on an empty match) and that each has `/* @__PURE__ */` (or `#__PURE__`)
  directly before it. The ruling names this lint file and `icons.tsx` as the item's files beyond the row.
- `src/webview/shared/tokens.css` and `src/test/lint/webview-tokens.test.ts`: two colour tokens
  (`--nuiget-color-widget-bg`, `-fg`), added as the gotcha row "Colour literal in a 2.0 webview file" prescribes
  (an alias of a `--vscode-*` variable, its name in the token test). Not named by the row.
- `primitives/layers.ts`: a module the row does not name; `Dialog` and `Popover` share the stack, so it is
  neither's. `primitives/testSupport.ts` gains `installFakeViewport()` (test only, not in the barrel).
- `Dialog` is a `div` with `role="dialog"`, not a native `<dialog>` with `showModal()`: jsdom 30.1.2 implements
  no `showModal` (`node_modules/jsdom/lib/jsdom/living/nodes/HTMLDialogElement-impl.js` is an empty class), and
  the stacking, Escape and focus rules are the same for both layer kinds. The page behind is not dimmed (no
  theme colour for a scrim); the layer takes the pointer.
- `Popover` has `role="dialog"` only; ADR-008 says "Popover (portal, collision)" and names no role. A popover
  that opens after a dialog is lifted to `--nuiget-z-dialog` (`.nuiget-dialog-layer ~ .nuiget-popover`) and
  stacks above it by document order; otherwise it is at `--nuiget-z-popover`.
- `Tabs` renders the selected panel only, and only the selected tab has `aria-controls` (a reference to a panel
  that is not in the document fails axe's `aria-valid-attr-value`). Tabs select on focus (automatic
  activation); a panel that loads slowly is the feature's loading state, not a reason for manual activation.
- "Covers all three legacy dialogs" is met at the level of the primitives (the composed test rebuilds them);
  the features port them: Source Settings and Remove Source at P5.8, Multi Install at P5.9 (U2's row).
- ADR-008 "Dialog (focus trap, restore, Escape, `role="dialog"`/`aria-modal`)": `ConfirmDialog` uses
  `role="alertdialog"` with `aria-modal`, the role WAI-ARIA gives a confirmation that interrupts.

P3.3:

- The plan row names `bus/useMessageBus.ts`. The bus itself is `bus/MessageBus.ts` (no React, so it is tested
  without rendering), and the hook with its provider is `bus/useMessageBus.tsx`.
- `bus/MessageBus.ts:49-54` (`listedGeneration`): ADR-008 says `request` exposes the generation "so
  `useResource` can discard a result whose generation is below the one listed for its key". The listing is
  kept by the bus, not by each hook: a hook that mounts or changes its key after an event still knows what
  the event listed, and the listing is set before any handler of the event runs.
- `store/useResource.ts:85-96`: beyond the seven rules, which record an out-of-date answer and do not apply
  it. A surface must also stop loading (interaction model §4: "Loading indicators always clear"). When an
  answer is out of date and nothing newer is on its way, the hook asks once more; a second out-of-date answer
  for the same listing ends as an error with "Retry".
- `store/projects.tsx:44-49`: the generation rule is written out here instead of going through `useResource`,
  because the projects slice must not ask again on an invalidation (rule 2; the `FakeWebview` does not, and
  the request counts of P3.5's expectations rest on it).
- `store/ops.tsx:114-121` (`run`): the slice records the outcome from the response as well as from
  `ops/completed`, once per `opId`. The host announces every outcome, a refusal included
  (`src/host/handlers.ts:153-158`), so the event alone would do; the response is the one terminal message the
  protocol promises (ADR-007), and recording it too means a row of the surface that asked cannot stay busy
  for want of an event. An empty batch is an error response (`handlers.ts:146-151`), which `run` rejects with.
- `store/session.tsx:91-99`: a pending intent is identified by a counter of this surface, not by the
  request id of the bus (the bus does not expose it); the effect is the same: it leaves with its own request.
- `bus/testSupport.ts` (a test-support file next to the code, like `primitives/testSupport.ts`): tests of
  P3.4 and later need the same fake host; it is imported by tests only and is in no bundle.
- Tests beyond the three titles of the row: the rest of the 70, most of them named by the rule they pin
  (`R1:` to `R7:`).

P3.2 (unchanged):

- `primitives/Row.tsx:7-21` (`RowPlacement`): the ruling lists `index`, `setSize`, `active`, `selected`,
  `optionId` as what the list hands to `renderRow`. Two more are needed to render what the ruling's own DOM
  shows on the wrapper: `offset` (the value of `--nuiget-virtual-offset`) and `measureRef` (the virtualizer's
  measuring ref). They are part of the same object, which a consumer spreads into `Row` without reading it.
- `primitives/LiveStatus.tsx:8` (`repeat?: number`): the ruling's prop is `message` alone, and asks that an
  identical consecutive message be announced again. A component cannot see that the same string was set
  twice; the owner changes `repeat` to say so (P3.3's store will count announcements).
- `primitives/Listbox.tsx:89-109`: the ruling restores focus "if the listbox had focus-within", in an effect
  on `[activeId, items]`. By the time an effect runs, a removed row has already taken focus to `body`, so
  "had focus" is read during render (before React changes the document) and used in a layout effect on
  `[activeIndex, items]`; the option is found by `data-index` inside the list, not by `getElementById`.
- `primitives/Listbox.tsx:7-8`: the row heights 24 and 44 repeat the two tokens, as the ruling expects: a
  script cannot read a token before layout (and not at all in jsdom).
- `primitives/Listbox.tsx:143` and interaction model §5: Cmd+Backspace uninstalls on macOS. 1.x handled
  `Delete` only (`src/webview/sidebar/SidebarApp.tsx:1142`); this is an addition, as ruled.
- `primitives/testSupport.ts` (a file the ruling does not name) and the tests that render a `Listbox`: the
  ruling says to stub `getBoundingClientRect` for the virtualization test. With the installed
  `@tanstack/virtual-core` 3.18.0 that is not enough: the virtualizer reads the size of its scroll element
  from `offsetHeight` (`node_modules/@tanstack/virtual-core/dist/esm/index.js:14-16`), which jsdom reports as
  0, and then **no** row is rendered in any test. And axe cannot evaluate `aria-hidden-focus` in jsdom at all:
  `document.elementFromPoint` does not exist, the rule throws, ends as "incomplete", and
  `toHaveNoViolations` accepts that; the ruled negative test for that rule cannot fail without it. So
  `installFakeLayout` defines `offsetHeight`, `offsetWidth`, `getBoundingClientRect` and
  `document.elementFromPoint` for the length of a test and removes them again (no `vi`, so the file also
  compiles under `tsconfig.json`), and `axeRuleOutcome` says under which heading axe filed a rule. The real
  virtualizer runs; nothing of `@tanstack` is mocked. The helper is in `primitives/` because the tests of P3.3
  and P3.4 that render a `Listbox` need it too; it is imported by tests only, the barrel does not export it
  (`composed.test.tsx` asserts that), and it is in no bundle.
- `primitives/SectionHeader.tsx:47-48`: a space between the title and the count badge, which the ruling's
  DOM does not show. Without it the toggle's accessible name is "Installed12".
- `primitives/Banner.tsx:25`: the severity icon of an error is the warning icon. The icon set (a port of
  1.x, P3.1) has no error icon; word and colour tell the two apart.
- `primitives/Sash.tsx`: `controls` is the prop behind the ruled `aria-controls?`. A key and a double-click
  report `onChange` and `onChangeEnd` (a key is a finished change, so the owner persists it); a drag rounds
  to `step`. `ProgressBar.tsx:14` clamps `value` to 0–100.
- `primitives/primitives.css` (focus rule): `.nuiget-button:focus-visible` has the same outline as the four
  selectors the ruling lists; `.nuiget-button` is the class of the ruled buttons in `EmptyState` and
  `Banner`. `Skeleton` rows fade in and out (`nuiget-breathe`), timed with a duration token like every
  other motion; the ruling does not mention an animation.
- `primitives/index.ts`: beyond "named re-exports of every primitive plus the icons" it re-exports the prop
  types and `cssVars` (the owner of a `Sash` needs it for its split property).
- Tests beyond the ruled titles: `Listbox`: `a click selects the row, a click on an action does not`, `never
  takes focus from elsewhere when its items change`, `an empty listbox has no axe violations`; `Row`: three
  around naming, icon and test id; `Badge`, `Spinner`, `LiveStatus`: one or two each around the ruled one;
  `SectionHeader`: `a busy section shows a spinner that adds nothing to the name`; `Sash`: `a horizontal sash
  is dragged up and down, in whole steps`; `composed`: `the barrel exports every primitive, the icons and
  cssVars, and no test support`; the lint file: three scanner tests.
- `src/test/lint/webview-stylesheets.test.ts`: the duration check also refuses a literal `animation-delay` or
  `transition-delay`, and an `animation` or `transition` shorthand that names no duration token at all (it
  would run with the browser's default, outside the reduced-motion answer).
- `.github/copilot-instructions.md`: six gotcha rows where the ruling lists five. The sixth is "axe rule
  skipped in jsdom"; and the row on mocking the virtualizer names `installFakeLayout()` instead of "stub
  `getBoundingClientRect`", for the reason given above.
- Correction to commit a's version of this note: it listed "each primitive imports `./primitives.css`" as a
  deviation. It is not one; ruling step 8 says exactly that ("Every primitive module has `import
  './primitives.css'`; the barrel imports it too").
- `primitives/primitives.css:1-5`: the header says "no important flag" in words, so that the ruling's
  `grep -c '!important'` counts 0.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-14, P5.1: no L1 consultation (the item is not ⚑ and no stop-and-ask trigger fired). The ambient advisor
was consulted before writing; its points are in the code and above: axe over `document.body` for portalled
layers and a required name for every layer; the lint test asserts the count of 26 because the ruling's
pattern matches nothing; the widget tokens under the gotcha row's permission; one stack for both layer kinds;
U6's closing item reconciled to P5.7; the "before" bytes measured after the baseline and before touching
`icons.tsx`; the new focus tests run 40 times.

2026-10-13, P3.3: no L1 consultation (the item is not ⚑ and no stop-and-ask trigger fired). The ambient advisor
was consulted before writing and before the commit; its points are in the code and in "Deviations" above
(no `projects/list` request on invalidation; pending intents leave with their own request; keys built from
the snapshot's path verbatim; the outcome of an operation counted once per `opId`).

2026-10-13, P3.2, ⚑ brief in the plan's §2.4 form (`architecture-advisor`), on `labs/2.0` @ `3794311` with
nothing written. Question: the interaction model's listbox with action buttons in its rows against axe's
`nested-interactive`, `aria-required-children` and `aria-hidden-focus`; four options (listbox with a hidden
sibling actions container, grid, plain list, actions outside the list); the exact DOM and keyboard contract
of `Listbox` and `Row`; how virtualization reaches the DOM under ADR-006; the other ten primitives; the
stylesheet; the tests; the wording of the interaction-model edits; whether the item is split. Answer, verbatim:

`````text
DECISION: Option 1, sharpened: `role="listbox"` → per row a `role="presentation"` wrapper (nothing on it but `className`, `data-*` and the measure `ref`) holding the focusable `role="option"` and a sibling actions container `aria-hidden="true"` whose `IconButton`s are `tabIndex={-1}` with `onMouseDown` prevented; roving `tabIndex`, one `Listbox` component that is always virtualized (no separate `VirtualList` export), single selection now, every action mirrored by a key the listbox handles and announced through the single `LiveStatus`; per-element numbers reach the DOM only as `--nuiget-*` custom properties through React's `style` prop (ADR-006's named mechanism), never as a layout property. One tracker row P3.2, two green commits in a fixed order (a: `Listbox`, `Row`, `IconButton`, `Badge`, `Spinner`, `LiveStatus`, `primitives.css`, tokens, §5/§8, the stylesheet lint test; b: `SectionHeader`, `EmptyState`, `Skeleton`, `ProgressBar`, `Banner`, `Sash`, the barrel, ARCHITECTURE and the gotcha rows). One stylesheet `src/webview/shared/primitives/primitives.css`, imported by every primitive module and by the barrel. `primitives/index.ts` is created in commit b. Not `OWNER MUST DECIDE`: the owner approved the row that recommends this DOM, no frozen path changes, and `contributes` is untouched.

WHY: The brief describes the tree accurately (checked: `src/webview/shared/**` has only `tokens.css`, `primitives/icons.tsx`, `icons.test.tsx`, `STATUS.md`; `src/test/setup-frontend.ts:6-10` registers the matcher; `vitest.config.mts:36-47,70-80`; `package.json:343,353`; `docs/ux/interaction-model.md:48-63,78-82,106-125`; `src/webview/sidebar/components/PackageRow.tsx:95-137` has the button inside the option; `SectionHeader.tsx:31-44` is a `role="button"` div containing action buttons; `DraggableSash.tsx:92-105` mutates `document.body.style`; `App.tsx:3039-3049` positions rows with inline layout styles). The decision is settled by axe-core 4.12.1's own code, not by its documentation: `getOwnedRoles` (`node_modules/axe-core/axe.js:27366`) drops any child that is not visible to screen readers before it looks at roles, so an `aria-hidden="true"` actions container never reaches `aria-required-children`, and it flattens a child whose role is null or presentational only when that child has no global `aria-*` attribute and no `tabindex`, otherwise the child is pushed as an owned element with a null role and fails as "unallowed"; `getMissingContext` walks through null-role parents, so the option inside the wrapper passes `aria-required-parent`; `noFocusableContentEvaluate` (`nested-interactive`) collects every focusable widget descendant and flags `tabindex < 0` as `notHidden`, so a `tabIndex={-1}` button inside the option still fails, which is why the actions must be a sibling and not merely hidden (the quarry note in brief point 3 is right about that, and this is the negative test); `focusableNotTabbableEvaluate` (`aria-hidden-focus`) reads `tabbableElements` only, so `tabIndex={-1}` buttons pass (brief point 6 is right); `option.allowedAttrs` lists `aria-posinset`/`aria-setsize`, `separator` has `requiredAttrs: ['aria-valuenow']` with `ariaRequiredAttrEvaluate` exempting only non-focusable separators (the Sash is focusable, so it carries the attribute), `progressbar` has `accessibleNameRequired: true`, `listbox` allows `aria-multiselectable` for P5. Roving `tabIndex` over `aria-activedescendant` because §5's "visible on `:focus-within`" needs real focus inside the wrapper, and because P3.5's ExTester tests can read `document.activeElement`; the unmount hazard of a virtual list is closed by a `rangeExtractor` that keeps the active index mounted (`defaultRangeExtractor` is exported, `@tanstack/virtual-core/dist/esm/index.d.ts:36`). Options 2 to 4 contradict the owner-approved model and test ids (§5 and §8 say listbox) or lose selection semantics. ADR-006:22-23 reads "styles are set through the CSSOM (React's `style` prop), never as `<style>` or a `style` attribute in rendered HTML": the `style` prop is the permitted mechanism, the icons lost it in P3.1 because they did not need it; jsdom 30 serializes custom properties (`node_modules/jsdom/lib/jsdom/living/css/CSSStyleDeclaration-impl.js:140,324`), so the test can read them back. Virtual-core's `observeElementRect` seeds from `getBoundingClientRect` and no-ops without `ResizeObserver`, and `scrollWithAdjustments` optional-calls `scrollTo`, so the real virtualizer runs under jsdom when the test stubs the rects; the 1.x tests mock `useVirtualizer` (`InstalledTab.test.tsx:7-11`), which hides exactly what this item must prove. Two commits in one row have precedent (`2dcd3c6`/`9e2ebbc` for P0.13, `b8bfb9c`/`25e9a82` for P1.3, `e080e1f`/`2f903e7` for P1.6); plan line 208 reserves two sessions for P1.1b alone, so the second commit is not a second row and not a licence for a second session.

DO:
1. Tokens (`src/webview/shared/tokens.css`, `src/test/lint/webview-tokens.test.ts`): no new token. The spinner and the indeterminate bar time themselves with `calc(var(--nuiget-duration-normal) * 5)` (1 s; 0 under reduced motion through the one existing rule). Change `--nuiget-row-height-compact` from `22px` to `24px` so the 24 px `IconButton` target fits a compact row (WCAG 2.5.8, U11); the tokens test checks names, not values. Record it under Deviations in the STATUS note and in the U11 ledger row as "compact row 24 px for WCAG 2.5.8; P3.6 may revert by value".
2. `src/webview/shared/primitives/cssVars.ts`: `export function cssVars(vars: Partial<Record<`--nuiget-${string}`, string>>): React.CSSProperties` (one cast inside). It is the only way a primitive produces a `style` prop; `src/test/lint/webview-stylesheets.test.ts` (step 11) and each component test assert that every `[style]` in rendered output matches `/^(--nuiget-[a-z0-9-]+: [^;]+;\s*)+$/`.
3. `Row` (`primitives/Row.tsx`). Props: `itemId: string` (test id `package-row-${itemId.toLowerCase()}`), `name: string`, `version?: ReactNode`, `description?: string`, `icon?: ReactNode` (comfortable only), `badges?: ReactNode` (`Badge`s), `status?: string` (e.g. "Updating", "Unresolved"), `busy?: boolean`, `disabled?: boolean`, `actions?: ReactNode` (`IconButton`s with `tabIndex={-1}` and `data-testid="row-action-<name>"`), `density: 'compact' | 'comfortable'`, and the list props the `Listbox` passes through `renderRow`: `index`, `setSize`, `active`, `selected`, `optionId`. DOM, exactly:
   `div.nuiget-row.nuiget-row--{density}[.nuiget-row--busy][role="presentation"][data-index={index}][data-testid="package-row-<id>"]` (ref = `measureElement`; `style` = `cssVars({ '--nuiget-virtual-offset': `${start}px` })` and nothing else; no `aria-*`, no `tabIndex`)
   → `div.nuiget-row-option[role="option"][id={optionId}][tabIndex={active ? 0 : -1}][aria-selected={selected}][aria-posinset={index + 1}][aria-setsize={setSize}][aria-busy="true" when busy][aria-disabled="true" when disabled][aria-labelledby=`${optionId}-title`][aria-describedby=`${optionId}-desc` when badges, description or status exist]`
     → `span.nuiget-row-title[id=…-title]` holding `span.nuiget-row-name` (name) and `span.nuiget-row-version` (version); the icon before it, `aria-hidden` or an `img` with `alt=""`
     → `span.nuiget-row-desc[id=…-desc]` holding badges, `span.nuiget-row-description`, and `span.nuiget-row-status` (visually hidden when the density has no room; always in the DOM when `status` is set)
   → `div.nuiget-row-actions[aria-hidden="true"]` with `onMouseDown={e => { e.preventDefault(); optionRef.current?.focus(); }}` (Chromium focuses a clicked button even at `tabIndex -1`, which would park focus inside an `aria-hidden` subtree); it renders `actions` or, when `busy`, one decorative `Spinner`; when `disabled` it renders nothing.
   No `aria-label` on the option (WCAG 2.5.3): the name is the visible id and version, the description carries badges, description and status. Everything is a `span`/`div`; no `button` or other widget inside the option.
4. `Listbox` (`primitives/Listbox.tsx`), generic over `T extends { id: string }`. Props: `items: readonly T[]`, `renderRow: (item: T, list: { index; setSize; active; selected; optionId }) => ReactNode` (returns a `Row`), `label: string` or `labelledBy: string` (one required), `hint: string` (required; the visually hidden sentence naming the keys, composed by the consumer, e.g. "Enter uninstalls. Shift+F10 opens the actions menu."), `testId: string`, `density`, `estimateSize?: number` (default 24 compact, 44 comfortable; note in STATUS that these numbers duplicate the two tokens because JS cannot read a token in jsdom), `overscan?: number` (default 5), `selectedId?: string | null`, `onSelect?(item)`, `onActivate?(item)`, `onSecondaryActivate?(item)`, `onDelete?(item)`, `onContextMenu?(item, anchor: { x: number; y: number })`, `busy?: boolean` (`aria-busy` on the listbox while revalidating), `empty?: ReactNode`. DOM:
   `div.nuiget-listbox-root` (flex column, `min-height: 0`) → `div.nuiget-listbox[role="listbox"][aria-label | aria-labelledby][aria-describedby={hintId}][aria-busy?][data-testid={testId}]` (the scroll element: `flex: 1; min-height: 0; overflow: auto`; no `tabIndex`) → `div.nuiget-listbox-sizer` (role-less, no aria; `style` = `cssVars({ '--nuiget-virtual-total': `${getTotalSize()}px` })`) → the rows from `renderRow` for `getVirtualItems()`; after the listbox, `span.nuiget-visually-hidden[id={hintId}]` with `hint`. With zero items the `role="listbox"` element is not rendered; instead `div.nuiget-listbox-empty[tabIndex=-1]` wraps `empty`, and the component focuses it when the list had focus-within (the screen reader reads the empty text; nothing lands on `body`). Virtualizer: `useVirtualizer({ count, getScrollElement, estimateSize: () => estimateSize, overscan, getItemKey: i => items[i].id, measureElement: (el) => el.getBoundingClientRect().height || estimateSize, rangeExtractor: range => { const set = new Set(defaultRangeExtractor(range)); if (activeIndex >= 0 && activeIndex < count) set.add(activeIndex); return [...set].sort((a, b) => a - b); } })`. State: `activeId` (internal, keyed by id so it survives reorders); `selected` is controlled by `selectedId`. Event delegation on the listbox element: `onFocus` (focusin) sets `activeId` from `closest('[data-index]')`; `onClick` on an option → `onSelect(item)`; `onContextMenu` anywhere in a row → `onContextMenu(item, { x: e.clientX, y: e.clientY })` with `preventDefault`; `onKeyDown`: ArrowDown/ArrowUp move the active row by one, Home/End to first/last (each: `preventDefault`, set active, `scrollToIndex(i, { align: 'auto' })`, focus in an effect after render), Enter → `onActivate`, Ctrl+Enter or Meta+Enter → `onSecondaryActivate`, Delete or Meta+Backspace → `onDelete`, Shift+F10 or `key === 'ContextMenu'` → `onContextMenu(item, { x: rect.left, y: rect.bottom })` of the option. Enter, Ctrl+Enter and Delete are ignored when the option has `aria-disabled="true"` (read from the DOM, so Row and Listbox cannot disagree); Space, PageUp/PageDown, type-ahead, Left/Right and Escape are not handled (they bubble; Space and `aria-multiselectable` come with P5's bulk toolbar; design `selectedId` so a `selectedIds` set is additive). Focus effect: on `[activeId, items]`, if the active id vanished, active becomes the item at `min(oldIndex, items.length - 1)`; if the listbox had focus-within, `getElementById(optionId)?.focus({ preventScroll: true })` after `scrollToIndex`.
5. `IconButton`: `button.nuiget-icon-button[type="button"][aria-label={label}][title={label}][aria-pressed?][disabled?][tabIndex?][data-testid?]` with the icon child `aria-hidden`; `label` required; `min-width`/`min-height: var(--nuiget-target-min)`. `Badge`: `span.nuiget-badge.nuiget-badge--{tone}` with `label`; when `title` is given, `span[aria-hidden="true"]{label}` + `span.nuiget-visually-hidden{title}` so the row description reads "Centrally managed", not "CPM"; no `aria-label` on a span (axe `aria-prohibited-attr`). `Spinner`: `span.nuiget-spinner` around `LoadingIcon` with `title={label}` (named → `role="img"`; unnamed → `aria-hidden`), animation `nuiget-spin calc(var(--nuiget-duration-normal) * 5) linear infinite`.
6. `LiveStatus`: `div.nuiget-visually-hidden[role="status"][aria-live="polite"][aria-atomic="true"][data-testid="status-live"]`, prop `message: string | null`, mounted from the first render of the surface (a live region announces changes only); an identical consecutive message is re-announced by clearing the text and setting it on the next animation frame. No queue and no store (P3.3): it shows the latest message. The shell does not duplicate `Banner` text into it.
7. `SectionHeader`: `div.nuiget-section-header` → `h2|h3` (`level` prop, default 2) → `button.nuiget-section-toggle[type="button"][aria-expanded][aria-controls={contentId}][data-testid=`section-header-${testKey}`]` holding `ChevronRightIcon` (aria-hidden, rotated by CSS when expanded), `span.nuiget-section-title[id]` and, when `count !== undefined`, a `Badge`; `busy` renders a decorative `Spinner` inside the button; `actions` render in a sibling `div.nuiget-section-actions` after the heading, never inside the button (1.x's `role="button"` div with buttons inside is the `nested-interactive` the item exists to remove). The title span's `id` is what a `Listbox` passes as `labelledBy`. `EmptyState`: `div.nuiget-empty[data-testid?]` → `p.nuiget-empty-text{message}` + optional `button.nuiget-button[type="button"]{action.label}`; no role, no `tabIndex` (the focus target is the Listbox's container around it). `Skeleton`: `div.nuiget-skeleton[aria-hidden="true"]` with `rows` (default 3) × `div.nuiget-skeleton-row.nuiget-skeleton-row--{density}`; no text, no role: the "Loading …" of §4 is the `LiveStatus` message. `ProgressBar`: `div.nuiget-progress[.nuiget-progress--indeterminate][role="progressbar"][aria-label={label}][aria-valuemin="0"][aria-valuemax="100"][aria-valuenow={value} only when determinate]` → `div.nuiget-progress-bar`; `style` = `cssVars({ '--nuiget-progress-value': `${value}%` })` when determinate; `label` required. `Banner`: `div.nuiget-banner.nuiget-banner--{severity}[role={severity === 'error' ? 'alert' : 'status'}][data-testid?]` → severity icon (aria-hidden), `span.nuiget-visually-hidden{`${Severity}: `}`, `span.nuiget-banner-text{children}`, optional `button.nuiget-button.nuiget-button--secondary[type="button"]{action.label}`; a second `role="status"` is acceptable here because the message must announce when it appears (WCAG 4.1.3); P3.4 tests scope `getByRole('status')` by test id. `Sash`: `div.nuiget-sash.nuiget-sash--{orientation}[role="separator"][tabIndex=0][aria-orientation][aria-valuenow={value}][aria-valuemin={min}][aria-valuemax={max}][aria-label={label}][aria-controls?][data-testid="sash"]`; props `value`, `min` (20), `max` (80), `defaultValue` (50), `step` (1), `orientation`, `label`, `onChange(value)`, `onChangeEnd?(value)`; keys: the two arrows along the axis ±step, Shift+arrow ±10·step, Home → min, End → max, Enter → `defaultValue` (keyboard twin of double-click, WCAG 2.5.7); pointer: Pointer Events with `setPointerCapture`, percent from `parentElement.getBoundingClientRect()`, clamped, `touch-action: none` and the cursor in CSS; the sash renders no `style`: the parent sets `--nuiget-split` on its layout container with `cssVars`. The hit area is widened to 24 px with a `::after` overlay around a 4 px visual.
8. `primitives.css`: class prefix `nuiget-`, BEM-lite modifiers (`--compact`, `--busy`, `--error`); `.nuiget-visually-hidden` (clip pattern) once; rows: `.nuiget-listbox-sizer { position: relative; height: var(--nuiget-virtual-total) }`, `.nuiget-row { position: absolute; inset: 0 auto auto 0; width: 100%; transform: translateY(var(--nuiget-virtual-offset)) }`, `.nuiget-row-actions { visibility: hidden }`, `.nuiget-row:hover .nuiget-row-actions, .nuiget-row:focus-within .nuiget-row-actions, .nuiget-row--busy .nuiget-row-actions { visibility: visible }`; focus ring `.nuiget-row-option:focus-visible, .nuiget-icon-button:focus-visible, .nuiget-sash:focus-visible, .nuiget-section-toggle:focus-visible { outline: 1px solid var(--nuiget-color-focus); outline-offset: -1px }` (an outline, not a shadow, so it survives forced colours; the token is already `Highlight` there); `forced-color-adjust: none` only on `.nuiget-row-option[aria-selected="true"]`, `.nuiget-badge` and `.nuiget-progress-bar`, whose tokens already map to system colours; every duration is a `var(--nuiget-duration-*)` or a `calc()` of one; no `@media (prefers-reduced-motion)`, no `!important`, no `px` font size, no colour literal. Every primitive module has `import './primitives.css'`; the barrel imports it too.
9. Tests, frontend project, one `*.test.tsx` per primitive, each ending with `has no axe violations` on its own render. Titles the gate should read: `Row`: `the option is named by id and version and described by badges and status`, `the row wrapper carries no aria attribute and no tabindex`, `the actions container is hidden from assistive technology and its buttons are not tabbable`, `clicking an action keeps focus on the option`, `a busy row is aria-busy and shows a spinner instead of its actions`, `a disabled row renders no actions`, `the only inline style is the virtual offset custom property`. `Listbox`: `renders rows as options with posinset and setsize`, `ArrowDown, ArrowUp, Home and End move the active option and the roving tabindex`, `Enter activates, Ctrl+Enter and Meta+Enter are the secondary action`, `Delete and Meta+Backspace delete the active item`, `Shift+F10 and the ContextMenu key report the active item with an anchor`, `right-click on a row reports the item`, `a disabled option ignores Enter, Ctrl+Enter and Delete but keeps focus and the context menu`, `the active row follows its id when items reorder`, `when the active item disappears focus moves to the row at its index`, `when the list empties the empty container takes focus`, `only the rows in view plus overscan are rendered, and the active row stays mounted off-screen` (stub `vi.spyOn(Element.prototype, 'getBoundingClientRect')` keyed on `this`: `[role="listbox"]` → the viewport height, `[data-index]` → the row height, installed before render; never mock `useVirtualizer`), `the only inline styles are the virtual total and offsets`, `a listbox with rows, badges and actions has no axe violations`. Negative, in `Listbox.test.tsx`, each asserting `violations.map(v => v.id)` contains the rule: `a button inside an option is a nested-interactive violation` (also with `tabindex="-1"`), `a wrapper with aria-busy between listbox and option is an aria-required-children violation`, `a tabbable button under aria-hidden is an aria-hidden-focus violation`. `IconButton`: `has the accessible name it is given`, `passes tabIndex, pressed and disabled through`. `Badge`: `reads its title to assistive technology when one is given`. `Spinner`: `is decorative without a label and an image with one`. `LiveStatus`: `is a polite atomic status region with the test id`, `re-announces an identical message`. `SectionHeader`: `is a heading with a toggle button that reports aria-expanded and aria-controls`, `actions are outside the button`, `the count renders as a badge`. `EmptyState`: `renders the sentence and the optional action`. `Skeleton`: `renders the number of rows asked and is hidden from assistive technology`. `ProgressBar`: `determinate exposes the value, indeterminate omits aria-valuenow`, `the only inline style is the progress custom property`. `Banner`: `warning and info are status, error is alert`, `the severity is spoken before the text`, `the action is a button`. `Sash`: `is a focusable separator with value, min, max and orientation`, `arrows, Shift+arrows, Home, End and Enter change the value within the clamps`, `dragging reports clamped percentages and the end value`, `renders no inline style`. Plus `primitives/composed.test.tsx`: `SectionHeader, Listbox with three rows and actions, Banner and LiveStatus together have no axe violations`.
10. Interaction model edits (`docs/ux/interaction-model.md`). Replace the §5 keyboard paragraph (lines 78-82) with: "Keyboard: every pointer action is reachable by keyboard. A list is a `role="listbox"` whose rows are `role="option"` with roving `tabIndex` (one tab stop per list; the active row has `tabIndex=0`). ArrowUp/ArrowDown move, Home/End jump to the first and last row; moving changes the active row, not the selection. Enter activates the row (main panel: selects it and shows its details; sidebar: performs its primary action), Ctrl+Enter (Cmd+Enter on macOS) performs the secondary action, Delete (Cmd+Backspace on macOS) uninstalls where applicable, and Shift+F10 or the ContextMenu key opens the actions menu for the active row; right-click anywhere on the row opens the same menu. Row action buttons are pointer-only: they sit next to the option in a container hidden from assistive technology (`aria-hidden="true"`, `tabIndex={-1}`), become visible on `:hover` and `:focus-within` of the row, and clicking one keeps focus on the row. Each listbox describes its keys in a visually hidden sentence (`aria-describedby`); outcomes are announced through the one `role="status"` region (`status-live`). A row with a pending operation is `aria-busy="true"`, its status text is part of its description and a spinner replaces its actions. A disabled row (`aria-disabled="true"`, e.g. unresolved) keeps focus, selection and the context menu but ignores Enter, Ctrl+Enter and Delete. When the active row disappears, focus moves to the row now at its index (or the last one); when the list empties, the empty-state container takes focus." Note in the STATUS that Cmd+Backspace is an addition over 1.x (`SidebarApp.tsx:1142` handled `Delete` only) and that Space, PageUp/PageDown and multi-selection are reserved for P5. §8: change the `package-row-<id>` cell to "A row (id lower-cased): the wrapper around the option and its pointer actions; the option is the `role="option"` inside it (read `aria-selected` there)"; add `row-action-<name>` | "A pointer action button inside a row (`install`, `update`, `uninstall`, `more`); hidden from assistive technology, mirrored by the keys of §5"; add `section-header-<name>` | "The toggle button of a collapsible section (`installed`, `updates`)"; `status-live` and `sash` unchanged. §4 needs no edit: "Skeleton rows (3) + `role="status"` text" is the Skeleton plus the `LiveStatus` message.
11. `src/test/lint/webview-stylesheets.test.ts` (backend project; the folder is included): over every `.css` under `src/webview/{shared,main,sidebar-next}` except `tokens.css`: `no reduced-motion rule outside tokens.css`, `no !important`, `no px font size`, `every animation and transition duration is a duration token`, `every class selector starts with .nuiget-`, and for `primitives.css` specifically `row actions are shown on hover and focus-within of the row` (the two selectors of step 8 are present). Add this file to the item's files under this ruling.
12. Order and commits. Commit a: steps 1-6, 8 (the rules those primitives need), 9 (their tests), 10, 11, CHANGELOG `### Added` `**2.0 webview primitives** — …` (first version), tracker and STATUS; message `feat(webview/shared): listbox, row and the first primitives (P3.2, ADR-008, ADR-006, U1, U3, U7, U11)`. Commit b: step 7 and its tests, the composed test, `primitives/index.ts` (named re-exports of every primitive plus `export * from './icons'`, and `import './primitives.css'`), ARCHITECTURE and the gotcha rows, CHANGELOG entry completed; message `feat(webview/shared): section header, status, empty, skeleton, progress, banner and sash (P3.2, ADR-008, U1, U6, U11)`. Each commit passes `npx tsc --noEmit`, `npm run check-types`, `npx eslint src`, `npx vitest run --project frontend src/webview/shared`, `npx vitest run --project backend src/test/lint`, `npm test`, `npm run bench` before push; `package:vsix`, `check:vsix`, `docs:protocol:check`, `test:ui` SKIPPED with the literal reason (no host, packaging, protocol or UI file changed). If the session must end after commit a, the row is `in progress` with "Exact next step: P3.2 commit b" in both STATUS files; that is not a split and not a second row.
13. Docs in commit b. ARCHITECTURE.md: the `src/webview/shared/**` row (line 104) gains "primitives present since P3.2 (`primitives/index.ts`)", and a subsection "Primitives and the listbox contract" under the 2.0 section: the Row DOM sketch, why the actions are a hidden sibling, the keyboard table, how numbers reach the DOM (`cssVars`, custom properties, stylesheet owns the property), one stylesheet, the live region. Gotcha rows (2.0 table): "Buttons inside `role="option"`" → axe `nested-interactive` fails even at `tabIndex -1`; actions live in the `aria-hidden` sibling container and every one has a key in the listbox; "Attributes on the row wrapper" → nothing but `className`, `data-*` and the ref on the `role="presentation"` wrapper, or `aria-required-children` fails; "Inline style in 2.0 webviews" → only `cssVars()` with `--nuiget-*` properties, the stylesheet owns the real property, the tests read `style.cssText`; "`useVirtualizer` mocked in tests" → never in 2.0 tests, stub `getBoundingClientRect` instead; "New primitive without its stylesheet import" → each primitive module imports `primitives.css`. Ledger: U1 progressed (closes at P3.4), U3 progressed (static focus ring; closes P5.11), U6 progressed (`IconButton` requires a name; closes P5.1), U7 progressed, U11 progressed with the 24 px note, U12 progressed by the §5 rewrite. Coverage: run `npx vitest run --coverage`, paste the `src/webview/**` figure, leave `vitest.config.mts` untouched (P3.6 decides the ratchet).

DO NOT:
- Put a `button`, `tabIndex`, or any focusable element inside the `role="option"`, at any `tabIndex`.
- Put an `aria-*` attribute or `tabIndex` on the `role="presentation"` wrapper, or `aria-label` on the option, a `Badge` span or any role-less span.
- Use `aria-activedescendant`, `inert` on the actions (it blocks pointer events too), `aria-keyshortcuts` per option, or `display: none` for hidden actions.
- Handle Space, PageUp/PageDown, Left/Right, Escape or type-ahead in the `Listbox`, or add `aria-multiselectable` now.
- Mock `useVirtualizer` or `@tanstack/react-virtual` in any 2.0 test; stub `getBoundingClientRect` and let the real virtualizer run.
- Render a layout property (`height`, `transform`, `width`, `top`) through the `style` prop; only `--nuiget-*` custom properties through `cssVars`.
- Add a token for the spin duration, a `prefers-reduced-motion` or `forced-colors` block, a colour literal or `!important` to `primitives.css`.
- Give `Skeleton`, `EmptyState` or `Banner` the test id `status-live`, or make `Skeleton` a live region; keep `LiveStatus` the one `status-live`.
- Put `tabIndex` on `EmptyState`; the Listbox's empty container is the focus target.
- Mutate `document.body.style` or add document-level mouse listeners in `Sash`; use pointer capture.
- Create tracker rows `P3.2a`/`P3.2b`, change `vitest.config.mts`, `eslint.config.mjs`, `esbuild.mjs`, `package.json`, CI, `src/protocol/**`, `src/core/contracts.ts` or `docs/adr/**`; import `tokens.css` from any entry (P3.4).
- Edit interaction-model §4, or any 1.x component or test.

CONTRACT CHANGE: none. `src/protocol/**`, `src/core/contracts.ts` and `docs/adr/**` stay as they are (ADR-008:29-32 lists primitives as a floor; `Listbox`, `Spinner`, `ProgressBar` and `Banner` are the plan row's additions); `.claude/.contract-change` must not exist. `docs/ux/interaction-model.md` is not frozen and the row names it. Approved as files the row does not name: `src/test/lint/webview-stylesheets.test.ts` (new), one assertion list in `src/test/lint/webview-tokens.test.ts` only if a token is added (none is), `src/webview/shared/primitives/cssVars.ts`, `primitives.css`, `primitives/index.ts`, `composed.test.tsx`.

VERIFY: `npx vitest run --project frontend src/webview/shared` green with the titles of step 9, including the three negative axe tests and the composed test; `npx vitest run --project backend src/test/lint` green with the six titles of step 11; `grep -c 'role="presentation"' src/webview/shared/primitives/Row.tsx` → 1 and `grep -nE '<button|tabIndex' src/webview/shared/primitives/Row.tsx` shows no button and no tabIndex inside the option markup; `grep -rn "style={{" src/webview/shared/primitives/*.tsx` → 0 lines (every style goes through `cssVars`); `grep -rn "vi.mock('@tanstack" src/webview/shared` → 0; `grep -c 'prefers-reduced-motion' src/webview/shared/primitives/primitives.css` → 0 and `grep -c '!important' …/primitives.css` → 0; `grep -n 'row-height-compact' src/webview/shared/tokens.css` shows `24px`; `grep -n 'row-action-<name>\|section-header-<name>\|Cmd+Backspace' docs/ux/interaction-model.md` → three hits; `npx tsc --noEmit && npm run check-types && npx eslint src` → 0 each; `npm test` and `npm run bench` green; `git log --oneline -2` shows the two P3.2 commits, each with a green CI run; `test -e .claude/.contract-change` → false; `git diff --stat labs/2.0@{upstream}~2 -- vitest.config.mts eslint.config.mjs esbuild.mjs package.json src/protocol src/core docs/adr` → empty.

FILES CHECKED: `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:41-175,240-251,270-286,208`; `docs/plans/STATUS.md:21-82,431,1264-1356` and its phase-review headings; `docs/plans/findings-ledger.md:76-87,245-256,307-311`; `docs/ux/interaction-model.md` (whole); `docs/adr/006-icons-and-csp.md`, `docs/adr/008-webview-architecture.md` (whole); `src/webview/shared/STATUS.md` (whole), `tokens.css` (whole), `primitives/icons.test.tsx` (whole); `src/test/setup-frontend.ts`; `src/test/lint/webview-tokens.test.ts`, `webview-colours.test.ts` (whole); `vitest.config.mts:1-80`; `eslint.config.mjs:1-80`; `package.json:310-360`; `ARCHITECTURE.md:104,160-192`; `CHANGELOG.md:1-25`; `.github/instructions/a11y.instructions.md:1-120,237-243,297-304,484-493,665,724-738`; `scripts/hooks/guard.mjs:4-16,67-81,167`; `src/webview/sidebar/components/PackageRow.tsx`, `SectionHeader.tsx`, `src/webview/app/components/DraggableSash.tsx` (whole); `src/webview/app/App.tsx:1803-1807,3025-3060`; `src/webview/app/components/InstalledTab.test.tsx:1-11`; `src/webview/sidebar/SidebarApp.tsx:1132-1146`; `src/webview/main/`, `src/webview/sidebar-next/` listings; `node_modules/axe-core/axe.js` (`getOwnedRoles` at 27366, `ariaRequiredChildrenEvaluate`, `getMissingContext`, `noFocusableContentEvaluate`, `getFocusableDescendants`, `usesUnreliableHidingStrategy`, `focusableNotTabbableEvaluate`, `ariaRequiredAttrEvaluate`, the `option`, `listbox`, `separator`, `progressbar`, `status`, `presentation` role entries; version 4.12.1); `node_modules/jsdom/lib/jsdom/living/css/CSSStyleDeclaration-impl.js:140,324,415,461` (jsdom 30.1.2); `node_modules/@tanstack/react-virtual/dist/esm/index.d.ts:2,48`, `node_modules/@tanstack/virtual-core/dist/esm/index.d.ts:36,63,72,74`, `.../index.js` (`observeElementRect`, `measureElement`, `calculateRangeImpl`, `scrollWithAdjustments`; 3.14.14 / 3.18.0); `git log --oneline -60` (clean at `3794311`; multi-commit precedents P0.13, P1.3, P1.6). Not checked (outside the repository): the quarry's `STATUS.md`, taken from the brief's excerpt; its claim about `nested-interactive` is confirmed by the axe source, its plan to set custom properties in effects is replaced by the `style` prop, which ADR-006 names. The ambient advisor was consulted twice and agreed with the decision; the four points where this ruling differs from its suggestions (one stylesheet, the test id on the wrapper, the empty container as focus target, the 24 px compact row) are recorded above with their reasons.
`````

2026-10-13, P3.1, stop-and-ask in the plan's §2.4 form (`architecture-advisor`). Question: `jest-axe` is not
installed and `package.json` is not named by the row; which dependency, how is the matcher wired and typed
under Vitest, what are the tokens, what is the tool behind "hex colours only in `tokens.css`", is the file
bundled now, and how far does the icon port go? Answer, verbatim:

`````text
DECISION: Option B, sharpened: `jest-axe` (`^11.0.0`, caret like every other entry) as the only new devDependency, no `@types/jest-axe`; the matcher is registered globally in `src/test/setup-frontend.ts`; the Vitest type augmentation (and, if `jest-axe` ships no types, an ambient module declaration of the three exports the tests use) lives in a new `src/test/jest-axe.d.ts` that `tsconfig.vitest.json` lists; `package.json`, `package-lock.json` and that `tsconfig.vitest.json` line are the item's files under this ruling. `tokens.css` is custom properties only (`--nuiget-*`), colours as `--vscode-*` aliases with `--vscode-*` fallbacks, zero hex in P3.1, HC/forced-colors/reduced-motion blocks and no light/dark blocks, imported by nothing until P3.4. All 26 icons ported, no `PackageIcon`/`BookIcon`, no barrel. The hex gate becomes two lint-as-tests in `src/test/lint/`. Not `OWNER MUST DECIDE`: the owner approved the row that names `jest-axe`, and `contributes` does not change.

WHY: The brief describes the tree accurately (checked: `src/test/setup-frontend.ts:5-18`; `tsconfig.vitest.json:26-29,46-56`; `vitest.config.mts:36-47,72-80`; `src/webview/app/icons.tsx:11-16` and 26 `export const` lines; `src/host/services.ts:103-131`; `esbuild.mjs:13-24,77-100`; `.claude/settings.json` allows exactly `Bash(npm install)` and `Bash(npm ci)`; `src/webview/shared` does not exist). The row (plan line 244) names `jest-axe` in `setup-frontend.ts`, so adding it is the item's work, not a "resource suggests it" install (`.github/copilot-instructions.md:35` is about Awesome Copilot templates); §2.1 makes a config file the item names one of its files, and the P2.11 ruling (`docs/plans/STATUS.md:1264`) is the precedent for approving one `tsconfig.vitest.json` include line here. Option A is wrong for this tree, not just redundant: `@types/jest-axe` depends on `@types/jest`, whose global `describe`/`it`/`expect` declarations would sit next to `vitest/globals` in the `tsconfig.vitest.json` program (brief point 2 is right that its `jest.Matchers` augmentation does nothing for Vitest), and the quarry's "no `tsc` impact" claim rested on tests not being type-checked, which P0.11 ended. Option C re-implements what jest-axe encodes (its default disables the `region` rule, which otherwise fails every primitive rendered in isolation) and departs from the row's text; D is unmaintained. ADR-008:33-35 wants tokens for layout, motion and typography with "theme coverage ... in one place" and "no hex outside tokens": a permission for `tokens.css`, not a requirement; every VS Code theme colour reaches a webview as a `--vscode-*` variable, so aliases cover light and dark by construction and only high contrast (`--vscode-contrastBorder`, no shadows) and `forced-colors` (system colour keywords) need their own blocks; U4, U5, U7, U9 and U11 (`docs/plans/findings-ledger.md:248-255`) are what the tokens progress, and P5.11 (plan line 284) is where they close. ADR-006:22-23 forbids a `style` attribute in rendered HTML; the 1.x icons also render `aria-hidden="false"` on titled icons (`aria-hidden={!title}`), which the port corrects. CSS needs nothing in `esbuild.mjs`: 1.x gets `dist/webview.css` from `import './App.css'` in `App.tsx:3` with no loader entry, and the 2.0 entries are P3.4's and P5.3's files, so `tokens.css` stays unbundled until P3.4 and the STATUS note says so.

DO:
1. Dependency: edit `package.json` devDependencies by hand, `"jest-axe": "^11.0.0"` after `"jsdom"`; run `npm install` (pre-approved; `npm install --save-dev` is not); check `git status --porcelain --untracked-files=all` shows only `package.json` and `package-lock.json`, and `grep -c '"node_modules/jest-axe"' package-lock.json` → 1 and `ls node_modules/@types | grep -c jest` → 0; run `npm ci` once (ADR-000:45) and `npm audit` and paste both summary lines into the STATUS note (licences: jest-axe MIT, axe-core MPL-2.0, development only; `npm run check:vsix` proves nothing ships).
2. Decide the typing shape from the installed package: `grep -n '"types"' node_modules/jest-axe/package.json; ls node_modules/jest-axe/*.d.ts`. If it ships types, `src/test/jest-axe.d.ts` holds only the Vitest augmentation. If not (expected), it also holds `declare module 'jest-axe'` with the exports the tests use: `axe(html: Element | string, options?: object): Promise<AxeResults>`, `configureAxe(options?: object): typeof axe`, `toHaveNoViolations: { toHaveNoViolations(results: AxeResults): { pass: boolean; message(): string } }`, where `AxeResults` is a self-contained interface (`violations: Array<{ id; impact?; help; helpUrl; nodes: Array<{ html; target: string[] }> }>`), no import from `axe-core` (a transitive package; importing it would be a phantom dependency). The Vitest part: `declare module 'vitest' { interface Assertion<T = unknown> { toHaveNoViolations(): T } interface AsymmetricMatchersContaining { toHaveNoViolations(): unknown } }`, mirroring `node_modules/@testing-library/jest-dom/types/vitest.d.ts`. Add `"src/test/jest-axe.d.ts"` to the `include` of `tsconfig.vitest.json` next to `src/test/setup-frontend.ts`.
3. `src/test/setup-frontend.ts`: add `import { toHaveNoViolations } from 'jest-axe';` and `expect.extend(toHaveNoViolations);` (globals are on). It applies to the 1.x frontend tests too; that is additive and harmless. No helper in `src/test/helpers/frontend.tsx`; tests write `expect(await axe(container)).toHaveNoViolations()`. Record `npx vitest run --project frontend` wall time before and after in the STATUS note.
4. `src/webview/shared/tokens.css`: only custom-property declarations, no element rules (body font and colour belong to the entry CSS of P3.4). `:root`: `--nuiget-space-1..6` (2, 4, 6, 8, 12, 16 px); `--nuiget-radius-sm|md` (2, 4 px); `--nuiget-row-height-compact|comfortable` (22, 44 px, starting values P3.4/P5.3 may retune by value, never by name); `--nuiget-icon-size-sm|md|lg` (12, 16, 24 px); `--nuiget-target-min: 24px` (U11, P5.11's "≥ 24 px targets"); `--nuiget-z-sticky|popover|dialog|toast` (1, 10, 20, 30); `--nuiget-duration-fast|normal` (100 ms, 200 ms) and `--nuiget-easing: ease-out`; `--nuiget-font-size-sm|md|lg` (0.85em, 1em, 1.15em), `--nuiget-line-height: 1.4`, `--nuiget-font-family: var(--vscode-font-family)`, `--nuiget-font-family-mono: var(--vscode-editor-font-family)`. Colours, each `var(--vscode-…)` with a `--vscode-*` or keyword fallback and never a literal: `fg` (foreground), `fg-muted` (descriptionForeground), `border` (widget-border, fallback panel-border), `focus` (focusBorder), `list-hover-bg`, `list-active-bg|fg`, `list-inactive-bg` (list-*), `badge-bg|fg`, `button-bg|fg|hover-bg`, `button-secondary-bg|fg`, `input-bg|fg|border|placeholder`, `link` (textLink-foreground), `error` (errorForeground), `warning` (editorWarning-foreground), `info` (editorInfo-foreground), `progress` (progressBar-background), `shadow` (widget-shadow), `scrollbar|scrollbar-hover|scrollbar-active` (scrollbarSlider-*). One block `body.vscode-high-contrast, body.vscode-high-contrast-light { --nuiget-color-border: var(--vscode-contrastBorder); --nuiget-color-focus: var(--vscode-contrastActiveBorder, var(--vscode-focusBorder)); --nuiget-color-shadow: transparent; }`; one `@media (forced-colors: active)` block mapping the colour tokens to `CanvasText`, `Canvas`, `Highlight`, `HighlightText`, `ButtonFace`, `ButtonText`, `GrayText`, `LinkText`, `Field`, `FieldText`; one `@media (prefers-reduced-motion: reduce)` block setting both durations to `0ms`. A header comment states that light and dark are covered by the aliases and that P5.11 owns any literal that ever becomes necessary.
5. `src/webview/shared/primitives/icons.tsx`: the 26 icons of `src/webview/app/icons.tsx`, header kept (codicons, MIT), `IconProps = { size?: number; className?: string; title?: string }`, `width={size} height={size}`, `fill="currentColor"`, `aria-hidden={title ? undefined : true}`, `role={title ? 'img' : undefined}`, `<title>` when titled, `React.memo` kept; no `style`, no `PackageIcon`/`BookIcon` (first consumer adds them), no `primitives/index.ts` (P3.2 decides when there are several primitives). Imports: `react` only (the webview fence allows it; `npx eslint src/webview/shared` → 0).
6. `src/webview/shared/primitives/icons.test.tsx` (frontend project), table-driven over `Object.entries(await import('./icons'))` so a new icon is tested without editing the table: `every export of the module is an icon component`; `every icon is aria-hidden without a title` (also asserts no `role`); `a titled icon is an image with an accessible name` (`getByRole('img', { name })`); `no icon renders a style attribute`; `width and height follow size`; `className is applied`; `icons have no axe violations` (all icons untitled in one container, then all titled, each `toHaveNoViolations`).
7. `src/test/lint/webview-colours.test.ts` (backend project; the folder is already in both `vitest.config.mts:68` and `tsconfig.vitest.json:48`): walks `src/webview/{shared,main,sidebar-next}` with `readdirSync(dir, { recursive: true })` for `*.css|ts|tsx` including tests, exempts exactly `src/webview/shared/tokens.css`, and reports every match of hex `#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])` and of the functions `rgb(`, `rgba(`, `hsl(`, `hsla(`, `hwb(`, `lab(`, `lch(`, `oklab(`, `oklch(`, `color(` as `path:line: text`. Named colours are not covered (words). Tests: `no colour literal outside tokens.css` (expect `[]`); `the scan covers the 2.0 webview files` (the file list contains `tokens.css` and `primitives/icons.tsx`, so an empty glob cannot pass vacuously); `the scanner finds planted literals` (a string sample with `#fff`, `#A1B2C3D4`, `rgb(0 0 0)`, and non-matches `#root`, `#sidebar-root`, `getElementById('#abc-def')`).
8. `src/test/lint/webview-tokens.test.ts` (backend): reads `tokens.css` and asserts braces balance; every declaration matches `^\s*--nuiget-[a-z0-9-]+:\s.+;$`; every `var(` argument starts with `--vscode-` or `--nuiget-`; exactly one `prefers-reduced-motion: reduce` rule and it sets both duration tokens to `0ms`; exactly one `forced-colors: active` rule; the HC selector names both `vscode-high-contrast` classes; the required token names of step 4 are all declared in `:root` (P3.2 relies on them).
9. Gates in §2.2 order, plus `npx vitest run --project frontend src/webview/shared`, `npx vitest run --project backend src/test/lint`, `npm run check-types` (the `.d.ts` is reached through `tsconfig.vitest.json`), `node esbuild.mjs --v2` (unchanged output: three bundles, no CSS), `npm test`, `npm run bench`; `package:vsix`, `check:vsix`, `docs:protocol:check`, `test:ui` SKIPPED with the literal reason (no host, packaging, protocol or UI file changed). Run `npx vitest run --coverage` and paste the `src/webview/**` numbers; do not touch the thresholds.
10. Docs: CHANGELOG `### Added` `**2.0 webview tokens and icons** — \`src/webview/shared\` holds the design tokens of the 2.0 webviews (spacing, radius, row heights, icon sizes, hit target, z-index, motion, em typography and colour aliases, with high-contrast, forced-colours and reduced-motion coverage in one file) and the icon set without inline styles; a lint test keeps colour literals out of every other 2.0 webview file, and the frontend tests check rendered markup with axe`. ARCHITECTURE.md `src/webview/shared/**` row (line 104): "Tokens and icons present since P3.1 (`tokens.css`, `primitives/icons.tsx`); bus and store in P3.3; `tokens.css` is in no bundle until the sidebar entry imports it in P3.4", plus a short subsection "Webview tokens and the colour gate" under the 2.0 section naming the `--nuiget-` prefix, the alias rule, the theme coverage mechanism, the two lint tests and the axe matcher in `setup-frontend.ts`. One 2.0 gotcha row: "Jest-typed matcher packages under Vitest: `@types/jest-axe` (and anything depending on `@types/jest`) augments the `jest` namespace, which `tsconfig.vitest.json` never loads, and puts a second set of `describe`/`it`/`expect` globals next to `vitest/globals`; the Vitest augmentation is `src/test/jest-axe.d.ts`. Never add `@types/jest`." New `src/webview/shared/STATUS.md` (§2.5). Ledger: U4, U5, U7, U9, U11 "progressed in P3.1 (tokens); close at P5.11"; tracker row P3.1 with the SHA. Commit: `feat(webview/shared): tokens, icons and the axe matcher (P3.1, ADR-008, ADR-006, U4, U5, U7, U9, U11)`.

DO NOT:
- Add `@types/jest-axe`, `@types/jest`, `vitest-axe` or a direct `axe-core` dependency.
- Run `npm install --save-dev …` (not on the allowlist) or hand-edit `package-lock.json`.
- Write `body.vscode-light`/`body.vscode-dark` blocks with no differing value, or a hex, `rgb()` or `hsl()` literal anywhere in P3.1, `tokens.css` included.
- Put element rules (`body`, `*`) or a reset into `tokens.css`.
- Import `tokens.css` from `src/webview/main/index.tsx` or `src/webview/sidebar-next/index.tsx`, or touch `esbuild.mjs`.
- Keep `style` in `IconProps`, keep `aria-hidden={!title}`, add `PackageIcon`/`BookIcon`, or add a `primitives/index.ts`.
- Change the coverage thresholds in `vitest.config.mts`, `eslint.config.mjs`, CI, the interaction model, or any frozen path.
- Narrow the colour scan to `.css` files or exempt test files from it.

CONTRACT CHANGE: none. `src/protocol/**`, `src/core/contracts.ts` and `docs/adr/**` stay as they are (ADR-008:33-35 already describes `tokens.css`); `.claude/.contract-change` must not exist. Approved as files the row does not name: `package.json` (devDependencies only), `package-lock.json`, one `include` line in `tsconfig.vitest.json`, `src/test/jest-axe.d.ts`, `src/test/lint/webview-colours.test.ts`, `src/test/lint/webview-tokens.test.ts`.

VERIFY: `git diff --stat HEAD~1 -- package.json tsconfig.vitest.json` shows one added dependency line and one include line; `ls node_modules/@types | grep -c jest` → 0; `npm ci` exits 0; `npx tsc --noEmit && npm run check-types && npx eslint src` → 0 each; `npx vitest run --project frontend src/webview/shared` green with the seven titles of step 6; `npx vitest run --project backend src/test/lint` green with the titles of steps 7 and 8; `grep -rnE '#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})([^[:alnum:]_-]|$)|rgba?\(|hsla?\(' src/webview/shared src/webview/main src/webview/sidebar-next` → 0 lines (the gate, stricter than the row for this item); `grep -c 'style' src/webview/shared/primitives/icons.tsx` → 0; `grep -c 'prefers-reduced-motion' src/webview/shared/tokens.css` → 1; `node esbuild.mjs --v2` builds three bundles and `ls dist/*.css` after `rm -rf dist` shows none (expected until P3.4); `npm test` and `npm run bench` green; `test -e .claude/.contract-change` → false.

FILES CHECKED: `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:41-175,240-251,284`; `docs/adr/008-webview-architecture.md` (whole); `docs/adr/006-icons-and-csp.md` (whole); `docs/adr/000-release-and-compatibility-policy.md` (whole); `docs/plans/STATUS.md:45-56,1187,1264` and its advisor-decision headings; `docs/plans/findings-ledger.md:241-256`; `docs/ux/interaction-model.md:106-124`; `src/test/setup-frontend.ts`; `src/test/helpers/frontend.tsx`, `index.ts`; `src/test/lint/allowlist.test.ts:1-60`, `vsix-contents.test.ts:1-40`; `tsconfig.json`, `tsconfig.test.json`, `tsconfig.vitest.json`; `vitest.config.mts`; `eslint.config.mjs:10-43`; `esbuild.mjs` (whole); `src/host/services.ts:100-140`; `src/webview/main/index.tsx`, `src/webview/sidebar-next/index.tsx`; `src/webview/app/icons.tsx:1-60` and its 26 exports; `src/webview/app/App.tsx:3`, `src/webview/sidebar/SidebarApp.tsx:23`; `package.json` (devDependencies, dependencies, scripts); `.claude/settings.json`; `scripts/hooks/guard.mjs:1-120`; `scripts/check-vsix-contents.mjs:10-30`; `.gitignore`; `.github/copilot-instructions.md:33-37`; `node_modules/@testing-library/jest-dom/types/vitest.d.ts`; `ls node_modules/@types` (no `jest*`); `git log -3`, `git status` (clean at `3349d27`). Not checked (outside the repository): the quarry's `STATUS.md` and `package.json`, taken from the brief's excerpts; the registry metadata of `jest-axe` 11 (step 2 verifies it from the installed package). The ambient advisor tool timed out during this consultation; the ruling is mine alone.
`````

## Exact next step (one item ID)

P5.6 (feature search, main and sidebar browse), after P5.5's CI run is green; a fresh session starts it (second compaction of this one).







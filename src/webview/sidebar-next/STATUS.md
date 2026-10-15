# STATUS — src/webview/sidebar-next   commit a6c2b52 (parent of P5.10 commit a)   2026-10-16T05:00:00Z

git status --porcelain --untracked-files=all (before commit a): modified `docs/plans/STATUS.md`, `src/webview/shared/store/{session,session.test}.tsx`, `src/webview/sidebar-next/{SidebarView,InstalledSection,UpdatesSection,BrowseResults,index}.tsx`, their tests `SidebarView.test.tsx`, `UpdatesSection.test.tsx`, `BrowseResults.test.tsx`, `sidebar.css` and the two STATUS notes; new `src/webview/sidebar-next/{rowRequests.ts,SidebarLayout.test.tsx}` (all belong to P5.10 commit a)

Item: **P5.10 sidebar parity, commit a of four**: the split sash between the open Installed and Updates sections
(`SidebarView`: `SidebarLayout` read from the webview's `getState` by `readLayout`, written with `setState` on a toggle
and on `Sash.onChangeEnd`, never per pointer step; the sections' `expanded` and `share` are controlled, the share a
flex-grow ratio through `--nuiget-sidebar-share`); the entry hands `acquireVsCodeApi()` to `SidebarView` as
`viewState`; the three lists send `ui/contextMenu` on Shift+F10, the ContextMenu key and a right-click, and
`ui/viewPackage` on Ctrl+Enter (Cmd+Enter), through `rowRequests.ts`; Enter keeps its primary action (uninstall,
update, install).

## Verified by running

P5.10 commit a:

```text
baseline at a6c2b52          → CI run 38718679885 green on all 11 jobs; tsc 0 · eslint 0 · vitest exit 0
stop-and-ask (commit split, Enter, browse under All Projects, the two-phase metadata) → ruling of 2026-10-16
                               (verbatim in docs/plans/STATUS.md): four green commits a–d
step 1 on the tree           → npx tsc --noEmit 0 · npx eslint src 0 · frontend sidebar-next + shared/store exit 0
npx tsc --noEmit / npm run check-types / npm run lint → exit 0 each (last run after every code edit)
src/webview/sidebar-next and src/webview/shared/store, 20 times → 20 of 20
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → exit 0 · Test Files 157 passed (157) · Tests 3213 passed (3213)
npm run bench / npx vitest run --coverage → exit 0 each
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 281249 / 299921 · webview 517871 / 600685 ·
                               sidebar 311597 / 329122 (307187 before; N63)
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → 18 passing (22s); fixture unchanged
grep of 'ui/contextMenu' and 'ui/viewPackage' senders in sidebar-next → one shared helper, rowRequests.ts
npm run package:vsix / test:ui (1.x) → SKIPPED: no 1.x or host file changed; CI runs them
test -e .claude/.contract-change → false
```

## Done (tested)

- `SidebarLayout.test.tsx` (4): the sash and its share, the keyboard; a collapsed section and the restored layout; a
  filter mode without the sash; `readLayout` fallbacks.
- `SidebarView.test.tsx` (+2): `Shift+F10, the ContextMenu key and a right-click ask ui/contextMenu with the row's
  project and versions`, `Ctrl+Enter asks ui/viewPackage with the installed version; Enter still uninstalls`. Two
  assertions of existing tests follow the new hint sentences the ruling's step 3 asks for (`list()`'s description in
  `shows skeleton rows while the first list is loading, then the packages of the selected project` and `unsupported SDK:
  a banner says why, the packages are listed, and nothing can be uninstalled`); no title changed.
- `UpdatesSection.test.tsx` (+1), `BrowseResults.test.tsx` (+1): the ruling's titles.

## Done (untested)

- The sash and the actions menu in VS Code: commit d's ExTester file.

## Not started

- The installed slice's two-phase `transitive/metadata` (commit b), the sidebar's All Projects (commit c), the host
  picker and the docs (commit d).

## Deviations from contract/ADR (file:line each)

- N66 not touched in this commit (commit d checks it under the main panel beside the sidebar).

## Advisor decisions (date, item, question, answer verbatim)

The P5.10 ruling of the `architecture-advisor` (2026-10-16) is verbatim in `docs/plans/STATUS.md` under "### P5.10 — stop-and-ask: commit split, Enter on a sidebar row, browse under All Projects, the two-phase transitive metadata".

## Exact next step (one item ID)

P5.10 commit b, after commit a's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/core/feeds/{enricher,enricher.test}.ts`, `src/host/handlers.test.ts`, `src/webview/main/{MainShell.tsx,index.tsx,index.test.tsx,main.css}`, `src/webview/shared/store/StoreProvider.tsx`, `src/webview/sidebar-next/{SidebarView.tsx,SidebarView.test.tsx,UpdatesSection.tsx,sidebar.css}` and the six STATUS notes; new `src/webview/shared/search/{SearchBox.tsx,SearchBox.test.tsx,search.css}`, `src/webview/shared/store/{search,sources,config}.tsx` with their tests, `src/webview/main/features/search/{BrowseList.tsx,BrowseList.test.tsx,useSearchTyping.ts,useSearchTyping.test.tsx}`, `src/webview/sidebar-next/{BrowseResults.tsx,BrowseResults.test.tsx}`, `src/test/ui/v2/main-search.ui.test.ts` (all belong to the P5.6 commit)

Item: **P5.6 feature search**, for this directory: `SidebarView.tsx` (the `SearchBox` with `@installed` and `@updates`;
a filter mode shows that section alone, filtered; any other text, `@vulnerable` included, is a browse search after
300 ms from two characters on, or at once on Enter, which also drops the pending debounce; the label is now "Search
packages, or filter with @installed or @updates"), `BrowseResults.tsx` (`sidebar-browse-list`, compact rows, Enter or
`row-action-install` installs the version found into the committed project with the row's `sourceUrl`, busy while
the operation runs, an installed package or no single project says why and installs nothing,
`sidebar-browse-unavailable` with Retry), `UpdatesSection.tsx` (`filter` prop for `@updates`).

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

- `BrowseResults.test.tsx` (7): the two filter modes and the two prefixes offered; the 300 ms / two-character
  debounce; Enter at once with no second request; install by Enter and by the row button, busy; installed and All
  Projects; the unavailable banner, Retry and back to the sections with the request cancelled; axe.
- Rewritten by title (the P5.5 ruling gave the box's modes and label to this row): `SidebarView.test.tsx` `the search
  box filters the installed packages by id, and the host can ask for the focus to be there`: the label and the text
  typed (`@installed SERI`); every other assertion unchanged.
- The sidebar reads neither `useSources` nor `useConfig` and asks no suggestion (`grep -rn "useSources\|useConfig\|search/autocomplete" src/webview/sidebar-next --include='*.ts' --include='*.tsx'` → 0).

## Done (untested)

- The quick-search suggestions in VS Code: the ExTester test submits with Enter; suggestions, timers and both modes are
  covered in jsdom (`useSearchTyping.test.tsx`).

## Not started

- Details of a browse row (P5.7), the sources settings and selector (P5.8), the multi-install picker (P5.9), the
  sidebar's context menu, "View package details" and "Open full view" (P5.10), the search settings' `full`/`off`
  values (N57, P5.13).

## Deviations from contract/ADR (file:line each)

- An installed package shows the Installed badge and no action; updating from browse is the Updates section's job.
- `sidebar-browse-list` is in interaction model §8; `sidebar-browse-unavailable` is not, recorded for P5.12b.
- The sidebar's Updates section has no "Loading updates" announcement (unchanged from P5.5); a search announces what
  it found through the one live region.

## Advisor decisions (date, item, question, answer verbatim)

Both P5.6 rulings of the `architecture-advisor` (2026-10-15) are verbatim in `docs/plans/STATUS.md` under "### P5.6 — stop-and-ask: the source list of quick-search and `searchDebounceMode`" and "### P5.6 — stop-and-ask: the main entry's start requests". The ambient advisor was consulted before writing (scope: no install action on main browse rows, the details pane stays P5.7's, `ui/viewPackage` senders stay P5.10's, the combobox instead of `Popover`, the latency measured at the first ExTester run).

## Exact next step (one item ID)

P5.7 (feature details), after P5.6's CI run is green.

## Earlier notes of this directory

Scope of this note: `src/webview/sidebar-next/**`, the 2.0 sidebar, and the harness scenario the item's gate
names (`src/test/harness/scenarios.test.ts`).

git status --porcelain --untracked-files=all: ` M src/webview/sidebar-next/InstalledSection.tsx`, ` M` this note (the rest of P5.4 commit a is listed in
`src/webview/shared/STATUS.md`)

Item: **P5.4 feature installed (main), commit a of three** (P5.4 stop-and-ask ruling of 2026-10-14, verbatim in
`docs/plans/STATUS.md`, "Advisor decisions"): N61 lands; the row stays `in-progress` until commit c. The
ruling is an L1 consultation (stop-and-ask: `Listbox.tsx` is not among the row's files); commit a touches no
file outside those the P3.6 ruling named for P5.4.

git status --porcelain --untracked-files=all (P5.5, before the commit): `?? src/webview/shared/store/{updates.tsx,updates.test.tsx}`,
`?? src/webview/main/features/updates/{UpdatesTab.tsx,UpdatesTab.test.tsx,UpdateAllDialog.tsx,CentralUpdateDialog.tsx}`,
`?? src/webview/sidebar-next/{UpdatesSection.tsx,UpdatesSection.test.tsx}`, `?? src/test/ui/v2/main-updates.ui.test.ts`,
` M src/webview/shared/store/StoreProvider.tsx`, ` M src/webview/main/{MainShell.tsx,index.tsx}`,
` M src/webview/sidebar-next/{SidebarView.tsx,SidebarView.test.tsx}`, ` M src/test/harness/{FakeWebview.ts,scenarios.test.ts}`,
` M ARCHITECTURE.md`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md` and the five STATUS notes of the item's directories

Item: **P5.5 feature updates**, for this directory: `UpdatesSection.tsx` under the Installed section (compact rows, `sidebar-updates-list`, `section-header-updates`, the count only when known, Enter and the row button update, central packages announced and without a button, banner `sidebar-updates-unavailable`, empty state `sidebar-updates-empty`, §4 skeleton while loading), `UpdatesSection.test.tsx` (5), and the stop-and-ask ruling of 2026-10-16 (below, verbatim): the six skeleton queries of `SidebarView.test.tsx` re-scoped to the Installed section in the four tests it names by title, nothing else changed. The sidebar's search modes and the box's label are P5.6's (P3.4), the draggable split P5.10's; the Updates section is unfiltered. Earlier in this note: P5.4.

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
baseline (at 5bc53c1) npx tsc --noEmit / npm run check-types / npx eslint src → exit 0 / exit 0 / exit 0
baseline npx vitest run      → Test Files 108 passed (108) · Tests 2656 passed | 3 skipped (2659)
npx tsc --noEmit / npm run check-types → exit 0 / exit 0
npx eslint src / npm run lint → exit 0, no output / exit 0
npx vitest run --project frontend src/webview/sidebar-next → Test Files 3 passed (3) · Tests 25 passed (25):
                               the row's gate "frontend tests". SidebarView 19, outcomes 4, index 2.
npx vitest run --project integration src/test/harness → Test Files 1 passed (1) · Tests 15 passed (15), among
                               them `sidebar: uninstall then watcher invalidation converges`: the row's
                               second gate
that scenario, 40 times      → 40 of 40 green (it mixes fake timers with real file I/O; N60)
npx vitest run --project frontend src/webview/sidebar-next src/webview/shared, 40 times → 40 of 40 green
                               (25 files, 170 tests; `LiveStatus` waits for an animation frame)
npx vitest run --project frontend → Test Files 44 passed (44) · Tests 780 passed (780)
npx vitest run --project backend src/test/lint → Test Files 5 passed (5) · Tests 115 passed (115); the
                               stylesheet and colour lints now also read `sidebar.css`
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 110 passed (110) · Tests 2683 passed (2683)
npx vitest run               → Tests 2680 passed | 3 skipped (2683)
npx vitest run --coverage    → exit 0 · all files lines 80.66 % · src/webview/** 3629 of 5258 lines, 69.02 %
                               (ratchet 64, untouched; P3.6) · src/webview/sidebar-next/** 108 of 108 lines
npm run bench / bench:compare → exit 0 / exit 0 · Tests 112 passed | 1 skipped (113)
npm run docs:protocol:check  → exit 0 (no protocol file changed)
node esbuild.mjs --v2 (after rm -rf dist) → exit 0 · dist/ now has `sidebar.css` (14 338 bytes) next to
                               `sidebar.js`, written by esbuild because the entry imports stylesheets;
                               `esbuild.mjs` is unchanged · no `webview.css` (N62)
node esbuild.mjs --v2 --production --analyze (after rm -rf dist) → exit 0 · dist/extension.js 168070 / 299921 ·
                               dist/webview.js 223600 / 600685 · dist/sidebar.js 293929 / 304097 (96.7 % of
                               its ceiling; N63; the figure of the run after the last edits) · dist/sidebar.css 12485 · no map files ·
                               grep -c 'createFakeHost\|installFakeLayout' over dist/*.js → 0
negative control             → 103 mutations, one at a time: 58 in `InstalledSection.tsx` (the filter, the
                               shown version, each reason a package cannot be uninstalled, the busy guard,
                               the pending set and each way it is cleared, what is announced, the payload,
                               both sources of "busy", every state of the content, the hint, the keys, the
                               row's flags, badge, status (and which operation it names) and button, the count, the section's spinner, the
                               provisional badge, collapse, the test ids, the list's name), 21 in
                               `SidebarView.tsx`, 15 in `outcomes.ts`, 3 in `index.tsx`, 3 in `sidebar.css`
                               (against the stylesheet and colour lints), and 3 in `src/host/handlers.ts`
                               as a control of the harness scenario (no invalidation after the operation,
                               no `queued` chunk, no announcement). First run 96 of 97 caught: no test spoke
                               of a failed update or a cancelled restore; two cases were added. Six more
                               came with the row's status (below). Final: 103 of 103 caught; every file restored (`cmp`; `git status -- src/host` empty).
git diff --stat 5bc53c1 -- vitest.config.mts eslint.config.mjs esbuild.mjs package.json tsconfig.vitest.json .vscodeignore scripts src/protocol src/core src/host docs/adr src/webview/shared src/webview/main → empty
test -e .claude/.contract-change → false
after the gate run           → the pre-commit review found that a busy row said "Uninstalling" for any
                               operation. Changed then: `InstalledSection.tsx` (`busyStatus`), one test of
                               `SidebarView.test.tsx`, the ledger (U1 stays open, N63), the STATUS files, the
                               tracker. Run again: npx tsc --noEmit → 0 · npm run check-types → 0 · npx eslint
                               src → 0 · npx vitest run --project frontend src/webview/sidebar-next → 3 files,
                               25 tests, and 20 times in a row → 20 of 20 · npm test → 110 files, 2683 tests ·
                               node esbuild.mjs --v2 --production --analyze → exit 0, sizes above · 8
                               mutations of the changed lines → 8 caught. Not run again: bench, coverage,
                               the harness (no file of it changed).
npm run package:vsix, npm run check:vsix, npm run test:ui → SKIPPED: no host, packaging, protocol or 1.x UI
                               file changed, and the VSIX that CI packages is built from the 1.x entries;
                               CI runs them. The 2.0 sidebar in VS Code is P3.5.
CI                           → see the tracker row of P3.4
```

## Done (tested)

- P5.5 `UpdatesSection.test.tsx` (5): its own 3 skeleton rows before the session and while `updates/get` is pending, none once answered; list, versions, header count and axe; Enter and the row button update, a central package is announced and has no button; an unreachable source is a banner with Retry, never "No updates available", no count; a complete empty answer counts 0 and the header collapses the section.
P5.4 commit b: `shownVersion` and `whyNotRemovable` (and the `IN_PROGRESS` words) moved to
`src/webview/shared/installed/rules.ts`, `describeOutcome` to `src/webview/shared/store/outcomes.ts`; `InstalledSection.tsx`
and `outcomes.ts` re-export them, so nothing here changes behaviour and no test was edited.

P5.4 commit a: `InstalledSection.tsx` keeps no pending set of its own any more (the set, its key helper and
`busyStatus`'s first branch are deleted, as the P3.6 ruling says for N61): a row is busy from `run()` through the
ops slice, and the status text comes from the slice's entry (`kind: 'remove'` → "Uninstalling"). Every test title
of `SidebarView.test.tsx` is kept; the file is not edited.


- `index.tsx`: the entry. Inside `if (rootElement)` it acquires the VS Code API (once), creates the bus and
  renders `StoreProvider` and `SidebarView` under `StrictMode`; it imports `../shared/tokens.css` and
  `./sidebar.css`. On a page without `sidebar-root` it does nothing and leaves the API unacquired.
- `SidebarView.tsx`: `main[data-testid="nuiget-sidebar"]` with a search landmark holding the box
  (`sidebar-search-input`, named "Filter installed packages", focused on `ui/focusSearch`), an indeterminate
  `ProgressBar` while the list is revalidated, a warning `Banner` for an unsupported project, an error
  `Banner` with "Retry", the Installed section and the one `LiveStatus`. It says "Loading installed packages"
  on a first load (not on a revalidation) and one sentence per ended operation of either surface; the same
  sentence for another operation is said again.
- `InstalledSection.tsx`: `SectionHeader` (`section-header-installed`, count of the project, spinner while
  loading or revalidating, "provisional" badge with a tooltip) over a `Listbox` (`sidebar-installed-list`,
  named by the section title, described by its keys) with one compact `Row` per package: the version the
  reference resolves to for a floating or ranged one, "unresolved" and a disabled row for an unresolved
  one, a "CPM" badge read as "Centrally managed". Skeleton rows before the first list and on a project
  change; `EmptyState` for no packages, no project, all-projects mode and a filter without a match.
- Uninstall: the row's button (`row-action-uninstall`), Enter or Delete → `ops/remove` once per row; the row
  is busy from the click (the section's pending set) and while the ops slice reports the operation, also one
  started on the other surface, and its status names the operation ("Uninstalling", "Updating", "Installing",
  or "In progress" when the report does not say); the row leaves with the host's next list. A failed or refused uninstall and a
  request without an answer end the spinner and are announced with the reason. A package that cannot be
  uninstalled here has no button, and a key on it says why (`whyNotRemovable`).
- `outcomes.ts`: `describeOutcome`, the sentence for an outcome (single and bulk; done, partial, failed,
  refused, cancelled) in the words of the interface.
- `sidebar.css`: layout only, tokens only, classes prefixed `nuiget-`; `body { margin: 0; padding: 0 }`.
- Axe: no violation while loading, with every kind of row, a busy row, a banner and a revalidation, and for
  an empty unsupported project; `nested-interactive`, `aria-required-children` and `aria-hidden-focus`
  among the rules that passed.
- Harness, `sidebar: uninstall then watcher invalidation converges`: the sidebar asks `ops/remove`; the
  request is told `queued`; the project-file watcher sees the edit while the restore still runs; after the
  outcome both surfaces have received an invalidation of the operation and one of the watcher (order not
  asserted), one `ops/completed`, exactly one response per request, and show the empty list of the
  generation the last event listed.

## Done (untested)

- **In VS Code.** Nothing here has run in an extension host or a browser. The bundle builds and its tests
  pass in jsdom over a faked layout; that the host's HTML loads `sidebar.js` and `sidebar.css` under its
  Content Security Policy, that the tokens resolve to the theme, that rows are 24 px and scroll, that the
  hover and focus rules of the row actions work: P3.5 (e2e and ExTester on the `--v2` build). In particular
  the CSP has `style-src` for the webview's origin only: the virtual offsets rely on React setting custom
  properties through the CSSOM, which that policy allows; no test here can show it.
- **The real host with the real slices.** The frontend tests use a fake host; the harness uses the client
  model (`FakeWebview`), not these components. Both sides are tested against the same seven rules, not
  against each other, until P3.5.
- The 1.x sidebar stays the shipped one; the 2.0 sidebar is reachable only through `--v2` builds (launch
  configuration "Run 2.0").
- `InstalledSection.tsx`: the branch for a rejection of `run` that is no `Error` (98.5 % branches); the bus
  rejects with `ProtocolRequestError` only.

## Not started

- The search box's modes (`@installed`, `@updates`, browse on Enter, the `@` dropdown, Escape): P5.6 and
  P5.10. Until then the box filters the installed list by id, and says so in its name and placeholder; plain
  text will mean "browse" then (interaction model §2).
- The Updates section, the split sash, the context menu (Shift+F10, right-click → `ui/contextMenu`), "Open
  full view", the title-bar toggles and all-projects mode: P5.5, P5.10. In all-projects mode the section says
  that it is not available in this view yet.
- Uninstalling a centrally managed package, with the preview of what it touches: P6. The impact-preview
  dialog and the `Dialog` primitive do not exist yet.
- Remembering the collapsed section and the filter across a reload (`getState`/`setState`), `perf/mark`,
  asking `session/get` again when the view is shown again: with P5.10 (the host already sends
  `ui/focusSearch` on re-show).
- Package icons and descriptions: not shown in compact rows (interaction model §1); the store keeps the
  metadata chunks for the main panel.

## Deviations from contract/ADR (file:line each)

- P5.5 (ruling of 2026-10-16, DO 4): the Updates section shows §4's skeleton but says no "Loading updates" through the one `LiveStatus` (the sidebar announces "Loading installed packages" for the view's first load, `SidebarView.tsx:40-44`); one live region, two simultaneous first loads; left for the P5 phase review.
- P5.5: the test ids `sidebar-updates-unavailable` and `sidebar-updates-empty` are not in interaction model §8; P5.12b decides with the `sidebar-installed-*` ones (row note).
P5.4 commit a:

- The ruling's VERIFY `grep -c "pending" src/webview/sidebar-next/InstalledSection.tsx → 0` gives 1: the tooltip of
  the provisional badge says "a full evaluation is pending" (`InstalledSection.tsx:177`). Product copy, not the
  pending set; left as it is.


- `InstalledSection.tsx:46-48` and interaction model §4/§5: a centrally managed package is **read-only**
  here. The model wants an impact preview before an update or uninstall of a `central` package; the dialog
  for it comes with P6 (P5.5 calls its own placeholder "read-only until P6"). Offering a plain
  `dotnet package remove` without the preview would be the behaviour the model rules out, so the row has the
  badge and no button, and Enter or Delete says "… is managed centrally and cannot be uninstalled from this
  view yet".
- `InstalledSection.tsx:71-73` (`pending`): the row's spinner between the click and the first progress
  report comes from a set the section keeps, not from the ops slice. The host tells only the asking request
  that its operation is queued (a stream chunk without projects or packages), and `useOpsActions().run`
  (P3.3) does not read chunks. Kept inside the item's files; finding N61 says where it belongs once a second
  feature needs it.
- `SidebarView.tsx:47-59`: the "header" of the plan row is the search box. In this slice it filters the installed
  list by id (plain substring, any case) instead of switching modes; `parseSearchQuery` is 1.x code behind
  the import fence and its port is P5.6.
- `InstalledSection.tsx:33-50` (`whyNotRemovable`): beyond the states the row names, a package the SDK adds
  (`isImplicit`) and one declared in an imported props file have no uninstall either: `dotnet package
  remove` cannot remove what the project file does not declare.
- Enter uninstalls. Interaction model §5: in the sidebar Enter "performs its primary action", and the
  primary action of an installed row is the one its button has (as in 1.x); no confirmation for a single
  uninstall (§5 table).
- `SidebarView.tsx` is not called `Sidebar.tsx`: the import fence takes a path segment `sidebar`, in any
  case, for the 1.x folder (gotcha row added).
- `index.test.tsx`: the two tests of the placeholder are rewritten, in the same file. `renders the shell
  text` is now `mounts the sidebar into its root, acquires the API once and asks the host for the session and
  the projects`; `does not mount itself when the page has no root element` keeps its title and also asserts
  that the API is not acquired. The placeholder itself (`SidebarShell`, "2.0 shell") is gone; `index.tsx`
  said that P3.4 replaces it. `src/webview/main` still has its own placeholder (P5.3).
- `src/test/harness/scenarios.test.ts`: the watcher's event for the operation's edit is produced by writing
  the project file back unchanged (`files.writeProject`), because the harness's fake `dotnet` edits the file
  without a file-system watcher behind it; no verb was added to `harness.ts`.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P5.5, stop-and-ask: the sidebar's document-wide skeleton-count tests with the Updates section mounted. Answer, verbatim:

`````text
DECISION: Option 1. Re-scope the six skeleton-row queries of `src/webview/sidebar-next/SidebarView.test.tsx` (lines 62, 65, 71, 260, 277, 290) to the Installed section's content; every other assertion of the four tests stays byte-for-byte. The four tests that may change, by title: `shows skeleton rows while the first list is loading, then the packages of the selected project`; `revalidate without blanking: the rows stay, the list is busy and a progress bar shows until the new list is there`; `another project: its packages replace the list after skeleton rows, never mixed`; `an error is a banner with Retry; a list that is shown stays under it`. No other test of that file changes. The Updates section keeps its `<Skeleton density="compact" />`, starts expanded, and gets its own test file.

WHY: The brief is right about the tree: `UpdatesSection.tsx:70-75` renders a `Skeleton` while `session === undefined` and while the first `updates/get` is pending, and `Skeleton.tsx:17` emits 3 `.nuiget-skeleton-row` divs, so at `SidebarView.test.tsx:62` (before `session/get` is answered) the document holds 6 rows, and at :65/:260/:290 it holds 3 where 0 or 3 was asserted. Option 4 cannot fix line 62 at all (no `updates/get` exists yet to answer), option 2 breaks `docs/ux/interaction-model.md` §4 ("Loading (first): Skeleton rows (3)", "every list/detail area uses exactly these"), and option 3 changes a product default (§2 lists both sections open; 1.x `src/webview/sidebar/SidebarApp.tsx:48` defaults `updatesExpanded` to `true`) to dodge a test, and the skeleton returns on the first expand anyway. Option 1 is a re-scoping, not a weakening (RUN.md:82): each of the six assertions says "the Installed section shows 3 placeholder rows / none", and `document.querySelectorAll` was only a correct way to say that while one section existed; the count and meaning survive. `SidebarView.test.tsx` is an item file under plan §2.1 (the test of `SidebarView.tsx`, which the item must edit to mount the section), and the P5.4 ruling set the precedent of naming that file's tests by title; the four titles above are the named ones. On the second question the in-tree decision stands (label "Filter installed packages" unchanged, Updates section unfiltered, test at :320 untouched), but the attribution is wrong: the P3.4 row in `docs/plans/STATUS.md:57` says "the search box filters the installed list until P5.6" and P5.6's row says "sidebar browse is this row's"; the sidebar's search modes are P5.6's, not P5.10's (P5.10 owns sash, context menu, title-bar toggles, Open full view).

DO:
1. In `SidebarView.test.tsx` add two helpers next to `list()` (:40): `installedContent()` resolving the Installed section's content div through the toggle's `aria-controls` (`SectionHeader.tsx:41-42`: `document.getElementById(screen.getByTestId('section-header-installed').getAttribute('aria-controls')!)`), and `skeletonRows()` = `installedContent().querySelectorAll('.nuiget-skeleton-row')`. Replace the six `document.querySelectorAll('.nuiget-skeleton-row')` sites with `skeletonRows()`; change nothing else in those tests. Do not add a `data-testid` to the `<section>`: that would need a §8 table row in `docs/ux/interaction-model.md`, which is outside the item's files.
2. Add `src/webview/sidebar-next/UpdatesSection.test.tsx` (an item file: the section's own test) covering at least: 3 skeleton rows inside the Updates content before the session and while `updates/get` is pending, none once answered; the `sourcesUnavailable` banner over a list (never an empty state); `No updates available.` empty state; Enter/button → one `ops/update` with `version: latestVersion` and `sourceUrl`; a CPM row with the badge, no action, and the announced sentence; the header count only when `status === 'ready' && !sourcesUnavailable`. Query rows with `within(screen.getByTestId('sidebar-updates-list'))`, never the document-wide `names()`/`queryAllByRole('option')` helpers of `SidebarView.test.tsx`, which pass today only because those tests never answer `updates/get`.
3. Correct the JSDoc of `SidebarView.tsx:12-13` from "the search modes are P5.10's" to "the search modes are P5.6's (P3.4), the draggable split P5.10's", and say the same in the P5.5 STATUS note and in the P5.6 row's Notes (one clause: "sidebar `@installed`/`@updates` modes and the box's label are this row's; P5.5 left the Updates section unfiltered").
4. In `src/webview/sidebar-next/STATUS.md` "Deviations" record: the Updates section shows §4's skeleton but says no "Loading updates" through the one `LiveStatus` (the sidebar announces "Loading installed packages" for the view's first load, `SidebarView.tsx:40-44`); one live region, two simultaneous first loads; left for the P5 phase review.
5. Run the item's gates in §2.2 order, including `npx vitest run --project frontend src/webview/sidebar-next` 20 times in a row (the file mixes `waitFor` with animation frames), the harness gate `npx vitest run --project integration src/test/harness -t "prerelease toggle re-checks updates"`, and `rm -rf dist && node esbuild.mjs --v2 --production --analyze`; paste the sidebar bytes against its ceiling in the STATUS note (N63; the sidebar was at 293 929 of 329 122 after P5.4). Over the ceiling is a new stop-and-ask, not something to trim here.

DO NOT:
- Do not remove the Updates section's skeleton or make it start collapsed to keep the old document-wide counts.
- Do not answer `updates/get` in the four Installed tests, and do not change any assertion other than the six query sites.
- Do not add a "Loading updates" announcement in this item: `SidebarView.test.tsx:66` waits for `said()` to be exactly "Loading installed packages", and a second first-load sentence would race it.
- Do not add a `data-testid` for the section wrapper, and do not edit `docs/ux/interaction-model.md`.
- Do not wire `@updates` or any mode parsing into the sidebar box, and do not rename its label.
- Do not touch `src/protocol/**`, `src/core/contracts.ts` or `docs/adr/**`.

CONTRACT CHANGE: none.

VERIFY: `npx tsc --noEmit` → 0; `npx eslint src` → 0; `npx vitest run --project frontend src/webview/sidebar-next` → all green with the four titles above present and `UpdatesSection.test.tsx` added; `grep -c "document.querySelectorAll" src/webview/sidebar-next/SidebarView.test.tsx` → 0; `git diff --stat -- src/webview/sidebar-next/SidebarView.test.tsx` shows changes confined to the helper block near line 40 and the six query lines; `grep -n "P5.10" src/webview/sidebar-next/SidebarView.tsx` names only the split; `npx vitest run --project integration src/test/harness -t "prerelease toggle re-checks updates"` → 1 passed; `test -e .claude/.contract-change` → false.

FILES CHECKED: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md` (whole); `/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:60-175` (§2.1-§2.6, §3, §4) and `:278,283` (rows P5.5, P5.10); `/Users/mattias/github/nuiget/docs/plans/STATUS.md:57,61,62,76,81,82` (rows P3.4, P5.3, P5.4, P5.5, P5.2, P5.6, P5.10) and the working-tree diff of row P5.5; `/Users/mattias/github/nuiget/docs/plans/RUN.md:82`; `/Users/mattias/github/nuiget/docs/ux/interaction-model.md` §2, §4, §8; `/Users/mattias/github/nuiget/docs/adr/008-webview-architecture.md:32`; `/Users/mattias/github/nuiget/src/webview/sidebar-next/SidebarView.test.tsx:1-120,240-340`; `/Users/mattias/github/nuiget/src/webview/sidebar-next/SidebarView.tsx` (whole, plus `git diff`); `/Users/mattias/github/nuiget/src/webview/sidebar-next/UpdatesSection.tsx` (whole); `/Users/mattias/github/nuiget/src/webview/sidebar-next/InstalledSection.tsx:1-80`; `/Users/mattias/github/nuiget/src/webview/sidebar-next/STATUS.md` (head); `/Users/mattias/github/nuiget/src/webview/shared/primitives/Skeleton.tsx` (whole); `/Users/mattias/github/nuiget/src/webview/shared/primitives/SectionHeader.tsx:15-42`; `/Users/mattias/github/nuiget/src/webview/shared/store/updates.tsx` (whole); `git diff` of `src/webview/shared/store/StoreProvider.tsx`, `src/webview/main/MainShell.tsx`, `src/webview/main/index.tsx`; `/Users/mattias/github/nuiget/src/webview/sidebar/SidebarApp.tsx:47-48` (1.x defaults); `/Users/mattias/github/nuiget/src/test/harness/scenarios.test.ts:570`; `git status --porcelain --untracked-files=all` (matches the brief's file list).
`````

2026-10-13, P3.4: no L1 consultation (the item is not ⚑ and no stop-and-ask trigger fired). The ambient
advisor was consulted twice before writing and once before the commit (where it found that every busy row
said "Uninstalling", and that U1 was closed too early). What it settled: prove that the build
writes `dist/sidebar.css` without a change to `esbuild.mjs` before any feature code (it does); the missing
`queued` progress event is not a contract mismatch (ADR-003 reports running workflows; the request gets the
chunk) and is covered inside the item's files; the centrally managed row is read-only or plain-remove, to be
decided and written down (read-only, above); the harness scenario is written against the client model.

## Exact next step (one item ID)

P5.6 (feature search, main and sidebar browse), after P5.5's CI run is green; a fresh session starts it (second compaction of this one).




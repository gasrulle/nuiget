# STATUS — src/webview/sidebar-next   commit 5bc53c1 (parent of the P3.4 commit)   2026-10-13T23:38:01Z

Scope of this note: `src/webview/sidebar-next/**`, the 2.0 sidebar, and the harness scenario the item's gate
names (`src/test/harness/scenarios.test.ts`).

git status --porcelain --untracked-files=all: ` M src/webview/sidebar-next/index.tsx`,
` M src/webview/sidebar-next/index.test.tsx`, `?? src/webview/sidebar-next/` `SidebarView.tsx`, `SidebarView.test.tsx`,
`InstalledSection.tsx`, `outcomes.ts`, `outcomes.test.ts`, `sidebar.css`, `STATUS.md`,
` M src/test/harness/scenarios.test.ts`, ` M src/test/harness/STATUS.md`, ` M ARCHITECTURE.md`, ` M CHANGELOG.md`,
` M .github/copilot-instructions.md`, ` M docs/plans/STATUS.md`, ` M docs/plans/findings-ledger.md` (all belong
to the P3.4 commit)

Item: **P3.4 sidebar slice** (header, Installed section with its states, uninstall through `ops/remove`,
revalidation without blanking, the test ids of interaction model §8). Not a ⚑ item and no stop-and-ask
trigger: no L1 consultation. No contract change, no sentinel; `esbuild.mjs`, `package.json`, `src/host/**`
and `src/webview/shared/**` are untouched. The quarry has no file in this directory.

## Verified by running

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

2026-10-13, P3.4: no L1 consultation (the item is not ⚑ and no stop-and-ask trigger fired). The ambient
advisor was consulted twice before writing and once before the commit (where it found that every busy row
said "Uninstalling", and that U1 was closed too early). What it settled: prove that the build
writes `dist/sidebar.css` without a change to `esbuild.mjs` before any feature code (it does); the missing
`queued` progress event is not a contract mismatch (ADR-003 reports running workflows; the request gets the
chunk) and is covered inside the item's files; the centrally managed row is read-only or plain-remove, to be
decided and written down (read-only, above); the harness scenario is written against the client model.

## Exact next step (one item ID)

P3.5 (e2e `src/test/e2e/v2-sidebar.e2e.test.ts`, ExTester `src/test/ui/v2/sidebar.ui.test.ts`, and the CI
jobs `e2e-v2` and `ui-v2`). Read first: finding N62 (a `--v2` build has no `dist/webview.css`, so a 2.0 VSIX
does not pass `check:vsix`) and N63 (the sidebar bundle is at 96.7 % of its ceiling). The test ids to drive
are in interaction model §8: `nuiget-sidebar`, `sidebar-search-input`, `section-header-installed`,
`sidebar-installed-list`, `package-row-<id>`, `row-action-uninstall`, `status-live`.

# STATUS — src/webview/main   commit 4a083b5 (parent of the P5.4 commit c)   2026-10-15T01:30:00Z

Scope of this note: `src/webview/main/**`, the 2.0 main panel webview. The ExTester side is in
`src/test/ui/v2/STATUS.md`; the slices and primitives this item changed are in `src/webview/shared/STATUS.md`.

git status --porcelain --untracked-files=all: `?? src/webview/main/features/installed/{InstalledTab.tsx,
InstalledTab.test.tsx,InstalledProjectSection.tsx,TransitiveSection.tsx,BulkUninstallDialog.tsx}`,
` M src/webview/main/{index.tsx,MainShell.tsx,MainShell.test.tsx,main.css,STATUS.md}`,
`?? src/test/ui/v2/main-installed.ui.test.ts`, ` M src/test/ui/v2/STATUS.md`, ` M src/webview/shared/STATUS.md`,
` M ARCHITECTURE.md`, ` M CHANGELOG.md`, ` M .github/copilot-instructions.md`, ` M docs/plans/STATUS.md`,
` M docs/plans/findings-ledger.md` (all belong to P5.4 commit c)

Item: **P5.4 feature installed (main), commit c of three** (a `e4a7f4f`, b `4a083b5`), as steps 7 to 9 of the
P5.4 stop-and-ask ruling of 2026-10-14 (verbatim in `docs/plans/STATUS.md`). Earlier in this note: P5.3.

## Verified by running

P5.4 commit c:

```text
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each
npx vitest run --project frontend src/webview/main src/webview/shared src/webview/sidebar-next → Test Files 36 passed
                               (36) · Tests 286 passed (286); InstalledTab.test.tsx has the ruling's nine titles,
                               MainShell.test.tsx `announces the outcome of an operation of either surface once`
src/webview/main/features and MainShell.test.tsx, 40 times in a row → 40 of 40
npx vitest run --project backend src/test/lint → Test Files 6 passed (6) · Tests 117 passed (117)
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 121 passed (121) · Tests 2800 passed (2800)
npm run bench               → Test Files 18 passed (18) · Tests 112 passed | 1 skipped (113)
npx vitest run --coverage    → exit 0 · src/webview/{shared,main,sidebar-next}/** 1184 of 1210 lines, 97.85 % (floor
                               85) · src/webview/main 197 of 213 · src/webview/** 71.73 % (ratchet 64)
wc -l src/webview/main/MainShell.tsx src/webview/main/index.tsx → 165 + 24 = 189 (< 300) · grep -c 'installed={'
                               src/webview/main/index.tsx → 1
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 168070 / 299921 · webview 301845 / 600685
                               (244753 at P5.3) · sidebar 284204 / 329122 (278568 at P5.1; + the shared Listbox
                               multi-selection, rules, outcomes and slices); dist/ deleted after
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → 10 passing at the first run (src/test/ui/v2/STATUS.md)
npm run docs:protocol:check  → docs/protocol.md is up to date
npm run package:vsix (1.x entries, NUIGET_V2 unset, after rm -rf dist) → exit 0 · nuiget-v1.18.9.vsix (17 files,
                               531.25 KB) · npm run check:vsix → OK
npm run test:ui (1.x)       → SKIPPED: no 1.x UI file changed; the CI job `UI` runs it
test -e .claude/.contract-change → false · git diff --stat 9000208 -- src/protocol src/core docs/adr src/host
                               package.json esbuild.mjs vitest.config.mts eslint.config.mjs .github/workflows → empty
```

P5.3:

```text
baseline (at a275e8b) npx tsc --noEmit / npx eslint src → exit 0 / exit 0 · npx vitest run → Test Files 116
                               passed (116) · Tests 2727 passed | 3 skipped (2730)
line count (the gate)        → wc -l src/webview/main/MainShell.tsx src/webview/main/index.tsx → 154 + 23 = 177
                               (< 300). The shell is these two files; `main.css` (105) and the shared parser are not
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each
npx vitest run --project frontend src/webview/main src/webview/shared → Test Files 30 passed (30) · Tests 230 passed
npx vitest run --project backend src/host src/test/lint → Test Files 8 passed (8) · Tests 188 passed (188)
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 118 passed (118) · Tests 2768 passed (2768)
npm run bench               → Test Files 18 passed (18) · Tests 112 passed | 1 skipped (113)
npx vitest run --coverage    → exit 0 · src/webview/main 47 of 47 lines · MainShell.tsx and parseSearchQuery.ts
                               100 % lines and branches · src/webview/{shared,main,sidebar-next}/** 99.23 % (floor
                               85) · src/webview/** 70.53 % (ratchet 64)
npm run docs:protocol:check  → docs/protocol.md is up to date
npm run package:vsix (1.x entries, NUIGET_V2 unset, after rm -rf dist) → exit 0 · nuiget-v1.18.9.vsix (17 files,
                               531.13 KB) · npm run check:vsix → OK
test -e .claude/.contract-change → false
npx vitest run --project frontend src/webview/main, 40 times in a row (after the commit 7385eeb) → 40 of 40 green
npm run test:ui (the 1.x ExTester suite) → SKIPPED: no 1.x UI file changed; the CI job `UI` runs it
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → dist/webview.css written · check:vsix: OK (N62)
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 168070 / 299921 · webview 244753 /
                               600685 (placeholder 223600 before) · sidebar 278568 / 329122 (unchanged); dist/ deleted
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → third run 6 passing (details and the two failed
                               runs in src/test/ui/v2/STATUS.md; N66)
```

## Done (tested)

P5.4 commit c (`features/installed/`, the ruling's step 7):

- `InstalledTab.tsx`: the sections (one for the committed project from the installed slice, one per project from
  the allProjects slice in All Projects), the current row (`{ projectPath, id }`, click and Enter), the bulk set by
  project path, the `Toolbar` with `select-all-button` and `uninstall-selected-button`, the `BulkUninstallDialog`,
  single uninstall by Delete or the row's button (`ops/remove`, no confirmation), the `TransitiveSection` for a
  single project. Selection and dialog reset when the committed selection changes.
- `InstalledProjectSection.tsx`: one project's multi-selectable `Listbox` (comfortable rows, CPM and Vulnerable
  badges, busy status words from `IN_PROGRESS`, the uninstall row action only where `whyNotRemovable` allows it),
  loading, error with Retry, unsupported banner, empty states; in All Projects under a collapsible `SectionHeader`
  with the project's name, count and the provisional badge. `visibleRows` holds the filter rules.
- `TransitiveSection.tsx` (`transitive-section`): closed until opened, then lists by target framework with
  "Required by" descriptions, `transitive-restore-banner` with Restore, error banners with Retry, empty state.
- `BulkUninstallDialog.tsx`: `ConfirmDialog` "Uninstall N packages?" listing the packages under "From <project>:".
- `MainShell.tsx`: announces `describeOutcome` of every outcome once (`announces the outcome of an operation of
  either surface once`); `index.tsx` passes `installed={view => <InstalledTab {...view} />}`; `main.css`: the tab's
  layout. Tests: `InstalledTab.test.tsx`, the ruling's nine titles.

- `index.tsx`: as the sidebar's entry: `acquireVsCodeApi()` once, inside `if (rootElement)` (`#root`, which
  `MainPanelHost` renders), `createMessageBus`, `StoreProvider` around `MainShell`; imports `../shared/tokens.css`
  and `main.css`, so a `--v2` build writes `dist/webview.css`. `index.test.tsx` (two tests, rewritten in place;
  the title `does not mount itself when the page has no root element` kept).
- `MainShell.tsx`: `main` landmark `nuiget-app`; header with `project-selector` (projects slice, "All Projects
  (N)" with two or more, "Loading projects…" / "No projects", disabled until the session), `source-selector`
  (the session's source, disabled), "Include prerelease" (`session/set { includePrerelease }`), Refresh
  (`refresh/all`, outcome in the live region); `search-input` in a `search` landmark; `Tabs` (`tab-bar`,
  `installed-tab`, `updates-tab`); the split (`Sash` 25–75 %, `--nuiget-split` through `cssVars`), the details
  pane `package-details-panel` with the empty state; one `status-live`. `@installed`/`@vulnerable` select
  Installed, `@updates` Updates, and the text after the prefix is handed to the list (`ListView.filter`,
  `vulnerableOnly`); browse text changes nothing; Escape clears or blurs; another tab ends a filter mode;
  `ui/selectProject` with `initialTab` and `ui/focusSearch`. 14 tests in `MainShell.test.tsx`, the last over
  `document.body` with axe and no React console error.
- `main.css`: the column, header, search box, split and details pane; tokens only, `nuiget-` classes.
- `src/webview/shared/search/parseSearchQuery.ts` with its 24 tests, ported unchanged from 1.x.
- `src/host/MainPanelHost.ts`: the first of the two JSDoc comments on `notifyInvalidated` deleted.

## Done (untested)

- All Projects in VS Code: the ExTester tests drive the single-project list only (the fixture workspace has one
  project). The per-project sections, their scroll container and the all-projects bulk request are shown by
  `InstalledTab.test.tsx` in jsdom, not in a real webview.
- The transitive section in VS Code: no ExTester test opens it (the fixture has no restored assets file in CI).
- The Updates tab and the details pane stay empty until P5.5 and P5.7.
- The split is not kept across reloads (`getState`/`setState`): with the surface-local state of P5.10.
- The Updates tab has no count badge: with the updates slice (P5.5).

## Not started

- Browse: the results list, quick-search, the `@` prefix dropdown and hiding the tab bar in browse mode (interaction
  model §2): P5.6.
- The list of sources in the source selector and the source settings dialog: P5.8. `ui/openSourceSettings` and
  `ui/navigateToPackage` are not handled by the shell yet (P5.8, P5.6).

## Deviations from contract/ADR (file:line each)

P5.4 commit c:

- `index.test.tsx` is not edited: both of its tests still hold with the Installed tab mounted (the tab asks nothing
  before the session has arrived), so there was nothing to rewrite.
- `InstalledProjectSection.tsx`: the rows show no package icon. 1.x showed icons fetched from the feeds; the 2.0
  host has no icon source until P4 and P5.7's details; the comfortable row reserves no space for one.
- `InstalledTab.tsx`: Select all takes the removable rows the filter shows and leaves out rows that are busy; a
  package selected earlier that has left the list is dropped from what the dialog lists.
- `TransitiveSection.tsx`: the rows' metadata is used for a Vulnerable badge only; descriptions come with P5.7.
- `installed-list-<name>` (All Projects) and `transitive-list` are test ids outside interaction model §8, recorded for
  P5.12b, which decides whether they enter the table (as the P3 review asked for the sidebar's).

- `MainShell.tsx` (source selector): interaction model §1 shows the source in a header selector. It is there, bound
  to the session alone and disabled: the sources slice is P5.8's by the P3.6 ruling, so no `sources/list` is
  asked here. Populated and enabled at P5.8.
- `MainShell.tsx` (search): §2 says browse hides the tab bar; until the results list exists (P5.6) browse text
  changes nothing on screen. §2's `@` prefix dropdown is P5.6's.
- `MainShell.tsx` (layout): the tab bar sits over the list pane, the details pane beside both, so the details stay
  when the tab changes and browse (P5.6) can replace the list pane alone.
- Interaction model §1 lists the restore toggle among the shared context; the main header does not show it. The
  sidebar's title-bar toggles are P5.10's; whether the main header gets one too is decided there.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-14, P5.3: no L1 consultation (the item is not ⚑ and no stop-and-ask trigger fired). The ambient advisor was
consulted before writing; its points are in the code and above: the source selector bound to the session and
disabled (P5.8 owns the slice); the prerelease toggle in scope; the panes as props and the details empty state
with its product sentence; the `@` dropdown in P5.6; `main/STATUS.md` new; `index.test.tsx` rewritten in place; a
`mainWebview.ts` helper instead of editing P3.5's; the `check:vsix` step after the ExTester run; the gate order with
the `NUIGET_V2` build checked locally and `package:vsix` on the 1.x entries.

## Exact next step (one item ID)

P4.1 (proxy and certificate investigation before Transport lands): the first P4 row; P5.1, P5.3 and P5.4 ran before
P4 by the P3.6 ruling. The next main-panel row is P5.5 (updates), after P4.10.

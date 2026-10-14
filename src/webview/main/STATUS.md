# STATUS — src/webview/main   commit a275e8b (parent of the P5.3 commit)   2026-10-14T21:50:00Z

Scope of this note: `src/webview/main/**`, the 2.0 main panel webview, and what it brings into
`src/webview/shared/search` (the ported `parseSearchQuery`). The ExTester side is in `src/test/ui/v2/STATUS.md`.

git status --porcelain --untracked-files=all: ` M src/webview/main/index.tsx`, ` M src/webview/main/index.test.tsx`,
`?? src/webview/main/{MainShell.tsx,MainShell.test.tsx,main.css,STATUS.md}`,
`?? src/webview/shared/search/{parseSearchQuery.ts,parseSearchQuery.test.ts}`, ` M src/host/MainPanelHost.ts`,
` M .github/workflows/ci.yml`, ` M .github/copilot-instructions.md`, `?? src/test/ui/v2/{main-shell.ui.test.ts,
mainWebview.ts}`, ` M src/test/ui/v2/STATUS.md`, ` M ARCHITECTURE.md`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md`,
` M docs/plans/findings-ledger.md` (all belong to the P5.3 commit)

Item: **P5.3 main shell** (header, unified search, tab bar, split layout, < 300 lines), pulled before P4 by the
P3.6 ruling; closes N62; from the P2 phase review, the duplicate JSDoc of `MainPanelHost.notifyInvalidated`. Not
⚑, no stop-and-ask trigger: no L1 consultation. No contract change, no sentinel, `package.json` untouched.

## Verified by running

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
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → dist/webview.css written · check:vsix: OK (N62)
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 168070 / 299921 · webview 244753 /
                               600685 (placeholder 223600 before) · sidebar 278568 / 329122 (unchanged); dist/ deleted
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → third run 6 passing (details and the two failed
                               runs in src/test/ui/v2/STATUS.md; N66)
```

## Done (tested)

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

- Nothing of the shell has data in its tabs yet: the lists and the details are props that `index.tsx` does not
  pass until their features (P5.4 Installed, P5.5 Updates, P5.7 details). The panel shows the tab bar over an
  empty panel and the details empty state; the ExTester screenshot of run 2 shows that layout.
- The split is not kept across reloads (`getState`/`setState`): with the surface-local state of P5.10.
- The Updates tab has no count badge: with the updates slice (P5.5).

## Not started

- Browse: the results list, quick-search, the `@` prefix dropdown and hiding the tab bar in browse mode (interaction
  model §2): P5.6.
- The list of sources in the source selector and the source settings dialog: P5.8. `ui/openSourceSettings` and
  `ui/navigateToPackage` are not handled by the shell yet (P5.8, P5.6).

## Deviations from contract/ADR (file:line each)

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

P5.4 (feature installed, main): `index.tsx` passes `installed={view => <InstalledTab {...view} />}` (or the
feature's name for it); the shell gives the filter and `vulnerableOnly`; the bulk-uninstall dialog is
`ConfirmDialog`, the bulk toolbar `Toolbar`.

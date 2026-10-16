# STATUS — src/test/ui/v2   commit 2493ecc (parent of the P9.0 commit)   2026-10-16T18:40:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/workflows/ci.yml`,
`src/test/ui/settings.json`, `src/test/ui/v2/{main-all-projects,main-details,main-installed,main-search,main-updates,sidebar,theme}.ui.test.ts`,
`src/test/ui/v2/sidebarWebview.ts`, `src/test/ui/v2/STATUS.md`, `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`

Item: **P9.0** — visual evidence gate (D18; parity audit TF6, TF1/TF2 in part). Every v2 UI suite screenshots its
named states; CI uploads them as the `ui-screenshots` artifact on every run and fails when a named state has no PNG.
This note replaces the P7.2a note (history at `54885d4`).

## Verified by running

```text
baseline (2493ecc)          → npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npx vitest run: 129 files,
                              1910 passed, 9 skipped
npx tsc --noEmit            → exit 0
npm run check-types         → exit 0
npx eslint src              → exit 0
npm run lint                → exit 0
npm test                    → exit 0 · Test Files 129 passed (129) · Tests 1910 passed | 9 skipped (1919)
npm run bench               → exit 0 · Test Files 14 passed (14) · Tests 75 passed (75)
rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui (macOS arm64, VS Code 1.140.0)
                            → run 1: exit 0 · 37 passing (1m) · 12 PNGs in /tmp/nuiget-ui/screenshots/<ts>/, one per
                              state of `ScreenshotState`
                            → run 2 (after `git.openRepositoryInParentFolders: never`): exit 1 · 23 passing, 13 failing:
                              the P5.12b install test timed out after 240000 ms on "NUnit in TestProject.csproj"; its
                              `after` hook, main-shell (2), main-updates and the six theme passes followed (panel left in
                              browse mode); the extension log has no `dotnet package add` → finding N85, stop-and-ask
                            → run 3, same tree: exit 0 · 37 passing
tally (each a full suite run; `adds` = `package add` lines in the extension log):
                              P9.0 tree 5 more runs: 5 × exit 0, 37 passing, adds=2, fixture clean (7 of 8 in all)
                              2493ecc (P9.0 changes stashed): 5 × exit 0, 32 passing, adds=2, fixture clean
after the ruled rewrite of the P5.12b test (N85):
npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npm run lint 0 · npm test exit 0 (129 files, 1910
                              passed, 9 skipped) · npm run bench exit 0 (14 files, 75 passed)
two full UI runs            → 2 × exit 0, 37 passing (1m), adds=2, fixture clean; 12 PNGs; the N85 poll never timed out
"Check the named screenshots" step body under bash, against the run-1 directory → exit 0, "12 named states; PNGs in
                              the artifact: 12"; against an empty directory (negative control) → exit 1, one
                              "::error::no screenshot of the state …" line per state
git status --short src/test/e2e/fixtures/e2e-workspace → clean after every run
npm run docs:check, npm run package:vsix, npm run test:e2e → SKIPPED: no product, document or packaging change; CI
                              runs E2E and Build & Package on the push
```

## Done (tested)

- `sidebarWebview.ts`: `ScreenshotState` (the 12 names of the plan row) and `screenshot(state)`, a typed wrapper of
  `VSBrowser.instance.takeScreenshot`. A misspelt state is a type error; the CI check reads its names from this union.
- Captures, each after the waits that make the state true:
  `main-installed-all` (`main-all-projects`, two project sections) · `main-details-readme` (`main-details`, README or
  its empty state) · `main-installed-single` (`main-installed`, both rows) · `main-transitive-expanded` (new test in
  `main-installed`: opens the section, clicks Restore when the runner has no assets file, waits for the list or the
  empty state, closes the section again) · `main-browse-results` (`main-search`, after the cold-search line, so the
  timing is unchanged) · `main-quicksearch-open` (new test in `main-search`, after the timed one: types `Serilog`,
  waits for a suggestion, screenshots while the box has focus, clears) · `main-browse-details` (`main-search`, waits
  for "Dependencies" first) · `main-updates` (`main-updates`, after the tab count) · `sidebar-sections` (`sidebar`,
  waits for the update row too) · `sidebar-narrow-200px` (new test in `sidebar`: drags the side bar's sash to 200 px,
  waits for the webview at ≤ 200 px, screenshots, drags back in `finally` so the theme pass measures at the usual
  width) · `main-installed-single-light` / `-hc` (two new tests in `theme`, after the axe loop, which is unchanged:
  Light Modern and Dark High Contrast, Installed tab).
- `ci.yml`: `ui-log` uploads the log only; new `ui-screenshots` upload (`if: always()`, `if-no-files-found: error`);
  new step "Check the named screenshots".
- `src/test/ui/settings.json`: `git.openRepositoryInParentFolders: never`; the "A git repository was found in the
  parent folders" toast covered the details pane in run 1.
- Named rewrite (plan §2.1, by the stop-and-ask ruling below) of `installs a package from the details of its browse
  row, and the project file follows (P5.12b)` in `main-search.ui.test.ts`: before the click it waits until
  `version-selector` no longer reads "loading versions" (60 s); after the single click it polls 10 s until the button
  is disabled or reads "Working…" (N85). Timing assumption: the first check runs milliseconds after the click, long
  before `dotnet package add` and the restore could end and enable the button again. The file's `after` hook presses
  Escape in `search-input` and waits for `tab-bar` before it clicks `installed-tab`. The csproj poll and the
  "Installed NUnit" wait are unchanged.

## Done (untested)

- None.

## Visual check (local run 1, downscaled copies; the CI artifact is viewed after the push)

- viewed: main-installed-single.png: Installed tab, Newtonsoft.Json selected, both rows single-line with the
  description right-aligned; details pane on README; the git toast bottom right.
- viewed: main-transitive-expanded.png: section open at the bottom, "No transitive dependencies." (the fixture's two
  packages have none on net8.0, so P9.5 needs a fixture with transitive packages to show rows).
- viewed: main-quicksearch-open.png: suggestion list under the box (Serilog, Serilog.Sinks.File, …); list pane
  empty; details pane still shows Serilog from the earlier test.
- viewed: main-installed-single-hc.png: Dark High Contrast, bordered panes, check boxes visible on the rows.
- viewed: main-installed-all.png: two sections TESTPROJECT.CSPROJ (2) and UTILITY.CSPROJ (1) with a "provisional"
  badge; transitive aggregate closed.
- viewed: sidebar-narrow-200px.png: side bar at 200 px; Installed rows readable, Updates row name cut to
  "Newtonso…" by the version (the overflow P9.10 fixes); main panel on Updates beside it.

## Visual check (CI run 38951346180 on 1d76a1a, artifact `ui-screenshots`, 12 PNGs at 1280×900, all viewed)

UI job: 37 passing (2m); "Check the named screenshots": "12 named states; PNGs in the artifact: 12". None contradicts
the intended rendering of P9.0, which changes no webview; they are the baseline P9.1-P9.11 change.

- viewed: main-installed-single.png: one-line rows, "Newtons…" cut while its description keeps the width (MI3), no
  icon; details on the README of Newtonsoft.Json.
- viewed: main-installed-all.png: TESTPROJECT.CSPROJ (2) and UTILITY.CSPROJ (1, "provisional"); no icons; transitive
  aggregate closed.
- viewed: main-transitive-expanded.png: section open at the bottom, "No transitive dependencies." (the fixture has
  none on net8.0; P9.5 needs one that has).
- viewed: main-updates.png: two rows `13.0.2 → 13.0.4`, `3.1.1 → 4.4.0` with Verified, Update all (2); the details
  pane still shows NUnit from the Browse test before (stale details, P9.6).
- viewed: main-browse-results.png: icons on most rows, names cut to "N…", "Newt…" (MB1); details show Serilog from
  before (stale, P9.6).
- viewed: main-browse-details.png: Newtonsoft.Json, Installed 13.0.2, version 13.0.4, Update; Details tab fields.
- viewed: main-quicksearch-open.png: five suggestions under the box, no source grouping (MB6, MB7); list pane empty.
- viewed: main-details-readme.png: README rendered; two badge images show their alt text (not loaded on the runner).
- viewed: sidebar-sections.png: INSTALLED (2) and UPDATES (2) filled; main panel on Updates beside it.
- viewed: sidebar-narrow-200px.png: side bar at 200 px; the Updates row reads "Newton… 13.0.2 → 13.0.4" (P9.10).
- viewed: main-installed-single-light.png: Light Modern, Installed tab, grey buttons, sidebar beside it.
- viewed: main-installed-single-hc.png: Dark High Contrast, bordered panes and tab, row check boxes visible.

## Not started

- Parity audit TF6 closes with this item; `docs/plans/parity-audit-2026-10-16.md` is P9.13's file (plan row
  "close gaps as items land"), so P9.13 records it.
- Hand-off to P9.9: `DetailsPane.tsx:131` returns without a word when a click is refused (N85).
- Gotcha table: a red "Upload UI screenshots" step after an N37 download failure is a consequence, not a separate
  failure (no PNG exists when no test ran). `copilot-instructions.md` is not this item's file; hand-off to P9.13.

## Deviations from contract/ADR (file:line each)

- The ruling says "add row N85 to docs/plans/STATUS.md"; the ledger is `docs/plans/findings-ledger.md` (plan §6,
  its own rule "a row in section 1 and an entry in section 4"), so N85 is there and the tracker row of P9.0 cites it.
- `main-installed-single` and `main-details-readme` can be the same image: the Installed tab keeps the README
  selection of the file before. Not a defect of the mechanism.

## Advisor decisions (date, item, question, answer verbatim)

- 2026-10-16, P9.0: the ambient advisor before the edits (placement of the 12 states, the cold-search timing, the
  transitive banner, the 200 px drag).
- 2026-10-16, P9.0, stop-and-ask (plan §2.3 "a failing test you did not write", local run 2). Question: "Which option,
  and is one green CI run on the P9.0 commit enough to land P9.0 given a local 1-in-3 failure of this pre-existing
  test?" Answer of the `architecture-advisor` subagent, verbatim:

`````text
DECISION: Option 2, narrowed: a named rewrite of the P5.12b install test inside P9.0 that makes the click deterministic and fails fast, with no retry-click; the tally result is recorded as evidence whichever way it falls. Not option 1 (the flake would ride on every P9 item until P9.12, and each hit cascades into 13 failures), not option 3 (the new test is not the mechanism), not option 4 (nothing here is the owner's). One green CI run on the P9.0 commit is enough once two local full runs of the edited tree are green.

WHY: The brief is wrong about the mechanism: `stale` is defined as `selection.origin !== 'browse' && …` (/Users/mattias/github/nuiget/src/webview/shared/store/details.tsx:137), so for a browse-row selection `primaryWhy` can never become "Checking the selected project", and `committed` only moves to a newer snapshot (/Users/mattias/github/nuiget/src/webview/shared/store/session.tsx:30), so `committedProject` cannot go null between the poll and the click; no in-code path disables that button in that window. The run-2 log proves the request never left the webview: an admitted install logs `dotnet package add`, a queue refusal logs `Operation "install NUnit" was not admitted` at warn (/Users/mattias/github/nuiget/src/core/ops/OperationQueue.ts:79), a throwing handler logs `[main] ops/install failed` at error (/Users/mattias/github/nuiget/src/host/WebviewHost.ts:158), and `loggerFor` forwards warn and error to the LogOutputChannel (/Users/mattias/github/nuiget/src/host/services.ts); none of the three lines is in the 8-line log. The one thing that changes under the button in exactly that window is layout: `.nuiget-main-select` is content-sized (`min-width: 0; max-width: 20em`, /Users/mattias/github/nuiget/src/webview/main/main.css:31-33), its only option reads `5.0.0 (loading versions…)` until the versions answer (/Users/mattias/github/nuiget/src/webview/main/features/details/DetailsPane.tsx:217), the `disabled` predicate at :224 ignores `versions.status`, and the Install button sits to its right in a wrapping flex row (`main.css:227-232`); the test's poll (/Users/mattias/github/nuiget/src/test/ui/v2/main-search.ui.test.ts:129) therefore passes while the select is still wide, and a WebDriver click whose centre was computed before the select narrows lands to the right of the button. The only unverified link is chromedriver's window between rect computation and mouse dispatch, which is why the rewrite adds a post-click assertion rather than a retry: if the pre-condition is the fix the assertion never fires; if something else is going on it fails in 10 s with a precise message instead of a 240 s timeout plus the `after`-hook cascade. Plan §2.1 lets an advisor-named test be rewritten inside the item, and the change is a strengthening (the versions list must load; the click must start an operation), not a weakening under RUN.md §4.

DO:
1. Do not edit /Users/mattias/github/nuiget/src/test/ui/v2/main-search.ui.test.ts until the with/without tally has finished: each run compiles `tsconfig.test.json`, so a mid-tally edit corrupts the comparison. Record its counts (n/5 with, n/5 at 2493ecc) in N85 whatever they are. A failure at 2493ecc proves pre-existing; 0/5 at 2493ecc does not exonerate P9.0 ((2/3)^5 ≈ 0.13), and a with-only pattern does not implicate the quick-search test either: extra feed traffic before the install test only moves when the versions answer lands. Do not move the quick-search test on the tally alone.
2. In the P5.12b install test, before the existing Install poll at :129, add a poll on `version-selector`: `textContent` must no longer contain `loading versions` (60 s, `what` = "the versions of NUnit"). Keep the Install-enabled poll and the single `install.click()` as they are.
3. After the click, add a poll (10 s) until the button is disabled or its text matches `/Working/`; `what` names N85 (for example "the Install click to start an operation (N85)"). The first probe runs milliseconds after the click, long before `dotnet package add` plus restore could complete and briefly re-enable the button before the new list arrives; state that timing assumption in the STATUS note.
4. Same file, same rewrite: in `after` (:34-47), before clicking `installed-tab`, click `search-input`, send Escape and wait for `tab-bar` (10 s), so a future failure of this test stays one failure instead of leaving every later file in browse mode.
5. Ledger: add row N85 to /Users/mattias/github/nuiget/docs/plans/STATUS.md with the three absent log lines, the corrected mechanism (stale unreachable for browse; select narrows on versions ready; disabled ignores versions.status), the tally counts, and "named rewrite of `installs a package from the details of its browse row, and the project file follows (P5.12b)` in P9.0". The directory /Users/mattias/github/nuiget/src/test/ui/v2/STATUS.md lists that test by title under the named-rewrite rule (§2.1) and pastes this answer under Advisor decisions. Note the silent early return at DetailsPane.tsx:131 (no announce) as a hand-off observation for P9.9 (operation feedback), not a P9.0 edit.
6. Gates: `npx tsc --noEmit`, `npm run check-types`, `npx eslint src`, `npm test`, `npm run bench`, then two full `rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui` runs, both exit 0 with 37 passing and 12 PNGs, and the N85 poll never timing out. Then commit (cite P9.0, D18, N85), push, one green CI run with the "12 named states" line, view the PNGs per the new RUN.md rule.

DO NOT:
- Add a retry-click or any loop that clicks again while the button is still enabled.
- `gh run rerun` a red UI run for this failure; it is not N37 or N65.
- Edit DetailsPane.tsx or any webview file under P9.0.
- Edit the plan's P9.12 row or the plan file; the hand-off goes in the tracker and the directory STATUS.
- Move, reorder or rewrite the P9.0 quick-search test because of the tally alone.
- Treat a with-only tally as proof of a cause; it is a timing amplifier and goes in N85 as such.
- Weaken the csproj poll or the `status-live` "Installed NUnit" wait; both stay.

CONTRACT CHANGE: none

VERIFY: `grep -n "N85" docs/plans/STATUS.md` shows the ledger row and `grep -n "loading versions\|N85" src/test/ui/v2/main-search.ui.test.ts` shows the pre-click wait and the post-click poll; two local `npm run test:ui -- --storage /tmp/nuiget-ui` runs exit 0 with "37 passing" and `ls /tmp/nuiget-ui/screenshots/*/ | wc -l` = 12 each; `gh run view <id> --json jobs` shows the UI job `success` on the P9.0 commit and its "Check the named screenshots" step prints "12 named states; PNGs in the artifact: 12".
`````

  Acted on: DO 1-6 as written, with the ledger deviation above.

## P9.5 addition

- `main-transitive.ui.test.ts` (P9.5, ruling in `src/webview/main/STATUS.md`): a run-time `Transitive/Transitive.csproj`
  with Serilog.Sinks.Console 6.1.1, restored through the banner; captures `main-transitive-expanded` (moved here from
  `main-installed.ui.test.ts`) and the 13th state `main-transitive-details`. `chooseProject` lives in `mainWebview.ts`.

## P9.6 addition

- `main-search.ui.test.ts` (P9.6, ruling in `src/webview/main/STATUS.md`): the suggestion poll skips disabled options
  (the `Searching…` row), and the quick-search test presses ArrowDown, ArrowRight and captures the 14th state
  `main-quicksearch-versions` before ArrowLeft.

## Exact next step (one item ID)

P9.1.

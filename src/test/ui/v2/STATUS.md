# STATUS — src/test/ui/v2   commit 80940aa (parent of the P9.fix-2 commit)   2026-10-17T10:00:00Z

git status --porcelain --untracked-files=all (before commit 1): modified `docs/plans/STATUS.md`,
`docs/ux/interaction-model.md`, `src/test/ui/v2/{STATUS.md,main-all-projects.ui.test.ts,main-shell.ui.test.ts,main-transitive.ui.test.ts,mainWebview.ts}`,
`src/webview/main/{MainShell.tsx,STATUS.md}`

Item: **P9.12** — Tests that see content (parity audit TF1–TF4, TF7, TF8) and finding N86, by the ruling below, in three
commits: (1) TF8, the shared Refresh-pressing wait (clears the red run 38997325272); (2) N86, the reorder in
`extension.ts` with a harness scenario; (3) TF1, TF3, TF7. This note replaces the P9.6-era note (history at `eeef52d`).

## Verified by running

```text
baseline (33312b2)          → npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npx vitest run exit 0
                              (Tests 2009 passed | 9 skipped (2018))
CI on 33312b2 (docs only)  → run 38997321456 success; run 38997325272 `UI` failure: `38 passing (6m) · 2 failing`, both
                              "Timed out after 120000 ms waiting for the All Projects option" (TF8; not N37: VS Code and
                              ChromeDriver downloaded); no rerun, fixed by commit 1
commit 1:
npx tsc --noEmit 0 · npx eslint src 0 · npm run lint 0 · npm run docs:check 0
npx vitest run --project backend src/test/lint/interaction-model-testids.test.ts → Tests 3 passed (3)
npm test                    → exit 0 · Tests 2009 passed | 9 skipped (2018) · npm run bench → exit 0
rm -rf dist out/esbuild && node esbuild.mjs --production --analyze → dist/extension.js 297016 / 322502 ·
                              dist/webview.js 548746 / 577766 · dist/sidebar.js 333071 / 351245
rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui → exit 0 · 40 passing (1m)
CI runs 38998896884, 38998895301 on eb68dbb (commit 1) → success (the branch is green again)
commit 2:
negative control (scenario before the reorder) → AssertionError: main: projects while the listing runs: expected [ …(3) ] to deeply equal [ …(2) ] (+ "…/harness-qoAwVE/C/C.csproj")
npx vitest run --project integration src/test/harness → Tests 24 passed (24) · src/extension.test.ts → 38 passed (unchanged)
npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npm run lint 0 · npm run docs:check 0
npm test                    → exit 0 · Tests 2010 passed | 9 skipped (2019) · npm run bench → exit 0
npm run package:vsix        → exit 0 · Packaged: nuiget-v2.0.0.vsix (17 files, 580.85 KB)
rm -rf dist out/esbuild && node esbuild.mjs --production --analyze → dist/extension.js 297018 / 322502 ·
                              dist/webview.js 548746 / 577766 · dist/sidebar.js 333071 / 351245
rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui → exit 0 · 40 passing (1m)
CI runs 38999383727, 38999382231 on c9dffb7 (commit 2) → success
commit 3:
npx vitest run --project integration src/test/harness → after step 18 alone: Tests 24 passed (24); with the TF7
                              scenario as first written: 1 failed ("expected { id: 'Serilog', …(6) } to not have
                              property "vulnerabilities"", received []) → stop-and-ask, follow-up ruling below →
                              Tests 25 passed (25)
npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npm run lint 0 · npm run docs:check 0
npx vitest run              → exit 0 · Tests 2011 passed | 9 skipped (2020)
npm test                    → exit 0 · Tests 2011 passed | 9 skipped (2020) · npm run bench → exit 0
rm -rf dist out/esbuild && node esbuild.mjs --production --analyze → dist/extension.js 297018 / 322502 ·
                              dist/webview.js 548746 / 577766 · dist/sidebar.js 333071 / 351245
rm -rf /tmp/nuiget-ui/screenshots dist && npm run test:ui -- --storage /tmp/nuiget-ui → exit 0 · 42 passing (1m)
[P9.12] comfortable rows (installed-list and updates-list): Newtonsoft.Json and Serilog, minHeight 66px, height 67,
                              iconLoaded true, iconSrc data:image/png (token 66 → bound [66, 68])
CI runs 39000089739 (push), 39000093536 (pull_request) on dc70b60 → success; UI log of 39000089739 attempt 1:
                              `42 passing (2m)`, `[P9.12] comfortable rows` 66px / 67 for both rows in both lists
gate: gh run rerun 39000089739 → attempt 2 success; UI log: `42 passing (2m)` (grep -c "42 passing" → 1 per attempt)
```

## Done (tested)

- P9.fix-2 (by the ruling verbatim in `src/webview/main/STATUS.md`): named rewrite of `main-installed.ui.test.ts`
  `the transitive section opens with what the project gets through its references (P9.0)` → `…, right under the last
  direct row (P9.0, P9.fix-2)`: with the section open it measures the max `bottom` of the direct rows and the `top` of
  the transitive header and asserts the gap within -1 (subpixel) and one comfortable row; logs `[P9.fix-2]`. Local run
  42 passing, gap 0 (284/284); CI run 39022785828 the same.
- P9.fix-3: named rewrites `main-installed.ui.test.ts` (… the authors fit and the check box is centred (P9.fix-3)):
  `.nuiget-row-authors` of Newtonsoft.Json `scrollWidth <= clientWidth`, every row's check box centre within 2 px of
  the `.nuiget-row` centre; `main-updates.ui.test.ts` (…, check box centred) the same centre check. The height band
  `token..token+2` is unchanged and reads 78 now. Local: 42 passing, rows 79 px, centres 0.5 px off; CI run 39023352495
  the same.
- P9.fix-4: new tests `the Uninstall selected button sits at the list's right edge (P9.fix-4)` (`main-installed`) and
  `the Update all button sits at the list's right edge (P9.fix-4)` (`main-updates`): `|right(button) - right(list)| <= 8`.
  Local: 44 passing, 6 px on both; CI run 39023954472 the same.
- P9.fix-5: named rewrite `main-details.ui.test.ts` `shows the versions, the details and the README of the current
  row` → `…, with Uninstall and Update in one column (P9.fix-5)`: `|left(uninstall) - left(update)| <= 1` and heights
  within 0.5 px. Local: 44 passing, equal (1155.79, 24 px).

- Commit 1 (TF8, TF4): `MainShell` Refresh carries `data-testid="refresh-button"` (interaction model §8);
  `mainWebview.ts` exports `projectOptionValues`, `untilProjects` (presses `refresh-button` every 15 s, 180 s in all) and
  `optionFor`; `main-transitive.ui.test.ts` imports them; `main-all-projects.ui.test.ts` waits for the All Projects
  option through `untilProjects` in both tests and for its removal in `after`; `main-shell.ui.test.ts` renders
  `refresh-button` under the CSP. The host side of TF8 (a create event invalidates `projects`, `extension.ts:316,323`)
  was already true.

- Commit 2 (N86): the reorder in `extension.ts` (see `src/STATUS.md`); `chooseProjectUntilCommitted` replaced by
  `chooseProjectCommitted` (one dispatch, then a poll; `main-transitive.ui.test.ts` two sites, `main-all-projects.ui.test.ts`
  one); the harness scenario and `files.addProject` (see `src/test/harness/STATUS.md`); N86 closed in the ledger;
  ARCHITECTURE `refreshProjectsAndSession` sentence; CHANGELOG Fixed; gotcha "`projects/changed` before `reconcile`".

- Commit 3 (TF1, TF3, TF7): `tokenPx` exported from `sidebarWebview.ts` (`sidebar.ui.test.ts` imports it);
  `mainWebview.ts` `measureLoadedRows(listTestId)`; `main-installed.ui.test.ts` 'lays the rows out as comfortable cards
  with a loaded icon, as tall as the token, and shows the authors and the Verified mark (TF1, TF3)';
  `main-updates.ui.test.ts` 'update rows are comfortable cards with a loaded icon, as tall as the token (TF3)'; the
  fake feed and the TF7 scenario (see `src/test/harness/STATUS.md`). Step 19's last assertion was corrected from absent
  to `vulnerabilities: []` by the follow-up ruling below.
- TF map: TF1, TF3 by commit 3 (the two UI tests); TF2 met by the tree (`InstalledTab.test.tsx:264`,
  `UpdatesTab.test.tsx:268, :307`, `AllProjectsView.test.tsx:67`); TF4 met by the tree (the §8 lint) plus
  `refresh-button` (commit 1); TF7 by commit 3 (the harness scenario); TF8 by commit 1, host side verified at
  `extension.ts:316,323`.

## Visual check of commit 1 (CI run 38998896884)

- viewed: main-installed-all.png: unchanged (TestProject.csproj and Utility.csproj sections, All Projects (2)).
- viewed: main-installed-single.png: unchanged (Installed tab, Newtonsoft.Json with its README).

## Visual check of commit 3 (CI run 39000089739, attempt 2)

- viewed: main-installed-single.png: Newtonsoft.Json and Serilog as comfortable cards with their nuget.org icons,
  `13.0.2 ✓ James Newton-King` and `3.1.1 ✓ Serilog Contributors`; README pane for Newtonsoft.Json. Agrees with the test.
- viewed: main-installed-all.png: All Projects (2), TestProject.csproj (2) with icons, authors and Verified marks;
  Utility.csproj (1) `provisional` with the default icon. Agrees.
- viewed: main-updates.png: Updates (2), `13.0.2 → 13.0.4` and `3.1.1 → 4.4.0` with icons, Verified and authors
  (ellipsised); Update all (2). Agrees.
- viewed: main-transitive-expanded.png: Transitive.csproj, Serilog.Sinks.Console 6.1.1 direct, transitive Serilog 4.0.0
  under `net8.0`, both with icon and `✓ Serilog Contributors`. Agrees.

## Done (untested)

- None.

## Not started

- None for P9.12.

## Deviations from contract/ADR (file:line each)

- None. One deviation from the wording of step 16: `min-height` is on the row's `role="presentation"` wrapper
  (`.nuiget-row--comfortable`, `Row.tsx:94, :103`, `primitives.css:86-88`), not on the option, so
  `measureLoadedRows` reads `minHeight` and `height` of `option.closest('.nuiget-row')`; the bound `[token, token + 2]`
  is unchanged.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-17, P9.12 (TF1–TF8 against the tree, N86's fix, the red run on 33312b2). Answer of the `architecture-advisor`
subagent, verbatim:

`````text
DECISION: Option 1, sharpened into three green code commits plus one docs commit, and the addendum's plan confirmed: the TF8 fix is P9.12 commit 1 and its green run clears the red of run 38997325272 (a test ran and failed: not N37/N65, no `gh run rerun` of that run). N86 is fixed by reordering `refreshProjectsAndSession` in `src/extension.ts` (announce `projects/changed` only after `session.reconcile`, nothing on the early return), proved by a harness scenario that holds `nuget list source` under a `refresh/all`; `chooseProjectUntilCommitted` is removed in the same commit (its retry would hide an N86 regression). TF2 and TF4 are already met by the tree; TF1/TF3 become one measuring test each in `main-installed.ui.test.ts` and `main-updates.ui.test.ts`; TF7 becomes one harness scenario over a fake feed that serves `verified` and an icon; TF8's host half is already true (no host discovery change), its test half is the shared Refresh-pressing wait. No contract change. Not `OWNER MUST DECIDE`.

WHY: Verified in the tree, with two corrections to the brief. (1) `SessionStore` lives at `src/core/session/SessionStore.ts` (not `src/host`): `reconcile` (:99-103) is the only writer of `knownProjects`, and `normalizeProject` (:118-129) answers the first project for an unknown path and for `ALL_PROJECTS` with one project known. `extension.ts` fires `events.projectsChanged` at :189, lists sources at :196 (`catalog.sources(dir)`, a coordinator resource `sources:<dir>`) and reconciles at :202, so a `session/set` for a project the webview was just told about lands on the old list: N86 as recorded. The order "announce, then reconcile" is prose of `ARCHITECTURE.md:100` only; ADR-001:35 says `reconcile` runs whenever a list changes and fixes no order, so the reorder is no contract deviation (D6 untouched). (2) The N86 window is not reproducible through the `.csproj` watcher: a `project` scope matches `projects`, `allProjects:*`, `installed:`, `updates:`, `transitive:` (`src/core/queries/scopes.ts:66-75`) and never `sources`, so after a create event `catalog.sources(dir)` is a cache hit and the window is a microtask; it is wide only under a `workspace` or `sources` invalidation (`refresh/all` → `handlers.ts:408-411`), which is exactly what `untilProjects` pressing Refresh (P9.5, `44c2980`) provokes and why commit 1 (more Refresh presses) makes commit 2 mandatory. Hence the scenario uses `refresh/all`, not the watcher. (3) TF2 is met: `InstalledTab.test.tsx:264` `installed row shows icon, authors and verified`, `UpdatesTab.test.tsx:307` `updates row shows icon and authors` and `:268` (All Projects icons chunk), `AllProjectsView.test.tsx:67` `all-projects installed row shows icon from metadata chunk`, each asserting `img src` (`data:` or `DEFAULT_ICON`), authors text and the Verified accessible description. TF4 is met as the lint stands: `hooksOf` reads §8 at run time (`interaction-model-testids.test.ts:22-38`), `npm test` was exit 0 on 952f610 with every P9.x hook (`search-suggestions`, `transitive-list-<tfm>`, `section-header-transitive-<tfm>`, `transitive-details`, `source-health-indicator`, `multi-install-button`, `sidebar-update-all-button`, `direct`) in the tables, and every id the UI/e2e suites read by test id is in §8; the one hook the admission rule (§8 last paragraph) demands and lacks is the header's Refresh button, which `main-transitive.ui.test.ts:36` reads by class `.nuiget-main-refresh` (`MainShell.tsx:256`; `IconButton` takes `data-testid`, `IconButton.tsx:18,32`). TF3: jsdom cannot resolve `var()` to pixels, so `Row.test.tsx:236` (`minHeight` is the token reference) is as far as jsdom goes; the measurement belongs in ExTester, modelled on `sidebar.ui.test.ts:17-24` (`tokenPx`) and its compact-row probe; P9.11's note measured the main cards "67 px apart" (66 px card + 1 px border), so the bound is `token ≤ h ≤ token + 2`, upper bound included because P9.2's padding bug (90 px rows) passed `min-height`. TF7: no scenario reads enrichment (`scenarios.test.ts` compares `packagesOf` id@version; `updates converge across surfaces`:680-704 uses `objectContaining`, and its `reads()` count at :692 is before/after relative, so new feed requests do not break it); the fake feed answers search with `authors: ['Harness']` and no `verified` (`fakeFeed.ts:60`; `entryVerified` reads `verified`/`Verified`, `wire.ts:238-241`), has no icon branch (flat `…/<id>/<ver>/icon`, `flatContainer.ts:49`; `toImageDataUri` sniffs the PNG signature `0x89504e47`, `icons.ts:101`), and no `VulnerabilityInfo` resource (`fakeFeed.ts:45-52`), so `vulnerabilities` comes out absent (`vulnerability.ts:122`). TF8: the host does rescan on create: `watcher.onDidCreate(fire)` (`extension.ts:316`), `watch(PROJECT_FILE_GLOB, projectScope, …)` (:323), project scope → `projects` key (scopes.ts) → `requestRefresh` (:256-259). What fails on the runner is the event never reaching the extension (audit TF8, now seen a second time: run 38997325272 on 33312b2, `38 passing · 2 failing`, both the 120 s All Projects wait, next to green run 38997321456 on the same SHA). `main-all-projects.ui.test.ts:78-84, :88-91` wait passively and its `after` (:49-50) polls 120 s for TestProject without any Refresh, so a lost delete event would leave `ALL_PROJECTS` selected for every following file.

DO:

Commit 1 — TF8 (clears the red branch; RUN.md §2.3 "fix that first as part of the item" applies to the item that owns the flake).
1. Baseline gates on 33312b2 (`npx tsc --noEmit`, `npm run check-types`, `npx eslint src`, `npx vitest run` → all 0/green). Tracker row P9.12 → `in-progress`, note: "run 38997325272 (33312b2, docs-only) red in UI with the TF8 signature beside green 38997321456 on the same SHA; no rerun; fixed by commit 1".
2. `src/webview/main/MainShell.tsx:256`: add `data-testid="refresh-button"` to the Refresh `IconButton`; keep `className="nuiget-main-refresh"`.
3. `docs/ux/interaction-model.md` §8, first table, directly after the `project-selector`, `source-selector` row: `| \`refresh-button\` | The header's Refresh button (main): a workspace rescan |`. Nothing else enters §8 (admission rule: `bulk-toolbar`, `multi-install-popover`, `banner-*`, `row-action-toggle` are read by primitive tests only).
4. `src/test/ui/v2/mainWebview.ts`: add and export `projectOptionValues(): Promise<string[]>` (the `optionValues` of `main-transitive.ui.test.ts:21`), `untilProjects<T>(probe, what, totalMs = 180_000)` (the body of `main-transitive.ui.test.ts:27-40`, pressing `findByTestId('refresh-button')` instead of the class selector, 15 s poll per round) and `optionFor(file)` (:42). Doc comment keeps the TF8 sentence ("a file watcher may never report a project file created or deleted by the test").
5. `src/test/ui/v2/main-transitive.ui.test.ts`: delete the local `optionValues`, `untilProjects`, `optionFor` (:21-42) and import them; no other change in this commit.
6. `src/test/ui/v2/main-all-projects.ui.test.ts`: test 1 (:78-84): replace the 120 s `poll` for the option with `await untilProjects(values => (values.includes(ALL_PROJECTS) ? true : undefined), 'the All Projects option')`, then the `option[value="__all_projects__"]` lookup and the `All Projects (2)` assertion as today; test 2 (:88-90): same `untilProjects` before the choice; `after` (:49-50): after `rmSync` and the csproj restore, `await untilProjects(values => (values.includes(ALL_PROJECTS) ? undefined : true), 'the All Projects option gone')`, then the existing poll for `TestProject.csproj` in the selector and `installed-list`. Keep `chooseProjectUntilCommitted` in this commit (N86 is still open until commit 2).
7. `src/test/ui/v2/main-shell.ui.test.ts:20`: add `'refresh-button'` to the hook list it renders under the CSP.
8. Gates in plan order; `npx vitest run --project backend src/test/lint/interaction-model-testids.test.ts` → 3 passed; `node esbuild.mjs --production --analyze` (paste the three sizes; one attribute in MainShell, no ceiling question); `rm -rf dist && npm run test:ui -- --storage /tmp/nuiget-ui` → 40 passing. STATUS notes: `src/test/ui/v2/STATUS.md`, `src/webview/main/STATUS.md`. Commit `test(ui): All Projects and transitive suites wait for a project through the Refresh hook (P9.12, TF8, TF4)`; push; wait for green. D18: `gh run download <id> -n ui-screenshots -D /tmp/nuiget-shots`, view `main-installed-all` and `main-installed-single`, record `viewed: …: unchanged`.

Commit 2 — N86.
9. `src/extension.ts` `refreshProjectsAndSession` (:179-203): remove `events.projectsChanged.fire(projects)` from :189 and place it immediately after `await session.reconcile(projects, urls);` at :202. Keep `await vscode.commands.executeCommand('setContext', 'nuiget.hasProjectFiles', …)` at :190 where it is (`extension.test.ts:121` counts refresh runs by it). The early return at :197-201 fires nothing; add to its comment: "The rerun that change asked for (session.onDidChange below, `selectedProject !== lastReconciledProject`) reconciles and then announces: a surface is told of a project only once the store knows it (N86)." Add one sentence above the fire: "After `reconcile`, never before: a `session/set` for a project a surface was just told about must find it in the store's list (N86)."
10. `src/test/harness/harness.ts` `files` (:297-325): add `addProject(projectPath: string, xml: string): void` that `mkdirSync`/`writeFileSync` and `projectFiles.push(projectPath)` without touching the watcher (doc: "A project file that appears without a watcher event, as on a runner whose watcher missed the create (TF8); listed on the next discovery").
11. `src/test/harness/scenarios.test.ts`, after `project deletion mid-request` (:204): `it('N86: a surface is told of a new project only after the session knows it, so choosing it right away is committed', …)`: `h = await createHarness({ tree: TWO_PROJECTS, selectedProject: 'A/A.csproj' })`; `[A, B, C] = [h.path('A/A.csproj'), h.path('B/B.csproj'), h.path('C/C.csproj')]`; resolve `main` and `sidebar`; `expectState({ selectedProject: A, projects: [A, B], installed: ['Serilog@3.0.0'] })`; `const listing = h.dotnet.hold(dotnetCalls.listSources(path.dirname(A)))`; `h.files.addProject(C, projectXml(['Moq', '4.20.0']))`; `const refresh = h.request('main', 'refresh/all', {})` (do not await `expectState` while held); `await h.settle(() => expect(listing.seen).toBe(1))`; the N86 assertion, for both webviews: `expect(webview.projects?.map(p => p.path), \`${webview.surface}: projects while the listing runs\`).toEqual([A, B])` and `expect(webview.events('projects/changed').some(e => e.projects.some(p => p.path === C))).toBe(false)`; `listing.release()`; `await refresh.response`; `await h.settle(() => { for (const webview of [main, sidebar]) expect(webview.projects?.map(p => p.path)).toEqual([A, B, C]); })`; `const committed = await h.selectProject('main', C)`; `expect(committed.selectedProject).toBe(C)` (one dispatch, no retry); `await h.expectState({ selectedProject: C, projects: [A, B, C], installed: ['Moq@4.20.0'] })`; `expectOneResponsePerRequest` on both. Run it first on the unreordered tree: it must fail at the "projects while the listing runs" assertion (`[A, B, C]` received) — paste that line into the STATUS note as the negative control, then apply step 9 and run it again.
12. `src/test/ui/v2/mainWebview.ts`: delete `chooseProjectUntilCommitted` (:51-70); add `chooseProjectCommitted(value: string, timeoutMs = 60_000)`: one `chooseProject(value)` then `poll(selectorValue() === value → true, \`the project selector committed on ${value}\`, timeoutMs)`; doc: "One dispatch. Since P9.12 the host tells a surface of a project only after the session knows it (N86), so a choice that is not committed is a regression, never retried here." Call sites: `main-transitive.ui.test.ts:67` and `:92`, `main-all-projects.ui.test.ts:84`.
13. Docs: `docs/plans/findings-ledger.md` N86 (both tables): status `closed (P9.12, commit 2: reorder in extension.ts; scenario "N86: a surface is told of a new project only after the session knows it…"; chooseProjectUntilCommitted removed)`. `ARCHITECTURE.md:100`: rewrite the `refreshProjectsAndSession` sentence to the new order: "discovers the projects, sets `nuiget.hasProjectFiles`, lists the enabled sources of the project the store will keep or pick, skips the reconcile when the selection moved during the listing (the coalesced rerun does it), otherwise calls `session.reconcile` and only then announces `projects/changed` (N86: a surface is told of a project only once the store knows it)". `CHANGELOG.md` `## [Unreleased]` `### Fixed`: `- **A project chosen right after it was discovered is kept, not bounced to the previous one**`. `.github/copilot-instructions.md` 2.0 gotcha table, one row: "`projects/changed` before `reconcile` | `refreshProjectsAndSession` announces the project list only after `session.reconcile` replaced the store's list (N86, P9.12); never fire `events.projectsChanged` before it, and never on the early return (the rerun announces). A `project` scope invalidation leaves `sources:<dir>` cached, so the window shows only under `refresh/all` or a sources change: a scenario that needs it holds `nuget list source` under `refresh/all`, not under a watcher event."
14. Gates: `npx vitest run --project backend src/extension.test.ts` (expected unchanged: `refreshRuns` counts `setContext`; a red there is a stop-and-ask, not a rewrite), `npx vitest run --project integration src/test/harness`, then the full order, `npm run package:vsix`, `npm run docs:check`, bundle sizes, `rm -rf dist && npm run test:ui -- --storage /tmp/nuiget-ui` → 40 passing. STATUS: `src/STATUS.md`, `src/test/harness/STATUS.md`, `src/test/ui/v2/STATUS.md`. Commit `fix(extension): announce projects/changed only after the session reconciled the list (P9.12, N86, ADR-001)`; push; green.

Commit 3 — TF1, TF3, TF7.
15. `src/test/ui/v2/sidebarWebview.ts`: export `tokenPx(name)` (the body of `sidebar.ui.test.ts:17-24`); `sidebar.ui.test.ts`: delete the local const, import it (named rewrite, behaviour identical).
16. `src/test/ui/v2/main-installed.ui.test.ts`, new test after `lists the installed packages…`: `it('lays the rows out as comfortable cards with a loaded icon, as tall as the token, and shows the authors and the Verified mark (TF1, TF3)', …)` (timeout 180 000): wait for `package-row-serilog` and `package-row-newtonsoft.json`; `const token = tokenPx('--nuiget-row-height-comfortable')`; `poll` (30 s) an `executeScript` over `[data-testid="installed-list"] [role="option"]` returning per option `{ name: .nuiget-row-name textContent, minHeight: getComputedStyle(option).minHeight, height: option.getBoundingClientRect().height, iconSrc: option.querySelector('.nuiget-row-icon img')?.getAttribute('src') ?? '', iconLoaded: img ? img.complete && img.naturalWidth > 0 : false }`, resolving once every `iconLoaded` is true; assert ≥ 2 rows, every `minHeight === \`${token}px\``, every `token <= height <= token + 2`, every `iconSrc` non-empty (the default icon is a `cspSource` URI, feed-independent), `console.warn('[P9.12] comfortable rows: ' + JSON.stringify(rows))`. Then the live part, one poll of 120 s on the Newtonsoft.Json row's `textContent`: contains `James Newton-King` and `Verified: the package id prefix is reserved by its owner` (the `<title>` of `VerifiedIcon`, `Row.tsx:146`, is part of `textContent`); precedent `main-transitive.ui.test.ts` ('Serilog Contributors', 60 s). If the runner measures a height outside `[token, token + 2]`, record the number and stop-and-ask; do not widen the bound.
17. `src/test/ui/v2/main-updates.ui.test.ts`: the same measurement block over `[data-testid="updates-list"] [role="option"]` (test title `update rows are comfortable cards with a loaded icon, as tall as the token (TF3)`), without the live authors poll (that file already depends on nuget.org for `13.0.2 →`).
18. `src/test/harness/fakeFeed.ts`: export `FAKE_ICON = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])` and `FAKE_ICON_DATA_URI = \`data:image/png;base64,${FAKE_ICON.toString('base64')}\``; in the search answer (:60) add `verified: true`; before the flat `index.json` branch (:62) add `if (segments[0] === 'flat' && segments.length === 4 && segments[3] === 'icon') { return published.get(normalizeId(segments[1])) ? ok(FAKE_ICON, { 'content-type': 'image/png' }) : fail('http-error', 404); }` (`ok` from `../../core/feeds/testSupport`). Update the file's doc comment (search rows are Verified; the flat container serves one PNG icon).
19. `scenarios.test.ts`, after `updates converge across surfaces`: `it('enrichment reaches both surfaces: updates/get and transitive/metadata carry authors, Verified and the icon the feed serves (TF7)', …)`: `createHarness({ tree: TWO_PROJECTS, selectedProject: 'A/A.csproj' })`; `h.feed.publish('Serilog', ['3.0.0', '3.1.0'])`; resolve both; `expectState`; for each surface: `resultOf(await h.checkUpdates(name).response).updates` `toEqual([expect.objectContaining({ id: 'Serilog', latestVersion: '3.1.0', authors: 'Harness', verified: true, iconUrl: FAKE_ICON_DATA_URI })])`; `const [lite] = resultOf(await h.request(name, 'transitive/metadata', { packages: [{ id: 'Serilog', version: '3.0.0' }] }).response).metadata`; `expect(lite).toEqual(expect.objectContaining({ id: 'Serilog', version: '3.0.0', authors: 'Harness', description: 'Serilog package', verified: true, iconUrl: FAKE_ICON_DATA_URI }))`; `expect(lite).not.toHaveProperty('vulnerabilities')` with the comment "the fake index has no VulnerabilityInfo resource: unknown, never []"; `await h.settle(); [main, sidebar].forEach(expectOneResponsePerRequest)`. Run `npx vitest run --project integration src/test/harness` after step 18 alone: every existing scenario must stay green (they use `packagesOf` or `objectContaining`); a scenario that goes red on the new fields is a stop-and-ask, not a rewrite.
20. Gates in plan order; `npm run bench`; `npm run docs:check`; `rm -rf dist && npm run test:ui -- --storage /tmp/nuiget-ui` → 42 passing. STATUS: `src/test/ui/v2`, `src/test/harness`, and record the TF map (TF2, TF4 met by the tree with the titles above; TF1/TF3 by step 16-17; TF7 by step 19; TF8 by commit 1 with the host side verified at `extension.ts:316,323`). Commit `test(harness,ui): enrichment end to end, comfortable rows measured against the token (P9.12, TF1, TF3, TF7)`; push.
21. The row's gate: when commit 3's run is green, `gh run rerun <run-id>` once (the whole green run; `.claude/settings.json:39` allows `gh run:*`), `gh run watch <id> --exit-status`; both UI logs `42 passing`. A red UI in either run is a stop-and-ask with `gh run view <id> --log-failed` pasted; no third run. D18: view `main-installed-single`, `main-installed-all`, `main-updates`, `main-transitive-expanded` of the rerun.
22. Docs commit: `docs(test): record the P9.12 visual check and the two green UI runs (P9.12, D18)` with the run ids, the viewed lines, tracker row `done` listing the three commits; push; green.

DO NOT:
- Do not add a `SessionStore` method or touch `src/core/contracts.ts`, `src/core/session/SessionStore.ts` or any ADR; the reorder needs no sentinel.
- Do not fire `projectsChanged` on the early return at `extension.ts:197-201`, and do not move the `setContext` call.
- Do not reproduce N86 through the watcher (`files.writeProject` + `advance`): a project scope leaves `sources:<dir>` cached and the hold is never reached.
- Do not keep `chooseProjectUntilCommitted` after commit 2, and do not re-dispatch a choice anywhere.
- Do not add host discovery behaviour for TF8 (no invalidation on `nuiget.openManager`, no second discovery pass, no `project` scope with `[]` paths: it bumps every `allProjects:*` key).
- Do not `gh run rerun` 38997325272, and do not rerun a red UI job of P9.12's commits.
- Do not assert a live icon `data:` src or any nuget.org field other than the one authors/Verified poll; do not loosen `[token, token + 2]` without the measured number in a stop-and-ask.
- Do not add `row-icon`, `row-authors`, `badge-*`, `prerelease-toggle` or `restore-toggle` hooks (no test outside a component reads them), a `webview-density` lint, or assertions in `main-search.ui.test.ts`.
- Do not edit `docs/plans/parity-audit-2026-10-16.md` (P9.13 closes the gap rows) or raise any poll timeout.

CONTRACT CHANGE: none. Files approved beyond the row's `src/test/**, host watcher` column: `src/extension.ts` (:189 → after :202, comments), `src/webview/main/MainShell.tsx:256` (one `data-testid`), `docs/ux/interaction-model.md` §8 (one row), `ARCHITECTURE.md:100` (one sentence), `CHANGELOG.md` (one Fixed headline), `.github/copilot-instructions.md` (one gotcha row), `docs/plans/findings-ledger.md` (N86 both tables), `docs/plans/STATUS.md`, the STATUS notes of `src`, `src/test/harness`, `src/test/ui/v2`, `src/webview/main`. Named test rewrites: `src/test/ui/v2/mainWebview.ts` (`chooseProjectUntilCommitted` → `chooseProjectCommitted`, shared `projectOptionValues`/`untilProjects`/`optionFor`), `src/test/ui/v2/main-transitive.ui.test.ts:21-42, 67, 92`, `src/test/ui/v2/main-all-projects.ui.test.ts:49-50, 78-84, 88-90`, `src/test/ui/v2/main-shell.ui.test.ts:20`, `src/test/ui/v2/sidebar.ui.test.ts:17-24` (import of `tokenPx`), `src/test/harness/fakeFeed.ts` (verified, icon). `src/extension.test.ts` stays as it is; a red there is a stop-and-ask.

VERIFY:
- `awk '/const refreshProjectsAndSession/,/^    };/' src/extension.ts | grep -n "session.reconcile\|projectsChanged.fire"` → the `reconcile` line precedes the `fire` line and there is exactly one `fire`.
- `npx vitest run --project integration src/test/harness --reporter=verbose` → exit 0, titles include `N86: a surface is told of a new project only after the session knows it…` and `enrichment reaches both surfaces…`; the STATUS note quotes the N86 scenario's red on the unreordered tree.
- `grep -rn "chooseProjectUntilCommitted\|nuiget-main-refresh" src/test/ui/v2` → no match; `grep -n "refresh-button" src/webview/main/MainShell.tsx docs/ux/interaction-model.md src/test/ui/v2/mainWebview.ts src/test/ui/v2/main-shell.ui.test.ts` → one line each; `npx vitest run --project backend src/test/lint/interaction-model-testids.test.ts` → 3 passed.
- `grep -c "tokenPx" src/test/ui/v2/sidebarWebview.ts src/test/ui/v2/main-installed.ui.test.ts src/test/ui/v2/main-updates.ui.test.ts` → ≥ 1 each; `grep -n "verified: true\|'icon'" src/test/harness/fakeFeed.ts` → both present.
- `npx tsc --noEmit`, `npm run check-types`, `npx eslint src` → 0; `npm test` → exit 0; `npm run bench` → 0; `npm run docs:check` → 0; `npm run package:vsix` → VSIX built; `node esbuild.mjs --production --analyze` → three sizes under the ceilings, pasted.
- `rm -rf dist && npm run test:ui -- --storage /tmp/nuiget-ui` → `42 passing`, `[P9.12] comfortable rows:` lines in the log with heights in `[66, 68]`.
- `gh run list --branch labs/2.0 --limit 3` → commit 1's run green (the branch no longer red), commit 3's run green and its `gh run rerun` green; `gh run view <id> --log | grep -c "42 passing"` → 1 for each of the two UI logs; `grep -n "^| N86" docs/plans/findings-ledger.md` → status closed naming P9.12.

Files checked: docs/plans/2026-10-11-nuiget-2.0-execution-plan.md (§1-§4, :359 and P9 preamble); docs/plans/parity-audit-2026-10-16.md:1244-1381 (TF1-TF8 with refuter notes), :1408-1440; docs/plans/findings-ledger.md:183, :447; docs/plans/STATUS.md:131-135; docs/plans/RUN.md:34-110; docs/adr/001-*.md:35; docs/ux/interaction-model.md:160-200 (§8); ARCHITECTURE.md:96-100, :430, :805; CHANGELOG.md (Unreleased); .github/agents/architecture-advisor.agent.md; .claude/settings.json:39; .github/workflows/ci.yml:261-285; package.json:54-58; src/extension.ts:150-283, :284-330, :347-359, :400-450; src/extension.test.ts:69-122, :505-620; src/core/session/SessionStore.ts:85-169; src/core/contracts.ts:57-77; src/core/queries/scopes.ts (whole); src/core/catalog/Catalog.ts:121, :130, :240-275, :285; src/core/feeds/enricher.ts:1-90; src/core/feeds/icons.ts:98-112, :131-220; src/core/feeds/flatContainer.ts:32-49, :170-185; src/core/feeds/search.ts:300-382; src/core/feeds/wire.ts:238-241; src/core/feeds/vulnerability.ts:122; src/core/feeds/serviceIndex.ts:122; src/core/feeds/testSupport.ts:7-21; src/core/project/discovery.ts:22-28; src/host/handlers.ts:241-298, :408-411; src/host/services.ts:100-116; src/host/MainPanelHost.ts:37, :84; src/host/STATUS.md:1-210 (P9.9 rulings); src/webview/main/MainShell.tsx:55-56, :232-300; src/webview/shared/primitives/IconButton.tsx:4-34; src/webview/shared/primitives/Row.tsx:42, :77-88, :146; src/webview/shared/primitives/icons.tsx:67-70, :151-152; src/webview/shared/primitives/Row.test.tsx:205-290; src/webview/shared/primitives/primitives.css:83-87; src/webview/shared/tokens.css:26-28; src/webview/shared/STATUS.md:1-60, :129, :157-162; src/webview/shared/store/installed.tsx:77; src/webview/main/features/installed/InstalledTab.test.tsx:100-130, :255-300; src/webview/main/features/installed/AllProjectsView.test.tsx:60-110; src/webview/main/features/updates/UpdatesTab.test.tsx:262-340; src/test/harness/harness.ts:129-377; src/test/harness/fakeDotnet.ts:17-120, :224-311; src/test/harness/fakeFeed.ts (whole); src/test/harness/FakeWebview.ts:1-30, :178-235; src/test/harness/scenarios.test.ts:1-60, :204-241, :680-720, :790-827; src/test/harness/STATUS.md:1-30; src/test/lint/interaction-model-testids.test.ts (whole); src/test/lint/webview-tokens.test.ts:29, :72-79; src/test/ui/v2/mainWebview.ts (whole); src/test/ui/v2/sidebarWebview.ts (exports); src/test/ui/v2/main-all-projects.ui.test.ts (whole); src/test/ui/v2/main-transitive.ui.test.ts:1-150; src/test/ui/v2/main-installed.ui.test.ts:1-100; src/test/ui/v2/main-shell.ui.test.ts:15-26; src/test/ui/v2/sidebar.ui.test.ts:1-55, :100-135; src/test/ui/v2/STATUS.md:1-3; vitest.config.mts:53-84; git log 33312b2..6678f0f (P9 commits).
`````

2026-10-17, P9.12 commit 3 (follow-up: the TF7 scenario's `vulnerabilities` assertion). Answer of the
`architecture-advisor` subagent, verbatim:

`````text
DECISION: Option 1. Keep the product as it is; step 19's last assertion becomes `expect(lite.vulnerabilities, name).toEqual([]);`. The step-19 comment "unknown, never []" was wrong: it misread `vulnerability.ts:122`. Not OWNER MUST DECIDE.

WHY: The brief is right about the tree, and the semantics it describes are a recorded ruling, not only a unit test: the P4.8 Q6 ruling (`docs/plans/STATUS.md:2496`) says verbatim "`vulnerabilities` absent when it answers `sourcesUnavailable`, `[]` when it answered with none", and `src/core/feeds/enricher.test.ts:84` pins it by title (`leaves vulnerabilities absent when the data was unavailable and [] when none apply`). `VulnerabilityOutcome.sourcesUnavailable` is documented as true only when "a source *with* vulnerability data could not be read completely" (`src/core/feeds/types.ts:125-129`); `forPackage` drops a source without the resource at `vulnerability.ts:108` before `data` is built, so it never counts as `undefined` at `:122`, and `vulnerability.test.ts:54-66` (`source('c', false)`, `sourcesUnavailable: false`, no request to c.example) and `:133` (`forPackage([], …)` → `{ vulnerabilities: [], sourcesUnavailable: false }`) assert exactly that. `enricher.ts:71-73` then writes `[]`. The gotcha row "Empty is not unknown" and `ARCHITECTURE.md:190` both say "read in part", which is the unavailable path; a source that publishes no `VulnerabilityInfo` resource has published no advisories, and this is the production configuration the P4.8 Q2 ruling named (every id mapped to a private proxy without the resource), so the fake feed models a real set-up, not an artefact. Option 3 would overturn P4.8 Q6 and edit `src/core/feeds/**`, which P9.12 does not own (plan row P9.12: `src/test/**`, host watcher); Option 2 adds a per-URL failure the fake feed has no mechanism for (`fakeFeed.ts:37` is all-or-nothing) and every `transitive/metadata` read in every scenario would then hit that URL, for a path `vulnerability.test.ts:103-134` and `enricher.test.ts:84` already pin; Option 4 weakens an assertion.

DO:
1. In `src/test/harness/scenarios.test.ts`, replace the two lines at :766-767 with the comment `// The fake index has no VulnerabilityInfo resource: no source publishes advisories, so none (P4.8 Q6; vulnerability.test.ts:133). Unknown (absent) is a source whose data could not be read.` and the assertion `expect(lite.vulnerabilities, name).toEqual([]);`. Nothing else in the scenario changes.
2. Leave `src/test/harness/fakeFeed.ts` as it stands after step 18; leave `src/core/feeds/**`, the gotcha row and `ARCHITECTURE.md:190` unchanged (they describe "read in part" and are correct).
3. In the TF7 entry of the STATUS notes (step 20: `src/test/harness/STATUS.md` and `src/test/ui/v2/STATUS.md`), record that step 19's last assertion was corrected from absent to `[]`, with this ruling pasted verbatim as the reason; do not edit the earlier ruling text.
4. Resume step 20 (gates in plan order, `npm run bench`, `npm run docs:check`, the UI run, STATUS, commit `test(harness,ui): enrichment end to end, comfortable rows measured against the token (P9.12, TF1, TF3, TF7)`, push).

DO NOT:
Do not change `src/core/feeds/vulnerability.ts` or `enricher.ts` so that "no source with data" reads as unavailable; that reverses P4.8 Q6 and is outside the item's files.
Do not add a `VulnerabilityInfo` resource to the fake feed, failing or empty, in this commit.
Do not drop the vulnerabilities assertion; `[]` is the behaviour under test.
Do not edit the step-19 text already pasted in `src/test/ui/v2/STATUS.md`; the new paste corrects it.
Do not touch `vulnerability.test.ts`, `enricher.test.ts` or the "Empty is not unknown" gotcha row.

CONTRACT CHANGE: none.

VERIFY: `npx vitest run --project integration src/test/harness` → every scenario passes, the TF7 scenario included (25 passed if the count after step 18 alone was 24, as the brief reports), exit code 0. Then `npx tsc --noEmit`, `npm run check-types`, `npx eslint src` → 0 errors, and step 20's gates.

Files read for this ruling: /Users/mattias/github/nuiget/src/core/feeds/vulnerability.ts, /Users/mattias/github/nuiget/src/core/feeds/enricher.ts, /Users/mattias/github/nuiget/src/core/feeds/vulnerability.test.ts, /Users/mattias/github/nuiget/src/core/feeds/enricher.test.ts:84, /Users/mattias/github/nuiget/src/core/feeds/types.ts:123-130, /Users/mattias/github/nuiget/src/core/catalog/feedClients.ts:40-84, /Users/mattias/github/nuiget/src/core/catalog/Catalog.ts:500-516, /Users/mattias/github/nuiget/src/test/harness/fakeFeed.ts, /Users/mattias/github/nuiget/src/test/harness/scenarios.test.ts:711-772, /Users/mattias/github/nuiget/src/test/ui/v2/STATUS.md (step 19), /Users/mattias/github/nuiget/docs/plans/STATUS.md:70, :2496, /Users/mattias/github/nuiget/ARCHITECTURE.md:188-191, /Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:359.
`````

## Exact next step (one item ID)

P9.fix-6.

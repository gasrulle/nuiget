# STATUS — src/webview/main   commit bc4533a (P5.12b closed; parent of the P5.13 commit)   2026-10-17T05:00:00Z

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `README.md`, `docs/plans/{STATUS,findings-ledger}.md`, `package.json` (`contributes.configuration` only), `src/protocol/domain.ts` (one type line and its JSDoc), `src/host/services.ts`, `src/core/catalog/Catalog.ts` (a comment), `src/extension.next.test.ts`, `src/webview/main/features/search/useSearchTyping{,.test}.ts(x)`, `src/webview/shared/store/{search,search.test,config.test}.tsx` and the STATUS notes; new `src/test/lint/extension-config-settings.test.ts` (all belong to P5.13)

Item: **P5.13**: `useSearchTyping` follows `nuiget.searchDebounceMode` as contributed: `full` searches 300 ms after the
last key, `off` runs nothing while typing (Enter still searches), `quicksearch` unchanged (N57).

## Verified by running

P5.13:

```text
baseline at bc4533a (P5.12b closed, CI run 38750307144 green): tsc 0 · eslint 0 · vitest 160 files, 3239 passed, 4 skipped (SDK)
.claude/.contract-change created with `P5.13` after the ruling was in STATUS, domain.ts:330 edited, sentinel deleted → ls: no such file
grep -rn "'fullsearch'" src --include='*.ts' --include='*.tsx' → 0
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each
npx vitest run src/extension.next.test.ts src/webview/shared/store src/webview/main/features/search → exit 0 · 168 passed
npx vitest run --project backend src/test/lint/extension-config-settings.test.ts → 3 passed
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → exit 0 · Test Files 161 passed (161) · Tests 3248 passed (3248)
npm run bench → exit 0 · npm run docs:protocol:check → exit 0
node -e '…contributes…' → 12 21 5 true (commands, when-clauses, settings, deprecationMessage)
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 281379 / 299921 · webview 518516 / 600685 ·
                               sidebar 317628 / 329122
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
rm -rf dist && npm run package:vsix (NUIGET_V2 unset) → exit 0, nuiget-v1.18.9.vsix (17 files)
git diff bc4533a --stat -- src/test/e2e/v2Support.ts src/test/e2e/v2-*.e2e.test.ts docs/adr src/protocol/messages.ts src/core/contracts.ts → empty
git diff bc4533a --stat -- src/protocol/domain.ts → 1 file changed, 2 insertions(+), 1 deletion(-)
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 → see the tracker row (one run after the search change)
```

## Done (tested)

- `features/search/useSearchTyping.test.tsx`: `full: the search runs 300 ms after the last key …` (was `fullsearch: …`),
  new `off: nothing runs while typing; Enter still searches`.

## Done (untested)

- The `off` mode in VS Code: jsdom (`useSearchTyping.test.tsx`) is the proof; no ExTester test sets the setting.

## Not started

- None for P5.13. Next: the P5 phase gate and review (RUN §6).

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

The P5.13 ruling (2026-10-17) is verbatim in `docs/plans/STATUS.md` and `src/host/STATUS.md`.

## Exact next step (one item ID)

P5 phase review (RUN §6), after the P5.13 CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/test/lint/{webview-stylesheets,webview-tokens}.test.ts`, `src/webview/shared/{tokens.css,primitives/primitives.css}`, `src/webview/main/main.css`, `src/webview/sidebar-next/sidebar.css` and the four STATUS notes; new `src/test/lint/{cssRules.ts,webview-css-baseline.test.ts}`, `src/test/ui/v2/theme.ui.test.ts` (all belong to P5.11)

Item: **P5.11** (theme pass): `main.css` `.nuiget-main` paints `background: var(--nuiget-color-bg)`, so the
document says what its text stands on (axe fell back to white without it). No other change in this directory.

## Verified by running

P5.11:

```text
baseline at fa811aa (P5.10 commit d, CI run 38728270479 green on all 11 jobs): tsc 0 · eslint 0 · vitest 158 files, 3226 passed, 4 skipped (SDK)
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each
npx vitest run --project backend src/test/lint → Test Files 7 passed (7) · Tests 126 passed (126)
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → exit 0 · Test Files 159 passed (159) · Tests 3239 passed (3239)
npm run bench → exit 0 · npx vitest run --coverage → exit 0
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 281381 / 299921 · webview 518470 / 600685 ·
                               sidebar 317603 / 329122 (unchanged; CSS only: dist/webview.css 26776, dist/sidebar.css 19778)
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2, five times (rm -rf dist before each), after the
                               settle waits → 27 passing ×5; git status --porcelain src/test/e2e empty after each
step 2 of the ruling, first run of theme.ui.test.ts before the CSS edits → body rgba(0, 0, 0, 0), html rgba(0, 0, 0, 0)
                               in both webviews under every theme; dark themes measured against #ffffff (#cccccc, 1.6:1)
grep -c "nuiget-color-bg" src/webview/shared/tokens.css → 4 · grep -c "::-webkit-scrollbar" primitives.css → 6
grep scrollbar-color|scrollbar-width in the 2.0 stylesheets → 0 · test -e .claude/.contract-change → false
npm run package:vsix: SKIPPED: no host, service or esbuild change (stylesheets, tokens and tests only)
```

## Done (tested)

- `webview-stylesheets.test.ts` checks the declaration; `theme.ui.test.ts` measures the panel (50 nodes pass
  `color-contrast` under every theme).

## Done (untested)

- Forced colours: not emulated (ruling); the tokens lint holds the block and P7.4 checks it in VS Code 1.85.
- Chromium 114 itself: the baseline lint stands in; no job renders the webviews there (N64 open).
- Semantic colours used as text that the fixture does not render (`main.css` error and warning texts): unmeasured.

## Not started

- None for P5.11. Next: P5.12a.

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

The P5.11 ruling (2026-10-16) is verbatim in `docs/plans/STATUS.md`.

## Exact next step (one item ID)

P5.12a, after the P5.11 CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before commit c): modified `.github/copilot-instructions.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `docs/ux/interaction-model.md`, `src/test/ui/v2/main-sources.ui.test.ts` (comment only) and the four STATUS notes; new `src/test/ui/v2/main-all-projects.ui.test.ts` (all belong to P5.9 commit c)

Item: **P5.9, commit c of three**: no source change in this directory; the docs of the feature (ARCHITECTURE "All
Projects (main)", interaction model §3, CHANGELOG) and the ExTester test of `src/test/ui/v2`.

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

- Test ids outside §8 recorded for P5.12b (see `src/test/ui/v2/STATUS.md`).

## Advisor decisions (date, item, question, answer verbatim)

The P5.9 ruling and the commit-b follow-up (both 2026-10-15) are verbatim in `docs/plans/STATUS.md`.

## Exact next step (one item ID)

P5.2 (store slices sweep), after P5.9 commit c's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before commit b): modified `ARCHITECTURE.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/webview/main/MainShell.tsx`, `src/webview/main/features/updates/{UpdatesTab,UpdatesTab.test,UpdateAllDialog}.tsx`, `src/webview/shared/store/{allProjects,allProjects.test}.tsx` and the two STATUS notes; new `src/webview/main/features/updates/AllProjectsUpdates.tsx` (all belong to P5.9 commit b)

Item: **P5.9 feature all-projects, commit b of three**: `features/updates/AllProjectsUpdates.tsx` (one section per
project under `FolderGroups` over the `allProjects/updates` stream; multi-selectable `updates-list-<name>` labelled by
the header; rows of an unsupported project read-only with the badge and banner; central packages from the installed
chunk open the read-only preview; a project chunk with `error` is a banner with Retry; `sourcesUnavailable` one banner
over all sections; Update all across projects as one `ops/bulkUpdateAllProjects`); `UpdatesTab.tsx` delegates to it in
All Projects (the P5.5 placeholder is gone); `UpdateAllDialog.tsx` lists the packages under their project;
`MainShell.tsx` counts the All Projects updates once every listed project has answered (`wc -l` 194 + 27 < 300).

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

- `UpdatesTab.test.tsx` (+3): the ruling's three All Projects titles. Rewritten by title (follow-up ruling):
  `All Projects: an empty state instead of a list` → `All Projects: the updates come from allProjects/updates, never
  updates/get` (P5.9 commit b; the P5.5 placeholder sentence is gone).

## Done (untested)

- All Projects in VS Code: commit c.

## Not started

- The ExTester test and the remaining docs (commit c); the sidebar's All Projects (P5.10).

## Deviations from contract/ADR (file:line each)

- `touchedBy` stays flat for `ops/bulkUpdateAllProjects` (ruling; P5 phase review).

## Advisor decisions (date, item, question, answer verbatim)

The P5.9 ruling and the commit-b follow-up (both 2026-10-15) are verbatim in `docs/plans/STATUS.md`.

## Exact next step (one item ID)

P5.9 commit c (ExTester `main-all-projects.ui.test.ts`, docs), after commit b's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before commit a): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `src/test/harness/{FakeWebview,scenarios.test}.ts`, `src/webview/main/main.css`, `src/webview/main/features/details/{DetailsPane,DetailsPane.test}.tsx`, `src/webview/main/features/installed/{InstalledTab,InstalledTab.test,InstalledProjectSection}.tsx`, `src/webview/main/features/updates/{UpdatesTab,UpdatesTab.test}.tsx`, `src/webview/shared/store/{allProjects,allProjects.test}.tsx` and the three STATUS notes; new `src/webview/main/features/all-projects/folderGroups.tsx`, `src/webview/main/features/details/MultiInstallDialog.tsx`, `src/webview/main/features/installed/{AllProjectsTransitiveSection,AllProjectsView.test}.tsx` (all belong to P5.9 commit a)

Item: **P5.9 feature all-projects, commit a of three** (ruling of 2026-10-15): `features/all-projects/folderGroups.tsx`
(`groupByFolder`, `FolderGroups`: a heading per workspace folder with two or more folders, sections one level down);
`InstalledTab.tsx` uses it in All Projects and mounts `AllProjectsTransitiveSection`; `InstalledProjectSection.tsx`:
an `Unsupported` badge in the header, the banner first, the list only for `sdk-too-old` (read-only) or a supported
project, no count without a list; `installed/AllProjectsTransitiveSection.tsx` (aggregate by `lowerId@version`, origins
by project and full root set, "no traceable top-level package", Restore for the unrestored projects);
`details/MultiInstallDialog.tsx` and `DetailsPane.tsx` (an installed or update row in All Projects changes its own
project; a browse row offers Install… and the picker sends `ops/bulkInstall`); `UpdatesTab.tsx`: an unsupported
project's rows have no action and take no bulk selection; `main.css` the folder, picker rules.

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

- `AllProjectsView.test.tsx` (7): folder headings and levels, one folder without headings, the transitive aggregate with
  Restore and its invalidation, the two unsupported titles of the ruling, axe; `aggregateTransitive`/`describeOrigins`.
- `DetailsPane.test.tsx`: `a browse selection under All Projects changes nothing and says why` (P5.7, mine) rewritten by
  title to `a browse selection under All Projects opens the project picker and installs into the projects picked` (with
  axe and `aria-dialog-name` passing), as P5.7's deviation handed it to P5.9; new `an installed row under All Projects
  changes its own project`.
- `UpdatesTab.test.tsx`: new `rows of an unsupported project have no action and cannot join a bulk update`.
- `InstalledTab.test.tsx` `All Projects: one section per project, selections across them become ops/bulkRemoveAllProjects
  with the project names`: line 166 re-scoped as the ruling's step 2 says (named by title).

## Done (untested)

- All Projects in VS Code: commit c adds the ExTester test over a second project created at runtime; folder headings and
  `sdk-too-old` cannot be shown on the runners (one workspace folder, SDK 10 only) and are proved in jsdom.

## Not started

- All Projects updates (commit b), the ExTester test and the remaining docs (commit c); the sidebar's All Projects
  (P5.10).

## Deviations from contract/ADR (file:line each)

- `MultiInstallDialog.tsx` stays under `details` and `AllProjectsTransitiveSection.tsx` under `installed` (P5.4 put
  `TransitiveSection` there); only the folder groups are in `features/all-projects` (ruling step 2).
- `touchedBy` keeps the flat cross product for all-projects bulk requests; `ops/bulkInstall` is exact; the shape question
  goes to the P5 phase review (ruling).
- "All Projects (N)" counts every discovered project, unsupported ones included (`Project` has no support flag).
- The fixture workspace has a `nuget.config`; the P5.8 claim that it has none is corrected in `src/test/ui/v2/STATUS.md` and `main-sources.ui.test.ts` (P5.9 commit c).

## Advisor decisions (date, item, question, answer verbatim)

The P5.9 ruling of the `architecture-advisor` (2026-10-15) is verbatim in `docs/plans/STATUS.md` under "### P5.9 — stop-and-ask: sdk-too-old placement, All Projects updates, the ExTester path, and the P5.4 test's line 166". The ambient advisor was consulted before writing (the gate scenario first, the `seq` rule as the generation rule, the aggregation in the feature, `touchedBy` checked).

## Exact next step (one item ID)

P5.9 commit b (All Projects updates), after commit a's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/core/catalog/{Catalog,Catalog.test,feedContexts,feedContexts.test}.ts`, `src/host/{handlers,handlers.test}.ts`, `src/webview/main/{MainShell.tsx,main.css}`, `src/webview/shared/store/{sources.tsx,sources.test.tsx}` and the five STATUS notes; new `src/webview/main/features/sources/{SourcesControl,SourceSettingsDialog,SourcesControl.test}.tsx`, `src/test/ui/v2/main-sources.ui.test.ts` (all belong to the P5.8 commit)

Item: **P5.8 feature sources**, for this directory: `features/sources/SourcesControl.tsx` (`source-selector` over All
sources and the enabled sources, disabled until the list is known; the gear `source-settings`; `ui/openSourceSettings`)
and `SourceSettingsDialog.tsx` (`source-settings-modal`; `source-row-<name>` with the enable checkbox, URL, declaring
config file and Remove with an in-dialog confirm row naming that file; `add-source-panel` with config file, URL, the
insecure option for `http:`, name and credentials; focus to the URL field and back to Add source). `MainShell.tsx`
mounts `SourcesControl` in place of the disabled selector; `main.css` the dialog's rules. `wc -l MainShell.tsx
index.tsx` → 190 + 27 = 217 (< 300).

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

- `SourcesControl.test.tsx` (8): the selector waits for the list and asks `session/set`; a selected source missing from
  the list; rows with the declaring file and the enable checkbox; Remove confirmed in the dialog with the file named, and
  without `configFile` for a source whose file is unknown; Add source with config file and credentials; the insecure
  option, a refusal kept in the form, Back with focus on Add source; the host opens the dialog and Escape closes it; axe
  with `aria-dialog-name` passing.
- `MainShell.test.tsx` unchanged: `the source selector shows the session source and offers no other yet` still holds,
  and now describes the state before the list is known (no `sources/list` answer in that test).

## Done (untested)

- The attribution against a real SDK in VS Code: the ExTester test shows the rows, not their `configFile` (a machine's
  user-level config file differs; the jsdom and host tests cover what is shown and sent).

## Not started

- The sidebar's source and restore title-bar state and "Open full view" (P5.10); the multi-install picker (P5.9).

## Deviations from contract/ADR (file:line each)

- The selector stays disabled while `sources/list` fails, as it is without a project.
- Interaction model §1 also shows the source in the sidebar's title bar: P5.10's.

## Advisor decisions (date, item, question, answer verbatim)

The P5.8 ruling of the `architecture-advisor` (2026-10-15, option 1b) is verbatim in `docs/plans/STATUS.md` under "### P5.8 — stop-and-ask: the config chain for `configFile` attribution in `Catalog.sources()`" and in `src/core/catalog/STATUS.md`. The ambient advisor was consulted before writing (the selector disabled until the list is known keeps the P5.3 test as written, the in-dialog confirm row, `allowInsecure` for `http:`, no mutation in VS Code).

## Exact next step (one item ID)

P5.9 (feature all-projects), after P5.8's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `src/webview/main/{MainShell.tsx,index.tsx,main.css}`, `src/webview/main/features/installed/InstalledTab.tsx`, `src/webview/main/features/updates/UpdatesTab.tsx`, `src/webview/main/features/search/BrowseList.tsx`, `src/webview/shared/store/StoreProvider.tsx`, `src/webview/shared/tokens.css` and the three STATUS notes; new `src/webview/main/features/details/{DetailsPane,DetailsInfo,ReadmeView}.tsx`, `markdown.ts`, `DetailsPane.test.tsx`, `markdown.test.ts`, `src/webview/shared/store/{details.tsx,details.test.tsx}`, `src/test/ui/v2/main-details.ui.test.ts` (all belong to the P5.7 commit)

Item: **P5.7 feature details**, for this directory: `features/details/DetailsPane.tsx` (header with the installed
version and `uninstall-button`, `version-selector` newest first with `(installed)`, `install-update-button` reading
Install, Update or Downgrade by the order of the host's list, the stale banner, the reasons a change is not possible,
the local-source sentence, `CentralUpdateDialog` for a central package, `Tabs` `details-tab-details` and
`details-tab-readme`), `DetailsInfo.tsx` (description, facts, vulnerabilities, dependencies, offline wording),
`ReadmeView.tsx` (`readme-content`, `readme-empty`, Retry; sanitized HTML set after sanitizing, copy buttons, images
through `readme/image`), `markdown.ts` (the port). `InstalledTab.tsx`, `UpdatesTab.tsx` and `BrowseList.tsx` call
`select()` when the user makes a row current; `MainShell.tsx`'s `details` is a render prop with `announce`;
`index.tsx` passes `details={view => <DetailsPane {...view} />}`; `main.css` the pane, README and `nuiget-hljs-*`
rules. `wc -l MainShell.tsx index.tsx` → 192 + 27 = 219 (< 300).

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

- `DetailsPane.test.tsx` (14): empty state, versions with the installed mark, Update/Downgrade/ops/update and busy,
  Install from browse with the source, an update row's latest version and the CPM preview, the Details tab, the two
  offline sentences, the README with its image through the host, a stripped script and the copy button, README empty
  and Retry, the README tab kept for the same row, stale selection, All Projects, the local-source sentence, axe; `primaryAction`.
- `markdown.test.ts` (25): the 20 titles of 1.x `markdownSetup.test.ts` (the copy-button title now over
  `addCopyButtons`), event handlers and `javascript:` stripped, `srcset` stripped, and `rewriteImages` (upgrade, alt text, four at a
  time, abort).

## Done (untested)

- Copying a code block in VS Code (the clipboard is covered in jsdom only), and README images in VS Code (the ExTester
  test does not depend on the README having images).

## Not started

- The sources settings and selector (P5.8), the multi-install picker (P5.9), the sidebar's "View package details" and
  "Open full view" (P5.10), central version changes (P6.3).

## Deviations from contract/ADR (file:line each)

- `primaryAction`: 1.x compared versions numerically when one was missing from the list; the webview has no comparator
  (P6.5 owns version conformance), so a version it cannot place says Update.
- The `version` of `ui/navigateToPackage` is still not used: the exact search selects the version found (the latest);
  the sidebar's senders are P5.10's, which decides whether the version is kept.
- All Projects: a browse selection cannot be installed from the pane (the multi-install picker is P5.9's); an installed
  or update selection is cleared when All Projects is committed.
- The Installed and Updates lists call `select()` on a click (and Installed also on Enter); in the Updates list Enter
  still updates (P5.5).
- An installed row selected while All Projects is committed shows a disabled Install and no Installed row: the pane
  reads the installed entry of the committed single project only. All-projects display and actions are P5.9's.
- Interaction model §7 lets one primary button read Install / Update / Downgrade / Uninstall; the pane follows 1.x with
  Install / Update / Downgrade on `install-update-button` and a separate `uninstall-button` (both ids are in §8). A
  reading of §7, recorded because `docs/ux/interaction-model.md` is not an item file.
- A stale selection whose new installed list fails stays stale (banner, actions disabled) until that list's Retry
  succeeds.
- The Details tab is shown again for another package or version; the same row made current again, or confirmed for
  another project, keeps the tab (the README is asked again on the README tab).

## Advisor decisions (date, item, question, answer verbatim)

2026-10-15, P5.7: no L1 consultation (the item is not ⚑ and no stop-and-ask trigger fired: the bundle stayed under its ceiling, `Catalog.versions` returns a defined order so no comparator was needed, the lists' `select()` calls are what the row's note "P5.7 reads it" names). The ambient advisor was consulted before writing; its points are in the code: the slice owns the selection for the stale rule, the markdown port in `main/features/details` (N63), no `highlight.js/styles` import (colour gate), every image through `readme/image`, the echo check as the gate, `CentralUpdateDialog` reused, the bundle measured before the UI.

## Exact next step (one item ID)

P5.8 (feature sources), after P5.7's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/core/feeds/{enricher,enricher.test}.ts`, `src/host/handlers.test.ts`, `src/webview/main/{MainShell.tsx,index.tsx,index.test.tsx,main.css}`, `src/webview/shared/store/StoreProvider.tsx`, `src/webview/sidebar-next/{SidebarView.tsx,SidebarView.test.tsx,UpdatesSection.tsx,sidebar.css}` and the six STATUS notes; new `src/webview/shared/search/{SearchBox.tsx,SearchBox.test.tsx,search.css}`, `src/webview/shared/store/{search,sources,config}.tsx` with their tests, `src/webview/main/features/search/{BrowseList.tsx,BrowseList.test.tsx,useSearchTyping.ts,useSearchTyping.test.tsx}`, `src/webview/sidebar-next/{BrowseResults.tsx,BrowseResults.test.tsx}`, `src/test/ui/v2/main-search.ui.test.ts` (all belong to the P5.6 commit)

Item: **P5.6 feature search**, for this directory: `features/search/BrowseList.tsx` (`browse-list`, comfortable rows
with `data:` icons, authors, downloads, Verified and Installed badges, a current row by click or Enter, the package of
an exact search current at once, the count announced, `browse-unavailable-banner` with Retry, error banner, empty
states), `features/search/useSearchTyping.ts` (timers by `searchDebounceMode`: suggestions 150 ms after the last key
from two characters on while the box has focus, or a full search after 300 ms; Enter at once; picking a suggestion
and `ui/navigateToPackage` fill the box and search for the id exactly; enables `config` and `sources` on mount),
`MainShell.tsx` (the `SearchBox` combobox, the `browse` pane in place of the tab bar while the box holds a browse
search, leaving browse clears the search), `index.tsx` (`browse={view => <BrowseList {...view} />}`). `wc -l
MainShell.tsx index.tsx` → 192 + 26 = 218 (< 300).

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

- `BrowseList.test.tsx` (10): Enter searches and the tab bar goes; metadata merged (icon only for `data:`, Verified,
  Installed, description line); current row and its reset on a new text, kept on a revalidation of the same text
  while the package is found; `ui/navigateToPackage`; the unavailable
  banner instead of "no results" and its Retry; empty and failure; clearing the box cancels and brings the tabs back;
  the three filters offered by `@`; axe over `document.body`.
- `useSearchTyping.test.tsx` (6): the two slices enabled on mount; quicksearch timing, the pick and no suggestion for
  the picked id; Enter cancels the debounce; a prefix asks nothing; fullsearch and a `config/changed` switch; nothing
  while the settings are unknown.
- Rewritten by title (plan §2.1, ruling 2 of 2026-10-15): `index.test.tsx` `mounts the shell into its root, acquires
  the API once and asks the host for the session and the projects` → `... asks the host for the session, the projects
  and the settings`, exact set `session/get`, `projects/list`, `config/get`.

## Done (untested)

- The quick-search suggestions in VS Code: the ExTester test submits with Enter; suggestions, timers and both modes are
  covered in jsdom (`useSearchTyping.test.tsx`).

## Not started

- Details of a browse row (P5.7), the sources settings and selector (P5.8), the multi-install picker (P5.9), the
  sidebar's context menu, "View package details" and "Open full view" (P5.10), the search settings' `full`/`off`
  values (N57, P5.13; done at P5.13).

## Deviations from contract/ADR (file:line each)

- The details pane stays the empty state when a browse row is current: details are P5.7's (`selectedId` is local to
  `BrowseList`, as P5.4's Installed tab keeps its own). The `version` of `ui/navigateToPackage` is not used until the
  details' version selector exists (P5.7).
- No install action on main browse rows (interaction model §5: install is the details button, P5.7; the multi-install
  picker P5.9).
- The source selector stays bound to the session and disabled: the read part of `sources` landed in P5.6 (ruling 1 of
  2026-10-15), `sources/list` is asked by the search feature's hook once the first snapshot is committed, and P5.8
  populates and enables the selector. This replaces the P5.4 deviation about the source selector below.
- `browse-unavailable-banner` and the suggestions list `search-suggestions` are test ids outside interaction model §8,
  recorded for P5.12b.
- Cold search: 2323 ms from Enter to the first row in VS Code (`[P5.6] cold search`, nuget.org, `Newtonsoft.Json`):
  the host answers after the metadata chunk of every row, as the P4.9 ruling decided; 1.x showed lite rows first.
  Judged acceptable for this item (a cold search: service-index discovery and the first feed reads of a fresh VS
  Code included); no ruling asked. The P5 phase review sees the number.

## Advisor decisions (date, item, question, answer verbatim)

Both P5.6 rulings of the `architecture-advisor` (2026-10-15) are verbatim in `docs/plans/STATUS.md` under "### P5.6 — stop-and-ask: the source list of quick-search and `searchDebounceMode`" and "### P5.6 — stop-and-ask: the main entry's start requests". The ambient advisor was consulted before writing (scope: no install action on main browse rows, the details pane stays P5.7's, `ui/viewPackage` senders stay P5.10's, the combobox instead of `Popover`, the latency measured at the first ExTester run).

## Exact next step (one item ID)

P5.7 (feature details), after P5.6's CI run is green.

## Earlier notes of this directory

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

git status --porcelain --untracked-files=all (P5.5, before the commit): `?? src/webview/shared/store/{updates.tsx,updates.test.tsx}`,
`?? src/webview/main/features/updates/{UpdatesTab.tsx,UpdatesTab.test.tsx,UpdateAllDialog.tsx,CentralUpdateDialog.tsx}`,
`?? src/webview/sidebar-next/{UpdatesSection.tsx,UpdatesSection.test.tsx}`, `?? src/test/ui/v2/main-updates.ui.test.ts`,
` M src/webview/shared/store/StoreProvider.tsx`, ` M src/webview/main/{MainShell.tsx,index.tsx}`,
` M src/webview/sidebar-next/{SidebarView.tsx,SidebarView.test.tsx}`, ` M src/test/harness/{FakeWebview.ts,scenarios.test.ts}`,
` M ARCHITECTURE.md`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md` and the five STATUS notes of the item's directories

Item: **P5.5 feature updates**, for this directory: `features/updates/` (`UpdatesTab.tsx`, `UpdateAllDialog.tsx`, `CentralUpdateDialog.tsx`, 9 tests), the count on the Updates tab only for a complete answer, `index.tsx` hands the tab to the shell (`updates={view => <UpdatesTab {...view} />}`; `wc -l MainShell.tsx index.tsx` → 170 + 25 = 195 < 300). Earlier in this note: P5.4.

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

- P5.5 `UpdatesTab.test.tsx` (9): list, versions, badges, tab count and axe; found rows stream and the prerelease flag the host commits is asked; Enter and the row button update with `sourceUrl`, the row busy; Update all leaves central packages out; Space selection and the central refusal announced; the read-only central preview sends nothing; an unreachable source is a banner with Retry and no count; "No updates available." only for a complete answer; All Projects empty state.
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
  to the session alone and disabled. The read part of `sources` landed in P5.6 (ruling of 2026-10-15): `sources/list`
  is asked by the search feature's hook once the first snapshot is committed; populated and enabled at P5.8.
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

P5.6 (feature search, main and sidebar browse), after P5.5's CI run is green; a fresh session starts it (second compaction of this one).










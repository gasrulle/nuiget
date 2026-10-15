# STATUS — src/test/harness   commit ca8b6e8 (P5.12b block d; parent of the closing commit)   2026-10-17T02:00:00Z

git status --porcelain --untracked-files=all (before the closing commit): modified `docs/plans/{STATUS,findings-ledger}.md` and the three STATUS notes of `src/test/{ui/v2,harness,e2e}` (all belong to P5.12b's closing commit; the code of blocks a to d is in a3324c4, 5084c2c, 258612d, ca8b6e8)

Item: **P5.12b, blocks (b) and (c)**. (b) N59: `fakeDotnet.ts` exports `FakeChild`, whose `answer()` plays a
`DotnetAnswer` (now with `spawnError` and `lateError`); `src/core/cli/DotnetRunner.test.ts` and
`src/extension.next.test.ts` use it instead of their own copies. N58: `fakePanel.ts` exports `createFakePanel`, the
panel that reports its disposal once, for `harness.ts` and `src/extension.next.test.ts`; `src/test/__mocks__/vscode.ts`
is untouched until P8.2. (c) N73: step 13 measured `nuget config paths` for the project directory 1 → 2 after
`refresh/all` → 3 after a watcher flush, so the scenario `N73: an installed computation that read the project file
before a write-back is not shown as current` holds the operation's recomputation at the walk after it read the file
without Serilog, writes the file back with Serilog, lets the watcher fire and releases the walk; both surfaces show
Serilog with the generation the last invalidation listed.

## Verified by running

P5.12b:

```text
baseline at c388eea (P5.12a, CI run 38738178339 green on all 11 jobs): tsc 0 · eslint 0 · vitest 159 files, 3235 passed, 4 skipped (SDK)
block (a) a3324c4 → CI run 38742547111 green; block (b) 5084c2c → CI run 38744845857 green;
block (c) 258612d → CI run 38747113531 green; block (d) ca8b6e8 → CI run 38748766418 (see the tracker row)
npx tsc --noEmit / npm run check-types / npx eslint src → exit 0 each (after every block)
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → exit 0 · Test Files 160 passed (160) · Tests 3243 passed (3243)
npm run bench → exit 0 (after every block)
npx vitest run --project backend src/test/lint → Test Files 8 passed (8) · Tests 129 passed (129)
src/extension.next.test.ts + src/test/harness + src/core/cli/DotnetRunner.test.ts, 15 times → 15 of 15
DOTNET_ROOT=… NUIGET_SDK_TESTS=1 npx vitest run --project backend src/core/cli → 142 passed (142)
npx vitest run src/test/harness/scenarios.test.ts -t N73, 40 times → 40 of 40
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2, five times (rm -rf dist before each) →
                               32 passing ×5, the N66 test announced in each; git status --porcelain src/test/e2e/fixtures empty after each
git diff --diff-filter=DR --stat c388eea..HEAD -- 'src/**/*.test.ts' 'src/**/*.test.tsx' src/test/e2e/index.ts → empty
git diff --stat c388eea..HEAD -- .github/workflows/ci.yml .vscode-test.mjs src/protocol src/core/contracts.ts docs/adr src/core/catalog src/test/__mocks__/vscode.ts → empty
npm run package:vsix: SKIPPED: no host, service or esbuild change (tests and docs only)
test -e .claude/.contract-change → false
```

## Done (tested)

- N73 scenario 40 of 40; the moved tests 15 of 15; N59 closed, N73 closed as not reproduced.

## Done (untested)

- Deleting the legacy tests: P8.2, per the map and its ⚑ consultation (the L2 hook refuses any deletion of a test file).

## Not started

- None for P5.12b. Next: P5.13.

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

The P5.12b ruling (2026-10-16) is verbatim in `docs/plans/STATUS.md`.

## Exact next step (one item ID)

P5.13 (⚑ mandatory consultation), after the closing commit's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before commit c): modified `.github/copilot-instructions.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `docs/ux/interaction-model.md`, `src/test/ui/v2/main-sources.ui.test.ts` (comment only) and the four STATUS notes; new `src/test/ui/v2/main-all-projects.ui.test.ts` (all belong to P5.9 commit c)

Item: **P5.9, commit c of three**: no change in this directory; R3's by-session All Projects mode is described in
ARCHITECTURE "Two-surface harness".

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

- None for this commit.

## Not started

- The sidebar's All Projects (P5.10).

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

The P5.9 ruling and the commit-b follow-up (both 2026-10-15) are verbatim in `docs/plans/STATUS.md`.

## Exact next step (one item ID)

P5.2 (store slices sweep), after P5.9 commit c's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before commit a): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/STATUS.md`, `src/test/harness/{FakeWebview,scenarios.test}.ts`, `src/webview/main/main.css`, `src/webview/main/features/details/{DetailsPane,DetailsPane.test}.tsx`, `src/webview/main/features/installed/{InstalledTab,InstalledTab.test,InstalledProjectSection}.tsx`, `src/webview/main/features/updates/{UpdatesTab,UpdatesTab.test}.tsx`, `src/webview/shared/store/{allProjects,allProjects.test}.tsx` and the three STATUS notes; new `src/webview/main/features/all-projects/folderGroups.tsx`, `src/webview/main/features/details/MultiInstallDialog.tsx`, `src/webview/main/features/installed/{AllProjectsTransitiveSection,AllProjectsView.test}.tsx` (all belong to P5.9 commit a)

Item: **P5.9, commit a of three**: the gate scenario `late allProjects chunk after switching is discarded` (B's
config walk held so its chunk is late; All Projects committed, then project A; the stream is cancelled and nothing of
it is applied), and R3 of `FakeWebview` follows a snapshot that selects All Projects: such a mode is left by a snapshot
that selects anything else, cancelling the stream and dropping its chunks, as the slice's reset does.
`showAllProjects()` keeps its local mode for the CPM scenario.

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

- The scenario 40 of 40; the whole harness green; no count in another scenario moved.

## Done (untested)

- All Projects in VS Code: commit c adds the ExTester test over a second project created at runtime; folder headings and
  `sdk-too-old` cannot be shown on the runners (one workspace folder, SDK 10 only) and are proved in jsdom.

## Not started

- All Projects updates (commit b), the ExTester test and the remaining docs (commit c); the sidebar's All Projects
  (P5.10).

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

The P5.9 ruling of the `architecture-advisor` (2026-10-15) is verbatim in `docs/plans/STATUS.md` under "### P5.9 — stop-and-ask: sdk-too-old placement, All Projects updates, the ExTester path, and the P5.4 test's line 166". The ambient advisor was consulted before writing (the gate scenario first, the `seq` rule as the generation rule, the aggregation in the feature, `touchedBy` checked).

## Exact next step (one item ID)

P5.9 commit b (All Projects updates), after commit a's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): new `src/test/harness/fakeFeed.ts`; modified `src/core/feeds/{health,health.test}.ts`, `src/core/catalog/{Catalog,Catalog.test,feedContexts,feedContexts.test}.ts`, `src/host/{handlers,SidebarHost}.ts`, `src/extension.next.ts`, `src/extension.next.test.ts`, `src/test/harness/{harness,FakeWebview,scenarios.test}.ts`, the five STATUS notes, `CHANGELOG.md`, `ARCHITECTURE.md`, `.github/copilot-instructions.md`, `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md` (all belong to the P4.9b commit)

Item: **P4.9b** (harness part): `fakeFeed.ts` (`createFakeFeed`: service index, search, registration and flat container of
`SHARED_FEED` and `PRIVATE_FEED`, `publish`, `down`, `requests`), `HarnessOptions.feed` passed as the `transport` override,
`h.checkUpdates`, `h.feed`; `FakeWebview` rule R8 (`updates` slot re-asked on its key's invalidation, `health` records every
`sources/health`); the scenarios `updates converge across surfaces` and `sources unreachable shows banner not empty`.

git status --porcelain --untracked-files=all (P5.5, before the commit): `?? src/webview/shared/store/{updates.tsx,updates.test.tsx}`,
`?? src/webview/main/features/updates/{UpdatesTab.tsx,UpdatesTab.test.tsx,UpdateAllDialog.tsx,CentralUpdateDialog.tsx}`,
`?? src/webview/sidebar-next/{UpdatesSection.tsx,UpdatesSection.test.tsx}`, `?? src/test/ui/v2/main-updates.ui.test.ts`,
` M src/webview/shared/store/StoreProvider.tsx`, ` M src/webview/main/{MainShell.tsx,index.tsx}`,
` M src/webview/sidebar-next/{SidebarView.tsx,SidebarView.test.tsx}`, ` M src/test/harness/{FakeWebview.ts,scenarios.test.ts}`,
` M ARCHITECTURE.md`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md` and the five STATUS notes of the item's directories

Item: **P5.5** (harness part): `FakeWebview` R8 also follows the committed prerelease flag (an applied snapshot of the same project with another `includePrerelease` asks `updates/get` again under it), and the scenario `prerelease toggle re-checks updates` (a toggle on the sidebar makes both surfaces ask under the new flag and show the prerelease latest; a toggle back on the main panel returns both to the stable latest; one response per request). ARCHITECTURE "Two-surface harness" now lists eight rules (R7 with the `updates` slot, R8) and the P4.9b and P5.5 scenarios. Earlier in this note: P4.9b.

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

```text
baseline at 6e2c878         → CI run 38669483033 green on all 11 jobs · npm run check-types 0 · npx eslint src 0 · npx vitest run
                               green (141 files, 3026 passed, 4 skipped)
first attempt (P4.9 ruling's step 12) → src/extension.next.test.ts: `a replaced selection is reconciled …` red (the probe
                               listed a vanished project's directory); harness: 6 of 16 red (the probe walked `nuget config
                               paths` a second time); with the probe disabled 16 of 16 green → stop-and-ask, ruling below
after the ruling             → npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0
grep -rn 'REMOVAL GATE: P4.9' src → none · grep -c "REMOVAL GATE" .github/copilot-instructions.md → 0
npx vitest run --project integration src/test/harness → 18 passed (the six scenarios unchanged, `updates converge across
                               surfaces`, `sources unreachable shows banner not empty`); 40 runs → 40 of 40 green
npx vitest run --project backend src/extension.next.test.ts src/core/catalog src/core/feeds/health.test.ts → green; see the
                               loop and full gates in the tracker row and the commit
git diff --name-only -- docs/adr src/protocol src/core/contracts.ts → empty
```

## Done (tested)

- P5.5 `prerelease toggle re-checks updates`: 40 of 40 runs.
- The two named scenarios; the six scenarios that failed at the first attempt pass unchanged; 40 runs of the whole harness.
- `fakeDotnet.ts`: `nuget config paths` answers exit 0 and no output, which is the empty chain (no mapping, no config credentials).

## Done (untested)

- `fakeFeed.ts`'s `PRIVATE_FEED` routes: no scenario configures the private feed yet.

## Not started

- Nothing for P4.

## Deviations from contract/ADR (file:line each)

- `sources unreachable shows banner not empty` holds A's first `nuget config paths` until both surfaces are resolved, so the first
  `sources/health` event reaches both (the ruling's order without the hold would race the sidebar's resolution).

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P4.9b, stop-and-ask: how the health monitor obtains its chains. Verbatim at the end of this file where the ruling
names this directory, and in `docs/plans/STATUS.md`; the P4.9 ruling (steps 11-16) is there too.

## Exact next step (one item ID)

P5.6 (feature search, main and sidebar browse), after P5.5's CI run is green; a fresh session starts it (second compaction of this one).

## Earlier notes of this directory (kept for the P4 phase review)

# STATUS — src/test/harness   commit 3d1da7b (parent of the P2.11 commit)   2026-10-13T19:00:00Z

Scope of this note: `src/test/harness/**`, the two-surface harness of the 2.0 protocol.

git status --porcelain --untracked-files=all: `?? src/test/harness/FakeWebview.ts`,
`?? src/test/harness/fakeDotnet.ts`, `?? src/test/harness/harness.ts`, `?? src/test/harness/scenarios.test.ts`,
`?? src/test/harness/STATUS.md`, ` M vitest.config.mts`, ` M tsconfig.vitest.json`, ` M docs/plans/STATUS.md`,
` M docs/plans/findings-ledger.md`, ` M CHANGELOG.md`, ` M ARCHITECTURE.md`,
` M .github/copilot-instructions.md` (all belong to the P2.11 commit)

Item: **P2.11 two-surface harness on the new protocol** (stop-and-ask: `tsconfig.vitest.json` is not named by
the row; no contract change, no sentinel). The quarry has no harness; everything here is new.

## Verified by running

```text
The gates ran with DOTNET_ROOT set to the SDK directory; npm test also with NUIGET_SDK_TESTS=1 (N48).
baseline npx tsc --noEmit / npm run check-types → exit 0 / exit 0
baseline npx eslint src      → exit 0
baseline npx vitest run      → Test Files 82 passed (82) · Tests 2469 passed | 3 skipped (2472)
npx tsc --noEmit             → exit 0
npm run check-types          → exit 0 (tsconfig.vitest.json now includes src/test/harness/**/*.ts, so the
                               harness is type-checked; N39)
npx eslint src / npm run lint → exit 0, no output / exit 0
npx vitest run --project integration src/test/harness --reporter=verbose
                             → Test Files 1 passed (1) · Tests 12 passed (12) (the row's gate). The output
                               has each scenario name of the row: `A→B→A ordering`, `full/scoped/watcher
                               invalidation both orders` (six orderings), `queue saturation + exception
                               after admission`, `project deletion mid-request`, `shared query with one
                               subscriber cancelling`, `surface disposed with pending ops`, `central version
                               change affecting several projects`. Eight runs in a row: 12 passed each.
npm test (NUIGET_SDK_TESTS=1) → Test Files 83 passed (83) · Tests 2484 passed (2484); the harness file runs
                               in the `integration` project
npx vitest run               → Tests 2481 passed | 3 skipped (2484)
npx vitest run --coverage    → exit 0 · from coverage/lcov.info: all files 9251 of 11620 lines, 79.61 % ·
                               src/host/** 415 of 576, 72.05 % (69.79 % at P2.10): MainPanelHost.ts 46/52,
                               handlers.ts 189/208, WebviewHost.ts 65/71, SidebarHost.ts 57/126,
                               pickers.ts 11/71 · src/extension.next.ts 178 of 187, 95.19 % ·
                               src/core/** 2664 of 2704, 98.52 % (floor 85 %)
npm run bench                → Test Files 17 passed (17) · Tests 104 passed | 1 skipped (105)
negative control             → 26 mutations of product code (the root, src/host, the queue, the
                               coordinator, the session store, the Catalog), each run against the harness.
                               25 failed a scenario at once: a surface not told about invalidations; the
                               session never reconciled; the project list not refreshed; no debounce; a
                               watcher that invalidates nothing; the status bar ignoring waiting operations;
                               a disposed surface cancelling what it queued; outcomes not announced; an
                               operation or refresh/all invalidating nothing; a host not forwarding session,
                               projects or outcomes; a closed panel left attached; a cancelled request
                               answered as ok; six operations allowed to wait; a refusal without its ticket
                               id; a thrown error not redacted; a release aborting the other subscriber's
                               computation; a host-made commit not broadcast; installed not shared under
                               one key. One survived: the coordinator not rejecting an overtaken computation
                               at invalidation time, because its `settle` rejects it later and because the
                               client model drops responses of earlier requests. The scenario then got an
                               assertion on every installed/get response delivered after the second
                               invalidation, and the mutation was widened to both places of the coordinator;
                               it fails now. Every file was restored (git status).
measured, A→B→A ordering     → at P2.11: session revisions 1, 2, 3, 4 on both surfaces, final selectedSource
                               `all` (was `private`): finding C-state-core-6. After P2.fix-1: revisions
                               1, 2, 3 and the private feed still selected; the scenario pins that
grep -c "src/test/harness" vitest.config.mts tsconfig.vitest.json → 1 and 2 (the include and the clause in
                               the comment that the ruling orders)
git diff --name-only -- src/protocol src/core docs/adr src/host src/extension.next.ts src/extension.next.test.ts src/test/__mocks__ → empty
ls .claude/.contract-change  → No such file or directory
npm run package:vsix, npm run check:vsix, npm run docs:protocol:check → SKIPPED: no extension, host, esbuild,
                               packaging or protocol file changed (ruling, step 12); CI runs them
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P2.11
```

## Done (tested)

- `harness.ts`: `createHarness({ tree, selectedProject?, selectedSource?, sources? })` writes a scratch
  workspace, points the `vscode` mock at it, runs the real root (`activateWith` with the fake `spawn`), waits
  for `ready` and then fakes `setTimeout`/`clearTimeout`. Verbs: `resolve`, `dispose`, `selectProject`,
  `toggle`, `operate`, `refresh`, `request`, `cancel`, `showAllProjects`, `command`, `files.writeProject`,
  `files.addReference`, `files.deleteProject`, `files.writeProps`, `advance`, `settle`, `expectState`,
  `teardown`. `expectOneResponsePerRequest` is the envelope rule of ADR-007.
- `FakeWebview.ts`: the recorder and the seven-rule client model (the rules are in the file header and in
  ARCHITECTURE.md, "Two-surface harness", for P3.3).
- `fakeDotnet.ts`: `createFakeDotnet()` with `calls`, `count`, `hold`, `fail`, `sources`, and `dotnetCalls`
  matchers; `package add` and `package remove` edit the project file on disk.
- `scenarios.test.ts`, 12 tests in `describe('two-surface harness')`:
  - `A→B→A ordering`: both surfaces apply every session revision in order and end on A with A's packages; the
    surfaces equal the host (the convergence the P1.7 ruling asked the harness to show).
  - `full/scoped/watcher invalidation both orders` ×6: a second invalidation while the first recomputation is
    held; every `installed/get` response delivered afterwards is the state on disk after both; one
    recomputation per generation for both surfaces; a surface that arrives in between asks for itself (N8).
  - `queue saturation + exception after admission`: seven installs from both surfaces, the seventh refused at
    once with its ticket's id on the response, the opening chunk and both surfaces' `ops/completed`; six edits
    in order, noun-first; a workflow that throws answers `failed` without the credential of its message, and
    the queue goes on.
  - `project deletion mid-request`: every request for the deleted project gets one ok response with
    `unsupported: not-found`; both surfaces move to the remaining project and never show the late answers.
  - `shared query with one subscriber cancelling`: one SDK probe and one config-chain call for two surfaces;
    the cancelling surface gets `cancelled` when the computation ends, the other its result.
  - `surface disposed with pending ops`: a running and a waiting operation of a closed panel both finish, the
    sidebar hears of both and shows the result, nothing reaches the closed webview, a reopened panel is new.
  - `central version change affecting several projects`: a `Directory.Packages.props` edit is one
    `resources/invalidated` per surface after the debounce, names both projects' keys, and both projects show
    the new version on a single-project surface and on an all-projects surface.

## Done (untested)

- `toggle`, `command` and `files.writeProject` of the driver and `fail` of the fake dotnet: written as the
  ruling lists them, used by no scenario yet.
- `SidebarHost.ts` context-menu branches and `pickers.ts` (57 of 126 and 11 of 71 lines): no scenario opens a
  quick pick. P3.5 and P5.10 reach them.

## Not started

- The scenarios of later items: P4.9 (`updates converge across surfaces`, `sources unreachable shows banner
  not empty`), P5.5, P5.9, P6.4 (P5.4's is under "Later scenarios").

## Deviations from contract/ADR (file:line each)

- `scenarios.test.ts`, `A→B→A ordering`: since P2.fix-1 the scenario pins the selected source (the private
  feed on the host and on both surfaces) and still requires that every revision was applied in order by both
  surfaces and that at least two followed the start. The P2.11 ruling's "at least revs 2, 3, 4" counted the
  commit that reset the source, which was the defect C-state-core-6 and no longer happens.
- `scenarios.test.ts`, the six invalidation orderings: the ruling's "the main's `received` count does not
  change because of" the late surface is asserted as two facts that do not depend on timing: the main panel
  receives no further `session/changed`, and no surface is answered for a request it did not send
  (`expectOneResponsePerRequest`). A plain count would also see the `projects/changed` of the refresh that the
  first trigger started. The ruling's "at most two `nuget config paths` calls" is asserted as exactly two holds
  seen.
- `scenarios.test.ts`, `project deletion mid-request`, `shared query with one subscriber cancelling` and
  `surface disposed with pending ops`: the ruling has the scenario send an explicit `installed/get` and hold
  it. A result that the coordinator has cached is answered without a `dotnet` call, so it cannot be held. The
  first two scenarios therefore set the hold before the surfaces are resolved (the held requests are the ones
  the model sends by rule 3), and the third invalidates with `refresh/all` first.
- `harness.ts`: `files.addReference` is one verb more than the ruling lists (an outside edit that adds to
  whatever the file holds now, needed when the watcher trigger comes second); `HarnessOptions` takes the
  persisted selection and the sources per directory as relative paths, because absolute paths exist only once
  the scratch workspace does.
- `harness.ts`, `expectState`: the comparisons run inside the wait, so a state that converges late passes and
  one that never converges fails after five seconds; the ruling words it as "first settle, then assert".
- Ledger: N59 has a row in each of the two N tables, as every N finding has; the ruling's VERIFY expects one.
- Since P2.fix-2: the scenario `generation on responses: every resource response carries the generation the
  latest invalidation lists for its key, on both surfaces` (the title of the phase review; the ledger's
  earlier title, "late response … discarded by generation", names something this host cannot produce: the
  coordinator never delivers a result that an invalidation overtook). Rule 7 of the model compares; its discard
  branch is exercised by `fake webview model › rule 7: a response below the generation an invalidation listed
  for its key is recorded and not applied`, which feeds the model by hand. That test is one more than the
  review counts (14 tests instead of 13): without it nothing runs the branch, and the mutation that removes the
  comparison survives.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-13, P2.11, stop-and-ask in the plan's §2.4 form (`architecture-advisor`). Question: how is the harness
composed and what exactly does each of the seven scenarios assert, given that `tsconfig.vitest.json` is not
named by the row and that no ok response carries a `generation`? The brief is summarized in
`docs/plans/STATUS.md` under "Advisor decisions", where the answer is recorded as well. Answer, verbatim:

`````text
DECISION: Composition A1 (the real root through `activateWith`, the real `SidebarHost` and `MainPanelHost` over the harness's own fake webviews; no hand-built `HostServices`, no `TestHost` subclass; the only injected seam is `vi.spyOn(services.workflows, 'single')` for the thrown exception), fake webview B2 (a recorder plus a seven-rule client model that `expectState` reads and that P3.3 later implements for real), timers D1 (fake `setTimeout`/`clearTimeout` for the whole file, explicit `advanceTimersByTimeAsync` after a watcher fires, `vi.waitFor` everywhere else), and C1 sharpened for the missing response generation (finding C-protocol-host-7, fixed by a `P2.fix` item at the P2 phase review before P3.3; no P2.11 scenario depends on it). Config: `vitest.config.mts` integration include gains `src/test/harness/**/*.test.ts`; `tsconfig.vitest.json` include gains `src/test/harness/**/*.ts`, approved here as a file the row does not name; nothing in `eslint.config.mjs`, CI or `package.json`. Scenario `A→B→A ordering` proves the P1.7 condition (both surfaces converge) and drives the race deterministically; the selection it loses in that race is a root defect (C-state-core-6) that P2.11 records and does not fix: the fix is `P2.fix-1` at the phase review, with the harness as its oracle. Not `OWNER MUST DECIDE`.

WHY: The brief is right about the tree: `vitest.config.mts:86` includes only `src/test/integration/**/*.integration.test.ts`, so the row's gate would run nothing; `tsconfig.json:30-40` excludes `src/test` and `tsconfig.vitest.json:35-52` does not list a harness directory, so nothing would type-check it (N39, gotcha "Tests pass is not compiles"); `src/host/WebviewHost.ts:146` posts `makeOk(request.id, request.type, result)` and `src/protocol/envelope.ts:88-91` takes the optional fourth argument nobody passes, while ADR-007:29-31, ADR-008:19-24, `src/protocol/messages.ts:187` and the P3.3 tracker note all describe a response generation; `Catalog.ts:94-183` returns values, not handles, so no handler can know one. The row says "+ vitest project", which names the vitest configuration; the P1.7 and P2.10 rulings (`docs/plans/STATUS.md:492,199`) are the precedent that an answered stop-and-ask is the mechanism for the one more file (`tsconfig.vitest.json`) the row omits, and P0.11 made type-checking the tests a gate. The real root is the only composition that can show what the P1.7 ruling asked for: `refreshProjectsAndSession`, the coalesced reruns and the `session.onDidChange` trigger live in `src/extension.next.ts:136-189`, not in `src/host`, and the P2.10 handoff (`src/STATUS.md:177-184,269-272`) hands exactly that proof to P2.11. Tracing the race with B's listing held: `apply(B)` commits rev 2 and starts run 1 with `lastReconciledProject = B` (`:138`); `apply(A)` commits rev 3 and sets `rerun` (`:184-188`); run 1 then calls `session.reconcile(projects, [shared])` with B's directory list (`:148`), and `normalizeSource` (`SessionStore.ts:133-142`) turns `private` into `all` because the known set is B's; run 2 lists A's directory but `all` stays. Both surfaces receive rev 2, 3, 4 and end equal to the host, so convergence holds and the P1.7 condition is met; the selection loss is a defect of the kind C-state-core-5 named (source validated against another project's list), it is in a P2.10 file, and fixing it in P2.11 would put a root redesign inside the harness item against plan §2.1; the fix item has the harness to verify both this race and the replacement case the P2.10 note describes (`src/STATUS.md:177-184`). ADR-002:48-62 and ADR-003:17-29 give the properties the other scenarios pin; ADR-009 decisions 2 and 7 (`docs/adr/009-catalog.md:12,17`) explain why a cancelling subscriber sees `cancelled` only when the shared computation ends (`Catalog.ts:125-132,323-331`; `QueryCoordinator.ts:339-341` resolves released handles too). The installed Vitest 5.0.3 advances fake timers inside `vi.waitFor` (`node_modules/vitest/dist/chunks/index.C4tKZ0yW.js:7160`: `if (vi.isFakeTimers()) vi.advanceTimersByTime(interval)`), so D1 needs no sleeping.

DO (lettered to the brief):

1. Tracker first: paste this answer verbatim under `## Advisor decisions` in `docs/plans/STATUS.md` as `### P2.11 — stop-and-ask: composition and scenarios of the two-surface harness (2026-10-13)`, set P2.11 to `in-progress`, and add to its row: "real root over `activateWith`, both real hosts over fake webviews (recorder + seven-rule model), fake `dotnet` that edits the scratch project files; fake `setTimeout`/`clearTimeout` for the file; `vitest.config.mts` and `tsconfig.vitest.json` extended additively under the ruling of 2026-10-13; the harness records C-state-core-6 (selection lost when the selected project changes during a refresh run) and C-protocol-host-7 (no ok response carries `generation`) and fixes neither".

2. (a) `vitest.config.mts:86`: `include: ['src/test/integration/**/*.integration.test.ts', 'src/test/harness/**/*.test.ts']`, nothing else in the file (no setup file, no threshold). `tsconfig.vitest.json`: add `"src/test/harness/**/*.ts"` to `include` after the `src/test/helpers` lines and amend the comment at `:31-34` by one clause ("…; the harness of P2.11 is in `src/test/harness`"). `eslint.config.mjs`: no change; the `src/test/**/*.ts` override (`:120-127`) already applies, no fence covers `src/test`, and a second `no-restricted-imports` block is the gotcha. CI and `package.json`: no change; `npm test` is `vitest run` over all projects, `test:integration` already exists, and both CI `Test` runners (ubuntu, windows) therefore run the harness; it needs no `dotnet` and no `NUIGET_SDK_TESTS`.

3. (b) Composition, one fidelity for all seven scenarios: `createHarness()` builds a scratch tree with `createScratchDir('harness')` + `writeTree`, sets `mockWorkspace.workspaceFolders` to the scratch root, makes `mockWorkspace.findFiles` return the harness's live project list, calls `activateWith(context, { spawn: dotnet.spawn, resolveExecutable: () => 'dotnet' })`, awaits `ready`, then installs the fake timers. `resolve('sidebar')` takes the provider from `registerWebviewViewProvider.mock.calls.at(-1)[1]` and passes a fake view `{ webview, visible: true, title: undefined, onDidChangeVisibility, onDidDispose(listener) }` that keeps the dispose listener; `open('main', options?)` hands `createWebviewPanel.mockImplementationOnce` a panel whose `dispose` fires its listeners once (N58; model it on `createFakePanel` in `src/extension.next.test.ts:131-149`, written anew in the harness) and runs `nuiget.openManager`. The fake webview object has `html`, `options`, `cspSource`, `asWebviewUri`, `onDidReceiveMessage(listener)` (kept, so the fake can send) and `postMessage` (records and feeds the model). Exception after admission: in the scenario, `vi.spyOn(services.workflows, 'single').mockRejectedValueOnce(new Error('boom at https://user:secret@feed.example'))`, then an `ops/remove` request; restore the spy in the same scenario. This keeps the whole path real (`handlers.ts:347` → `operations.remove` → `queue.submit` → `run` throws → `OperationQueue.ts:113-118` derives `failed` → `awaitTicket` → `settleOperation` → response and `ops/completed`), which a throwing `run` handed to `services.queue.submit` would bypass. Queue saturation: seven `ops/install` requests, four from the sidebar and three from the main panel, interleaved, with the fake holding the first `package add`; the seventh is answered at once with `status: 'rejected'`, the ticket's `opId` (a UUID, equal to the opening chunk's and to the `ops/completed` payload's on both surfaces) and the message `the operation queue is full (1 running, 5 waiting)`; the status bar item reads `$(sync~spin) nUIget: 1 running, 5 queued`.

4. (c) Files, all new: `src/test/harness/harness.ts` (builder, driver verbs, `expectState`, `settle`), `src/test/harness/FakeWebview.ts` (recorder + model), `src/test/harness/fakeDotnet.ts` (`FakeChild`, `createFakeDotnet` with `hold`, `fail`, per-cwd `sources`, and the on-disk edits for `package add`/`package remove`), `src/test/harness/scenarios.test.ts` (one `describe('two-surface harness')`, seven `it`), `src/test/harness/STATUS.md`. Write the fake spawn a third time; do not edit `src/extension.next.test.ts` (P2.10) or `src/core/cli/DotnetRunner.test.ts` (P1.6) and do not import from either; record N59 (three unexported fake-spawn copies; consolidated when P5.12 rewrites the tests). Fake `dotnet` answers: `--version` → `10.0.401`; `nuget list source --format detailed` → the listing of `sources(cwd)`; `nuget config paths` → empty stdout, exit 0 (this is the step every `installed/get` computation runs and the one a scenario holds; the SDK probe is cached after its first answer per directory, `DotnetRunner.ts:305-309`); `package add <id> --project <p> …` → insert or replace `<PackageReference Include="<id>" Version="<v>" />` in the project file on disk, exit 0; `package remove <id> --project <p>` → delete that element, exit 0; `restore <p>` → exit 0; anything else → exit 0, empty.

5. (d) The model, seven rules, stated in `ARCHITECTURE.md` so P3.3 implements the same text (ADR-001, ADR-002, ADR-008): R1 on resolve send `session/get` and `projects/list`; apply a snapshot from a `session/get`/`session/set` response or a `session/changed` event only when its `rev` is above the last applied. R2 `projects/changed` and the `projects/list` response replace the project list. R3 when the applied snapshot's `selectedProject` becomes a real project (not `''`, not `ALL_PROJECTS`) send `installed/get` for it; on `resources/invalidated` whose `keys` contains `resourceKeys.installed(selectedProject)` send it again; a surface put in all-projects mode by the scenario (`showAllProjects(surface)`) sends `allProjects/installed` instead and re-sends it when `keys` names `projects` or any key starting `installed:`; it collects the `project` chunks by `projectPath`. R4 latest request wins per slot (`session`, `projects`, `installed`, `allProjects`): a response or chunk whose id is not the latest id issued for that slot is recorded and not applied. R5 `ops/progress` events, stream chunks by id, `ops/completed` events and terminal responses are recorded; `pending()` lists request ids without a terminal response. R6 every inbound and outbound envelope is kept verbatim (`sent`, `received`); other events (`ui/*`, `config/changed`) are recorded only. R7 `generation` on a response is recorded if present and never compared (C-protocol-host-7). `expectState({ selectedProject, selectedSource?, projects, installed, allProjects? })` first `settle()`s, then asserts for every resolved surface: its session equals `services.session.snapshot` in `rev` and values and the surfaces equal each other; its project paths equal `projects` and `(await services.catalog.projects()).map(p => p.path)`; its installed result for the selected project has `fidelity: 'provisional'` and `packages.map(p => `${p.id}@${p.version}`)` equal to the literal `installed` list; `pending()` is empty; and every request id in `sent` has exactly one response envelope in `received` (ADR-007). Literal expected lists, not a second inspector: the oracle must not share code with the subject.

6. (e) Driver, `surface: 'sidebar' | 'main'`: `resolve(surface)`, `open('main', options?)`, `dispose(surface)` (panel `dispose()` or the view's dispose listener); `selectProject(surface, projectPath): Promise<SessionSnapshot>` (`session/set`); `toggle(surface, 'includePrerelease' | 'restoreEnabled'): Promise<SessionSnapshot>` (flips the surface's applied value); `operate(surface, type, payload): { id; response: Promise<ResponseEnvelope> }` for the nine `ops/*` types, not awaited by itself; `refresh(surface): Promise<void>` (`refresh/all`); `request(surface, type, payload): { id; response }` for `installed/get` and `allProjects/installed`; `cancel(surface, id)`; `command(id, ...args)` runs a contributed command through the mock (`nuiget.sidebar.*`, `nuiget.refreshPackages`); `files.writeProject(path, xml)`, `files.deleteProject(path)`, `files.writeProps(path, xml)` write or delete on disk, update the `findFiles` list, and fire the matching mock watcher listener (`createFileSystemWatcher.mock.results[i].value.onDidChange|onDidCreate|onDidDelete.mock.calls[0][0]`, located by glob as `watcherFor` in `src/extension.next.test.ts:184-192` does) without advancing time; `settle(predicate?)` is `vi.waitFor`. Watcher events, title-bar commands and disposal are harness verbs because the scenarios need them; they are not protocol verbs and the model does not react to them.

7. (f) `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` installed by `createHarness` after `ready`, `vi.useRealTimers()` in `afterEach` before disposing `context.subscriptions`. Microtasks, `setImmediate` (the `FakeChild`) and file I/O stay real. Waiting: `settle()` (`vi.waitFor`, which advances the fake clock by its interval on every check); after `files.*` fires a watcher, advance explicitly with `await vi.advanceTimersByTimeAsync(ms)` when the scenario asserts that nothing happened before the debounce (1500 ms for project and props files, `extension.next.ts:244-245`), otherwise `settle()` alone. The other fake-time consumers are `MainPanelHost.flushPending` (150 ms, `MainPanelHost.ts:112`) and the runner's timeouts (`DotnetRunner.ts:224,231,267`), which never fire in the fake unless advanced; no scenario depends on either.

8. (g) Scenarios. One `describe`, seven `it` whose titles begin with the row's phrase verbatim, optionally followed by `: ` and a clause; the gate greps the phrases. Common tree: `A/A.csproj` (`<PackageReference Include="Serilog" Version="3.0.0" />`), `B/B.csproj` (`Newtonsoft.Json 13.0.1`), both SDK-style with `net10.0`; `Cpm/Directory.Packages.props` (`ManagePackageVersionsCentrally` true, `<PackageVersion Include="Newtonsoft.Json" Version="13.0.1" />`), `Cpm/C1/C1.csproj` and `Cpm/C2/C2.csproj` each with a versionless `Newtonsoft.Json` reference. Sources: `dotnet.sources = cwd => dir A → [private, shared]; dir B → [shared]; else [shared]`.
   - `A→B→A ordering`: persisted `{ selectedProject: A, selectedSource: private }`; both surfaces resolved and showing A. `dotnet.hold(listing for dir B)`; `selectProject('sidebar', B)`; `settle` until the fake saw `nuget list source` with cwd B; `selectProject('main', A)`; release. Assert: both surfaces applied snapshots with strictly increasing `rev` (at least revs 2, 3, 4 in that order, no snapshot skipped on either), final session on both equals the host with `selectedProject: A`; both show A's installed list (`['Serilog@3.0.0']`); `selectedSource` on both equals `services.session.snapshot.selectedSource`. Do not pin the source's value: the run yields `all` (traced above); state the measured value under "Deviations" of the handoff note and in C-state-core-6 with the one-line why-comment in the test ("the host's value, not `private`: C-state-core-6; P2.fix-1 pins `private`"). Fails if a surface misses or reorders a broadcast, if the surfaces disagree, or if the installed shown is B's. The P1.7 condition (convergence) is thereby shown; write that on the P1.7 and P2.10 rows.
   - `full/scoped/watcher invalidation both orders`: full = `refresh/all` (scope `workspace`, reason `manual-refresh`), scoped = the invalidation `settleOperation` issues after an `ops/*` edit (scope `project`), watcher = `files.writeProject(A, …)` plus the project-file watcher (scope `project`, reason `file-watcher`, 1500 ms). Run the six orderings of the three pairs in one `it` with a fresh tree per ordering (or `it.each` over the six, every title still starting with the phrase). For each ordering: main resolved and showing A; `dotnet.hold('nuget config paths' for dir A)` so the first re-computation stalls; trigger X (an `ops/remove Serilog` for scoped, so the fake edits the file; `files.writeProject` adding `Foo 1.0.0` for watcher; `refresh('main')` for full); `settle` until the held call was seen; resolve the sidebar now (N8: a surface that arrives late asks `session/get`, `projects/list`, `installed/get` and the main's `received` count does not change because of it); trigger Y; advance 1500 ms when a watcher is involved; release. Assert: both surfaces' installed equals the disk state after both edits (`['Foo@1.0.0']` for scoped+watcher, `['Serilog@3.0.0', 'Foo@1.0.0']` for full+watcher, `[]` for full+scoped), exactly one terminal response per request id on both surfaces, no `installed/get` response applied whose result predates the last edit, and the number of `nuget config paths` calls for dir A after the hold is at most two (the stale computation was abandoned once, ADR-002 invariants 2 and 3). Ledger: N8 closed by this scenario.
   - `queue saturation + exception after admission`: as in step 3; after release assert six `package add` argv in `dotnet.calls` (noun-first, `--project`), six `completed` outcomes announced to both surfaces and the seventh `rejected`, the status bar `hide` called at the end, and `expectState` with the six packages. Then the spy: `ops/remove Serilog` → terminal response `status: 'failed'`, `kind: 'remove'`, `packageId: 'Serilog'`, `message` containing `boom` and not `secret`, the same `opId` on the `ops/completed` event of both surfaces; a following `ops/install` completes (the queue did not stall). Fails if the seventh is admitted, if a refusal lacks the ticket's `opId`, if the thrown error escapes the ticket, or if the message leaks the credential.
   - `project deletion mid-request`: A selected, both surfaces showing A. `dotnet.hold('nuget config paths' for dir A)`; `request('main', 'installed/get', { projectPath: A })` (held); `files.deleteProject(A)` (disk, `findFiles`, watcher `delete`); `advanceTimersByTimeAsync(1500)`; release; `settle`. Assert: the held id has exactly one terminal response, ok, with `unsupported: { reason: 'not-found' }` (the inspector never rejects, `inspector.ts:74-80`); both surfaces received `projects/changed` with `[B]` and a `session/changed` whose `selectedProject` is B (reconcile replaced the vanished project, `SessionStore.ts:127-130`); `expectState({ selectedProject: B, projects: [B], installed: ['Newtonsoft.Json@13.0.1'] })`; the late A response was not applied (R4). Do not count refresh runs. The selected source: use `shared` (in both lists) so it survives; the "source only the replacement has" case is the activation-time case of C-state-core-6 and is a root test of P2.fix-1, not a harness scenario.
   - `shared query with one subscriber cancelling`: A selected; both resolved; `dotnet.hold('nuget config paths' for dir A)` before the first `installed/get`; `request('main', 'installed/get', A)` and `request('sidebar', 'installed/get', A)` back to back; `settle` until the hold was seen; `cancel('main', id)`; release. Assert: exactly one `--version` probe and exactly one `nuget config paths` call for dir A in `dotnet.calls` (the runner dedupes the probe, the coordinator the computation, ADR-002 invariant 1); the sidebar's response is ok with `['Serilog@3.0.0']`; the main's id has exactly one terminal response, an error with `code: 'cancelled'`, and it arrives after release (ADR-002 invariant 4: the release of one subscriber does not abort the other's computation; `Catalog.ts:323-331`). Fails if the cancel aborts the shared computation (a second `config paths` call) or if the sidebar gets an error.
   - `surface disposed with pending ops`: both resolved; `dotnet.hold('package add')`; from the main panel `operate('ops/install', Foo)` (running) and `operate('ops/remove', Serilog)` (waiting), plus `request('main', 'installed/get', A)` held at `config paths`; `settle` until the hold is seen; `dispose('main')`; note the main webview's `received.length`; release both holds; `settle`. Assert: `MainPanelHost.instance` undefined and the main's `received.length` unchanged (nothing posted after disposal); both operations ran (`package add` and `package remove` argv present) and the sidebar received two `ops/completed` with `status: 'completed'` (N9 beyond `handlers.test.ts:407`: real queue, real workflows, real edits, the other surface told); the sidebar's installed converges to `['Foo@1.0.0']`; `services.queue.isBusy` false; `open('main')` again yields a fresh host whose `session/get` is answered. Fails if disposal cancels the queued ticket or if a post reaches the disposed webview.
   - `central version change affecting several projects`: tree with the CPM projects; sidebar resolved, `selectProject('sidebar', C1)`; main opened in all-projects mode (`showAllProjects('main')`); `settle` until the sidebar shows `['Newtonsoft.Json@13.0.1']` with `declaration: 'central'` and the main holds chunks for C1 and C2. `files.writeProps(Cpm/Directory.Packages.props, version 13.0.3)` (props watcher, scope `workspace`); `advanceTimersByTimeAsync(1499)` → no `resources/invalidated` yet on either surface; `advanceTimersByTimeAsync(1)`; `settle`. Assert: exactly one `resources/invalidated` per surface for the edit, `scope.kind: 'workspace'`, `reason: 'file-watcher'`, and its `keys` names both `resourceKeys.installed(C1)` and `resourceKeys.installed(C2)` (both were computed by the fan-out, ADR-002:56-59); the sidebar's installed for C1 is `['Newtonsoft.Json@13.0.3']` with `declaration: 'central'` and `definedIn` the props path; the main's chunks for C1 and C2 both show 13.0.3. Keep the row's wording `affecting`; note on P6.4's row that its gate says `affects` and that P6.4 extends or renames this scenario.

9. (h) Record `C-protocol-host-7` in the ledger: "No ok response carries `generation`: `WebviewHost.ts:146` calls `makeOk` with three arguments and `Catalog` returns values without the handle's generation, so the discard by generation of ADR-007:29-31 and ADR-008:19-24 (P3.3, `useResource`) has nothing to read. Fix: the Catalog's cacheable reads return `{ value, generation }` (or the handle's generation alongside) and the handler hands it to `makeOk`; `src/core/catalog/**`, `src/host/**`, their tests; no protocol change. Scheduled: the P2 phase review as a blocking defect (`P2.fix`), before P3.3; the fix adds the harness scenario `late response for an invalidated key is discarded by generation`." No P2.11 scenario depends on it, and no scenario asserts the field's absence. Add to the P3.3 row: "depends on C-protocol-host-7 being fixed first".

10. (i) No coverage threshold now: `src/test/**` is excluded as a source, the host floor arrives with the per-directory floors of P5, and a threshold is a ratchet decision for a later item. Paste the measured `src/host/**` line percentage (69.79 % at P2.10; `SidebarHost.ts`, `MainPanelHost.ts` and `pickers.ts` should rise) into the handoff note.

11. (j) Handoff note `src/test/harness/STATUS.md` from the §2.5 template, first line stating its scope (`src/test/harness/**`). CHANGELOG `## [Unreleased]` `### Added`: `**Two-surface harness** — src/test/harness drives the real 2.0 composition root with both webview hosts over fake webviews and an in-process fake dotnet that edits the scratch project files, and proves across the sidebar and the main panel: ordering of session changes, invalidation in every order, queue saturation and a throwing operation, project deletion during a request, one shared computation when a subscriber cancels, disposal with pending operations, and a central version change reaching several projects`. ARCHITECTURE.md 2.0 section: in "Shared tooling → Unit tests" add `src/test/harness` to the `integration` project; add a paragraph "Two-surface harness" with the composition (step 3), the seven model rules (step 5, the text P3.3 implements), the fake dotnet (step 4) and the timer regime (step 7). copilot-instructions: extend the existing row "Mock panel disposes without end" with "and the harness's panel in `src/test/harness/harness.ts`"; no new row unless a footgun was met while writing (one candidate: a computation of `installed/get` can be held only at `nuget config paths`, because the SDK probe is cached after its first answer). Ledger: N8 → `closed (P2.11: scenario full/scoped/watcher invalidation both orders; a surface that resolves late asks for the current state and the other surface receives nothing for it)`; N58 note extended with the harness; new `C-state-core-6` (open): "`refreshProjectsAndSession` (`src/extension.next.ts:136-149`) reconciles the snapshot against the source list of the directory it started listing, which is no longer the selected project's when the selection changes during the run (A→B→A with a slow listing of B resets a source valid for A to `all`, measured by the harness) and is the vanished project's or the first workspace folder's when `reconcile` replaces the project (`src/STATUS.md`, Deviations). Fix in `P2.fix-1`: list the sources of the project the store keeps or picks and skip the reconcile when the selection moved during the listing (the rerun does it); root tests `a selection that moves during a refresh is not reconciled against the previous project's sources` and `a replaced selection is reconciled against the replacement project's sources`; the harness scenarios `A→B→A ordering` and `project deletion mid-request` then pin the source values"; new `C-protocol-host-7` (step 9); new `N59` (three fake spawn copies, P5.12). Tracker notes: P1.7 and P2.10 rows "convergence shown by the P2.11 scenario `A→B→A ordering`; the selection lost in that race is C-state-core-6 (P2.fix-1)"; P3.3 (step 9); P6.4 (step 8, last scenario); P5.12 (N59). If the phase review does not raise C-state-core-6 and C-protocol-host-7 as blocking on its own, put them in the review brief.

12. (k) No frozen path, no sentinel. Gates in §2.2 order with `npm run check-types` where the ritual says `npx tsc --noEmit` (N39), then the row's gate `npx vitest run --project integration src/test/harness`, `npm test`, `npm run bench`, `npx vitest run --coverage`; no `package:vsix` (no extension, host or esbuild change) and no `docs:protocol:check` need (nothing under `src/protocol`), but run `npm run check:vsix` only if `.vscodeignore` needed a change (it does not: `src/**` is excluded, `.vscodeignore:5`). Commit with the `git-commit` skill citing P2.11, ADR-001, ADR-002, ADR-003, ADR-007, ADR-008, ADR-009, N8, N9, N58, N59, C-state-core-6, C-protocol-host-7; push; wait for green CI.

DO NOT:
- Do not hand-build `HostServices` or subclass `WebviewHost` in the harness; `src/host/handlers.test.ts` already tests that level.
- Do not use the shared mock's `createMockWebviewPanel` for the main panel (N58), and do not edit `src/test/__mocks__/vscode.ts`.
- Do not edit `src/extension.next.ts`, `src/extension.next.test.ts`, `src/host/**`, `src/core/**`, `src/protocol/**`, `src/core/contracts.ts` or `docs/adr/**` in this item; the root defect and the response generation are fix items with the harness as their oracle.
- Do not pin `selectedSource: 'all'` after A→B→A, and do not pin `'private'` either until P2.fix-1; compare with the host and record the measured value.
- Do not assert that a response lacks `generation`, and do not make a scenario depend on its presence.
- Do not sleep; no `setTimeout`-based pauses in scenarios; advance the fake clock or `vi.waitFor`.
- Do not fake `setImmediate`, `queueMicrotask` or `Date` (the `FakeChild`, the coordinator and `AssetsReader` need them real).
- Do not read anything from `__fixtures__/.scratch` that the scenario did not write in the same run (plan §2.6).
- Do not add a fence, a threshold, a setup file or a CI step for the harness.
- Do not name the file `*.integration.test.ts` unless you also keep the harness glob; the include must list `src/test/harness/**/*.test.ts`.
- Do not count refresh runs or `session/changed` events as the property; pin end states and one-terminal-response-per-id.

CONTRACT CHANGE: none. No file under `src/protocol/**`, `src/core/contracts.ts` or `docs/adr/**` changes; no sentinel. Non-frozen files of the item: `src/test/harness/{harness.ts,FakeWebview.ts,fakeDotnet.ts,scenarios.test.ts,STATUS.md}` (new), `vitest.config.mts` (integration include, additive), `tsconfig.vitest.json` (include, additive, under this ruling), `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`, `CHANGELOG.md`, `ARCHITECTURE.md` (2.0 section), `.github/copilot-instructions.md` (one existing gotcha row extended).

VERIFY:
- `npx vitest run --project integration src/test/harness --reporter=verbose` → 7 passed (or 12 with `it.each` for the six orderings), 0 failed, and the output contains each of: `A→B→A ordering`, `full/scoped/watcher invalidation both orders`, `queue saturation + exception after admission`, `project deletion mid-request`, `shared query with one subscriber cancelling`, `surface disposed with pending ops`, `central version change affecting several projects`.
- `grep -c "src/test/harness" vitest.config.mts tsconfig.vitest.json` → 1 and 1; `npm run check-types` → exit 0 (so the harness is type-checked); `npx eslint src` → exit 0, no output.
- `npm test` → green with the harness file listed under the `integration` project; `npm run bench` → green; `npx vitest run --coverage` → exit 0 with `src/host/**` lines ≥ 69.79 %.
- `git diff --name-only -- src/protocol src/core docs/adr src/host src/extension.next.ts src/extension.next.test.ts src/test/__mocks__` → empty; `ls .claude/.contract-change` → No such file or directory; `git status --porcelain --untracked-files=all` before the commit lists the five harness files.
- `grep -n "C-state-core-6\|C-protocol-host-7\|N59" docs/plans/findings-ledger.md` → one row each, `open`; `grep -n "^| N8 " docs/plans/findings-ledger.md` → `closed (P2.11 …)`; the P1.7, P2.10, P3.3, P5.12 and P6.4 rows carry the notes of step 11.
- `grep -c "Two-surface harness" ARCHITECTURE.md CHANGELOG.md` → ≥ 1 each; CI green on all required jobs (both `Test` runners run the harness) before P2.12.

Files checked: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; `/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` lines 41-159 (D1-D13, §2, §3, §4), 221-238 (P2 rows and gate), 244-249 (P3.3, P3.4), 277-282, 297 (P6.4), 395-423 (N findings); `/Users/mattias/github/nuiget/docs/plans/RUN.md:64-151`; `/Users/mattias/github/nuiget/docs/plans/STATUS.md` rows P0.11, P2.9, P2.10, P2.11, P2.12, P3.3, P3.4, P1.fix-1 and the P1.7 ruling (484-544), P2.10 ruling (1007 ff.); `/Users/mattias/github/nuiget/docs/plans/findings-ledger.md:48,108-112,141,150-152,160,328-332,366-385` and the full list of N and C ids; `/Users/mattias/github/nuiget/src/STATUS.md` (whole); `/Users/mattias/github/nuiget/src/host/STATUS.md:119`, `src/core/ops/STATUS.md:254,486`; `/Users/mattias/github/nuiget/docs/adr/001-session-store.md`, `002-query-coordinator.md`, `003-operation-queue-and-dotnet-runner.md`, `007-protocol.md`, `008-webview-architecture.md`, `009-catalog.md` (whole); `/Users/mattias/github/nuiget/src/extension.next.ts` (whole) and `src/extension.next.test.ts` (whole); `/Users/mattias/github/nuiget/src/host/WebviewHost.ts`, `handlers.ts`, `SidebarHost.ts`, `MainPanelHost.ts`, `services.ts` (whole), `handlers.test.ts:1-140,280-480`; `/Users/mattias/github/nuiget/src/core/session/SessionStore.ts`, `session/index.ts`, `catalog/Catalog.ts`, `queries/QueryCoordinator.ts`, `ops/OperationQueue.ts` (whole), `ops/PackageWorkflows.ts:150-245`, `cli/DotnetRunner.ts:300-335`, `cli/commands.ts:68-104`, `project/context.ts` (whole), `project/inspector.ts:60-115`, `project/central.ts` exports, `project/discovery.ts:15-27`, `project/__fixtures__/scratch.ts` (whole), `sources/DotnetSourceProvider.ts:36-147` (grep); `/Users/mattias/github/nuiget/src/protocol/messages.ts:100-200`, `envelope.ts` exports and `:51-52,88-91`, `domain.ts:9,201,224,281-313`; `/Users/mattias/github/nuiget/src/test/__mocks__/vscode.ts:150-243,334,374`; `/Users/mattias/github/nuiget/vitest.config.mts` (whole); `tsconfig.vitest.json` (whole); `tsconfig.json:25-40`; `eslint.config.mjs:1-140`; `package.json` scripts; `.github/workflows/ci.yml:19,108,112,167,233`; `.vscodeignore:4-25`; `.gitignore:4-10`; `ARCHITECTURE.md:60-150,248,1734-1743`; `.github/copilot-instructions.md:176`; `node_modules/vitest/package.json` (5.0.3) and `node_modules/vitest/dist/chunks/index.C4tKZ0yW.js:7160` (`vi.waitFor` advances fake timers); `ls docs/adr src/test src/host src/core/{catalog,ops,queries,session} src/core/project/__fixtures__`; `git status --short` (clean), `git log --oneline -3` (head 3d1da7b). Not run: any gate (inspection only). The ambient advisor timed out; this answer rests on the files above.
`````

The ambient advisor (`/advisor`) was consulted before the brief; it asked for the brief, named the two
configuration files and the missing response generation, and the lever at `nuget config paths`.

## Later scenarios (added by other items)

- 2026-10-13, P3.4 (`5bc53c1` + the P3.4 commit): `sidebar: uninstall then watcher invalidation converges` in
  `scenarios.test.ts`, the second gate of that item. It needs no change to `harness.ts`, `FakeWebview.ts` or
  `fakeDotnet.ts`; the watcher's event for the operation's own edit is produced with `files.writeProject`
  and the file's current text. `npx vitest run --project integration src/test/harness` → 15 tests; the
  scenario alone 40 times → 40 of 40. Details: `src/webview/sidebar-next/STATUS.md`.
- 2026-10-14, P5.4 commit b: `bulk remove partial failure reconciles: the failed package stays, the others go,
  both surfaces show the list on disk`, the row's gate, written as step 6 of the P5.4 ruling (verbatim in
  `docs/plans/STATUS.md`). No change to `harness.ts`, `FakeWebview.ts` or `fakeDotnet.ts`: `fail` is used for the
  first time. `npx vitest run --project integration src/test/harness` → 16 tests; the scenario alone 40 times →
  40 of 40. Two deviations from the ruling's assertions, both checked against the code: (1) the running report's
  `packageIds` are compared as a set, because the order of the three removals is not pinned (the ruling says so for
  the results); (2) the operation's invalidation is not `{ kind: 'project', projectPaths: [A] }`:
  `invalidateAfter` (`src/host/handlers.ts:217-226`) invalidates the project and the metadata of the packages whose
  edit succeeded, and the coordinator folds both into one event with a `package` scope. The scenario asserts what
  matters of it: the event names `installed:<A>`, its scope names A and exactly Serilog and Newtonsoft.Json, never
  Moq. Details: `src/webview/shared/STATUS.md`.

## Exact next step (one item ID)

P2.12 (benches for the queue and the scopes, ARCHITECTURE 2.0, CHANGELOG, `npm run bench:save`). After it the
P2 phase gate and review: the review brief names C-state-core-6 (`P2.fix-1`) and C-protocol-host-7 as blocking
if the reviewer does not raise them.

## Advisor decision: P4.9b — stop-and-ask: how the health monitor obtains its chains (2026-10-16), verbatim

`````text
DECISION: Option 2, sharpened, with option 1's probe mechanism folded in. The chain of a project directory is registered by the `installed` computation's own walk (`Catalog.computeInstalled` hands the `configFiles` of the `ProjectContextProvider.get` it already runs to a new `FeedContexts.register`); `computeUpdates` asks `installed` before `forProject`; the health monitor walks no directory and reads no session: it probes the enabled sources of the chains already registered (`FeedContexts.registered()`) and is restarted by a new `FeedContexts.onDidRegister` event. The `reconciled`/`markReconciled` gate added for observation (1) is removed. No existing harness scenario changes; of my P4.9 ruling, step 12's probe recipe is replaced (not patched), step 15's "recorded during activation, before either surface exists" premise is withdrawn and the two P4.9b scenarios/root tests are reworded below. Addendum: the two Catalog tests `allProjectsInstalled streams protocol chunks` and `allProjectsInstalled sends a second chunk when an evaluation delivers the authoritative result` are rewritten by title to expect the `metadata` chunk; the rig default stays. Nothing here is `OWNER MUST DECIDE`.

WHY: The brief is accurate about the tree, with two additions it did not list: `src/core/catalog/Catalog.ts` already carries step 14 (`emitInstalledMetadata`, uncommitted diff), and `src/test/harness/harness.ts` plus an untracked `src/test/harness/fakeFeed.ts` already pass `transport: new FakeTransport(feed.handler)` (step 15's seam; `git status --porcelain --untracked-files=all` shows both). The defect is not in the monitor but in a duplicated walk: `Catalog.computeInstalled` runs `this.deps.contexts.get(projectPath)` (`src/core/catalog/Catalog.ts:178`), which is the one `dotnet nuget config paths` of a directory (`src/core/project/context.ts:39-43,73-85`), and discards the chain; `FeedContexts.forDirectory` (`src/core/catalog/feedContexts.ts:58-65`) and `forProject` (`:68-82`) then walk the same directory again, which is what the probe (`src/extension.next.ts:222-237`), `computeUpdates` (`Catalog.ts:220` before `installed` at `:229`: two walks for a fresh `updates/get`) and step 14 (`Catalog.ts` diff, `forProject` in `emitInstalledMetadata`) each do. The harness pins the single walk on purpose (`src/test/harness/scenarios.test.ts:116,207,244,269,282`, gotcha "Harness: a read that cannot be held"), so any design that adds a `nuget config paths` for a project directory outside its `installed` computation breaks it, and options 4 and 5 would only hide that from the suite that counts it. My step 12 sentence "the probe reuses the cached listing of the same directory and must add none" was true of `nuget list source` (`DotnetSourceProvider.listings`, `src/core/sources/DotnetSourceProvider.ts:45-59`) and wrong about the chain; the recipe built on it is withdrawn. Registering from the computation keeps ADR-002 invariant 1 and ADR-009 d.5 ("a source is probed or warmed only after the chain of its directory is registered") literally true, costs no new process (`register` reuses the cached listing and reads a chain already known), and leaves every frozen file untouched. Probing the union of registered chains also serves `ALL_PROJECTS` (every project's chain is registered by the fan-out) and project-less reads (a `search` registers the host's directory via `forDirectory`), which the selected-directory recipe did not. One accepted residual: a `sources` invalidation clears the chains (`Catalog.ts:533-539`) without bumping `installed:` keys (ADR-002 scope table), so the next feed read of a cached project walks once through `forProject`'s miss; no scenario holds at that moment, and after a `nuget.config` change a fresh walk is right.

DO:
1. Paste this answer verbatim under `## Advisor decisions` in `docs/plans/STATUS.md` as `### P4.9b — stop-and-ask: how the health monitor obtains its chains (2026-10-16)` and into `src/STATUS.md`, `src/core/catalog/STATUS.md`, `src/test/harness/STATUS.md`. In the P4.9 ruling's steps 12 and 15 nothing is edited; this ruling supersedes them where they differ.
2. `src/core/catalog/feedContexts.ts`: add `register(projectPath: string, configFiles: string[]): Promise<FeedContext>`: `directory = path.dirname(projectPath)`; `this.chains.set(directory, Promise.resolve(configFiles))` synchronously (the computation's walk is the newest, it overwrites), then `return this.forChain(directory, configFiles)`. Add `registered(): readonly FeedContext[]` (`[...this.settled.values()]`) and `readonly onDidRegister: Event<FeedContext>` (an `Emitter` from `../util/events`), fired in `forChain`'s success branch right after `this.settled.set(key, built)`, so a context reached by `register`, `forProject` or `forDirectory` fires once per chain, again after `clear()` rebuilds it. Update the header comment: the chain of a project directory comes from the `installed` computation's own walk; `forProject` walks only for a directory no computation has registered. `src/core/catalog/index.ts`: nothing new to export (the root imports `FeedContexts` already).
3. `src/core/catalog/Catalog.ts`: in `computeInstalled`, after `Promise.all` resolves and when `context !== undefined`: `void this.deps.feedContexts.register(projectPath, context.context.configFiles).catch((error: unknown) => this.deps.logger?.debug(redact(\`Feed context of ${projectPath} could not be registered: ${describe(error)}\`)));` — never awaited, the installed answer does not wait on it. In `computeUpdates`, move `const { result, upgrade } = await this.installed(...)` and `final` above the `forProject` call, so the chain is registered before `forProject` looks it up. `emitInstalledMetadata` stays as in the diff (its `forProject` is now a cache hit after `this.installed`).
4. `src/extension.next.ts`: delete `markReconciled`, `reconciled` and `void ready.finally(markReconciled)`. `probeSources` becomes: `async () => { const byUrl = new Map<string, NuGetSource>(); for (const feedContext of feedContexts.registered()) { for (const source of feedContext.sources) { byUrl.set(source.url, source); } } return [...byUrl.values()]; }` — no `session.snapshot`, no `workspaceFolderFor`, no `forDirectory`, no try/catch needed. After `const monitor = startHealthMonitor(...)`: `context.subscriptions.push(monitor, feedContexts.onDidRegister(() => monitor.restart()));`. Keep `monitor.restart()` on `sources`/`workspace` invalidation (after `clear()` the pass probes nothing; the recomputation's registration restarts it) and the `health.onDidChange` forwarding. Comment on the block: the monitor runs no `dotnet`; it probes chains that reads registered, and the activation pass finds none.
5. Tests. `src/core/catalog/feedContexts.test.ts`: `register seeds a directory's chain from a context walk, so forProject and forDirectory of that directory run no config-paths command` (`contexts.get` and `configFilesFor` never called), `onDidRegister fires once per chain, for register, forProject and forDirectory alike, and again after clear`, `registered lists the settled contexts and is empty after clear`. `src/core/catalog/Catalog.test.ts`: rewrite by title `allProjectsInstalled streams protocol chunks` (build `byPath` from `project` chunks only; exactly one `metadata` chunk, `projectPath: appPath`, at an index after App's project chunk; `toHaveLength(4)`; `result` unchanged) and `allProjectsInstalled sends a second chunk when an evaluation delivers the authoritative result` (`['start', 'provisional', 'authoritative', 'metadata']`); add `installed registers the project's chain from its own context walk, so a feed read of the same directory walks nothing` (after `catalog.installed(appPath)`, `rig.contexts.get` was called once and `configFilesFor` never; then `catalog.updates(appPath, false)` adds no `get` call), `updates asks installed before the feed context and walks the chain once`, plus the two step-14 tests already named (`allProjectsInstalled: emits a metadata chunk per project after its project chunk and finishes without one when enrichment fails`, `sourceHealth lists the failed sources`). `src/extension.next.test.ts`: replace the step-15 title with `the health monitor probes nothing before a read registers a chain, probes the registered chain's sources after it, and reports sources/health to both surfaces` (FakeTransport failing; after `start`, `transport` saw no request and `dotnet.calls` has no `nuget config paths` from the probe; `await services.catalog.installed(appPath)`; `vi.waitFor` the service-index request to the app directory's feed and `sidebar.notifySourceHealth` with the failure); keep `a sources invalidation restarts the monitor and a recovery invalidates nothing`. `a replaced selection is reconciled against the replacement project's sources` stays as it is and passes without the `reconciled` gate.
6. `src/test/harness/scenarios.test.ts`, the two new titles, reworded: `sources unreachable shows banner not empty`: `feed.down = true` before activation; resolve both surfaces; `expectState` (the first `installed/get` registers the chain, the probe runs, both surfaces exist); `settle(() => expect(webview.health.at(-1)).toEqual([expect.objectContaining({ url: SHARED_FEED })]))` on both; `sources/list` on each answers `failed` containing `SHARED_FEED`; `checkUpdates` on both → ok response, `updates: []`, `sourcesUnavailable: true`; then recovery as in step 15 (`down = false`, `publish`, `h.refresh('main')`, last `sources/health` is `[]`, `checkUpdates` answers the update). `updates converge across surfaces` unchanged from step 15. Keep `FakeWebview` ignoring `metadata` chunks of `allProjects/installed` (record them if convenient; do not apply them).
7. Docs: step 16's gotcha text becomes "A recovered source invalidates nothing; the monitor runs no `dotnet`: it probes the sources of chains that reads registered (`FeedContexts.registered()`), restarted by `onDidRegister`; `dotnet nuget config paths` for a project directory runs inside `ProjectContextProvider.get` only, and `computeInstalled` hands that chain to `FeedContexts.register` (the harness holds on it rely on that)". ARCHITECTURE 2.0 row for the Catalog mentions `register`. Everything else of step 16 (CHANGELOG, ledger S6, tracker, STATUS rewrites, commit title) unchanged.
8. Gates as step 16, and run the six titles of the brief plus the two new ones 40 times each before pushing.

DO NOT:
- Do not change, count-tolerate or re-hold any of the six failing scenarios, nor the assertion at `scenarios.test.ts:269`; they are green once the probe and `forProject` stop walking.
- Do not keep the `reconciled` gate or any read of `session.snapshot`/`workspaceFolderFor()` in `probeSources`; the monitor is subordinate to reads.
- Do not let `probeSources` call `forDirectory`, `forProject`, `configFilesFor` or `contexts.get`; it runs no process.
- Do not add an `ActivationOverrides` member that disables or replaces the monitor; the harness runs the real one over the fake feed.
- Do not await `register` in `computeInstalled` or put it on the installed answer's path; a failed registration is logged at `debug`.
- Do not have `computeUpdates` or `emitInstalledMetadata` call `contexts.get` themselves; the miss path of `forProject` is the only one, and only for a directory no computation has registered.
- Do not make the Catalog test rig list no sources or inject a failing enricher to keep the two addendum tests unchanged; rewrite them by title and keep every existing assertion.
- Do not fire `onDidRegister` from `register` directly; it fires where a context settles, once per chain.
- Do not call `invalidate` from a health pass or on `onDidRegister`; a registration restarts the monitor only.
- Do not touch `src/protocol/**`, `src/core/contracts.ts` or any ADR; d.5 as amended at P4.9a already states this rule.

CONTRACT CHANGE: none. `docs/adr/009-catalog.md` d.5 ("a source is probed or warmed only after the chain of its directory is registered") is satisfied as written. Approved non-frozen deviations beyond the P4.9 ruling, recorded in the STATUS notes: `src/core/catalog/feedContexts.ts` + `feedContexts.test.ts` (`register`, `registered`, `onDidRegister`); `src/core/catalog/Catalog.ts` (`computeInstalled` registers, `computeUpdates` reordered). Tests rewritten by title: `allProjectsInstalled streams protocol chunks`, `allProjectsInstalled sends a second chunk when an evaluation delivers the authoritative result` (Catalog.test.ts); the step-15 root test title replaced as in DO 5. Superseded parts of the P4.9 ruling: step 12's `probeSources` recipe and its "must add none" sentence; step 15's "recorded during activation, before either surface exists" premise and the scenario order; the DO NOT "Do not probe every project directory from the monitor" now reads "the monitor walks no directory; it probes registered chains only".

VERIFY:
- `grep -n "session.snapshot\|workspaceFolderFor\|reconciled\|forDirectory\|configFilesFor\|contexts.get" src/extension.next.ts` → no hit between `// ── source health ──` and `startHealthMonitor`; `grep -c "onDidRegister" src/extension.next.ts` → 1; `grep -n "notifySourceHealth" src/extension.next.ts` → 2.
- `grep -n "feedContexts.register(" src/core/catalog/Catalog.ts` → one line, inside `computeInstalled`; in `computeUpdates` the `this.installed(` line precedes the `forProject(` line.
- `npx tsc --noEmit` → 0; `npm run check-types` → 0; `npx eslint src` → 0.
- `npx vitest run --project integration src/test/harness --reporter=verbose` → 18 green, including the six titles of the brief unchanged and `updates converge across surfaces`, `sources unreachable shows banner not empty`; `for i in $(seq 1 40); do npx vitest run --project integration src/test/harness || break; done` → 40 green.
- `npx vitest run --project backend src/core/catalog src/core/feeds/health.test.ts src/extension.next.test.ts --reporter=verbose` → green, listing `register seeds a directory's chain from a context walk, so forProject and forDirectory of that directory run no config-paths command`, `installed registers the project's chain from its own context walk, so a feed read of the same directory walks nothing`, `allProjectsInstalled: emits a metadata chunk per project after its project chunk and finishes without one when enrichment fails`, `the health monitor probes nothing before a read registers a chain, probes the registered chain's sources after it, and reports sources/health to both surfaces`, `a replaced selection is reconciled against the replacement project's sources`, `overlapping refreshes are coalesced`.
- `grep -rn 'REMOVAL GATE: P4.9' src` → no output; `grep -c "REMOVAL GATE" .github/copilot-instructions.md` → 0; `git diff --name-only -- docs/adr src/protocol src/core/contracts.ts` → empty.
- `npm test`, `npm run bench`, `rm -rf dist && npm run package:vsix && npm run check:vsix` → green; CI green.

FILES CHECKED: /Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md (whole); /Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md (:1-200: §0-§4, P0 rows; P4.9 row :265 by grep); /Users/mattias/github/nuiget/docs/adr/002-query-coordinator.md (whole), /Users/mattias/github/nuiget/docs/adr/009-catalog.md (whole, d.5 and d.6 as amended at P4.9a); /Users/mattias/github/nuiget/docs/plans/STATUS.md:2060-2178 (the P4.9 ruling verbatim, steps 11-16, DO NOT, CONTRACT CHANGE, VERIFY); /Users/mattias/github/nuiget/src/STATUS.md:1-20; /Users/mattias/github/nuiget/src/extension.next.ts (whole, working tree: `probeSources` :222-237, `reconciled` :219-220, monitor :243-244, restart :250-252, `ready.finally(markReconciled)` :371); /Users/mattias/github/nuiget/src/core/catalog/feedContexts.ts (whole); /Users/mattias/github/nuiget/src/core/catalog/Catalog.ts (:127 `sources`, :160-262 `computeInstalled`/`updates`/`computeUpdates`, :520-539 `sourceHealth`/`invalidate`, the uncommitted `emitInstalledMetadata` diff); /Users/mattias/github/nuiget/src/core/catalog/Catalog.test.ts (:46-57 `fakeSources`, :143-151 `makeDeps` builds a real `FeedContexts`, :440-475 the two addendum tests); /Users/mattias/github/nuiget/src/core/catalog/feedContexts.test.ts (:1-43 rig, titles :44-111); /Users/mattias/github/nuiget/src/core/project/context.ts (whole); /Users/mattias/github/nuiget/src/core/feeds/health.ts (whole, working tree) and its diff; /Users/mattias/github/nuiget/src/core/feeds/serviceIndex.ts:170-260 (`resolve`, `probe` bypasses caches and does not reset health, `clearCaches` resets it, `fetchEndpoints` marks); /Users/mattias/github/nuiget/src/core/sources/DotnetSourceProvider.ts:45-59 (per-directory listing cache); /Users/mattias/github/nuiget/src/core/util/events.ts:1-40 (`Emitter`); /Users/mattias/github/nuiget/src/host/handlers.ts:29-36 (`sourceDirectory`), :284-301 and the working-tree diff (`failed: catalog.sourceHealth()`); /Users/mattias/github/nuiget/src/host/SidebarHost.ts diff; /Users/mattias/github/nuiget/src/test/harness/harness.ts (whole at first read, then the working-tree diff adding `FakeFeed`/`FakeTransport` :17-22,65-70,168-172); /Users/mattias/github/nuiget/src/test/harness/fakeFeed.ts (untracked; :1-80: `down` → `fail('network')`, service index answered with search, registration and flat resources, 404 for unknown ids); /Users/mattias/github/nuiget/src/test/harness/scenarios.test.ts (whole; the six failing titles :87-142,239-272,274-311; the count at :267-269); /Users/mattias/github/nuiget/src/test/harness/fakeDotnet.ts (whole; `configPaths` matcher :68, holds :148-159, `nuget config paths` answered empty :138-139); /Users/mattias/github/nuiget/src/test/harness/FakeWebview.ts (grep: only `project` chunks of `allProjects/installed` are applied, :231-237); /Users/mattias/github/nuiget/src/extension.next.test.ts:380-470 (the four reconciliation tests, :445-456 `a replaced selection …`), :310-338 (transport override tests), :508-533 (`overlapping refreshes are coalesced`), :594-598. Commands: `git status --short` and `git status --porcelain --untracked-files=all` (modified: docs/plans/STATUS.md, Catalog.ts, health.ts, health.test.ts, extension.next.ts, SidebarHost.ts, handlers.ts, harness.ts; untracked: src/test/harness/fakeFeed.ts), `git log --oneline -3` (head 6e2c878), `git diff --stat`, `git diff` of Catalog.ts, health.ts, SidebarHost.ts, handlers.ts, harness.ts, `wc -l` of the files in play, `ls src/core/feeds src/core/sources src/core/catalog src/test/harness`. Advisor tool consulted once before writing; its points (the duplicated walk as the defect, `computeUpdates` order, `onDidRegister` → restart so the first probe is not five minutes out, the withdrawn step-15 premise, the three facts to verify: real `FeedContexts` in the Catalog rig, the fake feed's 200 service index, `Catalog.sources` registering nothing) are verified and folded in.
`````




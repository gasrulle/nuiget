# STATUS — src/host   commit 1df7087 (P5.10 commit c, fix-forward; parent of commit d)   2026-10-16T10:00:00Z

git status --porcelain --untracked-files=all (before commit d): modified `.github/copilot-instructions.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/host/{SidebarHost,handlers.test}.ts`, `vitest.config.mts` and the four STATUS notes; new `src/host/pickers.test.ts`, `src/test/ui/v2/sidebar-parity.ui.test.ts` (all belong to P5.10 commit d)

Item: **P5.10, commit d of four**: the sidebar's version picker (`SidebarHost`, actions `install-version`,
`change-version`, `update-version`) shows a warning and submits nothing when the package has no versions and no source
could be reached (`sourcesUnavailable`), instead of "No versions found". `pickers.ts` gets its own tests, and the
host's measured line coverage is a ratchet in `vitest.config.mts` (`src/host/**`: lines 87).

## Verified by running

P5.10 commit d:

```text
baseline at 1df7087 (commit c, fix-forward) → its CI run 38725348661 green on all 11 jobs before this commit
npx tsc --noEmit / npm run check-types / npm run lint → exit 0 each
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → exit 0 · Test Files 158 passed (158) · Tests 3230 passed (3230)
npm run bench → exit 0 · npx vitest run --coverage → exit 0 (src/host lines 87.76 against the new ratchet 87)
npm run docs:protocol:check → exit 0
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 281381 / 299921 · webview 518470 / 600685 ·
                               sidebar 317603 / 329122 (N63)
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → check:vsix: OK
NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2, five times (rm -rf dist before each) →
                               21 passing, 21 passing, 21 passing, 21 passing, 21 passing; fixture unchanged after each
rm -rf dist && npm run package:vsix (NUIGET_V2 unset) → exit 0, nuiget-v1.18.9.vsix (17 files)
test -e .claude/.contract-change → false
```

## Done (tested)

- `pickers.test.ts` (new, 11 tests): `pickProject` (none, several with All Projects first and the current one active,
  one without All Projects), `pickSource`, `pickVersion` (none, installed marked), `pickProjectsForInstall` (pre-picked,
  empty), `pickSingleProject`, `pickContextMenuAction` (the item sets of the three contexts; the answer).
- `handlers.test.ts`: new `SidebarHost: no versions and every source unreachable says so and submits nothing`; new
  `SidebarHost: install from browse under All Projects picks the projects; one project is ops/install, several are
  ops/bulkInstall`.

## Done (untested)

- The sidebar's All Projects in VS Code: the fixture has one project, which the host normalizes; jsdom is the proof.

## Not started

- None for P5.10. Next: P5.11.

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

The P5.10 ruling (2026-10-16) is verbatim in `docs/plans/STATUS.md`.

## Exact next step (one item ID)

P5.11, after commit d's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/core/catalog/{Catalog,Catalog.test,feedContexts,feedContexts.test}.ts`, `src/host/{handlers,handlers.test}.ts`, `src/webview/main/{MainShell.tsx,main.css}`, `src/webview/shared/store/{sources.tsx,sources.test.tsx}` and the five STATUS notes; new `src/webview/main/features/sources/{SourcesControl,SourceSettingsDialog,SourcesControl.test}.tsx`, `src/test/ui/v2/main-sources.ui.test.ts` (all belong to the P5.8 commit)

Item: **P5.8** (host part, ruling 1b of 2026-10-15): `listSources` (`sources/list`, `sources/refresh`) and
`afterSourceMutation` (the four mutations) read `catalog.sources(…, { configFiles: true })`; the `removedUrl` and
`disabledUrl` pre-reads, `extension.next.ts` and `SidebarHost.ts` read without the flag.

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

- `handlers.test.ts`: `sources/list resolves the selected project's directory` asserts the flag (ruling step 5); new
  `a mutation answers with the attributed sources; the pre-reads of remove and disable ask without`.

## Done (untested)

- The attribution against a real SDK in VS Code: the ExTester test shows the rows, not their `configFile` (a machine's
  user-level config file differs; the jsdom and host tests cover what is shown and sent).

## Not started

- The sidebar's source and restore title-bar state and "Open full view" (P5.10); the multi-install picker (P5.9).

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

The P5.8 ruling of the `architecture-advisor` (2026-10-15, option 1b) is verbatim in `docs/plans/STATUS.md` under "### P5.8 — stop-and-ask: the config chain for `configFile` attribution in `Catalog.sources()`" and in `src/core/catalog/STATUS.md`. The ambient advisor was consulted before writing (the selector disabled until the list is known keeps the P5.3 test as written, the in-dialog confirm row, `allowInsecure` for `http:`, no mutation in VS Code).

## Exact next step (one item ID)

P5.9 (feature all-projects), after P5.8's CI run is green.

## Earlier notes of this directory

The notes below are P5.6's, then P4.9b's with its own earlier notes (kept for the P4 phase review).

git status --porcelain --untracked-files=all (before the commit): modified `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/core/feeds/{enricher,enricher.test}.ts`, `src/host/handlers.test.ts`, `src/webview/main/{MainShell.tsx,index.tsx,index.test.tsx,main.css}`, `src/webview/shared/store/StoreProvider.tsx`, `src/webview/sidebar-next/{SidebarView.tsx,SidebarView.test.tsx,UpdatesSection.tsx,sidebar.css}` and the six STATUS notes; new `src/webview/shared/search/{SearchBox.tsx,SearchBox.test.tsx,search.css}`, `src/webview/shared/store/{search,sources,config}.tsx` with their tests, `src/webview/main/features/search/{BrowseList.tsx,BrowseList.test.tsx,useSearchTyping.ts,useSearchTyping.test.tsx}`, `src/webview/sidebar-next/{BrowseResults.tsx,BrowseResults.test.tsx}`, `src/test/ui/v2/main-search.ui.test.ts` (all belong to the P5.6 commit)

Item: **P5.6** (host part, from the P4 review): `handlers.test.ts` gains `search/query emits the metadata chunk before
its response` (`handlers.ts:296` covered): the chunk is streamed before the response, the response carries
`sourcesUnavailable` and no generation. No host source changed.

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

- The test above; the rest of `handlers.test.ts` unchanged.

## Done (untested)

- The quick-search suggestions in VS Code: the ExTester test submits with Enter; suggestions, timers and both modes are
  covered in jsdom (`useSearchTyping.test.tsx`).

## Not started

- Details of a browse row (P5.7), the sources settings and selector (P5.8), the multi-install picker (P5.9), the
  sidebar's context menu, "View package details" and "Open full view" (P5.10), the search settings' `full`/`off`
  values (N57, P5.13).

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

Both P5.6 rulings of the `architecture-advisor` (2026-10-15) are verbatim in `docs/plans/STATUS.md` under "### P5.6 — stop-and-ask: the source list of quick-search and `searchDebounceMode`" and "### P5.6 — stop-and-ask: the main entry's start requests". The ambient advisor was consulted before writing (scope: no install action on main browse rows, the details pane stays P5.7's, `ui/viewPackage` senders stay P5.10's, the combobox instead of `Popover`, the latency measured at the first ExTester run).

## Exact next step (one item ID)

P5.7 (feature details), after P5.6's CI run is green.

## Earlier notes of this directory

git status --porcelain --untracked-files=all (before the commit): new `src/test/harness/fakeFeed.ts`; modified `src/core/feeds/{health,health.test}.ts`, `src/core/catalog/{Catalog,Catalog.test,feedContexts,feedContexts.test}.ts`, `src/host/{handlers,SidebarHost}.ts`, `src/extension.next.ts`, `src/extension.next.test.ts`, `src/test/harness/{harness,FakeWebview,scenarios.test}.ts`, the five STATUS notes, `CHANGELOG.md`, `ARCHITECTURE.md`, `.github/copilot-instructions.md`, `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md` (all belong to the P4.9b commit)

Item: **P4.9b** (host part): `sources/list` and `sources/refresh` answer `failed: catalog.sourceHealth()`; the health-reset
comments of `sources/refresh`, `refresh/all` and `SidebarHost.refresh` removed (the reset is inside `invalidate`, ADR-009 d.6).

## Verified by running

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

- `handlers.test.ts` green unchanged (the `sources/list` assertion of `failed` reads the fake Catalog's `sourceHealth()`).

## Done (untested)

- Nothing new.

## Not started

- Nothing for P4.

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P4.9b, stop-and-ask: how the health monitor obtains its chains. Verbatim at the end of this file where the ruling
names this directory, and in `docs/plans/STATUS.md`; the P4.9 ruling (steps 11-16) is there too.

## Exact next step (one item ID)

P4.10 (benches and the ARCHITECTURE 2.0 pass for feeds, transport, policy and caching), then the P4 phase gate and review.

## Earlier notes of this directory (kept for the P4 phase review)

# STATUS — src/host   commit 631a13c (parent of the P4.9a commit)   2026-10-16T05:30:00Z

git status --porcelain --untracked-files=all (before the commit): new `src/core/catalog/{feedClients,feedContexts}.ts` and their tests; modified `src/core/catalog/{Catalog,Catalog.test,index}.ts`, `src/host/{handlers,handlers.test,SidebarHost,WebviewHost,WebviewHost.test}.ts`, `src/extension.next.ts`, `src/extension.next.test.ts`, `src/core/project/{context,context.test}.ts`, `docs/adr/009-catalog.md`, the three STATUS notes, `CHANGELOG.md`, `ARCHITECTURE.md`, `.github/copilot-instructions.md`, `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md` (all belong to the P4.9a commit)

Item: **P4.9a** (host part): the feed handlers call the Catalog with `sourceDirectory(services)`; `updates/get` reports the
Catalog's generation; `package/versions` answers `failed` for no versions with `sourcesUnavailable`; `readme/image` answers
through `Catalog.readmeImage`; `package/prewarm` awaits `Catalog.prewarm`; `WebviewHost` no longer maps `not-yet-available`.
Three `REMOVAL GATE: P4.9` lines remain in `handlers.ts` and one in `SidebarHost.ts`, for P4.9b.

## Verified by running

```text
baseline at 631a13c         → CI run 38664145312 green on all 11 jobs · npm run check-types 0 · npx eslint src 0 · npx vitest run
                               green (139 files, 2997 passed, 4 skipped)
npx tsc --noEmit → exit 0 · npm run check-types → exit 0 · npx eslint src → exit 0
grep -c 'REMOVAL GATE: P4.9' Catalog.ts handlers.ts SidebarHost.ts extension.next.ts → 0, 3, 1, 1 (as ruled; the rest is P4.9b's)
grep -rn 'NotYetAvailableError\|not-yet-available' src --include='*.ts' → no output (the STATUS notes quote the ruling)
grep -rn "nuget.org" src/core/catalog --include='*.ts' | grep -v test → no output
DOTNET_ROOT=… NUIGET_SDK_TESTS=1 npx vitest run --project backend src/core/catalog src/host src/extension.next.test.ts src/core/project
                             → Tests 279 passed (279), with the titles the ruling's VERIFY lists
npx vitest run --project integration src/test/harness → Tests 16 passed (16), titles unchanged
negative control             → 18 mutations (updates carrier, carrier unwrap, both 'all' keys, policy in versions and metadata,
                               offline not cached, versions carrier, excluded in updates and search, unhealthy out of the CLI
                               fallback, vulnerabilities absent, invalidate, the search enricher for updates, prewarm sources,
                               the directory cache of forProject, icon reset on clear, the lite cache, no vulnerability data in
                               the search enricher): 18 of 18 caught
npm test (NUIGET_SDK_TESTS=1, DOTNET_ROOT set) → Test Files 141 passed (141) · Tests 3030 passed (3030)
npm run bench               → Test Files 19 passed (19) · Tests 114 passed | 1 skipped (115) (benches of the Catalog are P4.10's)
rm -rf dist && npm run package:vsix → exit 0 · npm run check:vsix → OK · npm run docs:protocol:check → up to date
git diff --name-only -- docs/adr src/protocol src/core/contracts.ts → docs/adr/009-catalog.md (behind the sentinel P4.9a,
                               deleted before the commit)
test:ui, test:ui:v2          → SKIPPED locally: no webview file changed; CI runs both UI jobs on the push
```

## Done (tested)

- `handlers.test.ts`: `the ten resource responses carry the generation the Catalog reported`, `feed reads pass the selected
  project's directory and the payload to the Catalog`, `package/versions: no versions and sourcesUnavailable is a failed
  response, otherwise the list`, `readme/image answers through Catalog.readmeImage and package/prewarm awaits Catalog.prewarm`;
  the per-request test without the gated branch.

## Done (untested)

- `SidebarHost` version picker under the new `versions` signature (no test reaches the picker's catalog call).

## Not started

- P4.9b: `sources/list` health, the health resets of `sources/refresh`, `refresh/all` and `SidebarHost.refresh`, the
  `sources/health` event.

## Deviations from contract/ADR (file:line each)

- See `src/core/catalog/STATUS.md` (the `SidebarHost` call site, the `WebviewHost` branch).

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P4.9, stop-and-ask: wiring the feeds. The answer is pasted verbatim at the end of this file ("Advisor decision: P4.9
— stop-and-ask: wiring the feeds (2026-10-16), verbatim") and in `docs/plans/STATUS.md`. It split the item into P4.9a and P4.9b.

## Exact next step (one item ID)

P4.9b (source health to both surfaces, all-projects lite metadata, the last five gates, the two harness scenarios), after
P4.9a's CI run is green.

## Earlier notes of this directory (kept for the P4 phase review)

# STATUS — src/host   commit 05fdea9 (parent of the P2.fix-2 commit)   2026-10-13T21:30:00Z

git status --porcelain --untracked-files=all src/host: `?? src/host/` (nine files; they belong to the P2.9
commit, together with ` M src/protocol/messages.ts`, ` M src/protocol/domain.ts`,
` M src/protocol/protocol.test.ts`, ` M docs/protocol.md`, ` M docs/adr/002-query-coordinator.md`,
` M docs/adr/006-icons-and-csp.md`, ` M docs/adr/008-webview-architecture.md`, ` M ARCHITECTURE.md`,
` M CHANGELOG.md`, ` M .github/copilot-instructions.md`, ` M docs/plans/STATUS.md`,
` M docs/plans/findings-ledger.md` and ` M src/core/catalog/STATUS.md`)

Item: **P2.9 `src/host/` through the salvage gate** (stop-and-ask, and a contract item: the event
`resources/invalidated`, `ExtensionConfig`, the N43 comment, and one amendment each of ADR-002, ADR-006 and
ADR-008, under the sentinel).

The quarry has seven files in this directory (1263 lines, committed there in `f837f34`) and no note. They were
copied byte-identical from its working tree before the consultation so that the advisor could read them.

Last item: **P2.fix-2** (phase review P2, blocking 2, finding C-protocol-host-7): the nine responses that are
coordinator resources carry their generation. The note of P2.9, which brought the host through the gate,
follows unchanged below the P2.fix-2 entries of each section.

## Verified by running

```text
P2.fix-2, on the tree of its commit (DOTNET_ROOT set; npm test also with NUIGET_SDK_TESTS=1):
npx tsc --noEmit / npm run check-types → exit 0 / exit 0
npx eslint src / npm run lint → exit 0, no output / exit 0
npx vitest run --project backend src/core/catalog src/host src/extension.next.test.ts
                             → Test Files 4 passed (4) · Tests 123 passed (123) (Catalog 25, handlers 60,
                               WebviewHost 11, root 27); 60 runs in a row without a failure
npx vitest run --project integration src/test/harness → Tests 14 passed (14); 30 runs in a row
npm test (NUIGET_SDK_TESTS=1) → Test Files 83 passed (83) · Tests 2495 passed (2495)
npx vitest run               → Tests 2492 passed | 3 skipped (2495)
npx vitest run --coverage    → exit 0 · src/core/** 2665 of 2705 lines, 98.52 % (catalog 98.06 %) ·
                               src/host/** 436 of 597, 73.03 % · src/extension.next.ts 94.50 %
npm run bench                → Tests 112 passed | 1 skipped (113)
npm run docs:protocol:check  → exit 0 · docs/protocol.md is up to date (no protocol change)
node esbuild.mjs --v2        → exit 0 · three bundles (dist/ deleted afterwards)
npm run package:vsix         → exit 0 · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 530.07 KB)
npm run check:vsix           → check:vsix: OK
first run of these gates     → the targeted run and npm test each had 1 failed test, the plain run none:
                               `watches props, nuget.config, global.json, lock and assets files with their
                               scopes` of src/extension.next.test.ts, a test that asserted the order of two
                               asynchronous effects (finding N60; 7 failures in 40 runs). Made deterministic
                               without removing an assertion; the gates above are the run after that, except
                               npm run bench, which is of the first run (benchmarks are discovered under
                               src/test/benchmarks only and do not read the changed test file)
negative control             → nine mutations (the generation not handed to makeOk; installed/get and
                               sources/add not setting it; projects/list setting another number; the Catalog
                               reporting 0 or another generation, with and without an upgrade; the fake
                               webview applying a response below the listed generation, or comparing with the
                               event's sequence number): 9 of 9 caught. Every file was restored.
grep -c "ctx.generation = " src/host/handlers.ts → 9 · grep -n "makeOk(request.id, request.type, result, ctx.generation)"
                               src/host/WebviewHost.ts → 1 · REMOVAL GATE comments unchanged (handlers 4 + 1)
git diff --stat -- src/protocol src/core/contracts.ts docs/adr docs/protocol.md → empty · no sentinel
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it

Before it, as the earlier item left it:
The gates ran with DOTNET_ROOT set to the SDK directory and NUIGET_SDK_TESTS=1 (N48).
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0
baseline npx vitest run      → Test Files 79 passed (79) · Tests 2378 passed (2378)
copy from the quarry tree    → cmp: all seven files identical to the quarry working tree
unmodified copy              → npx tsc --noEmit: 36 errors (33 in handlers.ts, 2 in SidebarHost.ts, 1 in
                               services.ts: '../core/project/mutator', a module of P6.3) · npx eslint src/host:
                               no finding · WebviewHost.test.ts: 7 tests pass (Vitest does not type-check;
                               tsconfig.vitest.json reported TS2415, TS4114 and TS2341 for its `webview` field)
sentinel                     → approval recorded in docs/plans/STATUS.md and in this note; then
                               .claude/.contract-change created with content P2.9; the seven frozen files
                               edited, npm run docs:protocol run; sentinel removed
npx tsc --noEmit / npm run check-types → exit 0 / exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src / npm run lint → exit 0, no output / exit 0
npx vitest run --project backend src/host --reporter=verbose → Test Files 2 passed (2) · Tests 68 passed (68);
                               43 lines match `one request → exactly one terminal response`; the titles of the
                               ruling's VERIFY list are present, and so are the seven quarry titles of
                               WebviewHost.test.ts   (item gate: ≥ 42 request cases)
npx vitest run --project backend src/protocol → Test Files 1 passed (1) · Tests 13 passed (13) (11 + 2)
npm test                     → Test Files 81 passed (81) · Tests 2448 passed (2448)
npx vitest run (no NUIGET_SDK_TESTS) → Tests 2445 passed | 3 skipped (2448)
npx vitest run --coverage    → exit 0 · from coverage/lcov.info: all files 8995 of 11434 lines, 78.67 % ·
                               src/core/** 2662 of 2704 lines, 98.45 % (floor 85 %) · src/host/** 339 of 576
                               lines, 58.85 %: WebviewHost.ts 65/71, handlers.ts 186/208, services.ts 35/48,
                               SidebarHost.ts 41/126, pickers.ts 11/71, MainPanelHost.ts 1/52
npm run bench                → Test Files 17 passed (17) · Tests 104 passed | 1 skipped (105)
npm run package:vsix         → exit 0 · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 529.54 KB)
npm run check:vsix           → check:vsix: OK
npm run docs:protocol:check  → exit 0
negative control             → 20 single mutations of handlers.ts, services.ts, WebviewHost.ts and
                               SidebarHost.ts, each run against src/host. 19 failed a test at once: a disposed
                               surface cancels the ticket; the literal opId 'rejected'; sources resolved in the
                               workspace folder; no announcement; no invalidation; the opening chunk always
                               `queued`; no font-src; a constant nonce; the CPM memo never cleared; a rejected
                               read memoized; an unsupported inspection not refused; no mapping of
                               not-yet-available; detach aborting with `cancelled`; the abort code always
                               `disposed`; installed/get ignoring `upgrade`; a refused restore not an error;
                               ALL_PROJECTS entries kept in a batch; the sidebar not settling its operation.
                               One survived: the memo key without normalizeProjectPath, because the test built
                               its second spelling with path.join, which normalizes. The test now builds the
                               string by hand; the mutation fails it. Every file was restored and compared
                               (cmp) afterwards.
grep -rn "Thenable\|process.cwd\|Math.random\|chrome-\|'rejected', reason\|resetSourceHealth\|resolvedSources\|sourceHealth" src/host --include='*.ts' → no output
grep -c "REMOVAL GATE: P4.9" src/host/handlers.ts → 4 · "REMOVAL GATE: P4.4" src/host/handlers.ts → 1 ·
                               "REMOVAL GATE: P4.9" src/host/SidebarHost.ts → 1
grep -rn "mutator" src/host --include='*.ts' → no output · NotYetAvailableError in src/host outside tests → none
grep -c recentSearchesLimit src/protocol/domain.ts src/host/services.ts docs/protocol.md → 0 each
grep -c "keys: Array<{ key: ResourceKey; generation: number }>" docs/protocol.md → 0, where the ruling expects
                               1: the generator prints the member as `{ key: ResourceKey; generation: number; }`
                               (line 68). The same grep without the closing `}>` → 1. See Deviations.
git diff --name-only 4982d16 -- src/protocol src/core/contracts.ts docs/adr → docs/adr/002-query-coordinator.md,
                               docs/adr/006-icons-and-csp.md, docs/adr/008-webview-architecture.md,
                               src/protocol/domain.ts, src/protocol/messages.ts, src/protocol/protocol.test.ts
ls .claude/.contract-change  → No such file or directory
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P2.9
```

## Done (tested)

- P2.fix-2, `WebviewHost.ts`: `RequestContext.generation` is set by a handler whose result is a coordinator
  resource; `dispatch` hands it to `makeOk`. An error response and a stream chunk never carry it.
- P2.fix-2, `handlers.ts`: nine handlers set `ctx.generation` from what the Catalog reports: `projects/list`,
  `installed/get`, `transitive/get`, `sources/list`, `sources/refresh` and the four source mutations, whose
  `sources` is a fresh read after the invalidation the mutation itself caused. Every other read of the Catalog
  in `handlers.ts` and `SidebarHost.ts` unwraps `.value`.
- P2.fix-2, tests: `WebviewHost.test.ts` has `a generation set on the context reaches the ok envelope` and `an
  error response and a stream chunk carry no generation` (11 tests); `handlers.test.ts` checks in each of its
  43 per-request cases that exactly the nine resource requests answer with a numeric `generation` and no other
  response has the field, and has `the nine resource responses carry the generation the Catalog reported`
  (60 tests).
- Frozen files, under the sentinel: `resources/invalidated` carries `keys: Array<{ key; generation }>`
  (`src/protocol/messages.ts`), `ExtensionConfig` has `enablePerformanceLogging` and no `recentSearchesLimit`,
  the `floatingDepth` comment names 0 to 4 (N43, `src/protocol/domain.ts:21`), two cases in
  `src/protocol/protocol.test.ts`, `docs/protocol.md` regenerated, and the amendments of ADR-002, ADR-006 and
  ADR-008 with the ruling's text.
- `WebviewHost.ts`: `WebviewLike.postMessage` returns `PromiseLike<boolean> | boolean | void` (no `Thenable`);
  `detach()` aborts with `ABORT_DISPOSED` and a cancel envelope with `ABORT_CANCELLED` (`:58-63`, `:90`,
  `:115`); the error code of an aborted request comes from the signal's reason; an error whose `code` is
  `not-yet-available` is answered as `unsupported` (`:193-195`).
- `handlers.ts`:
  - `requireProject` and `sourceDirectory` (`:18-36`): the directory of the selected project, else the first
    workspace folder, else `not-found`. It is the argument of every `catalog.sources` call and the working
    directory of the four source mutations.
  - `operations` (`:53-144`): one submit function per `ops/*` request. Each validates, takes the restore
    switch at submission and submits to the queue; every refusal is built with the `opId` the queue passes.
    Empty batches and batches without a real project throw `invalid-request` before anything is submitted.
  - `settleOperation` (`:154`) and `awaitTicket` (`:166`): the opening chunk, progress of this operation only,
    a webview cancel cancels the ticket, a disposed surface does not (N9).
  - `registerSharedHandlers` (`:229`): 40 of the 43 request types. `installed/get` answers with the upgraded
    result when there is one; `transitive/get` with `forceRestore` runs `operations.restore` through
    `awaitTicket` first and fails when the queue refuses it (Y3); the all-projects reads forward the Catalog's
    chunks; `search/query` returns `sourcesUnavailable`; `readme/image` (`:295`, `REMOVAL GATE: P4.4`),
    `package/prewarm`, `sources/list`, `sources/refresh` and `refresh/all` (`REMOVAL GATE: P4.9`, four lines);
    `perf/mark` logs at `info` only while `enablePerformanceLogging` is on.
- `services.ts`: `HostServices` (`:16`), `createWorkflowDeps` (`:54`), `readExtensionConfig` (`:89`),
  `renderWebviewHtml` with the CSP of ADR-006 (`:111-118`) and `createNonce` from `crypto.randomBytes`.
- `SidebarHost.ts`: a context-menu action calls `settleOperation(services, operations.<x>(…))` (nine places,
  `:168-217`); `runOperation` is deleted; `notifyInvalidated(event: InvalidationEvent)` forwards the event
  unchanged, as does `MainPanelHost.ts:93`.
- `handlers.test.ts`, 59 tests: one per request type (43) with a payload fixture table that fails to compile
  when a request has no fixture; the titles of the ruling; and three more (`covers the 43 requests of the
  protocol`, `a source mutation runs in that directory, invalidates and reconciles the session`, `perf/mark is
  logged at info only while performance logging is on`). It uses the real `DefaultOperationQueue`.
- `WebviewHost.test.ts`, 9 tests: the seven of the quarry and `detach aborts with reason disposed and cancel
  with reason cancelled`, `an error whose code is not-yet-available answers unsupported`.

## Done (untested)

- `MainPanelHost.ts` (1 of 52 lines run) and `pickers.ts` (11 of 71): no test constructs the panel or shows a
  quick pick. They compile against the contracts; the harness scenarios of P2.11 are their first test.
- `SidebarHost.ts` beyond the `uninstall` action in single-project mode (41 of 126 lines): the other eight
  `settleOperation` calls, the all-projects branches, the source and project pickers and the title update are
  type-checked only.
- `readExtensionConfig` and `loggerFor`: not called by a test (they read the VS Code configuration and wrap a
  log channel).
- Nothing constructs `HostServices` yet: P2.10 does.

## Not started

- The composition root (`src/extension.next.ts`): P2.10. It calls `createWorkflowDeps`, uses `queue.onProgress`
  as `onOperationProgress` and forwards `coordinator.onDidInvalidate` to both hosts.
- Source health (`failed` of `sources/list`, the `sources/health` chunk and event, the reset on refresh),
  the pre-warm and every feed read: P4.9 (the `REMOVAL GATE: P4.9` lines).
- `readme/image`: P4.4.
- The provisional chunk of `installed/get`: P6.2. `HostServices.mutator`: P6.3.
- `nuiget.searchDebounceMode` values `full` and `off` (N57): P5.

## Deviations from contract/ADR (file:line each)

- P2.fix-2, `handlers.test.ts`: the fake Catalog answers with the new shapes (`{ value, generation }`,
  `generation` on the installed result), in `makeServices` and in the two tests that replace an answer
  (`installed/get answers with the final result`, `transitive/get: forceRestore runs through the queue as
  PackageWorkflows.restore (Y3)`). No assertion was removed; the per-request test asserts one fact more.
- P2.fix-2, `handlers.ts`: `listSources` returns `{ result, generation }` and the two handlers assign
  `ctx.generation` themselves, so that the file has the nine assignments the review counts.
- `WebviewHost.test.ts:7-8,12,94`: the quarry test's public field `webview` is renamed `page`. The base class
  has a private member `webview`, and `tsconfig.vitest.json` refused the subclass (TS2415, TS4114, TS2341).
  No assertion changed; the ruling says the seven tests "stay as they are", which holds for what they assert.
- The ruling's DECISION says "eight frozen files" and lists seven; seven were edited.
- VERIFY expects `grep -c "keys: Array<{ key: ResourceKey; generation: number }>" docs/protocol.md` → 1. It is
  0, because `scripts/gen-protocol-docs.mjs` prints object members with a closing `; }` (`docs/protocol.md:68`).
  The file is generated and `docs:protocol:check` passes; the generator is not a file of this item.
- `WebviewHost.ts:153`: the error line of a failed request passes `redact` before it is logged. The ruling
  does not ask for it; an error text may carry CLI output (gotcha "CLI output reaches logs unredacted").
- `WebviewHost.ts:58-63`: the abort reasons are the exported constants `ABORT_DISPOSED` and `ABORT_CANCELLED`
  (the ruling writes the string literals), so that `handlers.ts` compares with the same value.
- `services.ts:39-46`: the parameter type of `createWorkflowDeps` is the named interface
  `WorkflowDepsOptions`; the ruling writes it inline.
- `handlers.test.ts`, `SidebarHost: a context-menu action submits a typed operation and never fabricates a
  request`: the ruling says "no `response` envelope posted to the webview". The test sends the
  `ui/contextMenu` request as the webview does, so exactly one response exists, for that id
  (`{ handled: true }`); the test asserts that it is the only one and that the outcome is announced.
- `handlers.test.ts`, `beforeEach`: `env.openExternal`, `window.setStatusBarMessage`,
  `window.showWarningMessage` and `commands.executeCommand` are added to the shared `vscode` mock at run time,
  because `src/test/__mocks__/vscode.ts` is not a file of this item and lacks them.
- `ui/contextMenu` is registered by `SidebarHost` only; on the main surface it is answered `unsupported`, as
  in the quarry. `ui/openSourceSettings` and `ui/viewPackage` are registered by each host, not by the shared
  handlers, so the per-type test expects `unsupported` for the three on the bare registrar.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-13, P2.fix-2, phase review P2 (`architecture-advisor`, brief `PHASE REVIEW P2`). The whole review is
in `docs/plans/STATUS.md` under "Phase gates"; its blocking item 2, which is this fix, verbatim:

`````text
2. P2.fix-2 — C-protocol-host-7: `WebviewHost.dispatch` posts `makeOk(request.id, request.type, result)` (`src/host/WebviewHost.ts:146`); `makeOk` accepts a fourth argument `generation` (`src/protocol/envelope.ts:88-91`) and the ok envelope has `generation?: number` (`:52`), but no handler can supply it because the Catalog's cacheable reads return bare values (`Catalog.ts:94-101,110-143,181-183`) while the coordinator's handle carries the generation (`QueryCoordinator.ts:160,180`). ADR-007:29-31, ADR-008:19-24 and the P3.3 row ("stale discard by id and generation") read a field nobody writes.

   Answers to question 2. Blocking: yes, before P3.3 (its row already says so). The generation travels as a field, not a wrapped return: `RequestContext<T>` (`WebviewHost.ts:35-40`) gains `generation?: number`, documented "set by a handler whose result is a coordinator resource: the generation it was computed for; `WebviewHost` puts it on the ok envelope (ADR-007)"; `dispatch` posts `makeOk(request.id, request.type, result, ctx.generation)`; an error response, a stream chunk and an aborted request never carry it. The `RequestHandler` type and the 43 one-response cases are untouched by this choice.

   Catalog (`src/core/catalog/Catalog.ts`): `export interface CatalogValue<T> { value: T; generation: number }`; `projects`, `sources` and `transitive` return `Promise<CatalogValue<…>>` with `generation: handle.generation` of the handle whose `value` resolved (`queryWithRetry` returns `{ value, generation }` of the attempt that succeeded, so a stale retry reports the new generation); `InstalledQueryResult` gains `generation: number`, the handle's generation of the attempt that resolved, the same for the `{ result }` of a cache hit or joiner, for the `{ result, upgrade }` of a running evaluation, and for the provisional that `upgrade` falls back to when the evaluation is superseded (that fallback is then below the generation the event lists, which is exactly what the webview must discard; note on the P6.2 row that this fallback, `Catalog.ts:132`, becomes the first real producer of such a response). A cache hit reports `entry.generation` (equal to `valueGeneration` by the hit condition, `QueryCoordinator.ts:158-160`); a joiner reports the computation's generation; both surfaces therefore see the same number for the same `(key, generation)`. The fan-outs `allProjectsInstalled` and `allProjectsTransitive` unwrap `.value` internally (`Catalog.ts:205,214,246,253`) and report no generation: they are not resources (ADR-009 decision 1).

   Handlers that set `ctx.generation` (nine): `projects/list`, `installed/get`, `transitive/get`, `sources/list`, `sources/refresh`, and `sources/add`, `sources/remove`, `sources/enable`, `sources/disable` (their `sources` is a fresh read of `sources:<dir>` after the `sources` invalidation in `afterSourceMutation`, `handlers.ts:307-312`, so it is "a result computed for a generation" in the sense of ADR-007:29-31; without it a webview that shows sources through `useResource` could not order the mutation's answer against the event the mutation itself fired). Not set: `allProjects/*`, `updates/get` (not yet available), `session/*`, `layout/*`, `ops/*`, `ui/*`, `refresh/all`, `perf/mark`. Call sites that unwrap `.value`: `extension.next.ts:123,141`, `SidebarHost.ts:80,88,156,229`, `handlers.ts:254,256,273,299,309-310,322,338`, `harness.ts:343`, and `handlers.test.ts:98` (the fake catalog returns the new shapes). No frozen file changes: `envelope.ts`, `messages.ts`, `docs/protocol.md`, `contracts.ts`, the ADRs stay; `npm run docs:protocol:check` must still exit 0.

   Tests:
   - `src/host/WebviewHost.test.ts`: `a generation set on the context reaches the ok envelope` (handler sets `ctx.generation = 3`, posted envelope `{ ok: true, generation: 3 }`), `an error response and a stream chunk carry no generation`.
   - `src/host/handlers.test.ts`: extend `it.each(REQUEST_TYPES)('%s: one request → exactly one terminal response')` (`:186`) so that for exactly the nine types above the ok envelope has `typeof generation === 'number'` and for every other type `'generation' in envelope` is false; the fake catalog answers with the new shapes.
   - `src/core/catalog/Catalog.test.ts`: `a cache hit and a joiner report the computation's generation` (two `projects()` calls during one computation and a third after it: all three `generation` equal `coordinator.generationOf(resourceKeys.projects())`), `a stale retry reports the generation it finally resolved for`, `installed reports the handle's generation with and without an upgrade`.
   - `src/test/harness/scenarios.test.ts`, new scenario — the ledger's title "late response for an invalidated key is discarded by generation" cannot be satisfied by this host: ADR-002 invariants 2 and 3 make the coordinator reject a result an invalidation overtook, `queryWithRetry` turns the third stale into an error, and the host posts in order, so no ok response below the listed generation exists before P6.2; the scenario is named for what it proves: `generation on responses: every resource response carries the generation the latest invalidation lists for its key, on both surfaces`. Both surfaces resolved and showing A: every `installed/get` ok response for A on both surfaces carries the same `generation`, every `projects/list` response the same for `projects`; `refresh('main')`; the `resources/invalidated` event lists `installed:A` and `projects` with new generations; after `expectState`, every response delivered after the event carries exactly the listed generation, on both surfaces; `expectOneResponsePerRequest`. Correct the ledger row's title when closing it.
   - `FakeWebview.ts` rule 7 (header `:18`, code `:229-243`) becomes: "An ok response of the `projects` or `installed` slot carries `generation`; it is applied only when that generation is not below the one the latest `resources/invalidated` event listed for its key (`projects`, `installed:<path>`); a lower one is recorded and not applied. Rule 4 (latest request id wins) is unchanged; chunks are never compared." The model keeps the last listed generation per key from `onInvalidated`.

   Docs: ARCHITECTURE "Reading through the Catalog" (the four reads return `{ value, generation }`; the nine handlers put it on the envelope; fan-outs do not) and the harness paragraph's rule 7 (`ARCHITECTURE.md:191-192`); the `src/host/**` row; `src/core/catalog/STATUS.md`, `src/host/STATUS.md`, `src/test/harness/STATUS.md` (drop "No scenario asserts a response `generation`"); ledger C-protocol-host-7 → closed with the corrected scenario title; P3.3 row note → "fixed in P2.fix-2"; P6.2 row note as above; CHANGELOG: amend the Added bullet "2.0 webview hosts" with "and every response that is a cached resource carries the generation it was computed for".

   VERIFY:
   - `grep -n "makeOk(request.id, request.type, result, ctx.generation)" src/host/WebviewHost.ts` → 1; `grep -n "generation?: number" src/host/WebviewHost.ts` → 1
   - `grep -c "ctx.generation = " src/host/handlers.ts` → 9
   - `npx vitest run --project backend src/core/catalog src/host` → green, with the five new titles present (`grep` each)
   - `npx vitest run --project integration src/test/harness` → 13 passed; `grep -c "never compared" src/test/harness/FakeWebview.ts ARCHITECTURE.md` → 0
   - `npm run docs:protocol:check` → exit 0; `git diff --stat labs/2.0..HEAD -- src/protocol src/core/contracts.ts docs/adr` → empty; `ls .claude/.contract-change` → No such file
   - `npm run check-types`, `npx eslint src`, `npm test`, `npm run bench`, `npm run package:vsix`, `npm run check:vsix` → all exit 0

   Ownership and order (the question on fix items): `P2.fix-1` (C-state-core-6) first, as the P2.11 ruling named it, then `P2.fix-2` (C-protocol-host-7); each a tracker row after P2.12 with its own commit (`git-commit` skill, citing the fix id, the finding and ADR-001/ADR-002/ADR-007/ADR-008/ADR-009), push and green CI. Neither touches a frozen path; neither needs a sentinel. After both: re-run the P2 gate block, append it under "Phase gates", set `labs/2.0-P2-done` on the P2.fix-2 commit.
`````

2026-10-12, P2.9, stop-and-ask and contract item (D6). Brief in the form of plan §2.4, sent on `labs/2.0` @
`4982d16` with the seven files of the quarry's `src/host/` copied byte-identical into the working tree so that
they could be read, and nothing else written. Eight questions: A the frozen edits and the sentinel; B the
members of `HostServices` and the nonce; C the handlers against the Catalog of P2.8; D `isCpmProject` for the
workflows; E the envelope hack of `SidebarHost`; F the CSP string; G the tests; H docs and ledger ids. Answer of
the `architecture-advisor`, verbatim (it is the recorded approval for the sentinel; also in
`docs/plans/STATUS.md`, "Advisor decisions"):

`````text
DECISION: Approve P2.9 as a contract-change item, sentinel `.claude/.contract-change` with content exactly `P2.9`, for eight frozen files and nothing else: `src/protocol/messages.ts` (two lines: the `ResourceKey` import and the `resources/invalidated` member), `src/protocol/domain.ts` (the `ExtensionConfig` interface and the N43 comment at line 21), `src/protocol/protocol.test.ts` (it is under `src/protocol/**`, so the hook freezes it), `docs/protocol.md` (regenerated), `docs/adr/002-query-coordinator.md`, `docs/adr/008-webview-architecture.md` and `docs/adr/006-icons-and-csp.md` (one header fragment and one bullet each). `src/core/contracts.ts` is not edited: its line 348 ("`HostServices.mutator` is absent until then (P2.9)") names the member the quarry's `services.ts:24` declares and P6.3 restores, and it stays true after this item. Readings A (with the additions above), C, D and G are confirmed with the corrections below; B is corrected on three members; E is answered from the file; F gets the exact string. Nothing here is the owner's: the plan row (line 233) names every file, D6 allows an advisor-approved contract item, and the P1.8 ruling (`docs/plans/STATUS.md:723`) already assigned the protocol event to P2.9.

WHY: The brief describes the tree accurately: `npx tsc --noEmit` on the byte-identical copy reports 36 errors, 33 in `handlers.ts` (`:120` wraps an already-shaped chunk and expects a bare `InstalledResult`; `:140,147,154` read origin fields off `{ kind: 'project', chunk }`; `:161-168` use `sources`/`source` where ADR-007's naming rule gives `sourceUrls`/`sourceUrl`; `:170,177,178,185,309` call `resolvedSources`/`sourceHealth`/`resetSourceHealth`, which P2.8 dropped until P4.9; `:176,192,205,221` pass `string | undefined` to `catalog.sources(projectDir)`), 2 in `SidebarHost.ts` (`:86,108`, the same two causes) and 1 in `services.ts:11` (`../core/project/mutator`, a P6.3 module). D6 (plan line 50) and the recorded P1.8 ruling make P2.9 the item for the protocol event, and ADR-009 decision 4 ("the host decides which directory") plus ADR-005:19-20 ("sources are resolved per project directory") decide the `sources/list` directory: the directory of the selected project, not its workspace folder as the quarry does. ADR-007 ("exactly one terminal response (ok or error) per id") makes an error envelope a terminal response, so a gated read answering `unsupported` counts toward the gate, and ADR-009 decision 8 fixes that mapping. N9 is live in the quarry and inside this item's files: `WebviewHost.detach()` (`:76-83`) aborts every in-flight controller and `awaitTicket` (`:40`) turns any abort into `ticket.cancel()`, so closing the sidebar cancels the user's queued install; Node 18.15 has `AbortController.abort(reason)` and `signal.reason` (since 17.2), so the fix stays inside D10. The plan row says "CSP per ADR-006 (+`font-src`, nonce)" while ADR-006 still reads `script-src ${cspSource}` and names no `font-src`; approving the code without the ADR sentence would create the contract/ADR mismatch that plan §2.3 makes a stop-and-ask for the next reader, so ADR-006 is on the sentinel list. Plan §3 step 5 forbids `Thenable` outside `contracts.ts`; `WebviewHost.ts:45` has one.

DO:

1. N42 order. Paste this answer verbatim under `## Advisor decisions` in `docs/plans/STATUS.md` as `### P2.9 — contract approval and rulings for src/host (2026-10-12)` and into the new `src/host/STATUS.md`; set the P2.9 tracker row to `in-progress` and add to it: "frozen files edited under the advisor approval of 2026-10-12 (sentinel `P2.9`): `src/protocol/messages.ts`, `src/protocol/domain.ts`, `src/protocol/protocol.test.ts`, `docs/protocol.md`, ADR-002, ADR-006, ADR-008; `src/core/contracts.ts` unchanged". Only then create `.claude/.contract-change` with content exactly `P2.9`. Make the edits of steps 2 to 6, run `npm run docs:protocol`, delete the sentinel, then do the rest of the item. The hook denies `git commit` while the sentinel exists.

2. `src/protocol/messages.ts`. In the type import list (lines 13-35) insert `ResourceKey,` after `QuickSearchSourceResult,`. Replace line 186 with these two lines:
```ts
    /** The coordinator's `InvalidationEvent` forwarded unchanged (ADR-002). `generation` is the event's sequence number and is not comparable with a response's generation; `keys` lists every key the coordinator has seen that `scope` reached, with its generation after this invalidation, which is what an ok response for that key carries. A key absent from `keys` was never queried. */
    'resources/invalidated': { scope: InvalidationScope; reason: InvalidationReason; generation: number; keys: Array<{ key: ResourceKey; generation: number }> };
```
No change to `src/protocol/guards.ts` (no new type) and no new `ProtocolErrorCode`.

3. `src/protocol/domain.ts`. Replace lines 329-336 with:
```ts
export interface ExtensionConfig {
    searchDebounceMode: 'quicksearch' | 'fullsearch';
    quickSearchResultsPerSource: number;
    searchResultLimit: number;
    /** `nuiget.enablePerformanceLogging`: the webviews send `perf/mark` and the host logs `[perf]` lines at `info` only while it is on. */
    enablePerformanceLogging: boolean;
    treeIndent: number;
    isWindows: boolean;
}
```
"Keeps" in the row is relative to the 1.x setting: `package.json:286` already contributes `nuiget.enablePerformanceLogging` (default `false`), the quarry's `readExtensionConfig` (`services.ts:40-51`) does not read it, and the domain type lacks it, so both gain it. No request named `search/recent` exists in `RequestMap` (43 requests, `messages.ts:106-174`), so dropping `recentSearchesLimit` touches no request; `package.json` keeps contributing `nuiget.recentSearchesLimit` for 1.x until P8.2 (a `contributes` change is not P2.9's). N43: replace line 21 with the ledger's text, exactly:
```ts
    /** For floating versions: the position of the wildcard counted in fixed components (`1.*` = 1 major, `1.0.*` = 2 minor, `1.0.0.*` = 3 patch; 0 for `*`; 4 for a prerelease wildcard such as `1.0.0-*`). */
```

4. `docs/adr/002-query-coordinator.md`. Line 3 becomes `Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: scope and merge tables, source keys per project directory, generation on responses; plan item P2.9: per-key generations on `resources/invalidated`)`. Replace the bullet at lines 56-59 with:
```md
- The host broadcasts `resources/invalidated { scope, reason, generation, keys }`, the coordinator's
  `InvalidationEvent` forwarded unchanged: `generation` is the event's sequence number, and `keys`
  lists every key the coordinator has seen that `scope` reached, each with its generation after the
  invalidation. Each webview re-requests only the resources it currently displays. Both surfaces
  requesting the same key share one computation. A webview compares the `generation` of an ok
  response envelope with the generation listed for the same key in the latest event, never with the
  event's own `generation` (ADR-007, ADR-008).
```

5. `docs/adr/008-webview-architecture.md`. Line 3 becomes `Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: generation on responses; plan item P2.9: per-key generations on `resources/invalidated`)`. Replace lines 20-23 (from "`request` exposes" to "Chunks are discarded by id only.") with:
```md
  `request` exposes the `generation` of the ok response, so `useResource` can discard a result whose
  generation is below the one listed for its key in the latest `resources/invalidated` event
  (`keys[].generation`; the event's own `generation` is a sequence number and is never compared with
  a response). A key absent from `keys` has nothing to discard. Chunks are discarded by id only.
```

6. `docs/adr/006-icons-and-csp.md`. Line 3 becomes `Status: accepted · Date: 2026-10-10 · Amended: 2026-10-12 (plan item P1.1b: the `readme/image` request; plan item P2.9: script nonce and `font-src`)`. In the second Decision bullet replace the first sentence (`Webview CSP: ... connect-src 'none'`.) with:
```md
- Webview CSP: `default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource};
  font-src ${cspSource}; script-src 'nonce-${nonce}'; connect-src 'none'`. The nonce is 16 bytes from
  `crypto.randomBytes`, base64-encoded and fresh for every render; `font-src` admits the bundled fonts
  and nothing remote; styles are set through the CSSOM (React's `style` prop), never as `<style>` or a
  `style` attribute in rendered HTML.
```
The rest of the bullet (README images through `readme/image`) stays. Run `npm run docs:protocol`, confirm `git diff --name-only -- src/protocol src/core/contracts.ts docs/adr` lists exactly `src/protocol/messages.ts`, `src/protocol/domain.ts`, `src/protocol/protocol.test.ts`, `docs/adr/002-query-coordinator.md`, `docs/adr/006-icons-and-csp.md`, `docs/adr/008-webview-architecture.md` (plus `docs/protocol.md` outside that path), then delete the sentinel.

7. `src/protocol/protocol.test.ts`, two cases: `resources/invalidated carries per-key generations` (build the event with `makeEvent('resources/invalidated', { scope: { kind: 'workspace' }, reason: 'manual-refresh', generation: 3, keys: [{ key: resourceKeys.projects(), generation: 2 }] })`, assert `parseOutbound` accepts it and `payload.keys[0].generation === 2`) and `ExtensionConfig has enablePerformanceLogging and no recentSearchesLimit` (a literal `satisfies ExtensionConfig` with the six members; assert `'recentSearchesLimit' in config` is false). Do not import `src/core` from a protocol test: the assignability of the core `InvalidationEvent` to the event payload is proved by step 11 (`notifyInvalidated(event: InvalidationEvent)` compiles).

8. `src/host/services.ts`. `HostServices` after P2.1 to P2.8:
```ts
export interface HostServices {
    readonly context: vscode.ExtensionContext;
    readonly logger: Logger;
    readonly session: SessionStore;
    readonly catalog: Catalog;
    readonly queue: OperationQueue;
    readonly workflows: PackageWorkflows;
    readonly sources: SourceProvider;
    /** Fired after any operation completes (either surface); hosts forward it as `ops/completed`. */
    readonly onOperationCompleted: Event<OperationOutcome | BulkOutcome>;
    /** `queue.onProgress`; hosts forward it as `ops/progress`. */
    readonly onOperationProgress: Event<OperationProgress>;
    readonly onConfigChanged: Event<ExtensionConfig>;
    readonly onProjectsChanged: Event<Project[]>;
    invalidate(scope: InvalidationScope, reason: InvalidationReason): void;
    announceOperation(outcome: OperationOutcome | BulkOutcome): void;
    config(): ExtensionConfig;
    /** Workspace folder (fsPath) containing `projectPath`, or the first folder when none is given; `undefined` without a workspace. */
    workspaceFolderFor(projectPath?: string): string | undefined;
}
```
`Event<T>` is the core type from `../core/contracts` (what `Emitter.event` and `queue.onProgress` already are). Dropped: `mutator` (P6.3 restores it under that name) and `output` (no file under `src/host` reads it; the composition root owns the channel). `readExtensionConfig()` stays in this file and is the one place that reads `vscode.workspace.getConfiguration('nuiget')`: remove `recentSearchesLimit`, add `enablePerformanceLogging: config.get<boolean>('enablePerformanceLogging', false)`; keep the `'fullsearch'` mapping (see N57 in step 16). `createNonce()` becomes `return randomBytes(16).toString('base64');` with `import { randomBytes } from 'crypto';`; delete the alphabet loop. The CSP array becomes `"default-src 'none'"`, `` `img-src ${webview.cspSource} data:` ``, `` `style-src ${webview.cspSource}` ``, `` `font-src ${webview.cspSource}` ``, `` `script-src 'nonce-${nonce}'` ``, `"connect-src 'none'"` joined by `'; '`, and the meta tag is `content="${csp}"` without the trailing `;`. Add the workflow-deps factory here (P2.10 calls it):
```ts
export function createWorkflowDeps(deps: { runner: DotnetRunner; catalog: Catalog; inspector: ProjectInspector; queue: Pick<OperationQueue, 'onDidChange'>; logger?: Logger; onCommand?: WorkflowDeps['onCommand'] }): WorkflowDeps
```
with `packageDependencies: p => deps.catalog.packageDependencies(p)`, `projectDependencies: ps => deps.catalog.projectDependencies(ps)`, and `isCpmProject` memoized in a `Map<string, Promise<boolean>>` keyed by `normalizeProjectPath(projectPath)` (`src/core/util/paths`): on a miss it stores `deps.inspector.inspect(projectPath).then(result => { if (result.unsupported) { throw new Error(result.unsupported.message); } return result.isCpm; })`, deletes the entry again when that promise rejects (a failed read is not memoized), and clears the whole map from `deps.queue.onDidChange` whenever `active === 0`, so the memo lives for one running operation. The throw for `unsupported` is deliberate: `WorkflowDeps.isCpmProject` (`PackageWorkflows.ts:30`) says a rejection refuses the edit, and it is the one place the host keeps an `install`/`update` off a packages.config or non-SDK-style project (`admitEdit` gates only on SDK and CPM). Keep `HostEvents`, `loggerFor`, `projectDisplayName`, `escapeHtml`.

9. `src/host/WebviewHost.ts`. (a) `WebviewLike.postMessage(message: unknown): PromiseLike<boolean> | boolean | void` (`vscode.Webview.postMessage` is structurally a `PromiseLike`). (b) `detach()` calls `entry.controller.abort('disposed')`; the `cancel` branch of `receive()` calls `entry.controller.abort('cancelled')`; both aborted branches of `dispatch` pick the code as `controller.signal.reason === 'disposed' ? 'disposed' : 'cancelled'` (the `disposed` flag is no longer consulted there). (c) `toProtocolError`: before the generic `Error` branch add `if (error instanceof Error && (error as { code?: unknown }).code === 'not-yet-available') { return { code: 'unsupported', message: error.message }; }` so that no host file imports `NotYetAvailableError` and the mapping keys on the `code` field as the P2.8 ruling requires.

10. `src/host/handlers.ts`. Keep `requireProject`, `rejectedOutcome`, `rejectedBulk`, `workflowOptions`, `affectedScope`, `invalidateAfter`, `tryParseUrl`. Add and export:
   - `sourceDirectory(services): string`: `path.dirname(selectedProject)` when `selectedProject` is set and not `ALL_PROJECTS`; else `services.workspaceFolderFor()`; else `throw new HostRequestError('not-found', 'No project or workspace folder to resolve package sources for')` (the payload is valid; what is missing is state). It replaces every `workspaceFolderFor(session.snapshot.selectedProject)` argument to `catalog.sources` and the `cwd()` of the four source mutations; the `?? process.cwd()` fallback at `:196` goes.
   - `operations`: one typed submit function per `ops/*` request, `install(services, payload)`, `update`, `remove`, `restore`, `bulkInstall`, `bulkUpdate`, `bulkRemove`, `bulkUpdateAllProjects`, `bulkRemoveAllProjects`, each taking `RequestPayload<'ops/…'>`, validating (`requireProject`; the empty guards below), snapshotting `workflowOptions(services)` and returning `queue.submit(label, run, (reason, opId) => rejectedOutcome(opId, …))` or `(reason, opId) => rejectedBulk(opId, reason)`. Every `rejected` builder uses the `opId` parameter; the quarry's literal `'rejected'` (`:128,234,242,250,260,271,279,287,294,301`) is the C-ops-5 defect on the host side.
   - `settleOperation(services, ticket)`: `const outcome = await ticket.completion; services.announceOperation(outcome); invalidateAfter(services, outcome); return outcome;`.
   - `awaitTicket(ticket, services, { signal, emit? })`: forwards `services.onOperationProgress` reports with the ticket's `opId` to `emit` when `emit` is given, emits the opening `{ opId, status: 'rejected' | 'queued' }` chunk through `emit` likewise, cancels the ticket on abort only when `signal.reason !== 'disposed'` (N9: a surface that closes does not cancel its queued operation; the outcome still reaches the other surface through `announceOperation`), and ends with `return settleOperation(services, ticket)`.
   Request handlers: `host.on('ops/install', (payload, ctx) => awaitTicket(operations.install(services, payload), services, { signal: ctx.signal, emit: ctx.emit }))` and the same for the other eight. Empty guards, all `throw new HostRequestError('invalid-request', …)` before anything is submitted (no opId exists and no `ops/completed` is sent for a client bug): `ops/bulkUpdate` and `ops/bulkRemove` with `packages.length === 0` → `'No packages selected'`; `ops/bulkUpdateAllProjects` and `ops/bulkRemoveAllProjects` filter their entries to those with a real project (`requireProject` semantics) and `packages.length > 0` and throw `'No packages selected'` when nothing remains; `ops/restore` and `ops/bulkInstall` keep the quarry's `'No projects to restore'` / `'No projects selected'`. Other handlers:
   - `installed/get`: `const { result, upgrade } = await catalog.installed(requireProject(projectPath), chunk => ctx.emit(chunk), ctx.signal); return upgrade ? await upgrade : result;` ("the final result": equal to `result` today because P2.10 composes no evaluator, and the authoritative result when P6.2 adds one; P6.2 adds the provisional chunk).
   - `transitive/get`: when `forceRestore`, `const outcome = await awaitTicket(operations.restore(services, { projectPaths: [project] }), services, { signal: ctx.signal })` (no `emit`: the request declares no chunk; progress reaches the webview as the `ops/progress` event); `if (outcome.status === 'rejected') { throw new HostRequestError('failed', outcome.message ?? 'Restore was not admitted'); }`; a `failed` or `partial` restore still returns `catalog.transitive(project, ctx.signal)`, whose `dataSourceAvailable`/`errorKind` say what is on disk. This is Y3 and C-protocol-host-4.
   - `allProjects/installed|updates|transitive`: `catalog.allProjectsX(chunk => ctx.emit(chunk), ctx.signal)`; the Catalog already emits the protocol chunk types (ADR-009 decision 2).
   - `search/query`: `const r = await catalog.search({ query: payload.query, sourceUrls: payload.sourceUrls, includePrerelease: payload.includePrerelease, take: payload.take ?? services.config().searchResultLimit, exactMatch: payload.exactMatch }, packages => ctx.emit({ kind: 'metadata', packages }), ctx.signal); return { query: payload.query, results: r.results, sourcesUnavailable: r.sourcesUnavailable };`. `package/versions|metadata|readme` pass `payload.sourceUrl`.
   - `readme/image` (the 43rd request, not in the quarry): `async ({ url }) => ({ url, dataUri: null }) // REMOVAL GATE: P4.4` (ADR-006: `null` means the webview renders a link).
   - `package/prewarm`: `async () => ({}) // REMOVAL GATE: P4.9`.
   - `sources/list`: `{ sources: await catalog.sources(sourceDirectory(services), ctx.signal), failed: [] } // REMOVAL GATE: P4.9`, no `health` chunk; `sources/refresh`: `services.invalidate({ kind: 'sources' }, 'manual-refresh')` then the same, with `// REMOVAL GATE: P4.9` where `resetSourceHealth` was; `refresh/all`: only `services.invalidate({ kind: 'workspace' }, 'manual-refresh')` with the same comment. Four `REMOVAL GATE: P4.9` comments in this file.
   - `perf/mark`: the `[perf]` line goes to `logger.info` when `services.config().enablePerformanceLogging`, else `logger.debug`.
   - `session/*`, `config/get`, `layout/*`, `sources/configFiles`, the four source mutations (with `sourceDirectory`), `ui/copyToClipboard`, `ui/openExternal`: as the quarry has them.

11. `src/host/SidebarHost.ts` and `src/host/MainPanelHost.ts`. The hack (C-protocol-host-3): `SidebarHost.runOperation` (`:222-225`) fabricates `{ kind: 'request', id: 'chrome-<time>', type, payload: Record<string, unknown> }` and feeds it to `receive()`, so the terminal response is posted to the webview for an id it never issued, the payload is untyped, and the cancel and progress wiring are bound to a `RequestContext` nobody owns. Typed form: delete `runOperation`; in `showContextMenu` call `await settleOperation(this.services, operations.install(this.services, { projectPath, packageId, version, sourceUrl }))` (and `update`, `remove`, `bulkInstall` likewise, with the payload type of the request); the outcome reaches the webview as `ops/completed`, progress as `ops/progress`. `showSourcePicker` uses `catalog.sources(sourceDirectory(this.services))`; `refresh()` drops `resetSourceHealth` under `// REMOVAL GATE: P4.9`. Both hosts: `notifyInvalidated(event: InvalidationEvent)` (type import from `../core/contracts`) passing `event` to `sendEvent('resources/invalidated', event)` unchanged; this compiling is the proof that the protocol shape of step 2 matches the core shape. `MainPanelHost` otherwise unchanged (the 150 ms flush stays). `pickers.ts` unchanged.

12. `src/host/handlers.test.ts` (backend project; `vscode` is aliased to the mock, whose webview has `cspSource: 'https://mock-csp-source'`). A `TestHost extends WebviewHost` with a recording `WebviewLike`, `registerSharedHandlers(host, services)` over fakes: a fake `SessionStore`, a fake `Catalog` object cast to `Catalog` whose feed methods throw `new NotYetAvailableError('x')` (import from `../core/catalog`, test only), a fake `PackageWorkflows` cast to its type, the real `DefaultOperationQueue` from `../core/ops`, `createMockExtensionContext()`. Titles the gate reads:
   - `it.each(REQUEST_TYPES)('%s: one request → exactly one terminal response')` (43 cases, the "≥ 42 request cases" gate), each with a valid payload fixture: assert exactly one `response` envelope for the id, and that `ui/contextMenu`, `ui/openSourceSettings`, `ui/viewPackage` on the bare registrar and the eight gated feed reads answer `error.code === 'unsupported'`.
   - `requireProject rejects ALL_PROJECTS` (`installed/get`, `transitive/get`, `ops/install`, `ops/bulkUpdate` with `ALL_PROJECTS` → `invalid-request`; the workflow fake never called).
   - `ops/*: a refused submission answers with the ticket's rejected outcome (Y2)` (seven submissions on a workflow fake that never resolves until released; the seventh ok response has `status: 'rejected'` and `opId` equal to the ticket's, not `'rejected'`).
   - `ops/*: the outcome is announced and invalidation follows the edit` (`announceOperation` called once with the outcome; `invalidate` with `{ kind: 'project' }` then `{ kind: 'metadata' }`).
   - `transitive/get: forceRestore runs through the queue as PackageWorkflows.restore (Y3)` (workflows.restore called with `[project]` via a `run` whose `opId` is the ticket's; `catalog.transitive` called after it; a refused ticket → `failed` error envelope).
   - `ops/bulk*: an empty batch never reaches the workflow` (`invalid-request` for the four shapes above; workflow fakes not called).
   - `installed/get answers with the final result` (`{ result: provisional, upgrade: Promise.resolve(authoritative) }` → the ok result is `authoritative`; without `upgrade` it is `result`; metadata chunks forwarded unchanged).
   - `feed reads answer unsupported while the Catalog is gated`.
   - `sources/list resolves the selected project's directory` (`catalog.sources` receives `path.dirname(selectedProject)`; with `ALL_PROJECTS` the first workspace folder; with neither → `not-found`; `failed` is `[]`).
   - `surface disposal does not cancel a queued operation (N9)` (submit on a blocked queue, `detach()`, assert `ticket.cancel` was not called and the outcome is still announced; a `cancel` envelope does cancel).
   - `resources/invalidated forwards the coordinator event unchanged` (an `InvalidationEvent` with `keys` → the event envelope's payload `toEqual` it).
   - `renderWebviewHtml: CSP per ADR-006 with font-src and a fresh nonce`: read `nonce` from `<script nonce="…"`, assert it matches `/^[A-Za-z0-9+/]{22}==$/`, assert the meta attribute equals exactly `default-src 'none'; img-src https://mock-csp-source data:; style-src https://mock-csp-source; font-src https://mock-csp-source; script-src 'nonce-${nonce}'; connect-src 'none'`, and that a second render has a different nonce.
   - `createWorkflowDeps: isCpmProject is asked once per project per operation` (two calls for the same path → one `inspect`; `onDidChange({ active: 0, pending: 0 })` → asked again; an `unsupported` inspection rejects with its message; a rejected read is not memoized).
   - `SidebarHost: a context-menu action submits a typed operation and never fabricates a request` (`window.showQuickPick` mocked to `{ action: 'uninstall' }`; `queue.submit` called with the `remove` label; no `response` envelope posted to the webview; `announceOperation` called).
   `src/host/WebviewHost.test.ts`: the seven quarry tests stay as they are (the `detach` test at `:77` still holds: reads abort, nothing is posted); add `detach aborts with reason disposed and cancel with reason cancelled` and `an error whose code is not-yet-available answers unsupported`.

13. Gates, in the plan's order (§2.2 step 5): `npx tsc --noEmit`, `npx eslint src`, `npx vitest run --project backend src/host --reporter=verbose`, `npx vitest run --project backend src/protocol`, `npm test`, `npm run bench`, `npm run package:vsix` (host item), `npm run docs:protocol:check`, `npm run check:vsix`. `npm run test:ui`: SKIPPED with the literal reason if the environment lacks a display.

14. Docs. CHANGELOG `## [Unreleased]`: `### Added` one line `**2.0 webview hosts** — src/host answers every request of the 2.0 panel and sidebar with exactly one response, runs every package operation and forced restore through the operation queue, keeps a queued operation alive when the surface that asked for it closes, and serves both webviews under a Content Security Policy with a per-render script nonce and no remote origin`; `### Changed` two headlines, `**resources/invalidated carries per-key generations**` and `**Webview CSP uses a script nonce and admits bundled fonts**`. ARCHITECTURE.md 2.0 section: replace the `src/host/**` placeholder row (line 99) with the description of `WebviewHost` (one terminal response, abort reasons, `not-yet-available` → `unsupported`), `handlers.ts` (`operations`, `settleOperation`, `awaitTicket`, `sourceDirectory`, the REMOVAL GATE lines), `services.ts` (`HostServices`, `readExtensionConfig`, `renderWebviewHtml`, `createWorkflowDeps`), the two hosts and `pickers.ts`, status "Present since P2.9; composed by P2.10"; update the status cells of the rows at lines 87-88 and 94 that say "the host supplies `isCpmProject` in P2.9", "the host submits to it in P2.9" and "the host calls it from P2.9" to "done in P2.9". copilot-instructions 2.0 gotchas: one row `REMOVAL GATE comments in src/host` ("`handlers.ts` carries four `// REMOVAL GATE: P4.9` lines and one `P4.4`; `SidebarHost.refresh` one `P4.9`; P4.9/P4.4 remove them, nobody else").

15. Ledger (`docs/plans/findings-ledger.md`): Y2 → `closed (P2.9: every ops/* request is answered from the ticket; test ops/*: a refused submission answers with the ticket's rejected outcome (Y2))`; Y3 → `closed (P2.9: forced and explicit restores are PackageWorkflows.restore on the queue; test transitive/get: forceRestore runs through the queue as PackageWorkflows.restore (Y3))`; C-protocol-host-3 → `closed (P2.9: operations + settleOperation, runOperation deleted)`; C-protocol-host-4 → `closed (P2.9)`; C-protocol-host-5 → `closed (P2.9: handlers.test.ts, 43 request cases)`; N9 → `closed (P2.9: detach aborts with reason 'disposed'; awaitTicket cancels the ticket only for a webview cancel; test surface disposal does not cancel a queued operation (N9))`; N43 → `closed (P2.9: comment at domain.ts:21)`; S6 → `CSP side done in P2.9 (ADR-006 policy in renderWebviewHtml, data: only); closes at P4.4 with the host-side icon fetch`; C-protocol-host-1 stays open (P2.10).

16. New finding N57 (Low), record only: `package.json:257-270` enumerates `nuiget.searchDebounceMode` as `quicksearch | full | off`, the frozen `ExtensionConfig.searchDebounceMode` is `'quicksearch' | 'fullsearch'`, and `readExtensionConfig` maps only `'fullsearch'`, so a user's `full` or `off` becomes `quicksearch` in 2.0. Owner of the fix: the item that ports search settings (P5, with a `contributes` ⚑ and a `domain.ts` sentinel if the type changes). P2.9 keeps the quarry's mapping.

17. Tracker notes. P2.10: "compose with `createWorkflowDeps` from `src/host/services.ts`; `onOperationProgress` is `queue.onProgress`; forward `coordinator.onDidInvalidate` to both hosts' `notifyInvalidated` unchanged; `HostServices` has no `output` and no `mutator`". P4.9: "remove the four `REMOVAL GATE: P4.9` lines of `src/host/handlers.ts` (`sources/list` `failed: []`, `sources/refresh`, `package/prewarm`, `refresh/all`) and the one in `SidebarHost.refresh`". P4.4: "`readme/image` handler replaces the `dataUri: null` placeholder (`REMOVAL GATE: P4.4`); S6 closes". P5.7: "the README sanitizer strips `<style>` and `style` attributes: the CSP of ADR-006 has no `'unsafe-inline'`". P3.3: unchanged. P6.2: unchanged. P6.3: unchanged. Then P2.9 → `done` with the gate output, `src/host/STATUS.md` from the §2.5 template, commit with the `git-commit` skill citing P2.9, ADR-002, ADR-006, ADR-007, ADR-008, ADR-009, Y2, Y3, N9, N43, C-protocol-host-3/-4/-5, S6 (partial), N57 (recorded).

DO NOT:
- Do not create the sentinel before this answer is pasted into the tracker (N42), and do not commit while it exists.
- Do not edit `src/core/contracts.ts`, `src/protocol/guards.ts`, `docs/adr/README.md` or `package.json` `contributes` in this item; do not add a `ProtocolErrorCode`, a chunk kind on `installed/get` or `transitive/get`, or a `resourceKeys` entry.
- Do not stub `src/core/project/mutator`, `src/core/feeds` or an evaluator; do not re-add `resolvedSources`, `sourceHealth` or `resetSourceHealth` to the Catalog.
- Do not pass a workspace folder or `process.cwd()` to `catalog.sources`; do not let the host guess a directory.
- Do not pass the literal `'rejected'` as an `opId`; use the builder's second parameter.
- Do not cancel a ticket from `detach()`; only a webview `cancel` envelope cancels.
- Do not keep `runOperation` or any fabricated request envelope; do not post a response for an id the webview did not issue.
- Do not emit `OperationProgress` chunks on `transitive/get`; its progress travels as the `ops/progress` event.
- Do not answer an empty batch with a `rejected` outcome or an `ops/completed` event; it is an `invalid-request` error envelope.
- Do not use `Math.random` for the nonce, a trailing `;` inside the CSP attribute, `'unsafe-inline'` in `style-src`, or `Thenable` anywhere under `src/host`.
- Do not import `NotYetAvailableError` into a host source file; the base maps the `code` field.
- Do not import `src/core` from `src/protocol/protocol.test.ts`.
- Do not skip, delete or weaken any of the seven `WebviewHost.test.ts` tests or any protocol test; the changed shapes get new cases.

CONTRACT CHANGE: `src/protocol/messages.ts` (lines 13-35 import, line 186 member), `src/protocol/domain.ts` (lines 21 and 329-336), `src/protocol/protocol.test.ts` (two new cases), `docs/protocol.md` (regenerated by `npm run docs:protocol`), `docs/adr/002-query-coordinator.md` (line 3 and lines 56-59), `docs/adr/006-icons-and-csp.md` (line 3 and the CSP bullet), `docs/adr/008-webview-architecture.md` (line 3 and lines 20-23): item P2.9, sentinel `.claude/.contract-change` with content `P2.9`, created after step 1 and deleted after step 6, before any other work and before the commit. `src/core/contracts.ts` does not change in P2.9. Any further frozen edit is a new stop-and-ask.

VERIFY:
- `npx tsc --noEmit` → exit 0; `npx eslint src` → exit 0, no output.
- `npx vitest run --project backend src/host --reporter=verbose` → green; the output lists 43 lines matching `one request → exactly one terminal response` and the titles `requireProject rejects ALL_PROJECTS`, `ops/*: a refused submission answers with the ticket's rejected outcome (Y2)`, `transitive/get: forceRestore runs through the queue as PackageWorkflows.restore (Y3)`, `ops/bulk*: an empty batch never reaches the workflow`, `installed/get answers with the final result`, `surface disposal does not cancel a queued operation (N9)`, `renderWebviewHtml: CSP per ADR-006 with font-src and a fresh nonce`, `createWorkflowDeps: isCpmProject is asked once per project per operation`; the seven quarry titles of `WebviewHost.test.ts` still present.
- `npx vitest run --project backend src/protocol` → 13 tests green (11 + 2).
- `npm run docs:protocol:check` → exit 0; `grep -c "keys: Array<{ key: ResourceKey; generation: number }>" docs/protocol.md` → 1; `grep -c recentSearchesLimit src/protocol/domain.ts src/host/services.ts docs/protocol.md` → 0 each.
- `grep -rn "Thenable\|process.cwd\|Math.random\|chrome-\|'rejected', reason\|resetSourceHealth\|resolvedSources\|sourceHealth" src/host --include='*.ts'` → no output; `grep -c "REMOVAL GATE: P4.9" src/host/handlers.ts` → 4; `grep -c "REMOVAL GATE: P4.4" src/host/handlers.ts` → 1; `grep -c "REMOVAL GATE: P4.9" src/host/SidebarHost.ts` → 1; `grep -rn "mutator" src/host --include='*.ts'` → no output.
- `git diff --name-only 4982d16 -- src/protocol src/core/contracts.ts docs/adr` → exactly `docs/adr/002-query-coordinator.md`, `docs/adr/006-icons-and-csp.md`, `docs/adr/008-webview-architecture.md`, `src/protocol/domain.ts`, `src/protocol/messages.ts`, `src/protocol/protocol.test.ts`; `ls .claude/.contract-change` → No such file or directory before the commit.
- `npm test` green (79 files + the new host tests), `npm run bench` green, `npm run package:vsix` exit 0, `npm run check:vsix` → OK; CI green on all required jobs before the next item.

Files checked: `.github/agents/architecture-advisor.agent.md`; plan §1-§3 (lines 28-159) and rows P2.1, P2.8, P2.9, P2.10, P3.3, P4.9, P6.2, P6.3 (lines 225-250, 407); `docs/plans/STATUS.md` rows P1.1b, P1.8, P1.fix-1, P2.1, P2.8, P2.9, P2.10, P3.3, P4.9, P6.2, P6.3 and the P1.8 (lines 556-723) and P2.8 (lines 730-828) rulings; `docs/plans/findings-ledger.md` lines 42-45, 111, 145, 180-193, 329, 368, 379-381, 417-428; `docs/adr/002:1-12,50-64`, `006` (whole), `007` (whole), `008:1-13,14-30`, `009` (whole), `005:8-21`; `git show dd1ed73 -- docs/adr/002 docs/adr/008` (amendment form); `src/host/{WebviewHost,services,handlers,SidebarHost,MainPanelHost,pickers,WebviewHost.test}.ts` (all lines) and `npx tsc --noEmit` / `npx eslint src/host` on the working tree (36 errors as the brief states; eslint clean); `src/protocol/messages.ts:1-40,100-199`, `domain.ts:15-25,300-336`, `envelope.ts:13-23`, `guards.ts:20-108`, `index.ts`, `protocol.test.ts` titles; `src/core/contracts.ts` (all lines); `src/core/catalog/{Catalog.ts (1-135,176-335),index.ts,STATUS.md}`; `src/core/ops/PackageWorkflows.ts:1-60,195-215`, `OperationQueue.ts:38-51,87-107,210-222`; `src/core/project/index.ts`, `inspector.ts` (no cache); `src/core/util/events.ts`; `src/test/__mocks__/vscode.ts:1-60,161-215,272-332,380`; `package.json:248-295,304-317`; `.claude/settings.json`, `scripts/hooks/guard.mjs:9,55-75`; `eslint.config.mjs:10-60`; `vitest.config.mts` projects; `scripts/gen-protocol-docs.mjs:43-111`; `docs/protocol.md:20,68,72`; `ARCHITECTURE.md:10,87-99,135`; `CHANGELOG.md:1-25`; `src/extension.next.ts` (13-line placeholder).
`````

## Exact next step (one item ID)

P2.10 (replace the placeholder `src/extension.next.ts` with the composition root). Notes for it are on its
tracker row: compose with `createWorkflowDeps`, `onOperationProgress` is `queue.onProgress`, forward
`coordinator.onDidInvalidate` to both hosts' `notifyInvalidated` unchanged, `HostServices` has no `output` and
no `mutator`, and reconcile the session with the newly selected project's source URLs right after the
`selectedProject` intent (P1.7 ruling).

## Advisor decision: P4.9 — stop-and-ask: wiring the feeds (2026-10-16), verbatim

`````text
DECISION: Split P4.9 into two tracker rows, P4.9a and P4.9b, both approved here; P4.9a is a contract-change item for one frozen file, `docs/adr/009-catalog.md`, sentinel content `P4.9a`. The shape: (e-i) one `FeedClients` object built by `createFeedClients(...)` in `src/core/catalog/feedClients.ts` plus a `FeedContexts` registry (`src/core/catalog/feedContexts.ts`) keyed by the effective `nuget.config` chain, both handed to the Catalog; (a-i) sharpened: project-scoped reads reach their chain through `ProjectContextProvider.get`, project-less reads take a `directory` argument from the host (`sourceDirectory(services)`), no protocol change; (b) `package/versions` and `package/metadata` for `'all'` are fan-outs over per-source coordinator resources (`resourceKeys.versions(id, source.url, pre)`, `resourceKeys.metadata(id, v, source.url)`), merged in the Catalog, the `'all'` keys never written (N70 closes); (c-i) `Catalog.readmeImage` lands in P4.9a together with the ADR-009 amendment under the sentinel; (d) `package/versions` with no versions and `sourcesUnavailable` is a `failed` error envelope, mapped in the handler; an incomplete answer (`sourcesUnavailable`, `offline`, or no metadata) is delivered but never cached, by rejecting the compute with a carrier error that `queryWithRetry` unwraps with its generation; (f) the root's `ActivationOverrides` gains `transport?: Transport` and the harness passes a scripted `FakeTransport`; (g) of the P2.8 list, `sourceHealth()` and `IconResolver.reset()` in `invalidate` return, `resetSourceHealth` is folded into `invalidate` (ADR-009 d.6), `resolvedSources` is not re-added (no request maps to it), enrichment of `installed/get` is deferred to P6.2 with the provisional chunk, and the installed views ask `transitive/metadata` meanwhile; `allProjects/installed` gets its `metadata` chunks in P4.9b. Nothing here is `OWNER MUST DECIDE`.

WHY: The brief describes the tree accurately: the nine Catalog gates (`src/core/catalog/Catalog.ts:189,197,251,283,287,291,295,299,308`), the five in `src/host/handlers.ts` (`:303,304,309,317,385`), `src/host/SidebarHost.ts:110`, the root's three (`src/extension.next.ts:72,205,274`), `CatalogDeps` without a feed member (`Catalog.ts:32-43`), every client of P4.3-P4.8 exported from `src/core/feeds/index.ts`, `NodeTransport` with `ProxyState` and `reset()` (`src/core/http/Transport.ts:27-30,344-350`), and `DefaultCredentialProvider` wanting `lookupConfigCredential` (`src/core/credentials/DefaultCredentialProvider.ts:19-22`). Five facts decide the design. (1) The coordinator never caches a rejected computation (`src/core/queries/QueryCoordinator.ts:321-348`: only `outcome.ok` reaches `store`; the error clears `entry.current` and rejects every attached handle), and it has no TTL (a value lives until `invalidate` or eviction), so "delivered but not cached" is a rejection that carries the value, unwrapped by the Catalog with the handle's still-valid `generation`; the alternative, invalidating after the fact, would list a bumped generation in `resources/invalidated` and make the webview drop the very response the host just sent (ADR-008). (2) `scopeMatchesKey` reaches `versions:<id>|<anything>` and `metadata:<id>@<anything>` by the id alone and every `versions:`/`metadata:` key by kind for `sources` (`src/core/queries/scopes.ts:51-62`), and a source's answer does not depend on the project: one coordinator query per allowed source makes the cache correct across projects by construction, which is the "explicit `sourceUrl`" option of the P4.8 ruling realised inside the Catalog, with no frozen key change and no invalidation from inside a read. (3) Chunks precede the terminal response (ADR-007, `src/protocol/envelope.ts`) and `installed/get` has no provisional chunk until P6.2 (ADR-009 d.3), so enriching inside `computeInstalled` would hold the first thing either surface can render until every icon is fetched; `transitive/metadata` takes `{ packages }` and answers `PackageMetadataLite[]` (`src/protocol/messages.ts:124`), which is the two-phase shape 1.x used, and the webview slices already keep lite metadata in a map keyed by lower-cased id (`src/webview/shared/store/installed.tsx:38-62`, `allProjects.tsx:66-70`). (4) The service-index client owns the health tracker and the endpoint cache (`src/core/feeds/serviceIndex.ts:150-170`), the monitor probes through one client (`src/core/feeds/health.ts:90-176`) and `sources/health` is one event for both surfaces, so that client and the credential provider it needs are shared; the provider caches a "none" answer for five minutes (`DefaultCredentialProvider.ts:108`), so any probe of a directory's sources must run after that directory's chain is registered, or a private feed answers 401 at every start. (5) `updates:<p>|pre` is a coordinator resource, and P2.fix-2 (C-protocol-host-7, enforced by `src/host/handlers.test.ts:213-231`) requires every cacheable read to report its generation, so `updates/get` carries one and the carrier must be unwrapped where the generation is known. ADR-005 ("effective `nuget.config` chain", `sourceUrls`, per project directory) and ADR-009 d.4/d.5 (host names the directory; sources, policy and credentials from the read's context) are met by keying the feed context on the chain and reaching it from `ProjectContextProvider.get(projectPath)` or from `configFilesFor(directory)`. The split follows plan §2.1 (one item ≤ a session-day; P4.9 spans three directories, the harness and an ADR; the P2 items of that size took 61 and 74 minutes each) and the tracker's `P1.fix-1`/`P2.fix-2` precedent for extra rows; the seam leaves every commit green with `tsc` 0 and no optional `feeds` dep (an optional member the root leaves undefined is the stub the P4.4 ruling refused).

DO:

P4.9a — the Catalog answers every feed request; the root composes transport, credentials, service index and feeds.

1. Tracker first (N42 order): paste this answer verbatim under `## Advisor decisions` in `docs/plans/STATUS.md` as `### P4.9 — stop-and-ask: wiring the feeds (2026-10-16)` and into `src/core/catalog/STATUS.md`, `src/host/STATUS.md`, `src/STATUS.md`. Turn row P4.9 into an umbrella (note "split into P4.9a and P4.9b by the ruling of 2026-10-16; not an item: P4.9a's predecessor is P4.8, P4.9b's is P4.9a", status `in-progress` until both are done) and insert rows `P4.9a` (`in-progress`, today) and `P4.9b` (`open`) directly below it with the one-line scopes of this ruling. Then create `.claude/.contract-change` with content exactly `P4.9a`, make the ADR edit of step 2 and no other frozen edit, and delete the sentinel before `git commit`.

2. `docs/adr/009-catalog.md`, in the `dd1ed73` amendment form; decisive sentences verbatim:
   - Line 3: `Status: accepted · Date: 2026-10-12 · Amended: 2026-10-16 (plan item P4.9a: the feeds wired; one feed context per nuget.config chain; per-source versions and metadata; readmeImage and prewarm)`.
   - d.1, append after "…run directly.": "`package/versions` and `package/metadata` are fan-outs over per-source resources: one coordinator query per source the project's policy allows for the id, under `resourceKeys.versions(id, source.url, …)` and `resourceKeys.metadata(id, version, source.url)`, merged in source order; the `'all'` keys of `resourceKeys` stay reserved like the `allProjects:*` keys, and these two responses carry no generation (finding N70). `readme/image` is `readmeImage` and `package/prewarm` is `prewarm`. `transitive/metadata` answers lite metadata for any list of package versions; until P6.2 adds the provisional chunk to `installed/get`, the installed views ask it after `installed/get`, because a chunk precedes the response (ADR-007) and enrichment must not delay the list."
   - d.5, replace "the feed-dependent methods that consume them arrive with P4.9." with: "The Catalog keeps one feed context per effective `nuget.config` chain (its sources, package source mapping, outbound policy and the policy-bound feed clients), reached through `ProjectContextProvider.get` for a project-scoped read and through the directory the host names for a read without a project. The service-index client, which owns the source health, and the credential provider are shared; a `nuget.config` credential is looked up across the registered chains, first chain wins, and a source is probed or warmed only after the chain of its directory is registered."
   - d.6, replace "and P4.9 adds the service-index caches and `IconResolver.reset()` at the same place." with: "and clears the feed contexts, the service-index caches and health, the icon resolvers, the README-image cache and the credential cache at the same place. A change of health that the monitor finds invalidates nothing; it travels as the `sources/health` event."
   - d.8, replace the whole item with: "Breadth: no use case is added to the Catalog without amending this record. The feed-dependent reads are `updates`, `allProjectsUpdates`, `transitiveMetadata`, `search`, `quickSearch`, `versions`, `metadata`, `readme`, `readmeImage` and `prewarm`. A feed-dependent answer that is incomplete (`sourcesUnavailable`, `offline` metadata, or no metadata at all) is delivered but never cached: its compute rejects with a carrier of the value and the Catalog unwraps it with the handle's generation, so the coordinator stores nothing (ADR-002 caches successes only)."
   `docs/adr/README.md` unchanged. `git diff --name-only -- docs/adr src/protocol src/core/contracts.ts` → exactly `docs/adr/009-catalog.md`.

3. Deviations approved by name (non-frozen files outside the row), each recorded in the STATUS notes: `src/core/project/context.ts`: the private `configFiles(projectDir)` becomes public `configFilesFor(projectDir)` (same body; `get` calls it) plus one test `configFilesFor lists the chain of a directory without a project` in `context.test.ts`; `src/host/WebviewHost.ts`: delete the `not-yet-available` → `unsupported` branch of `toProtocolError` and its test `an error whose code is not-yet-available answers unsupported` in `WebviewHost.test.ts`.

4. `src/core/catalog/feedClients.ts` (new): `export interface FeedClients`, `export interface PolicyClients`, `export function createFeedClients(options: { transport: Transport; runner: DotnetRunner; serviceIndex: ServiceIndexClient; credentials: CredentialProvider; cache: Pick<TieredCache, 'get' | 'set'>; globalPackagesFolder: () => Promise<string | undefined>; logger?: Logger }): FeedClients`. Shared members: `transport`, `serviceIndex`, `credentials`, `flat = new DefaultFlatContainerClient({ transport, logger })`, `vulnerabilities = new DefaultVulnerabilityClient({ transport, logger })`, `readme = new ReadmeExtractor(transport, flat, { logger })`, `readmeImages = new ReadmeImageFetcher(transport, { getAuthHeader: url => credentials.getAuthHeader(url), logger })`, `offline = new OfflineMetadataReader({ globalPackagesFolder, logger })`, `iconCache = new TieredCacheIconCache(cache)`. `forPolicy(policy: OutboundPolicy): PolicyClients` builds one set per chain: `search = new DefaultSearchClient({ transport, runner, policy, logger })`, `registration = new DefaultRegistrationClient({ transport, policy, logger }, search, flat)`, `updates = new DefaultUpdateChecker({ policy, logger }, registration)`, `icons = new DefaultIconResolver(flat, iconCache, policy)`, `resolver = new DefaultMetadataResolver({ policy, logger }, { registration, flat, search, readme, offline })`, and two enrichers over the same `icons` and the same lite-cached lookup: `enricher = new DefaultMetadataEnricher({ policy, logger }, { lookup }, icons, vulnerabilities)` (live, for installed rows) and `searchEnricher = new DefaultMetadataEnricher({ policy, logger }, { lookup }, icons, NO_VULNERABILITY_DATA)` (for `search` and `updates`, so neither downloads the vulnerability index). `lookup = liteLookup(search)` is the `lite` cache's user: `(source, id, signal) => cache.get(cacheKeys.lite(id, source.source.url))` → a `PackageMetadataLite` or `null` (the source does not know the id) is answered without a request; a miss asks `search.lookup` and stores the answer or `null` under the `lite` kind; nothing else is stored (no icon, no vulnerabilities: icons have their own kind, vulnerabilities their own client cache). `NO_VULNERABILITY_DATA: VulnerabilityClient = { forPackage: async () => ({ vulnerabilities: [], sourcesUnavailable: true }), clear() {} }` ("not consulted": the enricher leaves `vulnerabilities` absent). `reset()`: `serviceIndex.clearCaches()`, `credentials.clear()`, `vulnerabilities.clear()`, `readmeImages.clear()`.

5. `src/core/catalog/feedContexts.ts` (new): `export class FeedContexts` with deps `{ contexts: Pick<ProjectContextProvider, 'get' | 'configFilesFor'>; sources: SourceProvider; configs: Pick<NuGetConfigReader, 'readChain'>; feeds: FeedClients; logger?: Logger }`. `export interface FeedContext { key: string; directory: string; configFiles: string[]; sources: NuGetSource[]; merged: MergedNuGetConfig; policy: OutboundPolicy; clients: PolicyClients }`. Two caches, both cleared by `clear()`: `directory → Promise<string[]>` (the chain of a directory) and `chain → Promise<FeedContext>`. `forDirectory(directory)`: the directory cache, filled from `contexts.configFilesFor(directory)` on a miss (never run `dotnet nuget config paths` per request), then `forChain(directory, configFiles)`. `forProject(projectPath)`: `directory = path.dirname(projectPath)`; on a directory-cache hit `forChain` at once; on a miss `(await contexts.get(projectPath)).context.configFiles` fills the directory cache (`ProjectContextProvider.get` has no cache of its own and `updates` recomputes after every operation); a rejection propagates and the caller decides. `forChain(directory, configFiles)`: key `configFiles.join('\n')` (the empty chain is the key `''`: no mapping, no config credentials, the listed sources; one `debug` line); on a miss `sources = await deps.sources.listSources(directory)`, `merged = mergeConfigChain(await configs.readChain(configFiles))`, `policy = new DefaultOutboundPolicy(merged.mapping)`, `clients = feeds.forPolicy(policy)`; a rejected build is deleted from the cache. `lookupConfigCredential(sourceUrl)`: over the settled contexts in insertion order, `credentialForUrl(sourceUrl, ctx.sources, ctx.merged)` (from `../credentials`), first hit, else `undefined`. `resolve(ctx, sourceUrls?: string[]): Promise<{ selected: NuGetSource[]; resolved: ResolvedSource[]; excluded: NuGetSource[] }>`: `selected = ctx.sources.filter(s => s.enabled && (sourceUrls === undefined || sourceUrls.includes(s.url)))`, `resolved = await feeds.serviceIndex.resolve(selected)`, `excluded` = the remote members of `selected` that `resolved` lacks (unhealthy or no usable endpoint). `clear()`: `icons.reset()` on every settled context's clients, then both caches emptied. Header comment states the invariant: a `getAuthHeader` for a source of directory D is asked only after `forDirectory(D)` or `forProject` settled (the provider caches "none" for five minutes). Deviation to record: the credential provider is shared and runs with its default `cwd` (home), not `context.projectDir` as the P2.7 recipe sketched; two chains that give the same URL different credentials share the 30-minute cache (first chain wins).

6. `src/core/catalog/Catalog.ts`. `CatalogDeps` gains `feeds: FeedClients` and `feedContexts: FeedContexts` (both required). Delete `NotYetAvailableError` (and its export in `index.ts`) and all nine `REMOVAL GATE: P4.9` comments. Add `export class IncompleteResultError<T> extends Error { readonly code = 'incomplete-result'; constructor(readonly value: T) }`: a compute that ends with an incomplete answer throws it. `queryWithRetry` catches it and returns `{ value: error.value, generation: handle.generation }` (the one place it is caught; a separate helper would lose the generation). `UpdatesQueryResult` gains `generation: number`. Methods:
   - `updates(projectPath, includePrerelease, emitFound?, signal?) → Promise<UpdatesQueryResult>`: `queryWithRetry` under `resourceKeys.updates(projectPath, includePrerelease)` with chunk type `PackageUpdate` forwarded to `emitFound`; compute: `ctx = await feedContexts.forProject(projectPath).catch(log → undefined)`; `undefined` → throw `new IncompleteResultError({ projectPath, updates: [], sourcesUnavailable: true })` (a context that cannot be built is unknown, not empty); `const { result, upgrade } = await this.installed(projectPath, undefined, signal); const final = upgrade ? await upgrade : result;` `{ resolved, excluded } = await feedContexts.resolve(ctx)`; `checked = await ctx.clients.updates.check(resolved, final.packages, includePrerelease, emit, signal)`; `lite = await ctx.clients.searchEnricher.enrich(resolved, checked.updates.map(u => ({ id: u.id, version: u.latestVersion })), signal)`; fold `iconUrl`, `verified`, `authors` by lower-cased id into the rows; `flag = checked.sourcesUnavailable || excluded.length > 0`; flag → throw the carrier with `{ projectPath, updates, sourcesUnavailable: true }`, else return it. The method returns `{ ...value, generation }`.
   - `allProjectsUpdates(includePrerelease, emit, signal)`: as `allProjectsInstalled` (projects → `start` → `batchedPromiseAll` at 4); per project `this.updates(...)` without `emitFound`, emit `{ kind: 'project', chunk: { projectPath, projectName, workspaceFolder, updates } }`, then `{ kind: 'icons', icons }` with that project's `lower-cased id → iconUrl` entries that have one (progressive; the webview merges); a rejection becomes a `project` chunk with `error`; result `{ projectPaths, sourcesUnavailable: any flag || undefined }`.
   - `transitiveMetadata(directory: string, packages, signal) → Promise<PackageMetadataLite[]>`: `ctx = await feedContexts.forDirectory(directory)`; `{ resolved } = resolve(ctx)`; `ctx.clients.enricher.enrich(resolved, packages, signal)` (live vulnerabilities). Not a resource. Under `ALL_PROJECTS` the host's directory is the first workspace folder, so that folder's chain applies; say so in the JSDoc.
   - `search(directory, options, emitMetadata, signal) → Promise<SearchQueryResult>`: `{ selected, resolved, excluded } = resolve(ctx, options.sourceUrls)`; `apiSources = resolved.filter(r => r.endpoints.searchQueryService)`; `cliFallback = selected.filter(s => !apiUrls.has(s.url) && !excludedUrls.has(s.url))` (local sources in, unhealthy remote ones out); `outcome = await ctx.clients.search.search(apiSources, cliFallback, { query, includePrerelease, take, exactMatch, signal }, directory)` (ADR-005, M1: the CLI runs in the directory); `lite = await ctx.clients.searchEnricher.enrich(resolved, results.map(r => ({ id: r.id, version: r.version })), signal)`; `emitMetadata(lite)` once when non-empty; return `{ results, sourcesUnavailable: outcome.sourcesUnavailable || excluded.length > 0 || undefined }`. No search cache in this item.
   - `quickSearch(directory, sourceUrls, query, includePrerelease, perSource, signal)`: `{ resolved } = resolve(ctx, sourceUrls)`; none → `[]` without a request; else `ctx.clients.search.quickSearch(resolved, query, includePrerelease, perSource, signal)`.
   - `versions(directory, packageId, sourceUrl | undefined, includePrerelease, signal) → Promise<{ versions: string[]; sourcesUnavailable: boolean }>`: `{ resolved, excluded } = resolve(ctx, sourceUrl ? [sourceUrl] : undefined)`; `allowed = filterAllowedSources(ctx.policy, packageId, resolved)`; per allowed source `queryWithRetry` under `resourceKeys.versions(packageId, source.source.url, includePrerelease)` computing `ctx.clients.resolver.versions([source], packageId, { includePrerelease, listedOnly: false, signal })` (the explicit list includes unlisted versions, as the gotcha requires; update candidates stay listed-only in the checker), a `sourcesUnavailable` answer thrown as the carrier; merge: union, dedupe by `(normalize(v) ?? v).toLowerCase()` keeping the first text, `sortDescending`; `sourcesUnavailable = any source unavailable || excluded.length > 0` (one unhealthy source with no other allowed source must not read as a known empty list). A refused source is neither asked nor read; never build `resourceKeys.versions(id, undefined, …)`.
   - `metadata(directory, packageId, version, sourceUrl | undefined, signal) → Promise<PackageMetadata | undefined>`: allowed sources as above; in source order, `queryWithRetry` under `resourceKeys.metadata(packageId, version, source.source.url)` computing `ctx.clients.resolver.metadata([source], packageId, version, signal)`; an answer that is `undefined` or has `offline === true` means "not from this source" and is thrown as the carrier (the coordinator has no TTL: only a non-offline `PackageMetadata` may be cached); the first cached-able answer wins and stops the walk; when none answered, `ctx.clients.resolver.metadata([], packageId, version)` for the offline copy, outside the coordinator. Then `v = await feeds.vulnerabilities.forPackage(resolved, packageId, version, signal)`: set `vulnerabilities` unless `v.sourcesUnavailable` (absent = unknown), on the returned object only.
   - `readme(directory, packageId, version, sourceUrl | undefined, signal)`: `ctx.clients.resolver.readme(resolve(ctx, sourceUrl ? [sourceUrl] : undefined).resolved, packageId, version, signal)`.
   - `readmeImage(url, sourceUrl | undefined, signal) → Promise<string | null>`: `feeds.readmeImages.fetch(url, sourceUrl, signal)`.
   - `prewarm(directory, sourceUrl?) → Promise<void>`: `ctx = await feedContexts.forDirectory(directory)` first (the chain must be registered before any credential is asked); `urls` = the enabled remote sources of `ctx` (or the one named, if among them); `feeds.credentials.prewarm(urls)`; `for (url) void feeds.serviceIndex.endpoints(url)`; resolves at once.
   - `sourceHealth(): FailedSource[]` → `feeds.serviceIndex.health.failed()`.
   - `invalidate(scope, reason)`: for `sources` and `workspace`: `deps.sources.invalidate()`, `feedContexts.clear()`, `feeds.reset()`; then `coordinator.invalidate` as today. No `resetSourceHealth`, no `resolvedSources`.
   Replace the header JSDoc ("…declared and throw…") with the resolution rule of d.5. `index.ts`: export `IncompleteResultError`, `createFeedClients`, `FeedContexts` and the types `FeedClients`, `PolicyClients`, `FeedContext`.

7. `src/host/handlers.ts`: `updates/get` sets `ctx.generation = result.generation`; `transitive/metadata` → `catalog.transitiveMetadata(sourceDirectory(services), packages, ctx.signal)`; `search/query` → `catalog.search(sourceDirectory(services), {...}, …)`; `search/autocomplete` → `catalog.quickSearch(sourceDirectory(services), payload.sources.map(s => s.url), payload.query, …)`; `package/versions` → `const { versions, sourcesUnavailable } = await catalog.versions(sourceDirectory(services), payload.packageId, payload.sourceUrl, payload.includePrerelease, ctx.signal); if (versions.length === 0 && sourcesUnavailable) { throw new HostRequestError('failed', 'No package source could be reached for this package'); } return { packageId: payload.packageId, versions };` (no `ctx.generation`: a fan-out); `package/metadata` and `package/readme` likewise with the directory and no generation; `readme/image` → `async ({ url, sourceUrl }, ctx) => ({ url, dataUri: await catalog.readmeImage(url, sourceUrl, ctx.signal) })`; `package/prewarm` → `async ({ sourceUrl }) => { await catalog.prewarm(sourceDirectory(services), sourceUrl); return {}; }`. The gates of `sources/list`, `sources/refresh` and `refresh/all` stay for P4.9b: `grep -c 'REMOVAL GATE: P4.9' src/host/handlers.ts` → 3.

8. `src/extension.next.ts`: `export type ActivationOverrides = Pick<DotnetRunnerOptions, 'spawn' | 'resolveExecutable'> & { transport?: Transport }`. Export a root-local `proxyConfigured(env: NodeJS.ProcessEnv = process.env): boolean` exactly per the P4.1 note: `const http = vscode.workspace.getConfiguration('http'); const support = http.get<string>('proxySupport', 'override'); const proxy = http.get<string>('proxy', ''); return support !== 'off' && (proxy.trim() !== '' || ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'].some(name => (env[name] ?? '').trim() !== ''));` evaluated on every call. Composition, in this order after `queue`: `const transport = overrides.transport ?? new NodeTransport({ proxy: { isConfigured: () => proxyConfigured() }, logger });` (pushed to `context.subscriptions` only when created here); `const configs = new NuGetConfigReader();` `let feedContexts: FeedContexts;` (assigned below; the closure that reads it runs only after activation, one-line comment); `const credentials = new DefaultCredentialProvider({ runner, lookupConfigCredential: url => feedContexts.lookupConfigCredential(url), logger });` `const serviceIndex = new DefaultServiceIndexClient({ transport, getAuthHeader: url => credentials.getAuthHeader(url), logger });` `const feeds = createFeedClients({ transport, runner, serviceIndex, credentials, cache, globalPackagesFolder: () => runner.globalPackagesFolder(), logger });` `feedContexts = new FeedContexts({ contexts, sources, configs, feeds, logger });` `const catalog = new Catalog({ coordinator, inspector, contexts, sources, assets, feeds, feedContexts, logger, discoverProjects });`. Delete the gate comment at line 72. In `onDidChangeConfiguration`: `if (e.affectsConfiguration('http') && transport instanceof NodeTransport) { transport.reset(); }` and delete the comment at line 274; the health-monitor comment at line 205 stays for P4.9b. `nuiget.clearHttpCache` unchanged (`invalidate` now also resets the feeds).

9. Tests. `src/core/catalog/Catalog.test.ts`: delete `feed methods throw not-yet-available before any query` (named here) and add, over fakes of `FeedClients`/`PolicyClients` (plain objects typed by the `types.ts` interfaces) and the real `DefaultQueryCoordinator`: `updates: streams bare found rows, answers rows enriched with icon, verified and authors, and reports its generation`; `updates: a source that could not answer is delivered with sourcesUnavailable and the resource is not cached` (`coordinator.peek` undefined, second call recomputes); `updates: an excluded unhealthy source sets sourcesUnavailable`; `updates: a context that cannot be built answers unavailable, not empty`; `updates: both surfaces share one computation per project and prerelease flag`; `allProjectsUpdates: streams start, one project chunk and one icons chunk per project, and ORs sourcesUnavailable`; `versions: for 'all' sources queries one resource per allowed source and merges them newest first (N70)` (two chains with different allowed sources: the keys seen are `versions:<id>|<S>|stable` only, none with `|all|`, and no entry is shared); `versions: a source the policy refuses is neither asked nor read`; `versions: an unavailable or excluded source is delivered with the flag and no resource is cached`; `metadata: the first allowed source in order answers and is cached under its own key`; `metadata: an offline or missing answer is delivered and never cached`; `metadata: vulnerabilities are present when known and absent when unavailable`; `search: partitions the directory's sources into API, CLI fallback and excluded, runs the CLI in the directory and emits one metadata chunk before resolving`; `search: a selected source that is not enabled in the directory is ignored`; `quickSearch: intersects the asked sources with the directory's and answers [] without one`; `transitiveMetadata: lite metadata for any package list with live vulnerabilities`; `readme and readmeImage delegate with the signal`; `prewarm registers the directory's chain before warming credentials and service indexes, and resolves at once`; `invalidate: sources and workspace clear the feed contexts, the service-index caches, the icon resolvers and the README-image cache; project and metadata do not`. New `feedContexts.test.ts`: `one context per nuget.config chain, reached by project and by directory, without a second config-paths run for a known directory`; `an empty chain is one shared context without mapping or config credentials`; `the credential of a source URL is found once its chain is registered`; `clear resets every icon resolver and forgets the chains`; `the search enricher never consults the vulnerability data and the installed enricher does`. New `feedClients.test.ts`: `liteLookup caches a lookup answer and a miss per source under the lite kind and asks again after the lifetime`. `src/host/handlers.test.ts`: `makeServices` replaces the eight `gated(...)` members with resolving fakes (`updates` answering `{ projectPath, updates: [], sourcesUnavailable: false, generation: 6 }`) and adds `readmeImage`, `prewarm`, `sourceHealth`; drop `gatedReads` from the `%s: one request → exactly one terminal response` branch; `resourceReads` grows to ten with `'updates/get'` and `the nine resource responses carry the generation the Catalog reported` becomes `the ten resource responses …` with `'updates/get': 6`; replace `feed reads answer unsupported while the Catalog is gated` with `feed reads pass the selected project's directory and the payload to the Catalog`, `package/versions: no versions and sourcesUnavailable is a failed response, otherwise the list`, `readme/image answers through Catalog.readmeImage and package/prewarm awaits Catalog.prewarm`. `src/extension.next.test.ts`: `proxyConfigured follows http.proxySupport, http.proxy and the proxy environment`; `an http setting change resets the transport and a nuiget change does not` (a `NodeTransport` with a spied `reset` through the override); `composes the feeds: package/versions and search/query answer through the transport override` (a `FakeTransport` from `src/core/feeds/testSupport.ts` serving a service index and a search answer for the shared feed; `package/versions` from the sidebar answers the list; with the feed down, `search/query` answers `sourcesUnavailable: true`, not an error). `src/core/project/context.test.ts`: the test of step 3.

10. Gates in §2.2 order, including `npm run check-types`, `rm -rf dist && npm run package:vsix && npm run check:vsix` (host and root changed); `DOTNET_ROOT="$(dirname "$(command -v dotnet)")" NUIGET_SDK_TESTS=1 npx vitest run --project backend src/core/catalog src/host src/extension.next.test.ts src/core/project`; `npx vitest run --project integration src/test/harness` (unchanged: nothing in activation reaches the transport before P4.9b). Docs: CHANGELOG `### Added` one line `**2.0 feeds in the Catalog** — …`; ARCHITECTURE.md 2.0 rows for `src/core/catalog/**` (feed contexts, per-source fan-outs, the carrier) and the root (transport, proxy predicate, feeds); copilot-instructions 2.0 gotchas: edit the `REMOVAL GATE` row to the remaining five lines, add `'all' resource keys are never written` ("`package/versions` and `package/metadata` query one resource per allowed source; a key built with `sourceUrl: undefined` is a defect (N70)") and `Incomplete feed answers are rejections inside the Catalog` ("a compute that ends with `sourcesUnavailable`, `offline` or no metadata throws `IncompleteResultError(value)`; `queryWithRetry` is the only catch and keeps the generation; never catch-all around a Catalog query"). Ledger: N70 closed (P4.9a, the N70 test); M1 progressed (CLI search runs in the directory of the read); S6 stays open for P4.9b. Tracker notes: P5.5 "`updates/get`: `found` chunks are bare rows, the terminal rows carry `iconUrl`/`verified`/`authors` and the response its generation; `sourcesUnavailable` is a banner over the list, never an empty state; on a `sources/health` event whose `failed` no longer lists a source, re-request the updates that were answered unavailable (a recovery invalidates nothing)"; P5.6 "`search/query`'s `metadata` chunk precedes the response, so results appear after the `take` rows are enriched; search rows carry no vulnerabilities"; P5.7 "`package/versions` and `package/metadata` responses carry no generation; re-request on an invalidation whose keys include a `versions:<id>|` or `metadata:<id>@` key (per-source keys are what the coordinator lists); `readme/image` answers through `Catalog.readmeImage`"; P5.4/P5.10 "the installed views ask `transitive/metadata` with the rows they show after `installed/get` resolves (two-phase, 1.x parity) until P6.2; under ALL_PROJECTS the first workspace folder's chain applies"; P6.2 "move enrichment inside `installed/get` behind the provisional chunk (`metadata` chunks after it, before the authoritative response); the lite lookup of `feedClients.ts` serves it"; P4.10 "benches for `Catalog.updates`, `versions` and `search` over `FakeTransport`". Commit `feat(core/catalog): wire the feeds into the Catalog and the root (P4.9a, ADR-005, ADR-006, ADR-009, N70, M1, S6)`; push; green CI; then P4.9b.

P4.9b — source health to both surfaces, all-projects lite metadata, the last gates, the two harness scenarios.

11. `src/core/feeds/health.ts` (approved deviation, additive): `SourceHealthTracker` gains `readonly onDidChange: Event<FailedSource[]>` (an `Emitter` from `../util/events`), fired after `markFailed` when the url was not failed or its error text changed, after `markHealthy` when it was failed, after `reset` when the set was not empty, with `failed()` as payload; `health.test.ts` adds `onDidChange fires when the failed set changes and not otherwise`. A tracker event, not a monitor callback, so a failure recorded by an ordinary read (`serviceIndex.ts:250-254`) is reported too.

12. `src/extension.next.ts`: `const health = new SourceHealthTracker()` passed as `options.health` to the service-index client of step 8; after the invalidation forwarding: `context.subscriptions.push(health.onDidChange(failed => { sidebar.notifySourceHealth({ failed }); MainPanelHost.instance?.notifySourceHealth({ failed }); }))`; `const monitor = startHealthMonitor(serviceIndex, probeSources, { failedIntervalMs: 120_000, healthyIntervalMs: 300_000, logger })`, pushed to subscriptions, where `probeSources` takes the selected project's directory (the existing `directoryOf(session.snapshot.selectedProject)`) and the first workspace folder, deduplicated, and for each `const ctx = await feedContexts.forDirectory(dir)` (registering the chain before any credential is asked) and unions `ctx.sources` by url; a directory that fails is skipped with a warning; `monitor.restart()` from the existing `coordinator.onDidInvalidate` branch when `scope.kind` is `sources` or `workspace`. A pass that finds a source healthy again invalidates nothing. Delete the comment at line 205. Run the existing harness suite and `src/extension.next.test.ts` right after this step: the activation pass is new host-side activity in every scenario (`overlapping refreshes are coalesced` counts listings; the probe reuses the cached listing of the same directory and must add none).

13. `src/host/handlers.ts`: `listSources` returns `{ sources, failed: catalog.sourceHealth() }` (no `health` chunk; the result carries it); `sources/refresh` and `refresh/all` lose their comments (the reset is inside `invalidate`, d.6). `src/host/SidebarHost.ts:110`: delete the comment; the body stays. `grep -rn 'REMOVAL GATE: P4.9' src` → no output.

14. `src/core/catalog/Catalog.ts`: `allProjectsInstalled` emits, after each project's `project` chunk (and after the authoritative one when an upgrade exists), `{ kind: 'metadata', projectPath, packages }` from `feedContexts.forProject(project.path)` → `ctx.clients.enricher.enrich(resolved, rows with a concrete version (resolvedVersion ?? version when parseVersion accepts it))`, swallowing a failed enrichment with a warning (the list is already on screen). `installed()` and `computeInstalled` do not change (P6.2). Tests: `allProjectsInstalled: emits a metadata chunk per project after its project chunk and finishes without one when enrichment fails`; `sourceHealth lists the failed sources`.

15. Harness. `src/test/harness/fakeFeed.ts` (new): `createFakeFeed()` returns a `FakeTransport` handler plus controls: `publish(id, versions[])` (a service index with `SearchQueryService`, `RegistrationsBaseUrl` and `PackageBaseAddress` for `SHARED_FEED` and `PRIVATE_FEED`; `?q=packageid:<id>` answers `{ data: [{ id, version: newest, versions: [...] }] }`, other searches `{ data: [] }`, flat `/icon` 404, registration leaves for the published versions), `down: boolean` (every request `fail('network')` while true), `requests` by URL. `HarnessOptions.feed?: ReturnType<typeof createFakeFeed>` (default: an empty healthy feed) passed as `activateWith(..., { spawn, resolveExecutable, transport: new FakeTransport(feed.handler) })` (import `FakeTransport` by path from `src/core/feeds/testSupport.ts`, test code only). The fake dotnet already answers `nuget config paths` with exit 0 and no output, which is the empty chain (no mapping, no config credentials): say so in `fakeDotnet.ts`'s comment. `FakeWebview`: an `updates` slot (`'updates/get'`, R4 and R7 like `installed`: the response's `generation` is compared with the listed generation of `resourceKeys.updates(selected, includePrerelease)`), `updates: { projectPath; updates; sourcesUnavailable } | undefined`, re-asked when `resources/invalidated` names that key after the model has asked once; `health: FailedSource[][]` recording every `sources/health` payload; `checkUpdates(name)` on the harness. Scenarios in `scenarios.test.ts`, titles exactly as the plan row:
   - `updates converge across surfaces`: `TWO_PROJECTS` with `feed.publish('Serilog', ['3.0.0', '3.1.0'])`; both surfaces resolved; `checkUpdates` on both; both answer `[{ id: 'Serilog', installedVersion: '3.0.0', latestVersion: '3.1.0', sourceUrl: SHARED_FEED }]` with `sourcesUnavailable` undefined and the same `generation`; record `feed.requests.length` after the first surface's response and assert the second surface's identical request added no feed request (one computation for two surfaces; the enricher's lookup and the checker both send `packageid:` queries, so do not count those); `ops/update` Serilog to 3.1.0 from the sidebar; after the outcome both surfaces re-asked and show `updates: []` and `installed: ['Serilog@3.1.0']`; `expectOneResponsePerRequest` on both.
   - `sources unreachable shows banner not empty`: `feed.down = true` before activation; both surfaces resolved; `sources/list` on each answers `failed` containing `SHARED_FEED` (the initial failure is recorded during activation, before either surface exists, so no `sources/health` event can carry it; the request a sources slice sends does); `checkUpdates` on both answers `updates: []` with `sourcesUnavailable: true` (an ok response, never an error, never a bare empty list); then `feed.down = false`, `feed.publish('Serilog', ['3.0.0', '3.1.0'])`, `h.refresh('main')`; the last `sources/health` payload each surface received is `{ failed: [] }` (`refresh/all` → `feeds.reset()` → `health.reset()` fires it; the monitor's re-probe fires again only if still down, so do not assert a count), and `checkUpdates` on both now answers the update; nothing was answered for a request a surface did not send.
   `src/extension.next.test.ts`: `the health monitor registers the selected directory's chain before probing and reports sources/health to both surfaces`; `a sources invalidation restarts the monitor and a recovery invalidates nothing` (fake timers past 120 s; the invalidation count unchanged by the recovery pass).

16. Gates as in step 10 plus `npx vitest run --project integration src/test/harness` with the two titles listed, and the two scenarios 40 times in a row. Docs: CHANGELOG `### Added` `**2.0 source health** — …`; ARCHITECTURE 2.0 rows (health monitor, `sources/health`, all-projects lite metadata, harness fake feed); copilot-instructions: delete the `REMOVAL GATE` gotcha row (nothing is gated any more) and add `A recovered source invalidates nothing` ("the monitor's pass reports through `sources/health`; webviews re-request what they showed as unavailable; never call `invalidate` from a health pass; a source is probed only after its directory's chain is registered"); ledger S6 closed (P4.9b: icons and `readme/image` through the Catalog, health on both surfaces). Tracker: P4.9b `done`, umbrella P4.9 `done`. `STATUS.md` of `src/core/catalog`, `src/core/feeds`, `src/host`, `src`, `src/test/harness` rewritten. Commit `feat(host): source health on both surfaces, all-projects lite metadata, last P4.9 gates (P4.9b, ADR-002, ADR-006, ADR-009, S6)`.

DO NOT:
- Do not keep `CatalogDeps.feeds` optional, keep `NotYetAvailableError`, or leave any `REMOVAL GATE: P4.9` comment after P4.9b.
- Do not build `resourceKeys.versions(id, undefined, …)` or `resourceKeys.metadata(id, v, undefined)`; the `'all'` keys are reserved.
- Do not return a result with `sourcesUnavailable`, an `offline` metadata or `undefined` metadata from a compute function, and do not call `coordinator.invalidate` from inside a read to "uncache" it.
- Do not catch `IncompleteResultError` anywhere but in `queryWithRetry`; the generation travels with the value.
- Do not enrich inside `computeInstalled` or delay the `installed/get` response on the network; the provisional chunk is P6.2's.
- Do not ask `getAuthHeader` or `probe` for a directory's sources before `forDirectory`/`forProject` has registered its chain; the provider remembers "none" for five minutes.
- Do not add `projectPath` to any payload, a `ProtocolErrorCode`, a chunk kind or an `EventMap` member; `src/protocol/**` and `src/core/contracts.ts` stay byte-identical.
- Do not resolve sources, policy or credentials from a workspace-wide default; every read names a project or a directory the host chose (`sourceDirectory`).
- Do not run `dotnet nuget config paths` per request or per `forProject` call; the directory → chain cache is consulted first and cleared only in `invalidate`.
- Do not construct a second `DefaultServiceIndexClient`, `SourceHealthTracker` or `DefaultCredentialProvider`, or two `PolicyClients` sets per chain; only the enricher's vulnerability client differs.
- Do not hand the enricher of `search` or `updates` the live vulnerability client; the index download belongs to installed rows.
- Do not store icons or vulnerabilities in a `lite` entry; only the lookup answer.
- Do not emit a `health` chunk on `sources/list`, and do not invalidate anything from a health pass.
- Do not probe every project directory from the monitor; the selected directory and the first workspace folder, through registered chains.
- Do not pass an `agent`, `rejectUnauthorized`, `undici` or `fetch` to the transport; the predicate is the P4.1 text, evaluated per call.
- Do not test for `nuget.org` anywhere in `src/core/catalog/*.ts` outside tests.
- Do not add a search cache, a `resolvedSources` method or a `resetSourceHealth` method.
- Do not import from `src/core/feeds/testSupport.ts` outside test files, and do not export it from the barrel.
- Do not assert "exactly one feed request" or "exactly one `sources/health` event" in the scenarios; the lookups and the reset make both false.
- Do not create the sentinel before this answer is pasted and the tracker rows exist; do not commit while it exists; the sentinel is `P4.9a` only.
- Do not start P4.9b before P4.9a's CI run is green.

CONTRACT CHANGE: `docs/adr/009-catalog.md` only (line 3 and decisions 1, 5, 6, 8 as dictated in step 2), in P4.9a behind `.claude/.contract-change` with content `P4.9a`. `src/protocol/**`, `src/core/contracts.ts`, every other ADR and `docs/protocol.md`: none. Approved non-frozen deviations from the item's file list, each recorded in the STATUS notes: `src/core/project/context.ts` + `context.test.ts` (`configFilesFor` public, P4.9a); `src/host/WebviewHost.ts` + `WebviewHost.test.ts` (the `not-yet-available` branch and its test removed, P4.9a); `src/core/feeds/health.ts` + `health.test.ts` (`onDidChange`, P4.9b). Tests rewritten by title: `feed methods throw not-yet-available before any query` (Catalog.test.ts); `feed reads answer unsupported while the Catalog is gated`, the `gatedReads` branch and `resourceReads` list of `%s: one request → exactly one terminal response`, and `the nine resource responses carry the generation the Catalog reported` (handlers.test.ts); `an error whose code is not-yet-available answers unsupported` (WebviewHost.test.ts); and in P4.9b the `failed: []` assertion of `sources/list resolves the selected project's directory`.

VERIFY:
P4.9a:
- `npx tsc --noEmit` → 0; `npm run check-types` → 0; `npx eslint src` → 0.
- `grep -c 'REMOVAL GATE: P4.9' src/core/catalog/Catalog.ts src/host/handlers.ts src/host/SidebarHost.ts src/extension.next.ts` → `0`, `3`, `1`, `1`; `grep -rn 'NotYetAvailableError\|not-yet-available' src` → no output.
- `grep -c "IncompleteResultError" src/core/catalog/Catalog.ts` → the class, the throws and the one catch in `queryWithRetry`; `grep -n "configFilesFor" src/core/project/context.ts src/core/catalog/feedContexts.ts` → present in both; `grep -rn "nuget.org" src/core/catalog --include='*.ts' | grep -v test` → no output.
- `npx vitest run --project backend src/core/catalog src/host src/extension.next.test.ts src/core/project/context.test.ts --reporter=verbose` → green, listing `versions: for 'all' sources queries one resource per allowed source and merges them newest first (N70)`, `updates: a source that could not answer is delivered with sourcesUnavailable and the resource is not cached`, `metadata: an offline or missing answer is delivered and never cached`, `the credential of a source URL is found once its chain is registered`, `the ten resource responses carry the generation the Catalog reported`, `package/versions: no versions and sourcesUnavailable is a failed response, otherwise the list`, `proxyConfigured follows http.proxySupport, http.proxy and the proxy environment`, `an http setting change resets the transport and a nuiget change does not`; `npx vitest run --project integration src/test/harness` → green, unchanged titles.
- `git diff --name-only -- docs/adr src/protocol src/core/contracts.ts` → `docs/adr/009-catalog.md`; `grep -c "P4.9a" docs/adr/009-catalog.md` → 1; `grep -c "NotYetAvailableError" docs/adr/009-catalog.md` → 0; `ls .claude/.contract-change` → No such file at commit time.
- `npm test`, `npm run bench`, `rm -rf dist && npm run package:vsix && npm run check:vsix` → green; `grep -n "^| N70 " docs/plans/findings-ledger.md` → `closed (P4.9a …)`; `grep -n "^| P4.9a \|^| P4.9b " docs/plans/STATUS.md` → two rows; CI green before P4.9b.
P4.9b:
- `grep -rn 'REMOVAL GATE: P4.9' src` → no output; `grep -c "REMOVAL GATE" .github/copilot-instructions.md` → 0.
- `npx vitest run --project integration src/test/harness --reporter=verbose` → green, listing `updates converge across surfaces` and `sources unreachable shows banner not empty`; `for i in $(seq 1 40); do npx vitest run --project integration src/test/harness -t "converge across surfaces|unreachable shows banner" || break; done` → 40 green.
- `npx vitest run --project backend src/core/feeds/health.test.ts src/extension.next.test.ts src/core/catalog -t "onDidChange|health monitor|recovery invalidates nothing|metadata chunk per project"` → green; `overlapping refreshes are coalesced` still green unchanged.
- `grep -n "invalidate" src/core/feeds/health.ts src/extension.next.ts | grep -i "health\|monitor\|probe"` → no line calls `invalidate` from a health pass; `grep -n "notifySourceHealth" src/extension.next.ts` → 2; `grep -n "forDirectory" src/extension.next.ts` → in `probeSources`.
- `npm test`, `npm run bench`, `rm -rf dist && npm run package:vsix && npm run check:vsix` → green; `grep -n "^| S6 " docs/plans/findings-ledger.md` → `closed (P4.9b …)`; CI green.

FILES CHECKED: /Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md (whole); /Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md (§0-§4 :1-172, P2 rows :221-238, P4 rows and gate :253-268, P5 :270-288, P6.2 :295, §7 :329-363); /Users/mattias/github/nuiget/docs/plans/RUN.md:55-100; /Users/mattias/github/nuiget/docs/plans/STATUS.md (row P4.9 :71 whole, rows P4.10 :72, P5.x :60-83, fix rows :39,52-53; rulings P2.8 :1010-1108, P2.9 :1110-1285, P2.10 :1287-1364, P4.1 :1797-1894, P4.4 :1896-1946, P4.6 :1948-2008, P4.8 :2010-2062); /Users/mattias/github/nuiget/docs/plans/findings-ledger.md (:42 S6, :66 F6, :109 N6, :171-173, :308-309 M1/M2, :412-414 N68-N70); /Users/mattias/github/nuiget/docs/adr/002-query-coordinator.md, 005-execution-context-and-outbound-policy.md, 006-icons-and-csp.md, 007-protocol.md:14-42, 009-catalog.md (whole); /Users/mattias/github/nuiget/src/core/catalog/Catalog.ts (whole), index.ts, STATUS.md:1-60, Catalog.test.ts (titles); /Users/mattias/github/nuiget/src/core/feeds/{types,index,serviceIndex,health,updates,enricher,metadataResolver,offline,testSupport}.ts (whole), icons.ts:1-160 and the `reset`/`Flight` lines, readmeImage.ts:1-70, readme.ts:73-100, registration.ts:109-135, search.ts:160-200, flatContainer.ts:71-80, vulnerability.ts:87-98, STATUS.md:1-80; /Users/mattias/github/nuiget/src/core/http/Transport.ts:18-60,300-360, index.ts; /Users/mattias/github/nuiget/src/core/credentials/DefaultCredentialProvider.ts:1-125, index.ts, helpers.ts:29-39, STATUS.md (the P2.8 recipe lines); /Users/mattias/github/nuiget/src/core/sources/{DefaultOutboundPolicy,index}.ts, NuGetConfigReader.ts (exports, `readChain` :56), merge.ts (exports :5-63), DotnetSourceProvider.ts:1-80, STATUS.md (grep); /Users/mattias/github/nuiget/src/core/project/{context,index}.ts, revision.ts (exports); /Users/mattias/github/nuiget/src/core/queries/QueryCoordinator.ts (whole), scopes.ts:1-80; /Users/mattias/github/nuiget/src/core/cache/CachePolicy.ts:1-150, index.ts, TieredCache.ts (method lines); /Users/mattias/github/nuiget/src/core/cli/index.ts, DotnetRunner.ts:390-415; /Users/mattias/github/nuiget/src/core/contracts.ts:100-122,150-354; /Users/mattias/github/nuiget/src/protocol/messages.ts:58-80,100-201, domain.ts:1-70,72-141,143-215,215-262, envelope.ts (`ProtocolErrorCode`); /Users/mattias/github/nuiget/src/host/{handlers,services,SidebarHost,MainPanelHost}.ts (whole or the cited ranges), WebviewHost.ts (`RequestContext`, `toProtocolError` lines), handlers.test.ts:30-110,185-310 and titles, WebviewHost.test.ts (title); /Users/mattias/github/nuiget/src/extension.next.ts (whole), extension.next.test.ts:1-235 and titles (incl. :439 `overlapping refreshes are coalesced`), src/STATUS.md:1-12; /Users/mattias/github/nuiget/src/test/harness/{harness,FakeWebview (1-130), scenarios.test (1-52, 489-554 and titles), fakeDotnet (1-60 and matchers)}.ts; /Users/mattias/github/nuiget/src/test/__mocks__/vscode.ts:232-243; /Users/mattias/github/nuiget/src/webview/shared/store/{installed,allProjects}.tsx (chunk handling) and the `iconUrl`/`metadata.get` uses under src/webview/main; /Users/mattias/github/nuiget/vitest.config.mts:87-89; /Users/mattias/github/nuiget/eslint.config.mjs:29-86; /Users/mattias/github/nuiget/.github/instructions/core-boundaries.instructions.md:1-50; /Users/mattias/github/nuiget/CHANGELOG.md:1-16; commands: `git status --short` (only `docs/plans/STATUS.md` modified), `git log --oneline -1` (631a13c), `wc -l` of the files in play, `grep -rn 'REMOVAL GATE: P4.9' src` (the 18 anchors the brief names), `grep -rn "sources/health\|notifySourceHealth" src`, `grep -rn "'session-changed'" src` (declared, unused), `grep -n globalPackagesFolder src/core/cli/DotnetRunner.ts`, `ls src/test/benchmarks`. Advisor tool consulted twice: before writing (per-source fan-out for N70, the first-paint constraint on `installed/get`, the directory → chain cache, the shared-provider deviation, gate counts per half, the tests to name) and on the draft (credential ordering at the activation probe, `generation` on `updates/get` and the carrier unwrapped in `queryWithRetry`, `excluded` in `versions`, `undefined` metadata never cached, the two harness assertions that could not hold, the monitor restricted to the selected directory, one `PolicyClients` set with two enrichers, the directory cache in `forProject`, the composition order of step 8); every point is folded in.
`````




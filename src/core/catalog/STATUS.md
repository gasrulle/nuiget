# STATUS — src/core/catalog   commit 05fdea9 (parent of the P2.fix-2 commit)   2026-10-13T21:30:00Z

git status --short src/core/catalog: `?? src/core/catalog/` (belongs to the P2.8 commit, together with
`?? docs/adr/009-catalog.md`, ` M docs/adr/README.md`, ` M src/core/project/index.ts`,
` M src/core/project/STATUS.md`, ` M ARCHITECTURE.md`, ` M CHANGELOG.md`, ` M docs/plans/STATUS.md` and
` M docs/plans/findings-ledger.md`)

Item: **P2.8 ADR-009 `Catalog` (use-case layer over `QueryCoordinator`); the quarry's `Catalog.ts` fixed;
`Catalog.test.ts`** (⚑, and a contract item: `docs/adr/009-catalog.md` and one row of `docs/adr/README.md`
under the sentinel).

The quarry has one file in this directory, `Catalog.ts` (413 lines, committed there in `f837f34`), no test and
no note. It was copied byte-identical before the consultation so that the advisor could read it.

Last item: **P2.fix-2** (phase review P2, blocking 2, finding C-protocol-host-7): the cacheable reads report
the generation they were computed for. The note of P2.8, which wrote the Catalog, follows unchanged below the
P2.fix-2 entries of each section.

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
baseline npx vitest run      → Test Files 78 passed (78) · Tests 2356 passed (2356)
copy from the quarry tree    → cmp: Catalog.ts identical to the quarry working tree
unmodified copy              → npm run check-types: 9 errors, all in Catalog.ts: :26 cannot find '../feeds/types'
                               (a module of P4.3/P4.4); :28 getPackageDependencies and getTransitivePackages
                               are not exports of '../project/assets'; :103 resourceKeys.sources() without its
                               argument; :357-363 five implicit any that follow from the missing feed types ·
                               npx eslint src/core/catalog: no finding · no test exists
sentinel                     → approval recorded in docs/plans/STATUS.md and in this note; then
                               .claude/.contract-change created with content P2.8; docs/adr/009-catalog.md
                               written and one row added to docs/adr/README.md; sentinel removed
npx tsc --noEmit / npm run check-types → exit 0 / exit 0 (main, tsconfig.test.json, tsconfig.vitest.json; N39)
npx eslint src / npm run lint → exit 0, no output / exit 0
npx vitest run --project backend src/core/catalog --reporter=verbose → Test Files 1 passed (1) · Tests 22 passed
                               (22); the output lists `installed resolves before evaluator` and `stale retry
                               releases handle`   (item gate)
npm test                     → Test Files 79 passed (79) · Tests 2378 passed (2378)
npx vitest run (no NUIGET_SDK_TESTS) → Tests 2375 passed | 3 skipped (2378)
npx vitest run --coverage    → exit 0 · All files 78.36 % statements, 68.41 % branches, 74.9 % functions,
                               79.72 % lines · Catalog.ts 100 of 102 lines (:121 a metadata chunk of
                               installed, which nothing emits before P4.9; :251 the abort check at the start
                               of a transitive fan-out) · src/core/** 2662 of 2704 lines, 98.45 % (floor 85 %)
npm run bench                → Test Files 17 passed (17) · Tests 104 passed | 1 skipped (105)
npm run package:vsix         → exit 0 · Tests 2378 passed · DONE  Packaged: nuiget-v1.18.9.vsix (17 files,
                               529.54 KB)
npm run check:vsix           → check:vsix: OK
npm run docs:protocol:check  → exit 0 (the protocol is unchanged)
git status                   → the plain form did not list the new docs/adr/009-catalog.md as untracked (git's
                               untracked cache); git status --porcelain --untracked-files=all does. Files were
                               added by explicit path.
negative control             → eight single mutations of Catalog.ts. Six in a first round: compute returns the
                               provisional result (3 tests fail), installed waits for the evaluation (3), an
                               SDK below 10 evaluated anyway (2), a failing context rejects (1), the sources
                               scope does not clear the listings (1), and "a stale handle is not released",
                               which no test caught: without a signal every handle is released when its value
                               settles. `stale retry releases handle` was extended with the with-signal case;
                               the mutation is now caught in queryWithRetry and in installed (1 test each).
                               The file was restored and compared (cmp) afterwards.
grep -rn "process.cwd\|feeds/\|Thenable\|child_process" src/core/catalog --include='*.ts' → no output
grep -c 'REMOVAL GATE: P4.9' src/core/catalog/Catalog.ts → 9
grep -n "ProjectContextProvider\|computeRevision" src/core/project/index.ts → 2 lines
git diff --name-only d8c7807 -- docs/adr src/protocol src/core/contracts.ts → docs/adr/README.md (and the new,
                               untracked docs/adr/009-catalog.md); grep -c '009-catalog' docs/adr/README.md → 1
ls .claude/.contract-change  → No such file or directory
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P2.8
```

## Done (tested)

- P2.fix-2, `Catalog.ts`: `CatalogValue<T>` is `{ value, generation }`. `projects`, `sources` and `transitive`
  resolve with it; the generation is that of the coordinator handle whose value resolved, so a stale retry
  reports the generation it finally resolved for, and a cache hit and a joiner report the computation's
  (`queryWithRetry`). `InstalledQueryResult` has `generation`, the same for a result with and without
  `upgrade`. The fan-outs `allProjectsInstalled` and `allProjectsTransitive` unwrap the values and report no
  generation: they are not resources (ADR-009 decision 1). `index.ts` exports `CatalogValue`.
- P2.fix-2, `Catalog.test.ts`, 25 tests: three new ones (`a cache hit and a joiner report the computation's
  generation`, `a stale retry reports the generation it finally resolved for`, `installed reports the handle's
  generation with and without an upgrade`).
- `docs/adr/009-catalog.md` (new) with the text of the ruling, and its row in `docs/adr/README.md`.
- `Catalog.ts`, rewritten from the quarry text:
  - `CatalogDeps`: `coordinator`, `inspector`, `evaluator?`, `contexts` (the `get` of `ProjectContextProvider`),
    `sources`, `assets` (two methods of `AssetsReader`), `discoverProjects`, `logger?`. No feed dependency, no
    default directory.
  - `projects()`, `sources(projectDir)` (the directory is required; key `sources:<dir>`), `transitive()`: one
    coordinator query each. `packageDependencies()` and `projectDependencies()` for `PackageWorkflows`.
  - `installed(projectPath, emit?, signal?)` → `{ result, upgrade? }` (`:110-143`). The compute function
    (`:145-176`) inspects and builds the context together; a context that fails is logged and the provisional
    result stands; an SDK below 10 is merged into `unsupported` with the packages kept; with an evaluator and
    a supported project it emits the provisional result as an internal chunk, evaluates, and returns the
    authoritative result, which is what the coordinator caches. The call resolves on the provisional chunk
    with `upgrade`, or on the value (no evaluator, unsupported, cache hit, a joiner) without it.
  - `allProjectsInstalled` and `allProjectsTransitive`: fan-outs that emit the protocol's chunk types; a
    project that fails becomes an error chunk and an `errored` entry; an evaluation that delivers something new
    adds a second chunk for its project.
  - Eight feed-dependent methods (`updates`, `allProjectsUpdates`, `transitiveMetadata`, `search`,
    `quickSearch`, `versions`, `metadata`, `readme`) throw `NotYetAvailableError` (`code: 'not-yet-available'`)
    before any query, each with `// REMOVAL GATE: P4.9`; the ninth such comment is in `invalidate`.
  - `invalidate(scope, reason)` clears the source listings for the scopes `sources` and `workspace` and always
    forwards to the coordinator.
  - Stale retry (`queryWithRetry`, `:305-321`, and the loop of `installed`): a handle that rejects with
    `StaleQueryError` is released and the query asked again, three times at most. A handle is released on the
    caller's abort, or when the value settles if there is no signal (`releaseWhenDone`, `:324-331`).
- `index.ts`: `Catalog`, `NotYetAvailableError` and five types.
- `Catalog.test.ts`, 22 tests. The two the item names: `installed resolves before evaluator` (with the real
  `DefaultQueryCoordinator` and an evaluator that is still pending) and `stale retry releases handle`. From
  the ruling: `stale retry gives up after three attempts`, `installed: sdk-too-old keeps packages and marks
  unsupported`, `installed: inspector unsupported wins`, `installed: context failure keeps the provisional
  result`, `installed: cache hit returns the authoritative without upgrade`, `feed methods throw
  not-yet-available before any query`, `invalidate: sources scope clears the source listings`, `invalidate:
  project scope does not`, `allProjectsInstalled streams protocol chunks`, `sources queries per directory`,
  `projects uses the projects key`. Further: a joiner during the evaluation, `upgrade` after a failed and after
  a superseded evaluation, release on abort, no retry for another error, the second chunk of an evaluation,
  `allProjectsTransitive`, no chunk after an abort.
- `src/core/project/index.ts` gained the exports of `context` and `revision` (approved by the ruling; noted in
  `src/core/project/STATUS.md`).

## Done (untested)

- No test uses a real evaluator: there is none until P6.2. The evaluation path runs against a fake.
- Nothing constructs the Catalog yet: the host (P2.9) and the composition root (P2.10) do.
- The lines without a test are listed by the coverage run above.

## Not started

- The feed-dependent methods and what they need: P4.9 (`resolvedSources`, source health, the metadata
  enrichment of `installed`, icons, `IconResolver.reset()` in `invalidate`, `versions` and `metadata` through
  the coordinator). They are not declared here when their signature needs a feed type.
- Outbound policy and credentials per project context: built by P4.9 from the pieces of P2.6 and P2.7.
- `configFile` attribution of `sources()` with `withConfigFiles`: P5.8.
- The `installed/get` chunk kind that carries the provisional `InstalledResult`: P6.2 (a protocol change).

## Deviations from contract/ADR (file:line each)

- P2.fix-2, `Catalog.test.ts`: five tests of P2.8 compare a return value that now has another shape; their
  expectations were rewritten to the new shape and assert one fact more each (the generation), none less:
  `answers with the provisional result alone when there is no evaluator` (`{ result, generation: 1 }`),
  `stale retry releases handle` (`{ value: [app], generation: 2 }`, twice), `projects uses the projects key`,
  `sources queries per directory`, `reads transitive packages through the coordinator and dependencies
  directly` (`{ value, generation: 1 }`). No test was removed or skipped.
- `upgrade` never rejects (`Catalog.ts:132`): it resolves with the provisional result for every rejection of
  the query, as ADR-009 decision 3 says. The ruling's code sample let a rejection other than
  `StaleQueryError` through; the ADR sentence was followed, since the only other rejections at that point are
  a released or disposed query.
- `allProjectsInstalled` sends the second chunk of a project only when the evaluation delivered a result other
  than the provisional one (`Catalog.ts:218-222`); the ruling says "emit a second `project` chunk". When the
  evaluation failed, `upgrade` resolves with the same object and there is nothing new to send.
- A stale handle receives `release()` twice: once from the retry and once from `releaseWhenDone` when its
  value settles (or on abort). `DefaultQueryCoordinator.release` is idempotent (`QueryCoordinator.ts:367-371`),
  so the second call does nothing. Noted after the P2.8 commit, recorded with P2.9.
- The parameters of the eight gated methods are prefixed with `_`: they are unused until P4.9 and the lint
  rule for unused parameters would flag them. The signatures are those of the ruling.
- The methods the quarry had and that are not declared until P4.9: `resolvedSources`, `sourceHealth`,
  `resetSourceHealth`, and the private `enrichInBackground`, `resolveIconsInBackground`, `upgradeFidelity`.
- `src/core/project/index.ts` is a file of P2.4; its extension here is a named deviation from this item's file
  list, approved by the ruling.
- The plan row says "`IconResolver.reset()` on sources/workspace invalidation": not done here, because the
  resolver is a feeds module; the gate comment in `invalidate` marks the place (`Catalog.ts:292-298`).
- The plan row says "`search` gains `sourcesUnavailable`": it is on the declared result type
  (`SearchQueryResult`, `Catalog.ts:68-72`); `search` itself is gated.

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

2026-10-12, P2.8, ⚑ and contract item (D6). Brief in the form of plan §2.4, sent on `labs/2.0` @ `d8c7807` with the
quarry's `Catalog.ts` copied byte-identical into the working tree so that it could be read, and nothing else
written. Nine questions: A the missing `src/core/feeds` and what the feed-dependent methods do until P4.9; B
`IconResolver.reset()`; C the content of ADR-009; D what `installed()` resolves with and what is cached; E the
stale retry; F a directory when a request has no project; G outbound policy and credentials per context; H the
methods that work without feeds; I the files, and the barrel of `src/core/project`. Answer of the
`architecture-advisor`, verbatim (it is the recorded approval for the sentinel; also in `docs/plans/STATUS.md`,
"Advisor decisions"):

`````text
DECISION: Approve P2.8 as a contract item for two frozen files only (`docs/adr/009-catalog.md`, new, and one row in `docs/adr/README.md`), sentinel content `P2.8`. Confirm readings A (with the error shape below), B, E, G, H (plus `allProjectsTransitive`) and I (extend the barrel). Correct D: `installed()` does not resolve with a bare `InstalledResult` and the authoritative result does not travel through `emit`; it resolves with `{ result, upgrade? }` where `upgrade` is the authoritative promise, because the envelope orders every chunk before the terminal response. Correct F: no typed error and no `defaultCwd`/`sourceCwd` deps; `sources(projectDir)` takes a required directory and the host decides which one. Correct C where its decision (1) overclaims and (5) describes what P2.8 does not build; the ADR text is under DO 3. Nothing here is the owner's.

WHY: The brief describes the tree accurately: the raw copy fails on `../feeds/types` (`Catalog.ts:26`), on the two free functions that are `AssetsReader` methods since P2.2 (`:28` vs `assets.ts:171,199`), on `resourceKeys.sources()` without its argument (`:103` vs `domain.ts:227`), reads `process.cwd()` at `:101` and `:352`, and fabricates the evaluator context at `:150-156` (`configFiles: []`, `revision: ''`), while `ProjectContextProvider.get` (`context.ts:37-60`) answers `{ context, unsupported? }` with the real chain and revision; no `src/core/feeds`, no `evaluator.ts`, no ADR-009 exist. Three facts decide D: `src/protocol/envelope.ts:4-8` and `messages.ts:4-6` make the response terminal and chunks precede it, so a host that answers with the provisional cannot deliver the authoritative afterwards; `installed/get` (`messages.ts:120`) has only a `metadata` chunk, so the chunk that carries an `InstalledResult` is a protocol change that belongs to the item that adds the evaluator (P6.2, a D6 contract item), not to P2.8; and the coordinator's cache hit (`QueryCoordinator.ts:157-160`) returns a handle attached to no computation, which receives no chunk, so whatever `compute` returns is what every later reader gets, and that must be the authoritative result or every reader after the evaluation would see the provisional forever. ADR-002:31-32 says `search/query` has no key, which corrects decision (1); `ProjectContextProvider.get` rejects when the source provider rejects (`context.ts:32-35,39-43`, by P2.5's ruling), which forces decision (4) to say that `installed()` degrades instead of propagating. `AssetsReader` is mtime-keyed (`assets.ts:65-71`) and the context provider holds no cache, so `invalidate` has exactly two calls to make in P2.8. RUN.md §4 and plan §3 step 2 forbid a stub, and the row's own words ("feed-dependent methods throw `not-yet-available` with a `// REMOVAL GATE: P4.9` comment") are the sanctioned alternative; only `resolvedSources` has a feeds type in its signature (`:109`, `ResolvedSource[]`), every other feed method is expressible in domain types. P2.5's note (`src/core/project/STATUS.md:287-289`) left the barrel to "the first importer … in its own item", and P2.10's row requires the root to import only what P2 exports from `./core/project`, so P2.8 extends `src/core/project/index.ts` under this approval.

DO:

1. Sentinel and allowed edits. Paste this answer into `src/core/catalog/STATUS.md` under `## Advisor decisions` first; then create `.claude/.contract-change` with content `P2.8`; edit only `docs/adr/009-catalog.md` (new) and `docs/adr/README.md` (one row); delete the sentinel before `git commit`. No other frozen file changes: `src/protocol/**`, `src/core/contracts.ts` and ADR-000..008 stay byte-identical (`git diff --stat -- src/protocol src/core/contracts.ts docs/adr` shows only the two files).

2. `src/core/project/index.ts` (approved here, not an item file by name): add named exports `ProjectContextProvider`, `SDK_TOO_OLD_MESSAGE`, `type ProjectContextDeps`, `type ProjectContextResult` from `./context` and `computeRevision`, `revisionInputs`, `GLOBAL_JSON_FILE` from `./revision`, in the sibling style (sorted, no `export *`). The Catalog imports from `../project`. Add one line to `src/core/project/STATUS.md` ("P2.8 extended the barrel with `context` and `revision` under the P2.8 ruling of 2026-10-12").

3. `docs/adr/009-catalog.md`, this text (decisive sentences verbatim; the Context paragraph may be reworded):

```text
# ADR-009: Catalog, the use-case layer over the query coordinator

Status: accepted · Date: 2026-10-12

## Context

Two surfaces ask the same questions about the same projects, and in 1.x each panel composed the services itself (`NuGetPanel.ts`, `NuGetSidebarPanel.ts`): both computed updates for the same project with their own refresh verbs and caches. ADR-002 gives one computation per resource and generation; ADR-004 and ADR-005 give the project model and its execution context. Missing was the one place where a read request becomes a coordinator query over those modules, so that handlers stay thin and never compose core modules themselves. The quarry's `Catalog.ts` had that role but blocked on the evaluator, fabricated the execution context and took directories from `process.cwd()` (findings C-project-catalog-2, -3 and -6).

## Decision

1. Hosts read through the `Catalog` (`src/core/catalog`) and nowhere else. The Catalog has one method per read request of `RequestMap` (`src/protocol/messages.ts`) plus the two lookups `PackageWorkflows` needs (`packageDependencies`, `projectDependencies`). Every cacheable read is exactly one `QueryCoordinator.query` under the key that `resourceKeys` builds for that request, so both surfaces share one computation per generation. Reads that ADR-002 leaves without a key (`search/query`, `search/autocomplete`, `package/readme`, `transitive/metadata`) run directly. The `allProjects/*` methods are fan-outs over the per-project resources and are not coordinator resources themselves: a cache hit delivers the final value and no chunk, and the payload of an all-projects read is its chunks; the `allProjects:*` keys of `resourceKeys` stay reserved.
2. Streams are `emit` callbacks. The chunk types of the all-projects methods are the protocol's `RequestChunk<…>` types (type-only import), so the host forwards them unchanged. The coordinator caches what the compute function returns; a cache hit and a late joiner receive that value and no chunk, so the returned value is complete on its own and chunks only precede it.
3. `installed(projectPath)` resolves as soon as the provisional result exists, with `{ result, upgrade? }`. `upgrade` is present only when an evaluation has started; it resolves with the authoritative result, or with the provisional again when the evaluation fails or the generation is superseded, and it never rejects. The coordinator caches the authoritative result when there is one, so a cache hit and a joiner during the evaluation receive `{ result: authoritative }` without `upgrade`. The host streams the provisional as a chunk and sends the authoritative as the terminal response (ADR-007: chunks precede the response); the chunk kind that carries it is added to `installed/get` by the item that adds the evaluator (P6.2), which also decides when an evaluation is needed. An evaluation never runs for an `unsupported` project.
4. Every project-scoped read builds its `ProjectExecutionContext` through `ProjectContextProvider` (ADR-005), and nothing in `src/core/catalog` reads `process.cwd()`; a read that needs a directory without a project takes it from the caller (`sources(projectDir)`), and the host decides which directory that is. A context whose SDK is below 10 is reported as `InstalledResult.unsupported = { reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' }` on the provisional result with its packages kept, because the project stays readable (D13); an `unsupported` set by the inspector is kept as it is. When the context cannot be built, the provisional result stands without evaluation and the failure is logged: a source listing that fails does not hide the package list.
5. Sources, outbound policy and credentials belong to a project context (ADR-005). A Catalog method resolves them from the context of the project the read is for, never from a workspace-wide default; the feed-dependent methods that consume them arrive with P4.9.
6. `invalidate(scope, reason)` is the single entry for invalidation. It always forwards to `QueryCoordinator.invalidate`; for the scopes `sources` and `workspace` it first clears the per-directory source listings (`SourceProvider.invalidate`), and P4.9 adds the service-index caches and `IconResolver.reset()` at the same place. Caches that check their inputs themselves (the mtime-keyed `AssetsReader`) are not cleared here.
7. A query handle is released when the caller's `AbortSignal` aborts; a call without a signal releases its handle when the value settles. A handle that rejects with `StaleQueryError` is released and the query is asked again, at most three times; the third `StaleQueryError` is thrown.
8. Breadth is frozen until P4 (plan §7): no use case is added to the Catalog without amending this record. The feed-dependent methods (`updates`, `allProjectsUpdates`, `transitiveMetadata`, `search`, `quickSearch`, `versions`, `metadata`, `readme`) are declared with domain-typed signatures and throw `NotYetAvailableError` (`code: 'not-yet-available'`) before creating any query handle until P4.9 wires the feeds; the host maps that error to the protocol error code `unsupported`.

## Consequences

- Handlers are thin: validate the payload, call one Catalog method, forward chunks, send one terminal response.
- Mutations never go through the Catalog: they are `PackageWorkflows` on the `OperationQueue` (ADR-003). The Catalog learns of them through `invalidate`.
- `search/query` carries `sourcesUnavailable` from the Catalog's `search` result (an unreachable source is not an empty result).
```

   `docs/adr/README.md`: add the row `| [009](009-catalog.md) | Catalog: the use-case layer over the query coordinator | accepted |` after row 008.

4. `src/core/catalog/Catalog.ts` deps and surface:
   - `CatalogDeps = { coordinator: QueryCoordinator; inspector: ProjectInspector; evaluator?: ProjectEvaluator; contexts: Pick<ProjectContextProvider, 'get'>; sources: SourceProvider; assets: Pick<AssetsReader, 'getPackageDependencies' | 'getTransitivePackages'>; discoverProjects: () => Promise<Project[]>; logger?: Logger }`. Delete `serviceIndex`, `search`, `updates`, `enricher`, `metadata`, `icons`, `defaultCwd`, `sourceCwd` and the `../feeds/types` import.
   - Implemented and tested: `projects(signal?)`; `sources(projectDir: string, signal?)` under `resourceKeys.sources(projectDir)` computing `deps.sources.listSources(projectDir)` (listing only; `configFile` attribution with `withConfigFiles` is not in this item: the chain comes from `dotnet nuget config paths`, which only `ProjectContextProvider.get(projectPath)` runs; put it on the tracker for P5.8); `installed(projectPath, emit?, signal?) → Promise<InstalledQueryResult>` with `InstalledQueryResult = { result: InstalledResult; upgrade?: Promise<InstalledResult> }` (replace the quarry's unused `:50-52`); `transitive(projectPath, signal?)` via `deps.assets.getTransitivePackages`; `packageDependencies(projectPath)` via `deps.assets.getPackageDependencies`; `projectDependencies(paths)` via `getProjectDependencyMap`; `allProjectsInstalled(emit, signal)` and `allProjectsTransitive(emit, signal)` with `emit: (chunk: RequestChunk<'allProjects/installed'>) => void` and `RequestChunk<'allProjects/transitive'>` respectively (type-only import from `../../protocol/messages`; the `project` member is `{ kind: 'project', chunk: { projectPath, projectName, workspaceFolder, result | error } }`); `invalidate(scope, reason)`.
   - `installed` compute function: `const [provisional, context] = await Promise.all([inspector.inspect(projectPath), contexts.get(projectPath).catch(error => { logger?.warn(...); return undefined; })])`; `merged = provisional.unsupported ? provisional : context?.unsupported ? { ...provisional, unsupported: context.unsupported } : provisional`; if `!evaluator || merged.unsupported || context === undefined` return `merged`; else `emit({ kind: 'provisional', result: merged })`, then `await evaluator.evaluate(context.context, ctx.signal)` inside try/catch (catch → return `merged`), merging as the quarry does at `:157-165` (`{ ...prior, ...p, resolvedVersion: p.resolvedVersion ?? prior.resolvedVersion }`), and return the authoritative. The internal chunk union is `{ kind: 'provisional'; result: InstalledResult } | RequestChunk<'installed/get'>`; `installed()` consumes `provisional` in its race and forwards only `metadata` chunks to the caller's `emit`.
   - `installed()` resolution: race the first `provisional` chunk against `handle.value`. Chunk first → resolve `{ result: provisional, upgrade }` where `upgrade = handle.value.catch(error => error instanceof StaleQueryError ? provisional : Promise.reject(error))`; value first (no evaluator, unsupported, cache hit, joiner) → resolve `{ result: value }`. The stale retry of step 5 applies only while the call is unresolved.
   - Gated, declared with these signatures, each body exactly `throw new NotYetAvailableError('<method>'); // REMOVAL GATE: P4.9` and nothing before it: `updates(projectPath, includePrerelease, emitFound?, signal?) → Promise<UpdatesQueryResult>`; `allProjectsUpdates(includePrerelease, emit, signal) → Promise<{ projectPaths: string[]; sourcesUnavailable?: boolean }>` with `emit: (chunk: RequestChunk<'allProjects/updates'>) => void`; `transitiveMetadata(projectPath | undefined, packages, signal?) → Promise<PackageMetadataLite[]>`; `search(options: SearchQueryOptions, emitMetadata, signal) → Promise<SearchQueryResult>` with `SearchQueryResult = { results: PackageSearchResult[]; sourcesUnavailable?: boolean }`; `quickSearch(query, sourceUrls, includePrerelease, perSource, signal) → Promise<QuickSearchSourceResult[]>`; `versions(packageId, sourceUrl | undefined, includePrerelease, signal) → Promise<string[]>`; `metadata(packageId, version, sourceUrl | undefined, signal) → Promise<PackageMetadata | undefined>`; `readme(packageId, version, sourceUrl | undefined, signal) → Promise<string | undefined>`. The ninth `// REMOVAL GATE: P4.9` comment goes into `invalidate()` at the line where `serviceIndex.clearCaches()` and `icons.reset()` return.
   - Dropped until P4.9 (not declared): `resolvedSources`, `sourceHealth`, `resetSourceHealth`, `enrichInBackground`, `resolveIconsInBackground`, `upgradeFidelity` with its hand-built context. Tracker note on the P2.9 row: the host answers `sources/list` and `sources/refresh` with `failed: []` under a `// REMOVAL GATE: P4.9` comment, and maps `NotYetAvailableError` to the protocol error code `unsupported` by its `code` field, not its message.
   - `invalidate(scope, reason)`: `if (scope.kind === 'sources' || scope.kind === 'workspace') { this.deps.sources.invalidate(); /* REMOVAL GATE: P4.9 … */ } this.deps.coordinator.invalidate(scope, reason);`.
   - Error class, exported from `Catalog.ts` and `index.ts`: `export class NotYetAvailableError extends Error { readonly code = 'not-yet-available'; constructor(readonly method: string, readonly item = 'P4.9') { super(`not-yet-available: Catalog.${method} arrives with plan item ${item}`); this.name = 'NotYetAvailableError'; } }`.
   - Keep the local `dirname` helper only if still used; otherwise delete it. No `Thenable`, no Node ≥ 20 API, no `child_process`.

5. Stale retry: keep `withRetryOnStale(run, attempts = 3)` but make `run` return the handle, and in the `catch` of a `StaleQueryError` call `handle.release()` before the next attempt; the third `StaleQueryError` is rethrown. Register the abort listener per attempt (`signal?.addEventListener('abort', () => handle.release(), { once: true })`); a call without a signal releases its handle in a `finally` on `handle.value`.

6. `allProjectsInstalled`: `projects()` → `emit({ kind: 'start', projects })` → `batchedPromiseAll(projects, …, 4)`; per project `const { result, upgrade } = await this.installed(project.path, undefined, signal)`, emit the `project` chunk with `result`, and when `upgrade` exists `await upgrade` and emit a second `project` chunk for the same path with the authoritative result before the method resolves; a rejection becomes `{ kind: 'project', chunk: { …, error: message } }` plus an `errored` entry, as in the quarry. `allProjectsTransitive` as the quarry at `:327-347` with the protocol chunk shape.

7. `src/core/catalog/index.ts`: export `Catalog`, `NotYetAvailableError`, and the types `CatalogDeps`, `InstalledQueryResult`, `UpdatesQueryResult`, `SearchQueryOptions`, `SearchQueryResult`.

8. `src/core/catalog/Catalog.test.ts`, titles the gate reads by name: `installed resolves before evaluator` (real `DefaultQueryCoordinator`, fake inspector, fake evaluator whose promise is pending: `await catalog.installed(path)` settles with `result.fidelity === 'provisional'` and `upgrade` defined while the evaluator is pending; then resolve the evaluator: `await upgrade` is `authoritative` and `coordinator.peek(resourceKeys.installed(path))?.value.fidelity === 'authoritative'`); `stale retry releases handle` (fake coordinator whose first handle rejects with `new StaleQueryError(key, 1)` and whose second resolves: assert both handles were released and the value is returned); and at least: `stale retry gives up after three attempts` (three stale handles → rejects with the third `StaleQueryError`, all three released); `installed: sdk-too-old keeps packages and marks unsupported` (fake contexts returns `unsupported`; assert `result.packages.length > 0`, `result.unsupported` equals `{ reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' }`, the evaluator is never called); `installed: inspector unsupported wins` (parse-failed stays, no sdk merge); `installed: context failure keeps the provisional result` (contexts rejects → provisional, no `upgrade`, logger warned); `installed: cache hit returns the authoritative without upgrade`; `feed methods throw not-yet-available before any query` (`for` each gated method: `rejects.toThrow(NotYetAvailableError)` and the fake coordinator's `query` was never called; `error.code === 'not-yet-available'`); `invalidate: sources scope clears the source listings` and `invalidate: project scope does not` (spy on `sources.invalidate`, assert `coordinator.invalidate` called with the scope both times); `allProjectsInstalled streams protocol chunks` (`start`, one `project` per project, error chunk for a rejecting project, `errored` in the result); `sources queries per directory` (two dirs → two keys `sources:<dir>`); `projects uses the projects key`.

9. Docs and ledger: CHANGELOG `## [Unreleased]` `### Added` one line `**2.0 catalog** — …`; ARCHITECTURE.md module-map row for `src/core/catalog/**` in the 2.0 section only; `docs/plans/findings-ledger.md`: C-project-catalog-2 "closed (P2.8: `installed()` resolves with the provisional and carries the evaluation as `upgrade`; tested with a fake evaluator, the evaluator itself arrives in P6.2)", C-project-catalog-3 "closed (P2.8: context from `ProjectContextProvider`)", C-project-catalog-6 "closed (ADR-009)", C-project-catalog-5 stays open with "P2.8 keeps the inspector's per-row `resolvedVersion` when merging an evaluation; closes at P6.2". Tracker rows: P2.8 done with the gate output; P2.9 note from step 4; P4.9 note "re-add `resolvedSources`, `sourceHealth`, `resetSourceHealth`, enrichment of `installed`, icons of `allProjectsUpdates`, `IconResolver.reset()` in `invalidate`; route `versions()`/`metadata()` through the coordinator under `resourceKeys.versions`/`metadata` (the quarry bypassed them)"; P5.8 note "`configFile` attribution of `sources()` with `withConfigFiles`"; P6.2 note "add the `installed/get` chunk kind that carries the provisional `InstalledResult` and decide when an evaluation is needed (ADR-009 decision 3)".

DO NOT:
- Do not create `src/core/feeds/types.ts` or any local `IconResolver`/`ResolvedSource` stand-in interface.
- Do not add a `ProtocolErrorCode`, a `resourceKeys` entry or an `installed/get` chunk kind in this item; the sentinel covers two ADR files only.
- Do not make `compute` return the provisional result: every cache hit would then be provisional forever (`QueryCoordinator.ts:157-160`).
- Do not deliver the authoritative result through `emit` after the method resolved; the host cannot send a chunk after the terminal response (`envelope.ts:4-8`).
- Do not let `installed()` reject because `ProjectContextProvider.get` rejected; log and return the provisional.
- Do not keep `defaultCwd`, `sourceCwd` or any `process.cwd()` fallback; no directory is guessed in core.
- Do not add `onSourcesInvalidated`, `policyFor` or `credentialsFor` seams that nothing consumes before P4.9.
- Do not call `withConfigFiles` or run `dotnet nuget config paths` from `sources()`.
- Do not wrap `allProjects/*` in `coordinator.query`; their payload is the chunks.
- Do not reword the exact comment `// REMOVAL GATE: P4.9` or the test titles the row names.
- Do not commit while `.claude/.contract-change` exists, and do not edit the barrel of any directory other than `src/core/project`.

CONTRACT CHANGE: approved for P2.8 — sentinel `.claude/.contract-change` with content `P2.8`; files allowed: `docs/adr/009-catalog.md` (new) and `docs/adr/README.md` (one row). `src/protocol/**`, `src/core/contracts.ts` and ADR-000..008 stay unchanged. `src/core/project/index.ts` is not a frozen file; its extension is approved by this ruling as a named deviation from the item's file list (record it in both `STATUS.md` files).

VERIFY:
- `npx tsc --noEmit` → 0 (with `tsc -p tsconfig.vitest.json --noEmit` → 0 via `npm run check-types`).
- `npx eslint src` → 0 errors, 0 warnings.
- `npx vitest run --project backend src/core/catalog` → green and the output lists `installed resolves before evaluator` and `stale retry releases handle`; `npm test` and `npm run bench` green.
- `grep -rn "process.cwd\|feeds/\|Thenable\|child_process" src/core/catalog` → no output.
- `grep -c 'REMOVAL GATE: P4.9' src/core/catalog/Catalog.ts` → 9.
- `grep -n "ProjectContextProvider\|computeRevision" src/core/project/index.ts` → 2 lines.
- `git diff --name-only d8c7807 -- docs/adr src/protocol src/core/contracts.ts` → exactly `docs/adr/009-catalog.md` and `docs/adr/README.md`; `grep -c '009-catalog' docs/adr/README.md` → 1.
- `ls .claude/.contract-change` → "No such file" at commit time; the commit cites P2.8, ADR-009, C-project-catalog-2, -3, -6.

Files checked: `.github/agents/architecture-advisor.agent.md`; `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:1-441` (§1-§4, rows P2.5-P2.10, P4.3-P4.9, P6.2, §7 risk table); `docs/plans/RUN.md:64-89`; `docs/plans/STATUS.md:37-48,63,79`; `docs/plans/findings-ledger.md:405-418`; `docs/adr/README.md`, `002-query-coordinator.md`, `003-operation-queue-and-dotnet-runner.md`, `004-project-model.md`, `005-execution-context-and-outbound-policy.md`; `src/core/catalog/Catalog.ts:1-413`; `src/core/contracts.ts:1-355`; `src/protocol/domain.ts:1-337`; `src/protocol/envelope.ts:1-109`; `src/protocol/messages.ts:1-200`; `src/core/queries/QueryCoordinator.ts:1-430`; `src/core/project/context.ts:1-90`; `src/core/project/assets.ts:38-100,171,199`; `src/core/project/index.ts`; `src/core/project/STATUS.md:1-60,160-190,283-312`; `src/core/project/{references,discovery,revision,inspector}.ts` export lines; `src/core/queries/index.ts`, `src/core/sources/index.ts`, `src/core/credentials/index.ts`, `src/core/ops/index.ts`; `src/core/ops/PackageWorkflows.ts:23-63`; `src/core/sources/DotnetSourceProvider.ts:18-38`, `DefaultOutboundPolicy.ts:13-20`, `merge.ts` and `NuGetConfigReader.ts` export lines; `src/core/credentials/DefaultCredentialProvider.ts:19-33`, `helpers.ts:29-32`; `src/core/util/concurrency.ts:1-30`; `src/core/sources/STATUS.md` and `src/core/credentials/STATUS.md` (advisor sections); `.github/instructions/core-boundaries.instructions.md`; `eslint.config.mjs` (LAYERS core files); `scripts/hooks/guard.mjs:9,206`; `.gitignore:57`; `ARCHITECTURE.md:10-125` headings and module-map rows 91-93; `CHANGELOG.md:1-25`; `vitest.config.mts` core include; `git status --short` (only `?? src/core/catalog/`), `git log --oneline -3` (head `d8c7807`).
`````

## Exact next step (one item ID)

P2.9 (`src/host/` through the salvage gate). Notes for it are on its tracker row: the protocol event
`resources/invalidated` takes the `keys` shape of `InvalidationEvent` (a contract change of its own), the host
maps `NotYetAvailableError` to the error code `unsupported` by its `code`, answers `sources/list` and
`sources/refresh` with `failed: []` under a `// REMOVAL GATE: P4.9` comment, and memoizes `isCpmProject` per
operation.

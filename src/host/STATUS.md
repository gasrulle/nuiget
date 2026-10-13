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

# STATUS — src/webview/shared/store   UX-P4.8a   commit a9eff968 (base; the item's commit written on it)   2026-11-20T02:49:07+01:00

git status --short (at writing): `src/webview/shared/store/installed.tsx`, `src/webview/shared/store/installed.test.tsx`,
`src/test/harness/scenarios.test.ts`, `ARCHITECTURE.md`, `docs/ux/interaction-model.md`, `.github/copilot-instructions.md`,
`CHANGELOG.md`, `docs/plans/STATUS-ux.md`, this note.

Item: **UX-P4.8a** ⚑ — the provisional chunk merges into the authoritative list (X7). Plan (architecture-advisor opening ruling,
follow-ups 1 and 2 below): a witness-based static diff in the installed slice; R5 rewritten; eleven slice cases and one harness scenario;
the ARCHITECTURE sentences, the interaction model's Revalidating row, two gotcha rows and a CHANGELOG line.

## Verified by running

Baseline on a9eff968 (UX-P4.fix-22's tree, push run 44649636923 green): tsc 0, check-types 0, eslint 0, `npm test` 184 files / 2754
passed / 9 skipped.

```text
npx tsc --noEmit → exit 0; npm run check-types → exit 0; npx eslint src → exit 0; npm run lint → exit 0
npx vitest run --project frontend src/webview/shared/store → Test Files  13 passed (13), Tests  144 passed (144)
npx vitest run src/test/harness → Test Files  1 passed (1), Tests  30 passed (30)
for i in $(seq 1 40); do npx vitest run src/test/harness/scenarios.test.ts -t "X7: a save while" || break; done → green runs: 40
npm test → Test Files  184 passed (184), Tests  2766 passed | 9 skipped (2775), [axe-coverage] 77 files, 42 rules passed somewhere, 0 missing
npm run test:coverage → exit 0; All files 96.48 | 91.12 | 95.56 | 96.83 (statements | branches | functions | lines)
npm run bench → exit 0
node esbuild.mjs --production --analyze → dist/extension.js 300609 / 326720; dist/webview.js 604556 / 613761; dist/sidebar.js 373343 / 374532
npm run package:vsix → DONE  Packaged: nuiget-v2.0.0.vsix (17 files, 623.35 KB); npm run check:vsix → check:vsix: OK
npm run docs:check → docs:check — the documents agree with the tree. / docs:protocol:check — docs/protocol.md is up to date.
npm run check:matrix → check:matrix — 325 rows: 320 covered, 2 gap, 3 manual-credentials; 0 finding(s).
grep -c "onScreen.current === undefined" src/webview/shared/store/installed.tsx → 1; grep -c "setProvisional(undefined)" … → 1 (the conditional one)
grep -c "a cache hit, a joiner" ARCHITECTURE.md → 0; grep -c "a cache hit and a joiner get none" ARCHITECTURE.md .github/copilot-instructions.md → 0, 0
git diff --stat a9eff968 -- src/core src/protocol src/host src/webview/shared/store/useResource.ts src/test/harness/FakeWebview.ts src/test/harness/fakeDotnet.ts src/test/harness/harness.ts → empty
```

Red first: with the new tests and `installed.tsx` of a9eff968, R5 and four X7 cases fail (5 failed, 12 passed); "X7: a provisional list
replaces a provisional one during a revalidation" passes on both, as ruled. Follow-up 2's case on the staged code before its fix:

```text
npx vitest run --project frontend src/webview/shared/store/installed.test.tsx -t "a first-load chunk is not shown again"
     × X7: a first-load chunk is not shown again when its project is selected a second time 14ms
Expected: "none"
Received: "Serilog"
 ❯ src/webview/shared/store/installed.test.tsx:273:34
→ after follow-up 2 DO 1: Tests  23 passed (23)
```

The total reconciles as 2754 + 11 slice cases + 1 scenario = 2766: `installed.test.tsx` had 12 cases (the first ruling counted 11), R5 is
rewritten in place and eleven are added (23 now). The sidebar bundle has 1,189 bytes left under its ceiling.

## Visual evidence (UI items)

None: a store change with no capture state of its own; the push run's `[diff] summary` lands in the tracker row with the next item.

## Done (tested)

- `installed.tsx`: `mergeProvisional` and `mergeRows` (module-level, not exported) apply the static changes between the provisional list
  that came with the answer on screen (the witness, a `WeakMap` from answer to chunk filled in the requester's `.then`) and the latest
  chunk to an evaluated list; the latest chunk is kept with the answer it came over (`over`, a ref assigned during render) and counts
  only while that answer is on screen and the request unanswered; a request that starts with no list on screen drops the chunk
  (follow-up 2), over a list it stays (DO 1-7).
- `installed.test.tsx`: R5 rewritten in place as "R5: the provisional chunk is shown while the key has no evaluated list, its static changes
  are merged into an evaluated one, and a chunk of an earlier request or another project is not shown" (the old title: "R5: the
  provisional chunk of the latest request is shown until its response replaces it, and a chunk of an earlier request or another project
  is not"); eleven new cases, titles 13-23 below; the `Packages` probe gains `rows`, `fidelity` and `detail` (DO 8, follow-up 2 DO 3-4).
  The case "asks for the provisional rows at once and again on the response only when the rows differ" is unmodified.
- `scenarios.test.ts`: "X7: a save while the list is authoritative streams the provisional list to both surfaces, and each keeps the
  evaluated list until the answer" (DO 9 as amended by follow-up 1).
- Docs (DO 10; follow-up 1 DO 4 and 6; follow-up 2 DO 5-6): `ARCHITECTURE.md:95` (the Catalog row's chunk clause) and `ARCHITECTURE.md:511`
  (the installed slice's provisional sentences), `docs/ux/interaction-model.md:105` (Revalidating row), `.github/copilot-instructions.md`
  rows "Removing a row when an operation succeeds" (:238) and "`installed/get` streams the provisional list, not metadata", `CHANGELOG.md`
  Fixed "**Installed packages no longer vanish and return after a save or an operation**".
- For the planning session: `precommit-review` wf_173a12b8-546 returned one confirmed blocking finding (a first-load chunk shown again when
  its project is selected a second time after a cached project), fixed under follow-up 2; its three non-blocking findings are fixed (the
  five branch cases, `ARCHITECTURE.md:95`, this note's file list). A second `precommit-review` wf_898b0341-378 on the staged change: blocking 0,
  nonBlocking 1 (a 203-character line in the `ARCHITECTURE.md` bullet, re-wrapped), refuted 0, incomplete [], reviewersAnswered 3.

`installed.test.tsx` titles, in order:

```text
     1	R3: asks installed/get when the applied snapshot selects a real project, and for another when it selects another
     2	R3: asks for nothing without a project and in all-projects mode
     3	R3: follows the committed selection, not a pending one of this surface
     4	R3: asks again when resources/invalidated names the key of the selected project, and only then
     5	R4: the answer for the project that was left is dropped
     6	R7: a result below the generation listed for the project is not applied
     7	R5: the provisional chunk is shown while the key has no evaluated list, its static changes are merged into an evaluated one, and a chunk of an earlier request or another project is not shown
     8	an error ends loading, and Retry asks again
     9	the hook fails with a clear message without a provider
    10	asks transitive/metadata for the concrete versions of the answered list and keeps the answer by id for that project
    11	a newer list or another project cancels the ask; an error answer is no metadata
    12	asks for the provisional rows at once and again on the response only when the rows differ
    13	X7: a first-load chunk is not shown again when its project is selected a second time
    14	X7: an unchanged static row takes the chunk's resolved version and keeps the evaluated row
    15	X7: a new id with two chunk rows is added with both
    16	X7: a re-versioned row keeps the evaluated row's isImplicit and target frameworks
    17	X7: an unsupported evaluated list stays as it is under a chunk
    18	X7: a chunk whose isCpm differs from the witness's leaves the evaluated list as it is
    19	X7: an evaluated list answered without a provisional chunk stays as it is under a later chunk
    20	X7: two invalidations before an answer keep the merge of the first chunk until the second arrives
    21	X7: an unresolved chunk row and an id with two rows leave the evaluated rows of that id untouched
    22	X7: a provisional list replaces a provisional one during a revalidation
    23	X7: a chunk without a static change asks transitive/metadata for nothing, and an added row asks for the merged rows
```

## Done (untested)

None.

## Not started

Nothing: the item closes with this commit once its push run is green.

## Deviations from contract/ADR/decision

- None from a contract or ADR (no sentinel; ADR-009 clause 3 unchanged and still true).
- Files beyond the plan's §2.1 set, authorised by the rulings: `src/test/harness/scenarios.test.ts` (the X7 scenario), `docs/ux/interaction-model.md:105`,
  `.github/copilot-instructions.md:238` and the row "`installed/get` streams the provisional list, not metadata".
- Residual (follow-up 1 DO 5): a surface whose list on screen came from the cache, or from a computation it joined after the provisional
  was streamed, takes no static change until its next answered request that streamed one; until then it behaves as Option 2.

## Advisor decisions

2026-11-20, UX-P4.8a, architecture-advisor opening consultation. Question: "Which merge, exactly: the field-by-field rule …, the removal
rule …, the merged list's `fidelity` and the badge, what the two-phase metadata ask keys on while merged, where the code lives …, which
`installed.test.tsx` titles are rewritten (R5 named) and with which expectations, the harness scenario's shape …, the ARCHITECTURE
sentence's new text, and any other doc … that moves." Answer, verbatim:

> CORRECTIONS TO THE BRIEF (checked against the tree at a9eff968)
> - `resolvedVersion` is not evaluated-only. The inspection reads it from the assets file (`src/core/project/inspector.ts:142-158`), the evaluator never sets it, and the Catalog copies it from the inspection into the answer (`src/core/catalog/Catalog.ts:212-219`). It comes from the chunk.
> - The static pass does see TFM-conditioned references (`inspector.ts:59`, `:255-271`) and lists a property-driven or otherwise-conditioned one as an `unresolved` row (`:286-288`). What it cannot see is: SDK-implicit rows, items in any import other than the nearest `Directory.Build.props`, items under `Choose/When` (it reads top-level `ItemGroup`s only, `:194`) and globbed or property `Include`s (`:61`, `:309`). No field of `InstalledPackage` marks those: a central row carries `definedIn` even when its reference is in the project file (`inspector.ts:305`, `evaluator.ts:205`), and a `Choose/When` row is a plain `project` row.
> - The ARCHITECTURE sentence is at `ARCHITECTURE.md:511-515`, not `:440-442`.
> - `docs/ux/interaction-model.md:105` already says "a provisional answer never replaces rows already shown (X7)".
> - Every operation invalidates `installed:<path>` twice, for the operation and for the watcher (`src/test/harness/scenarios.test.ts:617-624`), and `useResource` aborts the unanswered request on the second (`src/webview/shared/store/useResource.ts:76-77`). The merge has to survive that.
>
> DECISION: Option 1, refined into a static diff: the changes between two provisional lists of the same project are applied to the evaluated list on screen. Not Option 2 (the plan row names the per-id merge) and not Option 3 (removals without a witness would remove evaluated-only rows on every save). Not the owner's call.
>
> WHY:
> - Plan §5 row P4.8a and research §13 (`docs/research/2026-10-23-ux-research.md:418-422`, X7's consequence correction) fix the per-id merge with removals of statically visible rows only.
> - A field heuristic for "statically visible" leaks in both directions (corrections above), so the only exact witness the slice has is the provisional list that came with the answer on screen.
> - `useResource` stores `answer.result` by identity (`useResource.ts:97`), so the witness can be derived from `resource.data` and a superseded or generation-dropped request never becomes it.
> - ADR-009 clause 3 (`docs/adr/009-catalog.md:13`) covers only the host's stream and response ("The evaluated row is complete and wins"). The merge keeps that on the webview side and changes no contract.
>
> DO:
> 1. Edit only `src/webview/shared/store/installed.tsx` for product code. Keep `useResource`, the protocol and core unchanged. The merge is a module-level pure function in that file, not exported and not a new file.
> 2. Witness. Keep a `useRef(new WeakMap<InstalledResult, InstalledResult>())`. In `requester`, hold the request's chunk in a local variable. Chain `.then(answer => { if (chunk !== undefined) { map.set(answer.result, chunk); } return answer; })` before returning the promise. The witness of what is shown is `resource.data === undefined ? undefined : map.get(resource.data)`. A cache hit or a joiner has none.
> 3. Latest chunk. Remove `setProvisional(undefined)` at request start. Store each chunk as `{ projectPath, result, over }`, where `over` is `resource.data` at arrival, read through a ref assigned during render. Keep the `signal.aborted` guard. A chunk counts only while `provisional.projectPath === projectPath && provisional.over === resource.data && unanswered`. An applied answer therefore retires it by identity, and a chunk of an aborted request stays until a newer chunk or an answer. After the operation's second invalidation the uninstalled row does not come back.
> 4. What `result` is while a chunk counts:
>    - (a) `resource.data` undefined, or its `fidelity` is `'provisional'`: the chunk as it is (today's behaviour).
>    - (b) `resource.data` is authoritative and has no witness, or `resource.data.unsupported` is set, or `chunk.isCpm !== witness.isCpm`: `resource.data` unchanged.
>    - (c) otherwise: `merge(resource.data, witness, chunk)`.
>    - Compare the chunk with the witness only, never an inspector path with an MSBuild path.
> 5. Merge, per lower-cased id, with `a` = evaluated rows, `w` = witness rows, `p` = chunk rows of that id. "Static form" of a row is its JSON without `resolvedVersion`; `p` equals `w` when both have the same number of rows with the same static forms in order.
>    - `p` empty, `w` non-empty: the reference left the files; drop `a`.
>    - `p` empty, `w` empty: evaluated-only; keep `a`.
>    - `p` equals `w`: nothing changed statically; keep `a` (none if `a` is empty). When `a` and `p` are one row each and `p[0].resolvedVersion` is defined and differs, the row is `{ ...a[0], resolvedVersion: p[0].resolvedVersion }`.
>    - `p` differs from `w` (or `w` is empty):
>      - `a` or `p` has more than one row: keep `a` when it is non-empty, else add `p`.
>      - `p[0].declaration === 'unresolved'` and `a` has a row: keep `a`.
>      - otherwise the row is `p[0]`, with `isImplicit: true` when `a[0]` had it and `a[0].targetFrameworks` when `p[0]` has none. Carry nothing else; never `vulnerabilities`, `iconUrl`, `verified` or `authors`.
>    - Order: the evaluated rows' order; rows of a new id after them in chunk order.
>    - The result is `{ ...resource.data, packages }`, so `fidelity`, `isCpm` and `centralPropsPath` stay the evaluated ones and the Provisional badge does not appear.
>    - When no row changed, return `resource.data` itself.
>    - Compute it in a `useMemo` on `[resource.data, witness, chunk]`.
> 6. Metadata ask: no code change. It stays keyed on `asked` of what is shown. An unchanged merge yields the same string and asks nothing; an added or re-versioned row asks for the merged rows and cancels the earlier ask.
> 7. Rewrite the `result` doc comment of `InstalledState` (`installed.tsx:12-15`) and the comment at `:42` to say the above.
> 8. `src/webview/shared/store/installed.test.tsx`: rewrite R5 (the one named title) and add five tests. The `Packages` probe may gain outputs for `id@version` and `fidelity`. No other existing title changes; the test at `:227` must pass unmodified.
>    - R5, new title "R5: the provisional chunk is shown while the key has no evaluated list, its static changes are merged into an evaluated one, and a chunk of an earlier request or another project is not shown".
>      - First load as today.
>      - The authoritative answer holds Serilog 1.0.0, Moq 1.0.0, Props.Driven 2.0.0 and an implicit `props` row with `definedIn`.
>      - Chunk 1 held Serilog, Moq and Props.Driven as `unresolved`.
>      - After an invalidation, chunk 2 holds Serilog 1.1.0, Props.Driven `unresolved` and xunit.
>      - Expect, in order: `Serilog@1.1.0`, `Props.Driven@2.0.0`, the implicit row, `xunit@1.0.0`; Moq gone; `fidelity` `authoritative`; status `ready revalidating`.
>      - The response then replaces it. The other-project part stays as it is.
>    - "X7: an evaluated list answered without a provisional chunk stays as it is under a later chunk". The first answer has no chunk; the revalidation's chunk lacks a row and adds one; the ids are unchanged.
>    - "X7: two invalidations before an answer keep the merge of the first chunk until the second arrives". The chunk of request 2 removes Moq. After the second invalidation Moq is still absent before chunk 3, and absent after chunk 3. `host.cancelled()` contains request 2.
>    - "X7: an unresolved chunk row and an id with two rows leave the evaluated rows of that id untouched".
>    - "X7: a provisional list replaces a provisional one during a revalidation" (branch 4a).
>    - "X7: a chunk without a static change asks transitive/metadata for nothing, and an added row asks for the merged rows".
> 9. Harness: one new scenario in `src/test/harness/scenarios.test.ts`. This ruling authorises that file and no other harness file. Title: "X7: a save while the list is authoritative streams one provisional chunk and the surfaces keep the evaluated list until the answer".
>    - Setup: `createHarness({ tree: { 'A/A.csproj': projectXml(['Serilog','3.0.0'], ['Moq','4.20.0']) }, selectedProject: 'A/A.csproj', evaluate: true })`. Resolve both surfaces; `expectState` authoritative.
>    - Hold `h.dotnet.hold(dotnetCalls.msbuild(A))`, write the project with Serilog 3.1.0 and without Moq (`h.files.writeProject`), advance `WATCHER_DEBOUNCE_MS`, settle on `seen === 1`.
>    - While held, assert:
>      - The provisional chunks of the two surfaces' latest `installed/get` total exactly one, with `fidelity: 'provisional'` and `Serilog@3.1.0` alone.
>      - Both models still show `Serilog@3.0.0` and Moq with `fidelity` `authoritative`.
>      - Each has its request pending.
>    - Release, then assert:
>      - `expectState` `['Serilog@3.1.0']`, authoritative.
>      - The applied generation equals the one the last invalidation listed.
>      - The msbuild count for A is 2.
>      - `expectOneResponsePerRequest` on both.
>    - Confirm first that an msbuild hold is seen after a save. If it is not, or the chunk total is not one, stop and ask with the observed calls.
> 10. Docs. This ruling authorises the two files outside §2.1.
>     - `ARCHITECTURE.md:511-515`: replace "While the request is unanswered … the response replaces it." with:
>       "While a request is unanswered, the latest `provisional` chunk received since the answer on screen is used (a chunk of another project or of an aborted request that arrives late never is). With no list, or over a provisional one, it is shown as `result`. Over an evaluated list it is merged per package id against the provisional list that came with that answer: a reference gone from the files leaves, a new or re-versioned one is taken from the chunk, and every other evaluated row, the `fidelity` included, stays. Without that earlier provisional list (a cache hit, a joiner) the evaluated list stays as it is. The response replaces it (X7, UX-P4.8a)."
>       Change the following clause to "…for the list it shows at once and for the response only when its rows differ…". Line 155 stays.
>     - `docs/ux/interaction-model.md:105`: end the rule with "a provisional answer never replaces an evaluated list: its static changes are merged into the rows shown (X7)".
>     - `.github/copilot-instructions.md:238`: append to the row "Removing a row when an operation succeeds" the sentence: "The one place a row leaves before the answer is the installed slice's merge of a provisional chunk into an evaluated list (UX-P4.8a); never copy that merge into a feature or the all-projects slice, and never show a chunk in place of an evaluated list."
>     - `CHANGELOG.md` `[Unreleased]` `### Fixed`: "- **Installed packages no longer vanish and return after a save or an operation**".
> 11. STATUS note: list R5 as rewritten and the six new titles (five slice tests, one scenario), paste the gates, and record the residual. The residual: a surface that got its list from the cache or joined a computation takes no static change until the response, and between a first answer without a chunk and the next answered request the list behaves as Option 2.
>
> DO NOT:
> - Touch `src/core/**`, `src/protocol/**`, `src/host/**`, `useResource.ts`, the all-projects slice, `FakeWebview.ts`, `fakeDotnet.ts` or `harness.ts`.
> - Decide "statically visible" from `declaration`, `definedIn` or `isImplicit`, or take a removal without a witness.
> - Tie the witness to "the previous request"; it is the chunk of the answer on screen only.
> - Count `resolvedVersion` in the static comparison, or compare `centralPropsPath`.
> - Set the merged list's `fidelity` to `provisional`, or let an `unresolved` chunk row overwrite a resolved one.
> - Build P4.8b's settling state or bar, or P4.9's earlier emit.
> - Import core into the webview, or export the merge for the harness.
> - Change any test title other than R5, or the assertions of the test at `installed.test.tsx:227`.
>
> CONTRACT CHANGE: none. No sentinel. ADR-009 clause 3 is unchanged and still true.
>
> VERIFY:
> - `npx vitest run --project frontend src/webview/shared/store` → green; `installed.test.tsx` lists the rewritten R5 and the five new titles (16 tests in the file).
> - `npx vitest run src/test/harness` → green with the new scenario.
> - `for i in $(seq 1 40); do npx vitest run src/test/harness/scenarios.test.ts -t "X7: a save while" || break; done` → 40 green runs.
> - `git diff --stat a9eff968 -- src/core src/protocol src/host src/webview/shared/store/useResource.ts src/test/harness/FakeWebview.ts src/test/harness/fakeDotnet.ts src/test/harness/harness.ts` → empty.
> - `grep -c "setProvisional(undefined)" src/webview/shared/store/installed.tsx` → 0.
> - `npx tsc --noEmit`, `npm run check-types`, `npx eslint src` → 0.
> - `npm test` → 184 files, 2760 passed (2754 + 6), 9 skipped.
> - `npm run bench` → green.
> - `npm run docs:check` → 0.
> - `node esbuild.mjs --production --analyze` → three sizes pasted, under their ceilings.
>
> NOT VERIFIED BY ME (read-only):
> - That a `dotnetCalls.msbuild(A)` hold is hit after a save in the harness. The scenarios only count msbuild calls today; step 9 makes the worker confirm it.
> - That exactly one surface receives the chunk when both revalidate. This follows from `Catalog.ts:170` and ADR-009 clause 3, but I did not run it.
>
> Files: /Users/mattias/github/nuiget/src/webview/shared/store/installed.tsx, /Users/mattias/github/nuiget/src/webview/shared/store/installed.test.tsx, /Users/mattias/github/nuiget/src/webview/shared/store/useResource.ts, /Users/mattias/github/nuiget/src/test/harness/scenarios.test.ts, /Users/mattias/github/nuiget/src/core/catalog/Catalog.ts, /Users/mattias/github/nuiget/src/core/project/inspector.ts, /Users/mattias/github/nuiget/src/core/project/evaluator.ts, /Users/mattias/github/nuiget/docs/adr/009-catalog.md, /Users/mattias/github/nuiget/ARCHITECTURE.md, /Users/mattias/github/nuiget/docs/ux/interaction-model.md, /Users/mattias/github/nuiget/.github/copilot-instructions.md, /Users/mattias/github/nuiget/CHANGELOG.md
Follow-up 1 (the DO 9 stop: each surface's latest request carries one chunk, total 2). Question: "Which assertion, exactly, and does the title stay ("streams one provisional chunk")? Any other change to DO 9 or to the docs text of DO 10 …?" Answer, verbatim:

> CORRECTION TO MY FIRST RULING: I was wrong that a joiner gets no chunk. `src/core/queries/QueryCoordinator.ts:122` says "Chunks reach every unreleased handle that joined the computation", and its `emit` (`:294-301`) calls every unreleased subscription's `onChunk`. There is no replay, so only a handle that joins after the provisional was emitted, or a cache hit, gets none (`Catalog.ts:170`; ADR-009 clause 3's "during the evaluation"). Your reading is right.
>
> DECISION: Option 1. Assert exactly one provisional chunk on each surface's latest `installed/get` (total 2).
>
> WHY:
> - Both surfaces ask on the same `resources/invalidated` event, before the inspection and the config walk have produced the provisional, so both handles are on the computation when it emits. Your observed call order and chunk lists match that.
> - This is the deterministic shape of the scenario. Option 2 would also pass if a surface silently lost its chunk, which is the regression the slice's merge depends on not happening.
> - It also shows the merge is not best-effort on one surface: after a save both surfaces get the static diff.
>
> DO:
> 1. In the scenario, replace the "total exactly one" assertion with a per-surface one. For each of `sidebar` and `main`, `chunksFor<'installed/get'>(latestId('installed'))` equals exactly one chunk: `{ kind: 'provisional', result: objectContaining({ projectPath: A, fidelity: 'provisional' }) }` whose packages are `Serilog@3.1.0` alone. Label each expectation with the surface.
> 2. Retitle it: "X7: a save while the list is authoritative streams the provisional list to both surfaces, and each keeps the evaluated list until the answer". The rest of DO 9 stays as written.
> 3. Run the 40-run loop on the new title. If any run shows a surface with no chunk, stop and ask with that run's call order; do not weaken to "at most one".
> 4. `ARCHITECTURE.md:511-515` (DO 10 text): replace "Without that earlier provisional list (a cache hit, a joiner) the evaluated list stays as it is." with "Without that earlier provisional list (the answer came from the cache, or the surface joined the computation after the provisional was streamed) the evaluated list stays as it is."
> 5. STATUS note residual (DO 11): replace it with "a surface whose list on screen came from the cache, or from a computation it joined after the provisional was streamed, takes no static change until its next answered request that streamed one; until then it behaves as Option 2". Record this follow-up ruling beside the first.
> 6. `.github/copilot-instructions.md`, row "`installed/get` streams the provisional list, not metadata": change "a cache hit and a joiner get none (ADR-002)" to "a cache hit and a surface that joins after the chunk was streamed get none (ADR-002)". This ruling authorises that one clause; nothing else in the row changes.
> 7. The interaction model, CHANGELOG and the other gotcha sentence of DO 10 stay as ruled.
>
> DO NOT:
> - Assert a total across surfaces, or "at least one".
> - Change `QueryCoordinator`, `Catalog` or `FakeWebview` to make one surface a joiner.
> - Resolve only one surface to sidestep the question.
> - Edit ADR-009 or ADR-002; both are still true.
>
> CONTRACT CHANGE: none.
>
> VERIFY:
> - `for i in $(seq 1 40); do npx vitest run src/test/harness/scenarios.test.ts -t "X7: a save while" || break; done` → 40 green runs.
> - `npx vitest run src/test/harness` → green.
> - `grep -c "a cache hit, a joiner" ARCHITECTURE.md` → 0.
> - `grep -c "a cache hit and a joiner get none" .github/copilot-instructions.md` → 0.
> - `npm test` → 184 files, 2761 passed (2754 + six slice tests + one scenario), 9 skipped. My first ruling's 2760 and "16 tests in the file" were miscounts: the file had 11, R5 is rewritten in place and five are added, which gives 16, so your 17 means the file had 12 or six cases were added. Paste the actual title list and reconcile the total against it.
> - `npm run docs:check` → 0.
>
> Files: /Users/mattias/github/nuiget/src/core/queries/QueryCoordinator.ts, /Users/mattias/github/nuiget/src/core/catalog/Catalog.ts, /Users/mattias/github/nuiget/src/test/harness/scenarios.test.ts, /Users/mattias/github/nuiget/ARCHITECTURE.md, /Users/mattias/github/nuiget/.github/copilot-instructions.md
Follow-up 2 (precommit-review wf_173a12b8-546: one confirmed blocking finding against DO 3, three non-blocking). Question: "Which fix exactly, the new slice case's title and steps …, whether the five non-blocking cases are added in this item (titles), and the exact ARCHITECTURE.md:95 wording; and whether any text you ruled … changes." Answer, verbatim:

> DECISION: Option 1, the reviewer's fix: `requester` clears `provisional` when it starts with no list on screen. The five non-blocking cases and the `ARCHITECTURE.md:95` rewording land in this item. The finding is real and my DO 3 caused it.
>
> WHY:
> - With no list on screen, `over` is `undefined` for every project, so it cannot tell two visits to a project apart. On the return to A, `useResource` answers `data: undefined` because `stored.key` is B (`src/webview/shared/store/useResource.ts:124-127`), and the old chunk matches the predicate.
> - The effect that calls `requester` runs after the render in which the key changed, and that render assigned `onScreen.current = undefined`. So the request for B clears the chunk before anything of A can show again. A Retry after a first-load error and a second request with no list are also cleared, which is the pre-item behaviour.
> - Over an evaluated list `onScreen.current` is defined and nothing is cleared, so DO 3's purpose (the operation's second invalidation) stands.
> - Option 2 adds a request counter the slice does not otherwise need, and it would still have to special-case "keep across an abort only with data", which is the same condition.
> - I checked the All Projects route as the refuter did. On the return to A the data is the old answer. A chunk that arrived over that same answer and was never answered is shown merged again until the new request's chunk; that is DO 3's rule (a static read newer than the list), not a stale first-load list, and it stays.
>
> DO:
> 1. `src/webview/shared/store/installed.tsx`, first statement of `requester`: `if (onScreen.current === undefined) { setProvisional(undefined); }`. Change nothing else there: the predicate, the `signal.aborted` guard and the witness map stay.
> 2. Update the comment on the `provisional` state to: "The latest provisional chunk. A request that starts with no list on screen drops it; over a list it stays until a newer chunk or an answer."
> 3. Add the blocking case to `installed.test.tsx`, titled "X7: a first-load chunk is not shown again when its project is selected a second time". Steps:
>    - Snapshot rev 1 selects A; the first request gets a chunk with Serilog; expect packages `Serilog`.
>    - `session/changed` rev 2 selects B; expect `none`.
>    - B is answered with xunit and no chunk; expect `xunit`.
>    - `session/changed` rev 3 selects A; expect packages `none` and status `loading`.
>    - A chunk on the new A request with Moq; expect `Moq`.
>    - Its answer; expect the answer's rows and status `ready`.
>    - The case must fail on the staged code without step 1; paste that red run in the note.
> 4. Add the five branch cases to the same file, one each:
>    - "X7: an unchanged static row takes the chunk's resolved version and keeps the evaluated row". The evaluated row is floating `3.*` resolved to 3.1.0; the chunk has the same static form resolved to 3.2.0. Expect the evaluated `version` and other fields with `resolvedVersion` 3.2.0, and `fidelity` authoritative.
>    - "X7: a new id with two chunk rows is added with both". The id is in neither the witness nor the evaluated list; both rows show, after the evaluated rows.
>    - "X7: a re-versioned row keeps the evaluated row's isImplicit and target frameworks". The evaluated row has `isImplicit: true` and `targetFrameworks: ['net8.0']`; the chunk row has a new version and neither field. Expect the new version with both fields.
>    - "X7: an unsupported evaluated list stays as it is under a chunk". The evaluated answer is authoritative with `unsupported: { reason: 'sdk-too-old', … }` and has a witness; a chunk that drops a row changes nothing.
>    - "X7: a chunk whose isCpm differs from the witness's leaves the evaluated list as it is".
>    - The `Packages` probe may gain what these read (`resolvedVersion`, `isImplicit`, `targetFrameworks`); no existing assertion changes.
> 5. `ARCHITECTURE.md:95` (module-map row of `src/core/catalog/**`): replace "(the request's only chunk; a cache hit and a joiner get none)" with "(the request's only chunk; a cache hit and a request that joins after it was streamed get none)".
> 6. `ARCHITECTURE.md` installed-slice sentence (my first ruling's DO 10 as amended by follow-up 1): change its first sentence to "While a request is unanswered, the latest `provisional` chunk received since the answer on screen is used; a request that starts with no list on screen drops the chunk before it, and a chunk of another project or of an aborted request that arrives late is never used." The rest of that text stays.
> 7. The R5 title stays; it is true again with step 1. The `result` doc comment of `InstalledState` stays.
> 8. STATUS note: record this ruling, the precommit-review finding with its workflow id, the red-then-green run of step 3, and the six added titles. Then run `precommit-review` again on the staged change before the commit.
>
> DO NOT:
> - Restore the unconditional `setProvisional(undefined)`; the uninstalled row would come back on the watcher's invalidation.
> - Add a request counter or token to the stored chunk, or touch `useResource.ts`.
> - Clear the chunk from an effect on `projectPath`; the requester is the one place.
> - Change the predicate to special-case `over === undefined`.
> - Fold the five branch cases into R5 or into one test.
>
> CONTRACT CHANGE: none.
>
> VERIFY:
> - `npx vitest run --project frontend src/webview/shared/store` → green; `installed.test.tsx` lists the six new titles (your 17 plus 6 = 23 tests).
> - With step 1 reverted in the working tree only, `npx vitest run --project frontend src/webview/shared/store/installed.test.tsx -t "a first-load chunk is not shown again"` → red at the `none` expectation after rev 3; restore step 1 → green.
> - `grep -c "onScreen.current === undefined" src/webview/shared/store/installed.tsx` → 1.
> - `grep -c "a cache hit and a joiner get none" ARCHITECTURE.md` → 0.
> - `npx tsc --noEmit`, `npm run check-types`, `npx eslint src` → 0.
> - `npm test` → your last green total plus 6, 9 skipped.
> - `npm run docs:check` → 0.
> - `npm run test:coverage` → thresholds held.
> - `precommit-review` → no blocking finding.
>
> NOT VERIFIED BY ME (read-only): the red run of step 3 on the staged code. I traced it through `useResource.ts:124-127` and the staged predicate but did not run it.
>
> Files: /Users/mattias/github/nuiget/src/webview/shared/store/installed.tsx, /Users/mattias/github/nuiget/src/webview/shared/store/installed.test.tsx, /Users/mattias/github/nuiget/src/webview/shared/store/useResource.ts, /Users/mattias/github/nuiget/ARCHITECTURE.md
## Exact next step

P4.8b, once this commit's push run is green.

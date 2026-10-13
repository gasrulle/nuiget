# STATUS — src/test/benchmarks   commit 3b2e3e3 (parent of the P2.12 commit)   2026-10-13T19:30:00Z

Scope of this note: the benchmarks of the 2.0 core (`src/test/benchmarks/core-*.bench.ts`), the runner helper
(`benchmark.ts`, `benchmark.test.ts`, `run.mjs`) and `benchmarks/baseline.json`. The 1.x benchmarks in this
directory (`cache`, `csproj-parsing`, `http`, `markdown`, `metadata`, `project-parsing`,
`queryAllProjectsTransitive`, `react-rendering`, `search-query`, `search`, `source-health`, `update-checking`,
`utils`, and `setup.ts`) are listed by name only: they are P8.2's.

git status --porcelain --untracked-files=all: `?? src/test/benchmarks/core-queries.bench.ts`,
`?? src/test/benchmarks/STATUS.md`, ` M tsconfig.vitest.json`, ` M benchmarks/baseline.json`,
` M benchmarks/README.md`, ` M ARCHITECTURE.md`, ` M CHANGELOG.md`, ` M .github/copilot-instructions.md`,
` M docs/plans/STATUS.md`, ` M docs/plans/findings-ledger.md` (all belong to the P2.12 commit)

Item: **P2.12 benches (queue, scopes), ARCHITECTURE 2.0, CHANGELOG** (stop-and-ask: where the benches live
and which configuration file the item may touch; no contract change, no sentinel).

## Verified by running

```text
baseline npx tsc --noEmit / npm run check-types → exit 0 / exit 0
baseline npx eslint src      → exit 0
baseline npx vitest run      → Test Files 83 passed (83) · Tests 2481 passed | 3 skipped (2484)
npx tsc --noEmit             → exit 0
npm run check-types          → exit 0 · npx tsc -p tsconfig.vitest.json --listFilesOnly | grep -c
                               "src/test/benchmarks/" → 6 (the four core-*.bench.ts, benchmark.ts,
                               benchmark.test.ts): the 2.0 benches are type-checked from this item on
npx eslint src / npm run lint → exit 0, no output / exit 0
npm run bench                → exit 0 · Test Files 18 passed (18) · Tests 112 passed | 1 skipped (113);
                               core-queries.bench.ts listed with 8 tests
npm run bench:save           → exit 0 · Saved 103 benchmark measurements to benchmarks/baseline.json.
npm run bench:compare        → exit 0 · Test Files 18 passed (18) · Tests 112 passed | 1 skipped (113); no
                               "Missing or invalid benchmark baseline" line
baseline entries             → 103 (71 of 1.x + 13 versioning + 8 cache + 3 ops + 8 queries); 32 for core-* files,
                               8 for core-queries
npm test (NUIGET_SDK_TESTS=1) → Test Files 83 passed (83) · Tests 2484 passed (2484)
npx vitest run               → Tests 2481 passed | 3 skipped (2484)
npx vitest run --coverage    → exit 0 · Lines 79.56 % (9246/11620); nothing under src/core changed, its floor
                               of 85 % holds
git diff --stat -- src/protocol src/core docs/adr vitest.config.mts tsconfig.json eslint.config.mjs → empty
ls .claude/.contract-change  → No such file or directory
npm run package:vsix, npm run check:vsix, npm run docs:protocol:check, npm run test:ui → SKIPPED: no
                               extension, host, esbuild, packaging or protocol file changed; CI runs them
CI                           → see the tracker row of P2.12
```

## Done (tested)

- `core-queries.bench.ts`: eight benchmarks in `describe('core queries — scopes')` over a key set of 198
  resource keys (40 projects, 10 packages): `scopeMatchesKey` for the scopes `workspace`, `project` (posix, and
  win32 with a path spelled differently), `package`, `sources` and `metadata`, and `mergeScopes` over a burst of
  50 scopes (all `project`; mixed `project`, `package`, `metadata`). The platform is passed in every call, so
  the numbers do not depend on the machine's own path rules. At load the file checks what each scope reaches
  (198, 9, 9, 32, 115 and 15 keys) and throws otherwise: a scope that reached nothing would time the wrong path.
- `tsconfig.vitest.json`: includes `src/test/benchmarks/core-*.bench.ts`, `benchmark.ts` and
  `benchmark.test.ts`; its comment says what stays out until P8.2.
- `benchmarks/baseline.json`: rewritten by `npm run bench:save` on macOS, Node 24.21. It has an entry for
  every benchmark, the 2.0 ones for the first time, so `npm run bench:compare` finds every key.
- "queue" of the row: the three benchmarks of P2.1 in `core-ops.bench.ts`, unchanged (ruling, step 3).
- ARCHITECTURE.md, 2.0 section: the introduction says what P2 added and what is absent; the `src/core/**` row
  lists what is present and absent; new subsections "Operation outcomes", "Reading through the Catalog" and
  "Project execution context"; the tooling section names the benchmarks.

## Done (untested)

- Nothing: a benchmark has no assertion beyond the load-time check; the numbers are a single-machine signal
  (`benchmarks/README.md`).

## Not started

- Moving the 2.0 benches next to their modules: P8.2, with the legacy deletion (plan decision D8). The list of
  what that move touches is on the P8.2 tracker row. N40 stays open until then.
- Benchmarks for the Catalog, the coordinator and the harness: not wanted now (ruling, step 4); performance
  work beyond microbenchmarks is P7.2.

## Deviations from contract/ADR (file:line each)

- `core-queries.bench.ts:77-93`: the load-time check of what each scope reaches is not in the ruling. It is
  there because a benchmark cannot fail on a wrong result.
- `core-queries.bench.ts`: Vitest prints "accessed module export getters too many times" for the three
  benchmarks that compare project paths (`project` posix, `project` win32, `package`). The getter is not in the
  bench (the functions are bound once, as in `core-ops.bench.ts`): `scopes.ts` calls `normalizeProjectPath`
  from `../util/paths` once per key, and under Vitest's module runner that import is a getter. The numbers of
  those three therefore include the runner's getter cost; a bundled build has none. Not changed: `src/core` is
  not a file of this item.
- ARCHITECTURE.md, "Operation outcomes": 17 lines with its table, where the ruling asks for at most 15 per
  subsection; the table has one row per status of the union.
- The CI job `Benchmark (informational)` now compares ubuntu numbers with a baseline measured on macOS. A red
  result on timing alone is expected noise (D8, README: ±15 % on one machine, 2 to 10 times between machines);
  a "Missing or invalid benchmark baseline" line in that job would be a defect.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-13, P2.12, stop-and-ask in the plan's §2.4 form (`architecture-advisor`). Question: what does P2.12
do about the location and type-checking of the 2.0 benches, and what are its files (N40 and the P0 phase
review say "move", plan decision D8 says "as legacy is deleted")? Answer, verbatim:

`````text
DECISION: Option B. The 2.0 benches stay in `src/test/benchmarks/` until P8.2 and are type-checked there from this item on. P2.12 adds `src/test/benchmarks/core-queries.bench.ts`, extends `tsconfig.vitest.json` additively (the one configuration change N40 asked this item to name), saves the baseline, writes the three ARCHITECTURE subsections, one CHANGELOG headline, and corrects the ledger and the P8.2 row. No move, no `git mv`, no other configuration file.

WHY: D8 (plan line 52) says the benches move to core "as legacy is deleted; baseline regenerated in the same PR", and that PR is P8.2, whose row (line 318) lists "legacy benches" and `bench:save`. The P0 phase review's non-blocking 2 and the N40 resolution (`findings-ledger.md:142,368`) read D8 as "P2.12 moves"; that reading was this advisor role's and it was wrong, so N40 is corrected here rather than D8 reopened. The `tsconfig.vitest.json` comment only says the 2.0 benches "join" the type-checked set in P2.12, which B does in place; I checked that `core-versioning.bench.ts`, `core-cache.bench.ts`, `core-ops.bench.ts`, `benchmark.ts` and `benchmark.test.ts` type-check with the vitest options today (`tsc --noEmit --ignoreConfig` with those options → exit 0), so the include costs nothing. A move now would touch `vitest.config.mts`, `tsconfig.json`, `eslint.config.mjs` and the baseline keys, none named by the row (§2.1), rename three other items' files, and need a coverage exclusion so a bench under `src/core` does not count against the 85 % floor (`vitest.config.mts` coverage `include: src/**/*.{ts,tsx}` has no `*.bench.ts` exclusion); all of that is P8.2's work anyway. The brief is right that the hook denies renames of `*.test.ts(x)` only (`scripts/hooks/guard.mjs:18`, `TEST_FILE_ARGUMENT = /\.test\.tsx?(?![\w.])/`); that does not make the rename this item's to do.

DO:
1. Files of the item: `src/test/benchmarks/core-queries.bench.ts` (new), `src/test/benchmarks/core-ops.bench.ts` (unchanged; see 3), `tsconfig.vitest.json` (include + comment, approved here), `benchmarks/baseline.json`, `benchmarks/README.md`, `ARCHITECTURE.md` 2.0 section, `CHANGELOG.md` `[Unreleased]`, `.github/copilot-instructions.md` 2.0 gotcha table (one row, see 10), `docs/plans/STATUS.md`, `docs/plans/findings-ledger.md`, new `src/test/benchmarks/STATUS.md`. Nothing else.
2. (a) Scopes bench: `src/test/benchmarks/core-queries.bench.ts`, header comment in the style of `core-ops.bench.ts`, `import * as queries from '../../core/queries'` and bind once (`const { scopeMatchesKey, mergeScopes } = queries;`, as `core-ops.bench.ts:13` does, with the same comment on Vitest's getter overhead); keys built with `resourceKeys` from `../../protocol/domain` (value import is unfenced from `src/test/**`; `scopes.test.ts:2` does it). Key set of about 200: 40 project paths × (`installed`, `updates` stable, `updates` pre, `transitive`) = 160, 10 package ids × (`versions` without source, `versions` with nuget.org and prerelease, `metadata`) = 30, plus `projects`, `sources` of three directories and the four `allProjects*` keys. One `describe('core queries — scopes')` with eight benchmarks, each filtering the whole key set: `workspace scope`, `project scope, one path (posix)`, `project scope, one path spelled differently (win32)` (scope path `C:\\ws\\app\\App.csproj`, keys built with `c:/ws/app/app.csproj`), `package scope, three paths and five ids`, `sources scope`, `metadata scope, five ids`; then `merge 50 project scopes` and `merge 50 mixed project, package and metadata scopes`, each as `scopes.reduce(mergeScopes)` over a fixed array built outside the benchmark. Pass `platform` explicitly in every `scopeMatchesKey` call (`'linux'` or `'win32'`, `PlatformId = NodeJS.Platform`, `src/core/util/paths.ts:3`); the default `process.platform` would make the baseline depend on the machine. Use `runBenchmark(context, name, fn)` with `test('name', async (context) => …)` exactly as the other core benches do.
3. (a) Queue: the three benchmarks of P2.1 (`core-ops.bench.ts`) satisfy "queue". Do not add an `onProgress` fan-out benchmark: the host attaches a handful of listeners, no finding names the path, and every extra benchmark is a cross-OS number the informational job compares forever.
4. (b) No bench for the Catalog, the coordinator or the harness: the row names queue and scopes only, ADR-009 point 8 freezes Catalog breadth until P4, and `src/core/queries/STATUS.md:98` already records that the coordinator bench was deliberately not written. Perf work beyond microbenchmarks is P7.2.
5. `tsconfig.vitest.json`: add `"src/test/benchmarks/core-*.bench.ts"`, `"src/test/benchmarks/benchmark.ts"` and `"src/test/benchmarks/benchmark.test.ts"` to `include`; do not add `setup.ts` (it imports 1.x services, which are unchecked until P8.2). Rewrite the comment's last two sentences to: the 1.x benches (`src/test/benchmarks/*.bench.ts` other than `core-*`, and `setup.ts`) stay out until P8.2; the 2.0 benches and the runner helper are in since P2.12 and move to `src/core/**` at P8.2 (D8, N40).
6. (c) Run `npm run bench:save` once, on this machine, after the new bench is green under `npm run bench`; commit the whole rewritten `benchmarks/baseline.json`. The script has no merge mode and `benchmarks/README.md` already calls the file a single-machine signal, so the 71 renumbered 1.x entries are by design. Then run `npm run bench:compare` locally and require exit 0 with no "Missing or invalid benchmark baseline" line. In the handoff note and the tracker row write: baseline regenerated on macOS, Node 24.21, 71 + 13 + 8 + 3 + 8 = 103 entries; the `Benchmark (informational)` job finds every key for the first time since P1.3 and compares ubuntu numbers against macOS numbers; a red result on timing only is expected noise (D8, README ±15 %), a "Missing or invalid benchmark baseline" line in that job would be a defect.
7. `benchmarks/README.md`: in "What's measured" add the four `core-*.bench.ts` lines (versioning, cache, ops, queries) with one clause each, and one sentence that the 2.0 benches are type-checked through `tsconfig.vitest.json` and move into `src/core/**` at P8.2 (D8). Nothing else there changes.
8. (d) ARCHITECTURE.md, inside `## 2.0 Architecture (in progress)` only: (i) rewrite the intro paragraph (lines 12-16): "Nothing imports them yet, so no 2.0 runtime behaviour exists" is stale since P2.10; state that P2 added the project model, sources, credentials, Catalog, hosts and the composition root, that `node esbuild.mjs --v2` builds a runnable extension whose webviews are still placeholders (P3, P5), and that feeds (P4), the evaluator (P6.2) and the mutator (P6.3) are absent. (ii) Correct the `src/core/**` summary row (line 89): replace "Arrives in P1–P4; today …" with what is present (the directories listed there) and what is absent (`feeds/` P4, evaluator P6.2, mutator P6.3). (iii) Add three `###` subsections between "Module map" and "Two-surface harness", each ≤ 15 lines, prose plus at most one table, verified against code and citing the ADR: "Operation outcomes" (ADR-003): the `OperationStatus` union of `src/protocol/domain.ts:264-273` as a table of status → who produces it (`queued`/`running`/`restoring` from progress, `completed`/`partial`/`failed`/`cancelled` from `PackageWorkflows`, `rejected`/`failed`/`cancelled` also from the queue for a full or disposed queue, a throw, a cancel before start), `StepOutcome` with `skipped`, `OperationOutcome` versus `BulkOutcome` with its `restores`, and that `completion` resolves exactly once and never rejects. "Reading through the Catalog" (ADR-009): the four coordinator-cached reads and their keys (`projects`, `sources:<dir>`, `installed:<p>`, `transitive:<p>`, `Catalog.ts:95,100,115,182`), the all-projects fan-outs that are not resources, `installed()`'s `{ result, upgrade? }`, `invalidate(scope, reason)` as the single entry, and the eight methods that throw `NotYetAvailableError` under `// REMOVAL GATE: P4.9` (`updates`, `transitiveMetadata`, `allProjectsUpdates`, `search`, `quickSearch`, `versions`, `metadata`, `readme`; `Catalog.ts:178-286`), mapped by the host to `unsupported`. Do not write that an ok response carries a `generation`: none does (C-protocol-host-7; harness rule 7 already says so). "Project execution context" (ADR-005): what `ProjectContextProvider` assembles (`context.ts:26-60`: SDK of the project directory via the runner, `nuget.config` chain nearest first, enabled source URLs, revision hash) and that `unsupported: { reason: 'sdk-too-old' }` comes with a complete context because the project stays readable (D13). (iv) In "Shared tooling", extend the type-checking bullet (line 177, "The 1.x Vitest tests are not type-checked.") with "nor the 1.x benchmarks; the 2.0 benchmarks in `src/test/benchmarks/core-*.bench.ts` are", and add one bullet "Benchmarks." naming the location, `npm run bench`/`bench:save`/`bench:compare`, the informational job, and the P8.2 move.
9. (e) CHANGELOG `[Unreleased]` `### Changed`, headline only: `- **Benchmarks for the 2.0 core (versioning, cache, operation queue, invalidation scopes) with a regenerated baseline**`. No `### Added`: benches and documentation are not a user-facing feature (precedent: the Vitest 5 migration headline under Changed).
10. One new row in the 2.0 gotcha table of `.github/copilot-instructions.md`: "Bench under `src/core` is silently not run | `vitest.config.mts` discovers benchmarks under `src/test/benchmarks/**` only; a `*.bench.ts` next to its module is neither run nor type-checked and nothing reports that. Until P8.2 moves the benches (D8, N40), a 2.0 bench is `src/test/benchmarks/core-<module>.bench.ts`." No `.claude/` mirror change is needed for a table row.
11. Ledger and tracker: rewrite N40's resolution (both occurrences, `findings-ledger.md:142,368`) to "P1.3, P1.4, P2.1 placed their benches in `src/test/benchmarks/`; P2.12 type-checks them in place (`tsconfig.vitest.json`); the move into `src/core/**` is P8.2's, with the legacy deletion (D8)"; status stays `open` with P8.2 as the owner. Add to the P8.2 tracker row (`docs/plans/STATUS.md:90`) the move list so it is not rediscovered: `git mv` of the four `core-*.bench.ts` into their module directories, `vitest.config.mts` (`benchmark.include` adds `src/core/**/*.bench.ts`, coverage `exclude` adds `**/*.bench.ts`), `tsconfig.json` (`exclude` adds `src/**/*.bench.ts`), `tsconfig.vitest.json` (include), `eslint.config.mjs:131-138` (bench relaxations re-keyed on `**/*.bench.ts`; the core fence must admit the import of `src/test/benchmarks/benchmark.ts` or the helper moves too), `benchmarks/README.md`, and `bench:save` for the new keys. Do not edit the P0 phase review text.
12. (f) Handoff note: new `src/test/benchmarks/STATUS.md` from the §2.5 template, first line stating its scope (`src/test/benchmarks/core-*.bench.ts`, `benchmark.ts`, `benchmark.test.ts`, `run.mjs`; the 1.x benches are listed by name only and are P8.2's). `.github/STATUS.md` stays as P0.13 left it (P2.10 ruling, tracker line 1053: it is for items with no `src/` directory at all; P2.11's `src/test/harness/STATUS.md` is the precedent). Paste this answer under its `## Advisor decisions` and in the tracker row.
13. (g) No frozen path, no sentinel: nothing under `src/protocol/**`, `src/core/contracts.ts` or `docs/adr/**` changes; the ARCHITECTURE prose cites ADR-003, ADR-005 and ADR-009 without editing them.
14. Gates in §2.2 order with `npm run check-types` where the ritual says `npx tsc --noEmit` (N39): `npx tsc --noEmit`, `npm run check-types` (now covers the benches), `npx eslint src`, `npm run bench` (the new file listed, 8 new benchmarks), `npm run bench:save`, `npm run bench:compare`, `npm test`, `npx vitest run --coverage` (nothing under `src/core` changed, the floor is unaffected). `package:vsix`, `check:vsix`, `docs:protocol:check`, `test:ui`: SKIPPED with the literal reason (no extension, host, esbuild, packaging or protocol file changed). Commit with the `git-commit` skill citing P2.12, D8, N39, N40; push; wait for green CI on all required jobs and read the `Benchmark (informational)` log for the key check.
15. Phase boundary preparation (RUN.md §6): P2.12 fixes neither C-state-core-6 nor C-protocol-host-7 and must not; the ledger (`findings-ledger.md:408,436`) already schedules both as `P2.fix` candidates, so the `PHASE REVIEW P2` brief names them with those ledger lines. Commit list for the review: `git log --oneline labs/2.0-P1-done..HEAD` (the tag exists). The P2 gate line (`node esbuild.mjs --v2` builds three bundles; `npm test` green incl. harness; `npx tsc --noEmit` 0 with no stubs) is run at the boundary, not inside P2.12; after `node esbuild.mjs --v2`, delete `dist/` before any 1.x packaging (gotcha "Stale files in `dist/`"). The stale ARCHITECTURE intro (step 8.i) is the one thing the review would otherwise flag that P2.12 can remove in advance.

DO NOT:
- `git mv` any bench into `src/core/**`, or edit `vitest.config.mts`, `tsconfig.json`, `eslint.config.mjs` in this item.
- Add `src/test/benchmarks/setup.ts` or the 1.x benches to `tsconfig.vitest.json`.
- Hand-edit `benchmarks/baseline.json` or merge the old 1.x numbers into it; the script rewrites the whole file.
- Let `scopeMatchesKey` fall back to `process.platform` in a benchmark.
- Add benchmarks for the Catalog, the coordinator, the harness or `onProgress` fan-out.
- Write a `### Added` CHANGELOG entry, or a `### Changed` entry with a description after the headline.
- Describe a `generation` on ok responses, or a feed-backed read, in the Catalog subsection.
- Touch `.github/STATUS.md`, the P0 phase review text, or any file under `docs/adr/**`.
- Mark `Benchmark (informational)` anything other than informational, or treat a timing-only red there as a defect.

CONTRACT CHANGE: none.

VERIFY:
- `npm run check-types` → exit 0, and `npx tsc -p tsconfig.vitest.json --listFilesOnly | grep -c "src/test/benchmarks/"` → 5 (`core-versioning`, `core-cache`, `core-ops`, `core-queries`, `benchmark.ts`) plus `benchmark.test.ts` = 6.
- `npm run bench` → `core-queries.bench.ts` listed, 8 new benchmarks, no failures; `npm run bench:compare` → exit 0, no "Missing or invalid benchmark baseline".
- `node -e 'const b=require("./benchmarks/baseline.json").benchmarks;const k=Object.keys(b);console.log(k.length,k.filter(x=>x.includes("core-queries")).length)'` → `103 8`.
- `grep -c "REMOVAL GATE\|NotYetAvailableError" ARCHITECTURE.md` ≥ 1; `grep -n "Nothing imports them yet" ARCHITECTURE.md` → no match; `grep -n "^### Operation outcomes\|^### Reading through the Catalog\|^### Project execution context" ARCHITECTURE.md` → three lines, all above `### Two-surface harness`.
- `grep -n "Benchmarks for the 2.0 core" CHANGELOG.md` → one line under `### Changed`.
- `grep -n "P2.12 type-checks them in place" docs/plans/findings-ledger.md` → two lines; `git status --porcelain --untracked-files=all` after commit → clean; `ls src/test/benchmarks/STATUS.md` → exists; `git diff --stat HEAD~1 -- src/protocol src/core/contracts.ts docs/adr vitest.config.mts tsconfig.json eslint.config.mjs` → empty.

Files checked: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; `/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` lines 41-175 (D1-D13, §2.1-§2.6, §3, §4), 221-238 (P2 rows and gate), 302-312 (P7), 313-318 (P8.1, P8.2); `/Users/mattias/github/nuiget/docs/plans/RUN.md:98-130`; `/Users/mattias/github/nuiget/docs/plans/STATUS.md` rows P0.11, P1.3, P1.4, P2.1, P2.11, P2.12, P8.2, line 93 (`## Phase gates`), 139-141 (P0 review non-blocking 2), 1053 and 1130-1156 (P2.10 and P2.11 rulings); `/Users/mattias/github/nuiget/docs/plans/findings-ledger.md:141-142,161,367-368,387,408,436`; `/Users/mattias/github/nuiget/docs/adr/003-operation-queue-and-dotnet-runner.md:15-24`, `009-catalog.md:1-20`, `005-execution-context-and-outbound-policy.md` headings; `/Users/mattias/github/nuiget/vitest.config.mts`, `tsconfig.json`, `tsconfig.vitest.json` (whole); `eslint.config.mjs:100-160`; `scripts/hooks/guard.mjs:17-18,180-195`; `.claude/settings.json:8-9`; `package.json` bench scripts; `.github/workflows/ci.yml:289-335`; `.github/copilot-instructions.md:42,65-70,121-128,359-361`; `benchmarks/README.md` (whole); `benchmarks/baseline.json` (shape, 71 keys); `src/test/benchmarks/{benchmark.ts,benchmark.test.ts,run.mjs,core-ops.bench.ts}` (whole), `core-cache.bench.ts:5-8,47,71,90`, `core-versioning.bench.ts:5-7,36,56,79`, directory listing; `src/core/queries/{scopes.ts,index.ts}` (whole), `scopes.test.ts:1-36` and test titles, `src/core/queries/STATUS.md:43,98,284`; `src/core/catalog/Catalog.ts:76-79,95-115,178-295` (grep); `src/core/project/context.ts:2-58` (grep); `src/core/util/paths.ts:3-13`; `src/protocol/domain.ts:260-320`; `ARCHITECTURE.md:1-200` (2.0 section: intro, module map rows 71-93, harness, coexistence, shared tooling); `CHANGELOG.md:1-60`; `.github/STATUS.md:1-12`, `src/test/harness/STATUS.md:1-8`, `find . -name STATUS.md`; `git tag -l` (`labs/2.0-P0-done`, `labs/2.0-P1-done`). Commands run (inspection only): `npx tsc --noEmit --ignoreConfig <vitest options> src/test/benchmarks/core-*.bench.ts src/test/benchmarks/benchmark.ts src/test/benchmarks/benchmark.test.ts src/global.d.ts` → exit 0. Not run: any gate, `npm run bench`, `bench:save`. The ambient advisor concurred with B and with steps 2-12.
`````

## Exact next step (one item ID)

The P2 phase boundary (`RUN.md` §6): the P2 gate line, then the brief `PHASE REVIEW P2` with the commit list
`git log --oneline labs/2.0-P1-done..HEAD`; it names C-state-core-6 (`P2.fix-1`) and C-protocol-host-7 as
candidates for blocking. After the fixes and the tag `labs/2.0-P2-done`: P3.1.

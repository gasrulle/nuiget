# STATUS — src   commit e898b91 (P7.2c commit 1; parent of commit 2)   2026-10-16T00:01:38Z

git status --porcelain --untracked-files=all (before commit 2): modified `.github/copilot-instructions.md`, `ARCHITECTURE.md`,
`CHANGELOG.md`, `docs/adr/004-project-model.md`, `docs/perf-baseline.md`, `docs/plans/STATUS.md`,
`src/core/project/{evaluator,evaluator.test}.ts`, `src/extension.next.test.ts`, `src/test/harness/{fakeDotnet,scenarios.test}.ts`,
and the STATUS notes of `src`, `src/core/project`, `src/test/harness`

Scope: this note covers `src/extension.next.ts` and its test only; `src/test/lint` has its own note since P7.5c
(P5 review note 7).

Item: **P7.2c, commit 2** — the root composition test follows the combined first run, by the follow-up ruling of
2026-10-16 (verbatim below). This note replaces the P6.4a note (in this file's history at `0e814af`).

## Verified by running

```text
baseline at 87e9d18 (before commit 1): tsc 0 · eslint 0 · vitest 167 files, 3404 passed, 6 skipped (SDK)
commit 1 e898b91 → CI run 38824530026, 13 of 13 jobs success; SDK probe green on 10.0.402 against the regenerated
                              10.0.401.json
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each
DOTNET_ROOT=… NUIGET_SDK_TESTS=1 npx vitest run --project backend src/core/project/evaluator.test.ts --reporter=verbose →
                              16 passed: "runs one combined properties-and-items run, then, for a cross-targeting
                              project, one item run per target framework, …", "one framework and no framework take
                              the combined run alone, and its items are the result", "cross-targeting: the combined
                              run's items are the outer build's and are discarded; …", "evaluates the multitfm fixture
                              with the real SDK" (3 runs, the first msbuildGetArgs(…, ITEMS, PROPERTIES)), "evaluates
                              the cpm probe input with the real SDK in one run"
first npm test → exit 1: src/extension.next.test.ts "composes the evaluator: …" ("expected [] to deeply equal
                              [ 'Serilog', 'Implicit.Sdk' ]"; its fake answered -getProperty: with properties only) →
                              stop-and-ask, follow-up ruling below, fake collapsed to one combined document, count 1
npx vitest run --project backend src/extension.next.test.ts --reporter=verbose → 36 passed ("composes the evaluator:
                              …", "an evaluation that fails answers the provisional list once, as the response")
DOTNET_ROOT=… NUIGET_SDK_TESTS=1 npx vitest run --project backend src/core/project src/core/cli src/core/catalog
                              src/extension.next.test.ts → Test Files 19 passed · Tests 405 passed
npx vitest run --project integration src/test/harness → 22 passed (and 5 of 5 runs before the root test change)
npm test (DOTNET_ROOT set, NUIGET_SDK_TESTS=1) → exit 0 · Test Files 167 passed (167) · Tests 3413 passed (3413)
npm run bench               → exit 0 · Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
rm -rf dist && node esbuild.mjs --v2 --production --analyze → dist/extension.js 292357 / 321341 ·
                              dist/webview.js 523296 / 575626 · dist/sidebar.js 318803 / 350684
npm run package:vsix        → exit 0 · nuiget-v1.18.9.vsix (17 files, 534.36 KB) · npm run check:vsix → OK
test -e .claude/.contract-change → false (created with "P7.2c" for the ADR-004 edit, deleted before the commit)
```

## Done (tested)

- `src/extension.next.test.ts` `composes the evaluator: installed/get streams the provisional list and answers the
  evaluated one`: the two `dotnet.fail` answers (properties-only for `-getProperty:`, items-only otherwise) and the
  `isProperties` helper became one `dotnet.fail(dotnetCalls.msbuild(), …)` with one document carrying `Properties` and
  `Items`; the msbuild count 2 → 1 ("One combined run for a single-framework project (P7.2c)"). Title and the id,
  kind and fidelity assertions unchanged.

## Done (untested)

- One sentence on the gotcha row "`-getProperty` with one name prints a bare value".

## Not started

- None for P7.2c. The next open row is P7.3.

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.2c follow-up (stop-and-ask: a failing test the item did not name), verbatim (also in
`docs/plans/STATUS.md` and `src/core/project/STATUS.md`):

### P7.2c — follow-up ruling: the root composition test's msbuild fake (2026-10-16)

`````text
DECISION: Option 1, sharpened (call it 1'), as an amendment to step 10 of the P7.2c ruling: `src/extension.next.test.ts` `composes the evaluator: installed/get streams the provisional list and answers the evaluated one` keeps its title and its id, kind and fidelity assertions; its fake becomes one `dotnet.fail(dotnetCalls.msbuild(), { code: 0, stdout: <one document with both `Properties` and `Items`> })` (the `isProperties` helper and the second `fail` are removed, not left unused), and `:323` becomes `toBe(1)` with the comment "one combined run for a single-framework project (P7.2c)". Not option 2 (a `TargetFrameworks` project composes a different path and the harness already covers nothing of the kind here). Not option 3 (the 400 ms rule of the P7.2 ruling decided the change; the evaluator is right and this test's fake is a two-run script). Nothing here is the owner's; no `OWNER MUST DECIDE`.

WHY: The brief matches the tree, and the failure reproduces: `npx vitest run --project backend src/extension.next.test.ts -t "composes the evaluator"` → `AssertionError: expected [] to deeply equal [ 'Serilog', 'Implicit.Sdk' ]` at `:322`. The cause is the fake, not the product: `fakeDotnet.ts:231` answers with the first matching `fail` entry, the combined first run (`evaluator.ts:93`, `msbuildGetArgs(projectPath, ITEMS, PROPERTIES)`) carries `-getProperty:`, so `:307-310` answers it with `Properties` alone, `record(first, 'Items')` is `{}` (`:98`, `:160-163`) and the single-framework guard (`:97`, `TargetFrameworks: ''`) makes that empty list the authoritative result; the items-only branch at `:311-314` is never reached. This is the P7.2c ruling's own gap: that ruling diagnosed the same properties-only shape in `fakeDotnet.ts:197-214` and fixed it in step 10, listed `src/extension.next.test.ts` in step 13's targeted gate, but left it out of commit 2's file list and its FILES CHECKED, so its DO NOT ("other than the ones named in steps 6, 9 and 10") was written without knowing this fake branches the same way; the §2.3 trigger "a failing test you did not write" fired correctly. The P6.2 ruling that specified the test (`docs/plans/STATUS.md:3026`: "one JSON per call order, or a matcher per argv") described a script for the two-run shape; under ADR-004 tier 2 as amended by commit 2 (`docs/adr/004-project-model.md`, probe row `cpm-combined`: the properties of `cpm-properties` and the items of `cpm-items-net8.0` in one document) the faithful script is one document, which is what the harness fake now prints (`fakeDotnet.ts:200-221`). The change is a tightening, not a weakening: `:318-322` stay, and the count goes from the old exact shape (2) to the new exact shape (1), the same edit step 10 made at `scenarios.test.ts:419`; `grep -rn -- "-getProperty:" src scripts` shows no other test fake with the properties-only branch (`evaluator.test.ts` and `fakeDotnet.ts` are rewritten; `commands.test.ts:119`, `redact.test.ts:156` and the fixture assert argv or redaction, not answers). The ids assertion holds under the combined answer by `evaluator.ts:184-205` (`Serilog` has no `DefiningProjectFullPath` → `project`; `Implicit.Sdk` defines in `/sdk/Sdk.props` ≠ project → `props`, `isImplicit`) and `:212-228` (one run, insertion order, no `targetFrameworks`), so `['Serilog', 'Implicit.Sdk']` is still the expected order. The neighbouring `an evaluation that fails answers the provisional list once, as the response` (`:353-361`) already asserts `toBe(1)` and stays right: its first run prints no JSON, nothing follows. Plan §2.1 lets a test the item names be rewritten with the STATUS note listing it; this ruling names it. No product file, contract or ADR changes beyond the sentence commit 2 already made; the sentinel is absent (`test -e .claude/.contract-change` → false, checked).

DO:
1. Paste this ruling verbatim under `## Advisor decisions` of `docs/plans/STATUS.md` (heading `### P7.2c — follow-up ruling: the root composition test's msbuild fake (2026-10-16)`), of `src/core/project/STATUS.md`, and of `src/STATUS.md`.
2. `src/extension.next.test.ts:306-314`: delete `isProperties` and both `dotnet.fail` calls; in their place one call: `dotnet.fail(dotnetCalls.msbuild(), { code: 0, stdout: JSON.stringify({ Properties: { TargetFramework: 'net10.0', TargetFrameworks: '', ManagePackageVersionsCentrally: '', CentralPackageVersionOverrideEnabled: '' }, Items: { PackageReference: [{ Identity: 'Serilog', Version: '3.0.0' }, { Identity: 'Implicit.Sdk', Version: '1.0.0', IsImplicitlyDefined: 'true', DefiningProjectFullPath: '/sdk/Sdk.props' }] } }) });` with a one-line comment above it: "The combined first run of a single-framework project: properties and items in one document (probe row `cpm-combined`, P7.2c)." Lines `:315-322` unchanged.
3. `src/extension.next.test.ts:323`: `toBe(2)` → `toBe(1)`, preceded by the comment `// One combined run for a single-framework project (P7.2c).` (the wording of `scenarios.test.ts:419`). If the count is not 1 after step 2, paste `dotnet.calls.filter(dotnetCalls.msbuild(project))` in a brief; do not write `>= 1`.
4. `.github/copilot-instructions.md`, the already-amended row `` `-getProperty` with one name prints a bare value ``: append one sentence: "A test that scripts msbuild answers the first call with one document carrying both `Properties` and `Items` (the harness fake's `evaluateFromFiles`, `extension.next.test.ts`); a properties-only answer to a call with `-getProperty:` makes a single-framework project authoritative with no packages." No third row.
5. `src/STATUS.md` rewritten per §2.5 (commit 2 now touches a file of the root directory): the rewritten test by title with the change (one combined fake answer; count 2 → 1), the targeted run output, this ruling verbatim. `src/core/project/STATUS.md` and `src/test/harness/STATUS.md` as step 10/12 already require; the tracker row's note for commit 2 names `src/extension.next.test.ts` and this amendment.
6. Step 13's gates again in full, now with `npm test` read for exit 0, then `npm run package:vsix` and `npm run check:vsix` (both missing from the brief's GATE STATUS because `npm test` was red). `git status --porcelain --untracked-files=all` lists commit 2's files plus `src/extension.next.test.ts` and `src/STATUS.md`, nothing else. Commit message unchanged (`perf(core/project): one combined msbuild run evaluates a single-framework project (P7.2c, ADR-004)`); its body names the root test as rewritten by this ruling; push; green CI on 13 jobs; then P7.2c `done` with both SHAs; next open row P7.3.

DO NOT:
- Do not keep the `isProperties` discriminator or an items-only second `fail` that no call reaches.
- Do not loosen `:323` to `toBeGreaterThanOrEqual(1)` or drop it; do not touch `:318-322` or the title.
- Do not change `an evaluation that fails answers the provisional list once, as the response` (`:353-361`): its `toBe(1)` is right before and after.
- Do not give the test's project `TargetFrameworks` (option 2) or add a second project to it.
- Do not touch `src/core/project/evaluator.ts`, `src/test/harness/fakeDotnet.ts`, `docs/adr/**`, `src/core/contracts.ts`, `src/protocol/**` or `scripts/perf-baseline.mjs` for this; do not recreate the sentinel.
- Do not open a ledger finding: this is an omission in the P7.2c ruling's file list, not a product defect.
- Do not add a third gotcha row; one sentence on the amended row.

CONTRACT CHANGE: none beyond what commit 2 already carries (`docs/adr/004-project-model.md`, the `Amended:` line and the one tier-2 sentence of step 11 of the P7.2c ruling, made behind the sentinel that is now deleted). `src/protocol/**`, `src/core/contracts.ts`, `docs/adr/004-sdk-probes.md` untouched.

VERIFY: `grep -c "isProperties" src/extension.next.test.ts` → 0; `grep -c "dotnetCalls.msbuild()" src/extension.next.test.ts` → 1; `grep -n "One combined run for a single-framework project (P7.2c)" src/extension.next.test.ts src/test/harness/scenarios.test.ts` → one line in each; `npx vitest run --project backend src/extension.next.test.ts --reporter=verbose` → green, listing `composes the evaluator: installed/get streams the provisional list and answers the evaluated one` and `an evaluation that fails answers the provisional list once, as the response`; `npx vitest run --project backend src/core/project src/core/cli src/core/catalog src/extension.next.test.ts` → green; `npx vitest run --project integration src/test/harness` → 22 passed; `npm test` → exit 0 (Test Files 167 passed, Tests 3413 passed); `npm run bench`, `npm run package:vsix`, `npm run check:vsix` → exit 0 / OK; `test -e .claude/.contract-change` → false; `grep -c "extension.next.test.ts" src/STATUS.md` ≥ 1 and `grep -n "follow-up ruling: the root composition test" docs/plans/STATUS.md src/core/project/STATUS.md src/STATUS.md` → one heading in each; CI green on 13 jobs with `SDK probe` passing.

FILES CHECKED: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; `/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:41-135` (§1 D6, D7, D13; §2.1-§2.6); `/Users/mattias/github/nuiget/docs/plans/STATUS.md:102-104` (P7.2a, P7.2c rows), `:3026` (P6.2 ruling step 10: the test's specification), `:3345-3391` (the P7.2c ruling verbatim); `/Users/mattias/github/nuiget/src/extension.next.test.ts:1-24,122-126,255-361`; `/Users/mattias/github/nuiget/src/core/project/evaluator.ts` (whole, working tree); `/Users/mattias/github/nuiget/src/core/project/evaluator.test.ts:20,158-161,238-251,263,278,325,377`; `/Users/mattias/github/nuiget/src/test/harness/fakeDotnet.ts:186-295` (`evaluateFromFiles`, `answerFor` first-match at `:231`, `count` at `:271`, `fail` at `:285-289`), `harness.ts:71,142`; `git diff` of the nine modified files (`scenarios.test.ts:419` → `toBe(1)` with its comment; the two gotcha rows; `ARCHITECTURE.md:97`; `docs/perf-baseline.md:55-57`; `CHANGELOG.md`); `/Users/mattias/github/nuiget/src/STATUS.md:1-12,27,100`, `src/core/project/STATUS.md:26,76-104,117`, `src/test/harness/STATUS.md:33,104`; `git log -S"composes the evaluator" -- src/extension.next.test.ts` → `5e26252` (P6.2b); `grep -rn -- "-getProperty:" src scripts` (no other properties-only fake); `git diff --quiet -- scripts/perf-baseline.mjs` (unchanged); `test -e .claude/.contract-change` (absent); `git status --porcelain --untracked-files=all` (the nine files of the brief, no untracked file). Run for reproduction only: `npx vitest run --project backend src/extension.next.test.ts -t "composes the evaluator"` → 1 failed at `:322`, `expected [] to deeply equal [ 'Serilog', 'Implicit.Sdk' ]`. Not run: `npm test`, `npm run bench`, esbuild, `package:vsix` (the brief's gate line and sizes taken as given). The advisor tool was consulted once before writing; its additions (collapse the fake to one matcher, state the `:353-361` test as untouched, require `package:vsix` and `check:vsix` in VERIFY, the `src/STATUS.md` rewrite, the one-sentence gotcha instead of a row, no ledger finding) are folded in. No file was created, edited, moved or deleted; shell use was inspection and one vitest run that writes nothing to the tree.
`````

## Exact next step (one item ID)

P7.3.

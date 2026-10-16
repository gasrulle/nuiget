# STATUS — src/test/harness   commit e898b91 (P7.2c commit 1; parent of commit 2)   2026-10-16T00:01:38Z

git status --porcelain --untracked-files=all (before commit 2): modified `.github/copilot-instructions.md`, `ARCHITECTURE.md`,
`CHANGELOG.md`, `docs/adr/004-project-model.md`, `docs/perf-baseline.md`, `docs/plans/STATUS.md`,
`src/core/project/{evaluator,evaluator.test}.ts`, `src/extension.next.test.ts`, `src/test/harness/{fakeDotnet,scenarios.test}.ts`,
and the STATUS notes of `src`, `src/core/project`, `src/test/harness`

Item: **P7.2c, commit 2** (step 10 of the ⚑ ruling): the fake `msbuild` answers the combined first run. This note
replaces the P6.4b note (in this file's history at `58ad2dd`).

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

- `fakeDotnet.ts` `evaluateFromFiles`: `Properties` when `-getProperty:` is asked, `Items` when `-getItem:` is, both
  in one document for the combined run.
- `scenarios.test.ts:419` (`central version change affects several projects`): `count(msbuild(C1))` is exactly 1,
  "one combined run for a single-framework project (P7.2c)".

## Done (untested)

- None.

## Not started

- None for P7.2c. The next open row is P7.3.

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.2c: the ⚑ ruling and its follow-up are verbatim in `docs/plans/STATUS.md` ("P7.2c — ⚑ ruling: …",
"P7.2c — follow-up ruling: the root composition test's msbuild fake") and in `src/core/project/STATUS.md`.

## Exact next step (one item ID)

P7.3.

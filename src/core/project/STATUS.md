# STATUS — src/core/project   commit 61b9828 (P7.2a closed; parent of the P7.2b commit)   2026-10-15T23:07:39Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`,
`ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/core/project/{evaluator,evaluator.test}.ts`,
this note

Item: **P7.2b** — the evaluator's runs are bound to no caller's signal (finding N79, P6 phase review item 2), by the
P7.2 ruling of 2026-10-16, steps 14 to 18. This note replaces the P6.3a note (in this file's history at `5e26252`).

## Verified by running

```text
baseline: the tree of 61b9828 (P7.2a commit 2) → npm run lint, npx tsc --noEmit 0; npm test 167 files, 3408 passed;
                              CI run 38820044669 green on 13 of 13 jobs. The first edit of evaluator.ts came before
                              a separate baseline run on that tree; the runs above are its baseline.
negative control: the new and retitled tests against evaluator.ts of 61b9828 → 3 failed (the retitled one sees the
                              signal; the joined caller rejects as cancelled; the aborted caller starts runs), 10 passed
npx tsc --noEmit            → exit 0
npm run check-types         → exit 0
npx eslint src              → exit 0
DOTNET_ROOT=… NUIGET_SDK_TESTS=1 npx vitest run --project backend src/core/project --reporter=verbose → exit 0 ·
                              Tests 159 passed (159) · "bound to no caller signal", "a cancellation by one caller does
                              not cancel a later caller of the same revision: …", "a caller whose signal is already
                              aborted starts no run and is not cached" and "evaluates the multitfm fixture with the
                              real SDK" (612 ms) listed as passed
npx vitest run --project backend src/core/catalog src/extension.next.test.ts → Test Files 4 passed · Tests 100 passed
npx vitest run --project integration src/test/harness → Test Files 1 passed · Tests 22 passed (22, unchanged)
npm test (DOTNET_ROOT set, NUIGET_SDK_TESTS=1) → exit 0 · Test Files 167 passed (167) · Tests 3410 passed (3410)
npm run bench               → exit 0 · Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
rm -rf dist && node esbuild.mjs --v2 --production --analyze → exit 0 · dist/extension.js 292240 / 321341 (+112, the
                              new message) · dist/webview.js 523296 / 575626 · dist/sidebar.js 318803 / 350684
npm run package:vsix        → exit 0 · nuiget-v1.18.9.vsix (17 files, 534.34 KB)
grep -n signal src/core/project/evaluator.ts → the JSDoc (54), the evaluate signature (58), the pre-check (59) only
test -e .claude/.contract-change → false
```

## Done (tested)

- `evaluator.ts`: `evaluate(context, signal?)` rejects with `EvaluationError` ("… was cancelled before it started")
  when `signal` is already aborted, with no run and no cache entry; otherwise `run(context)` and `json(context, args)`
  take no signal, and the runner is called with `{ cwd, timeoutMs }` only. JSDoc on `evaluate` gives the reason.
  The contract signature in `src/core/contracts.ts` is unchanged.
- `evaluator.test.ts`: the first test retitled `… in the project directory, bound to no caller signal` (asserts
  `options.signal` undefined and `timeoutMs > 0`); new `a cancellation by one caller does not cancel a later caller
  of the same revision: …` (the fake runner holds the first run and answers `cancelled` for an aborted signal, as
  `DefaultDotnetRunner` does) and `a caller whose signal is already aborted starts no run and is not cached`. `a
  nonzero exit, a timeout, a cancellation and output without JSON reject and are not cached` unchanged.

## Done (untested)

- Docs: CHANGELOG Fixed "**2.0 evaluation survives a refresh**"; ARCHITECTURE evaluator row (one clause); gotcha row
  "A cached promise bound to one caller's signal"; ledger N79 (index and detail rows).

## Not started

- P7.2c (combined `-getProperty`/`-getItem` first run; ⚑ before changing this evaluator), opened by P7.2a step 11.

## Deviations from contract/ADR (file:line each)

- None. ADR-004 tier 2 ("off the render path, cached by revision") and `ProjectEvaluator.evaluate(context, signal?)`
  are unchanged; the cost the ruling accepts is that an evaluation of a revision nobody waits for runs to its end
  (bounded by `DEFAULT_TIMEOUT_MS` per run) and is dropped by the next revision's `cache.set`.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.2 (stop-and-ask): the brief and the answer, verbatim, are in `docs/plans/STATUS.md` under "Advisor
decisions", "P7.2 — stop-and-ask: …". For this directory: D2 (the runs are bound to no caller's signal; a caller
whose signal is already aborted starts nothing; the per-run timeout bounds the work), not D1 (no per-entry
`AbortController`, caller counting, `AbortSignal.any` or timer).

## Exact next step (one item ID)

P7.2c (⚑: consult the `architecture-advisor` before changing the evaluator's first run).

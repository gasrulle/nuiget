# STATUS — .github (agent resources and repo-level items)   commit 758241c (P7.2a commit 1; parent of commit 2)   2026-10-15T22:52:30Z

git status --porcelain --untracked-files=all (before commit 2): modified `.github/STATUS.md`,
`docs/plans/{STATUS,findings-ledger}.md`; new `docs/perf-baseline.md`. Before commit 1: modified `.github/{STATUS.md,copilot-instructions.md,workflows/ci.yml}`,
`ARCHITECTURE.md`, `docs/plans/{STATUS,findings-ledger}.md`, `esbuild.mjs`, `package.json`,
`src/test/ui/v2/{main-search.ui.test.ts,STATUS.md}`; new `scripts/perf-baseline.mjs`,
`src/test/e2e/fixtures/perf-multitfm/{MultiTfm.csproj,nuget.config}`

Item: **P7.2a** — CI ceilings, one e2e retry for N37/N65, the informational perf job and script (commit 1,
`758241c`), and `docs/perf-baseline.md` from commit 1's CI run 38818381022 (commit 2). By the P7.2 ruling of 2026-10-16. This
note replaces this directory's previous note (in its history).

## Verified by running

```text
baseline at 54885d4 (P7.1, CI run 38813536684 green): tsc 0 · eslint 0 · vitest 167 files, 3402 passed, 6 skipped (SDK)
npx tsc --noEmit            → exit 0
npm run check-types         → exit 0
npx eslint src              → exit 0
npm run lint                → exit 0 (covers scripts/perf-baseline.mjs and esbuild.mjs)
npm test (DOTNET_ROOT set, NUIGET_SDK_TESTS=1) → exit 0 · Test Files 167 passed (167) · Tests 3408 passed (3408)
npm run bench               → exit 0 · Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
rm -rf dist && node esbuild.mjs --v2 --production --analyze → exit 0 · dist/extension.js 292128 / 321341 ·
                              dist/webview.js 523296 / 575626 · dist/sidebar.js 318803 / 350684
negative control: sidebar ceiling set to 318_000 → exit 1, "Bundle ceiling exceeded: dist/sidebar.js"; reverted
rm -rf dist out/esbuild && node esbuild.mjs --production --analyze && npm run check:vsix → exit 0 ·
                              272655 / 299921 · 546077 / 600685 · 276451 / 304097 (1.x table unchanged) · check:vsix: OK
node scripts/perf-baseline.mjs --out <scratchpad>/perf/perf-baseline.json --summary <scratchpad>/perf/summary.md →
                              exit 0, eleven rows (macOS arm64, SDK 10.0.401, local, not the baseline): sdk-probe 114 ·
                              config-paths 127 · restore-cold-single 628 · restore-cold-multi 819 · restore-warm-multi
                              387 · evaluate-properties-multi 136 · evaluate-items-multi-net8.0 173 ·
                              evaluate-items-multi-netstandard2.0 173 · evaluate-properties-single 174 ·
                              evaluate-items-single 174 · evaluate-combined-single 175 (ms)
rm -rf dist && NUIGET_V2=1 npm run package && NUIGET_V2=1 npm run test:ui:v2 -- --storage /tmp/nuiget-ui-v2 →
                              exit 0 · 32 passing (53s) · "[P5.6] cold search: 2315 ms from Enter to the first row" ·
                              "[P7.2] warm search: 780 ms from Enter to the first row (feeds connected, metadata cached)" ·
                              git status src/test/e2e/fixtures/e2e-workspace → clean
npm run package:vsix        → exit 0 · nuiget-v1.18.9.vsix (17 files, 534.32 KB)
npm run check:vsix          → check:vsix: OK
grep -n -- '--analyze' .github/workflows/ci.yml → the e2e-v2 build step (325) and the build job (448) only
grep -c 'retry (N37/N65)' .github/workflows/ci.yml → 2 · the Perf baseline job has continue-on-error: true
grep -cE '[0-9]+ (passing|failing)' on the e2e-v2-log-stable and e2e-log-1.85.0 artifacts of run 38813536684 → 1
                              each (a run with counts is never retried); no artifact of an N37/N65 attempt survives
                              (re-runs replace it), so the zero case was not replayed
test -e .claude/.contract-change → false
```

Commit 2:

```text
CI run 38818381022 for 758241c → 13 of 13 jobs success (Perf baseline and Benchmark informational); the e2e-v2-log
                              artifacts of both E2E 2.0 jobs have no "=== retry" line (no retry fired)
Perf baseline artifact        → SDK 10.0.402 linux-x64, eleven rows, all exit 0 (numbers in docs/perf-baseline.md)
UI 2.0 log                    → "[P5.6] cold search: 1086 ms …" · "[P7.2] warm search: 541 ms …" · 32 passing (2m)
E2E 2.0 build step summary    → dist/extension.js 292128 / 321341 · dist/webview.js 523296 / 575626 ·
                              dist/sidebar.js 318803 / 350684 (both jobs)
npm run lint / npx tsc --noEmit → exit 0
npm test (DOTNET_ROOT set, NUIGET_SDK_TESTS=1) → exit 0 · Test Files 167 passed (167) · Tests 3408 passed (3408)
npm run bench                 → exit 0 · Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
grep -c tolerance docs/perf-baseline.md → 2 · each dotnet tolerance is floor(1.5 × baseline), checked by script
grep -n 'RESTORE_TIMEOUT_MS = ' src/core/cli/DotnetRunner.ts → 11: 120_000 (step 12 did not fire)
```

## Done (tested)

- `esbuild.mjs`: `V2_BUNDLE_CEILINGS` reset to Math.ceil(measured × 1.1) at `54885d4` (321 341 / 575 626 / 350 684)
  with the dictated comment; the 1.x table unchanged. Builds and negative control above.
- `.github/workflows/ci.yml`: `--analyze` on the `E2E 2.0` build step (size lines to the job summary) and on the
  `Build & Package` build step; both `Run E2E tests` steps retry once in the step when the log has no
  `passing`/`failing` count (`::warning::` annotation, `=== retry (N37/N65) ===` in the log, first attempt kept);
  new job `Perf baseline (informational)` (`continue-on-error: true`, no `npm ci`, no warm-up) uploading
  `perf-baseline`. YAML parses; the grep counts above.
- `scripts/perf-baseline.mjs`, `npm run perf:baseline`, `src/test/e2e/fixtures/perf-multitfm/` (the e2e project with
  `<TargetFrameworks>net8.0;netstandard2.0</TargetFrameworks>`, no `ImplicitUsings`/`Nullable`, same references; the
  e2e `nuget.config`). Local run above.

## Done (untested)

- The retry branch itself runs only in CI after an N37/N65 failure; the guard was checked against two real logs.
- Docs: gotcha rows "Bundle ceilings are checked in CI" and "A red CI run is not always a code failure" (retry
  wording), the Testing command list, ARCHITECTURE "Shared tooling" (bundle size, dotnet timings), ledger N37/N65
  mitigated, N63 closed.

- Commit 2: `docs/perf-baseline.md` (run, image, SDK, VS Code; sixteen metrics with tolerances; definitions; the
  `perf-multitfm` derivation; how to measure again). Ledger N72 accepted (411 ms). Step 11: `evaluate-properties-single`
  450 ms ≥ 400 ms, so tracker row P7.2c is open after P7.2b. Step 12: `restore-cold-multi` 1848 ms of 120 000,
  `RESTORE_TIMEOUT_MS` unchanged.

## Not started

- The ruling's step 5 allowlist entries in `.claude/settings.json` (`Bash(node scripts/perf-baseline.mjs:*)`,
  `Bash(npm run perf:baseline:*)`): not made. A change to the session's own permission settings is the owner's;
  the commands ran without a prompt in this session.
- N27 (builds do not clean `dist/`) and N32 (the 1.x UI job writes its log into the checkout) also name P7.2 in the
  ledger; the ruling did not assign them to P7.2a or P7.2b, so they stay open for P8.1/P8.2.

## Deviations from contract/ADR (file:line each)

- None against contracts or ADRs. `.claude/settings.json` not edited (above).
- `.github/workflows/ci.yml:322,446`: the comments above the two analyze steps say "The analysis" rather than the
  flag, so `grep -- '--analyze'` lists the two build steps alone as the ruling's VERIFY expects.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.2 (stop-and-ask: scope, ceiling reset, perf numbers, evaluator cancellation, N72, the N65
diagnostic): the brief and the answer, verbatim, are in `docs/plans/STATUS.md` under "Advisor decisions", "P7.2 —
stop-and-ask: …". Decision line: A1 (umbrella P7.2, P7.2a CI/ceilings/perf, P7.2b evaluator cancellation), B1, C1+C3,
D2, E (N37/N65 one in-step retry; N72 accepted), F (mechanical `RESTORE_TIMEOUT_MS` rule).

## Exact next step (one item ID)

P7.2b (evaluator runs bound to no caller signal; ruling steps 14 to 18), then P7.2c.

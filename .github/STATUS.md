# STATUS — .github (agent resources and repo-level items)   commit 54885d4 (P7.1; parent of the P7.2a commit)   2026-10-15T22:37:15Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/{STATUS.md,copilot-instructions.md,workflows/ci.yml}`,
`ARCHITECTURE.md`, `docs/plans/{STATUS,findings-ledger}.md`, `esbuild.mjs`, `package.json`,
`src/test/ui/v2/{main-search.ui.test.ts,STATUS.md}`; new `scripts/perf-baseline.mjs`,
`src/test/e2e/fixtures/perf-multitfm/{MultiTfm.csproj,nuget.config}`

Item: **P7.2a** — CI ceilings, one e2e retry for N37/N65, the informational perf job and script (first of its two
commits; the second writes `docs/perf-baseline.md` from this commit's CI run). By the P7.2 ruling of 2026-10-16. This
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

## Not started

- `docs/perf-baseline.md`, N72 accepted with the CI `config-paths` time, the decisions of the ruling's steps 11
  (P7.2c) and 12 (`RESTORE_TIMEOUT_MS`): the second P7.2a commit, from this commit's CI run.
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

P7.2a, second commit: read the `perf`, `ui-v2` and `e2e-v2` output of this commit's CI run and write
`docs/perf-baseline.md` (ruling steps 9 to 13).

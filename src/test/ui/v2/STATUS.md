# STATUS — src/test/ui/v2   commit 54885d4 (P7.1; parent of the P7.2a commit)   2026-10-15T22:37:15Z

git status --porcelain --untracked-files=all src/test/ui/v2 (before the commit): modified `main-search.ui.test.ts`,
`STATUS.md`

Item: **P7.2a** — the first test of `main-search.ui.test.ts` also times a second, warm search of the same text:
`[P7.2] warm search: <ms> ms from Enter to the first row (feeds connected, metadata cached)`, next to the
`[P5.6] cold search` line. Title by the ruling: `Enter searches the feeds, the results take the place of the tabs,
Escape brings the tabs back, and a second search is timed warm`. This note replaces this directory's previous note
(the P5.12b one, in its history).

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

- The warm search in `main-search.ui.test.ts` (local run above: 32 passing, both lines printed).

## Done (untested)

- None.

## Not started

- `docs/perf-baseline.md` takes both search numbers from the `UI 2.0` log of this commit's CI run (P7.2a, second
  commit).

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.2: verbatim in `docs/plans/STATUS.md`, "P7.2 — stop-and-ask: …"; this file follows its step 6.

## Exact next step (one item ID)

P7.2a, second commit (`docs/perf-baseline.md`).

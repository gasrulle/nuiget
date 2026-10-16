# STATUS — src/webview/sidebar   commit 999948e (parent of the P8.2b commit)   2026-10-16T12:20:22Z

git status --short src/webview/sidebar (before the commit): 17 files renamed from `src/webview/sidebar-next` by the owner's block (staged; `index.tsx` shows as `M` without `-B`); no content edit by the session.

Item: **P8.2b**. The 2.0 sidebar now lives at `src/webview/sidebar` (the 1.x sidebar was deleted first, in the same block). It is built from `src/webview/sidebar/index.tsx` into `dist/sidebar.js` and `dist/sidebar.css`. This note replaces the P7.fix-2 note of `src/webview/sidebar-next` (history at `68d034d`).

## Verified by running

```text
DO 10 (before any edit, 999948e + the owner's staged block)
  git diff --cached --diff-filter=D --name-only | grep -cE '\.test\.tsx?$'   → 60
  git diff --cached --diff-filter=D --name-only | wc -l                     → 130
  git diff --cached --diff-filter=R --name-status | grep -c '^R100'         → 18 (with -B -M: 20)
  git ls-files src/services src/webview/app src/webview/sidebar-next src/test/integration src/test/fixtures
    src/extension.next.ts src/extension.next.test.ts                        → empty
  git status --porcelain | grep -v '^[DR]  '                                → M src/extension.ts, M src/webview/sidebar/index.tsx
  index blobs of both rename targets = their HEAD sources; text simulation of the block on HEAD = index (566/566, 0 diff)
  → ruled satisfied ("P8.2b — follow-up to the P8.2 ruling: DO 10 rendering", docs/plans/STATUS.md)
DO 11 baseline (before any edit): npx tsc --noEmit 0 · npx eslint src 0 · npm run check-types exit 2 (harness.ts:17
  '../../extension.next', :338 TS7006) · npx vitest run 13 failed in the six expected files · node esbuild.mjs cannot
  resolve src/extension.next.ts, src/webview/sidebar-next/index.tsx → exactly the pre-authorized red set
npx tsc --noEmit            → exit 0
npm run check-types         → exit 0 (tsconfig.vitest.json now src/**/*.test.{ts,tsx}, src/**/*.bench.ts, src/test/**)
npx eslint src              → exit 0
npm run lint                → exit 0
npx vitest run --project backend src/test/lint/import-boundaries.test.ts --reporter=verbose
                            → 26 passed; 14 "may not import", 10 "may import"
npm test                    → exit 0; Test Files 129 passed (129); Tests 1910 passed | 9 skipped (1919)
npx vitest run --coverage   → exit 0; total lines 96.14 statements 95.7 functions 94.46 branches 90.01;
                              src/webview/** lines 95.84 statements 95.29 functions 92.71 branches 88.75;
                              src/core/** lines 97.49; src/host/** lines 87.73
npm run bench               → exit 0; Test Files 14 passed (14); Tests 75 passed (75)
npm run bench:save          → "Saved 66 benchmark measurements to benchmarks/baseline.json."
npm run bench:compare       → exit 0; no "Missing or invalid benchmark baseline" line
npm run docs:check          → exit 0; "docs:check — the documents agree with the tree." · "docs:protocol:check —
                              docs/protocol.md is up to date."
rm -rf dist && node esbuild.mjs --production --analyze
                            → dist/extension.js 293183 / 322502 · dist/webview.js 525241 / 577766 ·
                              dist/sidebar.js 319313 / 351245 · exit 0 (sizes equal P8.1's)
npm run package:vsix        → exit 0; Tests 1910 passed | 9 skipped; "DONE Packaged: nuiget-v1.18.9.vsix (17 files, 565.04 KB)"
npm run check:vsix          → check:vsix: OK
node esbuild.mjs --production && npm run test:e2e        → 25 passing (stable)
VSCODE_TEST_VERSION=1.85.0 npm run test:e2e              → 25 passing
rm -rf dist && npm run test:ui -- --storage /tmp/nuiget-ui → 32 passing (53s), exit 0
DOTNET_ROOT=… NUIGET_SDK_TESTS=1 npx vitest run --project backend src/core/cli → SKIPPED: no file under src/core/cli
                              or code that runs dotnet changed
grep -c LEGACY eslint.config.mjs → 0 · grep -c 'scheduled: P8.2' docs/plans/findings-ledger.md → 0 ·
grep -cE '^\| (N29|N30|N31|N44|N53|N58|N40) \|.*\| (closed|mitigated)' docs/plans/findings-ledger.md → 7
```

## Done (tested)

- The move: `git ls-files src/webview/sidebar | wc -l` → 17 before this note was rewritten (STATUS.md included); the four lint tests (`webview-colours`, `webview-css-baseline`, `webview-stylesheets`, `interaction-model-testids`) scan `src/webview/sidebar`; the webview fence covers all of `src/webview/**`.
- UI suite (`src/test/ui/v2`) and both e2e runs pass on the moved sidebar; `dist/sidebar.js` 319313 bytes, unchanged.

## Done (untested)

None.

## Not started

- P8.2c (documents only).

## Deviations from contract/ADR (file:line each)

None. The item-wide deviation (two path names in the ARCHITECTURE intro) is in `src/STATUS.md`.

## Advisor decisions (date, item, question, answer verbatim)

The P8.2 ruling and both P8.2b follow-ups (2026-10-16) are verbatim under `## Advisor decisions` in
`docs/plans/STATUS.md`.

## Exact next step (one item ID)

P8.2c

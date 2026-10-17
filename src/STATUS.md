# STATUS — src   commit 999948e (parent of the P8.2b commit)   2026-10-16T12:20:22Z

git status --short src (before the commit): the owner's staged P8.2 block (130 paths deleted, 60 of them tests; 20
renames by `-B -M`, 18 under default rendering plus `M src/extension.ts` and `M src/webview/sidebar/index.tsx`) and
the session's edits: `src/extension.test.ts`, `src/test/__mocks__/vscode.ts`, `src/test/e2e/{v2-extension.e2e.test,v2-sidebar.e2e.test,v2Support}.ts`,
`src/test/harness/{harness,fakeDotnet}.ts`, `src/test/lint/*.test.ts` (six files), `src/webview/shared/{installed/rules,store/outcomes}.ts`

Item: **P8.2b** — the tree green again after the owner's deletion block, by the P8.2 ⚑ ruling (DO 10-16) and its two
follow-ups of 2026-10-16 (docs/plans/STATUS.md, "P8.2b — follow-up …: DO 10 rendering" and "P8.2b — DO 12: the 1.x-only
fence rows and three comment stragglers"). The 1.x extension is gone from `src`; `src/extension.ts` is the 2.0
composition root and `src/webview/sidebar` the 2.0 sidebar. This note replaces the P7.2c note (history at `e898b91`).

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

- Entries: `esbuild.mjs` builds `src/extension.ts`, `src/webview/main/index.tsx`, `src/webview/sidebar/index.tsx`;
  ceilings reset to `Math.ceil(measured * 1.1)`: 322502 / 577766 / 351245.
- Imports and titles: `src/test/harness/harness.ts:17`, `src/extension.test.ts:10` and its `describe` title.
- Configuration: `vitest.config.mts` (backend include without `src/services`, with `src/extension.test.ts`;
  `integration` = the harness; coverage `exclude` without the four 1.x lines; `src/webview/**` ratchet 95 / 88 / 92 / 95
  replacing 62 / 52 / 54 / 64 and the `{shared,main,sidebar-next}` 85 floor); `tsconfig.vitest.json` include widened to
  every Vitest test and bench and `src/test/**`, the exclusion comment deleted.
- Fences: `eslint.config.mjs` has three fences (core+protocol, webview `src/webview/**`, host); the 1.x patterns, the
  allow-list, `owns` and the root layer are gone; `src/test/lint/import-boundaries.test.ts` keeps 14 denied and 10
  allowed rows plus the two vscode type cases.
- N58: `createMockWebviewPanel()` fires `onDidDispose` once.
- Manifest: `nuiget.recentSearchesLimit` removed from `package.json` and README; `extension-config-settings.test.ts`
  "contributes no deprecated setting"; CHANGELOG line reworded to "removed" (the P7.1 **Breaking:** line names the
  recent-searches list, not the setting).
- e2e: `LEGACY_ONLY_COMMANDS` and its two assertions deleted; the activation test is titled "it registers every
  contributed command".
- Ledger: N29, N30, N31, N44, N53, N58, T3 and the 22 "moot in 2.0" rows (S1, S2, Y4-Y11, Y13, Y14, Y16-Y19, F5, P4, P6,
  P7, D5, D8) closed (P8.2b).

## Done (untested)

- Comment-only rewrites: `src/webview/shared/installed/rules.ts:5`, `src/webview/shared/store/outcomes.ts:21`,
  `src/test/harness/fakeDotnet.ts:46`.

## Not started

- P8.2c: the 1.x sections of ARCHITECTURE.md and the 1.x gotchas, the ARCHITECTURE intro prose (`:12-19`), the perf
  note, plan Appendix D, the plan gate; then the P8 phase review.

## Deviations from contract/ADR (file:line each)

- None from a contract or ADR. From the second follow-up ruling: its DO NOT "Do not edit `ARCHITECTURE.md:16-17`
  (intro) in b … `docs:check` does not read it" rests on a wrong premise: `npm test` (`docs-drift.test.ts`) named
  ``src/extension.next.ts`` and ``src/webview/{shared,main,sidebar-next}`` at `ARCHITECTURE.md:16-17` as missing paths.
  Under the P8.2 ruling's DO 12 straggler clause only those two path names were changed; the intro prose ("the 1.x
  sources stay in the tree, unbuilt, until P8.2 deletes them") is left for P8.2c DO 17.
- `git show --stat HEAD` renders `src/extension.ts` and `src/webview/sidebar/index.tsx` as M + D; read the commit with
  `-B -M` (first follow-up ruling, DO 5).
- With `-B -M` the commit shows 18 renames, not 20: `allowlist.test.ts` → `import-boundaries.test.ts` (rewritten by the
  second follow-up; R031 at `-M30%`) and `sidebar-next/STATUS.md` → `sidebar/STATUS.md` (this template) render as D + A.

## Advisor decisions (date, item, question, answer verbatim)

The P8.2 ruling and both P8.2b follow-ups (2026-10-16) are verbatim under `## Advisor decisions` in
`docs/plans/STATUS.md`. Not repeated here.

## P9.12 addition (2026-10-17)

- `extension.ts` `refreshProjectsAndSession` fires `events.projectsChanged` only after `session.reconcile` (N86): a
  `session/set` for a project a surface was just told about finds it in the store's list; the early return fires
  nothing (its rerun reconciles and announces); `setContext nuiget.hasProjectFiles` stays where it was. Ruling verbatim
  in `src/test/ui/v2/STATUS.md`. Negative control on the unreordered tree, scenario 'N86: …': `AssertionError: main: projects while the listing runs: expected [ …(3) ] to deeply equal [ …(2) ] (+ "…/harness-qoAwVE/C/C.csproj")`; after the
  reorder: harness `Tests 24 passed (24)`; `npx vitest run --project backend src/extension.test.ts` → `Tests 38 passed
  (38)` (unchanged).

## P10.0 additions (2026-10-17)

Regression gaps of the P10.0a matrix (`docs/plans/regression-matrix.md`), one tracker row and one commit each; the
gates per item are the plan §2.2 list plus `npm run check:matrix`.
- P10.0b (R5): `src/extension.test.ts` `nuiget.sidebar.selectSource commits the source chosen in the picker`: the command opens the source picker (All Sources and both enabled sources offered) and the session takes the choice; red with the `session.apply` of `SidebarHost.showSourcePicker` removed. Gates: tsc 0, check-types 0, eslint 0, lint 0, npm test, bench 0, docs:check 0, check:matrix 0 (counts in the tracker row).
- P10.0c (R6): `src/extension.test.ts` `nuiget.sidebar.selectProject commits the project chosen in the picker`: the command opens the project QuickPick (both projects offered) and the session takes the choice; red with the `session.apply` of `SidebarHost.showProjectPicker` removed.
- P10.0f (R15): `src/extension.test.ts` `nuiget.openManager from a Solution Explorer project item selects that project`: a tree item with `resourceUri` opens the panel on that project; red with the `resourceUri` branch of `projectPathFromCommandArg` disabled.

## Exact next step (one item ID)

P10.1.

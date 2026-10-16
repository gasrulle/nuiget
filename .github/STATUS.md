# STATUS — .github (agent resources and repo-level documents)   commit 6678f0f (parent of the P8.2c commit)   2026-10-16T13:10:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`,
`ARCHITECTURE.md`, `CHANGELOG.md`, `docs/perf-baseline.md`, `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`
(then this note and `docs/plans/STATUS.md`)

Item: **P8.2c** — the 1.x documents removed, by the P8.2 ⚑ ruling (DO 17-21). This note replaces the P8.2b note
(history at `6678f0f`).

## Verified by running

```text
baseline (6678f0f)          → npx tsc --noEmit 0 · npm run check-types 0 · npx eslint src 0 · npx vitest run exit 0,
                              129 files, 1910 passed, 9 skipped
npx tsc --noEmit            → exit 0
npm run check-types         → exit 0
npx eslint src              → exit 0
npm run lint                → exit 0
npm test                    → exit 0; Test Files 129 passed (129); Tests 1910 passed | 9 skipped (1919)
npm run bench               → exit 0; Test Files 14 passed (14); Tests 75 passed (75)
npm run docs:check          → exit 0
git ls-files src/webview/sidebar-next → empty (the plan's gate)
git grep -l -e sidebar-next -e 'extension\.next' -- . ':!docs/plans' ':!docs/adr' ':!**/STATUS.md' → empty
grep -c 'removed at P8' ARCHITECTURE.md .github/copilot-instructions.md → 0, 0
grep -c '^## 2.0 Architecture$' ARCHITECTURE.md → 1 · grep -c '^## 2.0 gotchas' .github/copilot-instructions.md → 1 ·
grep -c '^## 1.x gotchas' .github/copilot-instructions.md → 0
npm run package:vsix, check:vsix, test:e2e, test:ui → SKIPPED: no product file changed (documents only)
```

## Done (tested)

- ARCHITECTURE.md: the 20 sections headed `(1.x — removed at P8)` deleted (the ruling said 21; the file had 20),
  "Repository Assistance Resources" kept; the two-architectures note deleted; `## 2.0 Architecture` without "(in
  progress)"; the intro says the 1.x sources were deleted at P8.2.
- copilot-instructions.md: `## 1.x gotchas (removed at P8)` deleted; `### Tooling (kept after P8.2)` → `### Tooling`;
  the N65 parenthetical; the gotcha intro, the "2.0 plan in progress" bullet, the ARCHITECTURE checklist and the VSIX
  rule name 2.0 code instead of 1.x files.
- docs/perf-baseline.md: "After the legacy deletion (P8.2)": the medians of the last five perf runs up to P8.2b, all
  within tolerance (image `20261012.601`, newer than the baseline's `20261012.334.1`; compared, not re-based); two single
  runs over, recorded; search and bundle sizes, ceilings of P8.2b.
- Plan Appendix D: six rows (heading text, `sdkVersionCache` hand-off, ADR-005, retirement map, `cachedFidelity`, the
  P8.2 split and the `-B -M` reading of `6678f0f`).
- CHANGELOG `### Changed`: one headline.

## Done (untested)

None.

## Not started

- P8 phase review (DO 22), then P8.3 (release pull request; the owner merges and publishes).
- Hand-off for the review: `benchmarks/README.md:39-41` still says the 1.x benches "are deleted … at P8.2b" and that
  `tsconfig.vitest.json` "type-checks the 2.0 ones" (outside this item's files); the N44 parts of the gotcha row "A red
  CI run is not always a code failure" describe the deleted legacy `update-flow.e2e.test.ts`.

## Deviations from contract/ADR (file:line each)

None. From the ruling's text: 20 ARCHITECTURE sections, not 21; the perf table holds five runs up to P8.2b (the P8.2c
run follows its own commit).

## Advisor decisions (date, item, question, answer verbatim)

The P8.2 ruling and the two P8.2b follow-ups are verbatim under `## Advisor decisions` in `docs/plans/STATUS.md`.

## Exact next step (one item ID)

P8 phase review, then P8.3

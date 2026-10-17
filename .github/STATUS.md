# STATUS — .github (agent resources and repo-level documents)   commit cb4dd43 (parent of the P10.0a commit)   2026-10-17T12:00:00Z

git status --porcelain --untracked-files=all (before the commit): see `src/test/lint/STATUS.md`.

Item: **P10.0a** — regression coverage matrix, added to the plan (§5 P10, before P10.1) and the tracker by the owner on
2026-10-17 with `P9 approved`. This note replaces the P9.13 note (history at `3f2a2e0`).

## Verified by running

```text
npm run check:matrix → 168 rows: 158 covered, 7 gap, 3 manual-credentials; 0 finding(s)
npm run docs:check   → exit 0
npm test             → exit 0; Test Files 136 passed (136); Tests 2023 passed | 9 skipped (2032)
(full gate list in src/test/lint/STATUS.md)
```

## Done (tested)

- `docs/plans/regression-matrix.md`: 168 rows from `docs/ux/interaction-model.md` §1-§7 and `package.json`
  `contributes` (12 commands, the menu placements, the view and its `when`, 4 settings), each with surface, kind, test
  file and title, and status; the header defines the statuses and lists what is not a row (features 2.0.0 does not ship,
  P7.4, the §5 header Restore no surface renders, the §8 hooks held by their own lint).
- `scripts/check-regression-matrix.mjs`, `npm run check:matrix`, run by CI's Lint job after `npm run docs:check`
  (`.github/workflows/ci.yml`, step "Check the docs").
- Plan §5 P10 row P10.0a; tracker rows P10.0a (done) and P10.0b-P10.0h (one per gap: R5, R6, R13, R14, R15, R16, R17).
- ARCHITECTURE (Shared tooling: the regression matrix bullet, the Lint row of the CI table); copilot-instructions
  command list.

## Done (untested)

- `.claude/settings.json` does not pre-approve `npm run check:matrix`; sessions do not edit their own permissions, so the
  owner applies the patch given in the session report.

## Not started

- P10.0b-P10.0h, then P10.1 (which copies the three `manual-credentials` rows R166-R168 into `docs/release-checklist.md`
  as the only manual checks).

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

- See `src/test/lint/STATUS.md`.

## Exact next step (one item ID)

P10.0b.

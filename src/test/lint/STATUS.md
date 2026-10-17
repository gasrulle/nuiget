# STATUS — src/test/lint   commit cb4dd43 (parent of the P10.0a commit)   2026-10-17T12:00:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/STATUS.md`,
`.github/copilot-instructions.md`, `.github/workflows/ci.yml`, `ARCHITECTURE.md`, `package.json`,
`docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`, `docs/plans/STATUS.md`, `src/test/lint/STATUS.md`; new
`docs/plans/regression-matrix.md`, `scripts/check-regression-matrix.mjs`, `src/test/lint/regression-matrix.test.ts`

Item: **P10.0a** — regression coverage matrix (owner, 2026-10-17). This directory carries the checker's test; the
matrix, the plan row and the CI step are recorded in `.github/STATUS.md`. This note replaces the P9.fix-6 note
(history at `c50d335`).

## Verified by running

```text
baseline (cb4dd43)   → the P9.fix-6 gates at c50d335 (tsc 0, check-types 0, eslint 0, npm test 2019 passed 9 skipped);
                       cb4dd43 is docs only (CI run 39028376636 green)
npx tsc --noEmit · npm run check-types · npx eslint src · npm run lint → 0 · 0 · 0 · 0
npx vitest run --project backend src/test/lint/regression-matrix.test.ts → Tests 4 passed (4)
npm test             → exit 0; Test Files 136 passed (136); Tests 2023 passed | 9 skipped (2032)
npm run bench        → exit 0
npm run docs:check   → exit 0
npm run check:matrix → check:matrix — 168 rows: 158 covered, 7 gap, 3 manual-credentials; 0 finding(s).
negative control     → a duplicate id, a title the file lacks and a missing file planted in the real matrix: 4 findings,
                       exit 1; restored
```

## Done (tested)

- `regression-matrix.test.ts`: the repository's matrix passes with every row in a known status; the title reader handles
  `\'` escapes, `.skipIf(…)`, `.each(…)`, `${…}` templates and `%s`; a covered, a gap and a manual row are accepted;
  planted defects (missing file, missing title, unknown status, duplicate id, unknown kind, a gap without its test, a
  short row, no table) are each reported with the exact message.

## Done (untested)

- Nothing.

## Not started

- P10.0b-P10.0h write the seven gap tests; P10.0d, P10.0e, P10.0g and P10.0h create
  `src/test/lint/manifest-menus.test.ts` (four tests of `package.json` `contributes.menus`).

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

- 2026-10-17, P10.0a: the ambient advisor before the matrix (what `covered` means, row granularity, checker
  semantics, the eight-gap stop); its reply is not readable outside the session (plan §2.3), and its rules are written
  into the matrix's header.

## P10.0 additions (2026-10-17)

Regression gaps of the P10.0a matrix (`docs/plans/regression-matrix.md`), one tracker row and one commit each; the
gates per item are the plan §2.2 list plus `npm run check:matrix`.
- P10.0d (R13): new `manifest-menus.test.ts` (helpers `filenamePattern`, `entryOf`) with `explorer/context offers nuiget.openManager on project files only`: one entry in group `navigation`, its pattern matches .csproj, .fsproj and .vbproj and not .cs, .props, .sln, .csproj.user or nuget.config; red with the pattern narrowed to .csproj.
- P10.0e (R14): `manifest-menus.test.ts` `editor/title offers nuiget.openManager on project files only`: the same checks on the editor title entry.

## Exact next step (one item ID)

P10.0b.

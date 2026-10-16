# STATUS — src/webview/main   commit d1dc584 (P7.6 part 2; parent of the P7.fix-4 commit)   2026-10-16T18:00:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`,
`docs/plans/{STATUS,findings-ledger}.md`, `docs/ux/interaction-model.md`,
`src/webview/main/features/details/{MultiInstallDialog,MultiInstallDialog.test}.tsx`, `src/webview/main/STATUS.md`

Item: **P7.fix-4** — the multi-install picker blocks a project whose installed list is missing or errored (P7 phase
review, blocking 1; N76), by the review and its follow-up ruling of 2026-10-16 (verbatim in `docs/plans/STATUS.md`
under `## Phase gates`, "### P7 — …"). This note replaces the P7.fix-2 note of this directory (in its history at
`12219e7`).

## Verified by running

```text
baseline at d1dc584 (CI run 38878127987 green, 13 of 13): tsc 0 · check-types 0 · eslint 0 · npm test 3438 passed | 2 skipped
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each
npx vitest run --project frontend src/webview/main/features/details → 3 files, 48 passed (48); first run with the
                              review's `all.status !== 'ready'` term: `DetailsPane.test.tsx` 'a browse selection under All
                              Projects opens the project picker and installs into the projects picked' red → term
                              withdrawn by the follow-up ruling, that test byte for byte and green
npx vitest run --project integration src/test/harness → 22 passed (22)
npm test (DOTNET_ROOT set, NUIGET_SDK_TESTS=1) → exit 0 · Test Files 169 passed (169) · Tests 3440 passed | 2 skipped (3442)
npm run bench               → exit 0 · Tests 119 passed | 1 skipped (120)
npm run docs:check          → exit 0
rm -rf dist && node esbuild.mjs --v2 --production --analyze → 293183 / 525241 / 319313 (ceilings 321341 / 575626 / 350684)
test -e .claude/.contract-change → false
```

## Done (tested)

- `features/details/MultiInstallDialog.tsx`: `listed(projectPath)` (the project's chunk has a `result`); a project
  without one is not pickable, with the note `not listed yet`, or `could not be read` when its chunk carries an error;
  the Install button waits for `checking` only; a late chunk changes `cpmKey`, so the previews are asked again (every
  CPM target, in order) and Install waits for them. JSDoc clause.
- `MultiInstallDialog.test.tsx`: new `a project whose installed list has not arrived cannot be picked; its late chunk
  is previewed before Install goes on` and `a project whose installed list could not be read cannot be picked`
  (`openPicker` takes how Web's chunk arrives); the two earlier titles unchanged.

## Done (untested)

- None.

## Not started

- The P7 boundary push and the tag `labs/2.0-P7-done`; then P8.1 in a new session.

## Deviations from contract/ADR (file:line each)

- None (no frozen file). The review's DO 2 status term was withdrawn by its follow-up ruling.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, PHASE REVIEW P7 and its follow-up on P7.fix-4: verbatim in `docs/plans/STATUS.md` under `## Phase gates`,
"### P7 — Hardening, performance, docs, acceptance (2026-10-16)". Decision lines: PASS WITH FIXES; P7.fix-4 before the
tag; the status term dropped, the DetailsPane test unchanged.

## Exact next step (one item ID)

P8.1 (after the tag `labs/2.0-P7-done`; a new session).

# STATUS — .github (agent resources and repo-level documents)   commit df602e4 (parent of the P10.1 commit)   2026-10-17T15:00:00Z

git status --porcelain --untracked-files=all (before the commit): modified `CHANGELOG.md`, `docs/release-checklist.md`,
`docs/plans/STATUS.md`, `.github/STATUS.md`

Item: **P10.1** — release refresh (plan §5 P10), with the owner's addition of 2026-10-17 (the `manual-credentials` rows
of the regression matrix as the only manual checks). This note replaces the P10.0a note (history at `65dc252`).

## Verified by running

```text
npx tsc --noEmit · npm run check-types · npx eslint src · npm run lint → 0 · 0 · 0 · 0
npm test             → exit 0; Test Files 137 passed (137); Tests 2030 passed | 9 skipped (2039)
npm run bench        → exit 0
npm run docs:check   → exit 0
npm run check:matrix → 168 rows: 165 covered, 0 gap, 3 manual-credentials; 0 finding(s)
node esbuild.mjs --production --analyze → 297018 / 322502, 548943 / 577766, 333252 / 351245
npm run package:vsix → exit 0; DONE Packaged: nuiget-v2.0.0.vsix (17 files, 581.31 KB)
npm run check:vsix   → check:vsix: OK
node -p version      → 2.0.0 (package.json, package-lock.json version and packages[""].version)
```

## Done (tested)

- `CHANGELOG.md`: `## [2.0.0] - 2026-10-17`; the three `[Unreleased]` `### Added` and nineteen `### Changed` bullets at the
  top of their 2.0.0 subsections; the seven `### Fixed` bullets left out (owner's P8.3 rule: fixes of code no version
  shipped); empty `## [Unreleased]` above. The plan row P10.1 ("CHANGELOG 2.0.0 final (P9 entries; date)") authorizes
  the edit of a section that is dated but not published.
- `docs/release-checklist.md`: the session table refilled; "Manual checks before publishing — the only ones" with
  R166-R168 verbatim; §5 corrected: it said the prerelease-version fix was not in the CHANGELOG, but the owner restored
  it (736afa7).

## Done (untested)

- Nothing.

## Not started

- The P10 phase review and the `labs/2.0-P10-done` tag; PR #18's description (after the review, so it cites the final
  commit and run).

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

- 2026-10-17, P10.1: the ambient advisor before the edits (the CHANGELOG fold under the P8.3 rule, the checklist refill
  and manual section, the PR body as a file, the phase-boundary order); its reply is not readable outside the session
  (plan §2.3).

## Exact next step (one item ID)

PHASE REVIEW P10, then the stop for the owner to merge PR #18 and publish.

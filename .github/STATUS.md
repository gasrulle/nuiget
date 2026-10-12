# STATUS — .github (agent resources and repo-level items)   commit 7c75217 (parent of the P0.13 commit)   2026-10-12T12:20:00Z

git status --short: `?? docs/plans/findings-ledger.md`, ` M docs/plans/STATUS.md`, ` M CHANGELOG.md`,
` M .github/STATUS.md` (all belong to the P0.13 commit)

Item: **P0.13 Tracker and findings ledger**. This file is the handoff note for plan items without a `src/`
directory of their own. The P0.12 note it replaces is in commit `7c75217`; P0.12's CI run 38232204407 was green
on all eight jobs.

## Verified by running

```text
baseline npx tsc --noEmit   → exit 0, no output
baseline npx eslint src     → exit 0, no output
baseline npx vitest run     → Test Files 44 passed (44) · Tests 1591 passed (1591)
script: every `| P#.# |` id of plan §5 against docs/plans/STATUS.md → 81 items, none missing     (item gate)
script: every N id of plan Appendix A against the ledger             → 24 ids, none missing
ledger section 1            → 102 rows (66 original, 24 + 12 new); every row has six cells
ledger section 2            → 66 ids, severities C 1, H 15, M 27, L 14, none 9 (the architecture smells)
counts in ledger section 6  → measured with the commands shown there (959, 22, 125 and 13, 55, 15)
npx tsc --noEmit            → exit 0, no output
npx eslint src              → exit 0, no output
npm test                    → Test Files 44 passed (44) · Tests 1591 passed (1591)
npm run bench               → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npm run package:vsix        → SKIPPED: documentation only (plan §2.2 step 5)
npm run test:ui             → SKIPPED: documentation only
```

## Done (tested)

- `docs/plans/findings-ledger.md`: status table for every finding; the original ledger of the audit of
  2026-10-10 reproduced unchanged from the quarry's working tree; the corrections and new findings of plan
  Appendix A; twelve findings made during P0 (N25 to N36); the headline defects of plan Appendix B numbered as
  `C-<group>-n`; a table of counts with the commands that produce them.
- `docs/plans/STATUS.md`: header says where commit SHAs live and names the ledger; rows up to date.

## Done (untested)

- Nothing reads the ledger mechanically yet. P7.5 plans a documentation drift script.

## Not started

- P0.14 (optional 1.18.10 guard for N1): the owner decides. Until the row says `open` or `skipped`, the phase
  P0 gate and its phase review do not run.

## Deviations from contract/ADR (file:line each)

- The original findings (S, Y, F, M, P, U, T and the architecture smells) have no work item in the plan that
  names them, apart from F6 and the ones closed in P0. Their "Scheduled in / closed by" cell says
  "not mapped" instead of a guessed item.
- Short titles in section 1 are derived from the original rows (the leading bold phrase, else the first
  words). The authoritative text is section 2.
- `C-<group>-n` ids number the semicolon-separated headline defects of plan Appendix B in the plan's order.
  The plan does not assign them itself; it says the work items carry the detail.
- N35: decisions D1 to D13 and architecture-smell findings D1 to D9 share a letter. The ledger says
  "finding D3" for a smell; the plan was not edited.
- Statuses set to closed here rest on the P0 items that landed today: M3 (D13), T2 and N2, N3, N5 (partly),
  N22 and P8 (P0.8), T5 (P0.10), N4 (partly), N13 and N24 (P0.11), N34 (P0.8).

## Advisor decisions (date, item, question, answer verbatim)

No stop-and-ask trigger fired and the item is not ⚑, so no consultation took place for this item.

## Exact next step (one item ID)

P0.14 (owner decides: set the tracker row to `open` to do it, or to `skipped`); after that the P0 phase gate
and phase review of `RUN.md` §6, then P1.1a.

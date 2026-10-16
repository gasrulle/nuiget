# STATUS — .github (agent resources and repo-level items)   commit 12219e7 (P7.fix-2; parent of the P7.6 part 1 commit)   2026-10-16T15:00:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/STATUS.md`, `docs/perf-baseline.md`,
`docs/plans/{2026-10-11-nuiget-2.0-execution-plan,STATUS,findings-ledger}.md`

Item: **P7.6** — the acceptance cut of 2.0 at `68d034d` (PASS WITH FIXES; the fix row P7.fix-2, `12219e7`, landed
first), by the ⚑ acceptance ruling of 2026-10-16 (verbatim in `docs/plans/STATUS.md`, "P7.6 — ⚑ acceptance ruling",
with its follow-up "P7.fix-2 — follow-up ruling"). A bookkeeping commit: tracker, ledger, perf doc, plan Appendix D,
this note. This note replaces the P7.5c note (in this file's history at `756dcd1`).

## Verified by running

```text
tracker check               → grep -nE '^\| P[0-7]\.[^|]*\| P[0-7] \|[^|]*\| (open|in-progress|blocked) \|' docs/plans/STATUS.md
                              → exactly the P7.fix-3 and P7.6 rows (part 1)
CI                          → run 38870091917 (68d034d): 13/13; run 38873696417 (12219e7): red on `Test (windows-latest)` only
                              (test A, N84), P7.fix-3 pending
perf (docs/perf-baseline.md, "Acceptance measurement (P7.6)") → six perf runs, image ubuntu-24.04 20261012.334.1 for all
                              (`gh run view <id> --job <perf job> --log`, "Runner Image" group); medians of the last five:
                              sdk-probe 109, config-paths 413, restore-cold-single 1939, restore-cold-multi 1480,
                              restore-warm-multi 1066, evaluate-* 254–321, each ≤ its tolerance; cold search 819 / 1058 ms
                              (target 1700), warm 286 / 282 ms (target 900); bundles 293183 / 525105 / 319313 under
                              321341 / 575626 / 350684
ledger                      → sed -n 35,200p docs/plans/findings-ledger.md | grep -c "not mapped | open" → 0; end state
                              (awk over section 1): 88 closed, 5 closed by design, 12 accepted, 7 partly closed,
                              3 mitigated, 23 scheduled for P8.2 (moot in 2.0), 1 moot, the rest open naming P8.1, P8.2,
                              the owner or 2.0.1
npm run docs:check          → exit 0
npx vitest run --project backend src/test/lint → 11 files, 163 passed (163)
npm run lint                → exit 0
```

## Done (tested)

- Tracker: P7.6 `in-progress` (part 1; part 2 after P7.fix-3), row P7.fix-3 `open`; Commit cells of P7.fix-1 (`68d034d`), P7.fix-2 (`12219e7`) and the P7.5 umbrella (`f1c9c8d,
  a2fd5d2, 71cf359, 756dcd1`); the P8.1 and P8.2 notes carry the findings handed to them.
- Ledger reconciled by the ruling's rule, each changed row citing the item or grep that justifies it.
- `docs/perf-baseline.md`: the acceptance table with the median per row and the refined tolerance rule (median of the
  last five same-image runs; a single run over tolerance is recorded, not judged); the P7.2a table untouched.
- Plan Appendix D: "§5 P7, gate".

## Done (untested)

- None.

## Not started

- The P7 phase boundary (RUN.md §6): the gate paste, `PHASE REVIEW P7`, the boundary commit and the tag
  `labs/2.0-P7-done`.
- Owner patches (sessions do not edit them): `CLAUDE.md` gate list gaining `npm run check-types`;
  `.claude/settings.json` allow `"Bash(npm run docs:check)"`.

## Deviations from contract/ADR (file:line each)

- None.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.6 (⚑ acceptance ruling) and P7.fix-2 (follow-up): verbatim in `docs/plans/STATUS.md`. Decision line:
2.0 accepted at `68d034d` for the flip (P8) after P7.fix-2; perf judged on the median of same-image runs; ledger
reconciled; the P7 phase boundary follows in this session, then the RUN.md §7 stop.

## Exact next step (one item ID)

P7.fix-3, then P7.6 part 2.

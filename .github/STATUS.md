# STATUS — .github (agent resources and repo-level items)   commit 3b6f987 (parent of the P3.6 commit)   2026-10-14T05:52:03Z

git status --short: ` M .github/STATUS.md`, ` M .github/copilot-instructions.md`, ` M ARCHITECTURE.md`,
` M docs/plans/2026-10-11-nuiget-2.0-execution-plan.md`, ` M docs/plans/STATUS.md`,
` M docs/plans/findings-ledger.md`, ` M esbuild.mjs`, ` M vitest.config.mts` (all belong to the P3.6 commit)

Item: **P3.6 Re-base the estimate; advisor review of the slice; adjust P4/P5 ordering** (⚑ mandatory). This file is
the handoff note for plan items without a `src/` directory of their own. The P0.13 note it replaces is in commit
`9e2ebbc`. P3.5's CI run 38490233910 for `3b6f987` was green on all 11 jobs.

## Verified by running

```text
baseline npx tsc --noEmit   → exit 0
baseline npx eslint src     → exit 0
baseline npx vitest run     → Test Files 110 passed (110) · Tests 2680 passed | 3 skipped (2683)
npx tsc --noEmit            → exit 0
npx eslint src              → exit 0
npm run check-types         → exit 0
npm run lint                → exit 0 (covers esbuild.mjs and vitest.config.mts)
npm test (DOTNET_ROOT set, NUIGET_SDK_TESTS=1) → Test Files 110 passed (110) · Tests 2683 passed (2683)
npx vitest run --coverage   → exit 0; the new key src/webview/{shared,main,sidebar-next}/** measures 99.37 % of
                              lines; negative control with `lines: 100` → exit 1, "Coverage for lines (99.37%)
                              does not meet "src/webview/{shared,main,sidebar-next}/**" threshold (100%)"; reverted
npm run bench               → Test Files 18 passed (18) · Tests 112 passed | 1 skipped (113)
node esbuild.mjs --v2 --production --analyze → exit 0 · extension 168070 / 299921 · webview 223600 / 600685 ·
                              sidebar 293929 / 329122
node esbuild.mjs --production --analyze      → exit 0 · extension 272655 / 299921 · webview 546077 / 600685 ·
                              sidebar 276451 / 304097 (1.x ceilings unchanged); dist/ and out/esbuild deleted
npm run package:vsix        → exit 0 · nuiget-v1.18.9.vsix (17 files, 530.8 KB)
npm run check:vsix          → check:vsix: OK (1.x entries)
npm run docs:protocol:check → docs/protocol.md is up to date
npm run test:ui             → SKIPPED: no UI or webview source changed; the CI jobs UI and UI 2.0 run it
grep -c '^| P5.12[ab] ' docs/plans/STATUS.md → 2; P5.1, P5.3, P5.4 stand above P4.1; every tracker row has 7 cells
test -e .claude/.contract-change → false
```

## Done (tested)

- `esbuild.mjs`: `V2_BUNDLE_CEILINGS` for `--v2` builds (sidebar 329 122 = the 1.x ceiling plus the measured
  25 025 bytes of `@tanstack/virtual-core`, which the 1.x sidebar does not bundle); `reportCeilings` picks the
  table by entry set. Both production analyze builds above.
- `vitest.config.mts`: floor `'src/webview/{shared,main,sidebar-next}/**': { lines: 85 }`; the `src/webview/**`
  ratchet stays 62/52/54/64. Negative control above.

## Done (untested)

- Plan §7: the estimate re-based in hours of agent session time (measured 20.7 h for P0–P3; ≈ 37 h remain, five
  to six sessions). A projection, checked again after P5.6.
- `docs/plans/STATUS.md`: execution order changed (P5.1, P5.3, P5.4 before P4.1; P5.2 after P5.9 as a sweep;
  P5.12 → P5.12a, P5.12b) with the ruling's notes on P5.1–P5.12b, P7.2 and P7.4; P3.5's commit backfilled.
- `docs/plans/findings-ledger.md`: N61, N62, N63, N64, U11 rescheduled as ruled.
- ARCHITECTURE.md "Shared tooling" (bundle size bullet) and one 2.0 gotcha row on the local ceiling gate.

## Not started

- The product changes the ruling schedules: pure icons (P5.1), N62 (P5.3), N61 (P5.4), the CSS-baseline lint
  (P5.11), the CI ceilings (P7.2), the 1.85.0 check (P7.4, owner).

## Deviations from contract/ADR (file:line each)

- `esbuild.mjs`: `grep -c V2_BUNDLE_CEILINGS` is 2, not the 3 of the ruling's VERIFY: the comment the ruling
  dictates does not contain the identifier.
- `vitest.config.mts:48-49`: the dictated comment is wrapped onto two lines (120 columns).
- `docs/plans/STATUS.md:7-8`: the ruling's line "under the table header" is in the introduction above the table,
  because a line inside a Markdown table would end it.
- The plan's §5 tables are unchanged (as ruled); the order lives in the tracker. P7.5 may reconcile the text.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-14, P3.6 (⚑): the brief and the answer, verbatim, are in `docs/plans/STATUS.md` under "Advisor decisions",
"P3.6 — ⚑ ruling: the re-based estimate, the order of P4 and P5, and five handed decisions (2026-10-14)". Decision
line: re-base in measured hours; P5.1, P5.3, P5.4 before P4; P5.2 a closing sweep; P5.12 split; N63 two measures
(2.0 ceiling table now, pure icons in P5.1); N61 in P5.4; N64 no ExTester job, lint in P5.11, owner check in P7.4;
compact row 24 px; ratchet unchanged plus a 2.0 floor of 85 % lines.

## Exact next step (one item ID)

P5.1 (pulled before P4 by the P3.6 ruling), in a new session: this session stopped after P3.6 (RUN.md §6, §7). The
P3 phase gate and `PHASE REVIEW P3` (PASS, no blocking item) are under "Phase gates" in `docs/plans/STATUS.md`;
CI of `3c96c29` green after one re-run (N65); tag `labs/2.0-P3-done` on the phase-gate commit.

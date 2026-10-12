# STATUS — .github (agent resources)   commit 1d26aeb (parent of the P0.2 commit)   2026-10-12T07:15:00Z

git status --short .github .claude: ` M .github/copilot-instructions.md`, `?? .github/instructions/core-boundaries.instructions.md`,
`?? .claude/rules/core-boundaries.md`, `?? .github/STATUS.md` (all four belong to the P0.2 commit)

Item: **P0.2 Agent resources split**. This file is the handoff note for plan items whose outputs are agent
resources or CI rather than a `src/` directory; P0.3 and P0.8 rewrite it.

## Verified by running

```text
baseline npx tsc --noEmit   → exit 0, no output
baseline npx eslint src     → exit 0, no output
baseline npx vitest run     → Test Files 40 passed (40) · Tests 1491 passed (1491)
grep -c '^## 1.x gotchas' .github/copilot-instructions.md → 1        (item gate)
grep -c '^## 2.0 gotchas' .github/copilot-instructions.md → 1
npx tsc --noEmit            → exit 0, no output
npx eslint src              → exit 0, no output
npm test                    → Test Files 40 passed (40) · Tests 1491 passed (1491)
npm run bench               → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npm run package:vsix        → SKIPPED: no host, service or esbuild change (plan §2.2 step 5)
npm run test:ui             → SKIPPED: no source change; not in the plan §2.2 gate list for this item
targeted vitest             → SKIPPED: the item adds no source or test file
```

## Done (tested)

- `.github/copilot-instructions.md`: `# Gotchas & Pitfalls` now holds `## 2.0 gotchas` (17 rows seeded from
  plan decisions D1–D13, Appendix B and the P0.0 probe) and `## 1.x gotchas (removed at P8)` with the eight
  existing tables demoted from H2 to H3. The move is pure: `git diff` shows only the eight heading lines as
  deletions. A "2.0 plan in progress" bullet was added under `# Agent Guidelines`.
- `.github/instructions/core-boundaries.instructions.md`: 2.0 and legacy path sets, the import table from
  plan §3, rules ESLint does not catch, and a note that enforcement starts at P0.7.
- `.claude/rules/core-boundaries.md`: pointer in the existing rule format with a `paths:` list.

## Done (untested)

- Whether a new session loads `.claude/rules/core-boundaries.md` for a 2.0 path. No 2.0 source file exists
  yet; the first chance to observe it is P0.6 (`src/extension.next.ts`).

## Not started

- P0.3: `.claude/agents/architecture-advisor.md`, `.github/agents/architecture-advisor.agent.md`, `CLAUDE.md`
  `## 2.0 execution protocol`.

## Deviations from contract/ADR (file:line each)

- `.github/copilot-instructions.md:24`: the item says to repoint the "Modernization plan in progress" bullet.
  That bullet exists only in the quarry's copy, not on `main`, so it was added fresh, pointing at the 2.0
  plan, `RUN.md` and the tracker.
- The item lists "4 files" as output but names three (`copilot-instructions.md`, the instruction file, the
  rule pointer). No fourth agent resource was invented; this note, the CHANGELOG and the tracker complete
  the commit.
- 1.x rows were moved, not corrected. Known wrong row left as is: the `checkUpdatesInBackground` scope row
  describes a `_forceCheckPending` scope merge that finding N10 calls dead code. Appendix-A drift is owned
  by P0.12 and P0.13.
- `### Known Issues` and `### Testing` sit under the 1.x heading although several rows are tooling facts
  that also hold for 2.0 (TypeScript 6 pin, MSW, vitest alias, benchmark wrapper). The item asks for one
  1.x section; the section intro says so and P7.5 reviews which rows survive.

## Advisor decisions (date, item, question, answer verbatim)

No stop-and-ask trigger fired and the item is not ⚑. The ambient session advisor (plan §2.3 L3) was consulted
before editing; its reply is not available as quotable text, so the decisions taken are recorded:

- 2026-10-12, P0.2, "How should the gotcha split, the missing plan bullet and the handoff note be shaped?" →
  Edit `main`'s file in place and do not port the quarry copy; one H2 for 1.x with the eight tables demoted
  to H3 and a sibling H2 for 2.0; do not correct 1.x row content; add the missing bullet and record the
  mismatch; keep the 2.0 seed to prescriptive rows with item IDs because the file is imported into every
  session; link the boundaries file instead of restating it; write the handoff note to `.github/STATUS.md`.

## Exact next step (one item ID)

P0.3

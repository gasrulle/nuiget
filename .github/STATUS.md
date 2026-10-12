# STATUS — .github (agent resources)   commit 7c16686 (parent of the P0.3 commit)   2026-10-12T07:45:00Z

git status --short .github .claude CLAUDE.md: ` M CLAUDE.md`, ` M .github/STATUS.md`,
`?? .claude/agents/architecture-advisor.md`, `?? .github/agents/architecture-advisor.agent.md` (all belong to the P0.3 commit)

Item: **P0.3 architecture-advisor subagent and CLAUDE.md 2.0 execution protocol**. This file is the handoff
note for plan items whose outputs are agent resources or CI rather than a `src/` directory; P0.5 and P0.8
rewrite it. The P0.2 note it replaces is in commit `7c16686`.

## Verified by running

```text
baseline npx tsc --noEmit   → exit 0, no output
baseline npx eslint src     → exit 0, no output
baseline npx vitest run     → Test Files 40 passed (40) · Tests 1491 passed (1491)
Agent tool, subagent_type architecture-advisor (this session)
                            → "Agent type 'architecture-advisor' not found" (definitions load at session start)
claude -p --agent architecture-advisor "<brief below>"   (fresh session, repo root)
                            → exit 0, answer in the DECISION/WHY/DO shape, `git status --short` unchanged
                              (item gate "Agent listed in a new session": satisfied)
grep -c '^## 2.0 execution protocol' CLAUDE.md                                → 1   (item gate)
grep -c '^tools: Read, Grep, Glob, Bash$' .claude/agents/architecture-advisor.md → 1
grep -c '^model: fable$' .claude/agents/architecture-advisor.md                 → 1
grep -c "^tools: \['search', 'read'\]" .github/agents/architecture-advisor.agent.md → 1
npx tsc --noEmit            → exit 0, no output
npx eslint src              → exit 0, no output
npm test                    → Test Files 40 passed (40) · Tests 1491 passed (1491)
npm run bench               → Test Files 14 passed (14) · Tests 80 passed | 1 skipped (81)
npm run package:vsix        → SKIPPED: no host, service or esbuild change (plan §2.2 step 5)
npm run test:ui             → SKIPPED: no source change; not in the plan §2.2 gate list for this item
targeted vitest             → SKIPPED: the item adds no source or test file
```

## Done (tested)

- `.github/agents/architecture-advisor.agent.md`: role, ground rules, reading list, the §2.4 brief with a fixed
  answer shape, and the phase-review procedure with a `VERDICT`/`BLOCKING` answer shape.
- `.claude/agents/architecture-advisor.md`: pointer in the existing agent format with
  `tools: Read, Grep, Glob, Bash` and `model: fable`. Loaded and answered a brief in a fresh session.
- `CLAUDE.md` `## 2.0 execution protocol`: plan §2 condensed, with the L1 and L3 consultation rules.

## Done (untested)

- The phase-review mode (`PHASE REVIEW <phase>`). Its first use is the P0 boundary (`RUN.md` §6).
- Launching the agent through the Agent tool. Possible only in a session started after this commit.

## Not started

- P0.5: `scripts/hooks/guard.mjs` and the `hooks` block in `.claude/settings.json`.
- P0.8: CI rewrite.

## Deviations from contract/ADR (file:line each)

- Plan §2.3 L1 says "read-only tools"; the P0.3 row says `tools: Read, Grep, Glob, Bash`. The row was followed
  (`.claude/agents/architecture-advisor.md:4`). Read-only is enforced by instruction
  (`.github/agents/architecture-advisor.agent.md:18-20`) and on the Copilot side by
  `tools: ['search', 'read']` (same file, line 4). `.claude/settings.json` still allows `git add`,
  `git commit` and `git push origin labs/*` to any subagent that has Bash, and the P0.5 hooks deny only
  `--no-verify`, `--force` and commits while the sentinel exists, so the guarantee is instruction-level
  unless the owner decides otherwise.
- The Copilot mirror has no execute tool, so its shell paragraph is inert there. Phase reviews run only
  through the Claude subagent, which is the mechanism plan §2.3 L1 relies on.
- L1 in the session that created the agent: the Agent tool cannot see a definition added after session
  start. That session launches the agent with `claude -p --agent architecture-advisor "<brief>"` from the
  repository root. `CLAUDE.md` was not changed for this; from the next session on the Agent tool works.
- `CLAUDE.md` is a condensed form. It omits the conditional gates of plan §2.2 step 5, the `src/_wip/` rule
  and the compaction stop condition; its first paragraph says the plan and `RUN.md` win.

## Advisor decisions (date, item, question, answer verbatim)

### 2026-10-12 · P0.3 · L1 `architecture-advisor` (first consultation, also the agent's test brief)

Brief:

~~~~text
ITEM: P0.3 architecture-advisor subagent + CLAUDE.md "2.0 execution protocol"            GATE STATUS: tsc 0 errors / eslint 0 / vitest 40 files, 1491 tests passed (baseline, before editing)
OBSERVED: The plan row for P0.3 (docs/plans/2026-10-11-nuiget-2.0-execution-plan.md, §5 P0 table) asks for `.claude/agents/architecture-advisor.md` with frontmatter `tools: Read, Grep, Glob, Bash` and `model: fable`. Plan §2.3 (L1 row) describes the same agent as having "read-only tools". Bash is not a read-only tool. The files as written (uncommitted in the working tree: .claude/agents/architecture-advisor.md, .github/agents/architecture-advisor.agent.md, and a new `## 2.0 execution protocol` section at the end of CLAUDE.md) keep Bash in the tool list as the item row says, and restrict it by instruction to inspection commands (git log/diff/show/status, ls, grep, wc).
FILES: docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:83-98 (§2.3) and the P0.3 row (line 181); .claude/agents/architecture-advisor.md; .github/agents/architecture-advisor.agent.md; CLAUDE.md:9-35; .claude/settings.json (permission allow/deny lists)
CONTRACT/ADR IN PLAY: Plan §2.3 L1: "frontmatter `model: fable` (documented alias for Fable 5.1), read-only tools." versus plan P0.3 row: "`tools: Read, Grep, Glob, Bash`".
OPTIONS I SEE: 1) Keep `tools: Read, Grep, Glob, Bash` as the item row says, with the inspection-only instruction. 2) Drop Bash so the tool list is strictly read-only, deviating from the item row; the agent then cannot run git log/diff for phase reviews. 3) Keep Bash and additionally stop-and-ask the owner.
QUESTION: Which tool list should the committed agent definition carry, and is anything in the three new/changed files inconsistent with plan §2 that must be fixed before P0.3 is committed?
~~~~

Answer (verbatim):

~~~~text
DECISION: Option 1. Commit `.claude/agents/architecture-advisor.md` with `tools: Read, Grep, Glob, Bash` and `model: fable`, Bash restricted to inspection by the agent body. Nothing in the three files must change before commit; one deviation line and the routine landing duties are still owed.

WHY: The P0.3 row (plan line 181) is the item's specification and names the four tools explicitly; §2.3 L1 (line 91) is a one-phrase summary of the same agent, and the same L1 row assigns it "end-of-phase diff reviews", which RUN.md §6 step 2 defines as reviewing `git log --oneline <tag>..HEAD` and its diffs. The agent body (`.github/agents/architecture-advisor.agent.md:73-74`) says "Review the diff of those commits, not the summary"; a Read/Grep/Glob-only subagent cannot do that, so Option 2 breaks a named duty rather than tightening it. "Read-only" is realised as behaviour: the body's ground rules (lines 18-20) limit shell use to `git log/diff/show/status`, `ls`, `grep`, `wc`, and `.claude/settings.json:25-28,53-55` pre-approves exactly those commands so the subagent never hits a prompt; the Copilot mirror is literally read-only (`tools: ['search', 'read']`, line 4). Option 3 is wrong because `OWNER MUST DECIDE` is reserved for scope, release, publishing and decisions the plan marks as the owner's (agent body lines 27-29); a wording tension inside one owner-approved document is resolvable from the document itself. I verified the three files against §2: the CLAUDE.md section's L3 bullet matches §2.3 L3 word for word, the brief template matches §2.4, the `OWNER MUST DECIDE` handling matches RUN.md §4, and omissions (conditional gates in §2.2 step 5, `src/_wip/` rule, compaction stop) are covered by the section's own "the plan and `RUN.md` win" clause. This consultation is itself evidence that the pointer file and `model: fable` resolved: the body of `.claude/agents/architecture-advisor.md` arrived as my instructions from the uncommitted tree and I am running as Fable 5.1.

DO:
1. Leave `.claude/agents/architecture-advisor.md`, `.github/agents/architecture-advisor.agent.md` and the CLAUDE.md section as they are.
2. Rewrite `.github/STATUS.md` from the §2.5 template for P0.3 (P0.2's note at its line 7 says P0.3 rewrites it). Under `## Deviations from contract/ADR` add one line: plan §2.3 L1 says "read-only tools", the P0.3 row says `tools: Read, Grep, Glob, Bash`; the row was followed, read-only is enforced by the agent body (`.github/agents/architecture-advisor.agent.md:18-20`) and on the Copilot side by `tools: ['search', 'read']`; `.claude/settings.json` still allows `git add`/`git commit`/`git push origin labs/*` to any Bash-equipped subagent and the P0.5 hooks deny only `--no-verify`, `--force` and commits while the sentinel exists, so the guarantee is instruction-level until the owner chooses otherwise. Paste this answer verbatim under `## Advisor decisions` with date and item ID.
3. Under `## Deviations` also note, non-blocking: the Copilot mirror has no execute tool, so the shell paragraph is inert there and phase reviews run only through the Claude subagent, which is what §2.3 L1 relies on.
4. `docs/plans/STATUS.md`: set the P0.3 row to `done` with today's date; per RUN.md §5 step 1 fill the empty Commit column of the P0.2 row with `7c16686`.
5. `CHANGELOG.md` `[Unreleased]` `### Changed`: one bold headline, no description, following the P0.2 precedent.
6. Re-run `npx tsc --noEmit`, `npx eslint src`, `npm test`, `npm run bench`; record `npm run package:vsix` and `npm run test:ui` as literal `SKIPPED:` lines with the §2.2 step 5 reason (no host, service or esbuild change). Record the item gate as satisfied by this consultation, not as skipped.
7. Commit with the `git-commit` skill citing P0.3 (and D6 for the frozen-contract bullet, §2.3 for the advisor layers), push to `labs/2.0`, wait for green CI.

DO NOT:
Drop Bash from the Claude frontmatter; the phase-review duty needs `git diff`.
Add Edit or Write "like the other agents"; the other pointers are implementers, this one is not.
Edit the plan to reconcile §2.3 with the P0.3 row; the plan is not an item file, record the mismatch in `.github/STATUS.md` instead.
Edit `.claude/settings.json` to remove `git commit` from the allow list; it is a P0.4 output and not an item file.
Widen the Copilot mirror's `tools` to include an execute tool.
Mark the item gate "Agent listed in a new session" as `SKIPPED`; it has already run.

CONTRACT CHANGE: none.

VERIFY: `grep -c '^## 2.0 execution protocol' CLAUDE.md` → 1; `grep -c '^tools: Read, Grep, Glob, Bash$' .claude/agents/architecture-advisor.md` → 1; `grep -c '^model: fable$' .claude/agents/architecture-advisor.md` → 1; `grep -c "^tools: \['search', 'read'\]" .github/agents/architecture-advisor.agent.md` → 1; `grep -c 'P0.3' .github/STATUS.md` ≥ 2 (header and deviation line); `git status --short` after the commit → empty; the P0 gate clause "advisor agent answers a test brief" is discharged by this reply appearing under `## Advisor decisions` in `.github/STATUS.md`.
~~~~

Acted on: steps 1 to 7 of `DO` as written.

### 2026-10-12 · P0.3 · ambient session advisor (plan §2.3 L3)

Its replies are not available as quotable text, so the decisions taken are recorded: verify the agent with a
fresh `claude` process instead of treating "not found" as a defect, in one attempt; if that works, use it as
the L1 mechanism for the rest of the session and do not edit `CLAUDE.md` for a session-local limitation; if
it does not, land P0.3 and stop before the ⚑ item P0.9.

## Exact next step (one item ID)

P0.9

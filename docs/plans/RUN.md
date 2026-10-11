# RUN — autonomous execution protocol for the nUIget 2.0 plan

This file is the complete instruction set for a Claude Code session that implements
`2026-10-11-nuiget-2.0-execution-plan.md` ("the plan") without a human in the loop. It is written for
Claude Opus 5.5 running with Claude Fable 5.1 as `/advisor`. The owner starts a session, pastes one line,
and the session works through open items until it reaches a stop condition. A new session re-reads this
file and `STATUS.md` and continues where the last one stopped.

The one-line prompt the owner uses:

```text
Read docs/plans/RUN.md and follow it exactly until a stop condition is reached.
```

## 1. Preconditions (check all; stop and report if any fails)

1. `git status --short` is empty and `git rev-parse --abbrev-ref HEAD` is `main`, or the session runs in a
   worktree branch cut from `main` (the Claude desktop app does this). Either way `git fetch origin main`
   must show `origin/main` equal to `HEAD` or an ancestor of it. If `origin/main` is ahead, stop: another
   writer exists and the owner must decide.
2. `node --version` → v24.x; `npm --version` → 11.x; `dotnet --list-sdks` lists a 10.0.x SDK.
3. `node_modules` exists; otherwise run `npm ci`.
4. `docs/plans/STATUS.md` exists. Read it fully. Read the plan's §1 (decisions), §2 (execution model), §3
   (salvage gate) and §4 (environment) **every session**; they are short and binding.
5. Assume the advisor is configured by the owner. If the transcript never shows an `Advising` line during
   a session, continue anyway: the plan's L1 mechanism (the `architecture-advisor` subagent) does not depend
   on it.

## 2. Pick the next item

The next item is the **first row in `STATUS.md` whose status is `open`**, reading top to bottom (the file is
already in execution order, including the P0 ordering rule). Skip rows whose Notes say "owner decides" unless
the owner changed the status to `open` explicitly. Before starting it:

- Set the row to `in-progress` with today's date, commit that change together with the item's work (not
  separately).
- Read the item's full row in the plan (`§5`), the ADR(s) it names, and for salvage items the quarry
  directory's `STATUS.md` (then verify it against the quarry tree; it is stale).

Never start an item whose predecessor in the same phase is `in-progress` or `blocked`. Never run two items
at once.

## 3. Execute the item

Follow the plan's §2.2 ritual literally: baseline gates before editing, only the item's files (§2.1), gates
after editing in the stated order, docs duties, the directory's `STATUS.md` rewritten from the §2.5 template,
then commit. The item's own **Gate** column is the acceptance test; the item is not done until every gate
command produces the stated result.

Rules that override anything you would otherwise do:

- A missing neighbour module is **never stubbed**. If the item cannot compile without a module that a later
  item creates, mark the item `blocked` with the reason and stop (the plan's ordering is wrong; the owner and
  advisor decide).
- Frozen files (`src/protocol/**`, `src/core/contracts.ts`, `docs/adr/**`) are edited only by items that name
  them, using the sentinel procedure in plan D6. Any other need to touch them is a stop-and-ask.
- Every ⚑ item and every stop-and-ask trigger (plan §2.3) means: launch the `architecture-advisor` subagent
  with the §2.4 brief, paste its answer into the directory's `STATUS.md`, then act on it. If the answer says
  the owner must decide, mark the item `blocked` and stop.
- Tests are never deleted, skipped or weakened except where the item names them by line or title.
- If a gate is still red after two fix attempts, mark the item `blocked` with the pasted output and stop.

## 4. Land the item

1. `git fetch origin main`. If `origin/main` is not an ancestor of `HEAD`, stop (precondition 1).
2. Commit with the `git-commit` skill: Conventional Commits, body cites the item ID, finding IDs and ADRs
   (example: `feat(core/ops): OperationQueue v2 (P2.1, ADR-003, Y2, Y3)`), trailer
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The commit includes the `STATUS.md` tracker row
   set to `done` with the SHA left blank, the directory `STATUS.md`, CHANGELOG and ARCHITECTURE changes.
3. `git push origin HEAD:main` (fast-forward only; never `--force`). Then put the pushed SHA into the tracker
   row's Commit column in the **next** item's commit (so the SHA is correct without an extra commit).
4. Wait for CI on that push: `gh run list --branch main --limit 1 --json databaseId,headSha,status` until a run
   for the pushed SHA appears, then `gh run watch <id> --exit-status`. Green → continue. Red → read the failed
   job log (`gh run view <id> --log-failed`), fix forward in a new commit that cites the same item, push, wait
   again; after two red runs mark the item `blocked` and stop. Never proceed to the next item on a red `main`.

## 5. Phase boundaries

When the last item of a phase is `done`:

1. Run the phase gate line from the plan (the bold **P# gate** paragraph) and paste the results into
   `STATUS.md` under a `## Phase gates` section at the bottom of the file.
2. Launch the `architecture-advisor` subagent with the brief `PHASE REVIEW <P#>`, the list of commits since
   the phase started (`git log --oneline <first-sha>^..HEAD`) and the gate output; ask for defects that must be
   fixed before the next phase. Paste the answer into the same section. Fix anything it marks as blocking as
   an extra item `P#.fix-n` appended to the tracker, before continuing.
3. At the end of P3, additionally run item P3.6 (estimate re-base) and stop so the owner can read it.

## 6. Stop conditions (end the turn with a report)

Stop, write the report in §7, and end the turn when any of these holds:

- An item became `blocked` (reason in its row).
- The next open item is owner-only: P0.14 while marked "owner decides", P7.4 (manual accessibility pass),
  P8.3 (publishing; prepare everything up to the VSIX artifact, then stop).
- P3.6 or P7.6 (acceptance cut) just completed.
- A permission prompt was denied, a toolchain check failed, or `origin/main` moved under you.
- The session's context was compacted twice (re-read this file and `STATUS.md` after each compaction; after
  the second, finish the current item, land it, and stop so a fresh session continues).

Otherwise continue to the next item. Do not pause to ask whether to continue.

## 7. Report format (last message of the session)

```text
Items closed this session: <IDs with SHAs>
Items in progress/blocked: <ID: one-line reason>
Gates run: <command → result, one per line; SKIPPED entries with reasons>
CI: <run ids and conclusions>
Advisor consultations: <item: question → decision>
Next open item: <ID>   Owner action needed: <none | what>
```

## 8. Owner-side setup (once)

- In the implementing session: `/model claude-opus-5-5`, then `/advisor claude-fable-5-1` (the advisor choice
  persists in `~/.claude/settings.json`).
- Permission mode: the repo's `.claude/settings.json` pre-approves the build, test, git and CI commands this
  protocol uses. Publishing and force-push stay denied. If the app still prompts, approve once per command
  pattern or switch the session to the app's auto-accept mode.
- To stop a run at any time: let the current item land, then close the session. State is on disk.
- To resume: start a new session from `main` and paste the one-line prompt.
